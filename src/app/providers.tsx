'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { dbService, Profile, VirtualBet } from '@/lib/supabase';

// App State Context interface
interface AppContextType {
  mode: 'demo' | 'real';
  setMode: (mode: 'demo' | 'real') => void;
  virtualBalance: number;
  bets: VirtualBet[];
  profile: Profile | null;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  authenticated: boolean;
  refreshData: () => Promise<void>;
  placeVirtualBet: (matchId: string, prediction: 'home' | 'away' | 'draw', odds: number, amount: number) => Promise<boolean>;
  cashOutVirtualBet: (betId: string, amount: number) => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// App Context Provider Component
function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { user, authenticated, login, logout, ready } = usePrivy();
  const [mode, setMode] = useState<'demo' | 'real'>('demo');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bets, setBets] = useState<VirtualBet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const walletAddress = user?.wallet?.address;

  // Refresh user data (profile & bets) from Database
  const refreshData = useCallback(async () => {
    if (!walletAddress) {
      setProfile(null);
      setBets([]);
      setIsLoading(false);
      return;
    }

    try {
      const prof = await dbService.getProfile(walletAddress);
      if (prof) {
        setProfile(prof);
      }
      
      const b = await dbService.getBets(walletAddress);
      setBets(b);
    } catch (e) {
      console.error('Error fetching user data:', e);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  // Place a virtual bet
  const placeVirtualBet = async (
    matchId: string,
    prediction: 'home' | 'away' | 'draw',
    odds: number,
    amount: number
  ): Promise<boolean> => {
    if (!walletAddress) {
      login();
      return false;
    }

    setIsLoading(true);
    const success = await dbService.placeVirtualBet(walletAddress, matchId, prediction, odds, amount);
    await refreshData();
    return success;
  };

  // Cash out an active virtual bet
  const cashOutVirtualBet = async (betId: string, amount: number): Promise<boolean> => {
    if (!walletAddress) return false;
    
    setIsLoading(true);
    const success = await dbService.cashOutVirtualBet(betId, walletAddress, amount);
    await refreshData();
    return success;
  };

  // Initial load
  useEffect(() => {
    if (ready) {
      refreshData();
    }
  }, [ready, walletAddress, refreshData]);

  const virtualBalance = profile?.virtual_balance ?? 0;

  return (
    <AppContext.Provider
      value={{
        mode,
        setMode,
        virtualBalance,
        bets,
        profile,
        isLoading: !ready || isLoading,
        login,
        logout,
        authenticated,
        refreshData,
        placeVirtualBet,
        cashOutVirtualBet,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// Wrapper combining Privy and AppState
export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'clh1234567890123456789012';

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#00e676',
          logo: '⚽',
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      <AppStateProvider>{children}</AppStateProvider>
    </PrivyProvider>
  );
}

// Custom hook to consume AppState
export function useAppState() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within a Providers wrapper');
  }
  return context;
}
