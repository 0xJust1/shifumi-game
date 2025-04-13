// Network configuration
export const SUPPORTED_CHAINS = {
  monadTestnet: 10143,
  base: 8453,
  baseSepolia: 84532,
  baseGoerli: 84531,
  bsc: 56,
  bscTestnet: 97
};

// Get token symbol based on chain ID
export const getTokenSymbol = (chainId?: number) => {
  if (!chainId) return "ETH"; // Default to ETH

  // BSC Networks
  if (chainId === SUPPORTED_CHAINS.bsc || chainId === SUPPORTED_CHAINS.bscTestnet) {
    return "BNB";
  }
  
  // Monad Network
  if (chainId === SUPPORTED_CHAINS.monadTestnet) {
    return "MON";
  }
  
  // Base and other EVM networks
  return "ETH";
};

// Get explorer URL based on chain ID and hash
export const getExplorerUrl = (chainId: number, hash: string, type: 'tx' | 'address' = 'tx') => {
  // BSC Networks
  if (chainId === SUPPORTED_CHAINS.bsc) {
    return `https://bscscan.com/${type}/${hash}`;
  }
  if (chainId === SUPPORTED_CHAINS.bscTestnet) {
    return `https://testnet.bscscan.com/${type}/${hash}`;
  }
  
  // Monad Network
  if (chainId === SUPPORTED_CHAINS.monadTestnet) {
    return `https://testnet.monadexplorer.com/${type}/${hash}`;
  }
  
  // Base Networks
  if (chainId === SUPPORTED_CHAINS.base) {
    return `https://basescan.org/${type}/${hash}`;
  }
  if (chainId === SUPPORTED_CHAINS.baseSepolia) {
    return `https://sepolia.basescan.org/${type}/${hash}`;
  }
  if (chainId === SUPPORTED_CHAINS.baseGoerli) {
    return `https://goerli.basescan.org/${type}/${hash}`;
  }
  
  // Default to Ethereum
  return `https://etherscan.io/${type}/${hash}`;
};

// Rate limiting utility for RPC calls
export const withRateLimit = async <T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    retryOnError?: (error: any) => boolean;
  } = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 5000,
    retryOnError = (error) => 
      error instanceof Error && 
      (error.toString().includes('requests limited') || 
       error.toString().includes('429') ||
       error.toString().includes('rate limit'))
  } = options;

  let lastError: any;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this error
      if (!retryOnError(error)) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      console.log(`Rate limit hit, waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}...`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError;
}; 