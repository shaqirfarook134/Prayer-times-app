package repository

import (
	"context"
	"fmt"
	"prayer-times-api/internal/database"
	"prayer-times-api/internal/models"
	"time"
)

type PrayerTimesRepository struct {
	db *database.DB
}

func NewPrayerTimesRepository(db *database.DB) *PrayerTimesRepository {
	return &PrayerTimesRepository{db: db}
}

// GetByMasjidAndDate retrieves prayer times for a specific masjid and date
func (r *PrayerTimesRepository) GetByMasjidAndDate(ctx context.Context, masjidID int, date time.Time) (*models.PrayerTimes, error) {
	query := `
		SELECT id, masjid_id, date, fajr, dhuhr, asr, maghrib, isha,
		       fajr_iqama, dhuhr_iqama, asr_iqama, maghrib_iqama, isha_iqama,
		       last_updated, created_at
		FROM prayer_times
		WHERE masjid_id = $1 AND date = $2
	`

	var pt models.PrayerTimes
	err := r.db.Pool.QueryRow(ctx, query, masjidID, date).Scan(
		&pt.ID, &pt.MasjidID, &pt.Date, &pt.Fajr, &pt.Dhuhr,
		&pt.Asr, &pt.Maghrib, &pt.Isha,
		&pt.FajrIqama, &pt.DhuhrIqama, &pt.AsrIqama, &pt.MaghribIqama, &pt.IshaIqama,
		&pt.LastUpdated, &pt.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get prayer times: %w", err)
	}

	return &pt, nil
}

// GetTodayByMasjid retrieves today's prayer times for a masjid
func (r *PrayerTimesRepository) GetTodayByMasjid(ctx context.Context, masjidID int, timezone string) (*models.PrayerTimes, error) {
	// Get current date in masjid's timezone
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone: %w", err)
	}

	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	return r.GetByMasjidAndDate(ctx, masjidID, today)
}

// Upsert inserts or updates prayer times
func (r *PrayerTimesRepository) Upsert(ctx context.Context, pt *models.PrayerTimes) error {
	query := `
		INSERT INTO prayer_times (masjid_id, date, fajr, dhuhr, asr, maghrib, isha,
		                          fajr_iqama, dhuhr_iqama, asr_iqama, maghrib_iqama, isha_iqama,
		                          last_updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
		ON CONFLICT (masjid_id, date)
		DO UPDATE SET
			fajr = EXCLUDED.fajr,
			dhuhr = EXCLUDED.dhuhr,
			asr = EXCLUDED.asr,
			maghrib = EXCLUDED.maghrib,
			isha = EXCLUDED.isha,
			fajr_iqama = EXCLUDED.fajr_iqama,
			dhuhr_iqama = EXCLUDED.dhuhr_iqama,
			asr_iqama = EXCLUDED.asr_iqama,
			maghrib_iqama = EXCLUDED.maghrib_iqama,
			isha_iqama = EXCLUDED.isha_iqama,
			last_updated = CURRENT_TIMESTAMP
		RETURNING id, last_updated, created_at
	`

	err := r.db.Pool.QueryRow(
		ctx, query,
		pt.MasjidID, pt.Date, pt.Fajr, pt.Dhuhr, pt.Asr, pt.Maghrib, pt.Isha,
		pt.FajrIqama, pt.DhuhrIqama, pt.AsrIqama, pt.MaghribIqama, pt.IshaIqama,
	).Scan(&pt.ID, &pt.LastUpdated, &pt.CreatedAt)

	if err != nil {
		return fmt.Errorf("failed to upsert prayer times: %w", err)
	}

	return nil
}

// CheckIfChanged compares new prayer times with existing ones
func (r *PrayerTimesRepository) CheckIfChanged(ctx context.Context, masjidID int, date time.Time, newTimes *models.ScrapedPrayerTimes) (bool, error) {
	existing, err := r.GetByMasjidAndDate(ctx, masjidID, date)
	if err != nil {
		// If not found, it's a new entry (changed)
		return true, nil
	}

	// Compare times
	changed := existing.Fajr != newTimes.Fajr ||
		existing.Dhuhr != newTimes.Dhuhr ||
		existing.Asr != newTimes.Asr ||
		existing.Maghrib != newTimes.Maghrib ||
		existing.Isha != newTimes.Isha

	return changed, nil
}

// GetUpcoming retrieves upcoming prayer times for a masjid (for notification scheduling)
func (r *PrayerTimesRepository) GetUpcoming(ctx context.Context, masjidID int, fromDate time.Time, days int) ([]models.PrayerTimes, error) {
	query := `
		SELECT id, masjid_id, date, fajr, dhuhr, asr, maghrib, isha,
		       fajr_iqama, dhuhr_iqama, asr_iqama, maghrib_iqama, isha_iqama,
		       last_updated, created_at
		FROM prayer_times
		WHERE masjid_id = $1 AND date >= $2 AND date < $3
		ORDER BY date ASC
	`

	toDate := fromDate.AddDate(0, 0, days)

	rows, err := r.db.Pool.Query(ctx, query, masjidID, fromDate, toDate)
	if err != nil {
		return nil, fmt.Errorf("failed to query upcoming prayer times: %w", err)
	}
	defer rows.Close()

	var prayerTimes []models.PrayerTimes
	for rows.Next() {
		var pt models.PrayerTimes
		err := rows.Scan(
			&pt.ID, &pt.MasjidID, &pt.Date, &pt.Fajr, &pt.Dhuhr,
			&pt.Asr, &pt.Maghrib, &pt.Isha,
			&pt.FajrIqama, &pt.DhuhrIqama, &pt.AsrIqama, &pt.MaghribIqama, &pt.IshaIqama,
			&pt.LastUpdated, &pt.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan prayer times: %w", err)
		}
		prayerTimes = append(prayerTimes, pt)
	}

	return prayerTimes, nil
}
