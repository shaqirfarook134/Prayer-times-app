// API server with live prayer time calculation using PrayTimes library
const http = require('http');
const https = require('https');

// PrayTimes calculation based on location coordinates
// This matches what Awqat websites use
const masjids = [
  {
    id: 1,
    name: "Al Taqwa Masjid",
    url: "https://awqat.com.au/altaqwamasjid/",
    city: "Melbourne",
    state: "VIC",
    timezone: "Australia/Melbourne",
    latitude: -37.7074,
    longitude: 145.1544,
    method: "MWL", // Muslim World League
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 2,
    name: "Preston Mosque",
    url: "https://awqat.com.au/prestonmosque/",
    city: "Melbourne",
    state: "VIC",
    timezone: "Australia/Melbourne",
    latitude: -37.7385,
    longitude: 145.0030,
    method: "MWL",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 3,
    name: "Sydney Islamic Centre",
    url: "https://awqat.com.au/sydney/",
    city: "Sydney",
    state: "NSW",
    timezone: "Australia/Sydney",
    latitude: -33.8688,
    longitude: 151.2093,
    method: "MWL",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Fixed Iqama configurations per masjid
const iqamaConfig = {
  1: { // Al Taqwa
    fajr: 20,      // 20 min after Adhan
    dhuhr: "14:15", // Fixed time
    asr: 10,
    maghrib: 7,
    isha: "21:30"  // Fixed time
  },
  2: { // Preston Mosque
    fajr: 15,
    dhuhr: "14:00",
    asr: 10,
    maghrib: 5,
    isha: "21:15"
  },
  3: { // Sydney
    fajr: 20,
    dhuhr: "14:00",
    asr: 15,
    maghrib: 7,
    isha: "21:00"
  }
};

// Cache for prayer times
const prayerTimesCache = {};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

function convertTo12Hour(time24) {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function addMinutes(time24, minutesToAdd) {
  const [hours, minutes] = time24.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
}

// Simple PrayTimes calculator
// Based on https://github.com/praytimes/praytimes
function calculatePrayerTimes(latitude, longitude, date = new Date()) {
  // This is a simplified version. For production, use the full PrayTimes library
  // or fetch from Al Adhan API

  // For Melbourne coordinates (-37.7, 145.1), March 2026
  // These are approximate calculations
  const jd = julianDate(date);
  const timeZone = 11; // Melbourne UTC+11

  // Simplified calculation (would need full astronomical calculations in production)
  // Using hardcoded values for March 2026 Melbourne as approximation
  const sunriseTime = 6.95;  // ~6:57 AM
  const sunsetTime = 19.55;  // ~7:33 PM

  const fajr = timeToString(sunriseTime - 1.5);    // ~5:27 AM
  const dhuhr = timeToString(13.28);                // ~1:17 PM
  const asr = timeToString(17.07);                  // ~5:04 PM
  const maghrib = timeToString(sunsetTime);         // ~7:33 PM
  const isha = timeToString(sunsetTime + 1.5);      // ~9:03 PM

  return {
    fajr,
    dhuhr,
    asr,
    maghrib,
    isha
  };
}

function julianDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (month <= 2) {
    year -= 1;
    month += 12;
  }

  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);

  return Math.floor(365.25 * (year + 4716)) +
         Math.floor(30.6001 * (month + 1)) +
         day + B - 1524.5;
}

function timeToString(time) {
  const hours = Math.floor(time);
  const minutes = Math.round((time - hours) * 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Fetch prayer times from Al Adhan API (more reliable than scraping)
function fetchPrayerTimesFromAPI(latitude, longitude, masjidId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=3`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 200 && json.data && json.data.timings) {
            const timings = json.data.timings;
            const adhanTimes = {
              fajr: timings.Fajr,
              dhuhr: timings.Dhuhr,
              asr: timings.Asr,
              maghrib: timings.Maghrib,
              isha: timings.Isha
            };
            resolve(createPrayerTimesObject(adhanTimes, masjidId));
          } else {
            reject(new Error('Invalid API response'));
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function createPrayerTimesObject(adhanTimes, masjidId) {
  const config = iqamaConfig[masjidId];
  const prayerTimes = {
    masjid_id: masjidId,
    date: new Date().toISOString().split('T')[0]
  };

  // For each prayer, calculate iqama time
  ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach(prayer => {
    const adhan = adhanTimes[prayer];
    let iqama;

    // Use fixed iqama if it's a string, otherwise add minutes
    if (typeof config[prayer] === 'string') {
      iqama = config[prayer];
    } else {
      iqama = addMinutes(adhan, config[prayer]);
    }

    prayerTimes[prayer] = {
      adhan: adhan,
      iqama: iqama,
      adhan12: convertTo12Hour(adhan),
      iqama12: convertTo12Hour(iqama)
    };
  });

  return prayerTimes;
}

async function getPrayerTimes(masjidId) {
  const cacheKey = `masjid_${masjidId}`;
  const cached = prayerTimesCache[cacheKey];

  // Return cached if fresh (less than 1 hour old)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`📦 Using cached prayer times for masjid ${masjidId}`);
    return cached.data;
  }

  // Fetch fresh data
  console.log(`🔄 Fetching fresh prayer times for masjid ${masjidId}...`);
  const masjid = masjids.find(m => m.id === masjidId);

  if (!masjid) {
    throw new Error('Masjid not found');
  }

  try {
    // Fetch from Al Adhan API
    const prayerTimes = await fetchPrayerTimesFromAPI(masjid.latitude, masjid.longitude, masjidId);

    // Cache the result
    prayerTimesCache[cacheKey] = {
      data: prayerTimes,
      timestamp: Date.now()
    };

    console.log(`✅ Fetched prayer times for ${masjid.name}:`, prayerTimes.fajr.adhan12, prayerTimes.fajr.iqama12);

    return prayerTimes;
  } catch (error) {
    console.error(`❌ Error fetching prayer times for masjid ${masjidId}:`, error.message);

    // Return cached data even if stale, or throw error
    if (cached) {
      console.log(`⚠️  Returning stale cached data for masjid ${masjidId}`);
      return cached.data;
    }

    throw error;
  }
}

// Auto-refresh prayer times every hour
setInterval(() => {
  console.log('⏰ Hourly refresh: Updating prayer times for all masjids...');
  masjids.forEach(masjid => {
    getPrayerTimes(masjid.id).catch(err => {
      console.error(`Failed to refresh masjid ${masjid.id}:`, err.message);
    });
  });
}, 60 * 60 * 1000); // Every hour

// Initial fetch for all masjids
console.log('🚀 Initial fetch: Loading prayer times for all masjids...');
masjids.forEach(masjid => {
  getPrayerTimes(masjid.id).catch(err => {
    console.error(`Failed to load masjid ${masjid.id}:`, err.message);
  });
});

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`${req.method} ${req.url}`);

  // Routes
  if (req.url === '/api/v1/masjids' || req.url === '/api/v1/masjids/') {
    res.writeHead(200);
    res.end(JSON.stringify(masjids));
  } else if (req.url.match(/^\/api\/v1\/masjids\/\d+$/)) {
    // Get single masjid by ID
    const id = parseInt(req.url.split('/').pop());
    const masjid = masjids.find(m => m.id === id);
    if (masjid) {
      res.writeHead(200);
      res.end(JSON.stringify(masjid));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Masjid not found' }));
    }
  } else if (req.url === '/api/v1/admin/masjids' && req.method === 'POST') {
    // Add new masjid
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const newMasjid = JSON.parse(body);
        newMasjid.id = masjids.length + 1;
        newMasjid.created_at = new Date().toISOString();
        newMasjid.updated_at = new Date().toISOString();

        // Set default coordinates for Melbourne if not provided
        if (!newMasjid.latitude) newMasjid.latitude = -37.7074;
        if (!newMasjid.longitude) newMasjid.longitude = 145.1544;
        if (!newMasjid.method) newMasjid.method = "MWL";

        masjids.push(newMasjid);

        // Initialize iqama config for new masjid
        iqamaConfig[newMasjid.id] = {
          fajr: 20,
          dhuhr: "14:00",
          asr: 10,
          maghrib: 7,
          isha: "21:00"
        };

        console.log('Masjid added:', newMasjid.name);
        res.writeHead(201);
        res.end(JSON.stringify(newMasjid));

        // Fetch prayer times for new masjid
        getPrayerTimes(newMasjid.id).catch(err => {
          console.error(`Failed to fetch times for new masjid:`, err.message);
        });
      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else if (req.url.match(/^\/api\/v1\/admin\/masjids\/\d+$/) && req.method === 'DELETE') {
    // Delete masjid
    const id = parseInt(req.url.split('/').pop());
    const index = masjids.findIndex(m => m.id === id);
    if (index !== -1) {
      const deleted = masjids.splice(index, 1)[0];
      delete prayerTimesCache[`masjid_${id}`];
      delete iqamaConfig[id];
      console.log('Masjid deleted:', deleted.name);
      res.writeHead(200);
      res.end(JSON.stringify({ message: 'Masjid deleted successfully' }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Masjid not found' }));
    }
  } else if (req.url.match(/^\/api\/v1\/prayer-times\/\d+$/)) {
    const masjidId = parseInt(req.url.split('/').pop());

    getPrayerTimes(masjidId)
      .then(times => {
        res.writeHead(200);
        res.end(JSON.stringify(times));
      })
      .catch(error => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      });
  } else if (req.url === '/api/v1/devices/register' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      console.log('Device registered:', body);
      res.writeHead(200);
      res.end(JSON.stringify({ message: 'Device registered successfully', id: 1 }));
    });
  } else if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      cached_masjids: Object.keys(prayerTimesCache).length,
      last_update: Math.max(...Object.values(prayerTimesCache).map(c => c.timestamp).concat([0])),
      next_refresh: new Date(Date.now() + CACHE_DURATION).toLocaleString()
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Prayer Times API Server running on http://localhost:${PORT}`);
  console.log(`\n📡 Features:`);
  console.log(`  - Live prayer times from Al Adhan API`);
  console.log(`  - Auto-refresh every 60 minutes`);
  console.log(`  - Masjid-specific Iqama times`);
  console.log(`  - 1-hour cache for performance`);
  console.log(`\n🕌 Configured Masjids:`);
  masjids.forEach(m => {
    console.log(`  ${m.id}. ${m.name} (${m.city}, ${m.state})`);
  });
  console.log(`\n📍 Endpoints:`);
  console.log(`  GET  /api/v1/masjids - List all masjids`);
  console.log(`  GET  /api/v1/masjids/:id - Get single masjid`);
  console.log(`  GET  /api/v1/prayer-times/:id - Get live prayer times`);
  console.log(`  POST /api/v1/admin/masjids - Add new masjid`);
  console.log(`  DELETE /api/v1/admin/masjids/:id - Delete masjid`);
  console.log(`  GET  /health - Server health check`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
