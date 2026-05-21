'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAppState } from './providers';
import { polymarketService, MarketOdds } from '@/lib/polymarket';
import { dbService } from '@/lib/supabase';
import matchesData from '@/config/matches.json';
import { Trophy, Wallet, Briefcase, Award, TrendingUp, LogOut, CheckCircle2, RefreshCw, Smartphone, ChevronRight } from 'lucide-react';
import confetti from 'canvas-confetti';

interface Match {
  id: string;
  stage: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  polymarket: {
    marketId: string;
    conditionId: string;
    homeTokenId: string;
    awayTokenId: string;
  };
  status: 'scheduled' | 'live' | 'finished';
  result: 'home' | 'away' | 'draw' | null;
}

export default function Home() {
  const {
    mode,
    setMode,
    virtualBalance,
    bets,
    profile,
    isLoading,
    login,
    logout,
    authenticated,
    placeVirtualBet,
    cashOutVirtualBet,
    refreshData,
  } = useAppState();

  const [activeTab, setActiveTab] = useState<'matches' | 'portfolio' | 'leaderboard'>('matches');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedPrediction, setSelectedPrediction] = useState<'home' | 'away' | 'draw' | null>(null);
  const [selectedOdds, setSelectedOdds] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState<string>('100');
  
  // Real-time odds state mapping matchId -> odds data
  const [oddsMap, setOddsMap] = useState<Record<string, MarketOdds>>({});
  const [isRefreshingOdds, setIsRefreshingOdds] = useState(false);
  const [filterStage, setFilterStage] = useState<string>('All');
  
  // Admin panel state for local testing (resolving matches)
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Leaderboard data state
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  // Bet placing notifications
  const [betSuccessMsg, setBetSuccessMsg] = useState<string | null>(null);
  const [betErrorMsg, setBetErrorMsg] = useState<string | null>(null);
  const [isSubmittingBet, setIsSubmittingBet] = useState(false);

  // Load odds & leaderboard
  const loadOdds = async () => {
    setIsRefreshingOdds(true);
    const updatedOdds: Record<string, MarketOdds> = {};
    for (const match of matchesData as Match[]) {
      const odds = await polymarketService.getOdds(match.id, match.polymarket.marketId);
      updatedOdds[match.id] = odds;
    }
    setOddsMap(updatedOdds);
    setIsRefreshingOdds(false);
  };

  const loadLeaderboard = async () => {
    const board = await dbService.getLeaderboard();
    setLeaderboard(board);
  };

  // Run initial loading
  useEffect(() => {
    loadOdds();
    loadLeaderboard();
    
    // Refresh odds automatically every 10 seconds for live feel
    const interval = setInterval(loadOdds, 10000);
    return () => clearInterval(interval);
  }, []);

  // Update leaderboard when tab changes
  useEffect(() => {
    if (activeTab === 'leaderboard') {
      loadLeaderboard();
    }
  }, [activeTab]);

  const stages = ['All', 'Group A', 'Group B', 'Group C', 'Group D', 'Group E', 'Group F'];

  const filteredMatches = (matchesData as Match[]).filter(match => {
    if (filterStage === 'All') return true;
    return match.stage.includes(filterStage);
  });

  const handleOddsClick = (match: Match, prediction: 'home' | 'away' | 'draw') => {
    const odds = oddsMap[match.id];
    if (!odds) return;

    let selectedValue = 1.50;
    if (prediction === 'home') selectedValue = odds.homeOdds;
    if (prediction === 'away') selectedValue = odds.awayOdds;
    if (prediction === 'draw') selectedValue = odds.drawOdds;

    setSelectedMatch(match);
    setSelectedPrediction(prediction);
    setSelectedOdds(selectedValue);
    setBetAmount('100'); // reset default bet
    setBetSuccessMsg(null);
    setBetErrorMsg(null);
  };

  const handlePlaceBet = async () => {
    if (!authenticated) {
      login();
      return;
    }

    if (!selectedMatch || !selectedPrediction || !selectedOdds) return;
    const amount = parseFloat(betAmount);
    
    if (isNaN(amount) || amount <= 0) {
      setBetErrorMsg('Enter a valid prediction amount');
      return;
    }

    setIsSubmittingBet(true);
    setBetErrorMsg(null);

    if (mode === 'demo') {
      if (virtualBalance < amount) {
        setBetErrorMsg('Insufficient points balance');
        setIsSubmittingBet(false);
        return;
      }

      const success = await placeVirtualBet(selectedMatch.id, selectedPrediction, selectedOdds, amount);
      if (success) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.8 },
          colors: ['#00e676', '#ffffff']
        });
        setBetSuccessMsg('Prediction placed successfully! 🏆');
        setTimeout(() => {
          setSelectedMatch(null);
          setSelectedPrediction(null);
        }, 1500);
      } else {
        setBetErrorMsg('Failed to place prediction');
      }
    } else {
      // Real USDC bet
      // For real betting, we trigger the CLOB SDK
      const response = await polymarketService.placeRealBet(null, {
        marketId: selectedMatch.polymarket.marketId,
        tokenId: selectedPrediction === 'home' ? selectedMatch.polymarket.homeTokenId : selectedMatch.polymarket.awayTokenId,
        outcome: selectedPrediction,
        amountUSD: amount,
        odds: selectedOdds
      });

      if (response.success) {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.8 },
          colors: ['#2979ff', '#ffffff']
        });
        setBetSuccessMsg('USDC order sent to Polymarket CLOB! 🚀');
        setTimeout(() => {
          setSelectedMatch(null);
          setSelectedPrediction(null);
        }, 1500);
      } else {
        setBetErrorMsg(response.error || 'Failed to sign transaction');
      }
    }
    setIsSubmittingBet(false);
  };

  const handleCashOut = async (betId: string, originalAmount: number, betOdds: number, matchId: string) => {
    // Basic dynamic cash out simulation:
    // If team odds have changed, value changes.
    // E.g. original odds 2.00, current odds 1.50 -> bet is worth more!
    // Value = amount * (original_odds / current_odds) * 0.95
    const matchOdds = oddsMap[matchId];
    if (!matchOdds) return;
    
    // Generate a simulated current price based on match odds
    const currentPrice = 1.80; // fallback
    const value = originalAmount * (betOdds / currentPrice) * 0.90;
    
    const success = await cashOutVirtualBet(betId, value);
    if (success) {
      confetti({
        particleCount: 50,
        spread: 40,
        colors: ['#ffc107', '#ffffff']
      });
      alert(`Cash out successful! Received ${value.toFixed(2)} CupPoints.`);
    }
  };

  // Helper for admin settlement trigger (local development tool)
  const triggerSettleMatch = async (matchId: string, result: 'home' | 'away' | 'draw') => {
    dbService.settleMatch(matchId, result);
    // Find match and update locally
    const match = (matchesData as Match[]).find(m => m.id === matchId);
    if (match) {
      match.status = 'finished';
      match.result = result;
    }
    alert(`Match ${matchId} settled with result: ${result}`);
    await refreshData();
    loadLeaderboard();
  };

  return (
    <div className="flex-1 flex flex-col max-w-md mx-auto w-full bg-background border-x border-border min-h-screen relative pb-20">
      
      {/* Header */}
      <header className="sticky top-0 z-40 glass p-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚽</span>
          <div>
            <h1 className="font-extrabold text-lg leading-tight tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
              CupPredict
            </h1>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">World Cup 2026</span>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-slate-950 p-0.5 rounded-full border border-border">
          <button
            onClick={() => setMode('demo')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all duration-300 ${
              mode === 'demo'
                ? 'bg-accent-demo text-black shadow-md'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            Demo 🟢
          </button>
          <button
            onClick={() => setMode('real')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all duration-300 ${
              mode === 'real'
                ? 'bg-accent-real text-white shadow-md'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            Real 🔵
          </button>
        </div>
      </header>

      {/* User Info Bar */}
      <div className="mx-4 mt-4 p-3 rounded-2xl glass flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-slate-900 border border-border">
            {mode === 'demo' ? (
              <Trophy className="w-5 h-5 text-accent-demo" />
            ) : (
              <Wallet className="w-5 h-5 text-accent-real" />
            )}
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">
              {mode === 'demo' ? 'My Demo Balance' : 'USDC Wallet (Polygon)'}
            </div>
            <div className="text-lg font-black tracking-tight">
              {mode === 'demo' ? (
                <span className="text-accent-demo">{virtualBalance.toFixed(2)} pts</span>
              ) : authenticated ? (
                <span className="text-accent-real">0.00 USDC</span>
              ) : (
                <span className="text-muted-foreground text-sm">Not Connected</span>
              )}
            </div>
          </div>
        </div>

        {authenticated ? (
          <div className="flex items-center gap-2">
            <span className="text-xs bg-slate-900 px-2.5 py-1 rounded-full border border-border text-muted-foreground font-mono">
              {profile?.wallet_address.slice(0, 6)}...{profile?.wallet_address.slice(-4)}
            </span>
            <button onClick={logout} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={login}
            className={`px-4 py-1.5 text-xs font-bold rounded-xl animate-pulse transition-all duration-300 ${
              mode === 'demo'
                ? 'bg-accent-demo text-black hover:bg-accent-demo-hover'
                : 'bg-accent-real text-white hover:bg-accent-real-hover'
            }`}
          >
            Sign In
          </button>
        )}
      </div>

      {/* Tab Content Area */}
      <main className="flex-1 p-4 overflow-y-auto">
        {activeTab === 'matches' && (
          <div>
            {/* Stages Scrollbar */}
            <div className="flex gap-2 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-none">
              {stages.map(stage => (
                <button
                  key={stage}
                  onClick={() => setFilterStage(stage)}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-full border whitespace-nowrap transition-all duration-200 ${
                    filterStage === stage
                      ? mode === 'demo'
                        ? 'bg-accent-demo text-black border-accent-demo'
                        : 'bg-accent-real text-white border-accent-real'
                      : 'bg-card border-border text-muted-foreground hover:text-white'
                  }`}
                >
                  {stage}
                </button>
              ))}
            </div>

            {/* Matches List Header */}
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">World Cup 2026 Matches</span>
              <button 
                onClick={loadOdds} 
                disabled={isRefreshingOdds}
                className="text-xs text-muted-foreground hover:text-white flex items-center gap-1 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingOdds ? 'animate-spin' : ''}`} />
                Refresh Odds
              </button>
            </div>

            {/* Match Cards */}
            <div className="space-y-4">
              {filteredMatches.map(match => {
                const odds = oddsMap[match.id] || {
                  homeOdds: 2.00,
                  awayOdds: 3.33,
                  drawOdds: 4.00,
                  homePrice: 0.50,
                  awayPrice: 0.30,
                  drawPrice: 0.20
                };

                return (
                  <div key={match.id} className="p-4 rounded-2xl bg-card border border-border hover:border-slate-800 transition-all duration-300">
                    {/* Top Row: Stage & Status */}
                    <div className="flex justify-between items-center mb-2.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        {match.stage}
                      </span>
                      {match.status === 'live' ? (
                        <span className="text-[9px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full border border-destructive/20 font-bold uppercase tracking-widest animate-pulse">
                          Live
                        </span>
                      ) : match.status === 'finished' ? (
                        <span className="text-[9px] bg-slate-900 text-muted-foreground px-2 py-0.5 rounded-full border border-border">
                          Finished
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {new Date(match.date).toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>

                    {/* Team Names & Flags */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl leading-none">{match.homeFlag}</span>
                        <span className="font-bold text-sm">{match.homeTeam}</span>
                      </div>
                      
                      {match.status === 'finished' && (
                        <span className="text-xs text-muted-foreground font-mono font-bold bg-slate-950 px-2 py-0.5 rounded">
                          {match.result === 'home' ? 'W' : match.result === 'away' ? 'L' : 'D'}
                        </span>
                      )}
                      
                      <div className="flex items-center gap-2.5 flex-row-reverse">
                        <span className="text-2xl leading-none">{match.awayFlag}</span>
                        <span className="font-bold text-sm">{match.awayTeam}</span>
                      </div>
                    </div>

                    {/* Betting Buttons Row */}
                    {match.status !== 'finished' ? (
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handleOddsClick(match, 'home')}
                          className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950 hover:bg-slate-900 border border-border active:scale-[0.98] transition-all"
                        >
                          <span className="text-[10px] text-muted-foreground uppercase font-bold">1</span>
                          <span className={`text-sm font-black mt-0.5 ${mode === 'demo' ? 'text-accent-demo' : 'text-accent-real'}`}>
                            {odds.homeOdds}
                          </span>
                        </button>
                        <button
                          onClick={() => handleOddsClick(match, 'draw')}
                          className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950 hover:bg-slate-900 border border-border active:scale-[0.98] transition-all"
                        >
                          <span className="text-[10px] text-muted-foreground uppercase font-bold">X</span>
                          <span className="text-sm font-black mt-0.5 text-white">
                            {odds.drawOdds}
                          </span>
                        </button>
                        <button
                          onClick={() => handleOddsClick(match, 'away')}
                          className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950 hover:bg-slate-900 border border-border active:scale-[0.98] transition-all"
                        >
                          <span className="text-[10px] text-muted-foreground uppercase font-bold">2</span>
                          <span className={`text-sm font-black mt-0.5 ${mode === 'demo' ? 'text-accent-demo' : 'text-accent-real'}`}>
                            {odds.awayOdds}
                          </span>
                        </button>
                      </div>
                    ) : (
                      <div className="w-full text-center py-2.5 rounded-xl bg-slate-950 border border-border text-xs text-muted-foreground font-semibold">
                        Predictions closed. Result: {match.result === 'home' ? match.homeTeam : match.result === 'away' ? match.awayTeam : 'Draw'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Local dev testing trigger */}
            <div className="mt-8 text-center">
              <button 
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className="text-[10px] text-muted-foreground hover:underline uppercase tracking-widest font-semibold"
              >
                {showAdminPanel ? 'Hide Admin Panel' : 'Admin Simulation WC-2026'}
              </button>
              
              {showAdminPanel && (
                <div className="mt-4 p-4 rounded-2xl border border-dashed border-border bg-card text-left text-xs space-y-3">
                  <h4 className="font-bold uppercase tracking-wider text-muted-foreground">Match Results Emulation:</h4>
                  <p className="text-muted-foreground">Select a match winner to test automatic payout settlement in demo mode:</p>
                  <div className="space-y-2">
                    {(matchesData as Match[]).filter(m => m.status !== 'finished').map(m => (
                      <div key={m.id} className="flex justify-between items-center py-1.5 border-b border-border/50">
                        <span className="font-semibold">{m.homeTeam} - {m.awayTeam}</span>
                        <div className="flex gap-1.5">
                          <button onClick={() => triggerSettleMatch(m.id, 'home')} className="bg-slate-900 border border-border hover:bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">
                            1 (Home)
                          </button>
                          <button onClick={() => triggerSettleMatch(m.id, 'draw')} className="bg-slate-900 border border-border hover:bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">
                            X (Draw)
                          </button>
                          <button onClick={() => triggerSettleMatch(m.id, 'away')} className="bg-slate-900 border border-border hover:bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">
                            2 (Away)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Portfolio Tab */}
        {activeTab === 'portfolio' && (
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">My Predictions</h2>
            
            {!authenticated ? (
              <div className="text-center py-12 px-4 bg-card border border-border rounded-2xl">
                <Briefcase className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <h3 className="font-bold text-sm mb-1">Sign in to view your portfolio</h3>
                <p className="text-xs text-muted-foreground mb-4">You will be able to see all active predictions, real-time P&L, and perform Cash Out.</p>
                <button onClick={login} className="px-6 py-2 bg-accent-demo text-black font-bold rounded-xl text-xs">
                  Sign In
                </button>
              </div>
            ) : bets.length === 0 ? (
              <div className="text-center py-12 px-4 bg-card border border-border rounded-2xl text-muted-foreground">
                <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <h3 className="font-bold text-sm mb-1">No predictions placed yet</h3>
                <p className="text-xs">Select a match on the Matches tab and make your first prediction!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bets.map(bet => {
                  const match = (matchesData as Match[]).find(m => m.id === bet.match_id);
                  if (!match) return null;

                  return (
                    <div key={bet.id} className="p-4 bg-card border border-border rounded-2xl relative overflow-hidden">
                      {/* Status indicator bar */}
                      <div className={`absolute top-0 left-0 w-1.5 h-full ${
                        bet.status === 'pending'
                          ? 'bg-amber-500'
                          : bet.status === 'won'
                          ? 'bg-success'
                          : 'bg-destructive'
                      }`} />

                      <div className="flex justify-between items-start mb-2 pl-2">
                        <div>
                          <h4 className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                            {match.homeTeam} vs {match.awayTeam}
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            Prediction: {bet.prediction === 'home' ? `Win ${match.homeTeam}` : bet.prediction === 'away' ? `Win ${match.awayTeam}` : 'Draw'} @ {bet.odds}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          bet.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            : bet.status === 'won'
                            ? 'bg-success/10 text-success border border-success/20'
                            : 'bg-destructive/10 text-destructive border border-destructive/20'
                        }`}>
                          {bet.status === 'pending' ? 'Pending' : bet.status === 'won' ? 'Won' : 'Lost'}
                        </span>
                      </div>

                      <div className="flex justify-between items-end pl-2 mt-4 pt-3 border-t border-border/50">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Prediction Amount</span>
                          <span className="text-sm font-bold text-white">{bet.amount} pts</span>
                        </div>
                        
                        <div className="text-right">
                          {bet.status === 'pending' ? (
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Potential Payout</span>
                              <span className="text-sm font-black text-amber-500">{(bet.amount * bet.odds).toFixed(2)} pts</span>
                            </div>
                          ) : (
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Result</span>
                              <span className={`text-sm font-black ${bet.status === 'won' ? 'text-success' : 'text-destructive'}`}>
                                {bet.status === 'won' ? `+${bet.payout} pts` : '-100%'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Cash Out Button for active bets */}
                      {bet.status === 'pending' && match.status !== 'finished' && (
                        <div className="mt-4 pt-3 border-t border-border/50 pl-2 flex justify-between items-center">
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Cash Out Value</span>
                            <span className="text-xs font-bold text-amber-500">{(bet.amount * 0.85).toFixed(2)} pts</span>
                          </div>
                          <button
                            onClick={() => handleCashOut(bet.id, bet.amount, bet.odds, bet.match_id)}
                            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-[10px] rounded-lg tracking-wider uppercase transition-colors"
                          >
                            Cash Out
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Leaderboard Tab */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-accent-demo" />
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Leaderboard (Demo)</h2>
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="grid grid-cols-12 p-3.5 border-b border-border bg-slate-950 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <span className="col-span-2 text-center">Rank</span>
                <span className="col-span-6">Player</span>
                <span className="col-span-4 text-right">Points</span>
              </div>

              <div className="divide-y divide-border">
                {leaderboard.map((item, index) => {
                  const isCurrentUser = profile?.wallet_address && item.wallet_address.toLowerCase() === profile.wallet_address.toLowerCase();
                  
                  return (
                    <div 
                      key={item.wallet_address} 
                      className={`grid grid-cols-12 p-4 items-center ${isCurrentUser ? 'bg-accent-demo/5 border-l-2 border-accent-demo' : ''}`}
                    >
                      {/* Rank */}
                      <span className="col-span-2 text-center font-black text-sm">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                      </span>

                      {/* Name */}
                      <div className="col-span-6 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-900 border border-border flex items-center justify-center text-xs">
                          {item.username.slice(0, 2).toUpperCase()}
                        </div>
                        <span className={`text-xs font-bold truncate ${isCurrentUser ? 'text-accent-demo' : 'text-white'}`}>
                          {item.username}
                        </span>
                      </div>

                      {/* Balance */}
                      <span className={`col-span-4 text-right text-xs font-black ${isCurrentUser ? 'text-accent-demo' : 'text-slate-200'}`}>
                        {item.virtual_balance.toFixed(2)} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Quick Bet Drawer (Bottom Sheet) */}
      {selectedMatch && selectedPrediction && selectedOdds && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4 bg-transparent pointer-events-none">
          <div className="w-full max-w-md bg-card border border-border rounded-t-3xl p-5 bottom-sheet pointer-events-auto animate-in slide-in-from-bottom duration-300">
            {/* Header / Dismiss */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-extrabold text-sm text-muted-foreground uppercase tracking-wider">Your Prediction</h3>
                <p className="text-xs text-white font-bold mt-1">
                  {selectedPrediction === 'home' ? `Win ${selectedMatch.homeTeam}` : selectedPrediction === 'away' ? `Win ${selectedMatch.awayTeam}` : 'Draw'} @ {selectedOdds}
                </p>
              </div>
              <button 
                onClick={() => { setSelectedMatch(null); setSelectedPrediction(null); }}
                className="text-xs bg-slate-900 border border-border px-3 py-1 rounded-full text-muted-foreground hover:text-white"
              >
                Cancel
              </button>
            </div>

            {/* Input & quick selections */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground font-semibold">Prediction Amount:</span>
                  <span className="text-muted-foreground font-bold">
                    Balance: {mode === 'demo' ? `${virtualBalance.toFixed(2)} pts` : '0.00 USDC'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-border rounded-xl p-3 text-sm font-black focus:outline-none focus:border-slate-700 text-white"
                    />
                    <span className="absolute right-3 top-3.5 text-xs text-muted-foreground font-bold uppercase">
                      {mode === 'demo' ? 'pts' : 'usdc'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Amount Buttons */}
              <div className="grid grid-cols-4 gap-1.5">
                {['50', '100', '500', 'Max'].map(amt => (
                  <button
                    key={amt}
                    onClick={() => {
                      if (amt === 'Max') {
                        setBetAmount(mode === 'demo' ? virtualBalance.toString() : '0');
                      } else {
                        setBetAmount(amt);
                      }
                    }}
                    className="p-2 bg-slate-950 hover:bg-slate-900 border border-border rounded-xl text-xs font-bold transition-all text-muted-foreground hover:text-white"
                  >
                    {amt === 'Max' ? 'MAX' : `+${amt}`}
                  </button>
                ))}
              </div>

              {/* Potential return */}
              <div className="p-3 bg-slate-950 rounded-xl border border-border/50 flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Potential Payout:</span>
                <span className={`font-black text-sm ${mode === 'demo' ? 'text-accent-demo' : 'text-accent-real'}`}>
                  {isNaN(parseFloat(betAmount)) ? '0.00' : (parseFloat(betAmount) * selectedOdds).toFixed(2)} {mode === 'demo' ? 'pts' : 'USDC'}
                </span>
              </div>

              {/* Notifications */}
              {betErrorMsg && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive font-semibold">
                  ❌ {betErrorMsg}
                </div>
              )}
              {betSuccessMsg && (
                <div className="p-3 bg-success/10 border border-success/20 rounded-xl text-xs text-success font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success animate-bounce" />
                  {betSuccessMsg}
                </div>
              )}

              {/* Main Bet Submission Button */}
              <button
                onClick={handlePlaceBet}
                disabled={isSubmittingBet || !!betSuccessMsg}
                className={`w-full p-4 rounded-xl font-black text-sm tracking-wider uppercase active:scale-[0.98] transition-all flex items-center justify-center ${
                  mode === 'demo'
                    ? 'bg-accent-demo text-black hover:bg-accent-demo-hover'
                    : 'bg-accent-real text-white hover:bg-accent-real-hover'
                } disabled:opacity-50`}
              >
                {isSubmittingBet ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : !authenticated ? (
                  'Sign In to Predict'
                ) : (
                  'Place Prediction'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/85 backdrop-blur-md border-t border-border py-2 flex justify-center">
        <div className="w-full max-w-md flex justify-around px-4">
          <button
            onClick={() => setActiveTab('matches')}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === 'matches'
                ? mode === 'demo'
                  ? 'text-accent-demo scale-105'
                  : 'text-accent-real scale-105'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            <Trophy className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Matches</span>
          </button>

          <button
            onClick={() => setActiveTab('portfolio')}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === 'portfolio'
                ? mode === 'demo'
                  ? 'text-accent-demo scale-105'
                  : 'text-accent-real scale-105'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Portfolio</span>
          </button>

          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === 'leaderboard'
                ? mode === 'demo'
                  ? 'text-accent-demo scale-105'
                  : 'text-accent-real scale-105'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            <Award className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Leaderboard</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
