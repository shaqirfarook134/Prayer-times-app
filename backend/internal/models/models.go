package models

import "time"

// Masjid represents a mosque/masjid
type Masjid struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	URL       string    `json:"url"`
	City      string    `json:"city"`
	State     string    `json:"state"`
	Timezone  string    `json:"timezone"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// PrayerTimes represents daily prayer times for a masjid
type PrayerTimes struct {
	ID          int       `json:"id"`
	MasjidID    int       `json:"masjid_id"`
	Date        time.Time `json:"date"`
	Fajr        string    `json:"fajr"`
	Dhuhr       string    `json:"dhuhr"`
	Asr         string    `json:"asr"`
	Maghrib     string    `json:"maghrib"`
	Isha        string    `json:"isha"`
	LastUpdated time.Time `json:"last_updated"`
	CreatedAt   time.Time `json:"created_at"`
}

// PrayerTimesResponse is the API response format
type PrayerTimesResponse struct {
	MasjidID int    `json:"masjid_id"`
	Date     string `json:"date"`
	Fajr     string `json:"fajr"`
	Dhuhr    string `json:"dhuhr"`
	Asr      string `json:"asr"`
	Maghrib  string `json:"maghrib"`
	Isha     string `json:"isha"`
}

// Log represents a system log entry
type Log struct {
	ID        int       `json:"id"`
	MasjidID  *int      `json:"masjid_id,omitempty"`
	Status    string    `json:"status"`
	Message   string    `json:"message"`
	Metadata  string    `json:"metadata,omitempty"` // JSON string
	CreatedAt time.Time `json:"created_at"`
}

// DeviceToken represents a push notification device token
type DeviceToken struct {
	ID                   int       `json:"id"`
	UserID               *string   `json:"user_id,omitempty"`
	Token                string    `json:"token"`
	Platform             string    `json:"platform"` // 'ios' or 'android'
	MasjidID             *int      `json:"masjid_id,omitempty"`
	NotificationsEnabled bool      `json:"notifications_enabled"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
	LastUsedAt           time.Time `json:"last_used_at"`
}

// RegisterDeviceRequest is the request body for device registration
type RegisterDeviceRequest struct {
	Token                string `json:"token" binding:"required"`
	Platform             string `json:"platform" binding:"required,oneof=ios android"`
	MasjidID             *int   `json:"masjid_id"`
	NotificationsEnabled bool   `json:"notifications_enabled"`
}

// UpdateDeviceRequest is the request body for updating device preferences
type UpdateDeviceRequest struct {
	MasjidID             *int `json:"masjid_id"`
	NotificationsEnabled *bool `json:"notifications_enabled"`
}

// ScrapedPrayerTimes represents prayer times extracted from a website
type ScrapedPrayerTimes struct {
	Date    time.Time
	Fajr    string
	Dhuhr   string
	Asr     string
	Maghrib string
	Isha    string
}

// NotificationPayload represents the data for a push notification
type NotificationPayload struct {
	Title   string            `json:"title"`
	Body    string            `json:"body"`
	Data    map[string]string `json:"data,omitempty"`
	Sound   string            `json:"sound,omitempty"`
}

// APIError represents an error response
type APIError struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}
