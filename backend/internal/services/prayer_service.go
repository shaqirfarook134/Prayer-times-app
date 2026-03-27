package services

import (
	"context"
	"fmt"
	"prayer-times-api/internal/models"
	"prayer-times-api/internal/repository"
	"prayer-times-api/internal/scraper"
	"time"
)

type PrayerService struct {
	scraperSvc      *scraper.Scraper
	masjidRepo      *repository.MasjidRepository
	prayerTimesRepo *repository.PrayerTimesRepository
	logRepo         *repository.LogRepository
	notificationSvc *NotificationService
}

func NewPrayerService(
	scraperSvc *scraper.Scraper,
	masjidRepo *repository.MasjidRepository,
	prayerTimesRepo *repository.PrayerTimesRepository,
	logRepo *repository.LogRepository,
	notificationSvc *NotificationService,
) *PrayerService {
	return &PrayerService{
		scraperSvc:      scraperSvc,
		masjidRepo:      masjidRepo,
		prayerTimesRepo: prayerTimesRepo,
		logRepo:         logRepo,
		notificationSvc: notificationSvc,
	}
}

// FetchAndUpdateAllMasjids fetches prayer times for all masjids
func (s *PrayerService) FetchAndUpdateAllMasjids(ctx context.Context) error {
	masjids, err := s.masjidRepo.GetAll(ctx)
	if err != nil {
		return fmt.Errorf("failed to get masjids: %w", err)
	}

	for _, masjid := range masjids {
		if err := s.FetchAndUpdateMasjid(ctx, &masjid); err != nil {
			// Log error but continue with other masjids
			_ = s.logRepo.LogWithMetadata(ctx, &masjid.ID, "error",
				fmt.Sprintf("Failed to update prayer times: %v", err), nil)
		}
	}

	return nil
}

// FetchAndUpdateMasjid fetches and updates prayer times for a single masjid
func (s *PrayerService) FetchAndUpdateMasjid(ctx context.Context, masjid *models.Masjid) error {
	// Fetch prayer times from website
	scrapedTimes, err := s.scraperSvc.FetchPrayerTimes(ctx, masjid.URL, masjid.Timezone)
	if err != nil {
		return fmt.Errorf("scraping failed: %w", err)
	}

	// Check if prayer times have changed
	changed, err := s.prayerTimesRepo.CheckIfChanged(ctx, masjid.ID, scrapedTimes.Date, scrapedTimes)
	if err != nil {
		// If error (e.g., no existing record), proceed with insert
		changed = true
	}

	if !changed {
		// No change detected, skip update
		_ = s.logRepo.LogWithMetadata(ctx, &masjid.ID, "info",
			"Prayer times unchanged", map[string]interface{}{
				"date": scrapedTimes.Date.Format("2006-01-02"),
			})
		return nil
	}

	// Validate against previous day's times (safety check)
	yesterday := scrapedTimes.Date.AddDate(0, 0, -1)
	previousTimes, err := s.prayerTimesRepo.GetByMasjidAndDate(ctx, masjid.ID, yesterday)
	if err == nil {
		// Previous times exist, validate change magnitude
		newTimes := &models.PrayerTimes{
			Fajr:    scrapedTimes.Fajr,
			Dhuhr:   scrapedTimes.Dhuhr,
			Asr:     scrapedTimes.Asr,
			Maghrib: scrapedTimes.Maghrib,
			Isha:    scrapedTimes.Isha,
		}

		if err := s.scraperSvc.ValidateChange(previousTimes, newTimes); err != nil {
			// Log suspicious change but don't fail
			_ = s.logRepo.LogWithMetadata(ctx, &masjid.ID, "warning",
				fmt.Sprintf("Suspicious prayer time change detected: %v", err), map[string]interface{}{
					"old_fajr": previousTimes.Fajr,
					"new_fajr": scrapedTimes.Fajr,
				})
		}
	}

	// Update database
	prayerTimes := &models.PrayerTimes{
		MasjidID:     masjid.ID,
		Date:         scrapedTimes.Date,
		Fajr:         scrapedTimes.Fajr,
		Dhuhr:        scrapedTimes.Dhuhr,
		Asr:          scrapedTimes.Asr,
		Maghrib:      scrapedTimes.Maghrib,
		Isha:         scrapedTimes.Isha,
		FajrIqama:    scrapedTimes.FajrIqama,
		DhuhrIqama:   scrapedTimes.DhuhrIqama,
		AsrIqama:     scrapedTimes.AsrIqama,
		MaghribIqama: scrapedTimes.MaghribIqama,
		IshaIqama:    scrapedTimes.IshaIqama,
	}

	if err := s.prayerTimesRepo.Upsert(ctx, prayerTimes); err != nil {
		return fmt.Errorf("database update failed: %w", err)
	}

	// Log success
	_ = s.logRepo.LogWithMetadata(ctx, &masjid.ID, "success",
		"Prayer times updated successfully", map[string]interface{}{
			"date":    scrapedTimes.Date.Format("2006-01-02"),
			"changed": changed,
		})

	// Schedule/update notifications for this masjid
	if s.notificationSvc != nil {
		if err := s.notificationSvc.ScheduleNotificationsForMasjid(ctx, masjid.ID); err != nil {
			// Log error but don't fail the update
			_ = s.logRepo.LogWithMetadata(ctx, &masjid.ID, "warning",
				fmt.Sprintf("Failed to schedule notifications: %v", err), nil)
		}
	}

	return nil
}

// FetchUpcomingPrayerTimes gets prayer times for the next N days
func (s *PrayerService) FetchUpcomingPrayerTimes(ctx context.Context, masjidID int, days int) ([]models.PrayerTimes, error) {
	masjid, err := s.masjidRepo.GetByID(ctx, masjidID)
	if err != nil {
		return nil, fmt.Errorf("masjid not found: %w", err)
	}

	loc, err := time.LoadLocation(masjid.Timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}

	today := time.Now().In(loc).Truncate(24 * time.Hour)

	return s.prayerTimesRepo.GetUpcoming(ctx, masjidID, today, days)
}
