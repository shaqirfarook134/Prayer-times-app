-- Migration: Add 12 new Victorian masjids + rename Masjid Ar-Rahman → Masjid Ar-Rahmah

-- Rename fix
UPDATE masjids SET name = 'Masjid Ar-Rahmah' WHERE url = 'https://awqat.com.au/marr/';

-- New masjids
-- ISV (Preston Mosque): prayer times via TheMasjidApp iframe (themasjidapp.org/128422/prayers)
-- AAIS: no structured prayer times on website — skipped
-- MasjidBox sites: existing masjidbox.com scraper handles these automatically
-- IEWAD: prayer times via AthanPlus widget
-- AICOM: prayer times via Masjidal WordPress plugin
-- UMIS, ISOMER, Sunshine Mosque: prayer times via AlAdhan API (JS-rendered widgets)
INSERT INTO masjids (name, url, city, state, timezone, latitude, longitude) VALUES
    ('ISV Preston Mosque',                   'https://isv.org.au/',                                                       'Preston',           'VIC', 'Australia/Melbourne', -37.74860, 145.00310),
    ('Quba Mosque',                          'https://masjidbox.com/prayer-times/qubamosque',                             'Craigieburn',       'VIC', 'Australia/Melbourne', -37.59720, 144.94360),
    ('UMIS',                                 'https://umis.com.au/prayertimes.html',                                      'Melbourne',         'VIC', 'Australia/Melbourne', -37.81360, 144.96310),
    ('Lysterfield Mosque',                   'https://isomer.org.au/',                                                    'Lysterfield',       'VIC', 'Australia/Melbourne', -37.90730, 145.28150),
    ('Elsedeaq Heidelberg Mosque',           'https://masjidbox.com/prayer-times/elsedeaq-heidelberg-mosque',             'Heidelberg Heights','VIC', 'Australia/Melbourne', -37.74940, 145.04580),
    ('Sunshine Mosque',                      'https://www.sunshinemosque.com.au/',                                        'Ardeer',            'VIC', 'Australia/Melbourne', -37.78900, 144.83000),
    ('IEWAD',                                'https://iewad.org.au/prayer-times',                                         'Narre Warren North','VIC', 'Australia/Melbourne', -37.99450, 145.29040),
    ('Campbellfield Mosque',                 'https://masjidbox.com/prayer-times/campbellfield-mosque',                   'Campbellfield',     'VIC', 'Australia/Melbourne', -37.66660, 144.97940),
    ('Australian Bosnian Islamic Centre',    'https://masjidbox.com/prayer-times/australian-bosnian-islamic-centre',      'Albanvale',         'VIC', 'Australia/Melbourne', -37.74720, 144.76510),
    ('La Trobe Mosque',                      'https://masjidbox.com/prayer-times/la-trobe-mosque',                        'Bundoora',          'VIC', 'Australia/Melbourne', -37.72050, 145.04800),
    ('Afghan Islamic Centre',                'https://aicom.com.au/',                                                     'Doveton',           'VIC', 'Australia/Melbourne', -37.9922743, 145.2360755)
ON CONFLICT (url) DO NOTHING;
