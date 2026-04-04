package worker

import (
	"context"
	"fmt"
	"log"
	"prayer-times-api/internal/repository"
	"prayer-times-api/internal/services"
	"time"

	"github.com/robfig/cron/v3"
)

type Worker struct {
	cron            *cron.Cron
	prayerSvc       *services.PrayerService
	prayerTimesRepo *repository.PrayerTimesRepository
	masjidRepo      *repository.MasjidRepository
	alertSvc        *services.AlertService
	timezone        string
}

func NewWorker(prayerSvc *services.PrayerService, prayerTimesRepo *repository.PrayerTimesRepository, masjidRepo *repository.MasjidRepository, alertSvc *services.AlertService, timezone string) *Worker {
	// Create cron with timezone support
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		log.Fatalf("Invalid timezone %s: %v", timezone, err)
	}

	return &Worker{
		cron:            cron.New(cron.WithLocation(loc)),
		prayerSvc:       prayerSvc,
		prayerTimesRepo: prayerTimesRepo,
		masjidRepo:      masjidRepo,
		alertSvc:        alertSvc,
		timezone:        timezone,
	}
}

// Start begins the background worker
func (w *Worker) Start() error {
	// Schedule hourly prayer time updates
	// Runs every 60 minutes
	_, err := w.cron.AddFunc("0 * * * *", func() {
		log.Println("Starting hourly prayer times update...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()

		if err := w.prayerSvc.FetchAndUpdateAllMasjids(ctx); err != nil {
			log.Printf("Hourly update failed: %v", err)
		} else {
			log.Println("Hourly update completed successfully")
		}
	})
	if err != nil {
		return fmt.Errorf("failed to schedule hourly job: %w", err)
	}

	// Schedule daily forced refresh at 00:05 Australia/Melbourne
	// This ensures new day's prayer times are captured
	_, err = w.cron.AddFunc("5 0 * * *", func() {
		log.Println("Starting daily forced refresh...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()

		if err := w.prayerSvc.FetchAndUpdateAllMasjids(ctx); err != nil {
			log.Printf("Daily refresh failed: %v", err)
		} else {
			log.Println("Daily refresh completed successfully")
		}
	})
	if err != nil {
		return fmt.Errorf("failed to schedule daily job: %w", err)
	}

	// 6 AM health-check: verify all masjids have today's data, alert if missing
	_, err = w.cron.AddFunc("0 6 * * *", func() {
		log.Println("Starting 6 AM health check...")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		loc, _ := time.LoadLocation(w.timezone)
		now := time.Now().In(loc)
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

		masjids, err := w.masjidRepo.GetAll(ctx)
		if err != nil {
			log.Printf("Health check: failed to get masjids: %v", err)
			return
		}

		allHealthy := true
		for _, masjid := range masjids {
			_, err := w.prayerTimesRepo.GetByMasjidAndDate(ctx, masjid.ID, today)
			if err != nil {
				allHealthy = false
				log.Printf("⚠️  Health check: missing prayer times for %s (ID: %d)", masjid.Name, masjid.ID)
				// Try to fix it
				if scrapeErr := w.prayerSvc.FetchAndUpdateAllMasjids(ctx); scrapeErr != nil {
					if w.alertSvc != nil {
						w.alertSvc.SendAlert(
							fmt.Sprintf("🚨 Missing prayer times: %s", masjid.Name),
							fmt.Sprintf("6 AM health check found missing prayer times for %s (ID: %d, %s %s) and auto-scrape also failed.\n\nScrape error: %v\n\nUsers are seeing the cached data banner.\n\nManual fix: POST https://prayer-times-api-uddr.onrender.com/api/v1/admin/scrape",
								masjid.Name, masjid.ID, masjid.City, masjid.State, scrapeErr),
						)
					}
				} else {
					log.Printf("✅ Health check: auto-fixed missing prayer times for %s", masjid.Name)
				}
				break
			}
		}

		if allHealthy {
			log.Println("✅ Health check passed — all masjids have today's prayer times")
		}
	})
	if err != nil {
		return fmt.Errorf("failed to schedule health check job: %w", err)
	}

	// Start the cron scheduler
	w.cron.Start()
	log.Printf("Worker started with timezone: %s", w.timezone)
	log.Println("Scheduled jobs:")
	log.Println("  - Hourly update: 0 * * * *")
	log.Println("  - Daily refresh: 5 0 * * *")
	log.Println("  - 6 AM health check: 0 6 * * *")

	return nil
}

// Stop gracefully stops the worker
func (w *Worker) Stop() {
	log.Println("Stopping worker...")
	ctx := w.cron.Stop()
	<-ctx.Done()
	log.Println("Worker stopped")
}

// RunNow triggers an immediate update (useful for testing/admin)
func (w *Worker) RunNow() error {
	log.Println("Running immediate prayer times update...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	if err := w.prayerSvc.FetchAndUpdateAllMasjids(ctx); err != nil {
		return fmt.Errorf("immediate update failed: %w", err)
	}

	log.Println("Immediate update completed successfully")
	return nil
}
