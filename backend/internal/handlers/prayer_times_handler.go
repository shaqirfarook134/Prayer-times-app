package handlers

import (
	"net/http"
	"prayer-times-api/internal/models"
	"prayer-times-api/internal/repository"
	"prayer-times-api/internal/utils"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type PrayerTimesHandler struct {
	prayerTimesRepo *repository.PrayerTimesRepository
	masjidRepo      *repository.MasjidRepository
	iqamaRepo       *repository.IqamaRepository
}

func NewPrayerTimesHandler(prayerTimesRepo *repository.PrayerTimesRepository, masjidRepo *repository.MasjidRepository, iqamaRepo *repository.IqamaRepository) *PrayerTimesHandler {
	return &PrayerTimesHandler{
		prayerTimesRepo: prayerTimesRepo,
		masjidRepo:      masjidRepo,
		iqamaRepo:       iqamaRepo,
	}
}

// buildPrayerTime creates a PrayerTime object with adhan and iqama times
func (h *PrayerTimesHandler) buildPrayerTime(adhanTime string, offsetMinutes int) models.PrayerTime {
	// Calculate iqama time
	iqamaTime, err := utils.AddMinutesToTime(adhanTime, offsetMinutes)
	if err != nil {
		// Fallback to same time if error
		iqamaTime = adhanTime
	}

	// Convert to 12-hour format
	adhan12, err := utils.ConvertTo12Hour(adhanTime)
	if err != nil {
		adhan12 = adhanTime
	}

	iqama12, err := utils.ConvertTo12Hour(iqamaTime)
	if err != nil {
		iqama12 = iqamaTime
	}

	return models.PrayerTime{
		Adhan:   adhanTime,
		Iqama:   iqamaTime,
		Adhan12: adhan12,
		Iqama12: iqama12,
	}
}

// GetByMasjid returns today's prayer times for a masjid
// GET /prayer-times/:masjidId
func (h *PrayerTimesHandler) GetByMasjid(c *gin.Context) {
	masjidID, err := strconv.Atoi(c.Param("masjidId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_id",
			Message: "Masjid ID must be a number",
		})
		return
	}

	// Get masjid to determine timezone
	masjid, err := h.masjidRepo.GetByID(c.Request.Context(), masjidID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIError{
			Error:   "not_found",
			Message: "Masjid not found",
		})
		return
	}

	// Get today's prayer times
	prayerTimes, err := h.prayerTimesRepo.GetTodayByMasjid(c.Request.Context(), masjidID, masjid.Timezone)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIError{
			Error:   "not_found",
			Message: "Prayer times not available for today",
		})
		return
	}

	// Get iqama configuration
	iqamaOffsets, err := h.iqamaRepo.GetByMasjid(c.Request.Context(), masjidID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIError{
			Error:   "server_error",
			Message: "Failed to fetch iqama configuration",
		})
		return
	}

	// Build response with calculated iqama times
	response := models.PrayerTimesResponse{
		MasjidID: prayerTimes.MasjidID,
		Date:     prayerTimes.Date.Format("2006-01-02"),
		Fajr:     h.buildPrayerTime(prayerTimes.Fajr, iqamaOffsets["fajr"]),
		Dhuhr:    h.buildPrayerTime(prayerTimes.Dhuhr, iqamaOffsets["dhuhr"]),
		Asr:      h.buildPrayerTime(prayerTimes.Asr, iqamaOffsets["asr"]),
		Maghrib:  h.buildPrayerTime(prayerTimes.Maghrib, iqamaOffsets["maghrib"]),
		Isha:     h.buildPrayerTime(prayerTimes.Isha, iqamaOffsets["isha"]),
	}

	c.JSON(http.StatusOK, response)
}

// GetByMasjidAndDate returns prayer times for a specific date
// GET /prayer-times/:masjidId/:date
func (h *PrayerTimesHandler) GetByMasjidAndDate(c *gin.Context) {
	masjidID, err := strconv.Atoi(c.Param("masjidId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_id",
			Message: "Masjid ID must be a number",
		})
		return
	}

	dateStr := c.Param("date")
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_date",
			Message: "Date must be in format YYYY-MM-DD",
		})
		return
	}

	prayerTimes, err := h.prayerTimesRepo.GetByMasjidAndDate(c.Request.Context(), masjidID, date)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIError{
			Error:   "not_found",
			Message: "Prayer times not available for this date",
		})
		return
	}

	// Get iqama configuration
	iqamaOffsets, err := h.iqamaRepo.GetByMasjid(c.Request.Context(), masjidID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIError{
			Error:   "server_error",
			Message: "Failed to fetch iqama configuration",
		})
		return
	}

	// Build response with calculated iqama times
	response := models.PrayerTimesResponse{
		MasjidID: prayerTimes.MasjidID,
		Date:     prayerTimes.Date.Format("2006-01-02"),
		Fajr:     h.buildPrayerTime(prayerTimes.Fajr, iqamaOffsets["fajr"]),
		Dhuhr:    h.buildPrayerTime(prayerTimes.Dhuhr, iqamaOffsets["dhuhr"]),
		Asr:      h.buildPrayerTime(prayerTimes.Asr, iqamaOffsets["asr"]),
		Maghrib:  h.buildPrayerTime(prayerTimes.Maghrib, iqamaOffsets["maghrib"]),
		Isha:     h.buildPrayerTime(prayerTimes.Isha, iqamaOffsets["isha"]),
	}

	c.JSON(http.StatusOK, response)
}
