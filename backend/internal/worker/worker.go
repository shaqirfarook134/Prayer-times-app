package worker

import (
	"context"
	"fmt"
	"log"
	"prayer-times-api/internal/services"
	"time"

	"github.com/robfig/cron/v3"
)

type Worker struct {
	cron         *cron.Cron
	prayerSvc    *services.PrayerService
	timezone     string
}

func NewWorker(prayerSvc *services.PrayerService, timezone string) *Worker {
	// Create cron with timezone support
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		log.Fatalf("Invalid timezone %s: %v", timezone, err)
	}

	return &Worker{
		cron:      cron.New(cron.WithLocation(loc)),
		prayerSvc: prayerSvc,
		timezone:  timezone,
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

	// Start the cron scheduler
	w.cron.Start()
	log.Printf("Worker started with timezone: %s", w.timezone)
	log.Println("Scheduled jobs:")
	log.Println("  - Hourly update: 0 * * * *")
	log.Println("  - Daily refresh: 5 0 * * *")

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
