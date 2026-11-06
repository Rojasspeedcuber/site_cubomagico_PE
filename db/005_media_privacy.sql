-- Files live outside public; original filenames are intentionally never persisted.
CREATE TABLE media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('photo','video')),
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp','video/mp4','video/webm')),
 bytes bigint NOT NULL CHECK(bytes > 0 AND bytes <= 104857600),
 url text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((kind='photo' AND mime LIKE 'image/%' AND bytes<=5242880) OR (kind='video' AND mime LIKE 'video/%'))
);
CREATE INDEX media_owner_idx ON media(owner_id);
CREATE INDEX media_created_idx ON media(created_at);
ALTER TABLE submissions ADD COLUMN video_media_id uuid REFERENCES media(id) ON DELETE SET NULL;
CREATE INDEX submissions_video_media_idx ON submissions(video_media_id) WHERE video_media_id IS NOT NULL;

-- Enforce ownership at the database boundary, including the existing submission handler.
-- Only exact URLs emitted by this server (or its relative route) refer to local media.
CREATE FUNCTION bind_submission_media() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 local_id uuid;
 found_media media%ROWTYPE;
BEGIN
 NEW.video_media_id := NULL;
 IF NEW.video_url ~ '(^|/)api/media/' THEN
  BEGIN
   local_id := substring(NEW.video_url from '/api/media/([0-9a-fA-F-]{36})$')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
   RAISE EXCEPTION 'Invalid media reference' USING ERRCODE='23514';
  END;
  SELECT * INTO found_media FROM media WHERE id=local_id FOR KEY SHARE;
  IF NOT FOUND OR found_media.kind<>'video' OR found_media.owner_id<>NEW.user_id
    OR NEW.video_url NOT IN (found_media.url, '/api/media/' || found_media.id::text) THEN
   RAISE EXCEPTION 'Video must belong to submission owner' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND closes_at <= clock_timestamp()-interval '90 days') THEN
   RAISE EXCEPTION 'Video retention expired' USING ERRCODE='23514';
  END IF;
  NEW.video_media_id := found_media.id;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER submissions_bind_media BEFORE INSERT OR UPDATE OF video_url,user_id,round_id,video_media_id ON submissions
 FOR EACH ROW EXECUTE FUNCTION bind_submission_media();
