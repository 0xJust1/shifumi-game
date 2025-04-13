import { useState, useEffect, lazy, Suspense } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { BetTier } from './contracts/contractConfig'
import GameBoard from './components/GameBoard'
import NetworkWarning from './components/NetworkWarning'
// Utiliser le chargement paresseux pour les composants non critiques
const RewardsPanel = lazy(() => import('./components/RewardsPanel'))
const Leaderboard = lazy(() => import('./components/Leaderboard'))
const AdminPanel = lazy(() => import('./components/AdminPanel'))
const Test = lazy(() => import('./Test.tsx'))
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './contracts/contractConfig'
import { ethers } from 'ethers'
import GameStats from './components/GameStats'
import { supabase } from './utils/supabase'
import { Reward } from './utils/rewards'
import { withRateLimit, processBatch } from './utils/withRateLimit'

type Tab = 'game' | 'rewards' | 'leaderboard' | 'admin' | 'test' | 'stats'

interface RewardData {
  index: number;
  amount: bigint;
  claimed: boolean;
  success?: boolean;
  error?: boolean;
  errorMessage?: string;
}

// Fetch a single reward with rate limiting protection
const fetchRewardFromContract = async (
  contract: ethers.Contract,
  address: string,
  rewardId: number
): Promise<RewardData> => {
  try {
    // Use withRateLimit to handle rate limiting
    const [amount, claimed] = await withRateLimit<[ethers.BigNumber, boolean]>(
      () => contract.pendingRewards(address, rewardId),
      {
        maxRetries: 5,
        baseDelay: 1000,
        maxDelay: 15000
      }
    );
    
    return {
      index: rewardId,
      amount: BigInt(amount.toString()),
      claimed
    };
  } catch (error) {
    console.error(`Error fetching reward ${rewardId}:`, error);
    return {
      index: rewardId,
      amount: BigInt(0),
      claimed: true,
      error: true,
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Update the fetchRewards function to use the improved processBatch utility
const fetchRewards = async (
  address: string,
  maxCount: number = 20,
  setIsLoadingRewards?: (loading: boolean) => void,
  setLoadingProgress?: (progress: number) => void
): Promise<{ rewards: Reward[]; totalUnclaimed: bigint }> => {
  if (setIsLoadingRewards) setIsLoadingRewards(true);
  if (setLoadingProgress) setLoadingProgress(0);
  
  console.log(`Fetching rewards for ${address} with max count ${maxCount}`);
  
  try {
    if (!window.ethereum) {
      throw new Error('No provider available');
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    
    // Get the actual count of rewards from the contract with rate limiting
    const rewardCount = await withRateLimit(() => 
      contract.getPendingRewardCount(address)
    );
    const actualCount = Number(rewardCount);
    
    console.log(`Contract reports ${actualCount} total rewards for ${address}`);
    
    if (actualCount === 0) {
      console.log("No rewards found from contract");
      if (setIsLoadingRewards) setIsLoadingRewards(false);
      return { rewards: [], totalUnclaimed: BigInt(0) };
    }
    
    // Limit to the smaller of maxCount or actualCount
    const count = Math.min(maxCount, actualCount);
    console.log(`Will fetch ${count} rewards`);
    
    // Create array of indices to process
    const indices = Array.from({ length: count }, (_, i) => i);
    
    // Process rewards in batches with rate limiting
    const rewardData = await processBatch<number, RewardData>(
      indices,
      (index) => fetchRewardFromContract(contract, address, index),
      {
        batchSize: 5,
        delayBetweenBatches: 1500, // Increase delay between batches
        delayBetweenItems: 300,    // Add delay between items
        onProgress: (processed, total) => {
          if (setLoadingProgress) {
            setLoadingProgress((processed / total) * 100);
          }
        }
      }
    );
    
    // Calculate total unclaimed amount
    const totalUnclaimed = rewardData.reduce((total, reward) => {
      if (!reward.claimed && reward.amount > BigInt(0)) {
        return total + reward.amount;
      }
      return total;
    }, BigInt(0));
    
    // Filter out zero amounts and errors
    const validRewards = rewardData.filter(reward => 
      reward.amount > BigInt(0) && !reward.error
    );
    
    console.log(`Successfully fetched ${rewardData.length} rewards, ${validRewards.length} valid`);
    console.log(`Total unclaimed amount: ${totalUnclaimed.toString()}`);
    
    const rewards = convertToRewardFormat(validRewards);
    
    if (setIsLoadingRewards) setIsLoadingRewards(false);
    return { rewards, totalUnclaimed };
  } catch (error) {
    console.error("Error fetching rewards:", error);
    if (setIsLoadingRewards) setIsLoadingRewards(false);
    return { rewards: [], totalUnclaimed: BigInt(0) };
  }
};

// Update the convertToRewardFormat function to add more logging and fix the type error
const convertToRewardFormat = (rewardData: RewardData[]): Reward[] => {
  console.log(`Converting ${rewardData.length} rewards to Reward format`);
  
  const converted = rewardData.map(reward => {
    // Explicitly type the status to ensure it's either 'claimed' or 'pending'
    const status: 'claimed' | 'pending' = reward.claimed ? 'claimed' : 'pending';
    
    const result: Reward = {
      id: reward.index.toString(),
      amount: reward.amount,
      timestamp: Math.floor(Date.now() / 1000), // Use current timestamp as fallback
      status: status
    };
    
    console.log(`Reward ${reward.index}: amount=${reward.amount.toString()}, claimed=${reward.claimed}, status=${status}`);
    return result;
  });
  
  console.log(`Pending rewards: ${converted.filter(r => r.status === 'pending').length}`);
  return converted;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('game')
  const { address, isConnected } = useAccount()
  const [isOwner, setIsOwner] = useState(false)
  
  // State for RewardsPanel
  const [pendingRewards, setPendingRewards] = useState<RewardData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isPending, setIsPending] = useState(false)
  const [claimingAll, setClaimingAll] = useState(false)
  const [claimingRewardIndex, setClaimingRewardIndex] = useState<number | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [lastTxHash, setLastTxHash] = useState<string | null>(null)
  const [txSuccess, setTxSuccess] = useState(false)
  const [totalWins, setTotalWins] = useState<number>(0)
  const [totalWinnings, setTotalWinnings] = useState<bigint>(BigInt(0))
  const [convertedRewards, setConvertedRewards] = useState<Reward[]>([])

  // Contract reads for rewards data
  const { data: rewardCount } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getPendingRewardCount',
    args: [address],
    query: {
      enabled: !!address,
      refetchInterval: 30000 // Refetch every 30 seconds
    }
  })

  const { data: totalWinsData } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'playerTotalWins',
    args: [address],
    query: {
      enabled: !!address,
      refetchInterval: 30000
    }
  })

  // Get player total winnings - fetch less frequently
  const { data: totalWinningsData } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getPlayerWinnings',
    args: [address],
    query: {
      enabled: !!address,
      refetchInterval: 30000
    }
  })

  // Update totalWinnings when contract data changes
  useEffect(() => {
    if (totalWinningsData) {
      const newTotalWinnings = BigInt(totalWinningsData.toString());
      console.log(`App: Setting totalWinnings to ${newTotalWinnings.toString()}`);
      setTotalWinnings(newTotalWinnings);
    }
  }, [totalWinningsData]);

  // Log when RewardsPanel is rendered
  useEffect(() => {
    if (activeTab === 'rewards') {
      console.log(`App: Rendering RewardsPanel with totalWinnings: ${totalWinnings.toString()}`);
    }
  }, [activeTab, totalWinnings]);

  // Fetch winnings from Supabase as a backup
  useEffect(() => {
    const fetchWinningsFromDb = async () => {
      if (!address) return;
      
      try {
        const { data, error } = await supabase
          .from('player_stats')
          .select('total_winnings')
          .eq('address', address)
          .single();
        
        if (error) {
          console.error('Error fetching winnings from Supabase:', error);
          return;
        }
        
        if (data && data.total_winnings) {
          const dbWinnings = BigInt(data.total_winnings);
          console.log(`App: Fetched winnings from Supabase: ${dbWinnings.toString()}`);
          
          // Only update if the DB value is higher than the current value
          if (dbWinnings > totalWinnings) {
            console.log(`App: Updating totalWinnings from DB: ${dbWinnings.toString()}`);
            setTotalWinnings(dbWinnings);
          }
        }
      } catch (error) {
        console.error('Error in fetchWinningsFromDb:', error);
      }
    };
    
    fetchWinningsFromDb();
  }, [address, totalWinnings]);

  // Contract writes for claiming rewards
  const { writeContractAsync: writeClaimReward } = useWriteContract()
  const { writeContractAsync: writeClaimAll } = useWriteContract()

  // Transaction receipt hooks
  const { data: claimAllReceipt, isLoading: isClaimAllLoading } = useWaitForTransactionReceipt({
    hash: hash as `0x${string}`,
    query: {
      enabled: !!hash
    }
  })

  const { data: claimRewardReceipt, isLoading: isClaimRewardLoading } = useWaitForTransactionReceipt({
    hash: hash as `0x${string}`,
    query: {
      enabled: !!hash
    }
  })

  // Vérification simplifiée basée sur une adresse connue
  const knownOwnerAddresses = [
    '0xc18bf34dd227589af46b622dfe11908a9fc52e50',  // Votre adresse
  ];
  
  // Vérifiez si l'utilisateur est propriétaire sans appel de contrat
  useEffect(() => {
    if (address) {
      setIsOwner(knownOwnerAddresses.includes(address.toLowerCase()));
    } else {
      setIsOwner(false);
    }
  }, [address]);

  // Update the call to fetchRewards in the App component
  useEffect(() => {
    if (address && isConnected) {
      // Add a loading indicator
      setIsLoading(true);
      setLoadingProgress(0);
      
      // Use withRateLimit to handle rate limiting errors
      withRateLimit(() => 
        fetchRewards(address, 100, setIsLoading, setLoadingProgress)
          .then(({ rewards, totalUnclaimed }) => {
            setPendingRewards(rewards.map(reward => ({
              index: parseInt(reward.id),
              amount: reward.amount,
              claimed: reward.status === 'claimed',
              error: false,
              errorMessage: undefined
            })));
            setConvertedRewards(rewards);
            setTotalWinnings(totalUnclaimed);
          })
      )
      .catch(error => {
        console.error('Error in App fetchRewards:', error);
        // Make sure UI isn't stuck in loading state
        setIsLoading(false);
        setLoadingProgress(100);
      });
    }
  }, [address, isConnected]);

  // Update total wins
  useEffect(() => {
    if (totalWinsData) {
      setTotalWins(Number(totalWinsData));
    }
  }, [totalWinsData]);

  // Handle transaction receipts
  useEffect(() => {
    if (claimAllReceipt?.status === 'success') {
      setTxSuccess(true);
      // Refresh rewards after successful claim
      const refreshRewards = async () => {
        if (!address || !window.ethereum) return;
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const count = await contract.getPendingRewardCount(address);
        if (Number(count) === 0) {
          setPendingRewards([]);
          setConvertedRewards([]);
          setTotalWinnings(BigInt(0));
        }
      };
      refreshRewards();
    }
  }, [claimAllReceipt, address]);

  useEffect(() => {
    if (claimRewardReceipt?.status === 'success' && claimingRewardIndex !== null) {
      setTxSuccess(true);
      // Update the claimed reward in the list
      setPendingRewards(prev => {
        const updated = prev.map(reward => 
          reward.index === claimingRewardIndex ? { ...reward, claimed: true } : reward
        );
        setConvertedRewards(convertToRewardFormat(updated));
        return updated;
      });
    }
  }, [claimRewardReceipt, claimingRewardIndex]);

  // Handlers for RewardsPanel
  const handleClaimAll = async () => {
    if (!address) return;
    
    setClaimingAll(true);
    setTxError(null);
    
    try {
      const txHash = await writeClaimAll({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'claimAllRewards',
        args: []
      });
      
      if (txHash) {
        setHash(txHash);
        setLastTxHash(txHash);
      }
    } catch (error) {
      console.error('Error claiming all rewards:', error);
      setTxError(error instanceof Error ? error.message : 'Failed to claim rewards');
    } finally {
      setClaimingAll(false);
    }
  };

  const handleClaimReward = async (index: number) => {
    if (!address) return;
    
    setClaimingRewardIndex(index);
    setTxError(null);
    
    try {
      const txHash = await writeClaimReward({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'claimReward',
        args: [BigInt(index)]
      });
      
      if (txHash) {
        setHash(txHash);
        setLastTxHash(txHash);
      }
    } catch (error) {
      console.error('Error claiming reward:', error);
      setTxError(error instanceof Error ? error.message : 'Failed to claim reward');
    } finally {
      setClaimingRewardIndex(null);
    }
  };

  // Composant de chargement pour les onglets paresseux
  const LoadingFallback = () => (
    <div className="flex justify-center items-center p-12">
      <div className="animate-spin h-10 w-10 border-t-2 border-b-2 border-purple-600 rounded-full"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-4">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-center mb-6">
          <h1 className="text-4xl font-bold text-primary mb-4 md:mb-0">
            ShiFUmi
          </h1>
          
          <ConnectButton />
        </header>
        
        <NetworkWarning />
        
        <div className="bg-gray-800/40 p-3 rounded-xl mb-8 backdrop-blur-sm shadow-lg">
          <div className="flex flex-wrap justify-center gap-3">
            <button
              className={`px-6 py-3 rounded-lg transition-all duration-200 font-medium ${
                activeTab === 'game' 
                  ? 'bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-md' 
                  : 'bg-gray-700/80 hover:bg-gray-600 text-gray-200 hover:text-white'
              }`}
              onClick={() => setActiveTab('game')}
            >
              Game
            </button>
            <button
              className={`px-6 py-3 rounded-lg transition-all duration-200 font-medium ${
                activeTab === 'rewards' 
                  ? 'bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-md' 
                  : 'bg-gray-700/80 hover:bg-gray-600 text-gray-200 hover:text-white'
              }`}
              onClick={() => setActiveTab('rewards')}
            >
              Rewards
            </button>
            <button
              className={`px-6 py-3 rounded-lg transition-all duration-200 font-medium ${
                activeTab === 'leaderboard' 
                  ? 'bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-md' 
                  : 'bg-gray-700/80 hover:bg-gray-600 text-gray-200 hover:text-white'
              }`}
              onClick={() => setActiveTab('leaderboard')}
            >
              Leaderboard
            </button>
            <button
              className={`px-6 py-3 rounded-lg transition-all duration-200 font-medium ${
                activeTab === 'stats' 
                  ? 'bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-md' 
                  : 'bg-gray-700/80 hover:bg-gray-600 text-gray-200 hover:text-white'
              }`}
              onClick={() => setActiveTab('stats')}
            >
              Stats
            </button>
            {isOwner && (
              <>
                <button
                  className={`px-6 py-3 rounded-lg transition-all duration-200 font-medium ${
                    activeTab === 'admin' 
                      ? 'bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-md' 
                      : 'bg-gray-700/80 hover:bg-gray-600 text-gray-200 hover:text-white'
                  }`}
                  onClick={() => setActiveTab('admin')}
                >
                  Admin
                </button>
                <button
                  className={`px-6 py-3 rounded-lg transition-all duration-200 font-medium ${
                    activeTab === 'test' 
                      ? 'bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-md' 
                      : 'bg-gray-700/80 hover:bg-gray-600 text-gray-200 hover:text-white'
                  }`}
                  onClick={() => setActiveTab('test')}
                >
                  Debug
                </button>
              </>
            )}
          </div>
        </div>
        
        <main className="mt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'game' && <GameBoard />}
              
              {activeTab === 'rewards' && (
                <Suspense fallback={<LoadingFallback />}>
                  <RewardsPanel
                    totalWins={totalWins}
                    totalWinnings={totalWinnings}
                    pendingRewards={convertedRewards}
                    isLoading={isLoading}
                    loadingProgress={loadingProgress}
                    isPending={isPending}
                    claimingAll={claimingAll}
                    claimingRewardIndex={claimingRewardIndex}
                    txError={txError || undefined}
                    hash={hash || undefined}
                    lastTxHash={lastTxHash || undefined}
                    txSuccess={txSuccess}
                    onClaimAll={handleClaimAll}
                    onClaimReward={handleClaimReward}
                  />
                </Suspense>
              )}
              
              {activeTab === 'leaderboard' && (
                <Suspense fallback={<LoadingFallback />}>
                  <Leaderboard />
                </Suspense>
              )}
              
              {activeTab === 'admin' && isOwner && (
                <Suspense fallback={<LoadingFallback />}>
                  <AdminPanel />
                </Suspense>
              )}
              
              {activeTab === 'test' && isOwner && (
                <Suspense fallback={<LoadingFallback />}>
                  <Test />
                </Suspense>
              )}
              
              {activeTab === 'stats' && <GameStats />}
            </motion.div>
          </AnimatePresence>
          
          <footer className="mt-12 text-center text-gray-400">
            &copy; 2025 ShiFUmi Game | Rock Paper Scissors on the blockchain
            <a 
              href="https://x.com/0xJust1" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-block ml-2 hover:text-white transition-colors"
              aria-label="Follow us on X (Twitter)"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="currentColor"
                className="inline-block"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a 
              href="https://github.com/0xJust1" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-block ml-2 hover:text-white transition-colors"
              aria-label="View our code on GitHub"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="currentColor"
                className="inline-block"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </footer>
        </main>
      </div>
    </div>
  )
}
