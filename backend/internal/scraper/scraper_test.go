package scraper

import (
	"fmt"
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
				Fajr:    "07:00", // 90 min change - exceeds the 75-min safety threshold
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

// Announcement strings below are real values captured from awqat.com.au sites
// on 2026-07-14 (lang-EN.ini HereMosqueMessage and iqamafixed.js JS_ANNONCE_*).
func TestExtractJummahFromAnnouncements(t *testing.T) {
	tests := []struct {
		name          string
		announcements []string
		expected      []string // times in display order
	}{
		{
			name:          "IMCV Surau Kita — two sessions, no space before PM",
			announcements: []string{"JUMU'AH @ 1:30PM & 2:10PM"},
			expected:      []string{"13:30", "14:10"},
		},
		{
			name: "Fitzroy — second session announced as Friday Prayer",
			announcements: []string{
				"                  First JUMU'AH 12:30 PM",
				"                    Second Friday Prayer: 1:10 PM",
			},
			expected: []string{"12:30", "13:10"},
		},
		{
			name:          "Point Cook — spaces before PM",
			announcements: []string{"JUMU'AH @ 1:30 PM & 2:15 PM"},
			expected:      []string{"13:30", "14:15"},
		},
		{
			name:          "Swinburne — 'and' separator",
			announcements: []string{"JUMU'AH @ 1:30PM and 2:15PM"},
			expected:      []string{"13:30", "14:15"},
		},
		{
			name:          "Baitul Mamur — backtick and 'at'",
			announcements: []string{"JUMU`AH at 1:30PM"},
			expected:      []string{"13:30"},
		},
		{
			name:          "Virgin Mary — three sessions incl. 12:15",
			announcements: []string{"JUMU'AH 12:15PM, 1:15PM & 2:15PM"},
			expected:      []string{"12:15", "13:15", "14:15"},
		},
		{
			name:          "UMMA — labelled sessions with pipe",
			announcements: []string{"1st Jummah: 12:00 PM | 2nd Jummah: 1:10 PM"},
			expected:      []string{"12:00", "13:10"},
		},
		{
			name:          "RCA — bare 24-hour ticker, no keyword",
			announcements: []string{"13:00"},
			expected:      []string{"13:00"},
		},
		{
			name: "Al Taqwa — Dhuhr announcement must not leak into Jummah",
			announcements: []string{
				"JUMU'AH @ 1:30PM & 2:15PM",
				"Dhuhr Iqamah: Sun to Wed 1:20pm, Thurs & Sat 1:30pm",
			},
			expected: []string{"13:30", "14:15"},
		},
		{
			name: "NFA — donation announcement ignored",
			announcements: []string{
				"JUMU'AH @ 1:00 PM",
				"Your donation will help us make your masjid better.",
			},
			expected: []string{"13:00"},
		},
		{
			name:          "MKW — rule without clock time yields nothing",
			announcements: []string{"JUMU'AH 10 Minutes after Dhuhr Azan"},
			expected:      nil,
		},
		{
			name:          "Exford Road — NO JUMU'AH yields nothing",
			announcements: []string{"NO JUMU'AH", "WATCH THIS SPACE FOR ANNOUNCEMENT"},
			expected:      nil,
		},
		{
			name:          "AYCC — street address yields nothing",
			announcements: []string{"2/13 Hammer Ct, Hoppers Crossing VIC 3029"},
			expected:      nil,
		},
		{
			name:          "arabic-only message yields nothing",
			announcements: []string{"الحمد لله"},
			expected:      nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractJummahFromAnnouncements(tt.announcements)
			if len(result) != len(tt.expected) {
				t.Fatalf("got %v; want times %v", result, tt.expected)
			}
			for i, want := range tt.expected {
				if result[i][1] != want {
					t.Errorf("session %d = %s; want %s", i+1, result[i][1], want)
				}
				wantNum := i + 1
				var gotNum int
				if _, err := fmt.Sscanf(result[i][0], "%d", &gotNum); err != nil || gotNum != wantNum {
					t.Errorf("session number = %s; want %d", result[i][0], wantNum)
				}
			}
		})
	}
}

// ICMG Brimbank publishes JS_IQAMA_TIME = [0,0,0,0,0,-10]: iqama equals adhan
// for Fajr–Maghrib and Isha is 10 minutes BEFORE adhan. Explicit values must be
// used literally; only empty slots fall back to the page default.
func TestCalculateIqamaWithDefaultExplicitZeroAndNegative(t *testing.T) {
	cfg := &config.ScraperConfig{UserAgent: "test", Timeout: 10, MaxRetries: 3}
	s := NewScraper(cfg)

	fixed := []string{"", "06:15", "", "", "", ""}
	offsets := []int{0, 0, 0, 0, 0, -10}

	if got := s.calculateIqamaWithDefault("06:01", fixed, offsets, 1, 20); got != "06:15" {
		t.Errorf("fixed time should win: got %s; want 06:15", got)
	}
	if got := s.calculateIqamaWithDefault("12:30", fixed, offsets, 2, 7); got != "12:30" {
		t.Errorf("explicit 0 offset: got %s; want 12:30", got)
	}
	if got := s.calculateIqamaWithDefault("18:46", fixed, offsets, 5, 10); got != "18:36" {
		t.Errorf("explicit -10 offset: got %s; want 18:36", got)
	}

	// Empty slots (e.g. Swinburne [0,,,10,7,7]) still fall back to the default
	emptySlots := []int{0, iqamaOffsetUnset, iqamaOffsetUnset, 10, 7, 7}
	if got := s.calculateIqamaWithDefault("06:00", nil, emptySlots, 1, 20); got != "06:20" {
		t.Errorf("empty slot should use default: got %s; want 06:20", got)
	}
	if got := s.calculateIqamaWithDefault("15:00", nil, emptySlots, 3, 20); got != "15:10" {
		t.Errorf("explicit 10 offset: got %s; want 15:10", got)
	}
}

// IISNA MyCentre hand-edits the template to hardcode the displayed Isha athan:
//   document.getElementById('s5').innerHTML = '10:00'; //KonvertTimeTo12(_n5);
func TestApplyHardcodedAthanOverrides(t *testing.T) {
	html := `
document.getElementById('s0').innerHTML = KonvertTimeTo12(_n0);
document.getElementById('s1').innerHTML = KonvertTimeTo12(_n1);
document.getElementById('s2').innerHTML = KonvertTimeTo12(_n2);
document.getElementById('s3').innerHTML = KonvertTimeTo12(_n3);
document.getElementById('s4').innerHTML = KonvertTimeTo12(_n4);
document.getElementById('s5').innerHTML = '10:00'; //KonvertTimeTo12(_n5);
// document.getElementById('s2').innerHTML = '1:45';
`
	pt := &models.ScrapedPrayerTimes{
		Fajr: "06:00", Dhuhr: "12:26", Asr: "15:01", Maghrib: "17:27", Isha: "18:47",
	}
	applyHardcodedAthanOverrides(html, pt)

	if pt.Isha != "22:00" {
		t.Errorf("Isha = %s; want 22:00", pt.Isha)
	}
	if pt.Dhuhr != "12:26" {
		t.Errorf("commented-out override must be ignored: Dhuhr = %s; want 12:26", pt.Dhuhr)
	}
	for name, got := range map[string]string{"Fajr": pt.Fajr, "Asr": pt.Asr, "Maghrib": pt.Maghrib} {
		want := map[string]string{"Fajr": "06:00", "Asr": "15:01", "Maghrib": "17:27"}[name]
		if got != want {
			t.Errorf("%s = %s; want %s (must be untouched)", name, got, want)
		}
	}
}

// Leo St Musallah (Fawkner) sets JS_GPS_ASR_TYPE = "Hanafi". On 2026-07-14 the
// site displayed Asr 3:40 PM (Hanafi) while Standard gives 3:00 PM.
func TestCalcMWLTimesAsrFactor(t *testing.T) {
	cfg := &config.ScraperConfig{UserAgent: "test", Timeout: 10, MaxRetries: 3}
	s := NewScraper(cfg)

	loc, err := time.LoadLocation("Australia/Melbourne")
	if err != nil {
		t.Fatal(err)
	}
	day := time.Date(2026, 7, 14, 8, 0, 0, 0, loc)
	lat, lng := -37.71667, 144.96667 // Fawkner (from JS_GPS_FULL_CODE)

	var standard, hanafi models.ScrapedPrayerTimes
	if err := s.calcMWLTimes(day, lat, lng, 10.0, 1.0, &standard); err != nil {
		t.Fatal(err)
	}
	if err := s.calcMWLTimes(day, lat, lng, 10.0, 2.0, &hanafi); err != nil {
		t.Fatal(err)
	}

	if standard.Asr != "15:00" {
		t.Errorf("Standard Asr = %s; want 15:00", standard.Asr)
	}
	if hanafi.Asr != "15:40" {
		t.Errorf("Hanafi Asr = %s; want 15:40", hanafi.Asr)
	}
	// Asr factor must not affect any other prayer
	if hanafi.Fajr != standard.Fajr || hanafi.Dhuhr != standard.Dhuhr ||
		hanafi.Maghrib != standard.Maghrib || hanafi.Isha != standard.Isha {
		t.Errorf("non-Asr times changed: standard=%+v hanafi=%+v", standard, hanafi)
	}
}

func TestAddMinutesNegative(t *testing.T) {
	cfg := &config.ScraperConfig{UserAgent: "test", Timeout: 10, MaxRetries: 3}
	s := NewScraper(cfg)

	if got := s.addMinutes("18:46", -10); got != "18:36" {
		t.Errorf("addMinutes(18:46, -10) = %s; want 18:36", got)
	}
	if got := s.addMinutes("00:05", -10); got != "23:55" {
		t.Errorf("addMinutes(00:05, -10) = %s; want 23:55", got)
	}
	if got := s.addMinutes("23:55", 10); got != "00:05" {
		t.Errorf("addMinutes(23:55, 10) = %s; want 00:05", got)
	}
}

// athanPlusMasjidID routes AthanPlus-widget sites to their widget id. Lysterfield
// (isomer.org.au) moved here off the AlAdhan GPS calculation on 2026-07-15.
func TestAthanPlusMasjidID(t *testing.T) {
	cases := map[string]string{
		"https://iewad.org.au/prayer-times": "nDAg3WA0",
		"https://isomer.org.au/":            "wLVO5pAJ",
		"https://awqat.com.au/altaqwamasjid/": "",
		"https://umis.com.au/prayertimes.html": "",
	}
	for url, want := range cases {
		if got := athanPlusMasjidID(url); got != want {
			t.Errorf("athanPlusMasjidID(%q) = %q; want %q", url, got, want)
		}
	}
}
