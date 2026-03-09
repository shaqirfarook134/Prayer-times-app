package scraper

import (
	"prayer-times-api/internal/config"
	"prayer-times-api/internal/models"
	"testing"
	"time"
)

func TestTimeToMinutes(t *testing.T) {
	tests := []struct {
		name     string
		timeStr  string
		expected int
	}{
		{"midnight", "00:00", 0},
		{"fajr", "05:30", 330},
		{"noon", "12:00", 720},
		{"maghrib", "18:15", 1095},
		{"isha", "19:45", 1185},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := timeToMinutes(tt.timeStr)
			if result != tt.expected {
				t.Errorf("timeToMinutes(%s) = %d; want %d", tt.timeStr, result, tt.expected)
			}
		})
	}
}

func TestValidatePrayerTimes(t *testing.T) {
	cfg := &config.ScraperConfig{
		UserAgent:  "test",
		Timeout:    10,
		MaxRetries: 3,
	}
	s := NewScraper(cfg)

	tests := []struct {
		name        string
		prayerTimes *models.ScrapedPrayerTimes
		shouldError bool
	}{
		{
			name: "valid times",
			prayerTimes: &models.ScrapedPrayerTimes{
				Date:    time.Now(),
				Fajr:    "05:30",
				Dhuhr:   "13:00",
				Asr:     "16:30",
				Maghrib: "18:45",
				Isha:    "20:00",
			},
			shouldError: false,
		},
		{
			name: "invalid format",
			prayerTimes: &models.ScrapedPrayerTimes{
				Date:    time.Now(),
				Fajr:    "5:30",
				Dhuhr:   "13:00",
				Asr:     "16:30",
				Maghrib: "18:45",
				Isha:    "20:00",
			},
			shouldError: true,
		},
		{
			name: "wrong chronological order",
			prayerTimes: &models.ScrapedPrayerTimes{
				Date:    time.Now(),
				Fajr:    "05:30",
				Dhuhr:   "13:00",
				Asr:     "12:30", // Before Dhuhr!
				Maghrib: "18:45",
				Isha:    "20:00",
			},
			shouldError: true,
		},
		{
			name: "invalid time value",
			prayerTimes: &models.ScrapedPrayerTimes{
				Date:    time.Now(),
				Fajr:    "25:30", // Invalid hour
				Dhuhr:   "13:00",
				Asr:     "16:30",
				Maghrib: "18:45",
				Isha:    "20:00",
			},
			shouldError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := s.validatePrayerTimes(tt.prayerTimes)
			if (err != nil) != tt.shouldError {
				t.Errorf("validatePrayerTimes() error = %v, shouldError = %v", err, tt.shouldError)
			}
		})
	}
}

func TestValidateChange(t *testing.T) {
	cfg := &config.ScraperConfig{
		UserAgent:  "test",
		Timeout:    10,
		MaxRetries: 3,
	}
	s := NewScraper(cfg)

	tests := []struct {
		name        string
		old         *models.PrayerTimes
		new         *models.PrayerTimes
		shouldError bool
	}{
		{
			name: "small change acceptable",
			old: &models.PrayerTimes{
				Fajr:    "05:30",
				Dhuhr:   "13:00",
				Asr:     "16:30",
				Maghrib: "18:45",
				Isha:    "20:00",
			},
			new: &models.PrayerTimes{
				Fajr:    "05:35", // 5 min change
				Dhuhr:   "13:00",
				Asr:     "16:30",
				Maghrib: "18:45",
				Isha:    "20:00",
			},
			shouldError: false,
		},
		{
			name: "large change suspicious",
			old: &models.PrayerTimes{
				Fajr:    "05:30",
				Dhuhr:   "13:00",
				Asr:     "16:30",
				Maghrib: "18:45",
				Isha:    "20:00",
			},
			new: &models.PrayerTimes{
				Fajr:    "06:30", // 60 min change - suspicious!
				Dhuhr:   "13:00",
				Asr:     "16:30",
				Maghrib: "18:45",
				Isha:    "20:00",
			},
			shouldError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := s.ValidateChange(tt.old, tt.new)
			if (err != nil) != tt.shouldError {
				t.Errorf("ValidateChange() error = %v, shouldError = %v", err, tt.shouldError)
			}
		})
	}
}
