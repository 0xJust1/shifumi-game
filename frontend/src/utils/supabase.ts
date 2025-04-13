import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  },
  // Use schema option to avoid conflicts with ad blockers
  db: {
    schema: 'public'
  }
});

// Types
export interface PlayerStats {
  id: number;
  address: string;
  wins: number;
  losses: number;
  draws: number;
  total_games: number;
  total_winnings: string;
  last_play_time: string | null;
  created_at: string;
  updated_at: string;
  last_move?: string;
  last_opponent_move?: string;
  last_result?: 'win' | 'loss' | 'draw';
}

// Utility functions
export const getPlayerStats = async (address: string) => {
  try {
    const { data, error } = await supabase
      .from('player_stats')
      .select('*')
      .eq('address', address)
      .single();
      
    if (error) {
      console.error('Error getting player stats:', error);
      return null;
    }
    
    console.log('Got player stats from database:', data);
    return data;
  } catch (error) {
    console.error('Error in getPlayerStats:', error);
    return null;
  }
};

export async function updatePlayerStats(
  address: string,
  stats: Partial<Omit<PlayerStats, 'id' | 'address' | 'created_at' | 'updated_at'>>
): Promise<PlayerStats | null> {
  // First try to update existing record
  const { data: existingData, error: existingError } = await supabase
    .from('player_stats')
    .select('id')
    .eq('address', address)
    .single();

  if (existingError && existingError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
    console.error('Error checking existing player stats:', existingError);
    return null;
  }

  if (existingData) {
    // Update existing record
    const { data, error } = await supabase
      .from('player_stats')
      .update({
        ...stats,
        updated_at: new Date().toISOString()
      })
      .eq('address', address)
      .select()
      .single();

    if (error) {
      console.error('Error updating player stats:', error);
      return null;
    }

    return data;
  } else {
    // Insert new record
    const { data, error } = await supabase
      .from('player_stats')
      .insert({
        address,
        ...stats,
        wins: stats.wins || 0,
        losses: stats.losses || 0,
        draws: stats.draws || 0,
        total_games: stats.total_games || 0,
        total_winnings: stats.total_winnings || '0'
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting player stats:', error);
      return null;
    }

    return data;
  }
}

export async function getLeaderboard(limit: number = 100): Promise<PlayerStats[]> {
  const { data, error } = await supabase
    .from('player_stats')
    .select('*')
    .order('total_winnings', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }

  return data || [];
}

export const updateGameResult = async (
  address: string, 
  result: 'win' | 'lose' | 'draw', 
  netWin: string,
  playerMove?: string,
  aiMove?: string
) => {
  try {
    console.log(`Updating game result: ${result} for ${address}, netWin: ${netWin}`);
    
    // Validate moves against the database constraint
    const validMoves = ['rock', 'paper', 'scissors'];
    
    // Format moves to match expected values or set to null if invalid
    const formattedPlayerMove = playerMove && validMoves.includes(playerMove.toLowerCase()) 
      ? playerMove.toLowerCase() 
      : null;
      
    const formattedAiMove = aiMove && validMoves.includes(aiMove.toLowerCase())
      ? aiMove.toLowerCase()
      : null;
    
    // Get existing player stats
    const { data: existingStats, error: statsError } = await supabase
      .from('player_stats')
      .select('*')
      .eq('address', address)
      .single();
      
    if (statsError && statsError.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error getting existing player stats:', statsError);
    }
    
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalGames = 0;
    let totalWinnings = '0';
    
    // If player stats exist, use those as base values
    if (existingStats) {
      wins = existingStats.wins || 0;
      losses = existingStats.losses || 0;
      draws = existingStats.draws || 0;
      totalGames = existingStats.total_games || 0;
      totalWinnings = existingStats.total_winnings || '0';
    }
    
    // Update stats based on result
    if (result === 'win') {
      wins += 1;
      
      // Add the winnings to total if it's a number
      if (netWin && !isNaN(Number(netWin))) {
        const currentTotal = BigInt(totalWinnings || '0');
        const winAmount = BigInt(netWin);
        totalWinnings = (currentTotal + winAmount).toString();
      }
    } else if (result === 'lose') {
      losses += 1;
    } else if (result === 'draw') {
      draws += 1;
    }
    
    totalGames += 1;
    
    // Prepare basic data for update (only known columns that should exist in all versions)
    const updateData: any = {
      address,
      wins,
      losses,
      draws,
      total_games: totalGames,
      total_winnings: totalWinnings,
      last_play_time: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Only add move data if provided and valid
    if (formattedPlayerMove) {
      updateData.last_move = formattedPlayerMove;
    }
    
    if (formattedAiMove) {
      updateData.last_opponent_move = formattedAiMove;
    }
    
    if (result) {
      updateData.last_result = result;
    }
    
    // Try direct upsert with only basic fields
    try {
      console.log('Updating player stats with basic data:', updateData);
      const { error: basicError } = await supabase
        .from('player_stats')
        .upsert(updateData, {
          onConflict: 'address'
        });
        
      if (basicError) {
        console.error('Error updating player stats with basic columns:', basicError);
        
        // If there's still an error with validations, try an even simpler update without the move data
        if (basicError.code === '23514') { // Constraint violation
          console.log('Constraint violation detected, trying without move data');
          
          // Remove potentially problematic fields
          delete updateData.last_move;
          delete updateData.last_opponent_move;
          delete updateData.last_result;
          
          const { error: minimalError } = await supabase
            .from('player_stats')
            .upsert(updateData, {
              onConflict: 'address'
            });
            
          if (minimalError) {
            console.error('Error saving player stats to Supabase:', minimalError);
            return false;
          }
          
          console.log('Successfully updated player stats with minimal data');
          return true;
        }
        
        return false;
      }
      
      console.log('Successfully updated player stats');
      return true;
    } catch (error) {
      console.error('Error in updateGameResult:', error);
      return false;
    }
  } catch (error) {
    console.error('Error in updateGameResult:', error);
    return false;
  }
}; 