package repository

import (
	"context"
	"fmt"
	"prayer-times-api/internal/database"
	"prayer-times-api/internal/models"
)

type JummahRepository struct {
	db *database.DB
}

func NewJummahRepository(db *database.DB) *JummahRepository {
	return &JummahRepository{db: db}
}

// Upsert inserts or updates a Jummah session time for a masjid.
func (r *JummahRepository) Upsert(ctx context.Context, masjidID, session int, timeStr string) error {
	query := `
		INSERT INTO jummah_times (masjid_id, session, time, last_updated)
		VALUES ($1, $2, $3::time, NOW())
		ON CONFLICT (masjid_id, session)
		DO UPDATE SET time = EXCLUDED.time, last_updated = NOW()
	`
	_, err := r.db.Pool.Exec(ctx, query, masjidID, session, timeStr)
	if err != nil {
		return fmt.Errorf("failed to upsert jummah time: %w", err)
	}
	return nil
}

// GetByMasjid returns all Jummah sessions for a masjid, ordered by session number.
func (r *JummahRepository) GetByMasjid(ctx context.Context, masjidID int) ([]models.JummahSession, error) {
	query := `
		SELECT session, to_char(time, 'HH24:MI')
		FROM jummah_times
		WHERE masjid_id = $1
		ORDER BY session
	`
	rows, err := r.db.Pool.Query(ctx, query, masjidID)
	if err != nil {
		return nil, fmt.Errorf("failed to get jummah times: %w", err)
	}
	defer rows.Close()

	var sessions []models.JummahSession
	for rows.Next() {
		var s models.JummahSession
		var time24 string
		if err := rows.Scan(&s.Session, &time24); err != nil {
			return nil, fmt.Errorf("failed to scan jummah row: %w", err)
		}
		s.Time = time24
		s.Time12 = to12Hour(time24)
		sessions = append(sessions, s)
	}
	return sessions, nil
}

// DeleteByMasjid removes all Jummah sessions for a masjid (used before re-inserting scraped data).
func (r *JummahRepository) DeleteByMasjid(ctx context.Context, masjidID int) error {
	_, err := r.db.Pool.Exec(ctx, `DELETE FROM jummah_times WHERE masjid_id = $1`, masjidID)
	return err
}

// to12Hour converts "HH:MM" (24h) to "H:MM AM/PM" (12h).
func to12Hour(hhmm string) string {
	var h, m int
	fmt.Sscanf(hhmm, "%d:%d", &h, &m)
	suffix := "AM"
	if h >= 12 {
		suffix = "PM"
	}
	if h == 0 {
		h = 12
	} else if h > 12 {
		h -= 12
	}
	return fmt.Sprintf("%d:%02d %s", h, m, suffix)
}
