import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useConfig } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { motion, AnimatePresence, AnimationControls, Variants } from 'framer-motion';
import { CONTRACT_ADDRESS, CONTRACT_ABI, BetTier, MOVE_NAMES, GameState, GameCommitment, GameResult, Move } from '../contracts/contractConfig';
import { SUPPORTED_CHAINS, getTokenSymbol, getExplorerUrl } from '../utils/network';
import MoveButton from './MoveButton';
import TierSelector from './TierSelector';
import GameResultDisplay from './GameResultDisplay';
import Countdown from './Countdown';
import { ethers } from 'ethers';
import { toast } from 'react-hot-toast';
import useSound from 'use-sound';
import Particles from './Particles';
import { playHover, playSelect, playWin, playLose, playDraw, playLevelUp, playAchievement } from '../utils/sounds';
import { updateGameResult } from '../utils/supabase';
import { supabase } from '../utils/supabase';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001/api';

// Default bet amounts for each tier
const DEFAULT_BET_AMOUNTS = {
  [BetTier.TIER_1]: "0.005",
  [BetTier.TIER_2]: "0.01", 
  [BetTier.TIER_3]: "0.025",
  [BetTier.TIER_4]: "0.05",
  [BetTier.TIER_5]: "0.1"
};

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  condition: (stats: PlayerStats, won: boolean, tier: BetTier, streak: number) => boolean;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_win',
    name: 'First Victory',
    description: 'Win your first game',
    icon: '🏆',
    unlocked: false,
    condition: (stats, won) => won && stats.wins === 1
  },
  {
    id: 'streak_3',
    name: 'Hot Streak',
    description: 'Win 3 games in a row',
    icon: '🔥',
    unlocked: false,
    condition: (stats, won, tier, streak) => streak >= 3
  },
  {
    id: 'high_roller',
    name: 'High Roller',
    description: 'Play a game with maximum bet',
    icon: '💰',
    unlocked: false,
    condition: (stats, won, tier) => tier === 3
  }
];

// Add player progression system
interface PlayerStats {
  level: number;
  xp: number;
  wins: number;
  totalGames: number;
  achievements: Achievement[];
  currentStreak: number;
  maxStreak: number;
  multiplier: number;
}

// Improved level calculation functions with better scaling
const calculateLevel = (xp: number) => Math.floor(Math.sqrt(xp / 100)) + 1;
const calculateXpForNextLevel = (level: number) => Math.pow(level, 2) * 100;

// Calculate XP rewards based on game outcome and player's current streak
const calculateXPReward = (result: string, streak: number, tier: BetTier) => {
  const tierMultiplier = Number(tier) + 1; // Higher tiers give more XP
  
  if (result === 'win') {
    // Base XP for win: 20, with streak bonus and tier multiplier
    return Math.floor(20 * (1 + streak * 0.1) * tierMultiplier);
  } else if (result === 'draw') {
    // Base XP for draw: 5, with tier multiplier
    return Math.floor(5 * tierMultiplier);
  } else {
    // Base XP for playing: 2, with tier multiplier
    return Math.floor(2 * tierMultiplier);
  }
};

// Sound effects configuration
const SOUNDS = {
  click: '/sounds/click.mp3',
  win: '/sounds/win.mp3',
  lose: '/sounds/lose.mp3',
  draw: '/sounds/draw.mp3',
  hover: '/sounds/hover.mp3',
  levelUp: '/sounds/level-up.mp3'
};

type MoveType = 'rock' | 'paper' | 'scissors';

const moveAnimations: Record<MoveType, Variants> = {
  rock: {
    initial: { scale: 0, rotate: 0, opacity: 0 },
    animate: {
      scale: [0, 1.2, 1],
      rotate: [0, -15, 15, 0],
      opacity: 1,
      transition: {
        duration: 0.5,
        times: [0, 0.6, 1],
        ease: "easeOut"
      }
    },
    exit: {
      scale: [1, 1.2, 0],
      rotate: [0, 15, 0],
      opacity: 0,
      transition: { duration: 0.3 }
    }
  },
  paper: {
    initial: { scale: 0, y: -50, opacity: 0 },
    animate: {
      scale: [0, 1.2, 1],
      y: [-50, 10, 0],
      opacity: 1,
      transition: {
        duration: 0.5,
        times: [0, 0.6, 1],
        ease: "easeOut"
      }
    },
    exit: {
      scale: [1, 1.2, 0],
      y: [0, -50],
      opacity: 0,
      transition: { duration: 0.3 }
    }
  },
  scissors: {
    initial: { scale: 0, x: -50, opacity: 0 },
    animate: {
      scale: [0, 1.2, 1],
      x: [-50, 10, 0],
      opacity: 1,
      transition: {
        duration: 0.5,
        times: [0, 0.6, 1],
        ease: "easeOut"
      }
    },
    exit: {
      scale: [1, 1.2, 0],
      x: [0, 50],
      opacity: 0,
      transition: { duration: 0.3 }
    }
  }
};

export default function GameBoard() {
  const { address, isConnected, chainId } = useAccount();
  const [selectedMove, setSelectedMove] = useState<number | null>(null);
  const [selectedTier, setSelectedTier] = useState<BetTier>(BetTier.TIER_1);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [gamePhase, setGamePhase] = useState<'commit' | 'done'>('commit');
  const [showTxDetails, setShowTxDetails] = useState(false);
  const [txLog, setTxLog] = useState<{timestamp: string, message: string, type: 'info' | 'success' | 'error' | 'warning'}[]>([]);
  const [claimingReward, setClaimingReward] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [playerStats, setPlayerStats] = useState<PlayerStats>({
    level: 1,
    xp: 0,
    wins: 0,
    totalGames: 0,
    achievements: [],
    currentStreak: 0,
    maxStreak: 0,
    multiplier: 1.0
  });
  
  // Check if on supported network
  const isWrongNetwork = isConnected && !Object.values(SUPPORTED_CHAINS).includes(chainId || 0);

  // Get current network name
  const getCurrentNetworkName = () => {
    if (!chainId) return "a supported network";
    const entry = Object.entries(SUPPORTED_CHAINS).find(([_, id]) => id === chainId);
    return entry ? entry[0] : "a supported network";
  };
  
  // Get bet amount for selected tier
  const { data: betAmount } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'tierToAmount',
    args: [selectedTier],
    query: {
      gcTime: 300000,     // 5 minutes cache 
      staleTime: 120000,  // 2 minutes stale time
      enabled: isConnected && !isWrongNetwork
    }
  });
  
  // Get last play timestamp - only fetch when needed
  const { data: lastPlayTimestamp, refetch: refetchLastPlayTime } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'lastPlayTimestamp',
    args: [address],
    query: {
      gcTime: 60000,     // 1 minute cache
      staleTime: 30000,  // 30 seconds stale time
      enabled: !!address && isConnected && !isWrongNetwork
    }
  });
  
  // Get current game commitment - only fetch when needed
  const { data: gameCommitment, refetch: refetchGameCommitment } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'gameCommitments',
    args: [address],
    query: {
      gcTime: 60000,     // 1 minute cache
      staleTime: 30000,  // 30 seconds stale time
      enabled: !!address && isConnected && !isWrongNetwork
    }
  });
  
  // Get cooldown period - this rarely changes, so cache for much longer
  const { data: cooldownSeconds } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'COOLDOWN',
    query: {
      gcTime: 3600000,    // 1 hour cache
      staleTime: 1800000, // 30 minutes stale time
      enabled: isConnected && !isWrongNetwork
    }
  });
  
  // Get game paused state - check less frequently
  const { data: isPaused } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'isPaused',
    query: {
      gcTime: 120000,    // 2 minutes cache
      staleTime: 60000,  // 1 minute stale time
      enabled: isConnected && !isWrongNetwork
    }
  });
  
  // Transaction
  const { data: txHash, writeContract: writeTransaction, isPending: isTransactionPending, error: transactionError, reset: resetTransaction } = useWriteContract();
  
  // Wait for transaction to be mined
  const { isSuccess: transactionSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });
  
  // Get transaction URL for block explorer
  const getTransactionUrl = (hash: `0x${string}`) => {
    return getExplorerUrl(chainId || 0, hash);
  };
  
  // Calculate current bet amount based on selected tier
  const getCurrentBetAmount = () => {
    if (typeof betAmount === 'bigint') {
      return formatEther(betAmount);
    }
    return DEFAULT_BET_AMOUNTS[selectedTier];
  };
  
  // Fonction pour ajouter un log de transaction
  const addTxLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setTxLog(prev => [...prev, { timestamp, message, type }]);
  };
  
  // Sound hooks
  const [playClick] = useSound(SOUNDS.click, { volume: 0.5 });
  const [playWin] = useSound(SOUNDS.win, { volume: 0.5 });
  const [playLose] = useSound(SOUNDS.lose, { volume: 0.5 });
  const [playDraw] = useSound(SOUNDS.draw, { volume: 0.5 });
  const [playHover] = useSound(SOUNDS.hover, { volume: 0.2 });
  const [playLevelUp] = useSound(SOUNDS.levelUp, { volume: 0.7 });
  
  // Handle play button click - pour jouer directement
  const handlePlay = () => {
    console.log("Play button clicked!");
    
    if (!isConnected || selectedMove === null || isPaused || isWrongNetwork) {
      console.log("Button disabled condition triggered:", {
        notConnected: !isConnected,
        noMove: selectedMove === null,
        paused: isPaused,
        wrongNetwork: isWrongNetwork
      });
      return;
    }
    
    // Activer l'état de chargement
    setIsLoading(true);
    setShowTxDetails(true);
    addTxLog("Initiating game transaction...");
    
    // Set a timeout for slow wallet connections
    const walletTimeout = setTimeout(() => {
      addTxLog("Your wallet is taking longer than usual to open. You may need to check your wallet app manually.", 'warning');
    }, 8000); // Show warning after 8 seconds
    
    try {
      console.log(`Playing with move ${selectedMove}, tier ${selectedTier}`);
      addTxLog(`Playing move: ${getMoveText(selectedMove)}`, 'info');
      
      // Get bet amount value - either from contract or default
      const betAmountValue = typeof betAmount === 'bigint' 
        ? betAmount 
        : parseEther(DEFAULT_BET_AMOUNTS[selectedTier]);
      
      // Optimize gas settings for Monad testnet
      const isMonad = import.meta.env.VITE_NETWORK_NAME === "monadTestnet";
      
      // Trigger transaction with optimized parameters
      writeTransaction({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'playGame',
        args: [selectedMove, selectedTier],
        value: betAmountValue,
        gas: isMonad ? BigInt(1500000) : BigInt(300000), // Lower gas limit for Monad
        maxPriorityFeePerGas: isMonad ? BigInt(2000000) : undefined, // Lower priority fee
        maxFeePerGas: isMonad ? BigInt(3000000) : undefined, // Add maximum fee cap
        // Add chainId explicitly to prevent wallet reconfiguration
        chainId: Number(import.meta.env.VITE_CHAIN_ID || "1") 
      }, {
        onSuccess(data) {
          clearTimeout(walletTimeout);
          addTxLog("Transaction sent, waiting for blockchain confirmation...", 'info');
        },
        onError(error) {
          clearTimeout(walletTimeout);
          addTxLog(`Error: ${error.message || 'Unknown error'}`, 'error');
          setIsLoading(false);
        }
      });
      
      // Add a more detailed log message about wallet interaction
      addTxLog("Wallet should open shortly. If it takes too long, try closing and reopening your wallet app.", 'info');
    } catch (err) {
      clearTimeout(walletTimeout);
      console.error('Error playing game:', err);
      addTxLog(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
      setIsLoading(false);
    }
  };
  
  // Handle transaction success
  useEffect(() => {
    if (transactionSuccess && txHash) {
      const fetchGameResult = async () => {
        try {
          console.log("Fetching transaction receipt for:", txHash);
          addTxLog("Getting game result from blockchain...", 'info');
          
          // On utilise ethers.js directement pour plus de contrôle
          if (window.ethereum) {
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const receipt = await provider.getTransactionReceipt(txHash);
            
            if (receipt) {
              console.log("Transaction receipt:", receipt);
              
              // Créer une interface pour l'événement GamePlayed
              const gamePlayedInterface = new ethers.utils.Interface([
                "event GamePlayed(address indexed player, uint8 playerMove, uint8 contractMove, string result, uint256 netWin, bytes32 proofHash)"
              ]);
              
              // Filtrer les logs pour trouver l'événement GamePlayed
              const gamePlayedLogs = receipt.logs
                .map(log => {
                  try {
                    return gamePlayedInterface.parseLog(log);
                  } catch (e) {
                    return null;
                  }
                })
                .filter(Boolean);
              
              console.log("Game played logs:", gamePlayedLogs);
              
              if (gamePlayedLogs.length > 0) {
                const event = gamePlayedLogs[0];
                if (event && event.args) {
                  const { playerMove, contractMove, result, netWin, proofHash } = event.args;
                  
                  console.log("Game result from blockchain:", {
                    playerMove: Number(playerMove),
                    contractMove: Number(contractMove),
                    result,
                    netWin: netWin.toString(),
                    proofHash
                  });
                  
                  // Log supplémentaires sur le proofHash
                  console.log("PROOF HASH DETAILS:", {
                    value: proofHash,
                    type: typeof proofHash,
                    isHex: proofHash?.startsWith('0x'),
                    length: proofHash?.length
                  });
                  
                  addTxLog(`Game result: ${result}!`, result === 'Win' ? 'success' : result === 'Draw' ? 'info' : 'error');
                  
                  if (proofHash) {
                    addTxLog(`Game proof: ${shortenHash(proofHash)}`, 'info');
                  }
                  
                  // Create the game result object
                  const gameResultData = {
                    player: Number(playerMove) as Move,
                    ai: Number(contractMove) as Move,
                    result,
                    netWin: BigInt(netWin.toString()),
                    proofHash: proofHash ? proofHash as `0x${string}` : undefined
                  };
                  
                  // Update the game result state
                  setGameResult(gameResultData);
                  setShowResult(true);
                  setIsLoading(false);
                  setGamePhase('done');
                  refetchLastPlayTime();
                  
                  // Update Supabase with game result
                  if (address) {
                    // Convert the result to lowercase for database consistency
                    const resultType = result.toLowerCase() as 'win' | 'loss' | 'draw';
                    console.log('Updating game result in database:', {
                      address,
                      resultType,
                      playerMove: Number(playerMove),
                      contractMove: Number(contractMove),
                      netWin: netWin.toString(),
                      isLoss: resultType === 'loss',
                      originalResult: result
                    });
                    
                    // Add specific logging for losses
                    if (resultType === 'loss') {
                      console.log('Recording a loss:', {
                        playerMove: getMoveText(Number(playerMove)),
                        computerMove: getMoveText(Number(contractMove)),
                        result: resultType,
                        timestamp: new Date().toISOString()
                      });
                    }
                    
                    await handleGameResult(
                      resultType,
                      BigInt(netWin.toString()),
                      Number(playerMove),
                      Number(contractMove)
                    );
                  }
                  
                  // Update the leaderboard refresh event to include all stats
                  window.dispatchEvent(new CustomEvent('refreshLeaderboard', { 
                    detail: { 
                      playerAddress: address,
                      result: result.toLowerCase(),
                      playerMove: Number(playerMove),
                      lastPlayTime: Math.floor(Date.now() / 1000)
                    } 
                  }));
                  
                  return;
                }
              }
              
              // If we couldn't find the GamePlayed event, show a generic message
              addTxLog("Transaction confirmed, but couldn't find game result data. Please wait for blockchain confirmation.", 'info');
            } else {
              addTxLog("Waiting for transaction confirmation...", 'info');
            }
          }
          
          // The transaction is pending or we couldn't extract the result
          setIsLoading(false);
          
        } catch (err) {
          console.error("Error fetching transaction result:", err);
          addTxLog(`Error processing result: ${err instanceof Error ? err.message : String(err)}`, 'error');
          setIsLoading(false);
        }
      };
      
      fetchGameResult();
    }
    
    if (transactionError) {
      console.error("Transaction error:", transactionError);
      addTxLog(`Transaction failed: ${transactionError.message || "Unknown error"}`, 'error');
      setIsLoading(false);
    }
  }, [transactionSuccess, txHash, transactionError, refetchLastPlayTime]);
  
  // Check cooldown
  useEffect(() => {
    if (!lastPlayTimestamp || !cooldownSeconds) return;
    
    const checkCooldown = () => {
      const now = Math.floor(Date.now() / 1000);
      const cooldownEnd = Number(lastPlayTimestamp) + Number(cooldownSeconds);
      
      if (now < cooldownEnd) {
        setCooldownActive(true);
      } else {
        setCooldownActive(false);
      }
    };
    
    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    
    return () => clearInterval(interval);
  }, [lastPlayTimestamp, cooldownSeconds]);
  
  // Debug contract interaction
  useEffect(() => {
    console.log("Contract info:", {
      address: CONTRACT_ADDRESS,
      isConnected,
      chainId: chainId,
      expectedChainId: SUPPORTED_CHAINS.baseSepolia,
      isWrongNetwork,
      betAmount: typeof betAmount === 'bigint' ? formatEther(betAmount) : 'not loaded',
      lastPlayTimestamp: lastPlayTimestamp ? Number(lastPlayTimestamp) : 'not loaded',
      cooldownSeconds: cooldownSeconds ? Number(cooldownSeconds) : 'not loaded',
      isPaused: isPaused !== undefined ? isPaused : 'not loaded',
      selectedTier,
      selectedMove,
      cooldownActive,
      gamePhase,
      error: transactionError ? (transactionError?.message || 'unknown error') : 'none'
    });
  }, [CONTRACT_ADDRESS, isConnected, chainId, betAmount, lastPlayTimestamp, cooldownSeconds, isPaused, selectedTier, selectedMove, cooldownActive, transactionError, isWrongNetwork, gamePhase]);
  
  // Log lorsque le mouvement sélectionné change
  useEffect(() => {
    console.log("Selected move changed:", {
      selectedMove,
      moveType: typeof selectedMove,
      isRock: selectedMove === 0,
      isPaper: selectedMove === 1,
      isScissors: selectedMove === 2,
      isNull: selectedMove === null,
    });
  }, [selectedMove]);
  
  // Fonction pour réinitialiser complètement l'état du jeu
  const resetGameState = () => {
    console.log("Resetting game state completely");
    setGameResult(null);
    setShowResult(false);
    setSelectedMove(null);
    setIsLoading(false);
    setGamePhase('commit');
    
    if (resetTransaction) resetTransaction();
    
    refetchGameCommitment();
    refetchLastPlayTime();
  };
  
  // Ajout de logs pour déboguer le problème d'écran noir
  useEffect(() => {
    console.log("Game result state:", {
      showResult,
      hasGameResult: !!gameResult,
      gameResultData: gameResult
    });
  }, [showResult, gameResult]);
  
  // Helper function to shorten transaction hash
  const shortenHash = (hash: string) => {
    return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
  };
  
  // Helper function to get text representation of move
  const getMoveText = (move: number | null) => {
    if (move === null) return "None";
    return ["Rock", "Paper", "Scissors"][move];
  };
  
  // Handle claiming rewards
  const handleClaimRewards = () => {
    if (!isConnected || !gameResult || !address) return;
    
    setClaimingReward(true);
    setClaimTxHash(undefined);
    addTxLog("Initiating reward claim transaction...", 'info');
    
    try {
      // Use the claimAllRewards function from the contract
      writeTransaction({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'claimAllRewards',
        args: [],
      }, {
        onSuccess(data) {
          addTxLog("Claim transaction sent, waiting for confirmation...", 'info');
          setClaimTxHash(data);
        },
        onError(error) {
          addTxLog(`Error claiming rewards: ${error.message || 'Unknown error'}`, 'error');
          setClaimingReward(false);
        }
      });
    } catch (err) {
      console.error('Error claiming rewards:', err);
      addTxLog(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
      setClaimingReward(false);
    }
  };
  
  // Handle transaction success for claim rewards
  useEffect(() => {
    if (transactionSuccess && txHash && claimingReward) {
      console.log("Reward claim transaction successful:", txHash);
      addTxLog(`Rewards claimed successfully! (${shortenHash(txHash)})`, 'success');
      
      // Keep the claim transaction hash for display and don't reset immediately
      setClaimTxHash(txHash);
      setClaimingReward(false);
      
      // Don't auto-reset - user must close manually now
    }
  }, [transactionSuccess, txHash, claimingReward]);
  
  // Get player stats from Supabase when address changes
  useEffect(() => {
    const fetchPlayerStats = async () => {
      if (!address) return;
      
      try {
        const { data, error } = await supabase
          .from('player_stats')
          .select('*')
          .eq('address', address)
          .single();
          
        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
          console.error('Error fetching player stats:', error);
          return;
        }
        
        if (data) {
          // Convert database values to PlayerStats type
          setPlayerStats(prev => ({
            ...prev,
            level: data.level || 1,
            xp: data.xp || 0,
            wins: data.wins || 0,
            totalGames: data.total_games || 0,
            currentStreak: data.current_streak || 0,
            maxStreak: data.max_streak || 0,
            multiplier: data.multiplier || 1.0
          }));
          
          console.log('Loaded player stats from DB:', data);
        }
      } catch (error) {
        console.error('Error in fetchPlayerStats:', error);
      }
    };
    
    fetchPlayerStats();
  }, [address]);
  
  // Improved handleGameResult function that saves stats to Supabase
  const handleGameResult = async (result: string, netWin: bigint, playerMove?: number, computerMove?: number) => {
    if (!address) return;
      
    try {
      const resultType = result.toLowerCase();
      
      // Calculate updated streak
      const newStreak = resultType === 'win' 
        ? playerStats.currentStreak + 1 
        : resultType === 'lose' ? 0 : playerStats.currentStreak;
        
      const maxStreak = Math.max(newStreak, playerStats.maxStreak);
      const multiplier = 1 + Math.min(newStreak * 0.1, 1); // Max 2x multiplier
      
      // Calculate XP reward
      const xpReward = calculateXPReward(resultType, playerStats.currentStreak, selectedTier);
      const newXP = playerStats.xp + xpReward;
      const oldLevel = playerStats.level;
      const newLevel = calculateLevel(newXP);
      const leveledUp = newLevel > oldLevel;
      
      console.log(`Game result: ${resultType}, XP reward: ${xpReward}, New level: ${newLevel}`);
      
      // Update local state
      setPlayerStats(prev => ({
        ...prev,
        level: newLevel,
        xp: newXP,
        wins: resultType === 'win' ? prev.wins + 1 : prev.wins,
        totalGames: prev.totalGames + 1,
        currentStreak: newStreak,
        maxStreak,
        multiplier
      }));
      
      // Play level up sound if leveled up
      if (leveledUp) {
        // Add sound effect for level up
        toast.success(
          <div className="flex flex-col items-center">
            <div className="text-xl">🌟</div>
            <div className="font-bold">Level Up!</div>
            <div className="text-sm">You reached level {newLevel}</div>
          </div>,
          { duration: 5000 }
        );
      }
      
      // Update game result in database
      await updateGameResult(
        address,
        resultType as 'win' | 'lose' | 'draw',
        netWin.toString(),
        playerMove !== undefined ? playerMove.toString() : undefined,
        computerMove !== undefined ? computerMove.toString() : undefined
      );
      
      // Save player stats to Supabase
      const { error } = await supabase
        .from('player_stats')
        .upsert({
          address,
          level: newLevel,
          xp: newXP,
          wins: playerStats.wins + (resultType === 'win' ? 1 : 0),
          losses: playerStats.totalGames - playerStats.wins + (resultType === 'lose' ? 1 : 0),
          draws: playerStats.totalGames - playerStats.wins - (playerStats.totalGames - playerStats.wins) + (resultType === 'draw' ? 1 : 0),
          total_games: playerStats.totalGames + 1,
          current_streak: newStreak,
          max_streak: maxStreak,
          multiplier: multiplier,
          updated_at: new Date().toISOString()
        }, { onConflict: 'address' });
      
      if (error) {
        console.error('Error saving player stats to Supabase:', error);
      } else {
        console.log('Successfully saved player stats to Supabase');
      }
      
      // Check for achievements
      checkAchievements(resultType === 'win', selectedTier, newStreak);
      
    } catch (error) {
      console.error('Error updating game result:', error);
    }
  };
  
  const checkAchievements = (won: boolean, tier: BetTier, streak: number) => {
    const unlockedAchievements = ACHIEVEMENTS.filter(achievement => 
      !playerStats.achievements.find(a => a.id === achievement.id) && 
      achievement.condition(playerStats, won, tier, streak)
    );

    if (unlockedAchievements.length > 0) {
      setPlayerStats(prev => ({
        ...prev,
        achievements: [...prev.achievements, ...unlockedAchievements.map(a => ({ ...a, unlocked: true }))]
      }));

      // Show achievement notifications
      unlockedAchievements.forEach(achievement => {
        toast.success(
          <div className="flex flex-col items-center">
            <div className="text-xl">{achievement.icon}</div>
            <div className="font-bold">{achievement.name}</div>
            <div className="text-sm">{achievement.description}</div>
          </div>,
          { duration: 5000 }
        );
        playLevelUp();
      });
    }
  };
  
  // Update UI to show XP and level info
  {isConnected && !isWrongNetwork && !isPaused && (
    <div className="flex justify-between items-center mb-4">
      <div className="stats-container">
        <div className="level-info">
          <h3>Level {playerStats.level}</h3>
          <div className="xp-bar">
            <div 
              className="xp-progress" 
              style={{ 
                width: `${(playerStats.xp / calculateXpForNextLevel(playerStats.level)) * 100}%` 
              }} 
            />
          </div>
          <p>{playerStats.xp} / {calculateXpForNextLevel(playerStats.level)} XP</p>
        </div>
      </div>
      
      {playerStats.currentStreak > 0 && (
        <motion.div 
          className="streak-display"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring" }}
        >
          <div className="text-2xl font-bold text-yellow-400">
            🔥 {playerStats.currentStreak}
          </div>
          <div className="text-sm text-yellow-500">
            {playerStats.multiplier.toFixed(1)}x
          </div>
        </motion.div>
      )}
    </div>
  )}
  
  // Add streak display in the UI
  return (
    <div className="card max-w-4xl mx-auto">
      <motion.h2 
        className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        Rock Paper Scissors
      </motion.h2>
      
      {!isConnected ? (
        <div className="text-center py-8">
          <p className="text-xl mb-4">Connect your wallet to play</p>
        </div>
      ) : isWrongNetwork ? (
        <div className="text-center py-8 bg-red-900/20 rounded-lg p-4">
          <p className="text-xl mb-4 text-red-400">Unsupported Network Detected</p>
          <p className="mb-4">
            Please connect to one of our supported networks:
          </p>
          <ul className="list-disc list-inside mb-4 text-left max-w-md mx-auto">
            <li>Monad Testnet (Chain ID: {SUPPORTED_CHAINS.monadTestnet})</li>
            <li>Base (Chain ID: {SUPPORTED_CHAINS.base})</li>
            <li>Base Sepolia (Chain ID: {SUPPORTED_CHAINS.baseSepolia})</li>
            <li>Base Goerli (Chain ID: {SUPPORTED_CHAINS.baseGoerli})</li>
            <li>BSC (Chain ID: {SUPPORTED_CHAINS.bsc})</li>
            <li>BSC Testnet (Chain ID: {SUPPORTED_CHAINS.bscTestnet})</li>
          </ul>
          <p className="text-sm mt-4">
            Switch your network in your wallet to continue.
          </p>
        </div>
      ) : isPaused ? (
        <div className="text-center py-8">
          <p className="text-xl mb-4">Game is currently paused</p>
        </div>
      ) : (
        <>
          <AnimatePresence mode="wait">
            {showResult ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ 
                  type: "spring", 
                  stiffness: 300, 
                  damping: 20 
                }}
                className="bg-black/30 rounded-xl shadow-lg"
              >
                {gameResult ? (
                  <GameResultDisplay 
                    result={gameResult} 
                    onClose={resetGameState}
                    txHash={txHash}
                    onClaimRewards={handleClaimRewards}
                    claimTxHash={claimTxHash}
                    isClaimPending={claimingReward}
                  />
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-xl mb-4">Loading result...</p>
                    <button 
                      onClick={resetGameState}
                      className="btn btn-primary"
                    >
                      Play Again
                    </button>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="gameplay"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8"
              >
                <div className="mb-6">
                  <h3 className="text-xl mb-3">Choose your move:</h3>
                  <div className="flex justify-center gap-6">
                    <motion.button
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      whileHover={{ scale: 1.05, y: -5 }}
                      onHoverStart={() => playHover()}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        playClick();
                        setSelectedMove(0); // Rock
                      }}
                      className={`game-move-button flex flex-col items-center justify-center p-6 rounded-xl bg-gradient-to-b from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 shadow-lg hover:shadow-purple-500/20 transition-all ${
                        selectedMove === 0 ? 'ring-4 ring-purple-400 ring-opacity-50' : ''
                      }`}
                      disabled={cooldownActive || isLoading || isTransactionPending}
                    >
                      <span className="text-4xl mb-2">🪨</span>
                      <span className="font-semibold">Rock</span>
                    </motion.button>
                    <motion.button
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      whileHover={{ scale: 1.05, y: -5 }}
                      onHoverStart={() => playHover()}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        playClick();
                        setSelectedMove(1); // Paper
                      }}
                      className={`game-move-button flex flex-col items-center justify-center p-6 rounded-xl bg-gradient-to-b from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 shadow-lg hover:shadow-blue-500/20 transition-all ${
                        selectedMove === 1 ? 'ring-4 ring-blue-400 ring-opacity-50' : ''
                      }`}
                      disabled={cooldownActive || isLoading || isTransactionPending}
                    >
                      <span className="text-4xl mb-2">📄</span>
                      <span className="font-semibold">Paper</span>
                    </motion.button>
                    <motion.button
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      whileHover={{ scale: 1.05, y: -5 }}
                      onHoverStart={() => playHover()}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        playClick();
                        setSelectedMove(2); // Scissors
                      }}
                      className={`game-move-button flex flex-col items-center justify-center p-6 rounded-xl bg-gradient-to-b from-pink-600 to-pink-800 hover:from-pink-500 hover:to-pink-700 shadow-lg hover:shadow-pink-500/20 transition-all ${
                        selectedMove === 2 ? 'ring-4 ring-pink-400 ring-opacity-50' : ''
                      }`}
                      disabled={cooldownActive || isLoading || isTransactionPending}
                    >
                      <span className="text-4xl mb-2">✂️</span>
                      <span className="font-semibold">Scissors</span>
                    </motion.button>
                  </div>
                </div>
                
                <div className="mb-6">
                  <h3 className="text-xl mb-3">Select bet tier:</h3>
                  <TierSelector 
                    selectedTier={selectedTier}
                    onChange={setSelectedTier}
                    disabled={cooldownActive || isLoading || isTransactionPending}
                  />
                </div>
                
                <div className="text-center">
                  {cooldownActive && cooldownSeconds && lastPlayTimestamp ? (
                    <div className="mb-4">
                      <p className="text-yellow-400 mb-2">Cooldown active</p>
                      <Countdown 
                        endTime={Number(lastPlayTimestamp) + Number(cooldownSeconds)} 
                      />
                    </div>
                  ) : null}
                  
                  <button 
                    className={`btn ${
                      selectedMove !== null 
                        ? 'btn-accent' 
                        : 'bg-gray-600 cursor-not-allowed'
                    }`}
                    onClick={handlePlay}
                    disabled={selectedMove === null || cooldownActive || isTransactionPending || isWrongNetwork || isLoading}
                  >
                    {isLoading ? (
                      <div className="flex flex-col items-center">
                        <span className="flex items-center justify-center">
                          <span className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-white rounded-full"></span>
                          Opening wallet...
                        </span>
                        <span className="text-xs mt-1 opacity-80">This may take a moment</span>
                      </div>
                    ) : isTransactionPending ? (
                      <span className="flex items-center justify-center">
                        <span className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-white rounded-full"></span>
                        Processing on blockchain...
                      </span>
                    ) : `Play for ${getCurrentBetAmount()} ${getTokenSymbol(chainId)}`}
                  </button>
                  
                  {/* Transaction Details Panel */}
                  {showTxDetails && (isLoading || isTransactionPending || txHash) && (
                    <motion.div 
                      className="mt-6 p-4 bg-black/30 rounded-lg border border-purple-800/50"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-purple-400 font-medium">Transaction Status</h4>
                        <button 
                          onClick={() => setShowTxDetails(false)} 
                          className="text-gray-400 hover:text-white text-sm"
                        >
                          Hide
                        </button>
                      </div>
                      
                      {isLoading && !isTransactionPending && !txHash && (
                        <div className="bg-blue-900/20 p-2 rounded mb-3 text-center">
                          <p className="text-blue-300 text-sm">
                            Opening wallet to sign transaction...
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            Slow wallet? Try these steps:
                          </p>
                          <div className="text-xs text-gray-300 mt-1 flex flex-col items-start ml-4">
                            <span>1. Check if your wallet app is running</span>
                            <span>2. Restart your wallet extension/app</span>
                            <span>3. Refresh this page and try again</span>
                          </div>
                        </div>
                      )}
                      
                      <div className="max-h-40 overflow-y-auto text-left text-sm">
                        {txLog.map((log, index) => (
                          <div key={index} className={`mb-1 ${
                            log.type === 'error' ? 'text-red-400' : 
                            log.type === 'success' ? 'text-green-400' : 
                            log.type === 'warning' ? 'text-yellow-400' : 
                            'text-gray-300'
                          }`}>
                            <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
                            {log.message}
                          </div>
                        ))}
                      </div>
                      
                      {txHash && (
                        <div className="mt-3 pt-3 border-t border-gray-700 text-sm">
                          <div>
                            <span className="text-gray-400">Transaction:</span>{' '}
                            <a 
                              href={getTransactionUrl(txHash)} 
                              target="_blank"
                              rel="noopener noreferrer" 
                              className="text-blue-400 hover:underline"
                            >
                              {shortenHash(txHash)} ↗
                            </a>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                  
                  {transactionError && (
                    <p className="text-red-500 mt-2">
                      {transactionError.message?.includes("insufficient funds") 
                        ? "Insufficient funds for this bet" 
                        : transactionError.message || "Error playing game"}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {showResult && gameResult?.result === 'Win' && (
            <Particles type="win" />
          )}
          
          {showResult && gameResult?.result === 'Draw' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "radial-gradient(circle, rgba(250,204,21,0.2) 0%, rgba(0,0,0,0) 70%)"
              }}
            />
          )}
        </>
      )}
    </div>
  );
} 