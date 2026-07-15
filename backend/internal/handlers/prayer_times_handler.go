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
}

func NewPrayerTimesHandler(prayerTimesRepo *repository.PrayerTimesRepository, masjidRepo *repository.MasjidRepository) *PrayerTimesHandler {
	return &PrayerTimesHandler{
		prayerTimesRepo: prayerTimesRepo,
		masjidRepo:      masjidRepo,
	}
}

// buildPrayerTime creates a PrayerTime object with adhan and iqama times
func (h *PrayerTimesHandler) buildPrayerTime(adhanTime, iqamaTime string) models.PrayerTime {
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

	// Build response with stored iqama times
	response := models.PrayerTimesResponse{
		MasjidID: prayerTimes.MasjidID,
		Date:     prayerTimes.Date.Format("2006-01-02"),
		Fajr:     h.buildPrayerTime(prayerTimes.Fajr, prayerTimes.FajrIqama),
		Dhuhr:    h.buildPrayerTime(prayerTimes.Dhuhr, prayerTimes.DhuhrIqama),
		Asr:      h.buildPrayerTime(prayerTimes.Asr, prayerTimes.AsrIqama),
		Maghrib:  h.buildPrayerTime(prayerTimes.Maghrib, prayerTimes.MaghribIqama),
		Isha:     h.buildPrayerTime(prayerTimes.Isha, prayerTimes.IshaIqama),
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

	// Build response with stored iqama times
	response := models.PrayerTimesResponse{
		MasjidID: prayerTimes.MasjidID,
		Date:     prayerTimes.Date.Format("2006-01-02"),
		Fajr:     h.buildPrayerTime(prayerTimes.Fajr, prayerTimes.FajrIqama),
		Dhuhr:    h.buildPrayerTime(prayerTimes.Dhuhr, prayerTimes.DhuhrIqama),
		Asr:      h.buildPrayerTime(prayerTimes.Asr, prayerTimes.AsrIqama),
		Maghrib:  h.buildPrayerTime(prayerTimes.Maghrib, prayerTimes.MaghribIqama),
		Isha:     h.buildPrayerTime(prayerTimes.Isha, prayerTimes.IshaIqama),
	}

	c.JSON(http.StatusOK, response)
}

// Upsert writes today's prayer times for a masjid from an external source
// (the AI reader in verify.py). Used for masjids whose sites can't be scraped
// reliably by the Go parsers. Admin only.
// PUT /admin/prayer-times/:masjidId
//
// Body: per-prayer 24-hour "HH:MM"; iqama optional (empty string = none).
//
//	{"fajr":{"adhan":"05:57","iqama":"06:17"}, "dhuhr":{"adhan":"12:26"}, ...}
func (h *PrayerTimesHandler) Upsert(c *gin.Context) {
	masjidID, err := strconv.Atoi(c.Param("masjidId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_id",
			Message: "Masjid ID must be a number",
		})
		return
	}

	masjid, err := h.masjidRepo.GetByID(c.Request.Context(), masjidID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIError{
			Error:   "not_found",
			Message: "Masjid not found",
		})
		return
	}

	var body models.UpsertPrayerTimesRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_request",
			Message: err.Error(),
		})
		return
	}

	// Validate all adhan times are present and well-formed 24h "HH:MM".
	pairs := []struct {
		name string
		p    models.PrayerTimeInput
	}{
		{"fajr", body.Fajr}, {"dhuhr", body.Dhuhr}, {"asr", body.Asr},
		{"maghrib", body.Maghrib}, {"isha", body.Isha},
	}
	for _, pr := range pairs {
		if !utils.IsValid24Hour(pr.p.Adhan) {
			c.JSON(http.StatusBadRequest, models.APIError{
				Error:   "validation_error",
				Message: pr.name + " adhan must be 24-hour HH:MM",
			})
			return
		}
		if pr.p.Iqama != "" && !utils.IsValid24Hour(pr.p.Iqama) {
			c.JSON(http.StatusBadRequest, models.APIError{
				Error:   "validation_error",
				Message: pr.name + " iqama must be 24-hour HH:MM or empty",
			})
			return
		}
	}

	// Date is today in the masjid's own timezone.
	loc, err := time.LoadLocation(masjid.Timezone)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	pt := &models.PrayerTimes{
		MasjidID:     masjidID,
		Date:         today,
		Fajr:         body.Fajr.Adhan,
		Dhuhr:        body.Dhuhr.Adhan,
		Asr:          body.Asr.Adhan,
		Maghrib:      body.Maghrib.Adhan,
		Isha:         body.Isha.Adhan,
		FajrIqama:    body.Fajr.Iqama,
		DhuhrIqama:   body.Dhuhr.Iqama,
		AsrIqama:     body.Asr.Iqama,
		MaghribIqama: body.Maghrib.Iqama,
		IshaIqama:    body.Isha.Iqama,
	}

	if err := h.prayerTimesRepo.Upsert(c.Request.Context(), pt); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIError{
			Error:   "database_error",
			Message: "Failed to save prayer times",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"masjid_id": masjidID,
		"date":      today.Format("2006-01-02"),
		"status":    "updated",
	})
}
