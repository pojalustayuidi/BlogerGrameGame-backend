-- Stage 05v2: server-validated guesses, exactly one physical cell per request.
-- Non-destructive, additive migration. DO NOT modify migrations 001 through 004.
-- Records a response for each client requestId to make mobile HTTP retries safe.
CREATE TABLE puzzle_letter_requests (
  attempt_id UUID NOT NULL,
  request_id UUID NOT NULL,
  cell_position INTEGER NOT NULL CHECK (cell_position >= 0),
  candidate_letter TEXT NOT NULL CHECK (char_length(candidate_letter) = 1),
  response JSONB NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id,request_id),
  FOREIGN KEY (attempt_id,cell_position)
    REFERENCES puzzle_cells(attempt_id,cell_position) ON DELETE CASCADE
);
CREATE INDEX idx_letter_requests_attempt ON puzzle_letter_requests(attempt_id,created_at DESC);

-- Existing ledger records remain untouched; only extend permitted event types.
ALTER TABLE economy_ledger DROP CONSTRAINT economy_ledger_event_type_check;
ALTER TABLE economy_ledger ADD CONSTRAINT economy_ledger_event_type_check
  CHECK (event_type IN ('level_reward','flawless_reward','bonus_reward',
                       'wrong_check','wrong_letter','shop_purchase','hint_reveal'));
