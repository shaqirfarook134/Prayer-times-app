-- Rollback: remove new masjids and revert Ar-Rahmah rename
UPDATE masjids SET name = 'Masjid Ar-Rahman' WHERE url = 'https://awqat.com.au/marr/';

DELETE FROM masjids WHERE url IN (
    'https://isv.org.au/',
    'https://masjidbox.com/prayer-times/qubamosque',
    'https://umis.com.au/prayertimes.html',
    'https://isomer.org.au/',
    'https://masjidbox.com/prayer-times/elsedeaq-heidelberg-mosque',
    'https://www.sunshinemosque.com.au/',
    'https://iewad.org.au/prayer-times',
    'https://masjidbox.com/prayer-times/campbellfield-mosque',
    'https://masjidbox.com/prayer-times/australian-bosnian-islamic-centre',
    'https://masjidbox.com/prayer-times/la-trobe-mosque',
    'https://aicom.com.au/'
);
