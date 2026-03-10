// Production-ready API server with PostgreSQL database
const http = require('http');
const https = require('https');
const { Pool } = require('pg');

// ========== CONSTANTS ==========
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const RATE_LIMIT_REQUESTS = 100; // per window
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const DEFAULT_CITY_CODE = 'AU.MELBOURNE';
const TIMEZONE = 'Australia/Melbourne';

// ========== DATABASE CONNECTION ==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  } else {
    console.log('✅ Database connected successfully at', res.rows[0].now);
  }
});

// ========== STATE ==========
const prayerTimesCache = {};
const scrapingInProgress = {}; // Prevent concurrent scraping
const rateLimitMap = new Map();

// ========== UTILITY FUNCTIONS ==========

function getMelbourneDate() {
  const dateString = new Date().toLocaleString('en-US', {
    timeZone: TIMEZONE
  });
  return new Date(dateString);
}

function formatDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

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

// ========== RATE LIMITING ==========

function checkRateLimit(ip) {
  const now = Date.now();
  const requests = rateLimitMap.get(ip) || [];

  // Remove old requests outside window
  const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= RATE_LIMIT_REQUESTS) {
    return false;
  }

  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);
  return true;
}

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, requests] of rateLimitMap.entries()) {
    const recent = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
    if (recent.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, recent);
    }
  }
}, 5 * 60 * 1000);

// ========== REQUEST BODY PARSER ==========

function parseRequestBody(req, maxSize = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      try {
        if (body.trim() === '') {
          resolve({});
        } else {
          resolve(JSON.parse(body));
        }
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}

// ========== INPUT VALIDATION ==========

function validateMasjid(data) {
  const errors = [];

  if (!data.name || typeof data.name !== 'string') {
    errors.push('name is required and must be a string');
  }
  if (!data.url || typeof data.url !== 'string') {
    errors.push('url is required and must be a string');
  }
  if (!data.cityCode || typeof data.cityCode !== 'string') {
    errors.push('cityCode is required and must be a string');
  }

  return errors;
}

function sanitizeMasjid(data) {
  return {
    name: String(data.name || '').substring(0, 100).trim(),
    url: String(data.url || '').substring(0, 200).trim(),
    city: String(data.city || '').substring(0, 100).trim(),
    state: String(data.state || '').substring(0, 10).trim(),
    timezone: String(data.timezone || TIMEZONE).substring(0, 50).trim(),
    cityCode: String(data.cityCode || DEFAULT_CITY_CODE).substring(0, 50).trim()
  };
}

// ========== DATABASE FUNCTIONS ==========

async function getMasjids() {
  const result = await pool.query(
    'SELECT id, name, url, city, state, timezone, city_code as "cityCode", created_at, updated_at FROM masjids ORDER BY id'
  );
  return result.rows;
}

async function getMasjidById(id) {
  const result = await pool.query(
    'SELECT id, name, url, city, state, timezone, city_code as "cityCode", created_at, updated_at FROM masjids WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function createMasjid(data) {
  const result = await pool.query(
    `INSERT INTO masjids (name, url, city, state, timezone, city_code)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, url, city, state, timezone, city_code as "cityCode", created_at, updated_at`,
    [data.name, data.url, data.city, data.state, data.timezone, data.cityCode]
  );

  const masjid = result.rows[0];

  // Create default iqama config for all prayers
  const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  for (const prayer of prayers) {
    await pool.query(
      'INSERT INTO iqama_config (masjid_id, prayer_name, iqama_offset) VALUES ($1, $2, $3)',
      [masjid.id, prayer, 20]
    );
  }

  return masjid;
}

async function deleteMasjid(id) {
  const result = await pool.query('DELETE FROM masjids WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

async function getIqamaConfig(masjidId) {
  const result = await pool.query(
    'SELECT prayer_name, iqama_offset FROM iqama_config WHERE masjid_id = $1',
    [masjidId]
  );

  const config = {};
  result.rows.forEach(row => {
    config[row.prayer_name] = row.iqama_offset;
  });

  return config;
}

// ========== SCRAPING ==========

function scrapePrayerTimesFromAwqat(masjid) {
  return new Promise((resolve, reject) => {
    const dataUrl = `${masjid.url}data/wtimes-${masjid.cityCode}.ini`;

    console.log(`📡 Scraping: ${dataUrl}`);

    https.get(dataUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          // Use Melbourne timezone for date
          const today = getMelbourneDate();
          const dateKey = formatDateKey(today);

          // Find today's prayer times
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
            dhuhr: times[2],    // Skip sunrise
            asr: times[3],
            maghrib: times[4],
            isha: times[5]
          };

          console.log(`✅ Scraped Adhan times for ${masjid.name} (${dateKey}):`, adhanTimes);

          // Fetch fixed iqama times
          const iqamaUrl = `${masjid.url}iqamafixed.js`;
          https.get(iqamaUrl, (iqamaRes) => {
            let iqamaData = '';
            iqamaRes.on('data', (chunk) => iqamaData += chunk);
            iqamaRes.on('end', () => {
              getIqamaConfig(masjid.id).then(dbConfig => {
                try {
                  // Extract FIXED_IQAMA_TIMES array
                  const iqamaMatch = iqamaData.match(/var FIXED_IQAMA_TIMES = \[([^\]]+)\]/);
                  if (iqamaMatch) {
                    const iqamaArray = iqamaMatch[1].split(',').map(s => s.trim().replace(/'/g, ''));

                    // Clone config to avoid mutation
                    const customConfig = { ...dbConfig };

                    // Update fixed iqama times if found
                    if (iqamaArray[2] && iqamaArray[2] !== '') {
                      customConfig.dhuhr = iqamaArray[2];
                    }
                    if (iqamaArray[5] && iqamaArray[5] !== '') {
                      customConfig.isha = iqamaArray[5];
                    }

                    console.log(`✅ Updated fixed Iqama times for ${masjid.name}:`, customConfig);
                    resolve(createPrayerTimesObject(adhanTimes, masjid.id, customConfig));
                  } else {
                    resolve(createPrayerTimesObject(adhanTimes, masjid.id, dbConfig));
                  }
                } catch (err) {
                  console.log(`⚠️  Could not parse iqamafixed.js for ${masjid.name}, using defaults`);
                  resolve(createPrayerTimesObject(adhanTimes, masjid.id, dbConfig));
                }
              });
            });
          }).on('error', (err) => {
            console.log(`⚠️  Could not fetch iqamafixed.js, using defaults:`, err.message);
            getIqamaConfig(masjid.id).then(dbConfig => {
              resolve(createPrayerTimesObject(adhanTimes, masjid.id, dbConfig));
            });
          });

        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function createPrayerTimesObject(adhanTimes, masjidId, config) {
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

  // Prevent concurrent scraping (race condition fix)
  if (scrapingInProgress[cacheKey]) {
    console.log(`⏳ Scraping already in progress for masjid ${masjidId}, waiting...`);
    await scrapingInProgress[cacheKey];
    return prayerTimesCache[cacheKey]?.data;
  }

  // Fetch fresh data
  console.log(`🔄 Fetching fresh prayer times for masjid ${masjidId}...`);
  const masjid = await getMasjidById(masjidId);

  if (!masjid) {
    throw new Error('Masjid not found');
  }

  try {
    // Set scraping promise
    scrapingInProgress[cacheKey] = scrapePrayerTimesFromAwqat(masjid);
    const prayerTimes = await scrapingInProgress[cacheKey];

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
  } finally {
    delete scrapingInProgress[cacheKey];
  }
}

// ========== CACHE CLEANUP ==========

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  Object.keys(prayerTimesCache).forEach(key => {
    if (now - prayerTimesCache[key].timestamp > CACHE_DURATION * 2) {
      delete prayerTimesCache[key];
      cleaned++;
    }
  });

  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} stale cache entries`);
  }
}, 60 * 60 * 1000);

// ========== AUTO-REFRESH ==========

async function refreshAllMasjids() {
  console.log('\n⏰ Hourly refresh: Updating prayer times for all masjids...');
  const masjids = await getMasjids();
  masjids.forEach(masjid => {
    getPrayerTimes(masjid.id).catch(err => {
      console.error(`Failed to refresh masjid ${masjid.id}:`, err.message);
    });
  });
}

setInterval(refreshAllMasjids, 60 * 60 * 1000);

// Initial fetch
console.log('\n🚀 Initial fetch: Loading prayer times for all masjids...');
setTimeout(() => {
  refreshAllMasjids();
}, 2000); // Wait 2 seconds for DB to be ready

// ========== HTTP SERVER ==========

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Rate limiting
  const clientIP = req.socket.remoteAddress;
  if (!checkRateLimit(clientIP)) {
    res.writeHead(429);
    res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
    return;
  }

  console.log(`${req.method} ${req.url} - ${clientIP}`);

  try {
    // ========== ROUTES ==========

    // GET /api/v1/masjids
    if (req.url === '/api/v1/masjids' || req.url === '/api/v1/masjids/') {
      const masjids = await getMasjids();
      res.writeHead(200);
      res.end(JSON.stringify(masjids));
    }

    // GET /api/v1/masjids/:id
    else if (req.url.match(/^\/api\/v1\/masjids\/\d+$/)) {
      const id = parseInt(req.url.split('/').pop());
      const masjid = await getMasjidById(id);
      if (masjid) {
        res.writeHead(200);
        res.end(JSON.stringify(masjid));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Masjid not found' }));
      }
    }

    // POST /api/v1/admin/masjids
    else if (req.url === '/api/v1/admin/masjids' && req.method === 'POST') {
      const data = await parseRequestBody(req);

      // Validate input
      const errors = validateMasjid(data);
      if (errors.length > 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Validation failed', details: errors }));
        return;
      }

      // Sanitize input
      const sanitized = sanitizeMasjid(data);

      const newMasjid = await createMasjid(sanitized);

      console.log('Masjid added:', newMasjid.name);
      res.writeHead(201);
      res.end(JSON.stringify(newMasjid));

      // Fetch prayer times for new masjid
      getPrayerTimes(newMasjid.id).catch(err => {
        console.error(`Failed to fetch times for new masjid:`, err.message);
      });
    }

    // DELETE /api/v1/admin/masjids/:id
    else if (req.url.match(/^\/api\/v1\/admin\/masjids\/\d+$/) && req.method === 'DELETE') {
      const id = parseInt(req.url.split('/').pop());
      const deleted = await deleteMasjid(id);
      if (deleted) {
        delete prayerTimesCache[`masjid_${id}`];
        console.log('Masjid deleted:', deleted.name);
        res.writeHead(200);
        res.end(JSON.stringify({ message: 'Masjid deleted successfully' }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Masjid not found' }));
      }
    }

    // GET /api/v1/prayer-times/:id
    else if (req.url.match(/^\/api\/v1\/prayer-times\/\d+$/)) {
      const masjidId = parseInt(req.url.split('/').pop());
      const times = await getPrayerTimes(masjidId);
      res.writeHead(200);
      res.end(JSON.stringify(times));
    }

    // POST /api/v1/devices/register
    else if (req.url === '/api/v1/devices/register' && req.method === 'POST') {
      const data = await parseRequestBody(req);

      // Upsert device
      const result = await pool.query(
        `INSERT INTO devices (token, platform, masjid_id, notifications_enabled)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (token)
         DO UPDATE SET platform = $2, masjid_id = $3, notifications_enabled = $4, updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [data.token, data.platform, data.masjid_id || null, data.notifications_enabled !== false]
      );

      console.log('Device registered:', data.token || 'no token');
      res.writeHead(200);
      res.end(JSON.stringify({ message: 'Device registered successfully', id: result.rows[0].id }));
    }

    // GET /health
    else if (req.url === '/health') {
      const masjidCount = await pool.query('SELECT COUNT(*) FROM masjids');
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        database: 'connected',
        masjids: parseInt(masjidCount.rows[0].count),
        cached_masjids: Object.keys(prayerTimesCache).length,
        last_update: Math.max(...Object.values(prayerTimesCache).map(c => c.timestamp).concat([0])),
        next_refresh: new Date(Date.now() + CACHE_DURATION).toLocaleString(),
        rate_limit_ips: rateLimitMap.size
      }));
    }

    // 404
    else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }

  } catch (error) {
    console.error('Server error:', error);

    if (error.message === 'Payload too large') {
      res.writeHead(413);
      res.end(JSON.stringify({ error: 'Payload too large' }));
    } else if (error.message === 'Invalid JSON') {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
    } else {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Prayer Times API Server (Production + PostgreSQL) running on port ${PORT}`);
  console.log(`\n🔒 Security Features:`);
  console.log(`  - Rate limiting: ${RATE_LIMIT_REQUESTS} req/min`);
  console.log(`  - Request size limit: ${MAX_BODY_SIZE / 1024}KB`);
  console.log(`  - Input validation enabled`);
  console.log(`  - Timezone: ${TIMEZONE}`);
  console.log(`  - Cache duration: ${CACHE_DURATION / 1000}s`);
  console.log(`\n📡 Features:`);
  console.log(`  - Live scraping from Awqat data files`);
  console.log(`  - Auto-refresh every 60 minutes`);
  console.log(`  - Masjid-specific Iqama times`);
  console.log(`  - 1-hour cache with cleanup`);
  console.log(`  - Race condition protection`);
  console.log(`  - PostgreSQL persistent storage`);
  console.log(`\n📍 Endpoints:`);
  console.log(`  GET  /api/v1/masjids - List all masjids`);
  console.log(`  GET  /api/v1/masjids/:id - Get single masjid`);
  console.log(`  GET  /api/v1/prayer-times/:id - Get live prayer times`);
  console.log(`  POST /api/v1/admin/masjids - Add new masjid`);
  console.log(`  DELETE /api/v1/admin/masjids/:id - Delete masjid`);
  console.log(`  POST /api/v1/devices/register - Register device`);
  console.log(`  GET  /health - Server health check`);
  console.log(`\nPress Ctrl+C to stop\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});
