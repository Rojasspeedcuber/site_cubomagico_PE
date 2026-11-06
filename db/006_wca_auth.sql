-- OAuth state is a ten-minute, single-use browser-bound capability. No provider tokens are retained.
CREATE TABLE wca_oauth_states (
 state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
 browser_hash text NOT NULL CHECK (browser_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX wca_oauth_states_expiry_idx ON wca_oauth_states(expires_at);

-- Numeric WCA website user id, NOT the optional competition WCA ID.
CREATE TABLE wca_accounts (
 wca_user_id text PRIMARY KEY CHECK (wca_user_id ~ '^[1-9][0-9]{0,15}$'),
 user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
