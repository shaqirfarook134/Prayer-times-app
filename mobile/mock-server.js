// Simple mock API server for testing
const http = require('http');

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

// Accurate prayer times for Melbourne, March 2026
// Format: { adhan: "HH:MM", iqama: "HH:MM", adhan12: "h:mm AM/PM", iqama12: "h:mm AM/PM" }
const prayerTimes = {
  masjid_id: 1,
  date: new Date().toISOString().split('T')[0],
  fajr: {
    adhan: "06:01",
    iqama: "06:20",
    adhan12: "6:01 AM",
    iqama12: "6:20 AM"
  },
  dhuhr: {
    adhan: "13:42",
    iqama: "14:15",
    adhan12: "1:42 PM",
    iqama12: "2:15 PM"
  },
  asr: {
    adhan: "17:04",
    iqama: "17:15",
    adhan12: "5:04 PM",
    iqama12: "5:15 PM"
  },
  maghrib: {
    adhan: "19:33",
    iqama: "19:40",
    adhan12: "7:33 PM",
    iqama12: "7:40 PM"
  },
  isha: {
    adhan: "20:53",
    iqama: "21:30",
    adhan12: "8:53 PM",
    iqama12: "9:30 PM"
  }
};

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
        console.log('Masjid added:', newMasjid.name);
        res.writeHead(201);
        res.end(JSON.stringify(newMasjid));
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
      console.log('Masjid deleted:', deleted.name);
      res.writeHead(200);
      res.end(JSON.stringify({ message: 'Masjid deleted successfully' }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Masjid not found' }));
    }
  } else if (req.url.match(/^\/api\/v1\/prayer-times\/\d+$/)) {
    const masjidId = parseInt(req.url.split('/').pop());
    res.writeHead(200);
    res.end(JSON.stringify({ ...prayerTimes, masjid_id: masjidId }));
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
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Mock API Server running on http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /api/v1/masjids`);
  console.log(`  GET  /api/v1/prayer-times/:masjidId`);
  console.log(`  POST /api/v1/devices/register`);
  console.log(`  GET  /health`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
