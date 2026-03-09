# Admin Dashboard Guide

## 🎉 Quick Start

### Open the Admin Dashboard

Simply open this file in your browser:
```
/Users/shaqirfarook/prayer-times-app/mobile/admin-dashboard.html
```

Or run:
```bash
open /Users/shaqirfarook/prayer-times-app/mobile/admin-dashboard.html
```

---

## ✨ Features

### 1. **Manage Masjids Tab**

#### Add New Masjid
1. Fill in the form with:
   - **Masjid Name** (e.g., "Al Taqwa Masjid")
   - **Awqat URL** (e.g., "https://awqat.com.au/altaqwamasjid/")
   - **City** (e.g., "Melbourne")
   - **State** (Select from dropdown)
   - **Timezone** (Auto-suggested based on state)

2. Click **"Add Masjid"**

3. The masjid will appear in the list below immediately

#### View All Masjids
- Scroll down to see all added masjids
- Each card shows:
  - Masjid name
  - Location (city, state)
  - Awqat URL
  - Timezone

#### Delete Masjid
- Click the red **"Delete"** button on any masjid card
- Confirm the deletion
- Masjid is removed from the system

---

### 2. **Prayer Times Tab**

#### View Prayer Times
1. Select a masjid from the dropdown
2. Prayer times will load automatically
3. You'll see:
   - Fajr
   - Dhuhr
   - Asr
   - Maghrib
   - Isha

---

### 3. **Settings Tab**

#### Configure API
- **Change API URL** if using production backend
  - Mock Server: `http://localhost:3001/api/v1`
  - Real Backend: `http://localhost:8080/api/v1`

#### Test Connection
- Click **"Test Connection"** to verify API is working

#### Quick Actions
- **Refresh Masjid List** - Reload all masjids
- **Clear Cache** - Clear browser cache

---

## 📱 How It Works

### With Mock Server (Current Setup)
1. Mock server runs on `http://localhost:3001`
2. Admin dashboard connects to this API
3. All changes are in-memory (lost on server restart)
4. Perfect for testing and development

### With Real Backend (Production)
1. Start the GoLang backend
2. Change API URL in Settings tab to `http://localhost:8080/api/v1`
3. All changes are saved to PostgreSQL database
4. Backend automatically scrapes prayer times every hour
5. Data persists across restarts

---

## 🎯 Common Tasks

### Task 1: Add Your Local Masjid

1. Find your masjid on https://awqat.com.au/
   - Example: https://awqat.com.au/yourmasjid/

2. Copy the URL

3. Open Admin Dashboard

4. Go to "Manage Masjids" tab

5. Fill in the form:
   ```
   Name: Your Masjid Name
   URL: https://awqat.com.au/yourmasjid/
   City: Your City
   State: Your State
   Timezone: (auto-selected)
   ```

6. Click "Add Masjid"

7. Done! ✅

### Task 2: View Prayer Times

1. Go to "Prayer Times" tab
2. Select your masjid from dropdown
3. Prayer times appear automatically
4. These times are shown in the mobile app too!

### Task 3: Remove Old Masjid

1. Go to "Manage Masjids" tab
2. Scroll to the masjid you want to remove
3. Click red "Delete" button
4. Confirm deletion
5. Masjid is removed from app

---

## 🔄 Integration with Mobile App

### How They Work Together

1. **You add a masjid in Admin Dashboard**
   → Masjid saved to API
   → Mobile app fetches updated list

2. **Backend scrapes prayer times** (every hour)
   → Prayer times stored in database
   → Mobile app displays them
   → Notifications scheduled automatically

3. **User selects masjid in mobile app**
   → App fetches prayer times from API
   → Schedules local notifications
   → Shows countdown to next prayer

### Real-Time Updates

- Changes in admin dashboard are **immediately** available in mobile app
- Just pull down to refresh in the mobile app
- No app restart needed!

---

## 🚀 Production Deployment

### For Production Use

1. **Deploy the backend** (see DEPLOYMENT.md)

2. **Update API URL** in admin dashboard:
   - Go to Settings tab
   - Change API URL to your production URL
   - Example: `https://your-api.com/api/v1`

3. **Secure the admin endpoints**:
   - Add authentication (username/password)
   - Use HTTPS only
   - Restrict access by IP if needed

4. **Host the admin dashboard**:
   - Upload `admin-dashboard.html` to web server
   - Or serve it from your backend
   - Access from anywhere: `https://your-domain.com/admin`

---

## 🎨 Features

### ✅ What You Can Do:
- ✅ Add unlimited masjids
- ✅ View all masjids in a beautiful list
- ✅ Delete masjids with confirmation
- ✅ View prayer times for any masjid
- ✅ Switch between mock and real API
- ✅ Test API connection
- ✅ Works on desktop and mobile browsers
- ✅ Beautiful, modern UI
- ✅ Real-time feedback
- ✅ No installation required (just open HTML file)

### 🔒 Security Notes:
- Currently no authentication (for development only)
- For production, add login system
- Use environment variables for API keys
- Enable HTTPS
- Add rate limiting

---

## 💡 Tips & Tricks

1. **Keep admin dashboard open** while developing
   - Make changes and see results immediately
   - Test mobile app integration

2. **Bookmark the page** for quick access

3. **Use browser console** to debug API calls
   - Press F12 to open developer tools
   - Check Network tab for API requests

4. **Refresh mobile app** after adding masjids
   - Pull down on masjid list
   - New masjids appear instantly

---

## 🐛 Troubleshooting

### Dashboard won't load?
- Make sure mock server is running
- Check browser console for errors
- Try refreshing the page

### Can't add masjid?
- Verify API is running: `curl http://localhost:3001/health`
- Check all required fields are filled
- Ensure URL is valid Awqat website

### Prayer times not showing?
- Select a masjid from dropdown first
- Check if mock server has prayer time data
- View browser console for error messages

### "Connection failed" error?
- Verify mock server is running on port 3001
- Check Settings tab has correct API URL
- Try "Test Connection" button

---

## 📚 Next Steps

1. **Add all your local masjids**
2. **Test on mobile app**
3. **Deploy to production**
4. **Share with community**

For more help, see:
- `README.md` - Project overview
- `DEPLOYMENT.md` - Production deployment
- `HOW_TO_ADD_MASJID.md` - Detailed masjid management
- `TESTING.md` - Testing procedures

---

## 🎯 Summary

You now have a **beautiful, user-friendly admin dashboard** that:
- ✅ Works in any modern browser
- ✅ No scripts needed - just click and type
- ✅ Integrates seamlessly with mobile app
- ✅ Can be used with mock server OR real backend
- ✅ Production-ready with minimal changes

**Current Status:**
- 📂 Location: `/Users/shaqirfarook/prayer-times-app/mobile/admin-dashboard.html`
- 🌐 Just open in browser to use
- 🔌 Connected to: `http://localhost:3001/api/v1`
- 📱 Mobile app updates automatically

Enjoy managing your Prayer Times app! 🕌
