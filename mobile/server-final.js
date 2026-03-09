// API server with live prayer time scraping from Awqat data files
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
    cityCode: "AU.MELBOURNE",
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
    cityCode: "AU.MELBOURNE",
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
    cityCode: "AU.SYDNEY",
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

// Scrape prayer times from Awqat data file
function scrapePrayerTimesFromAwqat(masjid) {
  return new Promise((resolve, reject) => {
    const dataUrl = `${masjid.url}data/wtimes-${masjid.cityCode}.ini`;

    console.log(`📡 Scraping: ${dataUrl}`);

    https.get(dataUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          // Get today's date in MM-DD format
          const today = new Date();
          const month = String(today.getMonth() + 1).padStart(2, '0');
          const day = String(today.getDate()).padStart(2, '0');
          const dateKey = `${month}-${day}`;

          // Find today's prayer times
          // Format: "03-09~~~~~05:41|07:12|13:31|17:07|19:54|21:01"
          const regex = new RegExp(`"${dateKey}~+([^"]+)"`, 'g');
          const match = regex.exec(data);

          if (!match) {
            reject(new Error(`Prayer times not found for date ${dateKey}`));
            return;
          }

          // Extract times: Fajr|Sunrise|Dhuhr|Asr|Maghrib|Isha
          const times = match[1].split('|');

          if (times.length < 6) {
            reject(new Error('Invalid prayer times format'));
            return;
          }

          const adhanTimes = {
            fajr: times[0],
            dhuhr: times[2],    // Skip sunrise (times[1])
            asr: times[3],
            maghrib: times[4],
            isha: times[5]
          };

          console.log(`✅ Scraped Adhan times for ${masjid.name} (${dateKey}):`, adhanTimes);

          // Now fetch fixed iqama times
          const iqamaUrl = `${masjid.url}iqamafixed.js`;
          https.get(iqamaUrl, (iqamaRes) => {
            let iqamaData = '';
            iqamaRes.on('data', (chunk) => iqamaData += chunk);
            iqamaRes.on('end', () => {
              try {
                // Extract FIXED_IQAMA_TIMES array
                const iqamaMatch = iqamaData.match(/var FIXED_IQAMA_TIMES = \[([^\]]+)\]/);
                if (iqamaMatch) {
                  const iqamaArray = iqamaMatch[1].split(',').map(s => s.trim().replace(/'/g, ''));

                  // Update fixed iqama times if found
                  if (iqamaArray[2] && iqamaArray[2] !== '') {
                    iqamaConfig[masjid.id].dhuhr = iqamaArray[2];
                  }
                  if (iqamaArray[5] && iqamaArray[5] !== '') {
                    iqamaConfig[masjid.id].isha = iqamaArray[5];
                  }

                  console.log(`✅ Updated fixed Iqama times for ${masjid.name}:`, iqamaConfig[masjid.id]);
                }
              } catch (err) {
                console.log(`⚠️  Could not parse iqamafixed.js for ${masjid.name}, using defaults`);
              }

              // Create final prayer times object
              resolve(createPrayerTimesObject(adhanTimes, masjid.id));
            });
          }).on('error', (err) => {
            console.log(`⚠️  Could not fetch iqamafixed.js, using defaults:`, err.message);
            resolve(createPrayerTimesObject(adhanTimes, masjid.id));
          });

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
    const prayerTimes = await scrapePrayerTimesFromAwqat(masjid);

    // Cache the result
    prayerTimesCache[cacheKey] = {
      data: prayerTimes,
      timestamp: Date.now()
    };

    console.log(`✅ Prayer times cached for ${masjid.name}`);

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
  console.log('\n⏰ Hourly refresh: Updating prayer times for all masjids...');
  masjids.forEach(masjid => {
    getPrayerTimes(masjid.id).catch(err => {
      console.error(`Failed to refresh masjid ${masjid.id}:`, err.message);
    });
  });
}, 60 * 60 * 1000); // Every hour

// Initial fetch for all masjids
console.log('\n🚀 Initial fetch: Loading prayer times for all masjids...');
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

        // Set default city code if not provided
        if (!newMasjid.cityCode) newMasjid.cityCode = "AU.MELBOURNE";

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
  console.log(`\n✅ Prayer Times API Server (Awqat Scraper) running on http://localhost:${PORT}`);
  console.log(`\n📡 Features:`);
  console.log(`  - Live scraping from Awqat data files`);
  console.log(`  - Auto-refresh every 60 minutes`);
  console.log(`  - Masjid-specific Iqama times`);
  console.log(`  - 1-hour cache for performance`);
  console.log(`  - Accurate prayer times updated daily`);
  console.log(`\n🕌 Configured Masjids:`);
  masjids.forEach(m => {
    console.log(`  ${m.id}. ${m.name} (${m.city}, ${m.state})`);
  });
  console.log(`\n📍 Endpoints:`);
  console.log(`  GET  /api/v1/masjids - List all masjids`);
  console.log(`  GET  /api/v1/masjids/:id - Get single masjid`);
  console.log(`  GET  /api/v1/prayer-times/:id - Get live prayer times (scraped)`);
  console.log(`  POST /api/v1/admin/masjids - Add new masjid`);
  console.log(`  DELETE /api/v1/admin/masjids/:id - Delete masjid`);
  console.log(`  GET  /health - Server health check`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
