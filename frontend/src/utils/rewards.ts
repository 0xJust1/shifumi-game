import { supabase } from './supabase';
import { formatWinningsToMON } from './format';

export interface Reward {
  id: string;
  amount: bigint;
  timestamp: number;
  status: 'pending' | 'claimed';
}

export const fetchRewards = async (
  address: string,
  limit: number,
  setIsLoading: (loading: boolean) => void,
  setLoadingProgress: (progress: number) => void,
  setDbWinnings: (winnings: bigint) => void
): Promise<Reward[]> => {
  try {
    setIsLoading(true);
    setLoadingProgress(0);

    // First try to get player's total winnings from player_stats as fallback
    try {
      const { data: playerStats, error: statsError } = await supabase
        .from('player_stats')
        .select('total_winnings')
        .eq('address', address)
        .single();
        
      if (!statsError && playerStats && playerStats.total_winnings) {
        const totalWinnings = BigInt(playerStats.total_winnings);
        console.log(`Found total winnings in player_stats: ${totalWinnings.toString()}`);
        setDbWinnings(totalWinnings);
      }
    } catch (statsError) {
      console.log('Could not fetch player stats:', statsError);
    }

    // Attempt to fetch rewards from Supabase
    const { data: rewards, error } = await supabase
      .from('rewards')
      .select('*')
      .eq('address', address)
      .order('timestamp', { ascending: false })
      .limit(limit);

    // Handle case where rewards table doesn't exist (404) or other errors
    if (error) {
      console.error('Error fetching rewards:', error);
      
      if (error.code === '42P01' || // PostgreSQL table doesn't exist
         (error.message && error.message.includes('does not exist'))) {
        console.warn('Rewards table does not exist yet. Creating empty result.');
        setLoadingProgress(100);
        return [];
      }
      
      throw error; // Rethrow other errors
    }

    // Calculate total winnings from rewards
    const totalWinnings = rewards.reduce((acc, reward) => {
      return acc + BigInt(reward.amount);
    }, BigInt(0));

    setDbWinnings(totalWinnings);
    setLoadingProgress(100);

    return rewards.map(reward => ({
      id: reward.id,
      amount: BigInt(reward.amount),
      timestamp: reward.timestamp,
      status: reward.status
    }));
  } catch (error) {
    console.error('Error in fetchRewards:', error);
    // Don't throw, just return empty array
    setLoadingProgress(100);
    return [];
  } finally {
    setIsLoading(false);
  }
}; 