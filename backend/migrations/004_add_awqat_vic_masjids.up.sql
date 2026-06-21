-- Migration: Add all Victorian masjids from awqat.com.au directory
-- The existing scraper handles awqat.com.au URLs automatically (file-mode or GPS-mode).
-- Uses ON CONFLICT DO NOTHING to be idempotent (safe to run if some already exist).

INSERT INTO masjids (name, url, city, state, timezone, latitude, longitude) VALUES
    ('Exford Road Musallah',             'https://awqat.com.au/erm/',           'Melton South',    'VIC', 'Australia/Melbourne', -37.70773, 144.57493),
    ('Fitzroy Masjid',                   'https://awqat.com.au/fmf/',           'Fitzroy',         'VIC', 'Australia/Melbourne', -37.79839, 144.97833),
    ('Footscray Musalla Masjid',         'https://awqat.com.au/fmm/',           'Footscray',       'VIC', 'Australia/Melbourne', -37.80210, 144.90000),
    ('ICMG Brimbank',                    'https://awqat.com.au/icmgbrimbank/',  'Sunshine',        'VIC', 'Australia/Melbourne', -37.78500, 144.83200),
    ('Islamic Assoc. Monash University', 'https://awqat.com.au/iamm/',          'Clayton',         'VIC', 'Australia/Melbourne', -37.91667, 145.11667),
    ('IISNA MyCentre',                   'https://awqat.com.au/imc/',           'Broadmeadows',    'VIC', 'Australia/Melbourne', -37.68015, 144.91877),
    ('IMCV Surau Kita',                  'https://awqat.com.au/imcv/',          'Coburg North',    'VIC', 'Australia/Melbourne', -37.72867, 144.96134),
    ('Maidstone Al-Noor Mosque',         'https://awqat.com.au/mic/',           'Maidstone',       'VIC', 'Australia/Melbourne', -37.78900, 144.87900),
    ('Masjid Khalid Bin Al-Waleed',      'https://awqat.com.au/mkw/',           'Albion',          'VIC', 'Australia/Melbourne', -37.77500, 144.84000),
    ('Najashi Foundation Australia',     'https://awqat.com.au/nfa/',           'Maidstone',       'VIC', 'Australia/Melbourne', -37.78700, 144.88000),
    ('Leo St. Musallah',                 'https://awqat.com.au/lsmf/',          'Fawkner',         'VIC', 'Australia/Melbourne', -37.71667, 144.96667),
    ('Swinburne University Musallah',    'https://awqat.com.au/swmh/',          'Hawthorn',        'VIC', 'Australia/Melbourne', -37.81992, 145.03580),
    ('UMMA',                             'https://awqat.com.au/umma/',          'Doncaster',       'VIC', 'Australia/Melbourne', -37.79000, 145.12500),
    ('AYCC',                             'https://awqat.com.au/aycc/',          'Hoppers Crossing', 'VIC', 'Australia/Melbourne', -37.88500, 144.69500),
    ('Golden Wattle Masjid',             'https://awqat.com.au/gwm/',           'Tarneit',         'VIC', 'Australia/Melbourne', -37.85000, 144.68000),
    ('Masjid Baitul Ma''mur',            'https://awqat.com.au/mbm/',           'Laverton',        'VIC', 'Australia/Melbourne', -37.85600, 144.77800),
    ('Masjid Ar-Rahman',                 'https://awqat.com.au/marr/',          'Ravenhall',       'VIC', 'Australia/Melbourne', -37.76552, 144.75105),
    ('Rabita Centre Australia',          'https://awqat.com.au/rca/',           'Rockbank',        'VIC', 'Australia/Melbourne', -37.75000, 144.64000),
    ('Point Cook Islamic Center',        'https://awqat.com.au/pcic/',          'Point Cook',      'VIC', 'Australia/Melbourne', -37.91482, 144.75088),
    ('Virgin Mary Mosque',               'https://awqat.com.au/vmm/',           'Hoppers Crossing', 'VIC', 'Australia/Melbourne', -37.88200, 144.69800)
ON CONFLICT (url) DO NOTHING;
