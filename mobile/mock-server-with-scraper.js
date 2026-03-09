// Mock API server with live prayer time scraping
const http = require('http');
const https = require('https');

const masjids = [
  {
    id: 1,
    name: "Al Taqwa Masjid",
    url: "https://awqat.com.au/altaqwamasjid/",
    city: "Melbourne",
    state: "VIC",
    timezone: "Australia/Melbourne",
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Cache for prayer times
const prayerTimesCache = {};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Fixed Iqama times configuration (minutes after Adhan)
const IQAMA_OFFSET = {
  fajr: 20,
  dhuhr: 10, // Will be overridden by fixed time
  asr: 10,
  maghrib: 7,
  isha: 10  // Will be overridden by fixed time
};

// Fixed iqama times for specific prayers
const FIXED_IQAMA = {
  1: { dhuhr: "14:15", isha: "21:30" }, // Al Taqwa
  2: { dhuhr: "14:00", isha: "21:15" }, // Preston Mosque
  3: { dhuhr: "14:00", isha: "21:00" }  // Sydney
};

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

function scrapePrayerTimes(url, masjidId) {
  return new Promise((resolve, reject) => {
    https.get(url + 'iqamafixed.js', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          // Extract FIXED_IQAMA_TIMES array
          const iqamaMatch = data.match(/var FIXED_IQAMA_TIMES = \[([^\]]+)\]/);
          if (!iqamaMatch) {
            reject(new Error('Could not find FIXED_IQAMA_TIMES'));
            return;
          }

          const iqamaArray = iqamaMatch[1].split(',').map(s => s.trim().replace(/'/g, ''));

          // Update fixed iqama times if found
          if (iqamaArray[2]) FIXED_IQAMA[masjidId].dhuhr = iqamaArray[2];
          if (iqamaArray[5]) FIXED_IQAMA[masjidId].isha = iqamaArray[5];

          console.log(`✅ Fixed Iqama times updated for masjid ${masjidId}:`, FIXED_IQAMA[masjidId]);

          // Now fetch the main page for Adhan times
          fetchAdhanTimes(url, masjidId)
            .then(resolve)
            .catch(reject);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function fetchAdhanTimes(url, masjidId) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          // Look for prayer times in the HTML
          // Awqat websites typically have times in a table or div with class "time"
          const timeMatches = data.match(/<td[^>]*class="time"[^>]*>(\d{1,2}:\d{2})<\/td>/g);

          if (!timeMatches || timeMatches.length < 5) {
            // Fallback: try to find times in any format
            const allTimes = data.match(/\b(\d{1,2}:\d{2})\b/g);
            if (allTimes && allTimes.length >= 5) {
              console.log('⚠️  Using fallback time extraction');
              const adhanTimes = {
                fajr: allTimes[0],
                dhuhr: allTimes[2],
                asr: allTimes[3],
                maghrib: allTimes[4],
                isha: allTimes[5]
              };
              resolve(createPrayerTimesObject(adhanTimes, masjidId));
              return;
            }
            reject(new Error('Could not extract prayer times from HTML'));
            return;
          }

          // Extract times from HTML
          const times = timeMatches.map(m => m.match(/(\d{1,2}:\d{2})/)[1]);

          // Map to prayer names (usually: Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha)
          const adhanTimes = {
            fajr: times[0],
            dhuhr: times[2], // Skip sunrise
            asr: times[3],
            maghrib: times[4],
            isha: times[5]
          };

          console.log(`✅ Scraped Adhan times for masjid ${masjidId}:`, adhanTimes);
          resolve(createPrayerTimesObject(adhanTimes, masjidId));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function createPrayerTimesObject(adhanTimes, masjidId) {
  const prayerTimes = {
    masjid_id: masjidId,
    date: new Date().toISOString().split('T')[0]
  };

  // For each prayer, calculate iqama time
  ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach(prayer => {
    const adhan = adhanTimes[prayer];
    let iqama;

    // Use fixed iqama if available
    if (FIXED_IQAMA[masjidId] && FIXED_IQAMA[masjidId][prayer]) {
      iqama = FIXED_IQAMA[masjidId][prayer];
    } else {
      // Calculate iqama from offset
      iqama = addMinutes(adhan, IQAMA_OFFSET[prayer]);
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

  // Scrape fresh data
  console.log(`🔄 Fetching fresh prayer times for masjid ${masjidId}...`);
  const masjid = masjids.find(m => m.id === masjidId);

  if (!masjid) {
    throw new Error('Masjid not found');
  }

  try {
    const prayerTimes = await scrapePrayerTimes(masjid.url, masjidId);

    // Cache the result
    prayerTimesCache[cacheKey] = {
      data: prayerTimes,
      timestamp: Date.now()
    };

    return prayerTimes;
  } catch (error) {
    console.error(`❌ Error scraping prayer times for masjid ${masjidId}:`, error.message);

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
        masjids.push(newMasjid);

        // Initialize fixed iqama for new masjid
        FIXED_IQAMA[newMasjid.id] = { dhuhr: "14:00", isha: "21:00" };

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
      delete FIXED_IQAMA[id];
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
      last_update: Math.max(...Object.values(prayerTimesCache).map(c => c.timestamp) || [0])
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Mock API Server with Live Scraping running on http://localhost:${PORT}`);
  console.log(`\n📡 Features:`);
  console.log(`  - Live prayer time scraping from Awqat websites`);
  console.log(`  - Auto-refresh every 60 minutes`);
  console.log(`  - 1-hour cache for performance`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /api/v1/masjids`);
  console.log(`  GET  /api/v1/masjids/:id`);
  console.log(`  GET  /api/v1/prayer-times/:masjidId (LIVE DATA)`);
  console.log(`  POST /api/v1/admin/masjids`);
  console.log(`  DELETE /api/v1/admin/masjids/:id`);
  console.log(`  POST /api/v1/devices/register`);
  console.log(`  GET  /health`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
