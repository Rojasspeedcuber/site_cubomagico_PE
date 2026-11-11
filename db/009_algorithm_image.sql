-- Figure of each case, taken from the study spreadsheet (public/algoritmos/<id>.<ext>).
-- Stored explicitly so the extension (png or gif) is never guessed from the id.
ALTER TABLE algorithms ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';
