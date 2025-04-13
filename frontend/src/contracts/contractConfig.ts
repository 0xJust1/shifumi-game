import { ethers } from 'ethers';
import abiJson from './abi/RockPaperScissors.json';

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

// Format d'ABI compatible avec wagmi/viem
export const CONTRACT_ABI_WAGMI = [
  {
    name: "tierToAmount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    name: "lastPlayTimestamp",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "timestamp", type: "uint256" }],
  },
  {
    name: "playerTotalWins",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "wins", type: "uint256" }],
  },
  {
    name: "gameCommitments",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "playerCommitment", type: "bytes32" },
      { name: "contractCommitment", type: "bytes32" },
      { name: "betAmount", type: "uint256" },
      { name: "tier", type: "uint8" },
      { name: "timestamp", type: "uint256" },
      { name: "state", type: "uint8" },
      { name: "contractMove", type: "uint8" }
    ],
  },
  {
    name: "commitMove",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "moveHash", type: "bytes32" },
      { name: "tier", type: "uint8" }
    ],
    outputs: [],
  },
  {
    name: "revealMove",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "playerMove", type: "uint8" },
      { name: "salt", type: "bytes32" }
    ],
    outputs: [],
  },
  {
    name: "verifyContractMove",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "player", type: "address" },
      { name: "claimedMove", type: "uint8" },
      { name: "timestamp", type: "uint256" }
    ],
    outputs: [{ name: "isValid", type: "bool" }],
  },
  {
    name: "play",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "tier", type: "uint8" },
      { name: "playerMove", type: "uint8" }
    ],
    outputs: [],
  },
  {
    name: "isPaused",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "paused", type: "bool" }],
  },
  {
    name: "COOLDOWN",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "seconds", type: "uint256" }],
  },
  {
    name: "REVEAL_EXPIRATION",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "seconds", type: "uint256" }],
  },
  {
    name: "pendingRewards",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "player", type: "address" },
      { name: "index", type: "uint256" }
    ],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "claimed", type: "bool" }
    ],
  },
  {
    name: "claimReward",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [],
  },
  {
    name: "claimAllRewards",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "getPendingRewardCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "count", type: "uint256" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "ownerAddress", type: "address" }],
  },
  {
    name: "withdrawCreatorFees",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "setPaused",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_paused", type: "bool" }],
    outputs: [],
  },
  {
    name: "getGameBank",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "creatorFees",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "fees", type: "uint256" }],
  },
  {
    name: "CommitMade",
    type: "event",
    anonymous: false,
    inputs: [
      { indexed: true, name: "player", type: "address" },
      { indexed: false, name: "contractCommitment", type: "bytes32" }
    ],
  },
  {
    name: "GamePlayed",
    type: "event",
    anonymous: false,
    inputs: [
      { indexed: true, name: "player", type: "address" },
      { indexed: false, name: "playerMove", type: "uint8" },
      { indexed: false, name: "contractMove", type: "uint8" },
      { indexed: false, name: "result", type: "string" },
      { indexed: false, name: "netWin", type: "uint256" },
      { indexed: false, name: "proofHash", type: "bytes32" }
    ],
  },
  {
    name: "RewardClaimed",
    type: "event",
    anonymous: false,
    inputs: [
      { indexed: true, name: "player", type: "address" },
      { indexed: false, name: "index", type: "uint256" },
      { indexed: false, name: "amount", type: "uint256" }
    ],
  },
  {
    name: "CreatorFeesWithdrawn",
    type: "event",
    anonymous: false,
    inputs: [
      { indexed: false, name: "amount", type: "uint256" }
    ],
  },
  {
    name: "Paused",
    type: "event",
    anonymous: false,
    inputs: [
      { indexed: false, name: "status", type: "bool" }
    ],
  },
  {
    name: "playGame",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "playerMove", type: "uint8" },
      { name: "tier", type: "uint8" }
    ],
    outputs: [],
  },
  {
    name: "verifyGameProof",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "proofHash", type: "bytes32" }
    ],
    outputs: [
      { name: "isValid", type: "bool" },
      { name: "details", type: "string" }
    ],
  },
  {
    name: "getGameDetails",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "proofHash", type: "bytes32" }
    ],
    outputs: [
      { name: "blockNumber", type: "uint256" },
      { name: "timestamp", type: "uint256" },
      { name: "player", type: "address" },
      { name: "playerMove", type: "uint8" },
      { name: "contractMove", type: "uint8" },
      { name: "playerWon", type: "bool" }
    ],
  },
  {
    name: "emergencyWithdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "setUpgradeEnabled",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "enabled", type: "bool" }],
    outputs: [],
  },
  {
    name: "updateImplementation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "newImplementation", type: "address" }],
    outputs: [],
  },
  {
    name: "implementation",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "currentImplementation", type: "address" }],
  },
  {
    name: "upgradeEnabled",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "isEnabled", type: "bool" }],
  },
  {
    name: "EmergencyWithdrawal",
    type: "event",
    anonymous: false,
    inputs: [
      { indexed: true, name: "receiver", type: "address" },
      { indexed: false, name: "amount", type: "uint256" }
    ],
  },
  {
    name: "ImplementationUpdated",
    type: "event",
    anonymous: false,
    inputs: [
      { indexed: true, name: "oldImpl", type: "address" },
      { indexed: true, name: "newImpl", type: "address" }
    ],
  },
  {
    name: "UpgradeStatusChanged",
    type: "event",
    anonymous: false,
    inputs: [
      { indexed: false, name: "enabled", type: "bool" }
    ],
  },
  {
    name: "getContractBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "addFunds",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    name: "setTierAmount",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tier", type: "uint8" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [],
  },
  {
    name: "syncGameBank",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "GameBankSynced",
    type: "event",
    anonymous: false,
    inputs: [
      { indexed: false, name: "newAmount", type: "uint256" }
    ],
  },
  {
    name: "getPlayerWinnings",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "winnings", type: "uint256" }],
  },
];

// Utilisez l'ABI mis à jour au lieu de celui importé du fichier JSON
export const CONTRACT_ABI = CONTRACT_ABI_WAGMI;

// Définition de l'énumération avec des valeurs explicites
export enum Move {
  Rock = 0,
  Paper = 1,
  Scissors = 2
}

// Ajout d'un tableau pour faciliter la conversion
export const MOVES = [Move.Rock, Move.Paper, Move.Scissors];

// Conversion de nombre en Move
export function numberToMove(value: number): Move {
  if (value === 0) return Move.Rock;
  if (value === 1) return Move.Paper;
  if (value === 2) return Move.Scissors;
  throw new Error(`Invalid move value: ${value}`);
}

export enum BetTier {
  TIER_1 = 0,
  TIER_2 = 1,
  TIER_3 = 2,
  TIER_4 = 3,
  TIER_5 = 4
}

export enum GameState {
  None = 0,
  Played = 1
}

export interface PendingReward {
  amount: bigint;
  claimed: boolean;
  index: number;
  error?: boolean;
}

export interface GameResult {
  player: Move;
  ai: Move;
  result: string;
  netWin: bigint;
  proofHash?: `0x${string}`;
}

// Add interface for GameProof
export interface GameProof {
  blockNumber: bigint;
  timestamp: bigint;
  blockHash: `0x${string}`;
  randomnessProof: `0x${string}`;
  contractMove: Move;
  playerMove: Move;
  player: `0x${string}`;
}

export interface GameCommitment {
  playerCommitment: `0x${string}`;
  contractCommitment: `0x${string}`;
  betAmount: bigint;
  tier: number;
  timestamp: bigint;
  state: number;
  contractMove: number;
}

export interface PlayerStats {
  lastPlayTime: bigint;
  totalWins: bigint;
}

export const MOVE_NAMES = {
  [Move.Rock]: "Rock",
  [Move.Paper]: "Paper",
  [Move.Scissors]: "Scissors"
};

// Add contractConfig export for wagmi
export const contractConfig = {
  address: CONTRACT_ADDRESS as `0x${string}`,
  abi: CONTRACT_ABI_WAGMI,
  functionName: 'getPlayerWinnings',
  args: ['0x0'] as [`0x${string}`],
} as const; 