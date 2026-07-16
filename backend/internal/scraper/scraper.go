package scraper

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
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
	// Method 0-masjidal: masjids on the Masjidal platform (masjidal.com —
	// in-masjid screens, website widgets and the Athan+ app). Their JSON API is
	// the source the widgets themselves read, and for URL-mapped masjids it
	// needs no page fetch at all — which also keeps scraping alive when the
	// masjid's own site is down or blocks us (isomer.org.au returns 406 to
	// non-browser clients). Covers IEWAD, Lysterfield, AICOM, PGCC, Emir Sultan.
	if masjidalID := resolveMasjidalID(url, ""); masjidalID != "" {
		prayerTimes, err := s.extractFromMasjidalAPI(ctx, masjidalID, timezone)
		if err == nil {
			return prayerTimes, nil
		}
		switch {
		case strings.Contains(url, "iewad.org.au"), strings.Contains(url, "isomer.org.au"):
			// Legacy: scrape the AthanPlus widget HTML.
			prayerTimes, err := s.extractFromAthanPlus(ctx, masjidalID, timezone)
			if err != nil {
				return nil, fmt.Errorf("athanplus scraper failed: %w", err)
			}
			return prayerTimes, nil
		case strings.Contains(url, "emirsultanmosque.com"):
			// Legacy: ezanvakti API (Diyanet calculated times, no iqamah).
			if prayerTimes, err := s.extractFromEmirSultan(ctx, timezone); err == nil {
				return prayerTimes, nil
			}
		}
		// AICOM (WordPress-plugin markup) and PGCC (generic chain) fall through
		// to the page-HTML methods below, as they did before Masjidal support.
	}

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

	// Method 0a: ICV JSON API (icv.org.au)
	if strings.Contains(url, "icv.org.au") {
		prayerTimes, err := s.extractFromICVAPI(ctx, timezone)
		if err == nil {
			return prayerTimes, nil
		}
	}

	// Method 0b: Masjidbox REDUX_STATE (masjidbox.com)
	if strings.Contains(url, "masjidbox.com") {
		prayerTimes, err := s.extractFromMasjidbox(ctx, url, timezone)
		if err != nil {
			return nil, fmt.Errorf("masjidbox scraper failed: %w", err)
		}
		return prayerTimes, nil
	}

	// Method 0c: TheMasjidApp (themasjidapp.org)
	if strings.Contains(url, "themasjidapp.org") {
		prayerTimes, err := s.extractFromTheMasjidApp(html, timezone)
		if err != nil {
			return nil, fmt.Errorf("themasjidapp scraper failed: %w", err)
		}
		return prayerTimes, nil
	}

	// Method 0d: Masjidal widget auto-detected from the page HTML — a masjid
	// that isn't in resolveMasjidalID's URL map but embeds a Masjidal/AthanPlus
	// widget (a future adopter works without a code change). URL-mapped masjids
	// already tried the API before the page fetch.
	if resolveMasjidalID(url, "") == "" {
		if masjidalID := resolveMasjidalID(url, html); masjidalID != "" {
			if prayerTimes, err := s.extractFromMasjidalAPI(ctx, masjidalID, timezone); err == nil {
				return prayerTimes, nil
			}
		}
	}

	// Method 0e: Masjidal WordPress plugin markup (aicom.com.au) — legacy
	// fallback for when the Masjidal API failed in the pre-fetch block.
	if strings.Contains(url, "aicom.com.au") {
		prayerTimes, err := s.extractFromMasjidal(html, timezone)
		if err != nil {
			return nil, fmt.Errorf("masjidal scraper failed: %w", err)
		}
		return prayerTimes, nil
	}

	// Method 0f: ISV Preston — TheMasjidApp iframe (fetch iframe URL directly)
	if strings.Contains(url, "isv.org.au") {
		prayerTimes, err := s.extractFromISV(ctx, timezone)
		if err != nil {
			return nil, fmt.Errorf("isv scraper failed: %w", err)
		}
		return prayerTimes, nil
	}

	// Method 0g: AlAdhan API — GPS-calculated fallback for sites that load times
	// dynamically via JS and expose no readable per-day schedule (umis.com.au).
	// NOTE: this is an astronomical approximation, not a masjid's published times;
	// only use it when there is no real source to read.
	if strings.Contains(url, "umis.com.au") {
		prayerTimes, err := s.extractFromAlAdhan(ctx, url, timezone)
		if err != nil {
			return nil, fmt.Errorf("aladhan scraper failed: %w", err)
		}
		return prayerTimes, nil
	}

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

	// Method 3: Fallback to HTML table parsing
	prayerTimes, err = s.extractFromHTML(html, timezone)
	if err == nil {
		return prayerTimes, nil
	}

	// Method 4: CSS class-based extraction (Elementor/page-builder sites like pgcc.org.au)
	prayerTimes, err = s.extractFromCSSClasses(html, timezone)
	if err != nil {
		return nil, fmt.Errorf("failed to extract prayer times: %w", err)
	}

	return prayerTimes, nil
}

// extractFromICVAPI fetches prayer times from the ICV public JSON API.
// ICV (Islamic Council of Victoria) provides a REST endpoint at /api/prayer-times
// returning a full year of prayer times indexed by month and day_of_month.
func (s *Scraper) extractFromICVAPI(ctx context.Context, timezone string) (*models.ScrapedPrayerTimes, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	req, err := http.NewRequestWithContext(ctx, "GET", "https://www.icv.org.au/api/prayer-times", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create ICV request: %w", err)
	}
	req.Header.Set("User-Agent", s.config.UserAgent)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch ICV API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ICV API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read ICV API response: %w", err)
	}

	var apiResp struct {
		PrayerTimes []struct {
			Month      string `json:"month"`
			DayOfMonth string `json:"day_of_month"`
			Fajr       struct {
				Start             string `json:"start"`
				CongregationStart string `json:"congregation_start"`
			} `json:"fajr"`
			Zuhr struct {
				Start             string `json:"start"`
				CongregationStart string `json:"congregation_start"`
			} `json:"zuhr"`
			Asr struct {
				Start             string `json:"start"`
				CongregationStart string `json:"congregation_start"`
			} `json:"asr"`
			Maghrib struct {
				Start             string `json:"start"`
				CongregationStart string `json:"congregation_start"`
			} `json:"maghrib"`
			Isha struct {
				Start             string `json:"start"`
				CongregationStart string `json:"congregation_start"`
			} `json:"isha"`
		} `json:"prayer_times"`
	}

	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse ICV API JSON: %w", err)
	}

	monthStr := strconv.Itoa(int(now.Month()))
	dayStr := strconv.Itoa(now.Day())

	for _, entry := range apiResp.PrayerTimes {
		if entry.Month == monthStr && entry.DayOfMonth == dayStr {
			fajr, err := parseTime12or24(entry.Fajr.Start)
			if err != nil {
				return nil, fmt.Errorf("ICV: invalid fajr time: %w", err)
			}
			dhuhr, err := parseTime12or24(entry.Zuhr.Start)
			if err != nil {
				return nil, fmt.Errorf("ICV: invalid dhuhr time: %w", err)
			}
			asr, err := parseTime12or24(entry.Asr.Start)
			if err != nil {
				return nil, fmt.Errorf("ICV: invalid asr time: %w", err)
			}
			maghrib, err := parseTime12or24(entry.Maghrib.Start)
			if err != nil {
				return nil, fmt.Errorf("ICV: invalid maghrib time: %w", err)
			}
			isha, err := parseTime12or24(entry.Isha.Start)
			if err != nil {
				return nil, fmt.Errorf("ICV: invalid isha time: %w", err)
			}

			pt := &models.ScrapedPrayerTimes{
				Date:    today,
				Fajr:    fajr,
				Dhuhr:   dhuhr,
				Asr:     asr,
				Maghrib: maghrib,
				Isha:    isha,
			}

			// Iqama from congregation_start
			if v, e := parseTime12or24(entry.Fajr.CongregationStart); e == nil {
				pt.FajrIqama = v
			}
			if v, e := parseTime12or24(entry.Zuhr.CongregationStart); e == nil {
				pt.DhuhrIqama = v
			}
			if v, e := parseTime12or24(entry.Asr.CongregationStart); e == nil {
				pt.AsrIqama = v
			}
			if v, e := parseTime12or24(entry.Maghrib.CongregationStart); e == nil {
				pt.MaghribIqama = v
			}
			if v, e := parseTime12or24(entry.Isha.CongregationStart); e == nil {
				pt.IshaIqama = v
			}

			if err := s.validatePrayerTimes(pt); err != nil {
				return nil, err
			}
			return pt, nil
		}
	}

	return nil, fmt.Errorf("ICV: no prayer times found for %s/%s", monthStr, dayStr)
}

// extractFromMasjidbox extracts prayer times from masjidbox.com pages.
// The page embeds prayer data as a URL-encoded JSON string in window.REDUX_STATE.
// The timetable array contains up to 7 days; we pick today's entry by date.
func (s *Scraper) extractFromMasjidbox(ctx context.Context, masjidboxURL, timezone string) (*models.ScrapedPrayerTimes, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	// Re-fetch with a browser User-Agent — masjidbox.com is behind Cloudflare
	// which blocks obvious bot UAs used by the main fetchWithTimeout request.
	req, err := http.NewRequestWithContext(ctx, "GET", masjidboxURL, nil)
	if err != nil {
		return nil, fmt.Errorf("masjidbox: failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("masjidbox: failed to fetch page: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("masjidbox: failed to read response: %w", err)
	}
	html := string(body)

	// Extract the URL-encoded REDUX_STATE value
	re := regexp.MustCompile(`REDUX_STATE\s*=\s*'([^']+)'`)
	m := re.FindStringSubmatch(html)
	if len(m) < 2 {
		return nil, fmt.Errorf("masjidbox: REDUX_STATE not found in HTML")
	}

	// Replace JS-style %uXXXX unicode escapes with \uXXXX so url.QueryUnescape
	// can handle the remaining %XX pairs (Go's QueryUnescape rejects %uXXXX).
	jsUnicodeRe := regexp.MustCompile(`%u([0-9a-fA-F]{4})`)
	sanitized := jsUnicodeRe.ReplaceAllString(m[1], `\u$1`)
	// Use PathUnescape (not QueryUnescape) so that '+' is kept as '+' rather
	// than decoded to a space — timezone offsets like "+10:00" must stay intact.
	decoded, err := url.PathUnescape(sanitized)
	if err != nil {
		return nil, fmt.Errorf("masjidbox: failed to URL-decode REDUX_STATE: %w", err)
	}
	// Unescape \uXXXX sequences left from the JS unicode replacement
	jsUnescapeRe := regexp.MustCompile(`\\u([0-9a-fA-F]{4})`)
	decoded = jsUnescapeRe.ReplaceAllStringFunc(decoded, func(s string) string {
		r, _ := strconv.ParseInt(s[2:], 16, 32)
		return string(rune(r))
	})

	var state struct {
		Masjidbox struct {
			MasjidboxAthany struct {
				Timetable []struct {
					Date    string `json:"date"`
					Fajr    string `json:"fajr"`
					Dhuhr   string `json:"dhuhr"`
					Asr     string `json:"asr"`
					Maghrib string `json:"maghrib"`
					Isha    string `json:"isha"`
					Iqamah  struct {
						Fajr    string `json:"fajr"`
						Dhuhr   string `json:"dhuhr"`
						Asr     string `json:"asr"`
						Maghrib string `json:"maghrib"`
						Isha    string `json:"isha"`
					} `json:"iqamah"`
				} `json:"timetable"`
			} `json:"masjidboxAthany"`
		} `json:"masjidbox"`
	}

	if err := json.Unmarshal([]byte(decoded), &state); err != nil {
		return nil, fmt.Errorf("masjidbox: failed to parse REDUX_STATE JSON: %w", err)
	}

	timetable := state.Masjidbox.MasjidboxAthany.Timetable
	if len(timetable) == 0 {
		return nil, fmt.Errorf("masjidbox: timetable is empty")
	}

	todayStr := today.Format("2006-01-02")
	for _, entry := range timetable {
		// entry.Date is ISO 8601 e.g. "2026-06-09T00:00:00+10:00" — compare date prefix
		if !strings.HasPrefix(entry.Date, todayStr) {
			continue
		}

		// Parse ISO 8601 timestamp → HH:MM in local timezone
		parseISO := func(iso string) (string, error) {
			t, err := time.Parse(time.RFC3339, iso)
			if err != nil {
				return "", err
			}
			return t.In(loc).Format("15:04"), nil
		}

		fajr, err := parseISO(entry.Fajr)
		if err != nil {
			return nil, fmt.Errorf("masjidbox: invalid fajr: %w", err)
		}
		dhuhr, err := parseISO(entry.Dhuhr)
		if err != nil {
			return nil, fmt.Errorf("masjidbox: invalid dhuhr: %w", err)
		}
		asr, err := parseISO(entry.Asr)
		if err != nil {
			return nil, fmt.Errorf("masjidbox: invalid asr: %w", err)
		}
		maghrib, err := parseISO(entry.Maghrib)
		if err != nil {
			return nil, fmt.Errorf("masjidbox: invalid maghrib: %w", err)
		}
		isha, err := parseISO(entry.Isha)
		if err != nil {
			return nil, fmt.Errorf("masjidbox: invalid isha: %w", err)
		}

		pt := &models.ScrapedPrayerTimes{
			Date:    today,
			Fajr:    fajr,
			Dhuhr:   dhuhr,
			Asr:     asr,
			Maghrib: maghrib,
			Isha:    isha,
		}

		if v, e := parseISO(entry.Iqamah.Fajr); e == nil {
			pt.FajrIqama = v
		}
		if v, e := parseISO(entry.Iqamah.Dhuhr); e == nil {
			pt.DhuhrIqama = v
		}
		if v, e := parseISO(entry.Iqamah.Asr); e == nil {
			pt.AsrIqama = v
		}
		if v, e := parseISO(entry.Iqamah.Maghrib); e == nil {
			pt.MaghribIqama = v
		}
		if v, e := parseISO(entry.Iqamah.Isha); e == nil {
			pt.IshaIqama = v
		}

		if err := s.validatePrayerTimes(pt); err != nil {
			return nil, err
		}
		return pt, nil
	}

	return nil, fmt.Errorf("masjidbox: no entry found for %s in timetable", todayStr)
}

// extractFromTheMasjidApp extracts prayer times from themasjidapp.org embedded pages.
//
// The page's static <table> is server-rendered with a STALE placeholder (often
// several days old) that the browser replaces via JS — so parsing the table alone
// drifts behind. The real per-day schedule is embedded in the page as JSON: an
// "imported" object of day-of-year → adhan times, and a sibling "iqamas" object
// of day-of-year → congregation times (may be absent / not forward-dated). We
// prefer that JSON, indexed by today's day-of-year, and fall back to the static
// table only if the JSON is absent (e.g. the page structure changes).
func (s *Scraper) extractFromTheMasjidApp(html, timezone string) (*models.ScrapedPrayerTimes, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	if pt, err := s.extractTheMasjidAppFromJSON(html, today, now.YearDay()); err == nil {
		return pt, nil
	}

	// Fallback: parse the (possibly stale) static table.
	// Match prayer rows. The page embeds SVG icons inline before the prayer name,
	// so we can't rely on the <!-- --> comment anchor. Instead match the first
	// Latin word inside the <td> (prayer name), followed by two time cells.
	// Handles names with trailing Arabic text (e.g. "Fajr الفجر", "Mgrib مغرب").
	re := regexp.MustCompile(`<td[^>]*>\s*(?:<[^>]+>)*\s*(?:<!--\s*-->)?\s*([A-Za-z]+)[^<]*</td><td[^>]*>(\d{1,2}:\d{2})<span[^>]*>(AM|PM)</span></td><td[^>]*>(\d{1,2}:\d{2}|—)`)
	matches := re.FindAllStringSubmatch(html, -1)
	if len(matches) == 0 {
		return nil, fmt.Errorf("themasjidapp: no prayer time rows found in HTML")
	}

	pt := &models.ScrapedPrayerTimes{Date: today}

	for _, m := range matches {
		name := m[1]
		rawTime := m[2] + " " + m[3] // e.g. "5:54 AM"
		rawIqama := m[4]              // e.g. "6:14" or "—"

		adhan, err := parseTime12or24(rawTime)
		if err != nil {
			continue
		}

		// Iqama column has no AM/PM span — infer from adhan (same hour window)
		var iqama string
		if rawIqama != "—" && rawIqama != "" {
			// Prepend AM/PM from adhan to parse correctly
			iqamaParsed, err := parseTime12or24(rawIqama + " " + m[3])
			if err == nil {
				// Sanity check: iqama should be >= adhan (same prayer window)
				if timeToMinutes(iqamaParsed) >= timeToMinutes(adhan) {
					iqama = iqamaParsed
				}
			}
		}

		switch strings.ToLower(name) {
		case "fajr":
			pt.Fajr = adhan
			pt.FajrIqama = iqama
		case "dhuhr", "zuhr":
			pt.Dhuhr = adhan
			pt.DhuhrIqama = iqama
		case "asr":
			pt.Asr = adhan
			pt.AsrIqama = iqama
		case "maghrib", "mgrib":
			pt.Maghrib = adhan
			pt.MaghribIqama = iqama
		case "isha":
			pt.Isha = adhan
			pt.IshaIqama = iqama
		}
	}

	if err := s.validatePrayerTimes(pt); err != nil {
		return nil, fmt.Errorf("themasjidapp: %w", err)
	}

	return pt, nil
}

// themasjidAppDay is one day's entry in the embedded "imported"/"iqamas" arrays.
type themasjidAppDay struct {
	Fajr    string `json:"fajr"`
	Sunrise string `json:"sunrise"`
	Zuhr    string `json:"zuhr"`
	Asr     string `json:"asr"`
	Maghrib string `json:"maghrib"`
	Isha    string `json:"isha"`
}

// extractTheMasjidAppFromJSON reads today's prayer times from the day-of-year
// JSON embedded in a themasjidapp page. adhan times come from the "imported"
// object; iqama times from the sibling "iqamas" object (often not forward-dated,
// so iqama may be blank). yearDay is 1..366. Returns an error if the JSON or
// today's entry can't be found, so the caller can fall back to the static table.
func (s *Scraper) extractTheMasjidAppFromJSON(html string, today time.Time, yearDay int) (*models.ScrapedPrayerTimes, error) {
	dayKey := strconv.Itoa(yearDay)

	lookup := func(objName string) (themasjidAppDay, bool) {
		var zero themasjidAppDay
		obj, ok := extractJSONObject(html, objName)
		if !ok {
			return zero, false
		}
		var days map[string]themasjidAppDay
		if err := json.Unmarshal([]byte(obj), &days); err != nil {
			return zero, false
		}
		d, ok := days[dayKey]
		return d, ok
	}

	adhan, ok := lookup("imported")
	if !ok || adhan.Fajr == "" {
		return nil, fmt.Errorf("themasjidapp: no 'imported' entry for day %d", yearDay)
	}
	iqama, hasIqama := lookup("iqamas")

	pt := &models.ScrapedPrayerTimes{Date: today}
	set := func(dst, dstIq *string, aStr, iStr string) {
		if a, err := parseTime12or24(strings.TrimSpace(aStr)); err == nil {
			*dst = a
		}
		if iStr != "" {
			if iq, err := parseTime12or24(strings.TrimSpace(iStr)); err == nil {
				*dstIq = iq
			}
		}
	}
	iqOr := func(v string) string {
		if !hasIqama {
			return ""
		}
		return v
	}
	set(&pt.Fajr, &pt.FajrIqama, adhan.Fajr, iqOr(iqama.Fajr))
	set(&pt.Dhuhr, &pt.DhuhrIqama, adhan.Zuhr, iqOr(iqama.Zuhr))
	set(&pt.Asr, &pt.AsrIqama, adhan.Asr, iqOr(iqama.Asr))
	set(&pt.Maghrib, &pt.MaghribIqama, adhan.Maghrib, iqOr(iqama.Maghrib))
	set(&pt.Isha, &pt.IshaIqama, adhan.Isha, iqOr(iqama.Isha))

	if err := s.validatePrayerTimes(pt); err != nil {
		return nil, fmt.Errorf("themasjidapp JSON: %w", err)
	}
	return pt, nil
}

// extractJSONObject returns the balanced-brace object value of "key":{...} from
// s, without unescaping. It tracks brace depth (respecting string literals) so
// nested objects are captured correctly. ok is false if the key or a balanced
// object isn't found.
func extractJSONObject(s, key string) (string, bool) {
	marker := `"` + key + `":`
	i := strings.Index(s, marker)
	if i < 0 {
		return "", false
	}
	i += len(marker)
	for i < len(s) && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r') {
		i++
	}
	if i >= len(s) || s[i] != '{' {
		return "", false
	}
	depth, start := 0, i
	inStr, esc := false, false
	for ; i < len(s); i++ {
		c := s[i]
		if inStr {
			switch {
			case esc:
				esc = false
			case c == '\\':
				esc = true
			case c == '"':
				inStr = false
			}
			continue
		}
		switch c {
		case '"':
			inStr = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return s[start : i+1], true
			}
		}
	}
	return "", false
}

// extractFromEmirSultan fetches prayer times from the Emir Sultan Mosque (Dandenong, VIC)
// via the ezanvakti.emushaf.net API. The mosque uses non-standard iqama rules:
//   - Fajr iqama = sunrise − 40 minutes
//   - Dhuhr iqama = adhan + 8 minutes
//   - Asr iqama = adhan + 8 minutes
//   - Maghrib iqama = same as adhan (adhan + 0 minutes)
//   - Isha iqama = adhan + 8 minutes
func (s *Scraper) extractFromEmirSultan(ctx context.Context, timezone string) (*models.ScrapedPrayerTimes, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}
	now := time.Now().In(loc)
	todayStr := now.Format("02.01.2006") // DD.MM.YYYY

	req, err := http.NewRequestWithContext(ctx, "GET", "https://ezanvakti.emushaf.net/vakitler/11413", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", s.config.UserAgent)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch ezanvakti API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ezanvakti API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read ezanvakti response: %w", err)
	}

	var entries []struct {
		MiladiTarihKisa string `json:"MiladiTarihKisa"`
		Imsak           string `json:"Imsak"`
		Gunes           string `json:"Gunes"`
		Ogle            string `json:"Ogle"`
		Ikindi          string `json:"Ikindi"`
		Aksam           string `json:"Aksam"`
		Yatsi           string `json:"Yatsi"`
	}
	if err := json.Unmarshal(body, &entries); err != nil {
		return nil, fmt.Errorf("failed to parse ezanvakti JSON: %w", err)
	}

	var entry *struct {
		MiladiTarihKisa string `json:"MiladiTarihKisa"`
		Imsak           string `json:"Imsak"`
		Gunes           string `json:"Gunes"`
		Ogle            string `json:"Ogle"`
		Ikindi          string `json:"Ikindi"`
		Aksam           string `json:"Aksam"`
		Yatsi           string `json:"Yatsi"`
	}
	for i := range entries {
		if entries[i].MiladiTarihKisa == todayStr {
			entry = &entries[i]
			break
		}
	}
	if entry == nil {
		return nil, fmt.Errorf("no entry found for today (%s) in ezanvakti response", todayStr)
	}

	// addMinutes parses an "HH:MM" string, adds n minutes, and returns "HH:MM"
	addMinutes := func(hhmm string, n int) (string, error) {
		t, err := time.Parse("15:04", hhmm)
		if err != nil {
			return "", fmt.Errorf("invalid time %q: %w", hhmm, err)
		}
		return t.Add(time.Duration(n) * time.Minute).Format("15:04"), nil
	}

	sunriseIqama, err := addMinutes(entry.Gunes, -40)
	if err != nil {
		return nil, fmt.Errorf("failed to compute fajr iqama: %w", err)
	}
	dhuhrIqama, err := addMinutes(entry.Ogle, 8)
	if err != nil {
		return nil, fmt.Errorf("failed to compute dhuhr iqama: %w", err)
	}
	asrIqama, err := addMinutes(entry.Ikindi, 8)
	if err != nil {
		return nil, fmt.Errorf("failed to compute asr iqama: %w", err)
	}
	maghribIqama, err := addMinutes(entry.Aksam, 0)
	if err != nil {
		return nil, fmt.Errorf("failed to compute maghrib iqama: %w", err)
	}
	ishaIqama, err := addMinutes(entry.Yatsi, 8)
	if err != nil {
		return nil, fmt.Errorf("failed to compute isha iqama: %w", err)
	}

	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	return &models.ScrapedPrayerTimes{
		Date:         today,
		Fajr:         entry.Imsak,
		FajrIqama:    sunriseIqama,
		Dhuhr:        entry.Ogle,
		DhuhrIqama:   dhuhrIqama,
		Asr:          entry.Ikindi,
		AsrIqama:     asrIqama,
		Maghrib:      entry.Aksam,
		MaghribIqama: maghribIqama,
		Isha:         entry.Yatsi,
		IshaIqama:    ishaIqama,
	}, nil
}

// extractFromIniDataFile attempts to extract prayer times from awqat.com.au sites.
// It detects the site mode from the server-rendered HTML:
//   - JS_APP_TIMES_BY_FILES = 1 → file mode: read times from .ini file (exact match)
//   - JS_APP_TIMES_BY_FILES = 0 → GPS mode: calculate times using PrayTimes.js MWL algorithm
func (s *Scraper) extractFromIniDataFile(ctx context.Context, html, baseURL, timezone string) (*models.ScrapedPrayerTimes, error) {
	if !strings.Contains(baseURL, "awqat.com.au") {
		return nil, fmt.Errorf("not an awqat.com.au site")
	}

	// Load timezone
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	// Detect mode: JS_APP_TIMES_BY_FILES = 1 means file mode, 0 means GPS mode.
	// This value is set server-side in the HTML and is reliable.
	filesModeRe := regexp.MustCompile(`var\s+JS_APP_TIMES_BY_FILES\s*=\s*(\d)`)
	modeMatches := filesModeRe.FindStringSubmatch(html)
	useFileMode := len(modeMatches) >= 2 && modeMatches[1] == "1"

	var prayerTimes *models.ScrapedPrayerTimes

	if useFileMode {
		// FILE MODE: read times directly from the .ini data file — exact match to website
		cityCodeRe := regexp.MustCompile(`var\s+JS_CITY_CODE\s*=\s*["']([^"']+)["']`)
		matches := cityCodeRe.FindStringSubmatch(html)
		if len(matches) < 2 {
			return nil, fmt.Errorf("city code not found")
		}
		cityCode := matches[1]

		baseURLParts := strings.Split(strings.TrimSuffix(baseURL, "/"), "/")
		baseURLWithoutPath := strings.Join(baseURLParts[:len(baseURLParts)], "/")
		dataFileURL := fmt.Sprintf("%s/data/wtimes-%s.ini", baseURLWithoutPath, cityCode)

		// Some awqat.com.au masjids don't have a per-slug /data/ directory and
		// instead use the shared /www/data/ path. Try the slug-specific URL first,
		// then fall back to the shared path.
		fallbackDataFileURL := fmt.Sprintf("https://awqat.com.au/www/data/wtimes-%s.ini", cityCode)

		fetchDataFile := func(u string) (*http.Response, error) {
			req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
			if err != nil {
				return nil, err
			}
			req.Header.Set("User-Agent", s.config.UserAgent)
			return s.httpClient.Do(req)
		}

		resp, err := fetchDataFile(dataFileURL)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch data file: %w", err)
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			resp, err = fetchDataFile(fallbackDataFileURL)
			if err != nil {
				return nil, fmt.Errorf("failed to fetch fallback data file: %w", err)
			}
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("data file request failed with status: %d", resp.StatusCode)
		}

		dataBody, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("failed to read data file: %w", err)
		}

		dataContent := string(dataBody)
		todayStr := now.Format("01-02")
		lineRe := regexp.MustCompile(`"` + todayStr + `~~~~~([^"]+)"`)
		lineMatches := lineRe.FindStringSubmatch(dataContent)
		if len(lineMatches) < 2 {
			return nil, fmt.Errorf("prayer times for today (%s) not found in data file", todayStr)
		}

		times := strings.Split(lineMatches[1], "|")
		if len(times) < 6 {
			return nil, fmt.Errorf("insufficient times in data line: %v", times)
		}

		prayerTimes = &models.ScrapedPrayerTimes{
			Date:    today,
			Fajr:    strings.TrimSpace(times[0]),
			Dhuhr:   strings.TrimSpace(times[2]),
			Asr:     strings.TrimSpace(times[3]),
			Maghrib: strings.TrimSpace(times[4]),
			Isha:    strings.TrimSpace(times[5]),
		}
	} else {
		// GPS MODE: calculate times using PrayTimes.js MWL algorithm.
		// The website uses JS to calculate times client-side — we replicate that here.
		gpsRe := regexp.MustCompile(`var\s+JS_GPS_FULL_CODE\s*=\s*"([^"]+)"`)
		gpsMatches := gpsRe.FindAllStringSubmatch(html, -1)
		// Take the last non-empty declaration (the real one, not the blank initializer)
		gpsCode := ""
		for _, m := range gpsMatches {
			if len(m) >= 2 && m[1] != "" {
				gpsCode = m[1]
			}
		}
		if gpsCode == "" {
			return nil, fmt.Errorf("GPS code not found in HTML")
		}

		// Format: "AU|CityName|lat|lng|fajrAngle|ishaAngle"
		parts := strings.Split(gpsCode, "|")
		if len(parts) < 4 {
			return nil, fmt.Errorf("invalid GPS code format: %s", gpsCode)
		}

		lat, err := strconv.ParseFloat(parts[2], 64)
		if err != nil {
			return nil, fmt.Errorf("invalid latitude: %s", parts[2])
		}
		lng, err := strconv.ParseFloat(parts[3], 64)
		if err != nil {
			return nil, fmt.Errorf("invalid longitude: %s", parts[3])
		}

		// UTC offset from the timezone (handles DST automatically)
		_, tzOffset := now.Zone()
		tzHours := float64(tzOffset) / 3600.0

		// Asr juristic method is a per-site setting: JS_GPS_ASR_TYPE = "Hanafi"
		// uses shadow factor 2 (e.g. Leo St Musallah), otherwise Standard (factor 1).
		asrFactor := 1.0
		if regexp.MustCompile(`JS_GPS_ASR_TYPE\s*=\s*["']Hanafi["']`).MatchString(html) {
			asrFactor = 2.0
		}

		prayerTimes = &models.ScrapedPrayerTimes{
			Date: today,
		}

		if err := s.calcMWLTimes(now, lat, lng, tzHours, asrFactor, prayerTimes); err != nil {
			return nil, fmt.Errorf("GPS calculation failed: %w", err)
		}

	}

	// Apply JS_ATHAN_MINUTES_OF_* per-prayer offsets for both file and GPS modes.
	// These are declared server-side and adjust base times per-masjid
	// (e.g. AMSSA file mode: Dhuhr+4, Asr-1, Maghrib-2, Isha+1).
	// First occurrence only — later occurrences are boundary-clamp lines (= -60, = 60).
	adjRe := regexp.MustCompile(`JS_ATHAN_MINUTES_OF_(\w+)\s*=\s*(-?\d+)`)
	adjustments := map[string]int{}
	seen := map[string]bool{}
	for _, m := range adjRe.FindAllStringSubmatch(html, -1) {
		if len(m) == 3 && !seen[m[1]] {
			val, _ := strconv.Atoi(m[2])
			adjustments[m[1]] = val
			seen[m[1]] = true
		}
	}
	prayerTimes.Fajr = s.addMinutes(prayerTimes.Fajr, adjustments["FAJR"])
	prayerTimes.Dhuhr = s.addMinutes(prayerTimes.Dhuhr, adjustments["DOHR"])
	prayerTimes.Asr = s.addMinutes(prayerTimes.Asr, adjustments["ASR"])
	prayerTimes.Maghrib = s.addMinutes(prayerTimes.Maghrib, adjustments["MAGHRIB"])
	prayerTimes.Isha = s.addMinutes(prayerTimes.Isha, adjustments["ISHA"])

	// Some masjids hand-edit the template to hardcode a displayed athan time,
	// e.g. IISNA: document.getElementById('s5').innerHTML = '10:00'; //KonvertTimeTo12(_n5);
	// These literals are what visitors actually see, so they win over computed times.
	applyHardcodedAthanOverrides(html, prayerTimes)

	if err := s.validatePrayerTimes(prayerTimes); err != nil {
		return nil, err
	}

	if err := s.extractAndCalculateIqamaTimes(ctx, baseURL, html, prayerTimes); err != nil {
		prayerTimes.FajrIqama = s.addMinutes(prayerTimes.Fajr, 20)
		prayerTimes.DhuhrIqama = s.addMinutes(prayerTimes.Dhuhr, 20)
		prayerTimes.AsrIqama = s.addMinutes(prayerTimes.Asr, 20)
		prayerTimes.MaghribIqama = s.addMinutes(prayerTimes.Maghrib, 20)
		prayerTimes.IshaIqama = s.addMinutes(prayerTimes.Isha, 20)
	}

	// AYCC special case: Maghrib iqama = same as adhan. The admin configured this
	// via the on-page localStorage UI which is not readable by the scraper.
	if strings.Contains(baseURL, "awqat.com.au/aycc") {
		prayerTimes.MaghribIqama = prayerTimes.Maghrib
	}

	return prayerTimes, nil
}

// calcMWLTimes calculates prayer times using the PrayTimes.js MWL algorithm.
// MWL: Fajr 18°, Isha 17°, Maghrib at sunset. asrFactor is the Asr shadow
// factor: 1 = Standard (Shafi), 2 = Hanafi.
// This is a faithful port of PrayTimes.js v2.3 (praytimes.org) as used by awqat.com.au.
// Includes: iterative sun position computation, adjustHighLats (AngleBased).
func (s *Scraper) calcMWLTimes(t time.Time, lat, lng, tzHours, asrFactor float64, pt *models.ScrapedPrayerTimes) error {
	toRad := func(d float64) float64 { return d * math.Pi / 180 }
	toDeg := func(r float64) float64 { return r * 180 / math.Pi }
	fixHour := func(h float64) float64 { return h - 24*math.Floor(h/24) }
	fixAngle := func(a float64) float64 { return a - 360*math.Floor(a/360) }

	// Julian date with longitude offset baked in (matches PrayTimes.js: jDate = julian(y,m,d) - lng/(15*24))
	year, month, day := t.Date()
	y, m := float64(year), float64(month)
	d := float64(day)
	if m <= 2 {
		y--
		m += 12
	}
	A := math.Floor(y / 100)
	B := 2 - A + math.Floor(A/4)
	jDate := math.Floor(365.25*(y+4716)) + math.Floor(30.6001*(m+1)) + d + B - 1524.5 - lng/(15*24)

	// sunPos: returns declination (degrees) and equation of time (hours) at fractional Julian date jd
	sunPos := func(jd float64) (decl, eqt float64) {
		D := jd - 2451545.0
		g := fixAngle(357.529 + 0.98560028*D)
		q := fixAngle(280.459 + 0.98564736*D)
		L := fixAngle(q + 1.915*math.Sin(toRad(g)) + 0.020*math.Sin(toRad(2*g)))
		e := 23.439 - 0.00000036*D
		RA := toDeg(math.Atan2(math.Cos(toRad(e))*math.Sin(toRad(L)), math.Cos(toRad(L)))) / 15
		eqt = q/15 - fixHour(RA)
		decl = toDeg(math.Asin(math.Sin(toRad(e)) * math.Sin(toRad(L))))
		return
	}

	// midDay: solar noon at fractional day t (matches PrayTimes.js midDay)
	midDay := func(tfrac float64) float64 {
		_, eqt := sunPos(jDate + tfrac)
		return fixHour(12 - eqt)
	}

	// sunAngleTime: angle in degrees below horizon (positive=below, negative=above), t is fractional day
	// ccw=true means "before noon" (Fajr, Sunrise), ccw=false means "after noon" (Sunset, Maghrib, Isha, Asr)
	sunAngleTime := func(angle, tfrac float64, ccw bool) (float64, error) {
		decl, _ := sunPos(jDate + tfrac)
		noon := midDay(tfrac)
		cosT := (-math.Sin(toRad(angle)) - math.Sin(toRad(decl))*math.Sin(toRad(lat))) /
			(math.Cos(toRad(decl)) * math.Cos(toRad(lat)))
		if math.Abs(cosT) > 1 {
			return math.NaN(), nil // sun never reaches this angle (polar scenario)
		}
		T := toDeg(math.Acos(cosT)) / 15
		if ccw {
			return noon - T, nil
		}
		return noon + T, nil
	}

	// Rise/set angle: 0.833° (standard atmospheric refraction at elevation=0)
	const riseSetAngle = 0.833

	// Initial times in fractional days (PrayTimes.js: divides hours by 24 in dayPortion)
	fajr := 5.0 / 24
	sunrise := 6.0 / 24
	dhuhr := 12.0 / 24
	asr := 13.0 / 24
	sunset := 18.0 / 24
	maghrib := 18.0 / 24
	isha := 18.0 / 24

	// 1 iteration (numIterations = 1): each prayer uses sunPos at its own fractional time
	var err error
	fajr, err = sunAngleTime(18, fajr, true)
	if err != nil {
		return err
	}
	sunrise, err = sunAngleTime(riseSetAngle, sunrise, true)
	if err != nil {
		return err
	}
	dhuhr = midDay(dhuhr)

	// Asr: angle = -arccot(factor + tan|lat - decl|), factor 1=Standard, 2=Hanafi
	// Negative angle = above horizon; sunAngleTime handles via -sin(angle) = sin(|angle|)
	asrDecl, _ := sunPos(jDate + asr)
	asrAngle := -toDeg(math.Atan(1.0 / (asrFactor + math.Tan(math.Abs(toRad(lat-asrDecl))))))
	asr, err = sunAngleTime(asrAngle, asr, false)
	if err != nil {
		return err
	}

	sunset, err = sunAngleTime(riseSetAngle, sunset, false)
	if err != nil {
		return err
	}

	// MWL maghrib = '0 min' → isMin=true → maghrib = sunset + 0 in adjustTimes
	maghrib = sunset

	isha, err = sunAngleTime(17, isha, false)
	if err != nil {
		return err
	}

	// adjustTimes: convert from UTC solar to local time (PrayTimes.js: times[i] += timeZone - lng/15)
	localOffset := tzHours - lng/15
	fajr = fixHour(fajr + localOffset)
	sunrise = fixHour(sunrise + localOffset)
	dhuhr = fixHour(dhuhr + localOffset) // dhuhr offset = '0 min' → +0/60
	asr = fixHour(asr + localOffset)
	sunset = fixHour(sunset + localOffset)
	maghrib = fixHour(maghrib + localOffset) // = sunset in local time
	isha = fixHour(isha + localOffset)

	// adjustHighLats (AngleBased): clamp Fajr/Isha if too far from sunrise/sunset
	// nightTime = fixHour(sunrise - sunset) = duration of night in hours
	nightTime := fixHour(sunrise - sunset)

	// Fajr (ccw): if (sunrise - fajr) > (18/60 * night), clamp fajr = sunrise - portion
	fajrPortion := (18.0 / 60.0) * nightTime
	if math.IsNaN(fajr) || fixHour(sunrise-fajr) > fajrPortion {
		fajr = sunrise - fajrPortion
	}

	// Isha: if (isha - sunset) > (17/60 * night), clamp isha = sunset + portion
	ishaPortion := (17.0 / 60.0) * nightTime
	if math.IsNaN(isha) || fixHour(isha-sunset) > ishaPortion {
		isha = sunset + ishaPortion
	}

	// Maghrib: portion = (0/60) * night = 0, so effectively no clamping
	// (maghrib = sunset already, and timeDiff(sunset, maghrib)=0 which is never > 0)

	// Format: add 0.5/60 to round to nearest minute (matches PrayTimes.js getFormattedTime)
	round := func(h float64) string {
		h = fixHour(h + 0.5/60)
		hh := int(math.Floor(h))
		mm := int(math.Floor((h - math.Floor(h)) * 60))
		return fmt.Sprintf("%02d:%02d", hh, mm)
	}

	pt.Fajr = round(fajr)
	pt.Dhuhr = round(dhuhr)
	pt.Asr = round(asr)
	pt.Maghrib = round(maghrib)
	pt.Isha = round(isha)

	return nil
}

// applyHardcodedAthanOverrides scans the page HTML for hand-edited athan cells.
// The awqat template normally renders each athan cell from the computed time:
//
//	document.getElementById('s5').innerHTML = KonvertTimeTo12(_n5);
//
// but some masjids replace the expression with a literal (IISNA displays Isha
// as a fixed '10:00' PM). Cell mapping: s0=Fajr, s1=Sunrise, s2=Dhuhr, s3=Asr,
// s4=Maghrib, s5=Isha. Times are as-displayed (12-hour, no AM/PM), so convert
// to 24-hour using the prayer's half of the day.
func applyHardcodedAthanOverrides(html string, pt *models.ScrapedPrayerTimes) {
	cellPat := regexp.MustCompile(`getElementById\('s([02-5])'\)\.innerHTML\s*=\s*'(\d{1,2}):(\d{2})'`)
	for _, line := range strings.Split(html, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "//") {
			continue
		}
		m := cellPat.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		hour, _ := strconv.Atoi(m[2])
		minute, _ := strconv.Atoi(m[3])
		if hour < 1 || hour > 12 || minute > 59 {
			continue
		}
		switch m[1] {
		case "0": // Fajr — always AM
			pt.Fajr = fmt.Sprintf("%02d:%02d", hour%12, minute)
		case "2": // Dhuhr — 11:xx is AM, everything else is noon/afternoon
			if hour <= 10 {
				hour += 12
			}
			pt.Dhuhr = fmt.Sprintf("%02d:%02d", hour, minute)
		case "3": // Asr — always PM
			pt.Asr = fmt.Sprintf("%02d:%02d", hour%12+12, minute)
		case "4": // Maghrib — always PM
			pt.Maghrib = fmt.Sprintf("%02d:%02d", hour%12+12, minute)
		case "5": // Isha — always PM
			pt.Isha = fmt.Sprintf("%02d:%02d", hour%12+12, minute)
		}
	}
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

// parseTime12or24 converts a time string in either 12-hour (e.g. "5:50 AM") or
// 24-hour (e.g. "05:50") format into a normalised 24-hour "HH:MM" string.
func parseTime12or24(s string) (string, error) {
	s = strings.TrimSpace(s)
	for _, layout := range []string{"3:04 PM", "3:04 AM", "15:04"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.Format("15:04"), nil
		}
	}
	matched, _ := regexp.MatchString(`^([0-1][0-9]|2[0-3]):[0-5][0-9]$`, s)
	if matched {
		return s, nil
	}
	return "", fmt.Errorf("unrecognised time format: %s", s)
}

// extractFromHTML attempts to extract prayer times from an HTML table.
// Supports 2-column (Prayer | Adhan) and 3-column (Prayer | Adhan | Iqama) layouts.
// Times may be in 12-hour AM/PM or 24-hour format.
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

	doc.Find("table tr").Each(func(i int, row *goquery.Selection) {
		cells := row.Find("td")
		if cells.Length() < 2 {
			return
		}

		prayer := strings.ToLower(strings.TrimSpace(cells.Eq(0).Text()))
		adhanRaw := strings.TrimSpace(cells.Eq(1).Text())
		adhan, err := parseTime12or24(adhanRaw)
		if err != nil {
			return // skip rows with unrecognisable times (e.g. header rows)
		}

		// Iqama is optional — only present in 3+ column tables
		var iqama string
		if cells.Length() >= 3 {
			iqamaRaw := strings.TrimSpace(cells.Eq(2).Text())
			if parsed, parseErr := parseTime12or24(iqamaRaw); parseErr == nil {
				iqama = parsed
			}
		}

		switch {
		case strings.Contains(prayer, "fajr"):
			prayerTimes.Fajr = adhan
			if iqama != "" {
				prayerTimes.FajrIqama = iqama
			}
		case strings.Contains(prayer, "dhuhr") || strings.Contains(prayer, "zuhr"):
			prayerTimes.Dhuhr = adhan
			if iqama != "" {
				prayerTimes.DhuhrIqama = iqama
			}
		case strings.Contains(prayer, "asr"):
			prayerTimes.Asr = adhan
			if iqama != "" {
				prayerTimes.AsrIqama = iqama
			}
		case strings.Contains(prayer, "maghrib"):
			prayerTimes.Maghrib = adhan
			if iqama != "" {
				prayerTimes.MaghribIqama = iqama
			}
		case strings.Contains(prayer, "isha"): // handles "Isha" and "Ishaa"
			prayerTimes.Isha = adhan
			if iqama != "" {
				prayerTimes.IshaIqama = iqama
			}
		}
	})

	// Validate that we found all five adhan times
	if prayerTimes.Fajr == "" || prayerTimes.Dhuhr == "" || prayerTimes.Asr == "" ||
		prayerTimes.Maghrib == "" || prayerTimes.Isha == "" {
		return nil, fmt.Errorf("incomplete prayer times extracted from HTML")
	}

	if err := s.validatePrayerTimes(prayerTimes); err != nil {
		return nil, err
	}

	return prayerTimes, nil
}

// extractFromCSSClasses extracts prayer times from page-builder sites (e.g. Elementor)
// that embed times in elements with predictable CSS class names like
// "salahfajr", "iqamah_fajr", "salah_dhuhr", "iqamah_dhuhr", etc.
func (s *Scraper) extractFromCSSClasses(html, timezone string) (*models.ScrapedPrayerTimes, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return nil, fmt.Errorf("failed to parse HTML: %w", err)
	}

	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}

	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	pt := &models.ScrapedPrayerTimes{Date: today}

	// Maps CSS class substrings to prayer adhan/iqama fields.
	// Each entry: {classFragment, isIqama} → field pointer.
	type classMapping struct {
		fragment string
		iqama    bool
		set      func(string)
	}

	mappings := []classMapping{
		{"salahfajr", false, func(v string) { pt.Fajr = v }},
		{"iqamah_fajr", true, func(v string) { pt.FajrIqama = v }},
		// Dhuhr appears as "salahzuhr" / "iqamah_zuhr" on some sites (e.g. pgcc.org.au)
		// and "salah_dhuhr" / "iqamah_dhuhr" on others — check both
		{"salahzuhr", false, func(v string) {
			if pt.Dhuhr == "" {
				pt.Dhuhr = v
			}
		}},
		{"iqamah_zuhr", true, func(v string) {
			if pt.DhuhrIqama == "" {
				pt.DhuhrIqama = v
			}
		}},
		{"salah_dhuhr", false, func(v string) {
			if pt.Dhuhr == "" {
				pt.Dhuhr = v
			}
		}},
		{"iqamah_dhuhr", true, func(v string) {
			if pt.DhuhrIqama == "" {
				pt.DhuhrIqama = v
			}
		}},
		{"salah_asr", false, func(v string) { pt.Asr = v }},
		{"iqamah_asr", true, func(v string) { pt.AsrIqama = v }},
		{"salah_maghrib", false, func(v string) { pt.Maghrib = v }},
		{"iqamah_maghrib", true, func(v string) { pt.MaghribIqama = v }},
		{"salah_isha", false, func(v string) { pt.Isha = v }},
		{"iqamah_isha", true, func(v string) { pt.IshaIqama = v }},
	}

	for _, m := range mappings {
		doc.Find("[class*=" + m.fragment + "]").Each(func(i int, sel *goquery.Selection) {
			if i > 0 {
				return // take first match only
			}
			raw := strings.TrimSpace(sel.Find("span").First().Text())
			if raw == "" {
				raw = strings.TrimSpace(sel.Text())
			}
			if parsed, parseErr := parseTime12or24(raw); parseErr == nil {
				m.set(parsed)
			}
		})
	}

	if pt.Fajr == "" || pt.Dhuhr == "" || pt.Asr == "" || pt.Maghrib == "" || pt.Isha == "" {
		return nil, fmt.Errorf("incomplete prayer times extracted from CSS classes")
	}

	if err := s.validatePrayerTimes(pt); err != nil {
		return nil, err
	}

	return pt, nil
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

// extractAndCalculateIqamaTimes extracts iqama configuration and calculates iqama times.
// pageHTML is the main page HTML, used to read JS_PRAY_DURATION_OF_* fallback offsets.
func (s *Scraper) extractAndCalculateIqamaTimes(ctx context.Context, baseURL, pageHTML string, pt *models.ScrapedPrayerTimes) error {
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
	// Slots may be empty ([0,,,10,7,7]) — the template leaves those prayers to
	// FIXED_IQAMA_TIMES. Explicit values are used literally by the website JS,
	// including 0 (iqama = adhan) and negatives (e.g. ICMG Brimbank Isha -10),
	// so keep "empty" distinct from "zero".
	offsetTimesRe := regexp.MustCompile(`JS_IQAMA_TIME\s*=\s*\[([^\]]+)\]`)
	offsetMatches := offsetTimesRe.FindStringSubmatch(content)

	var offsetTimes []int
	if len(offsetMatches) > 1 {
		// Parse the array
		offsetStr := strings.ReplaceAll(offsetMatches[1], " ", "")
		offsetParts := strings.Split(offsetStr, ",")
		for _, part := range offsetParts {
			if offset, err := strconv.Atoi(part); err == nil {
				offsetTimes = append(offsetTimes, offset)
			} else {
				offsetTimes = append(offsetTimes, iqamaOffsetUnset)
			}
		}
	}

	// Parse JS_PRAY_DURATION_OF_* from the main page HTML.
	// These are the per-prayer iqama offsets (in minutes) used by the awqat.com.au
	// JavaScript engine as fallback when FIXED_IQAMA_TIMES[i] is empty and
	// JS_IQAMA_TIME[i] is 0. Without reading these, our scraper defaulted to 20
	// minutes for every prayer, which was wrong (e.g. Maghrib is typically 10 min).
	//
	// Variable names: JS_PRAY_DURATION_OF_FAJR, JS_PRAY_DURATION_OF_SHOROQ,
	//   JS_PRAY_DURATION_OF_DOHR, JS_PRAY_DURATION_OF_ASR,
	//   JS_PRAY_DURATION_OF_MAGHRIB, JS_PRAY_DURATION_OF_ISHA
	//
	// Array mapping (same indices as FIXED_IQAMA_TIMES):
	//   [0]=Sunrise, [1]=Fajr, [2]=Dhuhr, [3]=Asr, [4]=Maghrib, [5]=Isha
	durationDefaults := [6]int{5, 20, 20, 20, 20, 20} // sane fallback if vars absent
	durationKeys := []struct {
		key   string
		index int
	}{
		{"FAJR", 1},
		{"DOHR", 2},
		{"ASR", 3},
		{"MAGHRIB", 4},
		{"ISHA", 5},
	}
	// Only use the first occurrence of each JS_PRAY_DURATION_OF_* variable —
	// later occurrences are boundary-clamp lines (e.g. "if > 40 { = 40 }") that
	// would overwrite the real value if we processed all matches.
	seenDuration := map[string]bool{}
	durationRe := regexp.MustCompile(`JS_PRAY_DURATION_OF_(\w+)\s*=\s*(\d+)`)
	for _, m := range durationRe.FindAllStringSubmatch(pageHTML, -1) {
		key := m[1]
		if seenDuration[key] {
			continue
		}
		seenDuration[key] = true
		val, _ := strconv.Atoi(m[2])
		for _, dk := range durationKeys {
			if dk.key == key {
				durationDefaults[dk.index] = val
				break
			}
		}
	}

	// Use the timezone from the already-computed prayer date for day-of-week calculations
	loc := pt.Date.Location()
	if loc == nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)

	// Calculate iqama times for each prayer
	// Array indices: [0]=Sunrise, [1]=Fajr, [2]=Dhuhr, [3]=Asr, [4]=Maghrib, [5]=Isha

	// Fajr (index 1)
	pt.FajrIqama = s.calculateIqamaWithDefault(pt.Fajr, fixedTimes, offsetTimes, 1, durationDefaults[1])

	// Dhuhr (index 2): check for day-of-week override in JS_ANNONCE variables before using fixed time.
	// Some masjids (e.g. Al Taqwa) vary Dhuhr iqama by day:
	//   JS_ANNONCE_2 = "Dhuhr Iqamah: Sun to Wed 1:20pm, Thurs & Sat 1:30pm"
	if dhuhrOverride := s.parseDhuhrDayOverride(content, now); dhuhrOverride != "" {
		pt.DhuhrIqama = dhuhrOverride
	} else {
		pt.DhuhrIqama = s.calculateIqamaWithDefault(pt.Dhuhr, fixedTimes, offsetTimes, 2, durationDefaults[2])
	}

	// Asr (index 3)
	pt.AsrIqama = s.calculateIqamaWithDefault(pt.Asr, fixedTimes, offsetTimes, 3, durationDefaults[3])

	// Maghrib (index 4)
	pt.MaghribIqama = s.calculateIqamaWithDefault(pt.Maghrib, fixedTimes, offsetTimes, 4, durationDefaults[4])

	// Isha (index 5)
	pt.IshaIqama = s.calculateIqamaWithDefault(pt.Isha, fixedTimes, offsetTimes, 5, durationDefaults[5])

	return nil
}

// parseDhuhrDayOverride checks JS_ANNONCE variables in iqamafixed.js content for a
// day-of-week-specific Dhuhr iqama time. Returns "" if no override is found.
//
// Handles the pattern used by Al Taqwa:
//
//	JS_ANNONCE_2 = "Dhuhr Iqamah: Sun to Wed 1:20pm, Thurs & Sat 1:30pm"
//
// The string is split on commas into segments. Each segment contains day tokens
// (sun/mon/tue/wed/thu/thurs/fri/sat, optionally with "to" for ranges or "&" for lists)
// and a 12-hour time (e.g. "1:30pm"). The segment whose day set includes today wins.
func (s *Scraper) parseDhuhrDayOverride(content string, now time.Time) string {
	// Day name → index where Sunday=0 … Saturday=6
	dayIndex := map[string]int{
		"sun": 0, "mon": 1, "tue": 2, "wed": 3,
		"thu": 4, "thurs": 4, "fri": 5, "sat": 6,
	}

	// Convert Go's time.Weekday (Sunday=0) to our Sun=0 index — they already match.
	todayIdx := int(now.Weekday())

	// Find any JS_ANNONCE variable that mentions "Dhuhr" and "Iqamah" (case-insensitive)
	announcePat := regexp.MustCompile(`(?i)JS_ANNONCE_\d+\s*=\s*["']([^"']*dhuhr[^"']*iqam[^"']*)["']`)
	m := announcePat.FindStringSubmatch(content)
	if m == nil {
		return ""
	}
	line := m[1]

	// Strip the "Dhuhr Iqamah:" prefix, then split on commas to get per-day-group segments
	colonIdx := strings.Index(line, ":")
	if colonIdx < 0 {
		return ""
	}
	body := line[colonIdx+1:]
	segments := strings.Split(body, ",")

	timePat := regexp.MustCompile(`(?i)(\d{1,2}:\d{2})\s*(am|pm)`)
	dayTokenPat := regexp.MustCompile(`(?i)(sun|mon|tue|wed|thurs?|fri|sat)`)

	for _, seg := range segments {
		seg = strings.TrimSpace(seg)
		tm := timePat.FindStringSubmatch(seg)
		if tm == nil {
			continue
		}
		timeRaw := tm[1]   // e.g. "1:30"
		ampm := strings.ToLower(tm[2]) // "pm"

		// Convert to 24-hour HH:MM
		parts := strings.Split(timeRaw, ":")
		if len(parts) != 2 {
			continue
		}
		h, _ := strconv.Atoi(parts[0])
		min, _ := strconv.Atoi(parts[1])
		if ampm == "pm" && h != 12 {
			h += 12
		} else if ampm == "am" && h == 12 {
			h = 0
		}
		iqamaTime := fmt.Sprintf("%02d:%02d", h, min)

		// Collect day tokens from the part of the segment before the time
		dayPart := seg[:strings.Index(seg, tm[0])]
		tokens := dayTokenPat.FindAllString(dayPart, -1)
		if len(tokens) == 0 {
			continue
		}

		// Build the set of days this segment applies to
		var days []int
		isRange := strings.Contains(strings.ToLower(dayPart), " to ")
		if isRange && len(tokens) >= 2 {
			start := dayIndex[strings.ToLower(tokens[0])]
			end := dayIndex[strings.ToLower(tokens[len(tokens)-1])]
			for i := start; i <= end; i++ {
				days = append(days, i)
			}
		} else {
			for _, t := range tokens {
				days = append(days, dayIndex[strings.ToLower(t)])
			}
		}

		for _, d := range days {
			if d == todayIdx {
				return iqamaTime
			}
		}
	}

	return ""
}

// calculateIqama calculates iqama time based on fixed time or offset, using 20 min as default.
func (s *Scraper) calculateIqama(adhanTime string, fixedTimes []string, offsetTimes []int, index int) string {
	return s.calculateIqamaWithDefault(adhanTime, fixedTimes, offsetTimes, index, 20)
}

// iqamaOffsetUnset marks an empty slot in the JS_IQAMA_TIME array. The website
// JS uses explicit values literally — including 0 and negatives — so only truly
// empty slots may fall through to the default offset.
const iqamaOffsetUnset = math.MinInt32

// calculateIqamaWithDefault calculates iqama time using:
//  1. FIXED_IQAMA_TIMES[index] if non-empty (hardcoded clock time)
//  2. JS_IQAMA_TIME[index] if the slot was explicitly set (minutes offset from
//     adhan; 0 and negative values are valid — e.g. ICMG Brimbank uses [0,0,0,0,0,-10])
//  3. defaultOffset (from JS_PRAY_DURATION_OF_* in the main page HTML)
func (s *Scraper) calculateIqamaWithDefault(adhanTime string, fixedTimes []string, offsetTimes []int, index, defaultOffset int) string {
	// Fixed clock time takes priority
	if len(fixedTimes) > index && fixedTimes[index] != "" {
		return fixedTimes[index]
	}

	// JS_IQAMA_TIME offset next
	if len(offsetTimes) > index && offsetTimes[index] != iqamaOffsetUnset {
		return s.addMinutes(adhanTime, offsetTimes[index])
	}

	// Fall back to JS_PRAY_DURATION_OF_* from the main page
	return s.addMinutes(adhanTime, defaultOffset)
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

	// Add minutes; wrap within a 24-hour day (minutes may be negative)
	totalMins := ((hours*60+mins+minutes)%1440 + 1440) % 1440
	newHours := totalMins / 60
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

// FetchJummahTimes scrapes Jumu'ah session times from a masjid's website.
// Returns a slice of (session, time24h) pairs. Returns nil if the source
// doesn't expose Jummah data.
func (s *Scraper) FetchJummahTimes(ctx context.Context, masjidURL string) ([][2]string, error) {
	if strings.Contains(masjidURL, "awqat.com.au") {
		// MGM uses awqat but has Jummah in inline JS comments, not JS_ANNONCE
		if strings.Contains(masjidURL, "/mgm") {
			return s.parseJummahFromMGM(ctx, masjidURL)
		}
		return s.parseJummahFromAwqat(ctx, masjidURL)
	}
	if strings.Contains(masjidURL, "masjidbox.com") {
		return s.parseJummahFromMasjidBox(ctx, masjidURL)
	}
	// Masjidal-platform masjids (IEWAD, Lysterfield, AICOM, PGCC, Emir Sultan):
	// Jumu'ah sessions come from the same Masjidal API as the daily times.
	if id := resolveMasjidalID(masjidURL, ""); id != "" {
		if sessions, err := s.parseJummahFromMasjidalAPI(ctx, id); err == nil && len(sessions) > 0 {
			return sessions, nil
		}
		// Legacy fallbacks if the API is down.
		if strings.Contains(masjidURL, "pgcc.org.au") {
			return s.parseJummahFromPGCC(ctx, masjidURL)
		}
		return s.parseJummahFromAthanPlus(ctx, id)
	}
	if strings.Contains(masjidURL, "themasjidapp.org") {
		return s.parseJummahFromTheMasjidApp(ctx, masjidURL)
	}
	if strings.Contains(masjidURL, "icv.org.au") {
		return s.parseJummahFromICV(ctx)
	}
	// ISV Preston: masjid URL is isv.org.au but prayer times come from themasjidapp.org
	if strings.Contains(masjidURL, "isv.org.au") {
		return s.parseJummahFromTheMasjidApp(ctx, "https://themasjidapp.org/128422/prayers")
	}
	// Sunshine Mosque
	if strings.Contains(masjidURL, "sunshinemosque.com.au") {
		return s.parseJummahFromSunshineMosque(ctx, masjidURL)
	}
	return nil, nil
}

// parseJummahFromAwqat extracts Jumu'ah times from awqat.com.au sites.
//
// What a visitor sees in the announcement ticker depends on the template version:
//   - New template: the page contains `JS_ANNONCE_1 = JS_eLang.HereMosqueMessage`
//     and displays the HereMosqueMessage string from <site>/lang-EN.ini
//     (e.g. `HereMosqueMessage : "JUMU'AH @ 1:30PM & 2:10PM"`). Any JS_ANNONCE_*
//     left in iqamafixed.js is legacy data the template no longer shows.
//   - Old template: the page displays JS_ANNONCE_1 / JS_ANNONCE_2 from
//     <site>/iqamafixed.js (e.g. Fitzroy: "First JUMU'AH 12:30 PM" +
//     "Second Friday Prayer: 1:10 PM").
//
// We replicate exactly what is displayed, then extract session times from it.
func (s *Scraper) parseJummahFromAwqat(ctx context.Context, pageURL string) ([][2]string, error) {
	fetch := func(u string) (string, error) {
		req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("User-Agent", s.config.UserAgent)
		resp, err := s.httpClient.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return "", fmt.Errorf("GET %s: status %d", u, resp.StatusCode)
		}
		body, err := io.ReadAll(resp.Body)
		return string(body), err
	}

	html, err := fetch(pageURL)
	if err != nil {
		return nil, err
	}
	base := strings.TrimSuffix(pageURL, "/")

	var announcements []string
	if strings.Contains(html, "JS_eLang.HereMosqueMessage") {
		// New template: the displayed message lives in lang-EN.ini
		langContent, err := fetch(base + "/lang-EN.ini")
		if err != nil {
			return nil, err
		}
		msgPat := regexp.MustCompile(`HereMosqueMessage\s*:\s*"([^"\n]*)"`)
		if m := msgPat.FindStringSubmatch(langContent); m != nil {
			announcements = append(announcements, m[1])
		}
	} else {
		// Old template: the displayed messages are JS_ANNONCE_* in iqamafixed.js
		jsContent, err := fetch(base + "/iqamafixed.js")
		if err != nil {
			return nil, err
		}
		announcePat := regexp.MustCompile(`JS_ANNONCE_\d+\s*=\s*(?:"([^"\n]*)"|'([^'\n]*)')`)
		for _, m := range announcePat.FindAllStringSubmatch(jsContent, -1) {
			text := m[1]
			if text == "" {
				text = m[2]
			}
			if strings.TrimSpace(text) != "" {
				announcements = append(announcements, text)
			}
		}
	}

	return extractJummahFromAnnouncements(announcements), nil
}

// extractJummahFromAnnouncements pulls Jumu'ah session times out of displayed
// announcement strings. Announcements mentioning jumu'ah/jummah/friday are
// parsed for times; if none mention it, an announcement that is only times
// (e.g. RCA's ticker is just "13:00") is used as a fallback. Sessions are
// numbered in display order. Returns nil when no times are found, so callers
// keep existing data rather than deleting it.
func extractJummahFromAnnouncements(announcements []string) [][2]string {
	timePat := regexp.MustCompile(`(\d{1,2})[:.](\d{2})\s*([AaPp][Mm])?`)

	// toTime24 converts a match to HH:MM. Times without AM/PM are assumed to be
	// Jumu'ah-plausible: 24h values kept as-is, small hours shifted to afternoon.
	toTime24 := func(m []string) (string, bool) {
		hour, _ := strconv.Atoi(m[1])
		minute, _ := strconv.Atoi(m[2])
		if hour > 23 || minute > 59 {
			return "", false
		}
		switch strings.ToLower(m[3]) {
		case "pm":
			if hour < 12 {
				hour += 12
			}
		case "am":
			if hour == 12 {
				hour = 0
			}
		default:
			if hour >= 1 && hour <= 10 {
				hour += 12
			}
		}
		// Jumu'ah is always around midday — reject anything implausible
		// (guards the bare-times fallback against picking up random numbers)
		if hour < 11 || hour > 15 {
			return "", false
		}
		return fmt.Sprintf("%02d:%02d", hour, minute), true
	}

	keywordPat := regexp.MustCompile(`(?i)jum|friday`)
	var texts []string
	for _, a := range announcements {
		if keywordPat.MatchString(a) {
			texts = append(texts, a)
		}
	}
	if len(texts) == 0 {
		// Fallback: a ticker that is nothing but time(s), e.g. "13:00" or
		// "12:15pm , 1:15pm ,2:15pm"
		bareOnlyPat := regexp.MustCompile(`^[\s\d:.,&|APMapm-]+$`)
		for _, a := range announcements {
			if timePat.MatchString(a) && bareOnlyPat.MatchString(strings.TrimSpace(a)) {
				texts = append(texts, a)
			}
		}
	}

	var results [][2]string
	seen := map[string]bool{}
	for _, text := range texts {
		for _, m := range timePat.FindAllStringSubmatch(text, -1) {
			t24, ok := toTime24(m)
			if !ok || seen[t24] {
				continue
			}
			seen[t24] = true
			results = append(results, [2]string{fmt.Sprintf("%d", len(results)+1), t24})
		}
	}
	return results
}

// extractIqamaJSURL finds the iqamafixed.js script URL from a page's HTML.
func extractIqamaJSURL(html, baseURL string) string {
	re := regexp.MustCompile(`src=["']([^"']*iqamafixed[^"']*)["']`)
	m := re.FindStringSubmatch(html)
	if len(m) < 2 {
		return ""
	}
	jsPath := m[1]
	if strings.HasPrefix(jsPath, "http") {
		return jsPath
	}
	// Build absolute URL
	parts := strings.Split(strings.TrimSuffix(baseURL, "/"), "/")
	base := strings.Join(parts[:3], "/") // scheme + host
	if !strings.HasPrefix(jsPath, "/") {
		jsPath = "/" + jsPath
	}
	return base + jsPath
}

// parseJummahFromMasjidBox extracts Jumu'ah times from masjidbox.com pages.
// The REDUX_STATE JSON includes "jumuah":["ISO timestamp", ...] inside each timetable entry.
func (s *Scraper) parseJummahFromMasjidBox(ctx context.Context, masjidboxURL string) ([][2]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", masjidboxURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	html := string(body)

	re := regexp.MustCompile(`REDUX_STATE\s*=\s*'([^']+)'`)
	m := re.FindStringSubmatch(html)
	if len(m) < 2 {
		return nil, fmt.Errorf("masjidbox: REDUX_STATE not found")
	}

	jsUnicodeRe := regexp.MustCompile(`%u([0-9a-fA-F]{4})`)
	sanitized := jsUnicodeRe.ReplaceAllString(m[1], `\u$1`)
	decoded, err := url.PathUnescape(sanitized)
	if err != nil {
		return nil, fmt.Errorf("masjidbox: failed to decode REDUX_STATE: %w", err)
	}
	jsUnescapeRe := regexp.MustCompile(`\\u([0-9a-fA-F]{4})`)
	decoded = jsUnescapeRe.ReplaceAllStringFunc(decoded, func(s string) string {
		r, _ := strconv.ParseInt(s[2:], 16, 32)
		return string(rune(r))
	})

	// Extract jumuah array from the timetable — grab the first non-empty entry
	jumuahPat := regexp.MustCompile(`"jumuah"\s*:\s*\[([^\]]*)\]`)
	jumuahMatches := jumuahPat.FindAllStringSubmatch(decoded, -1)
	for _, jm := range jumuahMatches {
		inner := strings.TrimSpace(jm[1])
		if inner == "" {
			continue
		}
		// Extract ISO timestamp strings
		tsPat := regexp.MustCompile(`"([^"]+T[^"]+)"`)
		tsMatches := tsPat.FindAllStringSubmatch(inner, -1)
		if len(tsMatches) == 0 {
			continue
		}
		var results [][2]string
		for i, ts := range tsMatches {
			t, err := time.Parse(time.RFC3339, ts[1])
			if err != nil {
				continue
			}
			// Use UTC+10 (AEST) as the local timezone for masjidbox times
			loc, _ := time.LoadLocation("Australia/Melbourne")
			t24 := t.In(loc).Format("15:04")
			results = append(results, [2]string{fmt.Sprintf("%d", i+1), t24})
		}
		if len(results) > 0 {
			return results, nil
		}
	}
	return nil, nil
}

// parseJummahFromPGCC extracts Jumu'ah times from pgcc.org.au.
// The page contains elements like: "Jumu'ah 1" ... "12:30 PM" and "Jumu'ah 2" ... "1:45 PM"
func (s *Scraper) parseJummahFromPGCC(ctx context.Context, pageURL string) ([][2]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", pageURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", s.config.UserAgent)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	html := string(body)

	// PGCC pattern: "Jumu'ah 1<br><div class="jamuah"><div><span>12:30  PM</span>"
	// Strategy: find each "Jumu'ah \d" heading block (up to 400 chars) then pull the time from <span>.
	blockPat := regexp.MustCompile(`(?i)Jumu['']?ah\s*\d[\s\S]{0,400}?</h2>`)
	timePat := regexp.MustCompile(`(\d{1,2}:\d{2}\s*[AP]M)`)

	var results [][2]string
	blocks := blockPat.FindAllString(html, -1)
	if len(blocks) == 0 {
		// Fallback: look for any 12h time near a "jumu" keyword (plain text format)
		fallbackPat := regexp.MustCompile(`(?i)Jumu['']?ah[^<\d]{0,20}(\d{1,2}:\d{2}\s*[AP]M)`)
		fbMatches := fallbackPat.FindAllStringSubmatch(html, -1)
		for i, m := range fbMatches {
			t24, err := parseTime12or24(strings.TrimSpace(m[1]))
			if err != nil {
				continue
			}
			results = append(results, [2]string{fmt.Sprintf("%d", i+1), t24})
		}
		return results, nil
	}

	seen := map[string]bool{}
	session := 1
	for _, block := range blocks {
		tm := timePat.FindString(block)
		if tm == "" {
			continue
		}
		tm = regexp.MustCompile(`\s+`).ReplaceAllString(strings.TrimSpace(tm), " ")
		if seen[tm] {
			continue
		}
		seen[tm] = true
		t24, err := parseTime12or24(tm)
		if err != nil {
			continue
		}
		results = append(results, [2]string{fmt.Sprintf("%d", session), t24})
		session++
	}
	return results, nil
}

// parseJummahFromTheMasjidApp extracts Jumu'ah times from themasjidapp.org pages.
// The page renders a table row: <strong>Jumuah</strong></td><td ...>H:MM<span ...>AM|PM</span>
func (s *Scraper) parseJummahFromTheMasjidApp(ctx context.Context, pageURL string) ([][2]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", pageURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", s.config.UserAgent)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	html := string(body)

	// Match: Jumaah|Jumuah</...><td...>H:MM<span...>AM|PM</span>
	// ISV Preston uses "Jumaah" spelling; other sites use "Jumuah"
	pat := regexp.MustCompile(`(?i)Jum[au]ah[^<]*</[^>]+></td><td[^>]*>(\d{1,2}:\d{2})<span[^>]*>(AM|PM)</span>`)
	matches := pat.FindAllStringSubmatch(html, -1)

	var results [][2]string
	for i, m := range matches {
		timeStr := m[1] + " " + strings.ToUpper(m[2])
		t24, err := parseTime12or24(timeStr)
		if err != nil {
			continue
		}
		results = append(results, [2]string{fmt.Sprintf("%d", i+1), t24})
	}
	return results, nil
}

// parseJummahFromICV extracts Jumu'ah times from the ICV public JSON API.
// The API returns a "jummah_times" array with label/time pairs.
func (s *Scraper) parseJummahFromICV(ctx context.Context) ([][2]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://www.icv.org.au/api/prayer-times", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", s.config.UserAgent)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var apiResp struct {
		JummahTimes []struct {
			Label string `json:"label"`
			Time  string `json:"time"` // "HH:MM" 24h
		} `json:"jummah_times"`
	}
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("ICV: failed to parse jummah_times: %w", err)
	}

	var results [][2]string
	for i, jt := range apiResp.JummahTimes {
		// Validate it looks like a time
		if _, err := time.Parse("15:04", jt.Time); err != nil {
			continue
		}
		results = append(results, [2]string{fmt.Sprintf("%d", i+1), jt.Time})
	}
	return results, nil
}

// parseJummahFromMGM extracts Jumu'ah times from MGM's awqat.com.au page.
// The main HTML contains JS comments like: // MGM Jummah-1 => 12:30 pm
func (s *Scraper) parseJummahFromMGM(ctx context.Context, pageURL string) ([][2]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", pageURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", s.config.UserAgent)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	html := string(body)

	// Match: // MGM Jummah-N => H:MM pm
	pat := regexp.MustCompile(`(?i)Jummah[- ]\d+\s*=>\s*(\d{1,2}:\d{2}\s*[ap]m)`)
	matches := pat.FindAllStringSubmatch(html, -1)

	var results [][2]string
	for i, m := range matches {
		normalised := regexp.MustCompile(`(?i)\s*(AM|PM)$`).ReplaceAllStringFunc(strings.TrimSpace(m[1]), func(s string) string {
			return " " + strings.ToUpper(strings.TrimSpace(s))
		})
		t24, err := parseTime12or24(normalised)
		if err != nil {
			continue
		}
		results = append(results, [2]string{fmt.Sprintf("%d", i+1), t24})
	}
	return results, nil
}

// parseJummahFromAthanPlus extracts Jumu'ah times from an AthanPlus widget.
// The widget HTML contains a row with "Jumuah" text and a time column.
func (s *Scraper) parseJummahFromAthanPlus(ctx context.Context, masjidID string) ([][2]string, error) {
	widgetURL := fmt.Sprintf("https://timing.athanplus.com/masjid/widgets/embed?theme=1&masjid_id=%s", masjidID)
	req, err := http.NewRequestWithContext(ctx, "GET", widgetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}

	var results [][2]string
	doc.Find("tr").Each(func(i int, row *goquery.Selection) {
		tds := row.Find("td")
		if tds.Length() < 2 {
			return
		}
		name := strings.TrimSpace(tds.Eq(0).Text())
		if !strings.Contains(strings.ToLower(name), "jumuah") && !strings.Contains(strings.ToLower(name), "jumu") {
			return
		}
		timeStr := strings.Join(strings.Fields(tds.Eq(1).Text()), " ")
		t24, err := parseTime12or24(timeStr)
		if err != nil {
			return
		}
		results = append(results, [2]string{fmt.Sprintf("%d", len(results)+1), t24})
	})
	return results, nil
}

// parseJummahFromSunshineMosque extracts Jumu'ah times from sunshinemosque.com.au.
// The page contains text like "Friday Jummah Prayer ... 12.30 PM"
func (s *Scraper) parseJummahFromSunshineMosque(ctx context.Context, pageURL string) ([][2]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", pageURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	html := string(body)

	// The page structure is:
	//   <h2>Friday Jummah Prayer</h2><h2...>12.30 PM</h2>
	// The time is in the next <h2> after the "Jummah" heading, using dots: "12.30 PM"
	pat := regexp.MustCompile(`(?i)Friday Jummah Prayer</h2>\s*<h2[^>]*>\s*(\d{1,2}[.:]\d{2}\s*[AP]M)`)
	m := pat.FindStringSubmatch(html)
	if len(m) < 2 {
		return nil, nil
	}
	// Normalise dot-separated time: "12.30 PM" → "12:30 PM"
	timeStr := strings.ReplaceAll(m[1], ".", ":")
	timeStr = strings.Join(strings.Fields(timeStr), " ")
	t24, err := parseTime12or24(timeStr)
	if err != nil {
		return nil, nil
	}
	return [][2]string{{"1", t24}}, nil
}

// extractFromISV fetches prayer times for ISV (Preston Mosque) by loading their
// TheMasjidApp iframe directly at themasjidapp.org/128422/prayers.
func (s *Scraper) extractFromISV(ctx context.Context, timezone string) (*models.ScrapedPrayerTimes, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://themasjidapp.org/128422/prayers", nil)
	if err != nil {
		return nil, fmt.Errorf("isv: failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("isv: failed to fetch iframe: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("isv: failed to read response: %w", err)
	}

	return s.extractFromTheMasjidApp(string(body), timezone)
}

// masjidalAPIBase is the Masjidal API host and masjidalRetryDelay the pause
// before the single 5xx retry; vars so tests can use a httptest server and
// skip the wait.
var (
	masjidalAPIBase   = "https://masjidal.com"
	masjidalRetryDelay = 5 * time.Second
)

// masjidalIDPattern matches the masjid_id in a Masjidal/AthanPlus widget embed.
// Kept loose (no URL prefix) because e.g. iewad.org.au inlines the iframe URL
// inside a Next.js JS-chunk string rather than a plain attribute.
var masjidalIDPattern = regexp.MustCompile(`masjid_id=([A-Za-z0-9]{6,12})`)

// resolveMasjidalID maps a masjid site to its Masjidal masjid_id, or "" if the
// masjid is not on the Masjidal platform (masjidal.com screens/widgets, Athan+).
//
// Known IDs come from Masjidal's public directory —
// masjidal.com/api/v2/masjids?country=AU, snapshot in
// backend/data/masjidal_directory_au.json. PGCC and Emir Sultan run the
// Masjidal WordPress plugin server-side / a separate site, so their IDs never
// appear in their page HTML and must be pinned here. Sites that embed a
// visible widget are also auto-detected from html, so a masjid that adopts
// Masjidal later works without a code change.
func resolveMasjidalID(url, html string) string {
	switch {
	case strings.Contains(url, "iewad.org.au"):
		return "nDAg3WA0"
	case strings.Contains(url, "isomer.org.au"): // Lysterfield Mosque
		return "wLVO5pAJ"
	case strings.Contains(url, "aicom.com.au"): // Afghan Islamic Centre
		return "nzKzVnKO"
	case strings.Contains(url, "pgcc.org.au"): // Pillars of Guidance
		return "VKpDyyKP"
	case strings.Contains(url, "emirsultanmosque.com"): // ICMG Dandenong
		return "0AWqYBKj"
	}
	if strings.Contains(html, "athanplus.com") || strings.Contains(html, "masjidal.com") {
		if m := masjidalIDPattern.FindStringSubmatch(html); m != nil {
			return m[1]
		}
	}
	return ""
}

// masjidalTimeResponse is the payload of masjidal.com/api/v1/time. Invalid
// masjid IDs come back as HTTP 200 with status "error", so Status must be
// checked explicitly.
type masjidalTimeResponse struct {
	Status string `json:"status"`
	Data   struct {
		Date  string `json:"date"`
		Salah struct {
			Fajr    string `json:"fajr"`
			Sunrise string `json:"sunrise"`
			Zuhr    string `json:"zuhr"`
			Asr     string `json:"asr"`
			Maghrib string `json:"maghrib"`
			Isha    string `json:"isha"`
		} `json:"salah"`
		Iqama struct {
			Fajr    string `json:"fajr"`
			Zuhr    string `json:"zuhr"`
			Asr     string `json:"asr"`
			Maghrib string `json:"maghrib"`
			Isha    string `json:"isha"`
			Jummah1 string `json:"jummah1"`
			Jummah2 string `json:"jummah2"`
		} `json:"iqama"`
	} `json:"data"`
	Message json.RawMessage `json:"message"`
}

// fetchMasjidalTime fetches today's times for one masjid from the Masjidal
// API. The endpoint occasionally throws transient 5xx errors, so one retry
// after a short pause is built in.
func (s *Scraper) fetchMasjidalTime(ctx context.Context, masjidID string) (*masjidalTimeResponse, error) {
	apiURL := fmt.Sprintf("%s/api/v1/time?masjid_id=%s", masjidalAPIBase, masjidID)

	fetch := func() (*masjidalTimeResponse, int, error) {
		req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
		if err != nil {
			return nil, 0, err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
		resp, err := s.httpClient.Do(req)
		if err != nil {
			return nil, 0, err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, resp.StatusCode, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
		}
		var payload masjidalTimeResponse
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			return nil, resp.StatusCode, fmt.Errorf("failed to decode response: %w", err)
		}
		return &payload, resp.StatusCode, nil
	}

	payload, status, err := fetch()
	if err != nil && status >= 500 {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(masjidalRetryDelay):
		}
		payload, _, err = fetch()
	}
	if err != nil {
		return nil, fmt.Errorf("masjidal api: %w", err)
	}
	if payload.Status != "success" {
		return nil, fmt.Errorf("masjidal api: status %q (%s)", payload.Status, string(payload.Message))
	}
	return payload, nil
}

// extractFromMasjidalAPI fetches today's prayer times from the Masjidal JSON
// API — the same source the masjid's own widgets and the Athan+ app display.
func (s *Scraper) extractFromMasjidalAPI(ctx context.Context, masjidID, timezone string) (*models.ScrapedPrayerTimes, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	payload, err := s.fetchMasjidalTime(ctx, masjidID)
	if err != nil {
		return nil, err
	}

	pt := &models.ScrapedPrayerTimes{Date: today}
	// Times come as "5:59 AM" (occasionally with irregular spacing).
	parse := func(raw string) string {
		t24, err := parseTime12or24(strings.Join(strings.Fields(raw), " "))
		if err != nil {
			return ""
		}
		return t24
	}
	pt.Fajr = parse(payload.Data.Salah.Fajr)
	pt.Dhuhr = parse(payload.Data.Salah.Zuhr)
	pt.Asr = parse(payload.Data.Salah.Asr)
	pt.Maghrib = parse(payload.Data.Salah.Maghrib)
	pt.Isha = parse(payload.Data.Salah.Isha)
	pt.FajrIqama = parse(payload.Data.Iqama.Fajr)
	pt.DhuhrIqama = parse(payload.Data.Iqama.Zuhr)
	pt.AsrIqama = parse(payload.Data.Iqama.Asr)
	pt.MaghribIqama = parse(payload.Data.Iqama.Maghrib)
	pt.IshaIqama = parse(payload.Data.Iqama.Isha)

	if err := s.validatePrayerTimes(pt); err != nil {
		return nil, fmt.Errorf("masjidal api: %w", err)
	}
	return pt, nil
}

// parseJummahFromMasjidalAPI extracts Jumu'ah sessions from the Masjidal API.
// Sessions the masjid doesn't hold are returned by the API as "-", and some
// masjids fill both slots with the same time (Emir Sultan), so duplicates are
// collapsed to one session.
func (s *Scraper) parseJummahFromMasjidalAPI(ctx context.Context, masjidID string) ([][2]string, error) {
	payload, err := s.fetchMasjidalTime(ctx, masjidID)
	if err != nil {
		return nil, err
	}
	var results [][2]string
	seen := map[string]bool{}
	for _, raw := range []string{payload.Data.Iqama.Jummah1, payload.Data.Iqama.Jummah2} {
		t24, err := parseTime12or24(strings.Join(strings.Fields(raw), " "))
		if err != nil || seen[t24] {
			continue
		}
		seen[t24] = true
		results = append(results, [2]string{fmt.Sprintf("%d", len(results)+1), t24})
	}
	return results, nil
}

// extractFromAthanPlus fetches prayer times from the AthanPlus widget API.
// The widget embeds a weekly timetable in HTML; today's table is in #table_div_0
// (or whichever div is not display:none). Each prayer row:
//
//	<tr><td>PrayerName</td><td>H:MM AM</td><td><b>H:MM AM</b></td></tr>
//
// Column 2 = adhan (STARTS), column 3 = iqama (IQAMAH).
func (s *Scraper) extractFromAthanPlus(ctx context.Context, masjidID, timezone string) (*models.ScrapedPrayerTimes, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	widgetURL := fmt.Sprintf("https://timing.athanplus.com/masjid/widgets/embed?theme=1&masjid_id=%s", masjidID)
	req, err := http.NewRequestWithContext(ctx, "GET", widgetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("athanplus: failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("athanplus: failed to fetch widget: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("athanplus: failed to read response: %w", err)
	}
	html := string(body)

	// Use goquery to parse the HTML and find table_div_0, then iterate rows.
	// This avoids regex fragility with nested tags (<span><img>...PrayerName</span>)
	// and double spaces in times ("6:01  AM").
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return nil, fmt.Errorf("athanplus: failed to parse HTML: %w", err)
	}

	tableDiv := doc.Find("#table_div_0")
	if tableDiv.Length() == 0 {
		return nil, fmt.Errorf("athanplus: table_div_0 not found in HTML")
	}

	pt := &models.ScrapedPrayerTimes{Date: today}
	tableDiv.Find("tr").Each(func(_ int, row *goquery.Selection) {
		tds := row.Find("td")
		if tds.Length() < 3 {
			return
		}
		// Column 0: prayer name (may contain img/span, get text and strip non-alpha)
		rawName := strings.TrimSpace(tds.Eq(0).Text())
		// rawName may be something like "\nFajr\n" or "Fajr" or "Dhuhr" — keep only alpha chars
		name := strings.Map(func(r rune) rune {
			if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') {
				return r
			}
			return -1
		}, rawName)
		if name == "" {
			return
		}
		// Column 1: adhan time, column 2: iqama time
		// Times may have double spaces ("6:01  AM") — normalize whitespace
		adhanStr := strings.Join(strings.Fields(tds.Eq(1).Text()), " ")
		iqamaStr := strings.Join(strings.Fields(tds.Eq(2).Text()), " ")

		adhan, err := parseTime12or24(adhanStr)
		if err != nil {
			return
		}
		iqama, err := parseTime12or24(iqamaStr)
		if err != nil {
			return
		}
		switch strings.ToLower(name) {
		case "fajr":
			pt.Fajr = adhan
			pt.FajrIqama = iqama
		case "dhuhr", "zuhr":
			pt.Dhuhr = adhan
			pt.DhuhrIqama = iqama
		case "asr":
			pt.Asr = adhan
			pt.AsrIqama = iqama
		case "maghrib":
			pt.Maghrib = adhan
			pt.MaghribIqama = iqama
		case "isha":
			pt.Isha = adhan
			pt.IshaIqama = iqama
		}
	})

	if err := s.validatePrayerTimes(pt); err != nil {
		return nil, fmt.Errorf("athanplus: %w", err)
	}
	return pt, nil
}

// extractFromMasjidal extracts prayer times from the Masjidal WordPress plugin
// (used by aicom.com.au and similar sites). The plugin renders a slideshow of
// .mySlides_new divs — one per day. The first slide (count_1) is today.
// Each prayer row:
//
//	<li>
//	  <div class="image_and_text_namze"><span class="namze_name"> FAJR </span></div>
//	  <div class="time_namze"><span>6:02 AM</span><span class="text-center">6:45 AM</span></div>
//	</li>
//
// First span = STARTS (adhan), second span = IQAMAH.
func (s *Scraper) extractFromMasjidal(html, timezone string) (*models.ScrapedPrayerTimes, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return nil, fmt.Errorf("masjidal: failed to parse HTML: %w", err)
	}

	// First .mySlides_new div = today's slide
	slide := doc.Find(".mySlides_new").First()
	if slide.Length() == 0 {
		return nil, fmt.Errorf("masjidal: no .mySlides_new found")
	}

	pt := &models.ScrapedPrayerTimes{Date: today}

	slide.Find("li").Each(func(_ int, li *goquery.Selection) {
		name := strings.TrimSpace(li.Find(".namze_name").Text())
		if name == "" {
			return
		}

		spans := li.Find(".time_namze span")
		if spans.Length() < 1 {
			return
		}

		adhanRaw := strings.TrimSpace(spans.Eq(0).Text())
		adhan, err := parseTime12or24(adhanRaw)
		if err != nil {
			return
		}

		var iqama string
		if spans.Length() >= 2 {
			iqamaRaw := strings.TrimSpace(spans.Eq(1).Text())
			if v, e := parseTime12or24(iqamaRaw); e == nil {
				iqama = v
			}
		}

		switch strings.ToLower(name) {
		case "fajr":
			pt.Fajr = adhan
			pt.FajrIqama = iqama
		case "dhuhr", "zuhr":
			pt.Dhuhr = adhan
			pt.DhuhrIqama = iqama
		case "asr":
			pt.Asr = adhan
			pt.AsrIqama = iqama
		case "maghrib":
			pt.Maghrib = adhan
			pt.MaghribIqama = iqama
		case "isha":
			pt.Isha = adhan
			pt.IshaIqama = iqama
		}
	})

	if err := s.validatePrayerTimes(pt); err != nil {
		return nil, fmt.Errorf("masjidal: %w", err)
	}
	return pt, nil
}

// alAdhanCoords maps masjid URL substrings to their GPS coordinates for AlAdhan lookups.
// AlAdhan is a GPS calculation of last resort — only for sites with no readable
// published schedule. isomer.org.au (Lysterfield) moved to its real AthanPlus
// widget; sunshinemosque.com.au was deactivated (see masjids.is_active).
var alAdhanCoords = map[string][2]float64{
	"umis.com.au": {-37.8136, 144.9631}, // Melbourne CBD
}

// extractFromAlAdhan fetches prayer times from the AlAdhan public API using GPS
// coordinates. Used for sites that render prayer times via JavaScript widgets
// (MuslimPro, IslamicFinder) which cannot be scraped as static HTML.
// Only adhan times are available — no iqama data from this source.
func (s *Scraper) extractFromAlAdhan(ctx context.Context, masjidURL, timezone string) (*models.ScrapedPrayerTimes, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	var lat, lon float64
	for key, coords := range alAdhanCoords {
		if strings.Contains(masjidURL, key) {
			lat, lon = coords[0], coords[1]
			break
		}
	}
	if lat == 0 && lon == 0 {
		return nil, fmt.Errorf("aladhan: no coordinates configured for %s", masjidURL)
	}

	apiURL := fmt.Sprintf(
		"https://api.aladhan.com/v1/timings/%d?latitude=%f&longitude=%f&method=3",
		now.Unix(), lat, lon,
	)
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aladhan: failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", s.config.UserAgent)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aladhan: failed to fetch API: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("aladhan: failed to read response: %w", err)
	}

	var apiResp struct {
		Code int `json:"code"`
		Data struct {
			Timings struct {
				Fajr    string `json:"Fajr"`
				Dhuhr   string `json:"Dhuhr"`
				Asr     string `json:"Asr"`
				Maghrib string `json:"Maghrib"`
				Isha    string `json:"Isha"`
			} `json:"timings"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("aladhan: failed to parse JSON: %w", err)
	}
	if apiResp.Code != 200 {
		return nil, fmt.Errorf("aladhan: API returned code %d", apiResp.Code)
	}

	t := apiResp.Data.Timings
	fajr, err := parseTime12or24(t.Fajr)
	if err != nil {
		return nil, fmt.Errorf("aladhan: invalid fajr: %w", err)
	}
	dhuhr, err := parseTime12or24(t.Dhuhr)
	if err != nil {
		return nil, fmt.Errorf("aladhan: invalid dhuhr: %w", err)
	}
	asr, err := parseTime12or24(t.Asr)
	if err != nil {
		return nil, fmt.Errorf("aladhan: invalid asr: %w", err)
	}
	maghrib, err := parseTime12or24(t.Maghrib)
	if err != nil {
		return nil, fmt.Errorf("aladhan: invalid maghrib: %w", err)
	}
	isha, err := parseTime12or24(t.Isha)
	if err != nil {
		return nil, fmt.Errorf("aladhan: invalid isha: %w", err)
	}

	pt := &models.ScrapedPrayerTimes{
		Date:    today,
		Fajr:    fajr,
		Dhuhr:   dhuhr,
		Asr:     asr,
		Maghrib: maghrib,
		Isha:    isha,
		// No iqama data available from AlAdhan
	}

	if err := s.validatePrayerTimes(pt); err != nil {
		return nil, fmt.Errorf("aladhan: %w", err)
	}
	return pt, nil
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
