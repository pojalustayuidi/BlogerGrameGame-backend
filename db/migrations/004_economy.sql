-- Stage 05: server-authoritative coins, hints and soft lives. Additive migration.
-- Do NOT edit previously applied 001/002/003 migrations.
ALTER TABLE players ADD COLUMN life_regen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE economy_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL CHECK (char_length(event_key) BETWEEN 5 AND 160),
  event_type TEXT NOT NULL CHECK (event_type IN ('level_reward','flawless_reward','bonus_reward','wrong_check','shop_purchase','hint_reveal')),
  coins_delta INTEGER NOT NULL DEFAULT 0 CHECK (coins_delta BETWEEN -1000000 AND 1000000),
  hints_delta INTEGER NOT NULL DEFAULT 0 CHECK (hints_delta BETWEEN -20 AND 20),
  lives_delta INTEGER NOT NULL DEFAULT 0 CHECK (lives_delta BETWEEN -5 AND 5),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id,event_key)
);
CREATE INDEX idx_economy_ledger_recent ON economy_ledger(player_id,created_at DESC);

-- Hints are per physical cell, NOT per cipher number. Given original clues stay immutable.
CREATE TABLE puzzle_hint_reveals (
  attempt_id UUID NOT NULL,
  cell_position INTEGER NOT NULL,
  revealed_letter TEXT NOT NULL CHECK (char_length(revealed_letter)=1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(attempt_id,cell_position),
  FOREIGN KEY (attempt_id,cell_position) REFERENCES puzzle_cells(attempt_id,cell_position) ON DELETE CASCADE
);

-- Backfill difficulty rewards only for the imported unpublished playtest levels.
-- Never silently change published or manually configured level rewards.
UPDATE levels l SET reward_coins=CASE q.difficulty
  WHEN 'easy' THEN 20 WHEN 'normal' THEN 30 WHEN 'hard' THEN 40 WHEN 'expert' THEN 55
  ELSE 30 END
FROM quotes q WHERE q.id=l.quote_id AND q.external_key LIKE 'draft-v5:quote:%'
  AND l.is_published=FALSE AND q.status='draft' AND l.reward_coins=30;
