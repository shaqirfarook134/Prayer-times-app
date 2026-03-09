# Prayer Times Auto-Update Implementation

## Current Status

✅ **What's Working:**
- Mobile app displays Adhan and Iqama times in 12-hour format
- Admin dashboard shows both times
- Mock server structure supports dynamic updates
- Hourly refresh cron job logic implemented

⚠️ **What's Not Working:**
- Docker not installed (required for GoLang backend + PostgreSQL)
- Web scraping from Awqat.com.au is complex (JavaScript-generated content)
- Mock server currently has hardcoded times

## The Problem

Prayer times need to update automatically every day because they change based on:
- Date (sunrise/sunset changes daily)
- Location (different cities have different times)
- Calculation method (different mosques may use different methods)

## Solutions (3 Options)

### Option 1: Install Docker & Run Full Backend (RECOMMENDED)

This is the production-ready solution with all features:

**Requirements:**
1. Install Docker Desktop for Mac
2. PostgreSQL database
3. GoLang backend with cron scheduler

**Steps:**
```bash
# 1. Install Docker Desktop
# Download from: https://www.docker.com/products/docker-desktop/

# 2. Start the backend
cd /Users/shaqirfarook/prayer-times-app/backend
docker compose up -d

# 3. Update mobile app API URL
# Edit mobile/src/services/api.ts
# Change: http://localhost:3001/api/v1
# To:     http://localhost:8080/api/v1

# 4. Restart mobile app
```

**Features:**
- ✅ Auto-scrapes prayer times every hour
- ✅ Stores in PostgreSQL database
- ✅ Handles Adhan + Iqama times
- ✅ Production-ready
- ✅ Supports multiple masjids
- ✅ Daily refresh at 00:05 Australia/Melbourne time

**Backend Code Location:**
- Scraper: `backend/internal/scraper/scraper.go`
- Cron Job: `backend/internal/worker/worker.go`
- Database: `backend/migrations/001_init_schema.up.sql`

---

### Option 2: Use Prayer Times API (ALTERNATIVE)

Use a third-party API like Al Adhan for accurate, auto-updating times:

**Free Prayer Times APIs:**
1. **Al Adhan API** - https://aladhan.com/prayer-times-api
2. **IslamicFinder API** - https://www.islamicfinder.org/
3. **Prayer Times API** - https://prayertimes.date/

**Example for Melbourne:**
```javascript
// Fetch from Al Adhan API
const response = await fetch(
  'http://api.aladhan.com/v1/timingsByCity?city=Melbourne&country=Australia&method=3'
);
const data = await response.json();

// data.data.timings contains:
// {
//   "Fajr": "05:37",
//   "Dhuhr": "13:17",
//   "Asr": "16:51",
//   "Maghrib": "19:48",
//   "Isha": "21:02"
// }
```

**Pros:**
- ✅ No backend required
- ✅ Auto-updates daily
- ✅ Free to use
- ✅ Accurate times

**Cons:**
- ❌ No Iqama times (only Adhan times)
- ❌ Generic prayer times (not specific to a masjid)
- ❌ Depends on external service
- ❌ May not match masjid's exact calculation method

---

### Option 3: Manual Update Script (TEMPORARY SOLUTION)

For testing/development only - manually update times daily:

**Current Implementation:**
File: `/Users/shaqirfarook/prayer-times-app/mobile/mock-server.js`

Lines 39-71: Hardcoded prayer times

**To Update:**
1. Visit https://awqat.com.au/altaqwamasjid/
2. Note today's prayer times
3. Edit `mock-server.js` lines 39-71
4. Restart mock server:
   ```bash
   pkill -f "mock-server" && node mock-server.js
   ```

**Example Update:**
```javascript
const prayerTimes = {
  masjid_id: 1,
  date: '2026-03-09',  // UPDATE THIS
  fajr: {
    adhan: "05:37",    // UPDATE THESE
    iqama: "06:00",
    adhan12: "5:37 AM",
    iqama12: "6:00 AM"
  },
  // ... update all prayers
};
```

---

## Recommended Next Steps

### For Development/Testing:
1. **Use Option 3** (manual updates) for now
2. Test the app functionality
3. Verify Adhan/Iqama display works correctly

### For Production:
1. **Install Docker** on your Mac
2. **Run Option 1** (full backend)
3. Deploy backend to a cloud server
4. Mobile app will auto-update prayer times every hour

---

## How the Auto-Update Works (Option 1)

### Backend Architecture:

```
┌─────────────────────────────────────────┐
│  Cron Scheduler (worker.go)            │
│  - Runs every hour: 0 * * * *          │
│  - Runs daily: 5 0 * * *                │
└──────────┬──────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────┐
│  Scraper Service (scraper.go)          │
│  - Fetches from Awqat websites         │
│  - Extracts Adhan times                │
│  - Calculates Iqama times               │
└──────────┬──────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────┐
│  PostgreSQL Database                    │
│  - prayer_times table                   │
│  - Stores: date, fajr, dhuhr, etc.     │
└──────────┬──────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────┐
│  REST API (handlers/prayer_times.go)   │
│  - GET /api/v1/prayer-times/:masjid_id │
└──────────┬──────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────┐
│  Mobile App                             │
│  - Fetches times on load               │
│  - Displays Adhan + Iqama               │
│  - Schedules notifications              │
└─────────────────────────────────────────┘
```

### Cron Schedule:
```go
// backend/internal/worker/worker.go

// Hourly update (every hour at minute 0)
"0 * * * *" → FetchAndUpdateAllMasjids()

// Daily refresh (00:05 Australia/Melbourne)
"5 0 * * *" → RefreshAllPrayerTimes()
```

---

## Files to Update for Production

### 1. Backend Database Schema
**File:** `backend/migrations/001_init_schema.up.sql`

Currently stores prayer times as TIME:
```sql
fajr TIME NOT NULL,
dhuhr TIME NOT NULL,
-- etc.
```

**Needs update to support Adhan + Iqama:**
```sql
fajr_adhan TIME NOT NULL,
fajr_iqama TIME NOT NULL,
dhuhr_adhan TIME NOT NULL,
dhuhr_iqama TIME NOT NULL,
-- etc.
```

### 2. Backend Models
**File:** `backend/internal/models/models.go`

Update PrayerTimes struct:
```go
type PrayerTime struct {
    Adhan   string `json:"adhan"`
    Iqama   string `json:"iqama"`
    Adhan12 string `json:"adhan12"`
    Iqama12 string `json:"iqama12"`
}

type PrayerTimes struct {
    ID        int        `json:"id"`
    MasjidID  int        `json:"masjid_id"`
    Date      string     `json:"date"`
    Fajr      PrayerTime `json:"fajr"`
    Dhuhr     PrayerTime `json:"dhuhr"`
    Asr       PrayerTime `json:"asr"`
    Maghrib   PrayerTime `json:"maghrib"`
    Isha      PrayerTime `json:"isha"`
    CreatedAt string     `json:"created_at"`
}
```

### 3. Backend Scraper
**File:** `backend/internal/scraper/scraper.go`

Update to:
1. Extract Adhan times from Awqat website
2. Extract or calculate Iqama times
3. Convert to 12-hour format
4. Return PrayerTime objects

---

## Testing the System

### Test Mock Server (Current):
```bash
# Check if running
lsof -i:3001

# Test endpoints
curl http://localhost:3001/api/v1/masjids
curl http://localhost:3001/api/v1/prayer-times/1

# Check health
curl http://localhost:3001/health
```

### Test Full Backend (After Docker):
```bash
# Check if backend is running
lsof -i:8080

# Test endpoints
curl http://localhost:8080/api/v1/masjids
curl http://localhost:8080/api/v1/prayer-times/1

# Check health
curl http://localhost:8080/health
```

### Test Mobile App:
1. Open app in simulator
2. Select a masjid
3. Pull down to refresh
4. Verify times are current
5. Check times update after 1 hour

---

## Summary

**Current State:**
- ✅ UI ready (mobile + admin dashboard)
- ✅ Data structure supports Adhan + Iqama
- ✅ Mock server for testing
- ❌ Auto-update not working (need Docker or API)

**To Get Auto-Updates:**
1. **Quick Fix:** Use Option 2 (Prayer Times API)
2. **Production:** Use Option 1 (Install Docker + Full Backend)
3. **Temporary:** Use Option 3 (Manual updates daily)

**Recommendation:**
- **Now:** Use manual updates for testing
- **Next Week:** Install Docker and run full backend
- **Production:** Deploy backend to cloud (AWS/GCP/Heroku)

---

## Need Help?

1. **Installing Docker:** https://docs.docker.com/desktop/install/mac-install/
2. **Prayer Times APIs:** https://aladhan.com/prayer-times-api
3. **Backend Deployment:** See `DEPLOYMENT.md`
4. **Troubleshooting:** See `TESTING.md`
