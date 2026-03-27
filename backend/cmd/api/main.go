package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"prayer-times-api/internal/config"
	"prayer-times-api/internal/database"
	"prayer-times-api/internal/handlers"
	"prayer-times-api/internal/repository"
	"prayer-times-api/internal/router"
	"prayer-times-api/internal/scraper"
	"prayer-times-api/internal/services"
	"prayer-times-api/internal/worker"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	if err := cfg.Validate(); err != nil {
		log.Fatalf("Configuration validation failed: %v", err)
	}

	// Set Gin mode
	gin.SetMode(cfg.Server.GinMode)

	// Connect to database
	db, err := database.Connect(cfg.Database.URL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("Database connection established")

	// Initialize repositories
	masjidRepo := repository.NewMasjidRepository(db)
	prayerTimesRepo := repository.NewPrayerTimesRepository(db)
	deviceTokenRepo := repository.NewDeviceTokenRepository(db)
	logRepo := repository.NewLogRepository(db)
	iqamaRepo := repository.NewIqamaRepository(db)

	// Initialize services
	scraperSvc := scraper.NewScraper(&cfg.Scraper)
	notificationSvc, err := services.NewNotificationService(cfg, deviceTokenRepo, prayerTimesRepo, masjidRepo)
	if err != nil {
		log.Fatalf("Failed to initialize notification service: %v", err)
	}

	prayerSvc := services.NewPrayerService(scraperSvc, masjidRepo, prayerTimesRepo, logRepo, notificationSvc)

	// Initialize handlers
	masjidHandler := handlers.NewMasjidHandler(masjidRepo, prayerSvc)
	prayerTimesHandler := handlers.NewPrayerTimesHandler(prayerTimesRepo, masjidRepo, iqamaRepo)
	deviceHandler := handlers.NewDeviceHandler(deviceTokenRepo)
	scrapeHandler := handlers.NewScrapeHandler(prayerSvc, masjidRepo)

	// Setup routes
	appRouter := router.NewRouter(masjidHandler, prayerTimesHandler, deviceHandler, scrapeHandler)
	engine := appRouter.Setup()

	// Initialize background worker
	bgWorker := worker.NewWorker(prayerSvc, "Australia/Melbourne")
	if err := bgWorker.Start(); err != nil {
		log.Fatalf("Failed to start background worker: %v", err)
	}
	defer bgWorker.Stop()

	// Startup check: ensure prayer times exist for today
	// Run asynchronously to not block server startup
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		defer cancel()

		log.Println("🔍 Checking if prayer times exist for today...")

		// Get all masjids
		masjids, err := masjidRepo.GetAll(ctx)
		if err != nil {
			log.Printf("❌ Startup check failed to get masjids: %v", err)
			return
		}

		if len(masjids) == 0 {
			log.Println("ℹ️  No masjids in database, skipping startup scrape")
			return
		}

		// Check if any masjid has today's prayer times
		hasData := false
		today := time.Now()
		for _, masjid := range masjids {
			_, err := prayerTimesRepo.GetByMasjidAndDate(ctx, masjid.ID, today)
			if err == nil {
				hasData = true
				break
			}
		}

		if hasData {
			log.Println("✅ Prayer times already exist for today")
			return
		}

		// No data for today - trigger scrape
		log.Printf("🔄 No prayer times for today, triggering startup scrape for %d masjids...", len(masjids))
		if err := prayerSvc.FetchAndUpdateAllMasjids(ctx); err != nil {
			log.Printf("❌ Startup scrape failed: %v", err)
		} else {
			log.Println("✅ Startup scrape completed successfully")
		}
	}()

	// Create HTTP server
	server := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      engine,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		log.Printf("Starting server on port %s...", cfg.Server.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	log.Println("Server started successfully")
	log.Printf("API available at http://localhost:%s", cfg.Server.Port)
	log.Printf("Health check: http://localhost:%s/health", cfg.Server.Port)

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server stopped gracefully")
}
