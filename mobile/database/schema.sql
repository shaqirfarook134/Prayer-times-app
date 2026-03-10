-- Prayer Times App Database Schema
-- PostgreSQL 14+

-- Table for storing masjid information
CREATE TABLE IF NOT EXISTS masjids (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(500) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  timezone VARCHAR(100) NOT NULL DEFAULT 'Australia/Melbourne',
  city_code VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for storing iqama configuration per masjid
CREATE TABLE IF NOT EXISTS iqama_config (
  id SERIAL PRIMARY KEY,
  masjid_id INTEGER NOT NULL REFERENCES masjids(id) ON DELETE CASCADE,
  prayer_name VARCHAR(50) NOT NULL CHECK (prayer_name IN ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
  iqama_offset INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(masjid_id, prayer_name)
);

-- Table for storing device tokens for push notifications
CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android')),
  masjid_id INTEGER REFERENCES masjids(id) ON DELETE SET NULL,
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default masjids
INSERT INTO masjids (name, url, city, state, timezone, city_code) VALUES
  ('Al Taqwa Masjid', 'https://awqat.com.au/altaqwamasjid/', 'Melbourne', 'VIC', 'Australia/Melbourne', 'altaqwamasjid'),
  ('Preston Mosque', 'https://awqat.com.au/preston/', 'Melbourne', 'VIC', 'Australia/Melbourne', 'preston'),
  ('Westall Road Mosque', 'https://awqat.com.au/westall/', 'Melbourne', 'VIC', 'Australia/Melbourne', 'westall')
ON CONFLICT DO NOTHING;

-- Insert default iqama configurations
INSERT INTO iqama_config (masjid_id, prayer_name, iqama_offset)
SELECT m.id, prayer.name, 20
FROM masjids m
CROSS JOIN (VALUES ('fajr'), ('dhuhr'), ('asr'), ('maghrib'), ('isha')) AS prayer(name)
ON CONFLICT (masjid_id, prayer_name) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_masjids_city_code ON masjids(city_code);
CREATE INDEX IF NOT EXISTS idx_iqama_config_masjid_id ON iqama_config(masjid_id);
CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(token);
CREATE INDEX IF NOT EXISTS idx_devices_masjid_id ON devices(masjid_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update updated_at
CREATE TRIGGER update_masjids_updated_at BEFORE UPDATE ON masjids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_iqama_config_updated_at BEFORE UPDATE ON iqama_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
