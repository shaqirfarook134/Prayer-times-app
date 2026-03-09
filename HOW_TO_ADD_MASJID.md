# How to Add a Masjid and Fetch Prayer Times

## Option 1: Using the Mock Server (For Testing)

### Update the Mock Server with Your Masjid

Edit `/Users/shaqirfarook/prayer-times-app/mobile/mock-server.js` and add your masjid to the `masjids` array:

```javascript
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
  // ADD YOUR MASJID HERE:
  {
    id: 3,
    name: "Your Masjid Name",
    url: "https://awqat.com.au/yourmasjid/",
    city: "Sydney",
    state: "NSW",
    timezone: "Australia/Sydney",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];
```

Then restart the mock server:
```bash
pkill -f "mock-server" && node mock-server.js
```

---

## Option 2: Using the Real Backend (Production)

### Step 1: Start the Backend

**If you have Docker:**
```bash
cd /Users/shaqirfarook/prayer-times-app/backend
docker compose up -d
```

**Without Docker (requires Go and PostgreSQL):**
```bash
# Create database
createdb prayer_times_db

# Run migrations
psql prayer_times_db < migrations/001_init_schema.up.sql

# Start backend
go run cmd/api/main.go
```

### Step 2: Add a Masjid via API

```bash
curl -X POST http://localhost:8080/api/v1/admin/masjids \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Masjid Name",
    "url": "https://awqat.com.au/yourmasjid/",
    "city": "Sydney",
    "state": "NSW",
    "timezone": "Australia/Sydney"
  }'
```

**Or use the script:**
```bash
# Edit add-masjid.js with your masjid details
node add-masjid.js
```

---

## How to Find Prayer Times from Awqat Websites

### Method 1: Use the Fetch Script

```bash
node fetch-prayer-times.js https://awqat.com.au/yourmasjid/
```

### Method 2: Manual Extraction

1. **Visit the masjid's Awqat page** in a browser
   Example: https://awqat.com.au/altaqwamasjid/

2. **View the page source** (Right-click → View Page Source)

3. **Look for the JavaScript file** - search for "iqamafixed.js"

4. **Open the JavaScript file**
   Example: https://awqat.com.au/altaqwamasjid/iqamafixed.js

5. **You'll see something like:**
   ```javascript
   var FIXED_IQAMA_TIMES = ['','','14:15','','','21:30'];
   ```

   But we need the ACTUAL prayer times, not iqama times.

6. **Check the main page for current prayer times**
   - Look for a table or JavaScript variable with times
   - Common formats:
     - `var prayertimes = ['05:30', '13:12', '16:45', '18:18', '19:34']`
     - `var iqamafixed = ['05:30', '06:30', '13:12', '16:45', '18:18', '19:34', '13:30']`

### Method 3: Use Curl to Download

```bash
# Download main page
curl -s "https://awqat.com.au/yourmasjid/" > masjid.html

# Search for prayer times
grep -i "var.*times" masjid.html

# Or download the JavaScript file directly
curl -s "https://awqat.com.au/yourmasjid/iqamafixed.js"
```

---

## Understanding Awqat Prayer Time Arrays

Awqat websites typically use this format:
```
[Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha, Jumuah]
```

**We only need:**
- Index 0: **Fajr**
- Index 2: **Dhuhr** (skip Sunrise at index 1)
- Index 3: **Asr**
- Index 4: **Maghrib**
- Index 5: **Isha**

---

## Quick Start Examples

### Example 1: Add Al Taqwa Masjid

```bash
curl -X POST http://localhost:8080/api/v1/admin/masjids \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Al Taqwa Masjid",
    "url": "https://awqat.com.au/altaqwamasjid/",
    "city": "Melbourne",
    "state": "VIC",
    "timezone": "Australia/Melbourne"
  }'
```

### Example 2: Add Preston Mosque

```bash
curl -X POST http://localhost:8080/api/v1/admin/masjids \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Preston Mosque",
    "url": "https://awqat.com.au/prestonmosque/",
    "city": "Melbourne",
    "state": "VIC",
    "timezone": "Australia/Melbourne"
  }'
```

### Example 3: Fetch Current Prayer Times

Once a masjid is added, the backend will automatically scrape it every hour!

Check if it worked:
```bash
# Get masjid ID
curl http://localhost:8080/api/v1/masjids

# Get today's prayer times (replace 1 with your masjid ID)
curl http://localhost:8080/api/v1/prayer-times/1
```

---

## Testing the Full Flow

### 1. Start Everything
```bash
# Terminal 1: Start backend (or mock server)
cd /Users/shaqirfarook/prayer-times-app/mobile
node mock-server.js

# Terminal 2: Start mobile app
cd /Users/shaqirfarook/prayer-times-app/mobile
npm run ios
```

### 2. In the iOS Simulator
1. App opens to "Select Your Masjid" screen
2. Tap on a masjid (e.g., "Al Taqwa Masjid")
3. See today's prayer times with countdown
4. Toggle notifications on/off
5. Pull down to refresh

### 3. Test Notifications
- The app schedules notifications 10 minutes before each prayer
- Check iOS Notification Center to see scheduled notifications
- Wait for a notification or change system time to test

---

## Troubleshooting

### Backend not responding?
```bash
# Check if backend is running
curl http://localhost:8080/health

# Check logs
docker logs prayer-times-api  # if using Docker
```

### Mock server not working?
```bash
# Check if port 3001 is available
lsof -i:3001

# Restart mock server
pkill -f "mock-server" && node mock-server.js
```

### App can't connect to API?
```bash
# Make sure mobile app is using the right URL
# Edit mobile/src/services/api.ts
# Change: http://localhost:3001/api/v1 (for mock server)
# Or:     http://localhost:8080/api/v1 (for real backend)
```

### Prayer times not showing?
1. Check API response:
   ```bash
   curl http://localhost:3001/api/v1/prayer-times/1
   ```

2. Check app logs in Expo:
   - Look for "API Request:" logs
   - Check for errors

3. Pull down to refresh in the app

---

## Finding More Awqat Masjids

Search for Australian masjids on Awqat:
- https://awqat.com.au/

Common format:
- `https://awqat.com.au/{masjid-name}/`

Examples:
- https://awqat.com.au/altaqwamasjid/
- https://awqat.com.au/prestonmosque/
- https://awqat.com.au/melb/
- https://awqat.com.au/sydney/

---

## Next Steps

1. **Add your local masjid** using the methods above
2. **Test the scraper** - backend will auto-fetch every hour
3. **Configure notifications** in the mobile app
4. **Deploy to production** - see DEPLOYMENT.md

For production deployment, the backend will automatically:
- Fetch prayer times every 60 minutes
- Refresh daily at 00:05 Australia/Melbourne time
- Send push notifications to all registered devices
- Cache prayer times for offline access
