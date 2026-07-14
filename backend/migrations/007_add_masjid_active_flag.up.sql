-- Add an is_active flag so masjids can be hidden from the app without deleting
-- their data (e.g. a site becomes unscrapeable). Expand step: nullable-safe with
-- a DEFAULT true, so the currently-deployed binary keeps working unchanged and
-- every existing masjid stays active.
ALTER TABLE masjids
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Partial index: the public list filters on is_active = true (the common path).
CREATE INDEX IF NOT EXISTS idx_masjids_active ON masjids(is_active) WHERE is_active = true;
