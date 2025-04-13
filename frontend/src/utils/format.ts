import { formatEther } from 'viem';
import { getTokenSymbol } from './network';

export const formatWinningsToMON = (winnings: string | bigint, chainId?: number): string => {
  if (!winnings) return '0';
  
  // Convert to bigint if it's a string
  const amount = typeof winnings === 'string' ? BigInt(winnings) : winnings;
  
  console.log(`Formatting winnings: ${amount.toString()}`);
  
  // Convert from wei to MON (18 decimals)
  const decimalWinnings = Number(amount) / 10**18;
  
  // Format with 2 decimal places
  return decimalWinnings.toFixed(2);
};

export function formatWinningsToMONOld(amount: string | bigint, chainId?: number): string {
  if (!amount || amount === '0' || amount === BigInt(0)) return `0.0000 ${getTokenSymbol(chainId)}`;
  
  try {
    // Convert to string if it's a bigint
    const amountStr = typeof amount === 'bigint' ? amount.toString() : amount;
    
    // Log the raw value for debugging
    console.log(`formatWinningsToMON: Raw value: ${amountStr}`);
    
    // Format the value in MON with proper decimal places
    const formatted = formatEther(BigInt(amountStr));
    const numValue = parseFloat(formatted);
    
    // Format to a reasonable number of decimal places
    return `${numValue.toFixed(4)} ${getTokenSymbol(chainId)}`;
  } catch (error) {
    console.error('Error formatting winnings:', error, amount);
    
    // Attempt to recover from formatting error
    try {
      // If the value is a very large number, try to handle it differently
      if (amount) {
        const rawValue = amount.toString();
        // If the value has 18 or more digits, assume it's in wei and manually convert
        if (rawValue.length >= 18) {
          const etherValue = Number(rawValue) / 1e18;
          return `${etherValue.toFixed(4)} ${getTokenSymbol(chainId)}`;
        }
      }
    } catch (secondError) {
      console.error('Second error in winnings formatting:', secondError);
    }
    
    return `0.0000 ${getTokenSymbol(chainId)}`;
  }
} 