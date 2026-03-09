# 🚀 Deploy Prayer Times App to Production NOW

## ✅ What's Done

- ✅ Code pushed to GitHub: https://github.com/shaqirfarook134/Prayer-times-app
- ✅ Dockerfile created
- ✅ Server configured for Railway (PORT environment variable)
- ✅ Git repository initialized and committed

## 🎯 Next Steps (5 minutes)

### Option A: Deploy via Railway Web Dashboard (EASIEST)

1. **Go to Railway**: https://railway.app

2. **Login** with your GitHub account

3. **Create New Project**:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose: `shaqirfarook134/Prayer-times-app`
   - Railway will auto-detect the Dockerfile

4. **Configure Service**:
   - Click on the deployed service
   - Go to "Settings"
   - Set **Root Directory**: `mobile`
   - Set **Dockerfile Path**: `Dockerfile`

5. **Add Environment Variable** (optional):
   - Go to "Variables" tab
   - Add: `NODE_ENV` = `production`

6. **Generate Domain**:
   - Go to "Settings" > "Networking"
   - Click "Generate Domain"
   - Copy the URL (e.g., `https://prayer-times-app-production.up.railway.app`)

7. **Verify Deployment**:
   - Click on "Deployments" tab
   - Wait for build to complete (~2-3 minutes)
   - Check logs for: "✅ Prayer Times API Server (Awqat Scraper) running on port 3001"

8. **Test API**:
   ```bash
   curl https://YOUR-RAILWAY-URL.railway.app/health
   curl https://YOUR-RAILWAY-URL.railway.app/api/v1/masjids
   curl https://YOUR-RAILWAY-URL.railway.app/api/v1/prayer-times/1
   ```

### Option B: Deploy via Railway CLI (FASTER IF LOGGED IN)

```bash
cd /Users/shaqirfarook/prayer-times-app/mobile

# Login to Railway (opens browser)
railway login

# Create new project
railway init

# Deploy
railway up

# Get URL
railway domain

# View logs
railway logs
```

---

## 📱 Update Mobile App

Once you have the Railway URL, update the mobile app:

1. **Edit API configuration**:
   ```bash
   # Edit this file:
   /Users/shaqirfarook/prayer-times-app/mobile/src/services/api.ts
   ```

2. **Change the API URL**:
   ```typescript
   // Change from:
   const API_BASE_URL = 'http://localhost:3001/api/v1';

   // To your Railway URL:
   const API_BASE_URL = 'https://YOUR-APP.up.railway.app/api/v1';
   ```

3. **Restart the mobile app**:
   ```bash
   cd /Users/shaqirfarook/prayer-times-app/mobile

   # Kill existing processes
   pkill -f "expo"

   # Start fresh
   npx expo start --ios
   ```

4. **Test in app**:
   - Select a masjid
   - Verify prayer times load
   - Pull to refresh
   - Check times are accurate

---

## 🔍 Troubleshooting

### Build Fails
**Check Railway logs**:
- Go to Deployments > Latest deployment > View Logs
- Look for errors

**Common issues**:
- Wrong root directory → Set to `mobile`
- PORT not set → Railway sets automatically
- Dockerfile not found → Check path is `Dockerfile`

### Server Starts But No Response
**Check CORS**:
- Server has `Access-Control-Allow-Origin: *` ✅

**Check health endpoint**:
```bash
curl https://YOUR-URL.railway.app/health
```

Should return:
```json
{
  "status": "ok",
  "cached_masjids": 3,
  "last_update": 1709950000000,
  "next_refresh": "..."
}
```

### Prayer Times Not Scraping
**Check logs for**:
- `📡 Scraping: https://awqat.com.au/...`
- `✅ Scraped Adhan times for...`

**If Preston/Sydney fail**:
- This is a known issue
- Al Taqwa works ✅
- Will fix in next iteration

---

## ✨ What Happens Next

Once deployed, your app will:

1. **Auto-refresh prayer times** every 60 minutes
2. **Scrape live data** from Awqat.com.au
3. **Stay online 24/7** (no sleep on Railway free tier)
4. **Serve mobile app** with accurate prayer times
5. **Cache data** for 1 hour for performance

---

## 📊 Monitor Production

### Railway Dashboard
- **Logs**: https://railway.app/dashboard → Your Project
- **Metrics**: CPU, Memory, Network
- **Deployments**: See all deploy history

### Health Check
Ping your server every 5 minutes to ensure it stays up:

```bash
# Add to crontab (run: crontab -e)
*/5 * * * * curl -s https://YOUR-URL.railway.app/health > /dev/null
```

---

## 🎉 Success Criteria

Your deployment is successful when:

- [ ] Railway URL responds to `/health`
- [ ] `/api/v1/masjids` returns 3 masjids
- [ ] `/api/v1/prayer-times/1` returns today's prayer times
- [ ] Mobile app loads prayer times from production
- [ ] Times match Awqat.com.au (verify Fajr 5:41 AM for March 9, 2026)
- [ ] Notifications scheduled 10 min before each prayer

---

## 📞 Need Help?

**Railway Support**:
- Docs: https://docs.railway.app
- Discord: https://discord.gg/railway

**Project Issues**:
- GitHub: https://github.com/shaqirfarook134/Prayer-times-app/issues

**Files to Check**:
- `PRODUCTION_DEPLOYMENT.md` - Full deployment guide
- `COMPLETE_SYSTEM_DESIGN.md` - Architecture overview
- `mobile/server-final.js` - Production server code
- `mobile/Dockerfile` - Docker build configuration

---

## 🚀 Quick Command Summary

```bash
# Deploy to Railway (Option B)
cd /Users/shaqirfarook/prayer-times-app/mobile
railway login
railway init
railway up
railway domain

# Update mobile app API URL
# Edit: /Users/shaqirfarook/prayer-times-app/mobile/src/services/api.ts
# Change localhost:3001 → your-railway-url.railway.app

# Test production API
curl https://YOUR-URL.railway.app/health
curl https://YOUR-URL.railway.app/api/v1/masjids
curl https://YOUR-URL.railway.app/api/v1/prayer-times/1

# Restart mobile app
pkill -f "expo" && npx expo start --ios
```

---

## 🎯 Current Status

**GitHub**: ✅ Code pushed to https://github.com/shaqirfarook134/Prayer-times-app

**Railway**: ⏳ Ready to deploy (waiting for you to complete steps above)

**Mobile App**: ✅ Running on simulator with localhost:3001

**Next Action**: Deploy to Railway using Option A or Option B above
