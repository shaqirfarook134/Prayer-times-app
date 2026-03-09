# Production Deployment Guide

## Overview
This guide will deploy the Prayer Times API server to Railway (free tier) and configure the mobile app to use it.

## Prerequisites
- Git repository initialized ✅
- Railway account (free tier)
- GitHub account (for code hosting)

---

## Step 1: Push Code to GitHub

```bash
cd /Users/shaqirfarook/prayer-times-app

# Create a new GitHub repository at: https://github.com/new
# Name it: prayer-times-app

# Add remote and push
git remote add origin https://github.com/YOUR_USERNAME/prayer-times-app.git
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy to Railway

### Option A: Using Railway CLI (Recommended)

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Login to Railway:
```bash
railway login
```

3. Deploy from mobile directory:
```bash
cd /Users/shaqirfarook/prayer-times-app/mobile
railway init
railway up
```

4. Get your production URL:
```bash
railway domain
```

### Option B: Using Railway Web Dashboard

1. Go to https://railway.app
2. Click "Start a New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account
5. Select `prayer-times-app` repository
6. Railway will auto-detect the Dockerfile
7. Configure deployment:
   - **Root Directory**: `mobile`
   - **Dockerfile Path**: `Dockerfile`
   - **Port**: `3001`
8. Click "Deploy"
9. Once deployed, click "Settings" > "Networking" > "Generate Domain"
10. Copy your production URL (e.g., `https://prayer-times-app-production.up.railway.app`)

---

## Step 3: Update Mobile App API URL

Edit `/Users/shaqirfarook/prayer-times-app/mobile/src/services/api.ts`:

```typescript
// Change from:
const API_BASE_URL = 'http://localhost:3001/api/v1';

// To your Railway URL:
const API_BASE_URL = 'https://your-app.up.railway.app/api/v1';
```

---

## Step 4: Test Production API

```bash
# Replace with your actual Railway URL
export RAILWAY_URL="https://your-app.up.railway.app"

# Test endpoints
curl $RAILWAY_URL/health
curl $RAILWAY_URL/api/v1/masjids
curl $RAILWAY_URL/api/v1/prayer-times/1
```

Expected responses:
- `/health`: `{"status":"ok","cached_masjids":3,...}`
- `/api/v1/masjids`: Array of 3 masjids
- `/api/v1/prayer-times/1`: Today's prayer times for Al Taqwa

---

## Step 5: Test Mobile App with Production Backend

```bash
cd /Users/shaqirfarook/prayer-times-app/mobile

# Restart the app
pkill -f "expo" && npx expo start --ios
```

In the app:
1. Select a masjid
2. Verify prayer times load from production
3. Pull down to refresh - should fetch from Railway
4. Check that times are accurate

---

## Step 6: Monitor Production Server

### Railway Dashboard
- **Logs**: https://railway.app/dashboard → Your Project → Deployments
- **Metrics**: CPU, Memory, Network usage
- **Uptime**: 24/7 (no sleep on free tier)

### Health Check
Set up a cron job to ping your server every 5 minutes:

```bash
# Add to crontab (run: crontab -e)
*/5 * * * * curl -s https://your-app.up.railway.app/health > /dev/null
```

---

## Production Features

✅ **What's Working:**
- Live prayer time scraping from Awqat.com.au
- Hourly auto-refresh (every 60 minutes)
- In-memory cache (1-hour duration)
- CORS enabled for mobile app
- 3 pre-configured masjids:
  1. Al Taqwa Masjid (Melbourne)
  2. Preston Mosque (Melbourne)
  3. Sydney Islamic Centre (Sydney)

⚠️ **Limitations (Free Tier):**
- No database (in-memory only - resets on deployment)
- 512MB RAM limit
- Shared CPU
- No autoscaling

---

## Next Steps (Optional Enhancements)

### 1. Add PostgreSQL Database
Railway offers free PostgreSQL addon:
- Click "New" → "Database" → "PostgreSQL"
- Update server code to persist data
- Migrate from in-memory to database storage

### 2. Add Push Notifications
See: `COMPLETE_SYSTEM_DESIGN.md` → Push Notifications section

### 3. Custom Domain
Railway allows custom domains on free tier:
- Settings → Networking → Custom Domain
- Add: `api.prayertimes.com`

### 4. Environment Variables
Set in Railway dashboard:
- `NODE_ENV=production`
- `PORT=3001`
- `CACHE_DURATION=3600000`

---

## Troubleshooting

### Server Not Starting
Check Railway logs:
```bash
railway logs
```

### CORS Errors in Mobile App
Ensure server has CORS headers:
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
```

### Prayer Times Not Updating
Check scraping logs in Railway dashboard:
- Should see: `📡 Scraping: https://awqat.com.au/...`
- Should see: `✅ Scraped Adhan times for...`

### Port Issues
Railway auto-assigns PORT via environment variable.
Update server code:
```javascript
const PORT = process.env.PORT || 3001;
```

---

## Rollback

If deployment fails, rollback in Railway:
1. Go to Deployments
2. Find previous working deployment
3. Click "Redeploy"

---

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Project Issues: See `TESTING.md`
