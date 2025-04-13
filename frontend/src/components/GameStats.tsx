import { useState, useEffect, useCallback } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ChartData,
  ArcElement
} from 'chart.js';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useAccount } from 'wagmi';
import { formatWinningsToMON } from '../utils/format';
import { supabase, getLeaderboard } from '../utils/supabase';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

// Add global error handler for fetch requests that might be blocked by ad blockers
const originalFetch = window.fetch;
window.fetch = async function(input, init) {
  try {
    const response = await originalFetch(input, init);
    return response;
  } catch (error) {
    console.error('Fetch error possibly caused by ad blocker:', error);
    // If this is a network error, it might be caused by an ad blocker
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      console.warn('Network error detected, might be caused by an ad blocker');
    }
    throw error;
  }
};

interface GameResult {
  timestamp: number;
  wins: number;
  draws: number;
  losses: number;
  playerMove: string;
  computerMove: string;
  winnings: string;
}

interface GameStats {
  totalGames: number;
  totalPlayers: number;
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  winRate: number;
  fairnessScore: number;
  total_winnings: string;
  gross_winnings: string;
  net_winnings: string;
  results: GameResult[];
}

interface DailyStats {
  win: number;
  draw: number;
  loss: number;
  total: number;
}

interface ResultType {
  win: number;
  draw: number;
  loss: number;
  total: number;
}

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001/api';

export default function GameStats() {
  const { chainId } = useAccount();
  const [stats, setStats] = useState<GameStats>({
    totalGames: 0,
    totalPlayers: 0,
    totalWins: 0,
    totalDraws: 0,
    totalLosses: 0,
    winRate: 0,
    fairnessScore: 0,
    total_winnings: '0',
    gross_winnings: '0',
    net_winnings: '0',
    results: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'all'>('all');
  const [apiError, setApiError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchGameStatsFromSupabase = useCallback(async () => {
    try {
      console.log('Fetching stats from Supabase');
      const { data: playerStats, error } = await supabase
        .from('player_stats')
        .select('*')
        .order('last_play_time', { ascending: false });

      if (error) {
        console.error('Error fetching player stats:', error);
        setApiError(true);
        return;
      }

      if (!playerStats || playerStats.length === 0) {
        console.log('No player stats available');
        setStats({
          totalGames: 0,
          totalPlayers: 0,
          totalWins: 0,
          totalDraws: 0,
          totalLosses: 0,
          winRate: 0,
          fairnessScore: 0,
          total_winnings: '0',
          gross_winnings: '0',
          net_winnings: '0',
          results: []
        });
        return;
      }

      // Log raw data for debugging
      console.log('Raw player stats:', playerStats);

      // Calculate totals with strict validation
      const totals = playerStats.reduce((acc, player) => {
        // Convert all values to numbers and ensure they're valid
        const wins = Math.max(0, Number(player.wins) || 0);
        const draws = Math.max(0, Number(player.draws) || 0);
        const losses = Math.max(0, Number(player.losses) || 0);
        const totalGames = Math.max(0, Number(player.total_games) || 0);
        const winnings = BigInt(player.total_winnings || '0');

        // Validate total games matches sum of results
        const calculatedTotal = wins + draws + losses;
        if (calculatedTotal !== totalGames) {
          console.warn(`Total games mismatch for player ${player.address}:`, {
            calculated: calculatedTotal,
            stored: totalGames,
            wins,
            draws,
            losses
          });
        }

        return {
          games: acc.games + Math.max(calculatedTotal, totalGames),
          wins: acc.wins + wins,
          draws: acc.draws + draws,
          losses: acc.losses + losses,
          winnings: acc.winnings + winnings,
          players: acc.players + 1
        };
      }, { games: 0, wins: 0, draws: 0, losses: 0, winnings: BigInt(0), players: 0 });

      // Create results from recent games, using the last 20 games
      const recentResults: GameResult[] = playerStats
        .slice(0, 20)
        .map(player => {
          const lastPlayTime = new Date(player.last_play_time || Date.now());
          // For recent results, we'll count each player's most recent game
          // based on their last recorded stats
          return {
            timestamp: lastPlayTime.getTime(),
            wins: Number(player.wins) || 0,
            draws: Number(player.draws) || 0,
            losses: Number(player.losses) || 0,
            playerMove: player.last_move || 'unknown',
            computerMove: player.last_opponent_move || 'unknown',
            winnings: player.total_winnings || '0'
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);

      // Calculate win rate and fairness score
      const winRate = totals.games > 0 ? (totals.wins / totals.games) * 100 : 0;
      const expectedPercentage = 33.33; // In a fair game, each outcome should be roughly equal
      const actualPercentages = {
        wins: totals.games > 0 ? (totals.wins / totals.games) * 100 : 0,
        draws: totals.games > 0 ? (totals.draws / totals.games) * 100 : 0,
        losses: totals.games > 0 ? (totals.losses / totals.games) * 100 : 0
      };

      // Calculate fairness score based on deviation from expected percentages
      const deviations = [
        Math.abs(actualPercentages.wins - expectedPercentage),
        Math.abs(actualPercentages.draws - expectedPercentage),
        Math.abs(actualPercentages.losses - expectedPercentage)
      ];
      const fairnessScore = Math.max(0, 100 - (deviations.reduce((a, b) => a + b) / 3));

      // Update stats state with validated data
      setStats({
        totalGames: totals.games,
        totalPlayers: totals.players,
        totalWins: totals.wins,
        totalDraws: totals.draws,
        totalLosses: totals.losses,
        winRate,
        fairnessScore,
        total_winnings: totals.winnings.toString(),
        gross_winnings: totals.winnings.toString(),
        net_winnings: totals.winnings.toString(),
        results: recentResults
      });

      setApiError(false);
      setLastUpdated(new Date());
      setIsLoading(false);

      // Log processed stats for verification
      console.log('Processed stats:', {
        totals,
        winRate,
        fairnessScore,
        recentResults
      });
    } catch (error) {
      console.error('Error processing game stats:', error);
      setApiError(true);
      setIsLoading(false);
    }
  }, []);

  const fetchGameStats = useCallback(async () => {
    if (!chainId) return;
    
    try {
      setIsLoading(true);
      setApiError(false);
      console.log('Fetching stats with params:', { timeframe, chainId });
      
      // First try to use Supabase directly to avoid ad blocker issues
      try {
        await fetchGameStatsFromSupabase();
        return;
      } catch (supabaseError) {
        console.warn('Failed to fetch from Supabase directly, trying fallback API:', supabaseError);
      }

      // Only as a fallback, try the external API (which might be blocked by ad blockers)
      try {
        const response = await fetch(`${API_URL}/game-stats/stats`);
        if (!response.ok) throw new Error('Failed to fetch game stats');
        const data = await response.json();
        
        console.log('Received game stats from backend:', data);

        // Process the data to ensure all values are present
        const processedStats: GameStats = {
          totalGames: data.totalGames || 0,
          totalPlayers: data.totalPlayers || 0,
          totalWins: data.totalWins || 0,
          totalDraws: data.totalDraws || 0,
          totalLosses: data.totalLosses || 0,
          winRate: data.winRate || 0,
          fairnessScore: data.fairnessScore || 0,
          total_winnings: data.totalWinnings || '0',
          gross_winnings: data.grossWinnings || '0',
          net_winnings: data.netWinnings || '0',
          results: data.results || []
        };

        console.log('Processed game stats:', processedStats);
        setStats(processedStats);
        setLastUpdated(new Date());
      } catch (apiError) {
        console.error('Error fetching game stats from API:', apiError);
        toast.error('Backend API unavailable, using database data instead');
        
        // Fallback to Supabase data again just in case
        await fetchGameStatsFromSupabase();
      }
    } catch (error) {
      console.error('Error in fetchGameStats:', error);
      setApiError(true);
    } finally {
      setIsLoading(false);
    }
  }, [chainId, timeframe, fetchGameStatsFromSupabase]);

  useEffect(() => {
    if (chainId) {
      fetchGameStats();
    }
  }, [chainId, timeframe, fetchGameStats]);

  // Add a refresh function
  const handleRefresh = () => {
    setIsLoading(true);
    fetchGameStats();
  };

  const processChartData = (): ChartData<'bar'> => {
    // Add debug logging for raw data
    console.log('Processing chart data with raw stats:', stats);

    // Ensure we're using the correct values
    const chartData = {
      labels: ['Wins', 'Draws', 'Losses'],
      datasets: [
        {
          label: 'Number of games',
          data: [
            Math.max(0, stats.totalWins || 0),
            Math.max(0, stats.totalDraws || 0),
            Math.max(0, stats.totalLosses || 0)
          ],
          backgroundColor: [
            'rgba(75, 192, 192, 0.7)',  // Green for wins
            'rgba(255, 206, 86, 0.7)',  // Yellow for draws
            'rgba(255, 99, 132, 0.7)',  // Red for losses
          ],
          borderColor: [
            'rgba(75, 192, 192, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(255, 99, 132, 1)',
          ],
          borderWidth: 1,
          borderRadius: 5,
        }
      ]
    };

    // Add debug logging for processed data
    console.log('Processed chart data:', chartData);
    return chartData;
  };

  const processPieChartData = (): ChartData<'pie'> => {
    // Add debug logging for raw data
    console.log('Processing pie chart data with raw stats:', stats);

    const pieData = {
      labels: ['Wins', 'Draws', 'Losses'],
      datasets: [
        {
          data: [
            Math.max(0, stats.totalWins || 0),
            Math.max(0, stats.totalDraws || 0),
            Math.max(0, stats.totalLosses || 0)
          ],
          backgroundColor: [
            'rgba(75, 192, 192, 0.7)',  // Green for wins
            'rgba(255, 206, 86, 0.7)',  // Yellow for draws
            'rgba(255, 99, 132, 0.7)',  // Red for losses
          ],
          borderColor: [
            'rgba(75, 192, 192, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(255, 99, 132, 1)',
          ],
          borderWidth: 1,
        }
      ]
    };

    // Add debug logging for processed data
    console.log('Processed pie chart data:', pieData);
    return pieData;
  };

  const processEquityChartData = (): ChartData<'bar'> => {
    // Add debug logging for raw data
    console.log('Processing equity chart data with raw stats:', stats);

    const total = Math.max(1, stats.totalGames || 0); // Avoid division by zero
    const winPercentage = Math.round((stats.totalWins / total) * 100 * 10) / 10;
    const drawPercentage = Math.round((stats.totalDraws / total) * 100 * 10) / 10;
    const lossPercentage = Math.round((stats.totalLosses / total) * 100 * 10) / 10;

    const equityData = {
      labels: ['Wins', 'Draws', 'Losses'],
      datasets: [
        {
          label: 'Actual distribution (%)',
          data: [winPercentage, drawPercentage, lossPercentage],
          backgroundColor: 'rgba(75, 192, 192, 0.7)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1,
          borderRadius: 5,
        },
        {
          label: 'Expected distribution (%)',
          data: [33.3, 33.3, 33.3],
          backgroundColor: 'rgba(255, 99, 132, 0.7)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1,
          borderRadius: 5,
        }
      ]
    };

    // Add debug logging for processed data
    console.log('Processed equity chart data:', equityData);
    return equityData;
  };

  const chartData = processChartData();
  const pieChartData = processPieChartData();
  const equityChartData = processEquityChartData();
  const hasData = stats.totalGames > 0;

  // Debug log for total winnings
  useEffect(() => {
    console.log('Formatting total winnings:', {
      rawWinnings: stats.total_winnings,
      chainId: chainId,
      formatted: formatWinningsToMON(stats.total_winnings, chainId)
    });
  }, [stats.total_winnings, chainId]);

  // Verify that data is correctly displayed
  useEffect(() => {
    console.log('Stats display validation:', {
      totalGames: stats.totalGames,
      wins: stats.totalWins,
      draws: stats.totalDraws,
      losses: stats.totalLosses,
      total_winnings: stats.total_winnings,
      formattedWinnings: formatWinningsToMON(stats.total_winnings, chainId),
      totalCalculated: stats.totalWins + stats.totalDraws + stats.totalLosses
    });
  }, [stats, chainId]);

  const chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: 'white',
          font: {
            size: 14,
            weight: 'bold'
          }
        }
      },
      title: {
        display: true,
        text: 'Result Distribution',
        color: 'white',
        font: {
          size: 18,
          weight: 'bold'
        },
        padding: {
          bottom: 30
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.raw as number;
            const total = stats.totalGames;
            const percentage = total > 0 ? Math.round((value / total) * 100 * 10) / 10 : 0;
            return [
              `Count: ${value} games`,
              `Ratio: ${percentage}%`
            ];
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: 'white',
          font: {
            size: 12
          },
          stepSize: 1,
          callback: function(value) {
            return Math.floor(Number(value));
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        title: {
          display: true,
          text: 'Number of games',
          color: 'white',
          font: {
            size: 14,
            weight: 'bold'
          }
        }
      },
      x: {
        ticks: {
          color: 'white',
          font: {
            size: 12,
            weight: 'bold'
          }
        },
        grid: {
          display: false
        }
      }
    }
  };

  const pieChartOptions: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: 'white',
          font: {
            size: 14,
            weight: 'bold'
          },
          padding: 20
        }
      },
      title: {
        display: true,
        text: 'Results Distribution',
        color: 'white',
        font: {
          size: 18,
          weight: 'bold'
        },
        padding: {
          bottom: 30
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.raw as number;
            const total = stats.totalGames;
            const percentage = total > 0 ? Math.round((value / total) * 100 * 10) / 10 : 0;
            return [
              `${context.label}: ${value} games`,
              `Ratio: ${percentage}%`
            ];
          }
        }
      }
    }
  };

  const equityChartOptions: ChartOptions<'bar'> = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: 'white',
          font: {
            size: 14,
            weight: 'bold'
          }
        }
      },
      title: {
        display: true,
        text: 'Game Fairness - Distribution Comparison',
        color: 'white',
        font: {
          size: 18,
          weight: 'bold'
        },
        padding: {
          bottom: 30
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.raw as number;
            return `${context.dataset.label}: ${value}%`;
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        ticks: {
          color: 'white',
          font: {
            size: 12
          },
          callback: function(value) {
            return `${value}%`;
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        title: {
          display: true,
          text: 'Percentage',
          color: 'white',
          font: {
            size: 14,
            weight: 'bold'
          }
        }
      },
      y: {
        ticks: {
          color: 'white',
          font: {
            size: 12,
            weight: 'bold'
          }
        },
        grid: {
          display: false
        }
      }
    }
  };

  // Add a function to check the database structure
  const checkDatabaseStructure = async () => {
    try {
      console.log('Checking database structure...');
      
      // Check player_stats table
      try {
        const { data: playerStatsColumns, error: playerStatsError } = await supabase
          .from('player_stats')
          .select('*')
          .limit(1);
          
        if (playerStatsError) {
          console.error('Error checking player_stats table:', playerStatsError);
        } else {
          console.log('player_stats table structure:', playerStatsColumns && playerStatsColumns.length > 0 ? Object.keys(playerStatsColumns[0]) : 'No data');
        }
      } catch (error) {
        console.error('Error checking player_stats table:', error);
      }
      
      // Removed the game_results table check as it's intentionally causing 404 errors
      // and is not needed for functionality

    } catch (error) {
      console.error('Error checking database structure:', error);
    }
  };

  // Call this function when component mounts
  useEffect(() => {
    checkDatabaseStructure();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl mx-auto p-4"
    >
      <div className="bg-black/40 backdrop-blur-sm border border-white/5 rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Game Statistics</h2>
          <div className="flex items-center gap-4">
            {apiError && (
              <div className="text-yellow-400 text-sm">
                <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full mr-1"></span>
                Backend data unavailable
              </div>
            )}
            <button 
              onClick={handleRefresh}
              className="bg-primary/80 text-white px-3 py-2 rounded hover:bg-primary/90 transition-colors"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <span>Refresh</span>
              )}
            </button>
            <select
              className="bg-primary/80 text-white px-4 py-2 rounded"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
            >
              <option value="day">Last 24h</option>
              <option value="week">Last week</option>
              <option value="month">Last month</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-black/20 rounded-lg p-4 text-center backdrop-blur-sm border border-white/5">
            <h3 className="text-sm text-gray-400 mb-1">Total Games</h3>
            <p className="text-xl font-bold text-white">{stats.totalGames}</p>
          </div>
          <div className="bg-black/20 rounded-lg p-4 text-center backdrop-blur-sm border border-white/5">
            <h3 className="text-sm text-gray-400 mb-1">Win Rate</h3>
            <p className="text-xl font-bold text-white">{stats.winRate.toFixed(1)}%</p>
          </div>
          <div className="bg-black/20 rounded-lg p-4 text-center backdrop-blur-sm border border-white/5">
            <h3 className="text-sm text-gray-400 mb-1">Total Winnings</h3>
            <p className="text-xl font-bold text-white">{formatWinningsToMON(stats.total_winnings, chainId)}</p>
            <p className="text-xs text-gray-400 mt-1">Raw: {stats.total_winnings}</p>
          </div>
          <div className="bg-black/20 rounded-lg p-4 text-center backdrop-blur-sm border border-white/5">
            <h3 className="text-sm text-gray-400 mb-1">Fairness Score</h3>
            <p className="text-xl font-bold text-white">
              {stats.fairnessScore.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="text-xs text-gray-400 mb-4 text-right">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full"></div>
          </div>
        ) : !stats.totalGames ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-black/20 rounded-lg backdrop-blur-sm border border-white/5">
            <p className="text-xl mb-2">No games played</p>
            <p className="text-sm">Play your first game to see the statistics!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            <div className="relative h-80 bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-white/5">
              <Bar data={equityChartData} options={equityChartOptions} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative h-80 bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-white/5">
                <Bar data={chartData} options={chartOptions} />
              </div>
              <div className="relative h-80 bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-white/5">
                <Pie data={pieChartData} options={pieChartOptions} />
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
} 