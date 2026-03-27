package repository

import (
	"context"
	"fmt"
	"prayer-times-api/internal/database"
)

type IqamaRepository struct {
	db *database.DB
}

func NewIqamaRepository(db *database.DB) *IqamaRepository {
	return &IqamaRepository{db: db}
}

// GetByMasjid retrieves all iqama configurations for a masjid
func (r *IqamaRepository) GetByMasjid(ctx context.Context, masjidID int) (map[string]int, error) {
	query := `
		SELECT prayer_name, iqama_offset
		FROM iqama_config
		WHERE masjid_id = $1
	`

	rows, err := r.db.Pool.Query(ctx, query, masjidID)
	if err != nil {
		return nil, fmt.Errorf("failed to query iqama config: %w", err)
	}
	defer rows.Close()

	offsets := make(map[string]int)
	for rows.Next() {
		var prayerName string
		var offset int
		if err := rows.Scan(&prayerName, &offset); err != nil {
			return nil, fmt.Errorf("failed to scan iqama config: %w", err)
		}
		offsets[prayerName] = offset
	}

	// Return default 20 minutes if no config found
	if len(offsets) == 0 {
		return map[string]int{
			"fajr":    20,
			"dhuhr":   20,
			"asr":     20,
			"maghrib": 20,
			"isha":    20,
		}, nil
	}

	return offsets, nil
}
