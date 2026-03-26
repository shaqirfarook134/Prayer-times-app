package services

import (
	"context"
	"fmt"
	"prayer-times-api/internal/config"
	"prayer-times-api/internal/models"
	"prayer-times-api/internal/repository"
	"time"

	fcm "github.com/appleboy/go-fcm"
	"github.com/sideshow/apns2"
	"github.com/sideshow/apns2/payload"
	"github.com/sideshow/apns2/token"
)

type NotificationService struct {
	config          *config.Config
	deviceRepo      *repository.DeviceTokenRepository
	prayerTimesRepo *repository.PrayerTimesRepository
	masjidRepo      *repository.MasjidRepository
	fcmClient       *fcm.Client
	apnsClient      *apns2.Client
}

func NewNotificationService(
	cfg *config.Config,
	deviceRepo *repository.DeviceTokenRepository,
	prayerTimesRepo *repository.PrayerTimesRepository,
	masjidRepo *repository.MasjidRepository,
) (*NotificationService, error) {
	ns := &NotificationService{
		config:          cfg,
		deviceRepo:      deviceRepo,
		prayerTimesRepo: prayerTimesRepo,
		masjidRepo:      masjidRepo,
	}

	// Initialize FCM client
	if cfg.FCM.ServerKey != "" {
		client, err := fcm.NewClient(cfg.FCM.ServerKey)
		if err != nil {
			return nil, fmt.Errorf("failed to create FCM client: %w", err)
		}
		ns.fcmClient = client
	}

	// Initialize APNs client
	if cfg.APNS.AuthKeyPath != "" {
		authKey, err := token.AuthKeyFromFile(cfg.APNS.AuthKeyPath)
		if err != nil {
			return nil, fmt.Errorf("failed to load APNs auth key: %w", err)
		}

		apnsToken := &token.Token{
			AuthKey: authKey,
			KeyID:   cfg.APNS.KeyID,
			TeamID:  cfg.APNS.TeamID,
		}

		if cfg.APNS.Production {
			ns.apnsClient = apns2.NewTokenClient(apnsToken).Production()
		} else {
			ns.apnsClient = apns2.NewTokenClient(apnsToken).Development()
		}
	}

	return ns, nil
}

// ScheduleNotificationsForMasjid schedules notifications for all users of a masjid
func (s *NotificationService) ScheduleNotificationsForMasjid(ctx context.Context, masjidID int) error {
	// Get masjid details
	masjid, err := s.masjidRepo.GetByID(ctx, masjidID)
	if err != nil {
		return fmt.Errorf("masjid not found: %w", err)
	}

	// Get today's prayer times
	prayerTimes, err := s.prayerTimesRepo.GetTodayByMasjid(ctx, masjidID, masjid.Timezone)
	if err != nil {
		return fmt.Errorf("prayer times not found: %w", err)
	}

	// Get all devices for this masjid
	devices, err := s.deviceRepo.GetByMasjid(ctx, masjidID)
	if err != nil {
		return fmt.Errorf("failed to get devices: %w", err)
	}

	if len(devices) == 0 {
		return nil // No devices to notify
	}

	// Load timezone
	loc, err := time.LoadLocation(masjid.Timezone)
	if err != nil {
		return fmt.Errorf("invalid timezone: %w", err)
	}

	// Send notifications for each prayer
	prayers := []struct {
		name string
		time string
	}{
		{"Fajr", prayerTimes.Fajr},
		{"Dhuhr", prayerTimes.Dhuhr},
		{"Asr", prayerTimes.Asr},
		{"Maghrib", prayerTimes.Maghrib},
		{"Isha", prayerTimes.Isha},
	}

	for _, prayer := range prayers {
		// Calculate notification time (10 minutes before prayer)
		prayerTime, err := time.ParseInLocation("15:04", prayer.time, loc)
		if err != nil {
			continue
		}

		// Combine with today's date
		now := time.Now().In(loc)
		prayerDateTime := time.Date(
			now.Year(), now.Month(), now.Day(),
			prayerTime.Hour(), prayerTime.Minute(), 0, 0, loc,
		)

		notificationTime := prayerDateTime.Add(-10 * time.Minute)

		// Only schedule if notification time is in the future
		if notificationTime.After(now) {
			notification := &models.NotificationPayload{
				Title: fmt.Sprintf("%s Prayer", prayer.name),
				Body:  fmt.Sprintf("%s in 10 minutes at %s", prayer.name, masjid.Name),
				Sound: "default",
				Data: map[string]string{
					"prayer":    prayer.name,
					"masjid_id": fmt.Sprintf("%d", masjidID),
					"time":      prayer.time,
				},
			}

			// Send to all devices
			// Note: In production, use a proper job queue for scheduling
			// This is immediate notification - proper scheduling requires a job queue
			s.sendNotificationToDevices(ctx, devices, notification)
		}
	}

	return nil
}

// sendNotificationToDevices sends a notification to multiple devices
func (s *NotificationService) sendNotificationToDevices(ctx context.Context, devices []models.DeviceToken, notification *models.NotificationPayload) {
	for _, device := range devices {
		if !device.NotificationsEnabled {
			continue
		}

		var err error
		if device.Platform == "android" {
			err = s.sendFCMNotification(device.Token, notification)
		} else if device.Platform == "ios" {
			err = s.sendAPNSNotification(device.Token, notification)
		}

		if err != nil {
			// Log error but continue with other devices
			// In production, handle invalid tokens (remove from database)
			continue
		}
	}
}

// sendFCMNotification sends a notification via Firebase Cloud Messaging
func (s *NotificationService) sendFCMNotification(token string, notification *models.NotificationPayload) error {
	if s.fcmClient == nil {
		return fmt.Errorf("FCM client not initialized")
	}

	// Convert map[string]string to map[string]interface{}
	data := make(map[string]interface{})
	for k, v := range notification.Data {
		data[k] = v
	}

	msg := &fcm.Message{
		To: token,
		Notification: &fcm.Notification{
			Title: notification.Title,
			Body:  notification.Body,
			Sound: notification.Sound,
		},
		Data: data,
		Priority: "high",
	}

	response, err := s.fcmClient.Send(msg)
	if err != nil {
		return fmt.Errorf("FCM send failed: %w", err)
	}

	if response.Error != nil {
		return fmt.Errorf("FCM error: %v", response.Error)
	}

	return nil
}

// sendAPNSNotification sends a notification via Apple Push Notification Service
func (s *NotificationService) sendAPNSNotification(token string, notification *models.NotificationPayload) error {
	if s.apnsClient == nil {
		return fmt.Errorf("APNs client not initialized")
	}

	pl := payload.NewPayload().
		Alert(notification.Title).
		AlertBody(notification.Body).
		Sound(notification.Sound)

	// Add custom data
	for key, value := range notification.Data {
		pl.Custom(key, value)
	}

	apnsNotification := &apns2.Notification{
		DeviceToken: token,
		Topic:       s.config.APNS.Topic,
		Payload:     pl,
		Priority:    apns2.PriorityHigh,
	}

	response, err := s.apnsClient.Push(apnsNotification)
	if err != nil {
		return fmt.Errorf("APNs send failed: %w", err)
	}

	if response.StatusCode != 200 {
		return fmt.Errorf("APNs error: %d - %s", response.StatusCode, response.Reason)
	}

	return nil
}

// SendTestNotification sends a test notification to a device
func (s *NotificationService) SendTestNotification(ctx context.Context, deviceToken string, platform string) error {
	notification := &models.NotificationPayload{
		Title: "Test Notification",
		Body:  "Your prayer times notifications are working!",
		Sound: "default",
	}

	if platform == "android" {
		return s.sendFCMNotification(deviceToken, notification)
	} else if platform == "ios" {
		return s.sendAPNSNotification(deviceToken, notification)
	}

	return fmt.Errorf("invalid platform: %s", platform)
}
