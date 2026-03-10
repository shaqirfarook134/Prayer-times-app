# Deploy Prayer Times API with PostgreSQL Database

This guide shows you how to deploy your Prayer Times API with persistent PostgreSQL storage on Render.com (FREE tier).

## What's Changed?

**Before**: Masjids stored in memory → Lost when server restarts
**After**: Masjids stored in PostgreSQL → Persistent across restarts ✅

---

## Quick Deploy Steps

### Step 1: Push Code to GitHub

```bash
cd /Users/shaqirfarook/prayer-times-app
git add .
git commit -m "Add PostgreSQL database integration"
git push
```

### Step 2: Deploy on Render.com

1. **Go to Render Dashboard**: https://dashboard.render.com

2. **Delete Old Service** (if exists):
   - Find your existing `prayer-times-api` service
   - Click on it → Settings → Delete Service
   - Confirm deletion

3. **Create New Service with Database**:
   - Click **"New +"** → **"Blueprint"**
   - Connect your GitHub repository: `shaqirfarook134/prayer-times-app`
   - Click **"Apply"**

   This will create TWO things automatically:
   - PostgreSQL Database (free tier)
   - Web Service (connected to database)

### Step 3: Initialize Database Schema

Once deployed, you need to run the schema SQL to create tables:

1. **Go to Database**:
   - Dashboard → Databases → `prayer-times-db`
   - Copy the **External Database URL** (starts with `postgres://`)

2. **Run Schema** (using psql):

   **Option A - Use Render Shell**:
   - Go to your database in Render
   - Click "Connect" → "External Connection"
   - Copy the PSQL command and run it in your terminal
   - Once connected, paste the contents of `mobile/database/schema.sql`

   **Option B - Use Render Web Console**:
   - Go to your database → "Query" tab
   - Copy and paste the entire contents of `mobile/database/schema.sql`
   - Click "Run"

### Step 4: Verify Deployment

1. **Check Web Service**:
   - Go to your web service in Render
   - Check the logs - you should see:
     ```
     ✅ Database connected successfully
     ✅ Prayer Times API Server (Production + PostgreSQL) running
     ```

2. **Test API**:
   ```bash
   # Replace with your Render URL
   curl https://prayer-times-api-0pas.onrender.com/api/v1/masjids
   ```

   You should see 3 default masjids.

3. **Test Persistence**:
   - Add a masjid using the admin dashboard
   - Wait 15 minutes for Render to spin down the service
   - Reload the app - your masjid should still be there! 🎉

---

## File Changes Summary

### New Files Created:
1. **`mobile/database/schema.sql`** - PostgreSQL database schema
2. **`mobile/server-production-db.js`** - Server with PostgreSQL integration
3. **`DEPLOY_WITH_DATABASE.md`** - This deployment guide

### Modified Files:
1. **`mobile/package.json`** - Added `pg` dependency
2. **`mobile/render.yaml`** - Added database configuration

### Old Files (no longer used):
- `mobile/server-production.js` - Old in-memory version (kept for reference)

---

## Local Testing (Optional)

To test the database server locally:

### 1. Install PostgreSQL:
```bash
# macOS
brew install postgresql@14
brew services start postgresql@14
```

### 2. Create Local Database:
```bash
createdb prayer_times
psql prayer_times < mobile/database/schema.sql
```

### 3. Run Server:
```bash
cd mobile
export DATABASE_URL="postgresql://localhost/prayer_times"
node server-production-db.js
```

### 4. Test:
```bash
curl http://localhost:3001/api/v1/masjids
```

---

## Database Schema

The PostgreSQL database has 3 tables:

### `masjids`
- `id` - Auto-incrementing primary key
- `name` - Masjid name
- `url` - Awqat.com.au URL
- `city`, `state` - Location
- `timezone` - Timezone for prayer times
- `city_code` - Code for data file URL
- `created_at`, `updated_at` - Timestamps

### `iqama_config`
- `id` - Auto-incrementing primary key
- `masjid_id` - Foreign key to masjids
- `prayer_name` - fajr, dhuhr, asr, maghrib, isha
- `iqama_offset` - Minutes after adhan (or fixed time string)
- `created_at`, `updated_at` - Timestamps

### `devices`
- `id` - Auto-incrementing primary key
- `token` - Expo push notification token
- `platform` - ios or android
- `masjid_id` - Foreign key to masjids
- `notifications_enabled` - Boolean
- `created_at`, `updated_at` - Timestamps

---

## Benefits of PostgreSQL

✅ **Persistent Data** - Masjids survive server restarts
✅ **Scalability** - Can handle thousands of masjids
✅ **Concurrent Access** - Multiple devices can access safely
✅ **Free Tier** - Render.com offers 90 days free, then $7/month
✅ **Auto-backups** - Render automatically backs up your database
✅ **Production Ready** - Industry-standard database

---

## Troubleshooting

### Database Connection Errors
If you see `❌ Database connection failed`:
- Check that the database is created in Render
- Verify the `DATABASE_URL` environment variable is set
- Check database logs in Render dashboard

### Schema Not Applied
If you see errors about missing tables:
- Re-run the schema SQL in the database console
- Check database logs for error messages

### Old Data Still Showing
If you still see in-memory behavior:
- Verify `render.yaml` uses `server-production-db.js`
- Force redeploy: Dashboard → Manual Deploy → Deploy Latest Commit

---

## Need Help?

- **Render Docs**: https://render.com/docs/databases
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Check Logs**: Render Dashboard → Your Service → Logs

---

🎉 **Your Prayer Times API now has persistent storage!**

Masjids you add will stay there forever, even when the server restarts.
