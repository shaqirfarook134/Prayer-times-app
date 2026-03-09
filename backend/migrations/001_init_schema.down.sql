-- Drop tables in reverse order (respecting foreign key constraints)
DROP TABLE IF EXISTS device_tokens CASCADE;
DROP TABLE IF EXISTS logs CASCADE;
DROP TABLE IF EXISTS prayer_times CASCADE;
DROP TABLE IF EXISTS masjids CASCADE;

-- Drop function
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- Drop extension if no longer needed
-- DROP EXTENSION IF EXISTS "uuid-ossp";
