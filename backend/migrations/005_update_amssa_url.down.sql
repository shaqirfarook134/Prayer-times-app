-- Rollback: Restore AMSSA URL to themasjidapp.org

UPDATE masjids
SET url = 'https://themasjidapp.org/129086/prayers', updated_at = NOW()
WHERE url = 'https://awqat.com.au/amssa/';
