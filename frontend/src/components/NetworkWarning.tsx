import React from 'react';
import { useAccount } from 'wagmi';
import { SUPPORTED_CHAINS } from '../utils/network';

const NetworkWarning = () => {
  const { chainId } = useAccount();
  
  // If user is not connected or is on a supported network, don't show warning
  if (!chainId || Object.values(SUPPORTED_CHAINS).includes(chainId)) {
    return null;
  }
  
  return (
    <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4 mb-6">
      <p className="text-amber-200 font-medium">
        Warning: You are not connected to a supported network. Please switch to one of:
        <ul className="list-disc list-inside mt-2 ml-4">
          <li>Monad Testnet (ID: {SUPPORTED_CHAINS.monadTestnet})</li>
          <li>Base (ID: {SUPPORTED_CHAINS.base})</li>
          <li>Base Sepolia (ID: {SUPPORTED_CHAINS.baseSepolia})</li>
          <li>Base Goerli (ID: {SUPPORTED_CHAINS.baseGoerli})</li>
          <li>BSC (ID: {SUPPORTED_CHAINS.bsc})</li>
          <li>BSC Testnet (ID: {SUPPORTED_CHAINS.bscTestnet})</li>
        </ul>
      </p>
    </div>
  );
};

export default NetworkWarning; 