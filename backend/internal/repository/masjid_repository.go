package repository

import (
	"context"
	"fmt"
	"prayer-times-api/internal/database"
	"prayer-times-api/internal/models"
)

type MasjidRepository struct {
	db *database.DB
}

func NewMasjidRepository(db *database.DB) *MasjidRepository {
	return &MasjidRepository{db: db}
}

// GetAll retrieves all masjids
// GetAll returns only active masjids. Inactive masjids are hidden from the app
// list and skipped by the scrape loops; use GetAllIncludingInactive for admin.
func (r *MasjidRepository) GetAll(ctx context.Context) ([]models.Masjid, error) {
	return r.getAll(ctx, true)
}

// GetAllIncludingInactive returns every masjid regardless of is_active.
func (r *MasjidRepository) GetAllIncludingInactive(ctx context.Context) ([]models.Masjid, error) {
	return r.getAll(ctx, false)
}

func (r *MasjidRepository) getAll(ctx context.Context, activeOnly bool) ([]models.Masjid, error) {
	query := `
		SELECT id, name, url, city, state, timezone, latitude, longitude, is_active, created_at, updated_at
		FROM masjids
	`
	if activeOnly {
		query += " WHERE is_active = true"
	}
	query += " ORDER BY name ASC"

	rows, err := r.db.Pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query masjids: %w", err)
	}
	defer rows.Close()

	var masjids []models.Masjid
	for rows.Next() {
		var m models.Masjid
		err := rows.Scan(
			&m.ID, &m.Name, &m.URL, &m.City, &m.State,
			&m.Timezone, &m.Latitude, &m.Longitude, &m.IsActive, &m.CreatedAt, &m.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan masjid: %w", err)
		}
		masjids = append(masjids, m)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration error: %w", err)
	}

	return masjids, nil
}

// GetByID retrieves a masjid by ID
func (r *MasjidRepository) GetByID(ctx context.Context, id int) (*models.Masjid, error) {
	query := `
		SELECT id, name, url, city, state, timezone, latitude, longitude, is_active, created_at, updated_at
		FROM masjids
		WHERE id = $1
	`

	var m models.Masjid
	err := r.db.Pool.QueryRow(ctx, query, id).Scan(
		&m.ID, &m.Name, &m.URL, &m.City, &m.State,
		&m.Timezone, &m.Latitude, &m.Longitude, &m.IsActive, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get masjid: %w", err)
	}

	return &m, nil
}

// Create adds a new masjid
func (r *MasjidRepository) Create(ctx context.Context, m *models.Masjid) error {
	query := `
		INSERT INTO masjids (name, url, city, state, timezone, latitude, longitude)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`

	err := r.db.Pool.QueryRow(
		ctx, query,
		m.Name, m.URL, m.City, m.State, m.Timezone, m.Latitude, m.Longitude,
	).Scan(&m.ID, &m.CreatedAt, &m.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create masjid: %w", err)
	}

	return nil
}

// Update updates an existing masjid
func (r *MasjidRepository) Update(ctx context.Context, m *models.Masjid) error {
	query := `
		UPDATE masjids
		SET name = $1, url = $2, city = $3, state = $4, timezone = $5,
		    latitude = $6, longitude = $7, updated_at = NOW()
		WHERE id = $8
		RETURNING updated_at
	`

	err := r.db.Pool.QueryRow(
		ctx, query,
		m.Name, m.URL, m.City, m.State, m.Timezone, m.Latitude, m.Longitude, m.ID,
	).Scan(&m.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to update masjid: %w", err)
	}

	return nil
}

// SetActive toggles a masjid's is_active flag. Deactivating hides it from the
// app list and skips it during scrapes without deleting its data (reversible).
func (r *MasjidRepository) SetActive(ctx context.Context, id int, active bool) error {
	result, err := r.db.Pool.Exec(ctx,
		`UPDATE masjids SET is_active = $1, updated_at = NOW() WHERE id = $2`, active, id)
	if err != nil {
		return fmt.Errorf("failed to set masjid active flag: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("masjid not found")
	}
	return nil
}

// Delete removes a masjid
func (r *MasjidRepository) Delete(ctx context.Context, id int) error {
	query := `DELETE FROM masjids WHERE id = $1`

	result, err := r.db.Pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete masjid: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("masjid not found")
	}

	return nil
}
