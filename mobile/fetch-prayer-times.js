// Script to fetch real prayer times from Awqat website
// Usage: node fetch-prayer-times.js <masjid-url>

const https = require('https');

const url = process.argv[2] || 'https://awqat.com.au/altaqwamasjid/';

console.log(`Fetching prayer times from: ${url}\n`);

https.get(url, (res) => {
  let html = '';

  res.on('data', (chunk) => {
    html += chunk;
  });

  res.on('end', () => {
    // Method 1: Extract from JavaScript variable
    const jsMatch = html.match(/(?:iqamafixed|prayertimes)\s*=\s*\[([^\]]+)\]/);

    if (jsMatch) {
      const timesStr = jsMatch[1];
      const times = timesStr
        .replace(/['"]/g, '')
        .replace(/\s/g, '')
        .split(',');

      console.log('✅ Prayer Times Found!\n');
      console.log('Raw array:', times);
      console.log('\nParsed Prayer Times:');
      console.log('-------------------');

      // Awqat typically has: Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha, Jumuah
      // We need: Fajr, Dhuhr, Asr, Maghrib, Isha
      if (times.length >= 6) {
        console.log(`Fajr:    ${times[0]}`);
        console.log(`Sunrise: ${times[1]} (ignored)`);
        console.log(`Dhuhr:   ${times[2]}`);
        console.log(`Asr:     ${times[3]}`);
        console.log(`Maghrib: ${times[4]}`);
        console.log(`Isha:    ${times[5]}`);

        console.log('\n📋 Copy this for your API:');
        console.log(JSON.stringify({
          fajr: times[0],
          dhuhr: times[2],
          asr: times[3],
          maghrib: times[4],
          isha: times[5]
        }, null, 2));
      }
    } else {
      console.log('❌ Could not find prayer times in JavaScript format');
      console.log('Trying HTML table parsing...\n');

      // Method 2: Try to extract from HTML
      const fajrMatch = html.match(/Fajr.*?(\d{1,2}:\d{2})/i);
      const dhuhrMatch = html.match(/Dhuhr.*?(\d{1,2}:\d{2})/i);
      const asrMatch = html.match(/Asr.*?(\d{1,2}:\d{2})/i);
      const maghribMatch = html.match(/Maghrib.*?(\d{1,2}:\d{2})/i);
      const ishaMatch = html.match(/Isha.*?(\d{1,2}:\d{2})/i);

      if (fajrMatch && dhuhrMatch && asrMatch && maghribMatch && ishaMatch) {
        console.log('✅ Prayer Times Found!\n');
        console.log('Fajr:   ', fajrMatch[1]);
        console.log('Dhuhr:  ', dhuhrMatch[1]);
        console.log('Asr:    ', asrMatch[1]);
        console.log('Maghrib:', maghribMatch[1]);
        console.log('Isha:   ', ishaMatch[1]);

        console.log('\n📋 Copy this for your API:');
        console.log(JSON.stringify({
          fajr: fajrMatch[1],
          dhuhr: dhuhrMatch[1],
          asr: asrMatch[1],
          maghrib: maghribMatch[1],
          isha: ishaMatch[1]
        }, null, 2));
      } else {
        console.log('❌ Could not extract prayer times from HTML');
        console.log('\nTip: Visit the URL in a browser to see the format');
      }
    }
  });

}).on('error', (err) => {
  console.error('❌ Error fetching URL:', err.message);
});

console.log('Fetching...\n');
