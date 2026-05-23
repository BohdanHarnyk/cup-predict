import { createClient } from '@supabase/supabase-js';

// Types
export interface UserProfile {
  wallet_address: string;
  username: string;
  avatar_url?: string;
  virtual_balance: number;
  created_at: string;
}

export interface VirtualBet {
  id: string;
  profile_id: string;
  match_id: string;
  prediction: 'home' | 'away' | 'draw';
  odds: number;
  amount: number;
  status: 'pending' | 'won' | 'lost';
  payout: number;
  created_at: string;
}

const isMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create actual Supabase client only if not in mock mode and credentials are provided
export const supabase = !isMock && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Mock database in localStorage
class MockDatabase {
  private getStorageItem<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  }

  private setStorageItem<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  }

  getProfiles(): UserProfile[] {
    // Default seed profiles for leaderboard variety
    const defaultProfiles: UserProfile[] = [
      { wallet_address: '7xKXJn2wF54jJ52iKxW6zB8b1aF5v6C7d8e9f0g1', username: '💰 CryptoKing', virtual_balance: 5350.00, created_at: new Date().toISOString() },
      { wallet_address: 'Gv7tE1U8Gv7tE1U8Gv7tE1U8Gv7tE1U8Gv7tE1U8', username: '⚽ MessiFan10', virtual_balance: 3200.50, created_at: new Date().toISOString() },
      { wallet_address: '3Wnvsxej53Wnvsxej53Wnvsxej53Wnvsxej53Wnv', username: '📊 StatsGuru', virtual_balance: 1450.00, created_at: new Date().toISOString() },
      { wallet_address: '9z20kr0ih9z20kr0ih9z20kr0ih9z20kr0ih9z20', username: '🍀 LuckyBettor', virtual_balance: 920.00, created_at: new Date().toISOString() },
    ];
    return this.getStorageItem<UserProfile[]>('cuppredict_profiles', defaultProfiles);
  }

  getProfile(walletAddress: string): UserProfile | null {
    const profiles = this.getProfiles();
    let profile = profiles.find(p => p.wallet_address.toLowerCase() === walletAddress.toLowerCase());
    
    // Auto-create profile if user is logged in but profile doesn't exist
    if (!profile && walletAddress) {
      profile = {
        wallet_address: walletAddress,
        username: `User_${walletAddress.slice(0, 4)}`,
        virtual_balance: 1000.00, // starting balance
        created_at: new Date().toISOString()
      };
      profiles.push(profile);
      this.setStorageItem('cuppredict_profiles', profiles);
    }
    
    return profile || null;
  }

  updateProfileBalance(walletAddress: string, amount: number): UserProfile | null {
    const profiles = this.getProfiles();
    const index = profiles.findIndex(p => p.wallet_address.toLowerCase() === walletAddress.toLowerCase());
    if (index !== -1) {
      profiles[index].virtual_balance = Number((profiles[index].virtual_balance + amount).toFixed(2));
      this.setStorageItem('cuppredict_profiles', profiles);
      return profiles[index];
    }
    return null;
  }

  getBets(walletAddress: string): VirtualBet[] {
    const allBets = this.getStorageItem<VirtualBet[]>('cuppredict_bets', []);
    return allBets.filter(b => b.profile_id.toLowerCase() === walletAddress.toLowerCase());
  }

  placeBet(walletAddress: string, bet: Omit<VirtualBet, 'id' | 'status' | 'payout' | 'created_at'>): VirtualBet | null {
    const profile = this.getProfile(walletAddress);
    if (!profile || profile.virtual_balance < bet.amount) {
      return null;
    }

    // Deduct balance
    this.updateProfileBalance(walletAddress, -bet.amount);

    const newBet: VirtualBet = {
      ...bet,
      id: Math.random().toString(36).substring(2, 9),
      status: 'pending',
      payout: 0,
      created_at: new Date().toISOString()
    };

    const allBets = this.getStorageItem<VirtualBet[]>('cuppredict_bets', []);
    allBets.push(newBet);
    this.setStorageItem('cuppredict_bets', allBets);

    return newBet;
  }

  settleMatchBets(matchId: string, result: 'home' | 'away' | 'draw'): void {
    const allBets = this.getStorageItem<VirtualBet[]>('cuppredict_bets', []);
    let updated = false;

    allBets.forEach(bet => {
      if (bet.match_id === matchId && bet.status === 'pending') {
        updated = true;
        const won = bet.prediction === result;
        bet.status = won ? 'won' : 'lost';
        if (won) {
          bet.payout = Number((bet.amount * bet.odds).toFixed(2));
          this.updateProfileBalance(bet.profile_id, bet.payout);
        }
      }
    });

    if (updated) {
      this.setStorageItem('cuppredict_bets', allBets);
    }
  }

  cashOutBet(betId: string, cashOutAmount: number): boolean {
    const allBets = this.getStorageItem<VirtualBet[]>('cuppredict_bets', []);
    const bet = allBets.find(b => b.id === betId);
    
    if (bet && bet.status === 'pending') {
      bet.status = 'won'; // mark as settled
      bet.payout = Number(cashOutAmount.toFixed(2));
      this.setStorageItem('cuppredict_bets', allBets);
      this.updateProfileBalance(bet.profile_id, cashOutAmount);
      return true;
    }
    return false;
  }
}

export const mockDb = new MockDatabase();

// Public unified service wrappers
export const dbService = {
  async getProfile(walletAddress: string): Promise<UserProfile | null> {
    if (isMock || !supabase) {
      return mockDb.getProfile(walletAddress);
    }
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();
      
    if (error && error.code === 'PGRST116') {
      // Auto-create on Supabase if not found
      const newProfile = {
        wallet_address: walletAddress,
        username: `User_${walletAddress.slice(0, 4)}`,
        virtual_balance: 1000.00
      };
      const { data: created, error: createError } = await supabase
        .from('profiles')
        .insert(newProfile)
        .select()
        .single();
      if (createError) return null;
      return created;
    }
    return data;
  },

  async placeVirtualBet(walletAddress: string, matchId: string, prediction: 'home' | 'away' | 'draw', odds: number, amount: number): Promise<boolean> {
    if (isMock || !supabase) {
      const result = mockDb.placeBet(walletAddress, { profile_id: walletAddress, match_id: matchId, prediction, odds, amount });
      return result !== null;
    }

    // Wrap in a transaction or perform sequential check & write
    const { data: profile } = await supabase
      .from('profiles')
      .select('virtual_balance')
      .eq('wallet_address', walletAddress)
      .single();

    if (!profile || profile.virtual_balance < amount) return false;

    // Deduct points
    const newBalance = Number((profile.virtual_balance - amount).toFixed(2));
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ virtual_balance: newBalance })
      .eq('wallet_address', walletAddress);

    if (updateError) return false;

    // Save bet
    const { error: betError } = await supabase
      .from('virtual_bets')
      .insert({
        profile_id: walletAddress,
        match_id: matchId,
        prediction,
        odds,
        amount,
        status: 'pending'
      });

    if (betError) {
      // Refund balance
      await supabase
        .from('profiles')
        .update({ virtual_balance: profile.virtual_balance })
        .eq('wallet_address', walletAddress);
      return false;
    }

    return true;
  },

  async getBets(walletAddress: string): Promise<VirtualBet[]> {
    if (isMock || !supabase) {
      return mockDb.getBets(walletAddress);
    }

    const { data, error } = await supabase
      .from('virtual_bets')
      .select('*')
      .eq('profile_id', walletAddress)
      .order('created_at', { ascending: false });

    return error ? [] : data || [];
  },

  async getLeaderboard(): Promise<UserProfile[]> {
    if (isMock || !supabase) {
      return mockDb.getProfiles().sort((a, b) => b.virtual_balance - a.virtual_balance);
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('virtual_balance', { ascending: false })
      .limit(100);

    return error ? [] : data || [];
  },

  async cashOutVirtualBet(betId: string, walletAddress: string, cashOutAmount: number): Promise<boolean> {
    if (isMock || !supabase) {
      return mockDb.cashOutBet(betId, cashOutAmount);
    }

    // Call RPC or perform updates
    const { data: bet } = await supabase
      .from('virtual_bets')
      .select('*')
      .eq('id', betId)
      .eq('profile_id', walletAddress)
      .single();

    if (!bet || bet.status !== 'pending') return false;

    const { error: betUpdateError } = await supabase
      .from('virtual_bets')
      .update({ status: 'won', payout: cashOutAmount })
      .eq('id', betId);

    if (betUpdateError) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('virtual_balance')
      .eq('wallet_address', walletAddress)
      .single();

    if (profile) {
      const newBal = Number((profile.virtual_balance + cashOutAmount).toFixed(2));
      await supabase
        .from('profiles')
        .update({ virtual_balance: newBal })
        .eq('wallet_address', walletAddress);
    }

    return true;
  },

  // Developer helper for resolving matches locally
  settleMatch(matchId: string, result: 'home' | 'away' | 'draw'): void {
    if (isMock || !supabase) {
      mockDb.settleMatchBets(matchId, result);
    } else {
      // In production, this would trigger an RPC or admin execution
      console.warn('Real settlement should be handled via Supabase edge function or SQL triggers.');
    }
  }
};
