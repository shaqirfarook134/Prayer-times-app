-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Masjids table
CREATE TABLE masjids (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(512) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    timezone VARCHAR(100) NOT NULL DEFAULT 'Australia/Melbourne',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(url)
);

-- Create index for faster lookups
CREATE INDEX idx_masjids_city_state ON masjids(city, state);

-- Prayer times table
CREATE TABLE prayer_times (
    id SERIAL PRIMARY KEY,
    masjid_id INTEGER NOT NULL REFERENCES masjids(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    fajr TIME NOT NULL,
    dhuhr TIME NOT NULL,
    asr TIME NOT NULL,
    maghrib TIME NOT NULL,
    isha TIME NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(masjid_id, date),
    -- Validation: times must be in chronological order
    CHECK (fajr < dhuhr AND dhuhr < asr AND asr < maghrib AND maghrib < isha)
);

-- Create indexes for frequent queries
CREATE INDEX idx_prayer_times_masjid_date ON prayer_times(masjid_id, date DESC);
CREATE INDEX idx_prayer_times_date ON prayer_times(date);

-- Logs table for monitoring and debugging
CREATE TABLE logs (
    id SERIAL PRIMARY KEY,
    masjid_id INTEGER REFERENCES masjids(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL, -- success, error, warning
    message TEXT NOT NULL,
    metadata JSONB, -- Additional context
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for log queries
CREATE INDEX idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX idx_logs_masjid_id ON logs(masjid_id);
CREATE INDEX idx_logs_status ON logs(status);

-- Device tokens table for push notifications
CREATE TABLE device_tokens (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255), -- Optional: for future user management
    token VARCHAR(512) NOT NULL UNIQUE,
    platform VARCHAR(20) NOT NULL, -- 'ios' or 'android'
    masjid_id INTEGER REFERENCES masjids(id) ON DELETE SET NULL,
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for device tokens
CREATE INDEX idx_device_tokens_masjid_id ON device_tokens(masjid_id);
CREATE INDEX idx_device_tokens_platform ON device_tokens(platform);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_masjids_updated_at BEFORE UPDATE ON masjids
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_device_tokens_updated_at BEFORE UPDATE ON device_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert seed data for testing
INSERT INTO masjids (name, url, city, state, timezone) VALUES
    ('Al Taqwa Masjid', 'https://awqat.com.au/altaqwamasjid/', 'Melbourne', 'VIC', 'Australia/Melbourne');

-- Comments for documentation
COMMENT ON TABLE masjids IS 'Stores mosque/masjid information';
COMMENT ON TABLE prayer_times IS 'Stores daily prayer times for each masjid';
COMMENT ON TABLE logs IS 'Stores system logs for monitoring and debugging';
COMMENT ON TABLE device_tokens IS 'Stores device FCM/APNs tokens for push notifications';
COMMENT ON COLUMN prayer_times.last_updated IS 'Timestamp of last data update - used for change detection';
