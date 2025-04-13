import React from 'react';
import { motion } from 'framer-motion';
import { BetTier } from '../contracts/contractConfig';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import { getTokenSymbol } from '../utils/network';

interface TierSelectorProps {
  selectedTier: BetTier;
  onChange: (tier: BetTier) => void;
  disabled?: boolean;
}

const TierSelector: React.FC<TierSelectorProps> = ({ selectedTier, onChange, disabled }) => {
  const { chainId } = useAccount();
  
  // Default bet amounts for each tier with dynamic token symbol
  const DEFAULT_BET_TEXTS = {
    [BetTier.TIER_1]: `0.005 ${getTokenSymbol(chainId)}`,
    [BetTier.TIER_2]: `0.01 ${getTokenSymbol(chainId)}`,
    [BetTier.TIER_3]: `0.025 ${getTokenSymbol(chainId)}`,
    [BetTier.TIER_4]: `0.05 ${getTokenSymbol(chainId)}`,
    [BetTier.TIER_5]: `0.1 ${getTokenSymbol(chainId)}`
  };

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
      {Object.values(BetTier)
        .filter(tier => !isNaN(Number(tier)))
        .map(tier => (
          <motion.button
            key={tier}
            className={`p-3 rounded-md text-center ${
              selectedTier === Number(tier) 
                ? 'bg-accent text-white' 
                : 'bg-base-200 hover:bg-base-300'
            }`}
            whileHover={{ scale: disabled ? 1 : 1.05 }}
            whileTap={{ scale: disabled ? 1 : 0.95 }}
            onClick={() => !disabled && onChange(Number(tier) as BetTier)}
            disabled={disabled}
          >
            {DEFAULT_BET_TEXTS[tier as BetTier]}
          </motion.button>
        ))}
    </div>
  );
};

export default TierSelector; 