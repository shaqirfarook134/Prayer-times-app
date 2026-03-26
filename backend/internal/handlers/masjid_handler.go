package handlers

import (
	"net/http"
	"prayer-times-api/internal/models"
	"prayer-times-api/internal/repository"
	"strconv"

	"github.com/gin-gonic/gin"
)

type MasjidHandler struct {
	masjidRepo *repository.MasjidRepository
}

func NewMasjidHandler(masjidRepo *repository.MasjidRepository) *MasjidHandler {
	return &MasjidHandler{masjidRepo: masjidRepo}
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

	// Log coordinates for debugging (will be removed after verification)
	if masjid.Latitude != nil && masjid.Longitude != nil {
		println("DEBUG: Received coordinates:", *masjid.Latitude, *masjid.Longitude)
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
