-- 002_guest_sessions.sql
-- Additive, versioned guest authentication. Existing players, coins and progress stay intact.
-- Only SHA-256 hashes of session tokens are stored; never store raw bearer tokens.

ALTER TABLE players ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE guest_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    access_token_hash CHAR(64) NOT NULL UNIQUE CHECK (access_token_hash ~ '^[0-9a-f]{64}$'),
    refresh_token_hash CHAR(64) NOT NULL UNIQUE CHECK (refresh_token_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_expires_at TIMESTAMPTZ NOT NULL,
    refresh_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CHECK (access_expires_at > created_at),
    CHECK (refresh_expires_at > created_at),
    CHECK (refresh_expires_at >= access_expires_at)
);
CREATE INDEX idx_guest_sessions_player ON guest_sessions(player_id);
CREATE INDEX idx_guest_sessions_refresh_expiry ON guest_sessions(refresh_expires_at)
    WHERE revoked_at IS NULL;
