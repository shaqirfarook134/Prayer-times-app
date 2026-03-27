package handlers

import (
	"context"
	"net/http"
	"prayer-times-api/internal/models"
	"prayer-times-api/internal/repository"
	"prayer-times-api/internal/services"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type ScrapeHandler struct {
	prayerService *services.PrayerService
	masjidRepo    *repository.MasjidRepository
}

func NewScrapeHandler(prayerService *services.PrayerService, masjidRepo *repository.MasjidRepository) *ScrapeHandler {
	return &ScrapeHandler{
		prayerService: prayerService,
		masjidRepo:    masjidRepo,
	}
}

// TriggerScrape manually triggers a prayer times scrape
// POST /admin/scrape?masjid_id=9  (optional: scrape specific masjid)
// POST /admin/scrape               (scrapes all masjids)
func (h *ScrapeHandler) TriggerScrape(c *gin.Context) {
	masjidIDStr := c.Query("masjid_id")

	// Create context with timeout
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Minute)
	defer cancel()

	if masjidIDStr != "" {
		// Scrape specific masjid
		masjidID, err := strconv.Atoi(masjidIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, models.APIError{
				Error:   "invalid_masjid_id",
				Message: "Masjid ID must be a number",
			})
			return
		}

		// Get masjid
		masjid, err := h.masjidRepo.GetByID(ctx, masjidID)
		if err != nil {
			c.JSON(http.StatusNotFound, models.APIError{
				Error:   "masjid_not_found",
				Message: "Masjid not found",
			})
			return
		}

		// Scrape this masjid
		if err := h.prayerService.FetchAndUpdateMasjid(ctx, masjid); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIError{
				Error:   "scrape_failed",
				Message: "Failed to scrape prayer times: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":          "success",
			"message":         "Prayer times scraped successfully",
			"masjid_id":       masjidID,
			"masjids_scraped": 1,
		})
		return
	}

	// Scrape all masjids
	if err := h.prayerService.FetchAndUpdateAllMasjids(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIError{
			Error:   "scrape_failed",
			Message: "Failed to scrape prayer times: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "All masjids scraped successfully",
	})
}
