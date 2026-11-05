-- PostgreSQL. Times are timestamptz; all scores are integer centiseconds.
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 254),
 password_hash text NOT NULL,
 display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),
 city text NOT NULL DEFAULT '', photo_url text NOT NULL DEFAULT '', wca_id text NOT NULL DEFAULT '',
 role text NOT NULL DEFAULT 'COMPETITOR' CHECK (role IN ('COMPETITOR','ORGANIZER','ADMIN')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE rate_limits (key text PRIMARY KEY, hits integer NOT NULL CHECK(hits>0), reset_at timestamptz NOT NULL);
CREATE INDEX rate_limits_expiry_idx ON rate_limits(reset_at);
CREATE TABLE content (key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE algorithms (
 id text PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 120), name text NOT NULL,
 category text NOT NULL CHECK(category IN ('F2L','OLL','PLL')), algorithm text NOT NULL,
 variations jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(variations)='array'),
 orientation text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', source_url text NOT NULL DEFAULT '',
 source_name text NOT NULL DEFAULT '', validated boolean NOT NULL DEFAULT false,
 method text NOT NULL DEFAULT 'CFOP' CHECK(method='CFOP'), puzzle text NOT NULL DEFAULT '333' CHECK(puzzle='333'),
 archived boolean NOT NULL DEFAULT false
);
CREATE INDEX algorithms_category_idx ON algorithms(category) WHERE NOT archived;
CREATE TABLE events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id),
 name text NOT NULL, description text NOT NULL DEFAULT '', rules text NOT NULL DEFAULT '',
 registration_open timestamptz NOT NULL, registration_close timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','OPEN','RUNNING','CLOSED')),
 published boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(registration_open < registration_close)
);
CREATE INDEX events_owner_idx ON events(owner_id);
CREATE INDEX events_public_idx ON events(status,registration_open);
CREATE TABLE rounds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 name text NOT NULL, puzzle text NOT NULL CHECK(puzzle IN ('333','222','pyram')),
 format text NOT NULL CHECK(format IN('AO5','MO3')), opens_at timestamptz NOT NULL, closes_at timestamptz NOT NULL,
 video_required boolean NOT NULL DEFAULT false, published boolean NOT NULL DEFAULT false,
 scrambles jsonb NOT NULL CHECK(jsonb_typeof(scrambles)='array'),
 CHECK(opens_at < closes_at), CHECK(jsonb_array_length(scrambles)=CASE WHEN format='AO5' THEN 5 ELSE 3 END),
 UNIQUE(event_id,id)
);
CREATE INDEX rounds_event_idx ON rounds(event_id);
CREATE TABLE participants (
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(event_id,user_id)
);
CREATE TABLE registrations (
 event_id uuid NOT NULL, round_id uuid NOT NULL, user_id uuid NOT NULL,
 PRIMARY KEY(round_id,user_id), FOREIGN KEY(event_id,round_id) REFERENCES rounds(event_id,id) ON DELETE CASCADE,
 FOREIGN KEY(event_id,user_id) REFERENCES participants(event_id,user_id) ON DELETE CASCADE
);
CREATE INDEX registrations_user_idx ON registrations(user_id,event_id);
CREATE TABLE submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL, user_id uuid NOT NULL,
 attempts jsonb NOT NULL CHECK(jsonb_typeof(attempts)='array' AND jsonb_array_length(attempts) IN (3,5)),
 video_url text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','APPROVED','REJECTED')),
 review_note text NOT NULL DEFAULT '', average_cs integer CHECK(average_cs>0), best_cs integer CHECK(best_cs>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(round_id,user_id), FOREIGN KEY(round_id,user_id) REFERENCES registrations(round_id,user_id) ON DELETE CASCADE
);
CREATE INDEX submissions_round_status_idx ON submissions(round_id,status);
CREATE INDEX submissions_user_idx ON submissions(user_id);
CREATE TABLE video_requests (
 round_id uuid NOT NULL, user_id uuid NOT NULL, message text NOT NULL,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(round_id,user_id), FOREIGN KEY(round_id,user_id) REFERENCES registrations(round_id,user_id) ON DELETE CASCADE
);
CREATE TABLE audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 action text NOT NULL, target_id text, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON audit(created_at DESC);
CREATE INDEX audit_actor_idx ON audit(actor_id);
