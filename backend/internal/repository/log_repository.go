package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"prayer-times-api/internal/database"
	"prayer-times-api/internal/models"
)

type LogRepository struct {
	db *database.DB
}

func NewLogRepository(db *database.DB) *LogRepository {
	return &LogRepository{db: db}
}

// Create adds a new log entry
func (r *LogRepository) Create(ctx context.Context, log *models.Log) error {
	query := `
		INSERT INTO logs (masjid_id, status, message, metadata)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at
	`

	err := r.db.Pool.QueryRow(
		ctx, query,
		log.MasjidID, log.Status, log.Message, log.Metadata,
	).Scan(&log.ID, &log.CreatedAt)

	if err != nil {
		return fmt.Errorf("failed to create log: %w", err)
	}

	return nil
}

// GetRecent retrieves recent log entries
func (r *LogRepository) GetRecent(ctx context.Context, limit int) ([]models.Log, error) {
	query := `
		SELECT id, masjid_id, status, message, metadata, created_at
		FROM logs
		ORDER BY created_at DESC
		LIMIT $1
	`

	rows, err := r.db.Pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query logs: %w", err)
	}
	defer rows.Close()

	var logs []models.Log
	for rows.Next() {
		var l models.Log
		err := rows.Scan(
			&l.ID, &l.MasjidID, &l.Status, &l.Message, &l.Metadata, &l.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan log: %w", err)
		}
		logs = append(logs, l)
	}

	return logs, nil
}

// Helper function to log with metadata
func (r *LogRepository) LogWithMetadata(ctx context.Context, masjidID *int, status, message string, metadata interface{}) error {
	var metadataJSON string
	if metadata != nil {
		bytes, err := json.Marshal(metadata)
		if err != nil {
			metadataJSON = "{}"
		} else {
			metadataJSON = string(bytes)
		}
	}

	log := &models.Log{
		MasjidID: masjidID,
		Status:   status,
		Message:  message,
		Metadata: metadataJSON,
	}

	return r.Create(ctx, log)
}
