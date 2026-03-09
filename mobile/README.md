# Prayer Times Mobile App

A React Native mobile application that displays daily prayer times for multiple Masjids in Australia with automatic updates and notifications.

## 🕌 Features

- **Live Prayer Times** - Scraped from Awqat.com.au data files
- **Adhan & Iqama Times** - Both times displayed in 12-hour format
- **Auto-Refresh** - Updates every 60 minutes automatically
- **Local Notifications** - 10 minutes before each prayer
- **Multiple Masjids** - Pre-configured with Al Taqwa, Preston Mosque, Sydney Islamic Centre
- **Offline Support** - Cached prayer times with AsyncStorage

## 🚀 Quick Start

### Mobile App

```bash
cd mobile
npm install
npm run ios      # For iOS
npm run android  # For Android
```

### API Server (Development)

```bash
cd mobile
node server-final.js
```

Server runs on: `http://localhost:3001`

## 📡 API Endpoints

- `GET /api/v1/masjids` - List all masjids
- `GET /api/v1/masjids/:id` - Get single masjid
- `GET /api/v1/prayer-times/:id` - Get live prayer times
- `POST /api/v1/admin/masjids` - Add new masjid
- `DELETE /api/v1/admin/masjids/:id` - Delete masjid
- `GET /health` - Server health check

## 🏗️ Architecture

```
┌─────────────────┐
│  Mobile App     │
│  (React Native) │
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│   API Server    │
│   (Node.js)     │
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│  Awqat.com.au   │
│  (Data Files)   │
└─────────────────┘
```

## 📱 Tech Stack

- **Frontend**: React Native + Expo + TypeScript
- **Backend**: Node.js (native http/https modules)
- **Notifications**: expo-notifications
- **Storage**: AsyncStorage
- **Deployment**: Railway (Node.js server)

## 🔧 Configuration

### Masjid Configuration

Each masjid has:
- Name, city, state, timezone
- Awqat.com.au URL
- City code (for data file)
- Iqama offset configuration (minutes after Adhan or fixed time)

### Iqama Times

Configured in `server-final.js`:

```javascript
const iqamaConfig = {
  1: { // Al Taqwa
    fajr: 20,      // 20 min after Adhan
    dhuhr: "14:15", // Fixed time
    asr: 10,
    maghrib: 7,
    isha: "21:30"
  }
};
```

## 📊 Data Source

Prayer times are scraped from Awqat data files:

**Format**: `"MM-DD~~~~~HH:MM|HH:MM|HH:MM|HH:MM|HH:MM|HH:MM"`

**Example**: `"03-09~~~~~05:41|07:12|13:31|17:07|19:54|21:01"`

**Order**: Fajr | Sunrise | Dhuhr | Asr | Maghrib | Isha

## 🎨 Admin Dashboard

Open `admin-dashboard.html` in a browser to:
- View all masjids
- Add new masjids
- Delete masjids
- View current prayer times

## 📖 Documentation

- [Production Deployment Guide](../PRODUCTION_DEPLOYMENT.md)
- [Complete System Design](../COMPLETE_SYSTEM_DESIGN.md)
- [How to Add a Masjid](../HOW_TO_ADD_MASJID.md)
- [Testing Guide](../TESTING.md)

## 🚢 Deployment

### Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
cd mobile
railway init
railway up
```

See [PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md) for detailed instructions.

## 🔔 Notifications

### Local Notifications (✅ Implemented)
- Scheduled on device
- Works offline
- 10 min before each prayer
- Includes Adhan and Iqama times

### Push Notifications (⚠️ Pending)
- Requires Firebase Cloud Messaging setup
- See [COMPLETE_SYSTEM_DESIGN.md](../COMPLETE_SYSTEM_DESIGN.md)

## 🧪 Testing

```bash
# Test API server
curl http://localhost:3001/health
curl http://localhost:3001/api/v1/masjids
curl http://localhost:3001/api/v1/prayer-times/1

# Run mobile app
npm run ios
```

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📧 Support

For issues and questions, please open a GitHub issue.
