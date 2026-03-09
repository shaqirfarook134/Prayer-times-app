# Prayer Times Mobile App - Production System

A production-ready mobile application for iOS and Android that displays daily prayer times for multiple Masjids with push notifications.

## System Architecture

### Backend (GoLang)
- **REST API**: Gin framework with structured routing
- **Database**: PostgreSQL with connection pooling (50 max connections for scalability)
- **Scraper**: Dual-strategy prayer time extraction (JSON → HTML fallback)
- **Background Worker**: Cron-based scheduler (hourly + daily refresh at 00:05 Australia/Melbourne)
- **Notifications**: Firebase Cloud Messaging (Android) + Apple Push Notifications (iOS)

### Mobile (React Native + Expo + TypeScript)
- **Framework**: Expo managed workflow
- **Navigation**: React Navigation
- **Storage**: AsyncStorage for offline caching
- **Notifications**: expo-notifications for local scheduling
- **API Client**: Axios with retry logic

### Database Schema
- **masjids**: Mosque information
- **prayer_times**: Daily prayer times with timezone support
- **device_tokens**: Push notification device registration
- **logs**: System monitoring and error tracking

## Project Structure

```
prayer-times-app/
├── backend/
│   ├── cmd/api/main.go              # Application entry point
│   ├── internal/
│   │   ├── config/                  # Configuration management
│   │   ├── database/                # Database connection
│   │   ├── models/                  # Data models
│   │   ├── repository/              # Data access layer
│   │   ├── handlers/                # HTTP handlers
│   │   ├── middleware/              # HTTP middleware
│   │   ├── router/                  # Route definitions
│   │   ├── scraper/                 # Prayer time scraper
│   │   ├── services/                # Business logic
│   │   └── worker/                  # Background worker
│   ├── migrations/                  # Database migrations
│   ├── go.mod                       # Go dependencies
│   └── .env.example                 # Environment variables template
├── mobile/
│   ├── src/
│   │   ├── services/                # API, Storage, Notifications
│   │   ├── types/                   # TypeScript types
│   │   ├── screens/                 # UI screens
│   │   └── components/              # Reusable components
│   ├── app.json                     # Expo configuration
│   └── package.json                 # NPM dependencies
└── README.md
```

## Setup Instructions

### Prerequisites
- Go 1.21+
- PostgreSQL 14+
- Node.js 18+
- Expo CLI
- Firebase account (for FCM)
- Apple Developer account (for APNs)

### Backend Setup

1. **Install dependencies**:
```bash
cd backend
go mod download
```

2. **Setup database**:
```bash
# Create database
createdb prayer_times_db

# Run migrations
psql prayer_times_db < migrations/001_init_schema.up.sql
```

3. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your database credentials and API keys
```

4. **Run backend**:
```bash
go run cmd/api/main.go
```

Backend will start on `http://localhost:8080`

### Mobile App Setup

1. **Install dependencies**:
```bash
cd mobile
npm install
```

2. **Configure environment**:
```bash
cp .env.example .env
# Update API_BASE_URL if needed
```

3. **Run app**:
```bash
# iOS
npm run ios

# Android
npm run android

# Web (for development)
npm run web
```

## API Endpoints

### Public Endpoints
- `GET /api/v1/masjids` - List all masjids
- `GET /api/v1/masjids/:id` - Get masjid details
- `GET /api/v1/prayer-times/:masjidId` - Get today's prayer times
- `GET /api/v1/prayer-times/:masjidId/:date` - Get prayer times for specific date
- `POST /api/v1/devices/register` - Register device for notifications
- `PUT /api/v1/devices/preferences` - Update device preferences
- `DELETE /api/v1/devices/unregister` - Unregister device

### Admin Endpoints (Protected)
- `POST /api/v1/admin/masjids` - Create new masjid
- `DELETE /api/v1/admin/masjids/:id` - Delete masjid

### Health Check
- `GET /health` - Service health status

## Features

### Backend Features
✅ Automatic prayer time scraping from Awqat websites
✅ Dual extraction strategy (JSON → HTML fallback)
✅ Data validation (format, chronological order, change detection)
✅ Scheduled updates (hourly + daily refresh)
✅ Push notification scheduling via FCM/APNs
✅ Connection pooling for 50k+ users
✅ Comprehensive error logging
✅ Rate limiting and CORS support
✅ Graceful shutdown

### Mobile Features
✅ Masjid selection
✅ Today's prayer times display
✅ Next prayer countdown
✅ Push notifications (10 min before each prayer)
✅ Offline support with caching
✅ Automatic sync on app open
✅ Notification preferences
✅ iOS and Android support

## Testing

### Backend Tests
```bash
cd backend
go test ./...
```

### Mobile Tests
```bash
cd mobile
npm test
```

## Deployment

### Backend Deployment

#### Docker
```bash
cd backend
docker build -t prayer-times-api .
docker run -p 8080:8080 --env-file .env prayer-times-api
```

#### Cloud Platforms
- **AWS**: Deploy to ECS/Fargate or EC2
- **GCP**: Deploy to Cloud Run or GKE
- **Fly.io**: Deploy using fly.toml configuration
- **Render**: Deploy as Web Service

### Mobile Deployment

#### Build for Production
```bash
cd mobile

# iOS
eas build --platform ios

# Android
eas build --platform android
```

#### Submit to App Stores
```bash
# iOS App Store
eas submit --platform ios

# Google Play Store
eas submit --platform android
```

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://user:password@localhost:5432/prayer_times_db
PORT=8080
FCM_SERVER_KEY=your_fcm_key
APNS_AUTH_KEY_PATH=/path/to/AuthKey.p8
APNS_KEY_ID=your_key_id
APNS_TEAM_ID=your_team_id
APNS_TOPIC=com.prayertimes.app
```

### Mobile (.env)
```
API_BASE_URL=https://your-api.com/api/v1
```

## Scaling Considerations

- **Database**: Connection pooling configured for 50 connections
- **API**: Stateless design allows horizontal scaling
- **Caching**: Implement Redis for prayer times caching (future)
- **CDN**: Serve API responses through CDN for global users
- **Load Balancer**: Use Nginx or cloud load balancer for multiple instances

## Monitoring & Logging

- **Logs Table**: Stores all scraping attempts, errors, and changes
- **Health Check**: `/health` endpoint for uptime monitoring
- **Error Tracking**: Structured error logging with context
- **Metrics**: Monitor API response times, scraper success rate

## Security

✅ HTTPS enforced for all API traffic
✅ Rate limiting (100 req/min per IP)
✅ Input validation on all endpoints
✅ No secrets in code (environment variables)
✅ CORS configuration
✅ SQL injection prevention (parameterized queries)
✅ Device token validation

## Reliability Features

✅ Retry logic with exponential backoff (3 attempts)
✅ Data validation before database updates
✅ Change detection (30-min safety threshold)
✅ Offline support with cached data
✅ Graceful degradation
✅ Database connection health checks
✅ Automatic reconnection

## Future Enhancements

- [ ] Ramadan timetables
- [ ] Jumuah prayer times
- [ ] Masjid announcements
- [ ] Community events calendar
- [ ] Multi-country support
- [ ] Redis caching layer
- [ ] Admin web dashboard
- [ ] Analytics and usage tracking
- [ ] Multi-language support

## Support

For issues and feature requests, please create an issue in the repository.

## License

Proprietary - All rights reserved
