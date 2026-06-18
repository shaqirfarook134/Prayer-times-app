package handlers

import (
	"net/http"
	"prayer-times-api/internal/models"
	"prayer-times-api/internal/repository"
	"strconv"

	"github.com/gin-gonic/gin"
)

type JummahHandler struct {
	jummahRepo *repository.JummahRepository
}

func NewJummahHandler(jummahRepo *repository.JummahRepository) *JummahHandler {
	return &JummahHandler{jummahRepo: jummahRepo}
}

// GetByMasjid returns Jummah times for a masjid.
// GET /api/v1/jummah/:masjidId
func (h *JummahHandler) GetByMasjid(c *gin.Context) {
	masjidID, err := strconv.Atoi(c.Param("masjidId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_masjid_id",
			Message: "Masjid ID must be a number",
		})
		return
	}

	sessions, err := h.jummahRepo.GetByMasjid(c.Request.Context(), masjidID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIError{
			Error:   "db_error",
			Message: "Failed to retrieve Jummah times",
		})
		return
	}

	if sessions == nil {
		sessions = []models.JummahSession{}
	}

	c.JSON(http.StatusOK, models.JummahTimesResponse{
		MasjidID: masjidID,
		Sessions: sessions,
	})
}
