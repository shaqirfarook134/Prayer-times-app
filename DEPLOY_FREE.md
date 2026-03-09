# 🆓 Deploy Prayer Times App for FREE on Render.com

## Why Render.com?

✅ **100% FREE forever** (unlike Railway which costs $5/month)
✅ **750 hours/month** (enough for 24/7 operation)
✅ **No credit card required** for free tier
✅ **Auto-deploys** from GitHub
✅ **Custom domains** supported (free SSL)

⚠️ **Trade-off**: Spins down after 15 min of inactivity, ~30 sec cold start
👍 **Perfect for prayer times**: Not real-time critical, users won't notice

---

## 🚀 Deploy in 3 Minutes (FREE)

### Step 1: Go to Render.com

1. Visit: https://render.com
2. Click **"Get Started for Free"**
3. Sign up with your **GitHub account**

### Step 2: Create New Web Service

1. Click **"New +"** → **"Web Service"**
2. Click **"Connect GitHub"** and authorize Render
3. Select repository: **`Prayer-times-app`**
4. Click **"Connect"**

### Step 3: Configure Service

Fill in these settings:

| Field | Value |
|-------|-------|
| **Name** | `prayer-times-api` |
| **Region** | `Oregon (US West)` or closest to Australia |
| **Branch** | `master` |
| **Root Directory** | `mobile` |
| **Runtime** | `Node` |
| **Build Command** | `echo "No build needed"` |
| **Start Command** | `node server-final.js` |
| **Plan** | **Free** ✅ |

### Step 4: Add Environment Variables (Optional)

Click **"Advanced"** → **"Add Environment Variable"**:

- **Key**: `NODE_ENV`
  **Value**: `production`

### Step 5: Deploy

1. Click **"Create Web Service"**
2. Wait 2-3 minutes for deployment
3. Watch logs for: `✅ Prayer Times API Server (Awqat Scraper) running on port 3001`

### Step 6: Get Your URL

Once deployed, you'll see:
```
Your service is live at https://prayer-times-api.onrender.com
```

**Copy this URL** - you'll need it for the mobile app!

---

## ✅ Test Your API

Replace `YOUR-APP` with your actual Render URL:

```bash
# Health check
curl https://prayer-times-api.onrender.com/health

# List masjids
curl https://prayer-times-api.onrender.com/api/v1/masjids

# Get prayer times for Al Taqwa (ID 1)
curl https://prayer-times-api.onrender.com/api/v1/prayer-times/1
```

**Expected response for `/health`:**
```json
{
  "status": "ok",
  "cached_masjids": 3,
  "last_update": 1709950000000,
  "next_refresh": "..."
}
```

---

## 📱 Update Mobile App

### Edit API Configuration

1. Open: `/Users/shaqirfarook/prayer-times-app/mobile/src/services/api.ts`

2. Change the API URL:
```typescript
// OLD (localhost):
const API_BASE_URL = 'http://localhost:3001/api/v1';

// NEW (Render.com):
const API_BASE_URL = 'https://prayer-times-api.onrender.com/api/v1';
```

### Restart Mobile App

```bash
cd /Users/shaqirfarook/prayer-times-app/mobile

# Kill existing processes
pkill -f "expo"

# Start fresh
npx expo start --ios
```

### Test in App

1. **Select a masjid** (e.g., Al Taqwa)
2. **Verify prayer times load** from production
3. **Pull to refresh** - should fetch from Render
4. **Check times are accurate**:
   - Fajr: 5:41 AM
   - Dhuhr: 1:31 PM
   - Asr: 5:07 PM
   - Maghrib: 7:54 PM
   - Isha: 9:01 PM

---

## 🔧 Render.com Features

### Auto-Deploy on Git Push

Render automatically redeploys when you push to GitHub:

```bash
# Make changes to your code
git add .
git commit -m "Update prayer times logic"
git push

# Render will automatically deploy! 🎉
```

### View Logs

1. Go to Render Dashboard
2. Click on **"prayer-times-api"**
3. Click **"Logs"** tab
4. See real-time logs:
   - `📡 Scraping: https://awqat.com.au/...`
   - `✅ Scraped Adhan times for...`
   - API requests

### Monitor Uptime

Render shows:
- **Deploy status**: Success/Failed
- **Last deploy**: Timestamp
- **CPU/Memory usage**: Free tier limits
- **Request logs**: All API calls

---

## ⚡ Keep Server Awake (Optional)

Since Render spins down after 15 min, you can keep it awake:

### Option 1: Cron Job (Free)

Add to your Mac's crontab (`crontab -e`):

```bash
# Ping every 10 minutes (keeps server awake)
*/10 * * * * curl -s https://prayer-times-api.onrender.com/health > /dev/null
```

### Option 2: UptimeRobot (Free Service)

1. Sign up at https://uptimerobot.com (FREE)
2. Add monitor: `https://prayer-times-api.onrender.com/health`
3. Interval: Every 5 minutes
4. UptimeRobot will ping your server automatically

### Option 3: Don't Worry About It

For a prayer times app, 30-second cold start is acceptable:
- Users open app → Server wakes up → Prayer times load
- Most users won't notice
- Saves resources when app isn't in use

---

## 🎯 Render Free Tier Limits

| Resource | Free Tier |
|----------|-----------|
| **Instances** | 1 per service |
| **Memory** | 512 MB RAM |
| **CPU** | Shared |
| **Bandwidth** | 100 GB/month |
| **Build Minutes** | 500 min/month |
| **Uptime** | 750 hours/month (24/7) |
| **Spin Down** | After 15 min inactivity |
| **Cold Start** | ~30 seconds |
| **Cost** | **$0 forever** ✅ |

**For your prayer times app**: Well within limits! 🎉

---

## 🔍 Troubleshooting

### Build Fails

**Check Render logs**:
- Dashboard → Your Service → Logs
- Look for errors in build output

**Common issues**:
- Wrong root directory → Set to `mobile`
- Missing dependencies → Add `package.json` (we don't need it for server-final.js)

### Server Starts But Crashes

**Check logs for**:
- Port binding issues (Render sets PORT automatically)
- Node.js version issues (Render uses Node 18 by default)

**Fix**: Verify `server-final.js` uses:
```javascript
const PORT = process.env.PORT || 3001;
```
✅ Already configured!

### Prayer Times Not Loading

**First request after sleep**:
- Takes ~30 seconds (cold start)
- Subsequent requests are instant

**If still failing**:
```bash
# Test health endpoint
curl https://YOUR-APP.onrender.com/health

# Test prayer times
curl https://YOUR-APP.onrender.com/api/v1/prayer-times/1
```

### CORS Errors

Server already has CORS enabled:
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
```
✅ Should work from mobile app

---

## 📊 Compare: Render vs Railway

| Feature | Render (FREE) | Railway (PAID) |
|---------|---------------|----------------|
| **Cost** | $0 forever | $5/month minimum |
| **Uptime** | 750 hrs/month | Unlimited |
| **Sleep** | After 15 min | Never |
| **Cold Start** | ~30 seconds | N/A |
| **Build Minutes** | 500/month | Unlimited |
| **Bandwidth** | 100 GB/month | 100 GB/month |
| **Setup** | 3 minutes | 5 minutes |
| **Credit Card** | Not required | Required |

**Winner for Prayer Times App**: Render.com 🏆

---

## ✨ What Happens Next

Once deployed to Render.com:

1. ✅ **Server runs 24/7** (750 hours/month)
2. ✅ **Auto-refreshes prayer times** every 60 minutes
3. ✅ **Scrapes live data** from Awqat.com.au
4. ✅ **Serves mobile app** with accurate times
5. ⏸️ **Spins down after 15 min** of no requests
6. ⚡ **Wakes up in ~30 sec** when user opens app
7. 🆓 **Costs $0 forever**

---

## 🎉 Success Checklist

Your deployment is successful when:

- [ ] Render dashboard shows **"Live"** status (green)
- [ ] `/health` endpoint responds with `{"status":"ok"}`
- [ ] `/api/v1/masjids` returns 3 masjids
- [ ] `/api/v1/prayer-times/1` returns today's prayer times
- [ ] Mobile app loads prayer times from production URL
- [ ] Prayer times match Awqat.com.au (Fajr 5:41 AM)
- [ ] Notifications scheduled correctly (10 min before prayers)

---

## 📞 Support

**Render Support**:
- Docs: https://render.com/docs
- Community: https://community.render.com

**Your Project**:
- GitHub: https://github.com/shaqirfarook134/Prayer-times-app
- Issues: Open an issue on GitHub

**Quick Commands**:
```bash
# Test production API
curl https://prayer-times-api.onrender.com/health
curl https://prayer-times-api.onrender.com/api/v1/masjids
curl https://prayer-times-api.onrender.com/api/v1/prayer-times/1

# Update mobile app
# Edit: mobile/src/services/api.ts
# Change: localhost:3001 → prayer-times-api.onrender.com

# Restart mobile app
pkill -f "expo" && npx expo start --ios
```

---

## 🚀 Alternative Free Hosting Options

If Render doesn't work for you:

### 1. **Fly.io** (FREE)
- 3 shared VMs (256MB RAM each)
- No sleep/spin-down
- Slightly more complex setup

### 2. **Vercel** (FREE)
- Serverless functions
- Need to convert Node.js server
- Instant response, no cold start

### 3. **Railway** (FREE trial → $5/month)
- Better for production at scale
- No sleep/spin-down
- Requires payment after trial

**Recommendation**: Start with **Render.com (FREE)**, upgrade to Railway if you need 24/7 instant response.

---

## 📝 Next Steps

1. ✅ **Deploy to Render.com** (follow steps above)
2. ✅ **Get your production URL**
3. ✅ **Update mobile app API URL**
4. ✅ **Test end-to-end**
5. 🎉 **Your app is live!**

**Estimated time**: 5-10 minutes
**Cost**: $0 🆓
