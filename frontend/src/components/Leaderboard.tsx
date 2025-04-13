/**
 * Leaderboard Component
 * 
 * This component displays the game leaderboard using Supabase as the backend database.
 * It fetches player statistics and rankings from Supabase, with fallback to blockchain data
 * when the Supabase backend is unavailable.
 */

import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useBlockNumber, useReadContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../contracts/contractConfig';
import { ethers } from 'ethers';
import { getTokenSymbol, getExplorerUrl, withRateLimit } from '../utils/network';
import { formatEther } from 'viem';
import { toast } from 'react-hot-toast';
import { formatWinningsToMON } from '../utils/format';
import { supabase, getLeaderboard, updatePlayerStats, PlayerStats } from '../utils/supabase';

// Backend API URL - configure in environment
const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001/api';
const FETCH_TIMEOUT = 5000; // 5 seconds timeout for fetch requests

interface LeaderboardEntry {
  address: string;
  wins: number;
  lastPlayTime: number | null;
  totalWinnings: string | null;
  previousRank?: number;
}

interface LoadingStates {
  winnings: boolean;
  playerData: boolean;
  leaderboard: boolean;
}

interface SortConfig {
  field: 'wins' | 'total_winnings' | 'lastPlayTime';
  direction: 'asc' | 'desc';
}

type TimeFrame = 'all' | 'day' | 'week' | 'month';

interface Filters {
  minWins: number;
  timeFrame: TimeFrame;
}

interface TimeFrames {
  [key: string]: number;
  day: number;
  week: number;
  month: number;
}

// Reusable components
const StatCard = memo(({ title, value }: { title: string; value: string | number }) => (
  <div className="bg-black/20 rounded-lg p-4 text-center backdrop-blur-sm border border-white/5">
    <h3 className="text-sm text-gray-400 mb-1">{title}</h3>
    <p className="text-xl font-bold text-white">{value}</p>
  </div>
));

const LoadingOverlay = ({ loadingStates, loadingProgress }: { loadingStates: LoadingStates; loadingProgress: number }) => (
  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
      <div className="text-lg font-medium">
        {loadingStates.winnings && "Calculating winnings..."}
        {loadingStates.playerData && "Updating player data..."}
        {loadingStates.leaderboard && "Refreshing leaderboard..."}
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2.5 mt-4">
        <div 
          className="bg-primary h-2.5 rounded-full transition-all duration-300" 
          style={{ width: `${loadingProgress}%` }}
        ></div>
      </div>
    </div>
  </div>
);

const SortingControls = ({ 
  sortConfig, 
  setSortConfig, 
  filters, 
  setFilters 
}: { 
  sortConfig: SortConfig;
  setSortConfig: (config: SortConfig) => void;
  filters: Filters;
  setFilters: (filters: Filters) => void;
}) => (
  <div className="flex flex-wrap gap-4 mb-4">
    <select 
      className="bg-card/50 rounded px-3 py-2 text-white"
      value={sortConfig.field}
      onChange={(e) => setSortConfig({ ...sortConfig, field: e.target.value as SortConfig['field'] })}
    >
      <option value="wins">Wins</option>
      <option value="total_winnings">Total Winnings</option>
      <option value="lastPlayTime">Last Game</option>
    </select>
    
    <select 
      className="bg-card/50 rounded px-3 py-2 text-white"
      value={sortConfig.direction}
      onChange={(e) => setSortConfig({ ...sortConfig, direction: e.target.value as 'asc' | 'desc' })}
    >
      <option value="desc">Descending</option>
      <option value="asc">Ascending</option>
    </select>
    
    <select 
      className="bg-card/50 rounded px-3 py-2 text-white"
      value={filters.timeFrame}
      onChange={(e) => setFilters({ ...filters, timeFrame: e.target.value as Filters['timeFrame'] })}
    >
      <option value="all">All time</option>
      <option value="day">24 hours</option>
      <option value="week">7 days</option>
      <option value="month">30 days</option>
    </select>
  </div>
);

const LeaderboardStats = ({ leaderboard, chainId }: { leaderboard: LeaderboardEntry[]; chainId?: number }) => {
  const stats = useMemo(() => ({
    totalPlayers: leaderboard.length,
    totalWins: leaderboard.reduce((sum, entry) => sum + entry.wins, 0),
    totalWinnings: formatWinningsToMON(
      leaderboard.reduce((sum, entry) => 
        BigInt(sum) + BigInt(entry.totalWinnings || 0), BigInt(0)
      ),
      chainId
    )
  }), [leaderboard, chainId]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <StatCard title="Players" value={stats.totalPlayers} />
      <StatCard title="Total Wins" value={stats.totalWins} />
      <StatCard title="Total Winnings" value={stats.totalWinnings} />
    </div>
  );
};

// Helper for sequential async operations to avoid rate limiting
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

// Mock data for when backend is not available
const generateMockLeaderboard = (userAddress?: string, userWins: number = 0, userLastPlay: number = 0) => {
  const mockEntries = 10;
  const baseWins = 5;
  const mockData = [];
  
  // Add user first if they have wins
  if (userAddress && userWins > 0) {
    mockData.push({
      address: userAddress,
      wins: userWins,
      lastPlayTime: userLastPlay,
      totalWinnings: "0"
    });
  }
  
  // Generate remaining entries
  const remaining = mockEntries - (mockData.length);
  for (let i = 0; i < remaining; i++) {
    mockData.push({
      address: `0x${(i + 1).toString(16).padStart(40, '0')}`,
      wins: baseWins + Math.floor(Math.random() * 10),
      lastPlayTime: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 86400),
      totalWinnings: "0"
    });
  }
  
  // Sort by wins descending
  return mockData.sort((a, b) => b.wins - a.wins);
};

// Define custom window interface for global timeout
declare global {
  interface Window {
    leaderboardTimeoutId?: ReturnType<typeof setTimeout>;
  }
}

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [useBackend, setUseBackend] = useState(true);
  const { address, isConnected, chainId } = useAccount();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // New states for sorting and filtering
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'wins',
    direction: 'desc'
  });
  
  const [filters, setFilters] = useState<Filters>({
    minWins: 0,
    timeFrame: 'all'
  });
  
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    winnings: false,
    playerData: false,
    leaderboard: false
  });

  // Memoize and filter leaderboard data
  const processedLeaderboard = useMemo(() => {
    let filtered = [...leaderboard];
    
    // Apply filters
    if (filters.timeFrame !== 'all') {
      const now = Math.floor(Date.now() / 1000);
      const timeFrames: TimeFrames = {
        day: 86400,
        week: 604800,
        month: 2592000
      };
      filtered = filtered.filter(entry => 
        entry.lastPlayTime !== null && now - entry.lastPlayTime < timeFrames[filters.timeFrame]
      );
    }
    
    if (filters.minWins > 0) {
      filtered = filtered.filter(entry => entry.wins >= filters.minWins);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortConfig.field) {
        case 'wins':
          comparison = b.wins - a.wins;
          break;
        case 'total_winnings':
          comparison = Number(BigInt(b.totalWinnings || '0') - BigInt(a.totalWinnings || '0'));
          break;
        case 'lastPlayTime':
          // Handle null values for lastPlayTime
          if (a.lastPlayTime === null && b.lastPlayTime === null) {
            comparison = 0;
          } else if (a.lastPlayTime === null) {
            comparison = -1; // null values come last
          } else if (b.lastPlayTime === null) {
            comparison = 1; // null values come last
          } else {
            comparison = b.lastPlayTime - a.lastPlayTime;
          }
          break;
      }
      
      return sortConfig.direction === 'desc' ? comparison : -comparison;
    });
    
    // Add previous ranks for animation
    return filtered.map((entry, index) => ({
      ...entry,
      previousRank: leaderboard.findIndex(e => e.address === entry.address)
    }));
  }, [leaderboard, sortConfig, filters]);

  // Animated row component
  const AnimatedRow = memo(({ entry, rank }: { entry: LeaderboardEntry; rank: number }) => {
    const isCurrentUser = entry.address.toLowerCase() === address?.toLowerCase();
    const hasMovedUp = entry.previousRank !== undefined && rank < entry.previousRank;
    const hasMovedDown = entry.previousRank !== undefined && rank > entry.previousRank;
    
    return (
      <motion.tr
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className={`border-b border-white/5 relative ${
          isCurrentUser ? 'bg-primary/20 backdrop-blur-sm' : ''
        } ${
          hasMovedUp ? 'bg-green-500/10' : 
          hasMovedDown ? 'bg-red-500/10' : ''
        }`}
      >
        <td className="px-4 py-2 text-white">{rank + 1}</td>
        <td className="px-4 py-2 text-white">
          {isCurrentUser && <span className="text-primary font-medium">(You) </span>}
          {entry.address.substring(0, 6)}...{entry.address.substring(38)}
        </td>
        <td className="px-4 py-2 text-right text-white">{entry.wins}</td>
        <td className="px-4 py-2 text-right text-white">
          <span className={isCurrentUser ? "font-bold text-primary" : "font-bold"}>
            {formatWinningsToMON(entry.totalWinnings || '0', chainId)}
          </span>
        </td>
        <td className="px-4 py-2 text-right text-white">
          <span className={isCurrentUser ? "font-medium text-primary" : "font-medium text-gray-300"}>
            {entry.lastPlayTime === null ? 'Never' : formatTimeAgo(entry.lastPlayTime)}
          </span>
        </td>
        
        {(hasMovedUp || hasMovedDown) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`absolute right-0 top-1/2 -translate-y-1/2 px-2 ${
              hasMovedUp ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {hasMovedUp ? '↑' : '↓'}
          </motion.div>
        )}
      </motion.tr>
    );
  });

  // Fetch player data directly from the contract for the connected user
  const { data: playerWins } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'playerTotalWins',
    args: [address],
    query: {
      enabled: !!address,
      gcTime: 30000,
      staleTime: 15000
    }
  });
  
  const { data: lastPlayTime } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'lastPlayTimestamp',
    args: [address],
    query: {
      enabled: !!address,
      gcTime: 30000,
      staleTime: 15000
    }
  });
  
  // Get player winnings directly from contract
  const { data: playerWinnings, refetch: refetchPlayerWinnings } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getPlayerWinnings',
    args: [address],
    query: {
      enabled: !!address,
      gcTime: 0,
      staleTime: 0,
      refetchInterval: 10000
    }
  });
  
  // Use only actual winnings value
  const playerWinningsValue = playerWinnings 
    ? playerWinnings.toString() 
    : '0';

  // Use a ref for tracking last blockchain update time
  const lastBlockchainUpdateRef = useRef(0);

  // Update the useEffect for initial load to reduce blockchain calls
  useEffect(() => {
    // Don't refresh if we just did within 60 seconds or if a refresh is in progress
    const now = Math.floor(Date.now() / 1000);
    if (isRefreshing || (now - lastRefreshTime < 60 && leaderboard.length > 0)) {
      return;
    }
    
    // Set refreshing flag to prevent concurrent refreshes
    setIsRefreshing(true);
    
    // Load leaderboard data from database first
    loadLeaderboardData().finally(() => {
      setIsRefreshing(false);
      setLastRefreshTime(now);
    });
    
    // Only update blockchain data every 5 minutes
    const shouldUpdateBlockchain = now - lastBlockchainUpdateRef.current > 300;
    if (shouldUpdateBlockchain && address) {
      calculatePlayerWinnings(address)
        .then(winningsValue => {
          if (winningsValue && winningsValue !== "0") {
            console.log(`Updating blockchain winnings for ${address}: ${winningsValue}`);
            updateWinningsInLeaderboard(address, winningsValue);
            
            // Update Supabase with the calculated winnings
            if (playerWins !== undefined && lastPlayTime !== undefined) {
              updatePlayerInfoInSupabase(
                address,
                Number(playerWins),
                Number(lastPlayTime),
                winningsValue
              );
            }
            lastBlockchainUpdateRef.current = now;
          }
        })
        .catch(error => {
          console.error("Error during blockchain winnings update:", error);
        });
    }
    
    // Add a safety timeout
    const safetyTimeoutId = setTimeout(() => {
      if (isLoading) {
        console.log("Safety timeout reached, attempting to load minimal data");
        if (address && playerWins !== undefined && lastPlayTime !== undefined) {
          const userEntry = {
            address: address,
            wins: Number(playerWins),
            lastPlayTime: Number(lastPlayTime),
            totalWinnings: playerWinningsValue || "0"
          };
          setLeaderboard([userEntry]);
          setError("Supabase backend unavailable. Showing only your stats from blockchain.");
        }
        setIsLoading(false);
        setIsRefreshing(false);
        setLastRefreshTime(now);
      }
    }, FETCH_TIMEOUT * 1.5);
    
    return () => clearTimeout(safetyTimeoutId);
  }, [address, blockNumber, isRefreshing, lastRefreshTime]);

  // Update the updateWinningsInLeaderboard function to prioritize database values
  const updateWinningsInLeaderboard = (address: string, winningsValue: string) => {
    if (!address || !winningsValue) return;
    
    console.log(`Updating winnings for ${address}: ${winningsValue}`);
    
    setLeaderboard(prev => {
      const updatedLeaderboard = [...prev];
      const userIndex = updatedLeaderboard.findIndex(
        entry => entry.address.toLowerCase() === address.toLowerCase()
      );
      
      if (userIndex >= 0) {
        // Only update if the new value is significantly higher (more than 1% difference)
        const currentWinnings = BigInt(updatedLeaderboard[userIndex].totalWinnings || '0');
        const newWinnings = BigInt(winningsValue);
        
        // Calculate the difference percentage
        const difference = Number(newWinnings - currentWinnings) / Number(currentWinnings || BigInt(1)) * 100;
        
        // Only update if the new value is significantly higher
        if (difference > 1) {
          updatedLeaderboard[userIndex] = {
            ...updatedLeaderboard[userIndex],
            totalWinnings: newWinnings.toString()
          };
          console.log(`Updated ${address} winnings to ${newWinnings.toString()} (${difference.toFixed(2)}% increase)`);
        } else {
          console.log(`Keeping current winnings for ${address} (${difference.toFixed(2)}% difference)`);
        }
      }
      
      return updatedLeaderboard;
    });
  };

  // Update player info in Supabase using the utility function
  const updatePlayerInfoInSupabase = async (address: string, wins: number, lastPlay: number, totalWinnings: string = "0") => {
    try {
      setLoadingStates(prev => ({ ...prev, playerData: true }));
      
      // Use the utility function to update player stats
      const result = await updatePlayerStats(address, {
        wins: wins,
        last_play_time: new Date(lastPlay * 1000).toISOString(),
        total_winnings: totalWinnings
      });
      
      if (result) {
        console.log("Player stats successfully updated in Supabase");
        // Update local state with the new player data
        updateLocalPlayerData(address, wins, lastPlay, totalWinnings);
      } else {
        throw new Error("Failed to update player stats in Supabase");
      }
    } catch (error) {
      console.error("Error updating player info:", error);
      // Update local state without fetching
      updateLocalPlayerData(address, wins, lastPlay, totalWinnings);
      
      // Set a flag to indicate Supabase is unavailable
      setUseBackend(false);
      
      // Show a more informative error message
      if (error instanceof Error && 
          (error.message.includes('Failed to fetch') || 
           error.message.includes('NetworkError') || 
           error.message.includes('Connection refused'))) {
        setError("Supabase backend unavailable. Showing only blockchain data.");
      }
    } finally {
      setLoadingStates(prev => ({ ...prev, playerData: false }));
    }
  };
  
  // Update local player data without fetching the entire leaderboard
  const updateLocalPlayerData = (address: string, wins: number, lastPlay: number, totalWinnings: string) => {
    if (leaderboard.length > 0) {
      const updatedLeaderboard = [...leaderboard];
      const playerIndex = updatedLeaderboard.findIndex(
        entry => entry.address.toLowerCase() === address.toLowerCase()
      );
      
      // Make sure we always have the latest winnings data from the contract
      const winningsToUse = address.toLowerCase() === address?.toLowerCase() && playerWinnings 
        ? playerWinnings.toString() 
        : totalWinnings;
      
      // Log the winnings value for debugging
      console.log(`Updating local player data for ${address} with winnings: ${winningsToUse}`);
      
      if (playerIndex >= 0) {
        // Use the higher value between the current winnings and the new winnings
        const currentWinnings = BigInt(updatedLeaderboard[playerIndex].totalWinnings || '0');
        const newWinnings = BigInt(winningsToUse);
        
        // Use the higher value
        const finalWinnings = currentWinnings > newWinnings ? currentWinnings : newWinnings;
        
        updatedLeaderboard[playerIndex] = {
          ...updatedLeaderboard[playerIndex],
          wins: wins,
          lastPlayTime: lastPlay,
          totalWinnings: finalWinnings.toString()
        };
        console.log(`Updated player data in leaderboard with winnings: ${finalWinnings.toString()}`);
      } else {
        updatedLeaderboard.push({
          address: address,
          wins: wins,
          lastPlayTime: lastPlay,
          totalWinnings: winningsToUse
        });
      }
      
      setLeaderboard(updatedLeaderboard);
    }
  };
  
  // Fetch leaderboard data from Supabase
  const fetchLeaderboard = async () => {
    setIsLoading(true);
    setError(null);
    setLoadingStates(prev => ({ ...prev, leaderboard: true }));
    
    try {
      // Use the utility function to fetch leaderboard data
      const data = await getLeaderboard(100);
      
      if (data && data.length > 0) {
        // Transform Supabase data to leaderboard format
        const transformedData = data.map(entry => ({
          address: entry.address,
          wins: entry.wins || 0,
          lastPlayTime: entry.last_play_time ? new Date(entry.last_play_time).getTime() / 1000 : null,
          totalWinnings: entry.total_winnings || "0"
        }));
        
        console.log("Successfully loaded leaderboard data from Supabase:", transformedData);
        setLeaderboard(transformedData);
        setIsLoading(false);
        setUseBackend(true); // Mark Supabase as available
        return;
      }
      
      // If Supabase fails or returns no data, try to get at least the connected user's data
      setUseBackend(false); // Mark Supabase as unavailable
      if (address && playerWins !== undefined && lastPlayTime !== undefined) {
        const userEntry = {
          address: address,
          wins: Number(playerWins),
          lastPlayTime: Number(lastPlayTime),
          totalWinnings: playerWinningsValue || "0"
        };
        setLeaderboard([userEntry]);
        setError("Supabase backend unavailable. Showing only your stats from blockchain.");
      } else {
        setLeaderboard([]);
        setError("Supabase backend unavailable. Connect your wallet to see your stats.");
      }
      
    } catch (error) {
      console.error("Error loading leaderboard data:", error);
      setUseBackend(false); // Mark Supabase as unavailable
      setError("Supabase backend unavailable. Connect your wallet to see your stats.");
      setLeaderboard([]);
    } finally {
      setIsLoading(false);
      setLoadingStates(prev => ({ ...prev, leaderboard: false }));
    }
  };
  
  // Load leaderboard data with progress tracking
  const loadLeaderboardData = async () => {
    setLoadingProgress(80);
    
    try {
      // Use the utility function to fetch leaderboard data
      const data = await getLeaderboard(100);
      
      if (data && data.length > 0) {
        // Transform Supabase data to leaderboard format
        const transformedData = data.map(entry => ({
          address: entry.address,
          wins: entry.wins || 0,
          lastPlayTime: entry.last_play_time ? new Date(entry.last_play_time).getTime() / 1000 : null,
          totalWinnings: entry.total_winnings || "0"
        }));
        
        console.log("Successfully loaded leaderboard data from Supabase:", transformedData);
        setLeaderboard(transformedData);
        setIsLoading(false);
        setLoadingProgress(100);
        setUseBackend(true); // Mark Supabase as available
        return;
      }
      
      // If Supabase fails or returns no data, try to get at least the connected user's data
      setUseBackend(false); // Mark Supabase as unavailable
      if (address && playerWins !== undefined && lastPlayTime !== undefined) {
        const userEntry = {
          address: address,
          wins: Number(playerWins),
          lastPlayTime: Number(lastPlayTime),
          totalWinnings: playerWinningsValue || "0"
        };
        setLeaderboard([userEntry]);
        setError("Supabase backend unavailable. Showing only your stats from blockchain.");
      } else {
        setLeaderboard([]);
        setError("Supabase backend unavailable. Connect your wallet to see your stats.");
      }
      
    } catch (error) {
      console.error("Error loading leaderboard data:", error);
      setUseBackend(false); // Mark Supabase as unavailable
      setError("Supabase backend unavailable. Connect your wallet to see your stats.");
      setLeaderboard([]);
    } finally {
      setIsLoading(false);
      setLoadingProgress(100);
    }
  };

  // Manually calculate winnings from rewards, since getPlayerWinnings doesn't exist
  const calculatePlayerWinnings = async (playerAddress: string) => {
    if (!playerAddress || !window.ethereum) return "0";
    
    try {
      setLoadingStates(prev => ({ ...prev, winnings: true }));
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      
      // Get reward count
      const count = await withRateLimit<ethers.BigNumber>(
        () => contract.getPendingRewardCount(playerAddress),
        { maxRetries: 3, baseDelay: 1000 }
      );
      console.log(`Calculating winnings for ${playerAddress}: ${count.toString()} rewards`);
      
      if (Number(count) === 0) return "0";
      
      // Calculate total from all rewards
      let totalWinnings = BigInt(0);
      
      // Process in batches to respect rate limits (5 req/sec max)
      const batchSize = 3; // Fetch 3 rewards at a time (below the 5/sec limit)
      const batches = Math.ceil(Number(count) / batchSize);
      
      for (let batch = 0; batch < batches; batch++) {
        // Add a 1-second delay between batches
        if (batch > 0) {
          console.log(`Rate limit delay for batch ${batch}/${batches}...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const startIdx = batch * batchSize;
        const endIdx = Math.min(startIdx + batchSize, Number(count));
        
        // Process each reward in the current batch
        for (let i = startIdx; i < endIdx; i++) {
          try {
            // Add a small delay between requests in the same batch
            if (i > startIdx) await new Promise(resolve => setTimeout(resolve, 250));
            
            // Make the contract call with rate limiting
            const [amount, claimed] = await withRateLimit<[ethers.BigNumber, boolean]>(
              () => contract.pendingRewards(playerAddress, i),
              { maxRetries: 3, baseDelay: 1000 }
            );
            
            console.log(`Reward ${i}: ${amount.toString()} (${claimed ? 'claimed' : 'unclaimed'})`);
            totalWinnings += BigInt(amount.toString());
          } catch (error) {
            console.error(`Error fetching reward ${i}:`, error);
          }
        }
      }
      
      console.log(`Total calculated winnings for ${playerAddress}: ${totalWinnings.toString()}`);
      return totalWinnings.toString();
    } catch (error) {
      console.error(`Error calculating winnings for ${playerAddress}:`, error);
      return "0";
    } finally {
      setLoadingStates(prev => ({ ...prev, winnings: false }));
    }
  };

  // Update the handleRefresh function to use toast notifications
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadLeaderboardData();
      toast('Leaderboard refreshed', {
        icon: '🔄',
        duration: 2000
      });
    } catch (error) {
      console.error('Error refreshing leaderboard:', error);
      toast.error('Failed to refresh leaderboard');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Update the sorting logic in the Leaderboard component
  const sortedLeaderboard = useMemo(() => {
    return [...leaderboard].sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      
      switch (sortConfig.field) {
        case 'wins':
          return (a.wins - b.wins) * direction;
        case 'total_winnings':
          const aWinnings = BigInt(a.totalWinnings || '0');
          const bWinnings = BigInt(b.totalWinnings || '0');
          return Number(aWinnings - bWinnings) * direction;
        case 'lastPlayTime':
          // Handle null values for lastPlayTime
          if (a.lastPlayTime === null && b.lastPlayTime === null) {
            return 0;
          } else if (a.lastPlayTime === null) {
            return -1; // null values come last
          } else if (b.lastPlayTime === null) {
            return 1; // null values come last
          } else {
            return ((a.lastPlayTime as number) - (b.lastPlayTime as number)) * direction;
          }
        default:
          return 0;
      }
    });
  }, [leaderboard, sortConfig]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Leaderboard</h2>
        <button
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <LeaderboardStats leaderboard={leaderboard} chainId={chainId} />
      
      <SortingControls 
        sortConfig={sortConfig}
        setSortConfig={setSortConfig}
        filters={filters}
        setFilters={setFilters}
      />
      
      {error && (
        <div className="text-red-500 mb-4">{error}</div>
      )}
      
      <div className="overflow-x-auto relative">
        {(isLoading || isRefreshing) && (
          <LoadingOverlay loadingStates={loadingStates} loadingProgress={loadingProgress} />
        )}
        
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="px-4 py-2 text-left text-gray-400">Rank</th>
              <th className="px-4 py-2 text-left text-gray-400">Player</th>
              <th className="px-4 py-2 text-right text-gray-400">Wins</th>
              <th className="px-4 py-2 text-right text-gray-400">Total Winnings</th>
              <th className="px-4 py-2 text-right text-gray-400">Last Played</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {sortedLeaderboard.map((entry, index) => {
                const displayAddress = entry.address.toLowerCase() === address?.toLowerCase() 
                  ? `(You) ${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`
                  : `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`;
                  
                return (
                  <motion.tr
                    key={entry.address}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`${entry.address.toLowerCase() === address?.toLowerCase() ? 'bg-primary/20' : ''} hover:bg-white/5`}
                  >
                    <td className="px-4 py-3">{index + 1}</td>
                    <td className="px-4 py-3">{displayAddress}</td>
                    <td className="px-4 py-3">{entry.wins}</td>
                    <td className="px-4 py-3">{formatWinningsToMON(entry.totalWinnings || '0', chainId)}</td>
                    <td className="px-4 py-3">{formatTimeAgo(entry.lastPlayTime)}</td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Utility function to format time ago
function formatTimeAgo(timestamp: number | null): string {
  if (timestamp === null) return 'Never played';
  
  // Convert timestamp from seconds to milliseconds
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}