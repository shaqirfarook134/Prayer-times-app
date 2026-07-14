DROP INDEX IF EXISTS idx_masjids_active;
ALTER TABLE masjids DROP COLUMN IF EXISTS is_active;
