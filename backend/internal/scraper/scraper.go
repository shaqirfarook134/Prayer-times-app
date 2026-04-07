package scraper

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"prayer-times-api/internal/config"
	"prayer-times-api/internal/models"
	"regexp"
	"strconv"
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

	// Method 1: Try to extract from .ini data files (for awqat.com.au sites)
	prayerTimes, err := s.extractFromIniDataFile(ctx, html, url, timezone)
	if err == nil {
		return prayerTimes, nil
	}

	// Method 2: Try to extract structured JSON/JavaScript data
	prayerTimes, err = s.extractFromJavaScript(html, timezone)
	if err == nil {
		return prayerTimes, nil
	}

	// Method 3: Fallback to HTML parsing
	prayerTimes, err = s.extractFromHTML(html, timezone)
	if err != nil {
		return nil, fmt.Errorf("failed to extract prayer times: %w", err)
	}

	return prayerTimes, nil
}

// extractFromIniDataFile attempts to extract prayer times from .ini data files (awqat.com.au)
func (s *Scraper) extractFromIniDataFile(ctx context.Context, html, baseURL, timezone string) (*models.ScrapedPrayerTimes, error) {
	// Check if this is an awqat.com.au site
	if !strings.Contains(baseURL, "awqat.com.au") {
		return nil, fmt.Errorf("not an awqat.com.au site")
	}

	// Extract city code from JavaScript (e.g., "AU.MELBOURNE")
	cityCodeRe := regexp.MustCompile(`var\s+JS_CITY_CODE\s*=\s*["']([^"']+)["']`)
	matches := cityCodeRe.FindStringSubmatch(html)
	if len(matches) < 2 {
		return nil, fmt.Errorf("city code not found")
	}
	cityCode := matches[1]

	// Build data file URL
	// Example: https://awqat.com.au/altaqwamasjid/data/wtimes-AU.MELBOURNE.ini
	baseURLParts := strings.Split(strings.TrimSuffix(baseURL, "/"), "/")
	baseURLWithoutPath := strings.Join(baseURLParts[:len(baseURLParts)], "/")
	dataFileURL := fmt.Sprintf("%s/data/wtimes-%s.ini", baseURLWithoutPath, cityCode)

	// Fetch the data file
	req, err := http.NewRequestWithContext(ctx, "GET", dataFileURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create data file request: %w", err)
	}

	req.Header.Set("User-Agent", s.config.UserAgent)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch data file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("data file request failed with status: %d", resp.StatusCode)
	}

	dataBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read data file: %w", err)
	}

	// Parse the data file
	// Format: "MM-DD~~~~~HH:MM|HH:MM|HH:MM|HH:MM|HH:MM|HH:MM"
	// Times are: [Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha]
	dataContent := string(dataBody)

	// Load timezone
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}

	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	todayStr := now.Format("01-02") // MM-DD format

	// Find today's data line
	lineRe := regexp.MustCompile(`"` + todayStr + `~~~~~([^"]+)"`)
	lineMatches := lineRe.FindStringSubmatch(dataContent)
	if len(lineMatches) < 2 {
		return nil, fmt.Errorf("prayer times for today (%s) not found in data file", todayStr)
	}

	// Split times by pipe
	timesStr := lineMatches[1]
	times := strings.Split(timesStr, "|")
	if len(times) < 6 {
		return nil, fmt.Errorf("insufficient times in data line: %v", times)
	}

	prayerTimes := &models.ScrapedPrayerTimes{
		Date:    today,
		Fajr:    strings.TrimSpace(times[0]),    // Index 0: Fajr
		Dhuhr:   strings.TrimSpace(times[2]),    // Index 2: Dhuhr (skip Sunrise at index 1)
		Asr:     strings.TrimSpace(times[3]),    // Index 3: Asr
		Maghrib: strings.TrimSpace(times[4]),    // Index 4: Maghrib
		Isha:    strings.TrimSpace(times[5]),    // Index 5: Isha
	}

	// Apply JS_ATHAN_MINUTES_OF_* per-prayer offsets from server-rendered HTML.
	// These are set server-side and reliably scraped.
	// JS_SUMMER_ADD1HOUR is intentionally NOT applied — it is localStorage-only
	// and always initialises as false in the HTML; our headless scraper never sees the real value.
	adjRe := regexp.MustCompile(`JS_ATHAN_MINUTES_OF_(\w+)\s*=\s*(-?\d+)`)
	adjustments := map[string]int{"FAJR": 0, "DOHR": 0, "ASR": 0, "MAGHRIB": 0, "ISHA": 0}
	for _, m := range adjRe.FindAllStringSubmatch(html, -1) {
		if len(m) == 3 {
			val, _ := strconv.Atoi(m[2])
			adjustments[m[1]] = val
		}
	}
	prayerTimes.Fajr = s.addMinutes(prayerTimes.Fajr, adjustments["FAJR"])
	prayerTimes.Dhuhr = s.addMinutes(prayerTimes.Dhuhr, adjustments["DOHR"])
	prayerTimes.Asr = s.addMinutes(prayerTimes.Asr, adjustments["ASR"])
	prayerTimes.Maghrib = s.addMinutes(prayerTimes.Maghrib, adjustments["MAGHRIB"])
	prayerTimes.Isha = s.addMinutes(prayerTimes.Isha, adjustments["ISHA"])

	// Validate times
	if err := s.validatePrayerTimes(prayerTimes); err != nil {
		return nil, err
	}

	// Extract and calculate iqama times
	if err := s.extractAndCalculateIqamaTimes(ctx, baseURL, prayerTimes); err != nil {
		// If iqama extraction fails, use default +20 minutes
		prayerTimes.FajrIqama = s.addMinutes(prayerTimes.Fajr, 20)
		prayerTimes.DhuhrIqama = s.addMinutes(prayerTimes.Dhuhr, 20)
		prayerTimes.AsrIqama = s.addMinutes(prayerTimes.Asr, 20)
		prayerTimes.MaghribIqama = s.addMinutes(prayerTimes.Maghrib, 20)
		prayerTimes.IshaIqama = s.addMinutes(prayerTimes.Isha, 20)
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

	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

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

	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

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

// extractAndCalculateIqamaTimes extracts iqama configuration and calculates iqama times
func (s *Scraper) extractAndCalculateIqamaTimes(ctx context.Context, baseURL string, pt *models.ScrapedPrayerTimes) error {
	// Build iqamafixed.js URL
	baseURLParts := strings.Split(strings.TrimSuffix(baseURL, "/"), "/")
	baseURLWithoutPath := strings.Join(baseURLParts[:len(baseURLParts)], "/")
	iqamaURL := fmt.Sprintf("%s/iqamafixed.js", baseURLWithoutPath)

	// Fetch iqamafixed.js
	req, err := http.NewRequestWithContext(ctx, "GET", iqamaURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create iqama request: %w", err)
	}

	req.Header.Set("User-Agent", s.config.UserAgent)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to fetch iqama config: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("iqama config request failed with status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read iqama config: %w", err)
	}

	content := string(body)

	// Extract FIXED_IQAMA_TIMES array: ['','','14:15','','','']
	fixedTimesRe := regexp.MustCompile(`FIXED_IQAMA_TIMES\s*=\s*\[([^\]]+)\]`)
	fixedMatches := fixedTimesRe.FindStringSubmatch(content)

	var fixedTimes []string
	if len(fixedMatches) > 1 {
		// Parse the array
		fixedStr := strings.ReplaceAll(fixedMatches[1], "'", "")
		fixedStr = strings.ReplaceAll(fixedStr, "\"", "")
		fixedStr = strings.ReplaceAll(fixedStr, " ", "")
		fixedTimes = strings.Split(fixedStr, ",")
	}

	// Extract JS_IQAMA_TIME array: [0,30,10,10,7,10]
	offsetTimesRe := regexp.MustCompile(`JS_IQAMA_TIME\s*=\s*\[([^\]]+)\]`)
	offsetMatches := offsetTimesRe.FindStringSubmatch(content)

	var offsetTimes []int
	if len(offsetMatches) > 1 {
		// Parse the array
		offsetStr := strings.ReplaceAll(offsetMatches[1], " ", "")
		offsetParts := strings.Split(offsetStr, ",")
		for _, part := range offsetParts {
			if part == "" {
				offsetTimes = append(offsetTimes, 0)
			} else {
				offset, _ := strconv.Atoi(part)
				offsetTimes = append(offsetTimes, offset)
			}
		}
	}

	// Calculate iqama times for each prayer
	// Array indices: [0]=Sunrise, [1]=Fajr, [2]=Dhuhr, [3]=Asr, [4]=Maghrib, [5]=Isha

	// Fajr (index 1)
	pt.FajrIqama = s.calculateIqama(pt.Fajr, fixedTimes, offsetTimes, 1)

	// Dhuhr (index 2)
	pt.DhuhrIqama = s.calculateIqama(pt.Dhuhr, fixedTimes, offsetTimes, 2)

	// Asr (index 3)
	pt.AsrIqama = s.calculateIqama(pt.Asr, fixedTimes, offsetTimes, 3)

	// Maghrib (index 4)
	pt.MaghribIqama = s.calculateIqama(pt.Maghrib, fixedTimes, offsetTimes, 4)

	// Isha (index 5)
	pt.IshaIqama = s.calculateIqama(pt.Isha, fixedTimes, offsetTimes, 5)

	return nil
}

// calculateIqama calculates iqama time based on fixed time or offset
func (s *Scraper) calculateIqama(adhanTime string, fixedTimes []string, offsetTimes []int, index int) string {
	// Check for fixed time first
	if len(fixedTimes) > index && fixedTimes[index] != "" {
		return fixedTimes[index]
	}

	// Use offset time
	offset := 20 // default
	if len(offsetTimes) > index && offsetTimes[index] > 0 {
		offset = offsetTimes[index]
	}

	return s.addMinutes(adhanTime, offset)
}

// addMinutes adds minutes to a time string in HH:MM format
func (s *Scraper) addMinutes(timeStr string, minutes int) string {
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		return timeStr
	}

	hours, err := strconv.Atoi(parts[0])
	if err != nil {
		return timeStr
	}

	mins, err := strconv.Atoi(parts[1])
	if err != nil {
		return timeStr
	}

	// Add minutes
	totalMins := hours*60 + mins + minutes
	newHours := (totalMins / 60) % 24
	newMins := totalMins % 60

	return fmt.Sprintf("%02d:%02d", newHours, newMins)
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
	maxDiffMinutes := 75

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
