-- Jummah times table
-- Stores Jumu'ah (Friday prayer) session times per masjid.
-- Separate from prayer_times since session count varies (1–3 per masjid).
CREATE TABLE jummah_times (
    id           SERIAL PRIMARY KEY,
    masjid_id    INTEGER NOT NULL REFERENCES masjids(id) ON DELETE CASCADE,
    session      INTEGER NOT NULL CHECK (session >= 1 AND session <= 5),
    time         TIME NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(masjid_id, session)
);

CREATE INDEX idx_jummah_times_masjid ON jummah_times(masjid_id);
