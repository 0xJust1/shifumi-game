import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http, fallback } from 'viem';
import { sepolia, mainnet, base, baseGoerli, baseSepolia } from 'wagmi/chains';
import { Chain } from 'wagmi/chains';

// Define BSC networks
const bsc: Chain = {
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'BNB',
  },
  rpcUrls: {
    public: { 
      http: [
        'https://bsc-dataseed.binance.org',
        'https://bsc-dataseed1.binance.org',
        'https://bsc-dataseed2.binance.org'
      ] 
    },
    default: { 
      http: [
        'https://bsc-dataseed.binance.org',
        'https://bsc-dataseed1.binance.org',
        'https://bsc-dataseed2.binance.org'
      ] 
    },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
  testnet: false,
};

const bscTestnet: Chain = {
  id: 97,
  name: 'BSC Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'tBNB',
    symbol: 'tBNB',
  },
  rpcUrls: {
    public: { 
      http: [
        'https://data-seed-prebsc-1-s1.binance.org:8545',
        'https://data-seed-prebsc-2-s1.binance.org:8545'
      ] 
    },
    default: { 
      http: [
        'https://data-seed-prebsc-1-s1.binance.org:8545',
        'https://data-seed-prebsc-2-s1.binance.org:8545'
      ] 
    },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://testnet.bscscan.com' },
  },
  testnet: true,
};

// Define Monad Testnet as a custom chain
const monadTestnet: Chain = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    public: { 
      http: [
        'https://testnet-rpc.monad.xyz',
        'https://monad-testnet.drpc.org'
      ] 
    },
    default: { 
      http: [
        'https://testnet-rpc.monad.xyz',
        'https://monad-testnet.drpc.org'
      ] 
    },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet-explorer.monad.xyz' },
  },
  testnet: true,
};

// Get environment variables
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo';
const networkName = import.meta.env.VITE_NETWORK_NAME || 'sepolia';
const customRpcUrl = import.meta.env.VITE_RPC_URL;

// Create optimized transport for Monad
const createMonadTransport = () => {
  const alchemyUrl = import.meta.env.VITE_ALCHEMY_RPC_URL;
  return http(alchemyUrl || 'https://monad-testnet.g.alchemy.com/v2/demo');
};

// Wagmi configuration with RainbowKit
export const wagmiConfig = getDefaultConfig({
  appName: 'ShiFUmi Game',
  projectId: walletConnectProjectId,
  chains: [
    // Add all supported chains here
    monadTestnet,
    base,
    baseSepolia,
    baseGoerli,
    bsc,
    bscTestnet
  ],
  transports: {
    [sepolia.id]: http(),
    [mainnet.id]: http(),
    [base.id]: http(),
    [baseGoerli.id]: http(),
    [baseSepolia.id]: http(),
    [bsc.id]: http(),
    [bscTestnet.id]: http(),
    [monadTestnet.id]: createMonadTransport(),
  },
  // Optimizations
  ssr: true,
  syncConnectedChain: true, // Enable chain syncing
  pollingInterval: 60000,
}); 