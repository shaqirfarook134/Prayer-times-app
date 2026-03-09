# 🚀 Quick Start Guide

## Current Status: ✅ Everything is Running!

### What's Currently Active:
- ✅ **Mock API Server** - Running on `http://localhost:3001`
- ✅ **Mobile App** - Running in iPhone 17 Pro simulator
- ✅ **Admin Dashboard** - Open in your browser

---

## 🎯 Access Points

### 1. Admin Dashboard (Web)
**File:** `/Users/shaqirfarook/prayer-times-app/mobile/admin-dashboard.html`

**Quick Open:**
```bash
open /Users/shaqirfarook/prayer-times-app/mobile/admin-dashboard.html
```

**What you can do:**
- ➕ Add new masjids (just fill a form - no scripts!)
- 🗑️ Delete masjids
- 👁️ View prayer times
- ⚙️ Configure API settings

### 2. Mobile App
**Currently:** iPhone 17 Pro Simulator

**What you see:**
- Masjid Selection screen with 3 masjids
- Tap any masjid to see prayer times
- Pull down to refresh

### 3. Mock API Server
**Running on:** `http://localhost:3001`

**Test it:**
```bash
curl http://localhost:3001/api/v1/masjids
```

---

## 📱 Try It Now!

### Step 1: Add a New Masjid (Web Dashboard)

1. **Open the admin dashboard** (should already be open in your browser)

2. **Go to "Manage Masjids" tab**

3. **Fill in the form:**
   - Name: `Noble Park Mosque`
   - URL: `https://awqat.com.au/noblepark/`
   - City: `Melbourne`
   - State: `VIC`
   - Timezone: `Australia/Melbourne`

4. **Click "Add Masjid"** button

5. **See it appear** in the list below instantly! ✨

### Step 2: View in Mobile App

1. **Go to the iPhone simulator**

2. **Pull down on the masjid list** to refresh

3. **See your new masjid** appear! 🎉

4. **Tap on it** to see prayer times

---

## 🕌 Managing Masjids

### Easy Way: Use Web Dashboard
✅ **Recommended** - No coding required!

1. Open `admin-dashboard.html` in browser
2. Fill in a simple form
3. Click "Add"
4. Done!

### Advanced Way: Edit Mock Server
⚠️ For developers only

1. Edit `mobile/mock-server.js`
2. Add masjid to `masjids` array
3. Restart server
4. Refresh app

---

## 📊 Current Masjids

You currently have **3 masjids**:

1. **Al Taqwa Masjid** (Melbourne, VIC)
2. **Preston Mosque** (Melbourne, VIC)
3. **Sydney Islamic Centre** (Sydney, NSW)

---

## 🎨 Admin Dashboard Features

### Tab 1: Manage Masjids
- ➕ Add new masjids with a form
- 📋 View all masjids in beautiful cards
- 🗑️ Delete masjids with one click
- 🔄 Auto-refreshes after changes

### Tab 2: Prayer Times
- 📅 Select any masjid
- ⏰ View today's prayer times:
  - Fajr
  - Dhuhr
  - Asr
  - Maghrib
  - Isha

### Tab 3: Settings
- 🔌 Configure API URL
- 🧪 Test connection
- 🔄 Quick refresh actions

---

## 🔄 Full Workflow

### Complete Process:

1. **Open Admin Dashboard**
   ```bash
   open /Users/shaqirfarook/prayer-times-app/mobile/admin-dashboard.html
   ```

2. **Add Your Local Masjid**
   - Fill in the form
   - Click "Add Masjid"

3. **Verify in Dashboard**
   - Go to "Prayer Times" tab
   - Select your masjid
   - See prayer times

4. **Check Mobile App**
   - Pull down to refresh
   - Tap on your masjid
   - See prayer times with countdown

5. **Test Notifications**
   - Toggle notifications on
   - Wait for notification 10 min before prayer

---

## 🛠️ Restart Everything

If you need to restart from scratch:

### Stop Everything:
```bash
# Stop mock server
pkill -f "mock-server"

# Stop Expo
pkill -f "expo start"
```

### Start Everything:
```bash
# Terminal 1: Start Mock Server
cd /Users/shaqirfarook/prayer-times-app/mobile
node mock-server.js

# Terminal 2: Start Mobile App
cd /Users/shaqirfarook/prayer-times-app/mobile
npm run ios

# Browser: Open Admin Dashboard
open admin-dashboard.html
```

---

## 📍 File Locations

```
prayer-times-app/
├── mobile/
│   ├── admin-dashboard.html     ← 🌟 Open this in browser
│   ├── mock-server.js            ← API server
│   ├── src/                      ← Mobile app code
│   └── App.tsx                   ← Mobile app entry
├── backend/                      ← GoLang backend (not running)
├── README.md                     ← Project overview
├── ADMIN_GUIDE.md               ← Detailed admin guide
├── HOW_TO_ADD_MASJID.md         ← Masjid management
└── QUICK_START.md               ← This file
```

---

## 🎯 What to Do Next

### For Testing:
1. ✅ **Try the admin dashboard** - Add/remove masjids
2. ✅ **Test mobile app** - See updates in real-time
3. ✅ **Check notifications** - Toggle and test

### For Production:
1. 📦 **Deploy backend** - See `DEPLOYMENT.md`
2. 🔐 **Add authentication** - Secure admin dashboard
3. 🌐 **Host dashboard** - Upload to web server
4. 📱 **Build mobile app** - Use `eas build`

---

## 💡 Pro Tips

### Tip 1: Keep Dashboard Open
Keep the admin dashboard open in a browser tab while developing. Make changes and see them instantly in the mobile app.

### Tip 2: Use Browser DevTools
Press F12 in the dashboard to see API requests and debug issues.

### Tip 3: Bookmark Important URLs
- Admin Dashboard: `file:///Users/shaqirfarook/prayer-times-app/mobile/admin-dashboard.html`
- API Health: `http://localhost:3001/health`

### Tip 4: Pull to Refresh
Always pull down to refresh in the mobile app after making changes in the dashboard.

---

## 🐛 Quick Troubleshooting

### Dashboard not loading masjids?
```bash
# Check if mock server is running
curl http://localhost:3001/api/v1/masjids

# Restart mock server
pkill -f "mock-server" && node mock-server.js
```

### Mobile app not showing updates?
1. Pull down to refresh in the app
2. Check API URL in app settings
3. Restart Expo: `pkill -f "expo" && npm run ios`

### Can't add masjid?
1. Check all required fields are filled
2. Verify URL format is correct
3. Check browser console for errors

---

## 🎉 You're All Set!

You now have a **complete, working system** with:
- ✅ Beautiful web admin dashboard (no scripts needed!)
- ✅ Mobile app showing live data
- ✅ API server handling everything
- ✅ Real-time synchronization

**Everything you need is in one place!**

Have fun building your Prayer Times app! 🕌

---

**Need Help?**
- 📖 `ADMIN_GUIDE.md` - Detailed dashboard guide
- 🚀 `DEPLOYMENT.md` - Production deployment
- 🧪 `TESTING.md` - Testing procedures
- 📚 `README.md` - Full documentation
