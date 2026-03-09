package scraper

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"prayer-times-api/internal/config"
	"prayer-times-api/internal/models"
	"regexp"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

type Scraper struct {
	config     *config.ScraperConfig
	httpClient *http.Client
}

func NewScraper(cfg *config.ScraperConfig) *Scraper {
	return &Scraper{
		config: cfg,
		httpClient: &http.Client{
			Timeout: time.Duration(cfg.Timeout) * time.Second,
		},
	}
}

// FetchPrayerTimes retrieves prayer times from a masjid's website
func (s *Scraper) FetchPrayerTimes(ctx context.Context, url string, timezone string) (*models.ScrapedPrayerTimes, error) {
	var lastErr error

	// Retry mechanism
	for attempt := 0; attempt < s.config.MaxRetries; attempt++ {
		if attempt > 0 {
			// Exponential backoff
			time.Sleep(time.Duration(attempt*attempt) * time.Second)
		}

		prayerTimes, err := s.fetchWithTimeout(ctx, url, timezone)
		if err == nil {
			return prayerTimes, nil
		}

		lastErr = err
	}

	return nil, fmt.Errorf("failed after %d attempts: %w", s.config.MaxRetries, lastErr)
}

func (s *Scraper) fetchWithTimeout(ctx context.Context, url string, timezone string) (*models.ScrapedPrayerTimes, error) {
	// Create request
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", s.config.UserAgent)

	// Execute request
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch URL: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	html := string(body)

	// Method 1: Try to extract structured JSON/JavaScript data
	prayerTimes, err := s.extractFromJavaScript(html, timezone)
	if err == nil {
		return prayerTimes, nil
	}

	// Method 2: Fallback to HTML parsing
	prayerTimes, err = s.extractFromHTML(html, timezone)
	if err != nil {
		return nil, fmt.Errorf("failed to extract prayer times: %w", err)
	}

	return prayerTimes, nil
}

// extractFromJavaScript attempts to extract prayer times from embedded JavaScript
func (s *Scraper) extractFromJavaScript(html, timezone string) (*models.ScrapedPrayerTimes, error) {
	// Look for common patterns in Awqat pages
	// Example: var iqamafixed = ["05:02", "13:12", "16:45", "18:18", "19:34"];

	// Pattern for array of times
	re := regexp.MustCompile(`(?:iqamafixed|prayertimes)\s*=\s*\[([^\]]+)\]`)
	matches := re.FindStringSubmatch(html)

	if len(matches) < 2 {
		return nil, fmt.Errorf("no JavaScript data found")
	}

	// Extract times from the array
	timesStr := matches[1]
	timesStr = strings.ReplaceAll(timesStr, `"`, "")
	timesStr = strings.ReplaceAll(timesStr, `'`, "")
	timesStr = strings.ReplaceAll(timesStr, " ", "")

	times := strings.Split(timesStr, ",")

	// Awqat typically has: Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha, Jumuah
	// We need to filter for our 5 prayers (skip Sunrise, Jumuah)
	if len(times) < 5 {
		return nil, fmt.Errorf("insufficient prayer times found")
	}

	// Load timezone
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}

	today := time.Now().In(loc).Truncate(24 * time.Hour)

	prayerTimes := &models.ScrapedPrayerTimes{
		Date:    today,
		Fajr:    strings.TrimSpace(times[0]),
		Dhuhr:   strings.TrimSpace(times[2]),
		Asr:     strings.TrimSpace(times[3]),
		Maghrib: strings.TrimSpace(times[4]),
		Isha:    strings.TrimSpace(times[5]),
	}

	// Validate times
	if err := s.validatePrayerTimes(prayerTimes); err != nil {
		return nil, err
	}

	return prayerTimes, nil
}

// extractFromHTML attempts to extract prayer times from HTML table
func (s *Scraper) extractFromHTML(html, timezone string) (*models.ScrapedPrayerTimes, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return nil, fmt.Errorf("failed to parse HTML: %w", err)
	}

	// Load timezone
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}

	today := time.Now().In(loc).Truncate(24 * time.Hour)

	prayerTimes := &models.ScrapedPrayerTimes{
		Date: today,
	}

	// Look for prayer times in common HTML structures
	// This is a simplified version - needs customization per website
	doc.Find("table tr").Each(func(i int, row *goquery.Selection) {
		cells := row.Find("td")
		if cells.Length() >= 2 {
			prayer := strings.ToLower(strings.TrimSpace(cells.Eq(0).Text()))
			time := strings.TrimSpace(cells.Eq(1).Text())

			switch {
			case strings.Contains(prayer, "fajr"):
				prayerTimes.Fajr = time
			case strings.Contains(prayer, "dhuhr"):
				prayerTimes.Dhuhr = time
			case strings.Contains(prayer, "asr"):
				prayerTimes.Asr = time
			case strings.Contains(prayer, "maghrib"):
				prayerTimes.Maghrib = time
			case strings.Contains(prayer, "isha"):
				prayerTimes.Isha = time
			}
		}
	})

	// Validate that we found all times
	if prayerTimes.Fajr == "" || prayerTimes.Dhuhr == "" || prayerTimes.Asr == "" ||
		prayerTimes.Maghrib == "" || prayerTimes.Isha == "" {
		return nil, fmt.Errorf("incomplete prayer times extracted")
	}

	// Validate times
	if err := s.validatePrayerTimes(prayerTimes); err != nil {
		return nil, err
	}

	return prayerTimes, nil
}

// validatePrayerTimes validates the format and chronological order
func (s *Scraper) validatePrayerTimes(pt *models.ScrapedPrayerTimes) error {
	// Validate format (HH:MM)
	timeRegex := regexp.MustCompile(`^([0-1][0-9]|2[0-3]):[0-5][0-9]$`)

	times := []struct {
		name  string
		value string
	}{
		{"Fajr", pt.Fajr},
		{"Dhuhr", pt.Dhuhr},
		{"Asr", pt.Asr},
		{"Maghrib", pt.Maghrib},
		{"Isha", pt.Isha},
	}

	for _, t := range times {
		if !timeRegex.MatchString(t.value) {
			return fmt.Errorf("invalid time format for %s: %s", t.name, t.value)
		}
	}

	// Validate chronological order
	// Convert times to minutes for comparison
	fajr := timeToMinutes(pt.Fajr)
	dhuhr := timeToMinutes(pt.Dhuhr)
	asr := timeToMinutes(pt.Asr)
	maghrib := timeToMinutes(pt.Maghrib)
	isha := timeToMinutes(pt.Isha)

	if !(fajr < dhuhr && dhuhr < asr && asr < maghrib && maghrib < isha) {
		return fmt.Errorf("prayer times are not in chronological order")
	}

	return nil
}

// timeToMinutes converts HH:MM to total minutes
func timeToMinutes(timeStr string) int {
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		return 0
	}

	var hours, minutes int
	fmt.Sscanf(parts[0], "%d", &hours)
	fmt.Sscanf(parts[1], "%d", &minutes)

	return hours*60 + minutes
}

// ValidateChange checks if new prayer times differ significantly from previous
func (s *Scraper) ValidateChange(old, new *models.PrayerTimes) error {
	maxDiffMinutes := 30

	times := []struct {
		name string
		old  string
		new  string
	}{
		{"Fajr", old.Fajr, new.Fajr},
		{"Dhuhr", old.Dhuhr, new.Dhuhr},
		{"Asr", old.Asr, new.Asr},
		{"Maghrib", old.Maghrib, new.Maghrib},
		{"Isha", old.Isha, new.Isha},
	}

	for _, t := range times {
		oldMinutes := timeToMinutes(t.old)
		newMinutes := timeToMinutes(t.new)

		diff := oldMinutes - newMinutes
		if diff < 0 {
			diff = -diff
		}

		if diff > maxDiffMinutes {
			return fmt.Errorf("%s changed by %d minutes (old: %s, new: %s) - exceeds safety threshold",
				t.name, diff, t.old, t.new)
		}
	}

	return nil
}
