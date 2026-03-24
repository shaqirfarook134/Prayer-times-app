-- Rollback: Remove latitude and longitude columns from masjids table

DROP INDEX IF EXISTS idx_masjids_coordinates;

ALTER TABLE masjids
DROP COLUMN IF EXISTS latitude,
DROP COLUMN IF EXISTS longitude;
