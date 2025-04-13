import { ethers } from 'ethers';
import RockPaperScissorsABI from '../abis/RockPaperScissors.json';

// Contract address should be read from .env or context
const ROCK_PAPER_SCISSORS_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS;

// Enum values for moves
export const Move = {
  Rock: 0,
  Paper: 1,
  Scissors: 2
};

// Enum values for bet tiers
export const BetTier = {
  TIER_1: 0,
  TIER_2: 1,
  TIER_3: 2,
  TIER_4: 3,
  TIER_5: 4
};

// Default bet amounts in ETH (matching contract values)
export const DEFAULT_BET_AMOUNTS = {
  [BetTier.TIER_1]: "0.005",
  [BetTier.TIER_2]: "0.01",
  [BetTier.TIER_3]: "0.025",
  [BetTier.TIER_4]: "0.05",
  [BetTier.TIER_5]: "0.1",
};

/**
 * Connect to ethereum provider and return provider, signer, and contract
 */
export const connectToContract = async () => {
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed");
  }

  await window.ethereum.request({ method: 'eth_requestAccounts' });
  
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  
  if (!ROCK_PAPER_SCISSORS_ADDRESS) {
    throw new Error("Contract address not configured");
  }
  
  const contract = new ethers.Contract(
    ROCK_PAPER_SCISSORS_ADDRESS,
    RockPaperScissorsABI,
    signer
  );
  
  return { provider, signer, contract };
};

/**
 * Play the game by calling the contract
 */
export const playGame = async (tier, move) => {
  try {
    const { contract } = await connectToContract();
    
    // Get the bet amount for the selected tier
    const betAmount = await contract.tierToAmount(tier);
    
    // Play the game
    const tx = await contract.play(tier, move, {
      value: betAmount
    });
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    // Parse events to get game result
    const gamePlayedEvent = receipt.events.find(
      event => event.event === 'GamePlayed'
    );
    
    if (gamePlayedEvent) {
      const { args } = gamePlayedEvent;
      
      return {
        success: true,
        player: args.player,
        playerMove: parseInt(args.playerMove),
        aiMove: parseInt(args.aiMove),
        result: args.result,
        amount: args.amount
      };
    }
    
    throw new Error("Game event not found in transaction");
  } catch (error) {
    console.error("Error playing game:", error);
    return {
      success: false,
      error: error.message || "Unknown error occurred"
    };
  }
};

/**
 * Get player stats from the contract
 */
export const getPlayerStats = async (address) => {
  try {
    const { contract } = await connectToContract();
    
    // If no address provided, get the connected wallet address
    if (!address) {
      address = await contract.signer.getAddress();
    }
    
    const wins = await contract.playerWins(address);
    
    return {
      success: true,
      wins: wins.toNumber(),
      address
    };
  } catch (error) {
    console.error("Error getting player stats:", error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check if player has a pending reward
 */
export const checkPendingReward = async () => {
  try {
    const { contract, signer } = await connectToContract();
    const playerAddress = await signer.getAddress();
    
    const pendingReward = await contract.pendingRewards(playerAddress);
    
    return {
      success: true,
      hasReward: pendingReward.amount.gt(0),
      amount: ethers.utils.formatEther(pendingReward.amount),
      move: parseInt(pendingReward.move),
      timestamp: pendingReward.timestamp.toNumber()
    };
  } catch (error) {
    console.error("Error checking pending reward:", error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Claim pending reward
 */
export const claimReward = async () => {
  try {
    const { contract } = await connectToContract();
    
    const tx = await contract.claimReward();
    const receipt = await tx.wait();
    
    const claimEvent = receipt.events.find(
      event => event.event === 'RewardClaimed'
    );
    
    if (claimEvent) {
      const { args } = claimEvent;
      
      return {
        success: true,
        player: args.player,
        amount: ethers.utils.formatEther(args.amount)
      };
    }
    
    throw new Error("Claim event not found in transaction");
  } catch (error) {
    console.error("Error claiming reward:", error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get contract balance
 */
export const getContractBalance = async () => {
  try {
    const { provider, contract } = await connectToContract();
    
    const balance = await provider.getBalance(contract.address);
    
    return {
      success: true,
      balance: ethers.utils.formatEther(balance)
    };
  } catch (error) {
    console.error("Error getting contract balance:", error);
    return {
      success: false,
      error: error.message
    };
  }
}; 