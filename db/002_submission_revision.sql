-- Optimistic review concurrency: every submission mutation advances its version.
ALTER TABLE submissions
 ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
