-- Rollback: Remove all Victorian masjids added from awqat.com.au directory
-- Note: This also cascades to prayer_times, jummah_times, and device_tokens due to ON DELETE CASCADE.

DELETE FROM masjids WHERE url IN (
    'https://awqat.com.au/erm/',
    'https://awqat.com.au/fmf/',
    'https://awqat.com.au/fmm/',
    'https://awqat.com.au/icmgbrimbank/',
    'https://awqat.com.au/iamm/',
    'https://awqat.com.au/imc/',
    'https://awqat.com.au/imcv/',
    'https://awqat.com.au/mic/',
    'https://awqat.com.au/mkw/',
    'https://awqat.com.au/nfa/',
    'https://awqat.com.au/lsmf/',
    'https://awqat.com.au/swmh/',
    'https://awqat.com.au/umma/',
    'https://awqat.com.au/aycc/',
    'https://awqat.com.au/gwm/',
    'https://awqat.com.au/mbm/',
    'https://awqat.com.au/marr/',
    'https://awqat.com.au/rca/',
    'https://awqat.com.au/pcic/',
    'https://awqat.com.au/vmm/'
);
