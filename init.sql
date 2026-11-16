-- LOCAL development schema for stage 01 only.
-- More tables will be added by proper migrations in the next branch.
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  coins INTEGER NOT NULL DEFAULT 30 CHECK (coins >= 0 AND coins <= 1000000),
  lives INTEGER NOT NULL DEFAULT 5 CHECK (lives >= 0 AND lives <= 5),
  hints INTEGER NOT NULL DEFAULT 2 CHECK (hints >= 0 AND hints <= 20)
);
CREATE TABLE IF NOT EXISTS admin_grants (
  request_id TEXT PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 10000),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
