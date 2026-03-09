package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Database DatabaseConfig
	Server   ServerConfig
	FCM      FCMConfig
	APNS     APNSConfig
	Scraper  ScraperConfig
}

type DatabaseConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	URL      string
}

type ServerConfig struct {
	Port        string
	Environment string
	GinMode     string
}

type FCMConfig struct {
	ServerKey string
}

type APNSConfig struct {
	AuthKeyPath string
	KeyID       string
	TeamID      string
	Topic       string
	Production  bool
}

type ScraperConfig struct {
	UserAgent   string
	Timeout     int
	MaxRetries  int
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	// Load .env file if exists (development)
	_ = godotenv.Load()

	dbPort, err := strconv.Atoi(getEnv("DB_PORT", "5432"))
	if err != nil {
		return nil, fmt.Errorf("invalid DB_PORT: %w", err)
	}

	scraperTimeout, err := strconv.Atoi(getEnv("SCRAPER_TIMEOUT_SECONDS", "10"))
	if err != nil {
		return nil, fmt.Errorf("invalid SCRAPER_TIMEOUT_SECONDS: %w", err)
	}

	scraperRetries, err := strconv.Atoi(getEnv("SCRAPER_MAX_RETRIES", "3"))
	if err != nil {
		return nil, fmt.Errorf("invalid SCRAPER_MAX_RETRIES: %w", err)
	}

	apnsProduction, err := strconv.ParseBool(getEnv("APNS_PRODUCTION", "false"))
	if err != nil {
		return nil, fmt.Errorf("invalid APNS_PRODUCTION: %w", err)
	}

	cfg := &Config{
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     dbPort,
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", ""),
			DBName:   getEnv("DB_NAME", "prayer_times_db"),
			URL:      getEnv("DATABASE_URL", ""),
		},
		Server: ServerConfig{
			Port:        getEnv("PORT", "8080"),
			Environment: getEnv("ENVIRONMENT", "development"),
			GinMode:     getEnv("GIN_MODE", "debug"),
		},
		FCM: FCMConfig{
			ServerKey: getEnv("FCM_SERVER_KEY", ""),
		},
		APNS: APNSConfig{
			AuthKeyPath: getEnv("APNS_AUTH_KEY_PATH", ""),
			KeyID:       getEnv("APNS_KEY_ID", ""),
			TeamID:      getEnv("APNS_TEAM_ID", ""),
			Topic:       getEnv("APNS_TOPIC", ""),
			Production:  apnsProduction,
		},
		Scraper: ScraperConfig{
			UserAgent:  getEnv("SCRAPER_USER_AGENT", "Mozilla/5.0 (compatible; PrayerTimesBot/1.0)"),
			Timeout:    scraperTimeout,
			MaxRetries: scraperRetries,
		},
	}

	// Build DATABASE_URL if not provided
	if cfg.Database.URL == "" {
		cfg.Database.URL = fmt.Sprintf(
			"postgres://%s:%s@%s:%d/%s?sslmode=disable",
			cfg.Database.User,
			cfg.Database.Password,
			cfg.Database.Host,
			cfg.Database.Port,
			cfg.Database.DBName,
		)
	}

	return cfg, nil
}

// Validate checks if required configuration is present
func (c *Config) Validate() error {
	if c.Database.URL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	return nil
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
