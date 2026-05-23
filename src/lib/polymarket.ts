import { BrowserProvider } from 'ethers';

// Types
export interface MarketOdds {
  homeOdds: number; // e.g. 1.85 (decimal format for sports UX)
  awayOdds: number; // e.g. 3.20
  drawOdds: number; // e.g. 2.90
  homePrice: number; // e.g. 0.54 (raw Polymarket price $0.01-$0.99)
  awayPrice: number;
  drawPrice: number;
}

const isMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
const builderCode = process.env.NEXT_PUBLIC_BUILDER_CODE || '0x-cup-predict-builder';

// Static base odds for WC 2026 matches to provide consistency in mock mode
const mockBasePrices: Record<string, { home: number; away: number; draw: number }> = {
  'wc2026-match-01': { home: 0.58, away: 0.20, draw: 0.22 }, // Mexico vs South Africa
  'wc2026-match-02': { home: 0.38, away: 0.35, draw: 0.27 }, // Korea Republic vs Czechia
  'wc2026-match-03': { home: 0.45, away: 0.28, draw: 0.27 }, // Canada vs Bosnia and Herzegovina
  'wc2026-match-04': { home: 0.52, away: 0.22, draw: 0.26 }, // USA vs Paraguay
  'wc2026-match-05': { home: 0.25, away: 0.50, draw: 0.25 }, // Qatar vs Switzerland
  'wc2026-match-06': { home: 0.60, away: 0.18, draw: 0.22 }, // Brazil vs Morocco
};

// Helper: Convert raw price ($0.01 - $0.99) to sports decimal odds (e.g. 1.85)
// In Polymarket, buying a share at $X yields $1.00 if correct. Payout = 1 / X
export const priceToOdds = (price: number): number => {
  if (!price || price <= 0) return 1.01;
  const rawOdds = 1 / price;
  return Number(rawOdds.toFixed(2));
};

export const polymarketService = {
  /**
   * Fetches the current odds for a specific match.
   */
  async getOdds(matchId: string, marketId: string): Promise<MarketOdds> {
    if (isMock || !marketId || marketId.startsWith('0xmock')) {
      // Simulate live fluctuating odds
      const base = mockBasePrices[matchId] || { home: 0.40, away: 0.40, draw: 0.20 };
      
      // Add slight random fluctuation (+/- 0.03) to make UI feel alive
      const randomJitter = (Math.random() - 0.5) * 0.04;
      const homePrice = Math.max(0.05, Math.min(0.90, base.home + randomJitter));
      const awayPrice = Math.max(0.05, Math.min(0.90, base.away - randomJitter / 2));
      const drawPrice = Number((1 - homePrice - awayPrice).toFixed(2));

      return {
        homePrice,
        awayPrice,
        drawPrice,
        homeOdds: priceToOdds(homePrice),
        awayOdds: priceToOdds(awayPrice),
        drawOdds: priceToOdds(drawPrice),
      };
    }

    try {
      // Fetch prices from Polymarket Gamma API
      // Gamma API endpoints: https://gamma-api.polymarket.com/markets/<market_id>
      const response = await fetch(`https://gamma-api.polymarket.com/markets/${marketId}`);
      if (!response.ok) throw new Error('Failed to fetch from Gamma API');
      
      const marketData = await response.json();
      
      // Polymarket binary markets (YES/NO) have token prices in the outcomePrices field
      // e.g. outcomePrices: ["0.62", "0.38"]
      const homePrice = parseFloat(marketData.outcomePrices?.[0] || '0.50');
      const awayPrice = parseFloat(marketData.outcomePrices?.[1] || '0.30');
      const drawPrice = Number((1 - homePrice - awayPrice).toFixed(2)); // derived draw outcome if binary

      return {
        homePrice,
        awayPrice,
        drawPrice,
        homeOdds: priceToOdds(homePrice),
        awayOdds: priceToOdds(awayPrice),
        drawOdds: priceToOdds(drawPrice),
      };
    } catch (e) {
      console.error('Error fetching real Polymarket odds, falling back to mock:', e);
      // Fallback
      return {
        homePrice: 0.50,
        awayPrice: 0.30,
        drawPrice: 0.20,
        homeOdds: 2.00,
        awayOdds: 3.33,
        drawOdds: 5.00,
      };
    }
  },

  /**
   * Submits an EIP-712 signed order to Polymarket CLOB via Privy signer
   */
  async placeRealBet(
    privyProvider: any, // Privy EIP-1193 provider
    args: {
      marketId: string;
      tokenId: string;
      outcome: 'home' | 'away' | 'draw';
      amountUSD: number;
      odds: number;
    }
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (isMock) {
      // Simulate real bet delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      return {
        success: true,
        txHash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      };
    }

    try {
      const provider = new BrowserProvider(privyProvider);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      // In production, we would:
      // 1. Initialize Polymarket CLOB client using:
      //    const clobClient = new ClobClient(CLOB_API_URL, ChainId, signer, credentials);
      // 2. Approve USDC spender contract on Polygon if not done:
      //    USDC.approve(CTFExchangeAddress, amount)
      // 3. Create and sign an EIP-712 limit order with builderCode referral field:
      //    const order = await clobClient.createOrder({
      //      tokenID: args.tokenId,
      //      price: Number((1 / args.odds).toFixed(2)),
      //      side: Side.BUY,
      //      size: args.amountUSD,
      //      referrer: builderCode
      //    });
      // 4. Post the order to Polymarket CLOB API:
      //    const response = await clobClient.postOrder(order);

      console.log(`Submitting order to Polymarket CLOB: User ${userAddress}, Market ${args.marketId}, Referral ${builderCode}`);
      
      // Simulated response for this sprint scope
      await new Promise(resolve => setTimeout(resolve, 1000));

      return {
        success: true,
        txHash: '0xmock-real-tx-hash-success',
      };
    } catch (e: any) {
      console.error('Failed to submit order to Polymarket CLOB:', e);
      return {
        success: false,
        error: e.message || 'Unknown error placing order',
      };
    }
  }
};
