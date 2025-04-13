-- Add new columns to player_stats table
ALTER TABLE player_stats
ADD COLUMN last_move VARCHAR(10),
ADD COLUMN last_opponent_move VARCHAR(10),
ADD COLUMN last_result VARCHAR(10);

-- Add check constraint to ensure last_result is one of 'win', 'loss', or 'draw'
ALTER TABLE player_stats
ADD CONSTRAINT valid_last_result CHECK (last_result IN ('win', 'loss', 'draw'));

-- Add check constraint to ensure last_move and last_opponent_move are valid moves
ALTER TABLE player_stats
ADD CONSTRAINT valid_last_move CHECK (last_move IN ('rock', 'paper', 'scissors')),
ADD CONSTRAINT valid_last_opponent_move CHECK (last_opponent_move IN ('rock', 'paper', 'scissors')); 