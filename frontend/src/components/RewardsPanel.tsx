import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../contracts/contractConfig';
import { ethers } from 'ethers';
import { getExplorerUrl } from '../utils/network';
import { formatWinningsToMON } from '../utils/format';
import { supabase } from '../utils/supabase';
import { fetchRewards, Reward } from '../utils/rewards';
import { withRateLimit } from '../utils/withRateLimit';

// Utility function to format time ago
function formatTimeAgo(timestamp: number | null): string {
  if (timestamp === null) return 'Never played';
  
  // Convert timestamp from seconds to milliseconds
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

interface RewardsPanelProps {
  totalWins?: number;
  totalWinnings?: bigint;
  pendingRewards: Reward[];
  isLoading: boolean;
  loadingProgress: number;
  isPending: boolean;
  claimingAll: boolean;
  claimingRewardIndex: number | null;
  txError?: string;
  hash?: string;
  lastTxHash?: string;
  txSuccess: boolean;
  onClaimAll: () => void;
  onClaimReward: (index: number) => void;
}

// Helper for sequential async operations
const queue = (() => {
  let pending = Promise.resolve();
  
  const run = async (fn: () => Promise<any>, delay = 300) => {
    try {
      // Wait for previous tasks plus an additional delay
      pending = pending.then(() => new Promise(resolve => setTimeout(resolve, delay)));
      // Wait for this task to complete
      return await fn();
    } catch (error) {
      console.error("Error in queued function:", error);
      throw error;
    }
  };
  
  return { run };
})();

// Helper function to get player stats from Supabase
async function getPlayerStats(address: string) {
  try {
    const { data, error } = await supabase
      .from('player_stats')
      .select('*')
      .eq('address', address)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error fetching player stats:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in getPlayerStats:', error);
    return null;
  }
}

export default function RewardsPanel({
  totalWins,
  totalWinnings: propTotalWinnings,
  pendingRewards: propPendingRewards,
  isLoading: propIsLoading,
  loadingProgress: propLoadingProgress,
  isPending: propIsPending,
  claimingAll: propClaimingAll,
  claimingRewardIndex: propClaimingRewardIndex,
  txError: propTxError,
  hash: propHash,
  lastTxHash: propLastTxHash,
  txSuccess: propTxSuccess,
  onClaimAll,
  onClaimReward
}: RewardsPanelProps) {
  const { address, isConnected, chainId } = useAccount();
  const [pendingRewards, setPendingRewards] = useState<Reward[]>([]);
  const [isLoadingState, setIsLoading] = useState(false);
  const [txErrorState, setTxError] = useState<string | null>(null);
  const [claimingRewardIndexState, setClaimingRewardIndex] = useState<number | null>(null);
  const [claimingAllState, setClaimingAll] = useState(false);
  const [lastTxHashState, setLastTxHash] = useState<`0x${string}` | null>(null);
  const [loadingProgressState, setLoadingProgress] = useState(0);
  const lastFetchTimeRef = useRef(0);
  const [dbWinnings, setDbWinnings] = useState<bigint>(BigInt(0));
  const [isLoadingDbWinnings, setIsLoadingDbWinnings] = useState(false);
  const [totalWinnings, setTotalWinnings] = useState<bigint>(BigInt(0));

  // Fetch winnings from Supabase
  useEffect(() => {
    const fetchWinningsFromDb = async () => {
      if (!address) return;
      
      setIsLoadingDbWinnings(true);
      try {
        const playerStats = await getPlayerStats(address);
        if (playerStats && playerStats.total_winnings) {
          const winnings = BigInt(playerStats.total_winnings);
          console.log(`RewardsPanel: Fetched winnings from DB: ${winnings.toString()}`);
          setDbWinnings(winnings);
        }
      } catch (error) {
        console.error('Error fetching winnings from DB:', error);
      } finally {
        setIsLoadingDbWinnings(false);
      }
    };
    
    fetchWinningsFromDb();
  }, [address]);

  // Log the totalWinnings prop
  useEffect(() => {
    console.log(`RewardsPanel: Received totalWinnings prop: ${propTotalWinnings?.toString() || 'undefined'}`);
  }, [propTotalWinnings]);

  // Get number of pending rewards - fetch less frequently
  const { data: rewardCount, refetch: refetchRewardCount } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getPendingRewardCount',
    args: [address],
    query: {
      enabled: !!address,
      gcTime: 300000,    // Garbage collection time: 5 minutes
      staleTime: 120000,  // Consider data stale after 2 minutes
      refetchInterval: 120000 // Refetch every 2 minutes
    }
  });

  // Get player total wins - fetch less frequently
  const { data: totalWinsData, refetch: refetchTotalWins } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'playerTotalWins',
    args: [address],
    query: {
      enabled: !!address,
      gcTime: 300000,    // Garbage collection time: 5 minutes
      staleTime: 120000,  // Consider data stale after 2 minutes
      refetchInterval: 120000 // Refetch every 2 minutes
    }
  });

  // Get player total winnings - fetch less frequently
  const { data: totalWinningsData, refetch: refetchTotalWinnings } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getPlayerWinnings',
    args: [address],
    query: {
      enabled: !!address,
      gcTime: 300000,    // Garbage collection time: 5 minutes
      staleTime: 120000,  // Consider data stale after 2 minutes
      refetchInterval: 120000 // Refetch every 2 minutes
    }
  });

  // Transaction for claiming rewards
  const { data: hashState, writeContract, isPending: isPendingState } = useWriteContract();
  
  // Wait for transaction to be mined
  const { isSuccess: txSuccessState } = useWaitForTransactionReceipt({
    hash: hashState,
  });

  // Update the transaction URL function
  const getTransactionUrl = useCallback((hash: string) => {
    if (!chainId) return '#';
    return getExplorerUrl(chainId, hash, 'tx');
  }, [chainId]);

  // Sync pendingRewards with props
  useEffect(() => {
    if (!propPendingRewards || propPendingRewards.length === 0) {
      return;
    }
    
    setPendingRewards(propPendingRewards);
  }, [propPendingRewards]);

  // Calculate total available rewards from unclaimed rewards only
  const totalAvailable = useMemo(() => 
    pendingRewards
      .filter(reward => reward.status === 'pending')
      .reduce((total, reward) => total + reward.amount, BigInt(0)),
    [pendingRewards]
  );
  
  // Calculate total winnings from all rewards (claimed and unclaimed)
  const calculatedTotalWinnings = useMemo(() => {
    // If totalWinnings prop is provided, use it directly
    if (propTotalWinnings) {
      console.log(`RewardsPanel: Using totalWinnings prop in calculation: ${propTotalWinnings.toString()}`);
      return propTotalWinnings;
    }
    
    // If we have DB winnings, use that
    if (dbWinnings > BigInt(0)) {
      console.log(`RewardsPanel: Using DB winnings: ${dbWinnings.toString()}`);
      return dbWinnings;
    }
    
    // Otherwise calculate from pending rewards
    const calculated = pendingRewards
      .reduce((total, reward) => total + reward.amount, BigInt(0));
    console.log(`RewardsPanel: Calculated from pending rewards: ${calculated.toString()}`);
    return calculated;
  }, [pendingRewards, propTotalWinnings, dbWinnings]);
  
  // Filter unclaimed rewards
  const unclaimedRewards = useMemo(() => 
    pendingRewards.filter(reward => reward.status === 'pending'),
    [pendingRewards]
  );

  // Fetch pending rewards with rate limit protection
  useEffect(() => {
    if (address && isConnected) {
      const fetchAndUpdateRewards = async () => {
        try {
          // Only fetch if last fetch was more than 60 seconds ago (reduce redundant calls)
          const now = Date.now();
          if (now - lastFetchTimeRef.current < 60000 && pendingRewards.length > 0) {
            console.log('Skipping rewards fetch - throttled');
            return;
          }
          
          lastFetchTimeRef.current = now;
          
          // Use the fetchRewards function with rate limiting protection
          const rewards = await withRateLimit(
            () => fetchRewards(
              address,
              100,
              setIsLoading,
              setLoadingProgress,
              setTotalWinnings
            ),
            { maxRetries: 4, baseDelay: 1500, maxDelay: 8000 }
          );
          
          console.log(`RewardsPanel: Fetched ${rewards.length} rewards`);
          setPendingRewards(rewards);
        } catch (error) {
          console.error('Error fetching rewards:', error);
        }
      };

      fetchAndUpdateRewards();
    }
  }, [address, isConnected]);
  
  // Refresh data periodically but less frequently
  useEffect(() => {
    // Immediately refresh data
    const refreshData = () => {
      if (isConnected && address) {
        refetchRewardCount();
        refetchTotalWins();
        refetchTotalWinnings();
      }
    };
    
    // Trigger initial refresh
    refreshData();
    
    // Set up an interval to refresh regularly (every 2 minutes)
    const interval = setInterval(refreshData, 120000);
    
    // Clean up the interval when component unmounts
    return () => clearInterval(interval);
  }, [isConnected, address, refetchRewardCount, refetchTotalWins, refetchTotalWinnings]);
  
  // Refresh rewards after successful transaction
  useEffect(() => {
    if (txSuccessState) {
      // Update UI immediately for better UX
      if (claimingAllState) {
        setPendingRewards(prev => prev.map(reward => ({ ...reward, status: 'claimed' })));
      } else if (claimingRewardIndexState !== null) {
        setPendingRewards(prev => 
          prev.map((reward, idx) => 
            idx === claimingRewardIndexState 
              ? { ...reward, status: 'claimed' }
              : reward
          )
        );
      }
      
      // Refresh all data
      refetchRewardCount();
      refetchTotalWins();
      refetchTotalWinnings();
      
      // Update Supabase with the claimed rewards
      if (address) {
        updateSupabaseRewards();
      }
      
      // Reset states
      setClaimingRewardIndex(null);
      setClaimingAll(false);
      setTxError(null);
      
      // Keep last transaction hash for display
      if (hashState) {
        setLastTxHash(hashState);
      }
    }
  }, [txSuccessState, hashState, claimingAllState, claimingRewardIndexState]);

  // Function to update Supabase with claimed rewards
  const updateSupabaseRewards = async () => {
    if (!address) return;
    
    try {
      // Get current player stats
      const { data: playerStats, error: fetchError } = await supabase
        .from('player_stats')
        .select('*')
        .eq('address', address)
        .single();
      
      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error fetching player stats from Supabase:', fetchError);
        return;
      }
      
      // Calculate new stats
      const claimedRewards = pendingRewards.filter(reward => reward.status === 'claimed');
      const totalClaimed = claimedRewards.reduce((sum, reward) => sum + reward.amount, BigInt(0));
      
      // Update or insert player stats
      if (playerStats) {
        // Update existing record - only update columns that exist in the schema
        const { error: updateError } = await supabase
          .from('player_stats')
          .update({
            total_winnings: (BigInt(playerStats.total_winnings || '0') + totalClaimed).toString(),
            last_play_time: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('address', address);
        
        if (updateError) {
          console.error('Error updating player stats in Supabase:', updateError);
        }
      } else {
        // Insert new record - only include columns that exist in the schema
        const { error: insertError } = await supabase
          .from('player_stats')
          .insert({
            address,
            wins: totalWins || 0,
            losses: 0,
            draws: 0,
            total_games: totalWins || 0,
            total_winnings: totalClaimed.toString(),
            last_play_time: new Date().toISOString()
          });
        
        if (insertError) {
          console.error('Error inserting player stats in Supabase:', insertError);
        }
      }
    } catch (error) {
      console.error('Error updating Supabase rewards:', error);
    }
  };

  // Handle claim single reward
  const handleClaimReward = useCallback(async (index: number) => {
    if (!isConnected || !writeContract) return;
    
    setTxError(null);
    setClaimingRewardIndex(index);
    
    try {
      const result = await writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'claimReward',
        args: [index]
      });
      
      if (typeof result === 'string') {
        setLastTxHash(result as `0x${string}`);
      }
    } catch (error: any) {
      setTxError(error.message || 'Error claiming reward');
      setClaimingRewardIndex(null);
    }
  }, [isConnected, writeContract]);
  
  // Handle claim all rewards
  const handleClaimAll = useCallback(async () => {
    if (!isConnected || !writeContract) return;
    
    setTxError(null);
    setClaimingAll(true);
    
    try {
      const result = await writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'claimAllRewards',
        args: []
      });
      
      if (typeof result === 'string') {
        setLastTxHash(result as `0x${string}`);
      }
    } catch (error: any) {
      setTxError(error.message || 'Error claiming all rewards');
      setClaimingAll(false);
    }
  }, [isConnected, writeContract]);

  // Use props or local state based on what's available
  const isLoading = propIsLoading || isLoadingState;
  const loadingProgress = propLoadingProgress || loadingProgressState;
  const isPending = propIsPending || isPendingState;
  const claimingAll = propClaimingAll || claimingAllState;
  const claimingRewardIndex = propClaimingRewardIndex || claimingRewardIndexState;
  const txError = propTxError || txErrorState;
  const hash = propHash || hashState;
  const lastTxHash = propLastTxHash || lastTxHashState;
  const txSuccess = propTxSuccess || txSuccessState;
  
  // Ensure we're using the most accurate winnings value
  const displayWinnings = useMemo(() => {
    // Prioritize the prop value if available
    if (propTotalWinnings) {
      console.log(`RewardsPanel: Using totalWinnings prop for display: ${propTotalWinnings.toString()}`);
      return propTotalWinnings;
    }
    
    // Then try DB winnings
    if (dbWinnings > BigInt(0)) {
      console.log(`RewardsPanel: Using DB winnings for display: ${dbWinnings.toString()}`);
      return dbWinnings;
    }
    
    // Fall back to calculated value
    console.log(`RewardsPanel: Using calculatedTotalWinnings for display: ${calculatedTotalWinnings.toString()}`);
    return calculatedTotalWinnings;
  }, [propTotalWinnings, dbWinnings, calculatedTotalWinnings]);

  // Update transaction display section - moved after lastTxHash is declared
  const TransactionStatus = useCallback(() => {
    if (!hashState && !lastTxHash) return null;
    
    const currentHash = (hashState || lastTxHash) as string;
    const explorerName = chainId ? getExplorerUrl(chainId, '', 'tx').split('/')[2] : 'Explorer';
    
    return (
      <div className="bg-blue-900/30 border border-blue-700 text-blue-400 p-4 rounded-lg mt-4">
        <div className="flex items-center justify-center mb-2">
          {isPendingState ? (
            <>
              <span className="animate-spin mr-2 h-5 w-5 border-t-2 border-b-2 border-blue-500 rounded-full"></span>
              <p>Transaction pending</p>
            </>
          ) : txSuccessState ? (
            <p className="text-green-400">Transaction confirmed ✓</p>
          ) : (
            <p>Transaction sent</p>
          )}
        </div>
        <div className="text-center">
          <a 
            href={getTransactionUrl(currentHash)} 
            target="_blank"
            rel="noopener noreferrer" 
            className="inline-flex items-center px-4 py-2 bg-blue-900/50 hover:bg-blue-900/80 rounded-md transition-colors"
          >
            <span>View on {explorerName}</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    );
  }, [hashState, lastTxHash, chainId, isPendingState, txSuccessState, getTransactionUrl]);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card/50 p-4 rounded-lg text-center">
          <h3 className="text-lg font-medium mb-2">Total Games Won</h3>
          <p className="text-3xl font-bold text-accent">
            {totalWins !== undefined && totalWins !== null 
              ? totalWins.toString() 
              : '—'}
          </p>
          <p className="text-sm text-gray-400 mt-1">Number of victories</p>
        </div>
        
        <div className="bg-card/50 p-4 rounded-lg text-center">
          <h3 className="text-lg font-medium mb-2">Total Winnings</h3>
          <p className="text-3xl font-bold text-accent">
            {formatWinningsToMON(displayWinnings, chainId)}
          </p>
          <p className="text-sm text-gray-400 mt-1">Total earned from games</p>
          <p className="text-xs text-gray-400 mt-1">
            Raw value: {displayWinnings.toString()}
          </p>
        </div>
      </div>

      {unclaimedRewards.length > 0 ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Pending Rewards</h3>
            <button
              onClick={handleClaimAll}
              disabled={claimingAll || !isConnected || isPending}
              className={`btn btn-sm ${
                claimingAll || isPending ? 'bg-gray-600 cursor-not-allowed' : 'btn-accent'
              }`}
            >
              {claimingAll || isPending ? (
                <span className="flex items-center">
                  <span className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-white rounded-full"></span>
                  Claiming...
                </span>
              ) : (
                'Claim All'
              )}
            </button>
          </div>

          <div className="space-y-2">
            {(isPending || claimingAll) ? (
              <div className="bg-card/50 p-6 rounded-lg text-center">
                <div className="animate-pulse flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-accent/30 mb-4 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-lg font-medium text-accent mb-2">
                    Processing Rewards
                  </p>
                  <p className="text-sm text-gray-400">
                    Please wait while your {claimingAll ? "rewards are" : "reward is"} being processed...
                  </p>
                </div>
              </div>
            ) : (
              unclaimedRewards.map((reward, index) => (
                <div
                  key={reward.id}
                  className="bg-card/50 p-4 rounded-lg flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">
                      {formatWinningsToMON(reward.amount, chainId)}
                    </p>
                    <p className="text-sm text-gray-400">
                      Won {formatTimeAgo(reward.timestamp)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleClaimReward(index)}
                    disabled={claimingRewardIndex === index || !isConnected}
                    className={`btn btn-sm ${
                      claimingRewardIndex === index
                        ? 'bg-gray-600 cursor-not-allowed'
                        : 'btn-accent'
                    }`}
                  >
                    {claimingRewardIndex === index ? (
                      <span className="flex items-center">
                        <span className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-white rounded-full"></span>
                        Claiming...
                      </span>
                    ) : (
                      'Claim'
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-gray-800 mb-4 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-300 mb-2">
              No Rewards Available
            </p>
            <p className="text-sm text-gray-400 max-w-md">
              {isLoading ? 
                "Loading your rewards..." : 
                "You don't have any unclaimed rewards yet. Play more games to earn rewards!"}
            </p>
            {isLoading && (
              <div className="w-full max-w-md mt-4 bg-gray-700 rounded-full h-2.5">
                <div className="bg-accent h-2.5 rounded-full" style={{ width: `${loadingProgress}%` }}></div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {txError && !txError.includes('not a function') && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 p-4 rounded-lg">
          <p>Transaction failed: {txError}</p>
        </div>
      )}
      
      <TransactionStatus />
    </motion.div>
  );
}