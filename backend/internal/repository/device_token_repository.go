package repository

import (
	"context"
	"fmt"
	"prayer-times-api/internal/database"
	"prayer-times-api/internal/models"
)

type DeviceTokenRepository struct {
	db *database.DB
}

func NewDeviceTokenRepository(db *database.DB) *DeviceTokenRepository {
	return &DeviceTokenRepository{db: db}
}

// Upsert creates or updates a device token
func (r *DeviceTokenRepository) Upsert(ctx context.Context, dt *models.DeviceToken) error {
	query := `
		INSERT INTO device_tokens (token, platform, masjid_id, notifications_enabled, user_id, last_used_at)
		VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
		ON CONFLICT (token)
		DO UPDATE SET
			platform = EXCLUDED.platform,
			masjid_id = EXCLUDED.masjid_id,
			notifications_enabled = EXCLUDED.notifications_enabled,
			user_id = EXCLUDED.user_id,
			last_used_at = CURRENT_TIMESTAMP
		RETURNING id, created_at, updated_at, last_used_at
	`

	err := r.db.Pool.QueryRow(
		ctx, query,
		dt.Token, dt.Platform, dt.MasjidID, dt.NotificationsEnabled, dt.UserID,
	).Scan(&dt.ID, &dt.CreatedAt, &dt.UpdatedAt, &dt.LastUsedAt)

	if err != nil {
		return fmt.Errorf("failed to upsert device token: %w", err)
	}

	return nil
}

// GetByToken retrieves a device token by its value
func (r *DeviceTokenRepository) GetByToken(ctx context.Context, token string) (*models.DeviceToken, error) {
	query := `
		SELECT id, user_id, token, platform, masjid_id, notifications_enabled,
		       created_at, updated_at, last_used_at
		FROM device_tokens
		WHERE token = $1
	`

	var dt models.DeviceToken
	err := r.db.Pool.QueryRow(ctx, query, token).Scan(
		&dt.ID, &dt.UserID, &dt.Token, &dt.Platform, &dt.MasjidID,
		&dt.NotificationsEnabled, &dt.CreatedAt, &dt.UpdatedAt, &dt.LastUsedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get device token: %w", err)
	}

	return &dt, nil
}

// GetByMasjid retrieves all active device tokens for a masjid
func (r *DeviceTokenRepository) GetByMasjid(ctx context.Context, masjidID int) ([]models.DeviceToken, error) {
	query := `
		SELECT id, user_id, token, platform, masjid_id, notifications_enabled,
		       created_at, updated_at, last_used_at
		FROM device_tokens
		WHERE masjid_id = $1 AND notifications_enabled = true
		ORDER BY last_used_at DESC
	`

	rows, err := r.db.Pool.Query(ctx, query, masjidID)
	if err != nil {
		return nil, fmt.Errorf("failed to query device tokens: %w", err)
	}
	defer rows.Close()

	var tokens []models.DeviceToken
	for rows.Next() {
		var dt models.DeviceToken
		err := rows.Scan(
			&dt.ID, &dt.UserID, &dt.Token, &dt.Platform, &dt.MasjidID,
			&dt.NotificationsEnabled, &dt.CreatedAt, &dt.UpdatedAt, &dt.LastUsedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan device token: %w", err)
		}
		tokens = append(tokens, dt)
	}

	return tokens, nil
}

// Update modifies device preferences
func (r *DeviceTokenRepository) Update(ctx context.Context, token string, masjidID *int, notificationsEnabled *bool) error {
	query := `
		UPDATE device_tokens
		SET masjid_id = COALESCE($2, masjid_id),
		    notifications_enabled = COALESCE($3, notifications_enabled),
		    last_used_at = CURRENT_TIMESTAMP
		WHERE token = $1
	`

	result, err := r.db.Pool.Exec(ctx, query, token, masjidID, notificationsEnabled)
	if err != nil {
		return fmt.Errorf("failed to update device token: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("device token not found")
	}

	return nil
}

// Delete removes a device token
func (r *DeviceTokenRepository) Delete(ctx context.Context, token string) error {
	query := `DELETE FROM device_tokens WHERE token = $1`

	result, err := r.db.Pool.Exec(ctx, query, token)
	if err != nil {
		return fmt.Errorf("failed to delete device token: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("device token not found")
	}

	return nil
}
