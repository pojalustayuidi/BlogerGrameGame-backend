-- Stage 04: idempotent editorial ingest keys, no changes to existing players.
-- Existing 001 / 002 migrations remain byte-for-byte unchanged.
ALTER TABLE creators ADD COLUMN external_key TEXT UNIQUE;
ALTER TABLE quotes ADD COLUMN external_key TEXT UNIQUE;
ALTER TABLE media_sources ADD COLUMN external_key TEXT UNIQUE;
-- Levels, attempts, cells, notes and bonus_answers were created by migration 001.
-- No backfilling and no automatic publishing of draft content.
-- Limit repeated full-answer checks. The game never evaluates individual cells.
ALTER TABLE puzzle_attempts ADD COLUMN last_checked_at TIMESTAMPTZ;
