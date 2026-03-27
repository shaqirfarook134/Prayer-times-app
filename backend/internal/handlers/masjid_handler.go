package handlers

import (
	"context"
	"log"
	"net/http"
	"prayer-times-api/internal/models"
	"prayer-times-api/internal/repository"
	"prayer-times-api/internal/services"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type MasjidHandler struct {
	masjidRepo    *repository.MasjidRepository
	prayerService *services.PrayerService
}

func NewMasjidHandler(masjidRepo *repository.MasjidRepository, prayerService *services.PrayerService) *MasjidHandler {
	return &MasjidHandler{
		masjidRepo:    masjidRepo,
		prayerService: prayerService,
	}
}

// GetAll returns all masjids
// GET /masjids
func (h *MasjidHandler) GetAll(c *gin.Context) {
	masjids, err := h.masjidRepo.GetAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIError{
			Error:   "database_error",
			Message: "Failed to retrieve masjids",
		})
		return
	}

	c.JSON(http.StatusOK, masjids)
}

// GetByID returns a specific masjid
// GET /masjids/:id
func (h *MasjidHandler) GetByID(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_id",
			Message: "Masjid ID must be a number",
		})
		return
	}

	masjid, err := h.masjidRepo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIError{
			Error:   "not_found",
			Message: "Masjid not found",
		})
		return
	}

	c.JSON(http.StatusOK, masjid)
}

// Create adds a new masjid (admin only)
// POST /admin/masjids
func (h *MasjidHandler) Create(c *gin.Context) {
	var masjid models.Masjid
	if err := c.ShouldBindJSON(&masjid); err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_request",
			Message: err.Error(),
		})
		return
	}

	// Validate required fields
	if masjid.Name == "" || masjid.URL == "" || masjid.City == "" {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "validation_error",
			Message: "Name, URL, and City are required",
		})
		return
	}

	// Set default timezone if not provided
	if masjid.Timezone == "" {
		masjid.Timezone = "Australia/Melbourne"
	}

	err := h.masjidRepo.Create(c.Request.Context(), &masjid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIError{
			Error:   "database_error",
			Message: "Failed to create masjid",
		})
		return
	}

	// Trigger automatic scraping of prayer times for this new masjid
	// Run in background goroutine to avoid blocking the response
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()

		log.Printf("🔄 Auto-scraping prayer times for new masjid: %s (ID: %d)", masjid.Name, masjid.ID)
		if err := h.prayerService.FetchAndUpdateMasjid(ctx, &masjid); err != nil {
			log.Printf("❌ Auto-scrape failed for masjid %d: %v", masjid.ID, err)
		} else {
			log.Printf("✅ Auto-scrape successful for masjid %d: %s", masjid.ID, masjid.Name)
		}
	}()

	c.JSON(http.StatusCreated, masjid)
}

// Update updates an existing masjid (admin only)
// PUT /admin/masjids/:id
func (h *MasjidHandler) Update(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_id",
			Message: "Masjid ID must be a number",
		})
		return
	}

	var masjid models.Masjid
	if err := c.ShouldBindJSON(&masjid); err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_request",
			Message: err.Error(),
		})
		return
	}

	// Validate required fields
	if masjid.Name == "" || masjid.URL == "" || masjid.City == "" {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "validation_error",
			Message: "Name, URL, and City are required",
		})
		return
	}

	// Set the ID from the URL parameter
	masjid.ID = id

	// Set default timezone if not provided
	if masjid.Timezone == "" {
		masjid.Timezone = "Australia/Melbourne"
	}

	err = h.masjidRepo.Update(c.Request.Context(), &masjid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIError{
			Error:   "database_error",
			Message: "Failed to update masjid",
		})
		return
	}

	c.JSON(http.StatusOK, masjid)
}

// Delete removes a masjid (admin only)
// DELETE /admin/masjids/:id
func (h *MasjidHandler) Delete(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_id",
			Message: "Masjid ID must be a number",
		})
		return
	}

	err = h.masjidRepo.Delete(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIError{
			Error:   "not_found",
			Message: "Masjid not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Masjid deleted successfully"})
}
