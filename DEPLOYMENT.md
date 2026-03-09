# Deployment Guide

## Local Development

### Backend

1. **Start with Docker Compose**:
```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
docker-compose up -d
```

2. **Or run natively**:
```bash
# Start PostgreSQL
createdb prayer_times_db
psql prayer_times_db < migrations/001_init_schema.up.sql

# Run backend
go run cmd/api/main.go
```

### Mobile App

```bash
cd mobile
npm install
npm run ios     # for iOS
npm run android # for Android
```

---

## Production Deployment

### Option 1: AWS Deployment

#### Backend on ECS/Fargate

1. **Build and push Docker image**:
```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t prayer-times-api .
docker tag prayer-times-api:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/prayer-times-api:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/prayer-times-api:latest
```

2. **Create ECS Task Definition** with:
   - Container: prayer-times-api
   - Port: 8080
   - Environment variables from .env
   - Health check: /health endpoint

3. **Create ECS Service**:
   - Use Application Load Balancer
   - Configure auto-scaling (2-10 tasks)
   - Set target tracking: 70% CPU

#### Database on RDS

```bash
# Create PostgreSQL RDS instance
aws rds create-db-instance \
  --db-instance-identifier prayer-times-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username admin \
  --master-user-password YOUR_PASSWORD \
  --allocated-storage 20
```

---

### Option 2: Google Cloud Platform

#### Backend on Cloud Run

```bash
# Build and deploy
gcloud builds submit --tag gcr.io/YOUR_PROJECT/prayer-times-api
gcloud run deploy prayer-times-api \
  --image gcr.io/YOUR_PROJECT/prayer-times-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=YOUR_DB_URL
```

#### Database on Cloud SQL

```bash
gcloud sql instances create prayer-times-db \
  --database-version=POSTGRES_14 \
  --tier=db-f1-micro \
  --region=us-central1
```

---

### Option 3: Fly.io (Recommended for Small Scale)

1. **Install Fly CLI**:
```bash
curl -L https://fly.io/install.sh | sh
```

2. **Create fly.toml**:
```toml
app = "prayer-times-api"

[build]
  dockerfile = "Dockerfile"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

[env]
  PORT = "8080"
  GIN_MODE = "release"
```

3. **Deploy**:
```bash
cd backend
fly launch
fly secrets set DATABASE_URL=your_db_url
fly secrets set FCM_SERVER_KEY=your_key
fly deploy
```

---

### Option 4: Render

1. **Create New Web Service**:
   - Connect GitHub repository
   - Build Command: `go build -o main cmd/api/main.go`
   - Start Command: `./main`

2. **Add PostgreSQL Database**:
   - Create PostgreSQL database
   - Copy internal connection string
   - Add as environment variable

---

## Mobile App Deployment

### iOS App Store

1. **Configure EAS**:
```bash
cd mobile
npm install -g eas-cli
eas login
eas build:configure
```

2. **Create build**:
```bash
# Create production build
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios
```

3. **Requirements**:
   - Apple Developer Account ($99/year)
   - App Store Connect setup
   - App privacy details
   - Screenshots and descriptions

### Android Play Store

1. **Create build**:
```bash
# Create production build
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

2. **Requirements**:
   - Google Play Developer Account ($25 one-time)
   - Play Console setup
   - Privacy policy URL
   - Content rating questionnaire

---

## Firebase & APNs Setup

### Firebase Cloud Messaging (Android)

1. **Create Firebase project**:
   - Go to console.firebase.google.com
   - Create new project
   - Add Android app with package name: `com.prayertimes.app`

2. **Download google-services.json**:
   - Place in `mobile/` directory

3. **Get Server Key**:
   - Project Settings → Cloud Messaging → Server Key
   - Add to backend .env: `FCM_SERVER_KEY=your_key`

### Apple Push Notifications (iOS)

1. **Create APNs Auth Key**:
   - Apple Developer → Certificates, Identifiers & Profiles
   - Keys → Create new key
   - Enable Apple Push Notifications service (APNs)
   - Download .p8 file

2. **Configure backend**:
```bash
APNS_AUTH_KEY_PATH=/path/to/AuthKey_XXXXX.p8
APNS_KEY_ID=XXXXX
APNS_TEAM_ID=XXXXX
APNS_TOPIC=com.prayertimes.app
APNS_PRODUCTION=true
```

---

## Environment Variables Checklist

### Backend (.env)
- [ ] `DATABASE_URL`
- [ ] `PORT`
- [ ] `FCM_SERVER_KEY`
- [ ] `APNS_AUTH_KEY_PATH`
- [ ] `APNS_KEY_ID`
- [ ] `APNS_TEAM_ID`
- [ ] `APNS_TOPIC`
- [ ] `APNS_PRODUCTION`

### Mobile (.env)
- [ ] `API_BASE_URL` (production API URL)

---

## Post-Deployment Checklist

- [ ] Database migrations applied
- [ ] Health check endpoint working: `/health`
- [ ] Test API endpoints:
  - `GET /api/v1/masjids`
  - `GET /api/v1/prayer-times/1`
- [ ] Verify background worker is running (check logs for cron jobs)
- [ ] Test push notifications on both iOS and Android
- [ ] Monitor logs for errors
- [ ] Set up monitoring/alerting (CloudWatch, Datadog, etc.)
- [ ] Configure backup strategy for database
- [ ] Set up SSL/TLS certificate (Let's Encrypt or cloud provider)
- [ ] Enable CORS for your domain
- [ ] Rate limiting configured

---

## Monitoring & Maintenance

### Health Checks
```bash
# API health
curl https://your-api.com/health

# Database connection
psql $DATABASE_URL -c "SELECT 1"
```

### Logs
```bash
# Docker
docker logs prayer-times-api

# Fly.io
fly logs

# AWS ECS
aws logs tail /ecs/prayer-times-api --follow
```

### Database Backups
```bash
# Manual backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup_20240101.sql
```

---

## Scaling Considerations

### Database
- Start with smallest instance
- Enable connection pooling (already configured: 50 max connections)
- Add read replicas if read-heavy
- Consider managed database service for automatic backups

### API
- Horizontal scaling: 2-10 instances based on load
- Use load balancer for distribution
- Enable auto-scaling based on CPU (70% threshold)
- Consider CDN for static content

### Caching
- Add Redis for prayer times caching (future enhancement)
- Cache API responses for 1 hour
- Implement cache invalidation on data updates

---

## Troubleshooting

### Backend won't start
```bash
# Check logs
docker logs prayer-times-api

# Verify database connection
psql $DATABASE_URL -c "SELECT 1"

# Check environment variables
docker exec prayer-times-api env
```

### Mobile app can't connect to API
- Verify API_BASE_URL in .env
- Check CORS configuration
- Test API with curl/Postman
- Verify network connectivity

### Notifications not working
- Check FCM/APNs credentials
- Verify device token registration
- Check notification permissions on device
- Review backend logs for notification errors

---

## Security Best Practices

- [ ] Use HTTPS for all traffic
- [ ] Rotate API keys regularly
- [ ] Enable database encryption at rest
- [ ] Use secrets management (AWS Secrets Manager, GCP Secret Manager)
- [ ] Implement rate limiting
- [ ] Regular security updates
- [ ] Monitor for suspicious activity
- [ ] Backup encryption keys securely

---

## Cost Optimization

### Free Tier Options
- **Fly.io**: Free for small apps (256MB RAM)
- **Render**: Free tier available
- **Supabase**: Free PostgreSQL (500MB)
- **Expo**: Free build and deployment

### Estimated Monthly Costs (50k users)
- **AWS**: $50-100 (t3.small EC2 + RDS db.t3.micro)
- **GCP**: $40-80 (Cloud Run + Cloud SQL)
- **Fly.io**: $15-30 (paid plan with PostgreSQL)

---

## Support

For deployment issues:
1. Check logs first
2. Review environment variables
3. Verify database connectivity
4. Test API endpoints manually
5. Create GitHub issue if problem persists
