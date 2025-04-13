-- First drop the existing constraint
ALTER TABLE player_stats
DROP CONSTRAINT IF EXISTS valid_last_result;

-- Add the constraint back with case-insensitive check
ALTER TABLE player_stats
ADD CONSTRAINT valid_last_result 
CHECK (LOWER(last_result) IN ('win', 'loss', 'draw')); 