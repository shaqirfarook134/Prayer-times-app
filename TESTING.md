# Testing Guide

## Overview

This guide covers testing procedures for the Prayer Times mobile application, including backend API tests, mobile app tests, and end-to-end testing.

---

## Backend Testing

### Unit Tests

Run all backend unit tests:

```bash
cd backend
go test ./... -v
```

Run specific package tests:

```bash
# Scraper tests
go test ./internal/scraper -v

# Handler tests
go test ./internal/handlers -v

# Repository tests (requires database)
go test ./internal/repository -v
```

### Test Coverage

Generate coverage report:

```bash
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html
```

View coverage in browser:
```bash
open coverage.html
```

### Integration Tests

Test with real database:

```bash
# Start test database
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
go test ./internal/repository/... -tags=integration -v

# Cleanup
docker-compose -f docker-compose.test.yml down
```

---

## API Testing

### Manual Testing with curl

**Get all masjids**:
```bash
curl http://localhost:8080/api/v1/masjids
```

**Get prayer times**:
```bash
curl http://localhost:8080/api/v1/prayer-times/1
```

**Register device**:
```bash
curl -X POST http://localhost:8080/api/v1/devices/register \
  -H "Content-Type: application/json" \
  -d '{
    "token": "test_device_token",
    "platform": "ios",
    "masjid_id": 1,
    "notifications_enabled": true
  }'
```

**Health check**:
```bash
curl http://localhost:8080/health
```

### Testing with Postman

Import the following collection:

```json
{
  "info": {
    "name": "Prayer Times API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get Masjids",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/api/v1/masjids"
      }
    },
    {
      "name": "Get Prayer Times",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/api/v1/prayer-times/1"
      }
    },
    {
      "name": "Register Device",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/v1/devices/register",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"token\": \"test_token\",\n  \"platform\": \"ios\",\n  \"masjid_id\": 1,\n  \"notifications_enabled\": true\n}"
        }
      }
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:8080"
    }
  ]
}
```

---

## Prayer Time Scraper Testing

### Test Scraper Manually

Create a test script:

```go
// backend/cmd/test-scraper/main.go
package main

import (
    "context"
    "fmt"
    "prayer-times-api/internal/config"
    "prayer-times-api/internal/scraper"
)

func main() {
    cfg := &config.ScraperConfig{
        UserAgent:  "Mozilla/5.0",
        Timeout:    10,
        MaxRetries: 3,
    }

    s := scraper.NewScraper(cfg)

    url := "https://awqat.com.au/altaqwamasjid/"
    timezone := "Australia/Melbourne"

    ctx := context.Background()
    times, err := s.FetchPrayerTimes(ctx, url, timezone)
    if err != nil {
        fmt.Printf("Error: %v\n", err)
        return
    }

    fmt.Printf("Prayer Times:\n")
    fmt.Printf("Fajr:    %s\n", times.Fajr)
    fmt.Printf("Dhuhr:   %s\n", times.Dhuhr)
    fmt.Printf("Asr:     %s\n", times.Asr)
    fmt.Printf("Maghrib: %s\n", times.Maghrib)
    fmt.Printf("Isha:    %s\n", times.Isha)
}
```

Run:
```bash
go run cmd/test-scraper/main.go
```

### Test Data Validation

```bash
# Test with invalid data
go test ./internal/scraper -run TestValidatePrayerTimes -v

# Test change detection
go test ./internal/scraper -run TestValidateChange -v
```

---

## Mobile App Testing

### Unit Tests (Jest)

```bash
cd mobile
npm test
```

Run with coverage:
```bash
npm test -- --coverage
```

### Component Tests

Test specific components:
```bash
npm test -- MasjidSelectionScreen
npm test -- PrayerTimesScreen
```

### E2E Tests (Detox)

**Setup**:
```bash
npm install -g detox-cli
detox build --configuration ios.sim.debug
```

**Run E2E tests**:
```bash
# iOS
detox test --configuration ios.sim.debug

# Android
detox test --configuration android.emu.debug
```

### Manual Testing Checklist

#### Initial Setup
- [ ] App launches successfully
- [ ] Splash screen appears
- [ ] Navigation to Masjid Selection works

#### Masjid Selection
- [ ] List of masjids loads
- [ ] Pull-to-refresh works
- [ ] Tap on masjid navigates to Prayer Times
- [ ] Selected masjid is saved locally

#### Prayer Times Screen
- [ ] Today's prayer times display correctly
- [ ] Next prayer countdown updates
- [ ] Current prayer is highlighted
- [ ] Pull-to-refresh updates times
- [ ] Offline mode shows cached data
- [ ] "Using cached data" message appears when offline

#### Notifications
- [ ] Permission request appears
- [ ] Toggle switch enables/disables notifications
- [ ] Notifications are scheduled for all 5 prayers
- [ ] Notifications appear 10 minutes before prayer
- [ ] Notification sound plays
- [ ] Tapping notification opens app

#### Error Handling
- [ ] Network error shows friendly message
- [ ] Retry button works after error
- [ ] App doesn't crash with invalid data
- [ ] Offline mode works gracefully

---

## Background Worker Testing

### Test Cron Jobs

```go
// Test immediate update
package main

import (
    "prayer-times-api/internal/worker"
    "prayer-times-api/internal/services"
)

func main() {
    // Initialize services
    prayerSvc := // ... initialize

    w := worker.NewWorker(prayerSvc, "Australia/Melbourne")

    // Run immediately instead of waiting for schedule
    err := w.RunNow()
    if err != nil {
        log.Fatal(err)
    }
}
```

### Verify Scheduled Jobs

Check logs for cron execution:
```bash
# Docker
docker logs prayer-times-api | grep "Starting hourly"

# Check if jobs are scheduled
docker logs prayer-times-api | grep "Scheduled jobs"
```

---

## Notification Testing

### Test FCM (Android)

Use Firebase Console test:
1. Go to Firebase Console → Cloud Messaging
2. Send test message
3. Enter device token
4. Verify notification received

### Test APNs (iOS)

Use curl to test:
```bash
# Requires APNs certificate
curl -v \
  -H "apns-topic: com.prayertimes.app" \
  -H "apns-push-type: alert" \
  --cert AuthKey.p8 \
  --cert-type PEM \
  -d '{"aps":{"alert":"Test notification","sound":"default"}}' \
  https://api.sandbox.push.apple.com/3/device/DEVICE_TOKEN
```

### Test Local Notifications

In mobile app:
```typescript
// Add this to test notifications immediately
import notificationService from './src/services/notifications';

// Schedule test notification in 10 seconds
await Notifications.scheduleNotificationAsync({
  content: {
    title: "Test Notification",
    body: "This is a test",
    sound: 'default',
  },
  trigger: {
    seconds: 10,
  },
});
```

---

## Database Testing

### Test Migrations

```bash
# Apply migrations
psql $DATABASE_URL < migrations/001_init_schema.up.sql

# Verify tables
psql $DATABASE_URL -c "\dt"

# Rollback
psql $DATABASE_URL < migrations/001_init_schema.down.sql
```

### Test Data Integrity

```sql
-- Test chronological validation
INSERT INTO prayer_times (masjid_id, date, fajr, dhuhr, asr, maghrib, isha)
VALUES (1, '2024-01-01', '05:30', '13:00', '12:00', '18:00', '20:00');
-- Should fail due to CHECK constraint

-- Test unique constraint
INSERT INTO masjids (name, url, city, state)
VALUES ('Test', 'https://awqat.com.au/test/', 'Melbourne', 'VIC');
INSERT INTO masjids (name, url, city, state)
VALUES ('Test2', 'https://awqat.com.au/test/', 'Sydney', 'NSW');
-- Should fail due to unique URL constraint
```

### Performance Testing

```sql
-- Test with large dataset
INSERT INTO prayer_times (masjid_id, date, fajr, dhuhr, asr, maghrib, isha)
SELECT
  1,
  generate_series('2024-01-01'::date, '2024-12-31'::date, '1 day'),
  '05:30', '13:00', '16:30', '18:45', '20:00';

-- Test query performance
EXPLAIN ANALYZE SELECT * FROM prayer_times WHERE masjid_id = 1 AND date = '2024-06-01';

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public';
```

---

## Load Testing

### Backend Load Test (using Apache Bench)

```bash
# Install Apache Bench
brew install httpd  # macOS

# Test GET endpoint
ab -n 1000 -c 10 http://localhost:8080/api/v1/masjids

# Test with POST
ab -n 100 -c 5 -p device.json -T application/json \
   http://localhost:8080/api/v1/devices/register
```

### Database Connection Pool Test

```go
// Test concurrent connections
package main

import (
    "context"
    "sync"
)

func main() {
    db := // ... initialize

    var wg sync.WaitGroup
    for i := 0; i < 100; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            rows, _ := db.Pool.Query(context.Background(),
                "SELECT * FROM masjids")
            rows.Close()
        }()
    }
    wg.Wait()
}
```

---

## Continuous Integration Testing

### GitHub Actions Workflow

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Set up Go
        uses: actions/setup-go@v4
        with:
          go-version: '1.21'

      - name: Run tests
        run: |
          cd backend
          go test ./... -v

  mobile-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd mobile
          npm install

      - name: Run tests
        run: |
          cd mobile
          npm test
```

---

## Test Data

### Seed Test Data

```sql
-- Seed masjids
INSERT INTO masjids (name, url, city, state, timezone) VALUES
  ('Al Taqwa Masjid', 'https://awqat.com.au/altaqwamasjid/', 'Melbourne', 'VIC', 'Australia/Melbourne'),
  ('Test Masjid', 'https://example.com', 'Sydney', 'NSW', 'Australia/Sydney');

-- Seed prayer times
INSERT INTO prayer_times (masjid_id, date, fajr, dhuhr, asr, maghrib, isha) VALUES
  (1, CURRENT_DATE, '05:30', '13:00', '16:30', '18:45', '20:00'),
  (1, CURRENT_DATE + 1, '05:31', '13:00', '16:29', '18:44', '19:59');
```

---

## Troubleshooting Tests

### Backend Tests Failing

```bash
# Check Go version
go version

# Clear cache
go clean -testcache

# Run with verbose output
go test ./... -v -count=1

# Check database connection
psql $DATABASE_URL -c "SELECT 1"
```

### Mobile Tests Failing

```bash
# Clear cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Reset Metro bundler
npm start -- --reset-cache
```

---

## Test Metrics

### Coverage Targets
- **Backend**: ≥ 70% code coverage
- **Mobile**: ≥ 60% code coverage
- **Critical paths**: 100% coverage (auth, payments, data integrity)

### Performance Targets
- **API response time**: < 200ms (p95)
- **Database queries**: < 50ms (p95)
- **App launch time**: < 2 seconds
- **Notification delivery**: < 5 seconds

---

## Reporting Issues

When reporting test failures, include:
1. Test name and file
2. Error message and stack trace
3. Go/Node version
4. OS and architecture
5. Steps to reproduce
6. Expected vs actual behavior

Example:
```
Test: TestValidatePrayerTimes
File: backend/internal/scraper/scraper_test.go
Error: expected nil error, got: invalid time format
Go version: 1.21
OS: macOS 14.0
Steps: Run `go test ./internal/scraper -v`
```
