# 🕌 Prayer Times Mobile App

A React Native mobile application that displays daily prayer times for Australian Masjids with automatic updates and notifications.

## ✨ Features

- 📅 **Live Prayer Times** - Scraped from Awqat.com.au data files
- 🕰️ **Adhan & Iqama Times** - Both times displayed in 12-hour format
- 🔄 **Auto-Refresh** - Updates every 60 minutes automatically
- 🔔 **Notifications** - 10 minutes before each prayer
- 🕌 **Multiple Masjids** - Al Taqwa, Preston Mosque, Sydney Islamic Centre
- 📱 **Offline Support** - Cached prayer times with AsyncStorage

## 🆓 FREE Deployment

**Render.com** - 100% free forever:
- ✅ $0 cost
- ✅ 750 hours/month
- ✅ Auto-deploy from GitHub
- 👉 **See: [`DEPLOY_FREE.md`](DEPLOY_FREE.md)** - Deploy in 3 minutes

## 📊 Architecture

```
┌─────────────────┐
│  Mobile App     │  React Native + Expo + TypeScript
│  (iOS/Android)  │  expo-notifications + AsyncStorage
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│   API Server    │  Node.js (server-final.js)
│  (Render.com)   │  In-memory cache (1 hour)
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│  Awqat.com.au   │  Prayer times data files
│  (Data Source)  │  wtimes-AU.MELBOURNE.ini
└─────────────────┘
```

### Tech Stack

**Frontend:**
- React Native + Expo
- TypeScript (strict mode)
- expo-notifications
- AsyncStorage

**Backend:**
- Node.js (native http/https modules)
- Live scraping from Awqat data files
- 1-hour caching
- CORS enabled

**Deployment:**
- GitHub (code hosting - FREE)
- Render.com (API hosting - FREE)
- Expo EAS (app builds - 15 free/month)

## 🚀 Quick Start

### Development

```bash
# Clone repository
git clone https://github.com/shaqirfarook134/Prayer-times-app.git
cd Prayer-times-app

# Install mobile dependencies
cd mobile
npm install

# Start API server (in one terminal)
node server-final.js

# Run mobile app (in another terminal)
npm run ios      # For iOS
npm run android  # For Android
```

Server runs on: `http://localhost:3001`

### Production Deployment

👉 **See: [`DEPLOY_FREE.md`](DEPLOY_FREE.md)** for step-by-step deployment to Render.com (FREE)

## 📡 API Endpoints

- `GET /api/v1/masjids` - List all masjids
- `GET /api/v1/masjids/:id` - Get single masjid
- `GET /api/v1/prayer-times/:id` - Get live prayer times (scraped)
- `POST /api/v1/admin/masjids` - Add new masjid
- `DELETE /api/v1/admin/masjids/:id` - Delete masjid
- `POST /api/v1/devices/register` - Register device
- `GET /health` - Server health check

## 🕌 Configured Masjids

1. **Al Taqwa Masjid** - Melbourne, VIC
2. **Preston Mosque** - Melbourne, VIC
3. **Sydney Islamic Centre** - Sydney, NSW

## 🧪 Testing

```bash
# Test API locally
curl http://localhost:3001/health
curl http://localhost:3001/api/v1/masjids
curl http://localhost:3001/api/v1/prayer-times/1

# Test production
curl https://prayer-times-api.onrender.com/health
curl https://prayer-times-api.onrender.com/api/v1/masjids
```

## 💰 Cost Breakdown

| Service | Cost | Plan |
|---------|------|------|
| **GitHub** | $0 | Free tier |
| **Render.com** | $0 | Free tier (750 hrs/month) |
| **Expo Development** | $0 | Free tier |
| **Expo EAS Build** | $0 | Free (15 builds/month) |
| **Apple Developer** | $99/year | Required for App Store |
| **Google Play** | $25 one-time | Required for Play Store |

**Total Monthly Cost: $0** 🎉

## 📖 Documentation

- **[DEPLOY_FREE.md](DEPLOY_FREE.md)** - Deploy to Render.com (FREE)
- **[COMPLETE_SYSTEM_DESIGN.md](COMPLETE_SYSTEM_DESIGN.md)** - Full architecture
- **[HOW_TO_ADD_MASJID.md](HOW_TO_ADD_MASJID.md)** - Add new masjids
- **[mobile/README.md](mobile/README.md)** - Mobile app details

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

MIT License

## 🙏 Acknowledgments

- Prayer times data from [Awqat.com.au](https://awqat.com.au)
- Built with [React Native](https://reactnative.dev) and [Expo](https://expo.dev)
- Deployed on [Render.com](https://render.com)

---

Made with ❤️ for the Muslim community
