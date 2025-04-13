-- Create player_stats table
CREATE TABLE IF NOT EXISTS player_stats (
    id BIGSERIAL PRIMARY KEY,
    address TEXT NOT NULL UNIQUE,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    total_games INTEGER NOT NULL DEFAULT 0,
    total_winnings NUMERIC(36,18) NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    max_streak INTEGER NOT NULL DEFAULT 0,
    multiplier FLOAT NOT NULL DEFAULT 1.0,
    last_play_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on address for faster lookups
CREATE INDEX IF NOT EXISTS idx_player_stats_address ON player_stats(address);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_player_stats_updated_at
    BEFORE UPDATE ON player_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create RLS policies
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read player stats
CREATE POLICY "Allow public read access"
    ON player_stats FOR SELECT
    USING (true);

-- Allow authenticated users to update their own stats
CREATE POLICY "Allow users to update their own stats"
    ON player_stats FOR UPDATE
    USING (auth.uid()::text = address)
    WITH CHECK (auth.uid()::text = address);

-- Allow authenticated users to insert their own stats
CREATE POLICY "Allow users to insert their own stats"
    ON player_stats FOR INSERT
    WITH CHECK (auth.uid()::text = address); 