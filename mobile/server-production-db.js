// Production-ready API server with PostgreSQL database
const http = require('http');
const https = require('https');
const { Pool } = require('pg');
const { Server } = require('socket.io');

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

// Test database connection and initialize schema
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  } else {
    console.log('✅ Database connected successfully at', res.rows[0].now);
    await initializeDatabase();
  }
});

// ========== DATABASE INITIALIZATION ==========
async function initializeDatabase() {
  try {
    console.log('🔧 Initializing database schema...');

    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS masjids (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(500) NOT NULL,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        timezone VARCHAR(100) NOT NULL DEFAULT 'Australia/Melbourne',
        city_code VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS iqama_config (
        id SERIAL PRIMARY KEY,
        masjid_id INTEGER NOT NULL REFERENCES masjids(id) ON DELETE CASCADE,
        prayer_name VARCHAR(50) NOT NULL CHECK (prayer_name IN ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
        iqama_offset INTEGER NOT NULL DEFAULT 20,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(masjid_id, prayer_name)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        token VARCHAR(255) UNIQUE NOT NULL,
        platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android')),
        masjid_id INTEGER REFERENCES masjids(id) ON DELETE SET NULL,
        notifications_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_masjids_city_code ON masjids(city_code)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_iqama_config_masjid_id ON iqama_config(masjid_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(token)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_devices_masjid_id ON devices(masjid_id)');

    // Create update trigger function
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create triggers
    await pool.query(`
      DROP TRIGGER IF EXISTS update_masjids_updated_at ON masjids;
      CREATE TRIGGER update_masjids_updated_at BEFORE UPDATE ON masjids
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS update_iqama_config_updated_at ON iqama_config;
      CREATE TRIGGER update_iqama_config_updated_at BEFORE UPDATE ON iqama_config
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS update_devices_updated_at ON devices;
      CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    // Insert default masjids (only if table is empty)
    const { rows } = await pool.query('SELECT COUNT(*) FROM masjids');
    if (parseInt(rows[0].count) === 0) {
      console.log('📝 Inserting default masjids...');
      await pool.query(`
        INSERT INTO masjids (name, url, city, state, timezone, city_code) VALUES
          ('Al Taqwa Masjid', 'https://awqat.com.au/altaqwamasjid/', 'Melbourne', 'VIC', 'Australia/Melbourne', 'altaqwamasjid'),
          ('Preston Mosque', 'https://awqat.com.au/preston/', 'Melbourne', 'VIC', 'Australia/Melbourne', 'preston'),
          ('Westall Road Mosque', 'https://awqat.com.au/westall/', 'Melbourne', 'VIC', 'Australia/Melbourne', 'westall')
      `);

      // Insert default iqama configurations
      await pool.query(`
        INSERT INTO iqama_config (masjid_id, prayer_name, iqama_offset)
        SELECT m.id, prayer.name, 20
        FROM masjids m
        CROSS JOIN (VALUES ('fajr'), ('dhuhr'), ('asr'), ('maghrib'), ('isha')) AS prayer(name)
      `);

      console.log('✅ Default masjids inserted');
    }

    console.log('✅ Database schema initialized');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    // Don't exit - let the app try to continue
  }
}

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

          // Fetch iqama times from website
          const iqamaUrl = `${masjid.url}iqamafixed.js`;
          https.get(iqamaUrl, (iqamaRes) => {
            let iqamaData = '';
            iqamaRes.on('data', (chunk) => iqamaData += chunk);
            iqamaRes.on('end', () => {
              try {
                const iqamaConfig = { fajr: 20, dhuhr: 20, asr: 20, maghrib: 20, isha: 20 }; // defaults

                // Extract JS_IQAMA_TIME array (minute offsets)
                const offsetMatch = iqamaData.match(/var JS_IQAMA_TIME = \[([^\]]+)\]/);
                if (offsetMatch) {
                  const offsetArray = offsetMatch[1].split(',').map(s => {
                    const val = s.trim();
                    return val === '' ? null : parseInt(val);
                  });
                  // Array format: [0, fajr, dhuhr, asr, maghrib, isha]
                  if (offsetArray[1] !== null) iqamaConfig.fajr = offsetArray[1];
                  if (offsetArray[2] !== null) iqamaConfig.dhuhr = offsetArray[2];
                  if (offsetArray[3] !== null) iqamaConfig.asr = offsetArray[3];
                  if (offsetArray[4] !== null) iqamaConfig.maghrib = offsetArray[4];
                  if (offsetArray[5] !== null) iqamaConfig.isha = offsetArray[5];
                }

                // Extract FIXED_IQAMA_TIMES array (overrides offsets)
                const fixedMatch = iqamaData.match(/var FIXED_IQAMA_TIMES = \[([^\]]+)\]/);
                if (fixedMatch) {
                  const fixedArray = fixedMatch[1].split(',').map(s => s.trim().replace(/['"`]/g, ''));
                  // Array format: ['', '', dhuhr, '', '', isha]
                  if (fixedArray[2] && fixedArray[2] !== '') iqamaConfig.dhuhr = fixedArray[2];
                  if (fixedArray[5] && fixedArray[5] !== '') iqamaConfig.isha = fixedArray[5];
                }

                console.log(`✅ Scraped Iqama config for ${masjid.name}:`, iqamaConfig);
                resolve(createPrayerTimesObject(adhanTimes, masjid.id, iqamaConfig));
              } catch (err) {
                console.log(`⚠️  Could not parse iqamafixed.js for ${masjid.name}:`, err.message);
                resolve(createPrayerTimesObject(adhanTimes, masjid.id, { fajr: 20, dhuhr: 20, asr: 20, maghrib: 20, isha: 20 }));
              }
            });
          }).on('error', (err) => {
            console.log(`⚠️  Could not fetch iqamafixed.js for ${masjid.name}:`, err.message);
            resolve(createPrayerTimesObject(adhanTimes, masjid.id, { fajr: 20, dhuhr: 20, asr: 20, maghrib: 20, isha: 20 }));
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

    // Emit WebSocket event for real-time update
    io.emit('prayer_times_updated', { masjidId, prayerTimes });
    console.log(`📡 Broadcasted prayer_times_updated event for masjid ${masjidId}`);

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

      // Emit WebSocket event for real-time update
      io.emit('masjid_added', newMasjid);
      console.log('📡 Broadcasted masjid_added event');

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

        // Emit WebSocket event for real-time update
        io.emit('masjid_deleted', { id });
        console.log('📡 Broadcasted masjid_deleted event');

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

// ========== WEBSOCKET SETUP ==========
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('📱 Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('📱 Client disconnected:', socket.id);
  });
});

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
  console.log(`  - WebSocket real-time updates`);
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
