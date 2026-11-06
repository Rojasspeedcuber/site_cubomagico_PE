ALTER TABLE users ADD COLUMN notifications_enabled boolean NOT NULL DEFAULT false;

-- No message payload or recipient address: resolve the account at delivery time.
CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('VIDEO_REQUEST','SUBMISSION_REVIEW')),
  target_id text NOT NULL CHECK (target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[1-9][0-9]{0,19})?$'),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','RETRY','FAILED','CANCELLED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_error text CHECK (last_error IS NULL OR last_error='MAIL_DELIVERY_FAILED'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  UNIQUE(user_id,kind,target_id)
);
CREATE INDEX notification_outbox_pending ON notification_outbox(next_attempt_at,created_at,id) WHERE status IN ('PENDING','RETRY');
CREATE INDEX notification_outbox_user ON notification_outbox(user_id);
CREATE INDEX notification_outbox_event ON notification_outbox(event_id);
