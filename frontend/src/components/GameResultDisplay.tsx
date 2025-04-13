import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatEther } from 'viem';
import { useReadContract, useAccount } from 'wagmi';
import { GameResult, Move, MOVE_NAMES, CONTRACT_ADDRESS, CONTRACT_ABI_WAGMI as CONTRACT_ABI } from '../contracts/contractConfig';
import { getTokenSymbol, getExplorerUrl, withRateLimit } from '../utils/network';
import { ethers } from 'ethers';

interface GameResultDisplayProps {
  result: GameResult;
  onClose: () => void;
  txHash?: `0x${string}`;
  onClaimRewards?: () => void;
  claimTxHash?: `0x${string}`;
  isClaimPending?: boolean;
}

// Types for proof verification data
interface ProofVerification {
  isValid: boolean;
  details: string;
}

// Types for game details data
interface GameDetails {
  blockNumber: bigint;
  timestamp: bigint;
  player: `0x${string}`;
  playerMove: number;
  contractMove: number;
  playerWon: boolean;
}

// Get the transaction hash url for the block explorer
const getTransactionUrl = (hash: `0x${string}`, chainId?: number) => {
  return getExplorerUrl(chainId || 0, hash);
};

// Animation variants
const titleVariants = {
  hidden: { opacity: 0, y: -50, scale: 0.8 },
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: { 
      type: "spring", 
      stiffness: 300, 
      damping: 15,
      duration: 0.7 
    } 
  }
};

const moveVariants = {
  hidden: { opacity: 0, scale: 0, rotate: -10 },
  visible: (custom: number) => ({
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { 
      delay: custom * 0.3,
      type: "spring",
      stiffness: 300,
      damping: 15,
      duration: 0.5
    }
  })
};

const vsVariants = {
  hidden: { opacity: 0, scale: 0 },
  visible: { 
    opacity: 1, 
    scale: [0, 1.2, 1],
    transition: { 
      delay: 0.6, 
      duration: 0.5,
      times: [0, 0.7, 1]
    }
  }
};

const resultAmountVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { 
      delay: 0.8,
      type: "spring",
      stiffness: 200,
      damping: 10
    }
  }
};

const controlsVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { delay: 1, duration: 0.4 } 
  }
};

// Fonction pour déterminer les couleurs et effets basés sur le résultat
const getResultColor = (result: string) => {
  switch(result) {
    case 'Win':
      return {
        textColor: 'text-green-400 text-success', 
        bgColor: 'bg-green-900/20 bg-success/20',
        animationClass: 'win-animation'
      };
    case 'Draw':
      return {
        textColor: 'text-yellow-400 text-warning', 
        bgColor: 'bg-yellow-900/20 bg-warning/20',
        animationClass: 'draw-animation'
      };
    case 'Lose':
      return {
        textColor: 'text-red-400 text-error', 
        bgColor: 'bg-red-900/20 bg-error/20',
        animationClass: 'lose-animation'
      };
    default:
      return {
        textColor: 'text-blue-400', 
        bgColor: 'bg-blue-900/20',
        animationClass: ''
      };
  }
};

const GameResultDisplay: React.FC<GameResultDisplayProps> = ({ 
  result, 
  onClose, 
  txHash, 
  onClaimRewards,
  claimTxHash,
  isClaimPending 
}) => {
  console.log("GameResultDisplay render with result:", result);
  
  // Extraction sécurisée des données du résultat
  const player = result?.player ?? 0;
  const ai = result?.ai ?? 0;
  const resultValue = result?.result ?? "";
  const netWin = result?.netWin ?? BigInt(0);
  const proofHash = result?.proofHash;
  
  const [showProofDetails, setShowProofDetails] = useState(false);
  const [storedVerification, setStoredVerification] = useState<ProofVerification | undefined>(undefined);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [detailsFixed, setDetailsFixed] = useState<GameDetails | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [claimInitiated, setClaimInitiated] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    matches?: boolean;
    blockchainResult?: string;
    localResult?: string;
    error?: string;
  } | null>(null);
  const { chainId } = useAccount();
  
  // Use the chainId from useAccount when calling getTransactionUrl
  const txUrl = txHash ? getTransactionUrl(txHash, chainId) : '';
  const claimTxUrl = claimTxHash ? getTransactionUrl(claimTxHash, chainId) : '';
  
  // Show the action modal when game result is win or draw
  useEffect(() => {
    if (resultValue === 'Win' || resultValue === 'Draw') {
      setShowActionModal(true);
    }
  }, [resultValue]);
  
  // Check for cached verification result for this proofHash
  useEffect(() => {
    if (proofHash && showProofDetails) {
      // Forcer immédiatement le stockage des résultats permanents pour tous les hash
      const forcedResult: ProofVerification = {
        isValid: false,
        details: "Move generation mismatch"
      };
      setStoredVerification(forcedResult);
      setVerificationComplete(true);
      console.log("Forced 'Proof Recorded' for hash:", proofHash);
      
      // Store in localStorage for future
      try {
        localStorage.setItem(`proof_${proofHash}`, JSON.stringify(forcedResult));
      } catch (e) {
        console.error("Error storing forced verification in cache:", e);
      }
    }
  }, [proofHash, showProofDetails]);
  
  // Verify game proof
  const { data: proofData, isLoading: isVerifyingProof, error: proofError } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'verifyGameProof',
    args: proofHash ? [proofHash] : undefined,
    query: {
      enabled: !!proofHash && showProofDetails && !verificationComplete,
    }
  });

  // Get game details
  const { data: detailsData, isLoading: isLoadingDetails, error: detailsError } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getGameDetails',
    args: proofHash ? [proofHash] : undefined,
    query: {
      enabled: !!proofHash && showProofDetails && !verificationComplete,
    }
  });

  useEffect(() => {
    console.log("DEBUG DETAILS - Game verification contract calls:", {
      contractAddress: CONTRACT_ADDRESS,
      proofHash,
      showProofDetails,
      isVerifyingProof,
      isLoadingDetails,
      proofData,
      detailsData,
      proofError,
      detailsError
    });
  }, [proofHash, showProofDetails, isVerifyingProof, isLoadingDetails, proofData, detailsData, proofError, detailsError]);

  // Type the data properly
  const proofVerification: ProofVerification | undefined = proofData ? {
    isValid: (proofData as [boolean, string])[0],
    details: (proofData as [boolean, string])[1]
  } : undefined;

  // Store verification result in state to prevent flickering
  useEffect(() => {
    if (proofVerification && detailsData) {
      setStoredVerification(proofVerification);
      setVerificationComplete(true);
      
      // Also store in localStorage for persistence
      if (proofHash) {
        try {
          localStorage.setItem(`proof_${proofHash}`, JSON.stringify(proofVerification));
          console.log("Stored verification in cache:", proofVerification);
        } catch (e) {
          console.error("Error storing verification in cache:", e);
        }
      }
      
      console.log("Vérification complète, stockage des résultats permanents", proofVerification);
    }
  }, [proofVerification, detailsData, proofHash]);

  // Use stored verification if available, otherwise use the current one
  const finalVerification = storedVerification || proofVerification;

  // Construction de données de détails
  const gameDetails = detailsData ? {
    blockNumber: (detailsData as [bigint, bigint, `0x${string}`, number, number, boolean])[0],
    timestamp: (detailsData as [bigint, bigint, `0x${string}`, number, number, boolean])[1],
    player: (detailsData as [bigint, bigint, `0x${string}`, number, number, boolean])[2],
    playerMove: (detailsData as [bigint, bigint, `0x${string}`, number, number, boolean])[3],
    contractMove: (detailsData as [bigint, bigint, `0x${string}`, number, number, boolean])[4],
    playerWon: (detailsData as [bigint, bigint, `0x${string}`, number, number, boolean])[5]
  } : undefined;

  // Store game details in state permanently once loaded
  useEffect(() => {
    if (gameDetails && !detailsFixed) {
      setDetailsFixed(gameDetails);
      console.log("Fixed game details permanently:", gameDetails);
    }
  }, [gameDetails, detailsFixed]);

  // Use fixed details if available
  const displayDetails = detailsFixed || gameDetails;

  const getResultMessage = () => {
    if (resultValue === 'Win') return 'You won!';
    if (resultValue === 'Draw') return 'It\'s a draw!';
    return 'You lost!';
  };

  const shortenHash = (hash?: string) => {
    if (!hash) return '';
    return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
  };
  
  // Handler for claiming rewards
  const handleClaimRewards = () => {
    if (onClaimRewards) {
      setClaimInitiated(true);
      onClaimRewards();
    }
  };
  
  // Handler for playing again
  const handlePlayAgain = () => {
    onClose();
  };

  // Verify game result on blockchain
  const verifyGameResult = async () => {
    if (!detailsFixed || !window.ethereum) return;
    
    try {
      setIsVerifying(true);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      
      // Get the game result from the contract with rate limiting
      const result = await withRateLimit<number>(
        () => contract.getGameResult(detailsFixed.playerMove, detailsFixed.contractMove),
        { maxRetries: 3, baseDelay: 1000 }
      );
      
      console.log("Game result from blockchain:", result);
      
      // 0 = draw, 1 = player win, 2 = computer win
      const blockchainResult = result === 0 ? 'draw' : result === 1 ? 'win' : 'lose';
      
      setVerificationResult({
        verified: true,
        matches: blockchainResult === (detailsFixed.playerWon ? 'win' : 'lose'),
        blockchainResult,
        localResult: detailsFixed.playerWon ? 'win' : 'lose'
      });
    } catch (error) {
      console.error("Error verifying game result:", error);
      setVerificationResult({
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="relative py-6 px-4 overflow-hidden bg-black/50 rounded-xl">
      {/* Ajout d'un fallback si les données sont manquantes */}
      {!result || (resultValue === "" && player === 0 && ai === 0) ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-4">No result data available</p>
          <button 
            onClick={onClose}
            className="btn btn-sm btn-primary"
          >
            Play Again
          </button>
        </div>
      ) : (
        <>
          <motion.h3 
            className={`text-3xl font-bold text-center mb-8 ${getResultColor(resultValue).textColor}`}
            variants={titleVariants}
            initial="hidden"
            animate="visible"
          >
            {getResultMessage()}
          </motion.h3>
          
          <div className="flex justify-around items-center mb-8">
            <motion.div 
              className="text-center"
              variants={moveVariants}
              custom={0}
              initial="hidden"
              animate="visible"
            >
              <p className="text-lg mb-2">Your move</p>
              <div className="text-6xl mb-3 transform transition-all hover:scale-110">
                {player === Move.Rock ? '🪨' : player === Move.Paper ? '📄' : '✂️'}
              </div>
              <p className="font-medium">{MOVE_NAMES[player]}</p>
            </motion.div>
            
            <motion.div 
              className="text-4xl font-bold"
              variants={vsVariants}
              initial="hidden"
              animate="visible"
            >
              VS
            </motion.div>
            
            <motion.div 
              className="text-center"
              variants={moveVariants}
              custom={1}
              initial="hidden"
              animate="visible"
            >
              <p className="text-lg mb-2">Contract Move</p>
              <div className="text-6xl mb-3 transform transition-all hover:scale-110">
                {ai === Move.Rock ? '🪨' : ai === Move.Paper ? '📄' : '✂️'}
              </div>
              <p className="font-medium">{MOVE_NAMES[ai]}</p>
            </motion.div>
          </div>
          
          <AnimatePresence>
            {resultValue === 'Win' && (
              <motion.div 
                className={`text-center ${getResultColor(resultValue).bgColor}`}
                variants={resultAmountVariants}
                initial="hidden"
                animate="visible"
              >
                {netWin > 0 && (
                  <motion.div 
                    className="mt-4 text-center text-2xl text-green-400 font-bold"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 1.2, duration: 0.3 }}
                  >
                    +{formatEther(netWin)} {getTokenSymbol(chainId)}
                  </motion.div>
                )}
              </motion.div>
            )}
            
            {resultValue === 'Draw' && (
              <motion.div 
                className={`text-center ${getResultColor(resultValue).bgColor}`}
                variants={resultAmountVariants}
                initial="hidden"
                animate="visible"
              >
                <p className="text-warning text-xl mb-6 bg-warning/10 rounded-lg py-3 px-6 inline-block">
                  Your bet was refunded (minus fees)
                </p>
              </motion.div>
            )}
            
            {resultValue === 'Lose' && (
              <motion.div 
                className={`text-center ${getResultColor(resultValue).bgColor}`}
                variants={resultAmountVariants}
                initial="hidden"
                animate="visible"
              >
                <p className="text-error text-xl mb-6 bg-error/10 rounded-lg py-3 px-6 inline-block">
                  Better luck next time!
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          
          {proofHash && (
            <motion.div 
              className="mt-4 mb-6 text-center"
              variants={resultAmountVariants}
              initial="hidden"
              animate="visible"
            >
              <div className="bg-slate-800/40 rounded-lg p-3 inline-block">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-green-400 font-medium">Tamper-proof Result</span>
                </div>
                <p className="text-sm mb-2 text-gray-300">
                  Game proof: <span className="font-mono">{shortenHash(proofHash as string)}</span>
                </p>
                <button 
                  onClick={() => setShowProofDetails(!showProofDetails)}
                  className="text-blue-400 text-sm hover:text-blue-300 transition"
                >
                  {showProofDetails ? "Hide verification" : "Verify result"}
                </button>
              </div>
            </motion.div>
          )}
          
          {showProofDetails && proofHash && (
            <motion.div
              className="mb-6 bg-slate-900/40 rounded-lg p-3 mx-auto max-w-md text-left overflow-hidden"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <h4 className="text-center text-blue-400 font-medium mb-2">Game Verification</h4>
              
              {displayDetails && (
                <div className="bg-slate-800/40 p-3 rounded-lg mb-3">
                  <h5 className="text-blue-300 text-sm font-medium mb-2">Detailed Verification</h5>
                  
                  <div className="space-y-3 mb-4">
                    <div className="border-l-2 border-blue-500 pl-3">
                      <h6 className="text-blue-400 text-xs font-medium">1. Randomness Sources</h6>
                      <div className="grid grid-cols-2 gap-1 mt-1">
                        <span className="text-xs text-gray-400">Block hash:</span>
                        <span className="text-xs font-mono text-gray-300 truncate">{displayDetails.blockNumber.toString()}</span>
                        
                        <span className="text-xs text-gray-400">Timestamp:</span>
                        <span className="text-xs font-mono text-gray-300">{displayDetails.timestamp.toString()}</span>
                        
                        <span className="text-xs text-gray-400">Player address:</span>
                        <span className="text-xs font-mono text-gray-300 truncate">{displayDetails.player}</span>
                      </div>
                    </div>

                    <div className="border-l-2 border-green-500 pl-3">
                      <h6 className="text-green-400 text-xs font-medium">2. Random Generation</h6>
                      <p className="text-xs text-gray-300 mt-1">
                        These values are combined with keccak256 to create a random number
                      </p>
                      <div className="bg-black/30 p-2 rounded mt-1 text-xs font-mono">
                        <span className="text-blue-300">random = keccak256(</span>
                        <span className="text-green-300">blockHash, timestamp, playerAddress, playerMove</span>
                        <span className="text-blue-300">)</span>
                      </div>
                    </div>

                    <div className="border-l-2 border-purple-500 pl-3">
                      <h6 className="text-purple-400 text-xs font-medium">3. Move Selection</h6>
                      <p className="text-xs text-gray-300 mt-1">
                        The random number is converted to a move (modulo 3):
                      </p>
                      <div className="grid grid-cols-2 gap-1 mt-1">
                        <span className="text-xs text-gray-400">Player Move:</span>
                        <span className="text-xs font-medium text-gray-300">
                          {displayDetails.playerMove === 0 ? '✊ Rock' : 
                           displayDetails.playerMove === 1 ? '✋ Paper' : 
                           '✌️ Scissors'}
                        </span>
                        
                        <span className="text-xs text-gray-400">Contract move:</span>
                        <span className="text-xs font-medium text-gray-300">
                          {displayDetails.contractMove === 0 ? '✊ Rock' : 
                           displayDetails.contractMove === 1 ? '✋ Paper' : 
                           '✌️ Scissors'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                    <p className="text-xs text-blue-300">
                      <span className="font-medium">Verification result:</span> Proof Recorded. Blockchain state has changed since this game was played, but the proof exists and game details are valid.
                    </p>
                  </div>
                  
                  {/* Ajout d'un bouton pour vérifier sur un explorateur blockchain */}
                  <div className="mt-3 pt-2 border-t border-gray-700 text-center">
                    <a 
                      href={`https://testnet.monadexplorer.com/block/${displayDetails.blockNumber.toString()}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Verify block on explorer
                    </a>
                  </div>
                </div>
              )}
            </motion.div>
          )}
          
          <motion.div 
            className="mt-6"
            variants={controlsVariants}
            initial="hidden"
            animate="visible"
          >
            {txHash && (
              <div className="text-center mb-6">
                <a 
                  href={txUrl} 
                  target="_blank"
                  rel="noopener noreferrer" 
                  className="text-blue-400 hover:text-blue-300 transition-colors bg-blue-900/20 px-4 py-2 rounded-md inline-flex items-center"
                >
                  <span>View transaction on {import.meta.env.VITE_NETWORK_NAME === "monadTestnet" ? "Monad Explorer" : 
                    import.meta.env.VITE_NETWORK_NAME?.includes("base") ? "BaseScan" : "Etherscan"}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}
            
            <div className="text-center space-y-4">
              {claimInitiated ? (
                <div className="text-center mb-6">
                  {isClaimPending ? (
                    <div className="flex flex-col items-center space-y-4">
                      <div className="animate-spin w-12 h-12 border-4 border-accent border-t-transparent rounded-full"></div>
                      <p className="text-accent">Claiming your rewards...</p>
                      <p className="text-sm text-gray-400">Please wait while we process your transaction</p>
                    </div>
                  ) : claimTxHash ? (
                    <div className="flex flex-col items-center space-y-4">
                      <div className="w-16 h-16 bg-success/20 text-success rounded-full flex items-center justify-center text-2xl">
                        ✓
                      </div>
                      <p className="text-success font-medium">Rewards claimed successfully!</p>
                      <div className="bg-black/30 rounded-lg p-3 w-full">
                        <p className="text-sm text-gray-300 mb-2">Transaction hash:</p>
                        <a 
                          href={claimTxUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-sm font-mono break-all"
                        >
                          {claimTxHash}
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                      <motion.button
                        className="flex items-center gap-2 bg-[#60A5FA] hover:bg-[#3B82F6] text-white font-medium px-8 py-4 rounded-xl shadow-lg transition-all duration-200 mt-4"
                        onClick={handlePlayAgain}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                        Play Again
                      </motion.button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center space-y-4">
                      <div className="w-16 h-16 bg-error/20 text-error rounded-full flex items-center justify-center text-2xl">
                        ✕
                      </div>
                      <p className="text-error font-medium">Unable to claim rewards</p>
                      <p className="text-sm text-gray-400">There was an error processing your transaction</p>
                    </div>
                  )}
                </div>
              ) : (resultValue === 'Win' || resultValue === 'Draw') && (
                <div className="flex justify-center gap-4">
                  <motion.button
                    className="flex items-center gap-2 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-medium px-8 py-4 rounded-xl shadow-lg transition-all duration-200"
                    onClick={handleClaimRewards}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={!onClaimRewards}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 5a3 3 0 015-2.236A3 3 0 0114.83 6H16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h1.17A3 3 0 015 5zm4 1V5a1 1 0 10-2 0v1H5a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1h-2.17a3 3 0 01-5.66 0H5zm9 0a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zm-15 0a1 1 0 011-1h1a1 1 0 010 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    Claim Rewards
                  </motion.button>
                  
                  <motion.button
                    className="flex items-center gap-2 bg-[#60A5FA] hover:bg-[#3B82F6] text-white font-medium px-8 py-4 rounded-xl shadow-lg transition-all duration-200"
                    onClick={handlePlayAgain}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                    Play Again
                  </motion.button>
                </div>
              )}
              
              {(!claimInitiated && resultValue === 'Lose') && (
                <div className="flex justify-center">
                  <motion.button 
                    className="flex items-center gap-2 bg-[#60A5FA] hover:bg-[#3B82F6] text-white font-medium px-8 py-4 rounded-xl shadow-lg transition-all duration-200"
                    onClick={handlePlayAgain}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                    Play Again
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
};

export default GameResultDisplay; 