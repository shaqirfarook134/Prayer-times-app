-- Migration: Switch AMSSA from themasjidapp.org to awqat.com.au
-- awqat.com.au/amssa/ is more reliable and consistent with other VIC masjids.

UPDATE masjids
SET url = 'https://awqat.com.au/amssa/', updated_at = NOW()
WHERE url = 'https://themasjidapp.org/129086/prayers';
