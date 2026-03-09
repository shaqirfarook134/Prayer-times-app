package handlers

import (
	"net/http"
	"prayer-times-api/internal/models"
	"prayer-times-api/internal/repository"

	"github.com/gin-gonic/gin"
)

type DeviceHandler struct {
	deviceTokenRepo *repository.DeviceTokenRepository
}

func NewDeviceHandler(deviceTokenRepo *repository.DeviceTokenRepository) *DeviceHandler {
	return &DeviceHandler{deviceTokenRepo: deviceTokenRepo}
}

// Register registers a device for push notifications
// POST /devices/register
func (h *DeviceHandler) Register(c *gin.Context) {
	var req models.RegisterDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_request",
			Message: err.Error(),
		})
		return
	}

	// Validate platform
	if req.Platform != "ios" && req.Platform != "android" {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_platform",
			Message: "Platform must be 'ios' or 'android'",
		})
		return
	}

	deviceToken := &models.DeviceToken{
		Token:                req.Token,
		Platform:             req.Platform,
		MasjidID:             req.MasjidID,
		NotificationsEnabled: req.NotificationsEnabled,
	}

	err := h.deviceTokenRepo.Upsert(c.Request.Context(), deviceToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIError{
			Error:   "database_error",
			Message: "Failed to register device",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Device registered successfully",
		"id":      deviceToken.ID,
	})
}

// UpdatePreferences updates device preferences
// PUT /devices/preferences
func (h *DeviceHandler) UpdatePreferences(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "missing_token",
			Message: "Device token is required",
		})
		return
	}

	var req models.UpdateDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "invalid_request",
			Message: err.Error(),
		})
		return
	}

	err := h.deviceTokenRepo.Update(c.Request.Context(), token, req.MasjidID, req.NotificationsEnabled)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIError{
			Error:   "not_found",
			Message: "Device not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Preferences updated successfully"})
}

// Unregister removes a device token
// DELETE /devices/unregister
func (h *DeviceHandler) Unregister(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, models.APIError{
			Error:   "missing_token",
			Message: "Device token is required",
		})
		return
	}

	err := h.deviceTokenRepo.Delete(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIError{
			Error:   "not_found",
			Message: "Device not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Device unregistered successfully"})
}
