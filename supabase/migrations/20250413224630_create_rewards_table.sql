-- Create rewards table to store player rewards
CREATE TABLE IF NOT EXISTS rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  address TEXT NOT NULL,
  amount TEXT NOT NULL, -- Stored as string to handle bigint values safely
  timestamp BIGINT NOT NULL, -- Unix timestamp in seconds
  status TEXT NOT NULL CHECK (status IN ('pending', 'claimed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index on address for faster lookups
CREATE INDEX IF NOT EXISTS rewards_address_idx ON rewards (address);

-- Add index on status for filtering unclaimed rewards
CREATE INDEX IF NOT EXISTS rewards_status_idx ON rewards (status);

-- Enable RLS
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

-- Create RLS policy to allow users to see only their own rewards
CREATE POLICY "Users can view their own rewards"
  ON rewards
  FOR SELECT
  USING (auth.uid()::text = address OR auth.jwt() ->> 'role' = 'service_role');

-- Create RLS policy to allow service role to insert/update rewards
CREATE POLICY "Service role can manage rewards"
  ON rewards
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role'); 