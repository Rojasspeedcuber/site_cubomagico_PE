-- Confirmation is optional: existing accounts remain able to sign in.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
CREATE TABLE account_tokens (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK (purpose IN ('RESET_PASSWORD','VERIFY_EMAIL')),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(user_id,purpose),
 CHECK(expires_at > created_at)
);
CREATE INDEX account_tokens_expiry_idx ON account_tokens(expires_at);
