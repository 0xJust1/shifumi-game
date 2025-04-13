-- Drop existing policies
DROP POLICY IF EXISTS "Allow public read access" ON player_stats;
DROP POLICY IF EXISTS "Allow users to update their own stats" ON player_stats;
DROP POLICY IF EXISTS "Allow users to insert their own stats" ON player_stats;

-- Create new policies for public access
CREATE POLICY "Allow public read access"
    ON player_stats FOR SELECT
    USING (true);

CREATE POLICY "Allow public insert"
    ON player_stats FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public update"
    ON player_stats FOR UPDATE
    USING (true)
    WITH CHECK (true); 