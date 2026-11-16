-- 001_game_foundation.sql
-- Non-destructive and compatible with the stage-01 local database.
-- Applied by scripts/db-migrate.js, under one transaction and an advisory lock.
-- Existing players, balances and admin_grants are preserved.

-- Make the migration independently usable on an empty test PostgreSQL database.
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    coins INTEGER NOT NULL DEFAULT 30 CHECK (coins BETWEEN 0 AND 1000000),
    lives INTEGER NOT NULL DEFAULT 5 CHECK (lives BETWEEN 0 AND 5),
    hints INTEGER NOT NULL DEFAULT 2 CHECK (hints BETWEEN 0 AND 20)
);
CREATE TABLE IF NOT EXISTS admin_grants (
    request_id TEXT PRIMARY KEY,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 10000),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
    slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9-]{1,39}$'),
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 80),
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE creators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 100),
    handle TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','active','hidden')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE creator_categories (
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    category_slug TEXT NOT NULL REFERENCES categories(slug) ON DELETE RESTRICT,
    PRIMARY KEY (creator_id,category_slug)
);

-- No videos are hosted in the DB. Store URLs/timestamps and rights review states only.
CREATE TABLE media_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
    platform TEXT NOT NULL CHECK (platform IN ('youtube','twitch','tiktok','vk','rutube','other')),
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://[^[:space:]]+$'),
    title TEXT NOT NULL DEFAULT '',
    clip_start_seconds INTEGER NOT NULL DEFAULT 0 CHECK (clip_start_seconds >= 0),
    clip_end_seconds INTEGER CHECK (clip_end_seconds IS NULL OR clip_end_seconds > clip_start_seconds),
    verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified','verified','rejected')),
    rights_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (rights_status IN ('unknown','link_only','licensed')),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (verification_status <> 'verified' OR verified_at IS NOT NULL),
    UNIQUE (id,creator_id)
);

-- The real quote and creator must not be sent to the client before completion.
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
    source_id UUID,
    quote_text TEXT NOT NULL CHECK (char_length(btrim(quote_text)) BETWEEN 3 AND 500),
    locale TEXT NOT NULL DEFAULT 'ru' CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    difficulty TEXT NOT NULL DEFAULT 'normal'
        CHECK (difficulty IN ('easy','normal','hard','expert')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','reviewed','published','archived')),
    editorial_notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status <> 'published' OR source_id IS NOT NULL),
    FOREIGN KEY (source_id,creator_id) REFERENCES media_sources(id,creator_id) ON DELETE RESTRICT
);
CREATE INDEX idx_quotes_status ON quotes(status);

CREATE TABLE levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_slug TEXT NOT NULL REFERENCES categories(slug) ON DELETE RESTRICT,
    quote_id UUID NOT NULL UNIQUE REFERENCES quotes(id) ON DELETE RESTRICT,
    level_number INTEGER NOT NULL CHECK (level_number BETWEEN 1 AND 100000),
    initial_reveal_count INTEGER NOT NULL DEFAULT 3 CHECK (initial_reveal_count BETWEEN 0 AND 20),
    reward_coins INTEGER NOT NULL DEFAULT 30 CHECK (reward_coins BETWEEN 0 AND 10000),
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (category_slug,level_number)
);
CREATE INDEX idx_levels_category_published ON levels(category_slug,level_number) WHERE is_published;

-- Each attempt has a stable cipher map, stored as symbol -> number.
-- The next feature branch will generate/validate a bijection before insertion.
CREATE TABLE puzzle_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
    attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
    cipher_map JSONB NOT NULL CHECK (jsonb_typeof(cipher_map) = 'object'),
    status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress','solved','abandoned')),
    mistakes INTEGER NOT NULL DEFAULT 0 CHECK (mistakes >= 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (player_id,level_id,attempt_number),
    CHECK ((status = 'solved') = (completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_player_active_attempt
    ON puzzle_attempts(player_id,level_id) WHERE status='in_progress';
CREATE INDEX idx_attempts_player ON puzzle_attempts(player_id,started_at DESC);

-- IMPORTANT: one row per physical letter cell, not one row per cipher number.
-- Equal cipher_number DOES NOT imply automatic propagation of entered_letter.
-- A given clue is immutable at the data model level (entered_letter must be NULL).
-- The game service will restrict writes to the attempt owner and protect given cells.
CREATE TABLE puzzle_cells (
    attempt_id UUID NOT NULL REFERENCES puzzle_attempts(id) ON DELETE CASCADE,
    cell_position INTEGER NOT NULL CHECK (cell_position >= 0),
    cipher_number SMALLINT NOT NULL CHECK (cipher_number BETWEEN 1 AND 64),
    given_letter TEXT CHECK (given_letter IS NULL OR char_length(given_letter) = 1),
    entered_letter TEXT CHECK (entered_letter IS NULL OR char_length(entered_letter) = 1),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (attempt_id,cell_position),
    CHECK (given_letter IS NULL OR entered_letter IS NULL)
);
CREATE INDEX idx_cells_attempt_number ON puzzle_cells(attempt_id,cipher_number);

-- Cell numbers and initial clues cannot be silently modified after an attempt starts.
CREATE FUNCTION protect_puzzle_cell_structure() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
       OR NEW.cell_position IS DISTINCT FROM OLD.cell_position
       OR NEW.cipher_number IS DISTINCT FROM OLD.cipher_number
       OR NEW.given_letter IS DISTINCT FROM OLD.given_letter THEN
        RAISE EXCEPTION 'Encrypted cell structure and clues are immutable' USING ERRCODE='23514';
    END IF;
    NEW.changed_at = NOW();
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_protect_puzzle_cell_structure
    BEFORE UPDATE ON puzzle_cells
    FOR EACH ROW EXECUTE FUNCTION protect_puzzle_cell_structure();

-- Private scratchpad: noting that 8 might mean С never fills any cells.
CREATE TABLE puzzle_notes (
    attempt_id UUID NOT NULL REFERENCES puzzle_attempts(id) ON DELETE CASCADE,
    cipher_number SMALLINT NOT NULL CHECK (cipher_number BETWEEN 1 AND 64),
    candidate_letter TEXT CHECK (candidate_letter IS NULL OR char_length(candidate_letter) = 1),
    comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (attempt_id,cipher_number)
);

CREATE TABLE level_progress (
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
    completed_attempt_id UUID NOT NULL REFERENCES puzzle_attempts(id) ON DELETE RESTRICT,
    first_completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    best_mistakes INTEGER NOT NULL DEFAULT 0 CHECK (best_mistakes >= 0),
    PRIMARY KEY (player_id,level_id)
);

-- Optional reveal stage after solving, not a replacement for the cryptogram.
CREATE TABLE bonus_answers (
    attempt_id UUID PRIMARY KEY REFERENCES puzzle_attempts(id) ON DELETE CASCADE,
    guessed_creator_id UUID REFERENCES creators(id) ON DELETE RESTRICT,
    result TEXT NOT NULL CHECK (result IN ('correct','incorrect','skipped')),
    reward_coins INTEGER NOT NULL DEFAULT 0 CHECK (reward_coins BETWEEN 0 AND 10000),
    answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((result='skipped' AND guessed_creator_id IS NULL)
        OR (result IN ('correct','incorrect') AND guessed_creator_id IS NOT NULL))
);

-- "Case 404" is a curated sequence of existing puzzle levels, not a separate puzzle engine.
CREATE TABLE cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{1,79}$'),
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 100),
    description TEXT NOT NULL DEFAULT '',
    category_slug TEXT REFERENCES categories(slug) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE case_steps (
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL CHECK (step_number >= 1),
    level_id UUID NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
    clue_title TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (case_id,step_number),
    UNIQUE (case_id,level_id)
);
CREATE TABLE case_progress (
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
    completed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (player_id,case_id)
);

-- Extension in this migration is intentionally additive only.
