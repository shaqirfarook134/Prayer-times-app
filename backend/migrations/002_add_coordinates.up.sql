-- Migration: Add latitude and longitude to masjids table
-- Author: Claude Code
-- Date: 2026-03-24
-- Purpose: Enable location-based features (nearby masjids, maps)

-- Add latitude and longitude columns
ALTER TABLE masjids
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7);

-- Add index for geospatial queries (optional but recommended for performance)
CREATE INDEX IF NOT EXISTS idx_masjids_coordinates
ON masjids(latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN masjids.latitude IS 'Latitude coordinate (WGS84)';
COMMENT ON COLUMN masjids.longitude IS 'Longitude coordinate (WGS84)';

-- Sample update (update this for your specific masjids)
-- UPDATE masjids SET latitude = -37.7522, longitude = 144.9542 WHERE id = 9; -- Al Taqwa Masjid, Heidelberg West, VIC
