package router

import (
	"prayer-times-api/internal/handlers"
	"prayer-times-api/internal/middleware"

	"github.com/gin-gonic/gin"
)

type Router struct {
	masjidHandler      *handlers.MasjidHandler
	prayerTimesHandler *handlers.PrayerTimesHandler
	deviceHandler      *handlers.DeviceHandler
}

func NewRouter(
	masjidHandler *handlers.MasjidHandler,
	prayerTimesHandler *handlers.PrayerTimesHandler,
	deviceHandler *handlers.DeviceHandler,
) *Router {
	return &Router{
		masjidHandler:      masjidHandler,
		prayerTimesHandler: prayerTimesHandler,
		deviceHandler:      deviceHandler,
	}
}

func (r *Router) Setup() *gin.Engine {
	router := gin.New()

	// Global middleware
	router.Use(middleware.Recovery())
	router.Use(middleware.Logger())
	router.Use(middleware.CORS())
	router.Use(middleware.RateLimiter())

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Public API routes
	api := router.Group("/api/v1")
	{
		// Masjid endpoints
		api.GET("/masjids", r.masjidHandler.GetAll)
		api.GET("/masjids/:id", r.masjidHandler.GetByID)

		// Prayer times endpoints
		api.GET("/prayer-times/:masjidId", r.prayerTimesHandler.GetByMasjid)
		api.GET("/prayer-times/:masjidId/:date", r.prayerTimesHandler.GetByMasjidAndDate)

		// Device registration endpoints
		api.POST("/devices/register", r.deviceHandler.Register)
		api.PUT("/devices/preferences", r.deviceHandler.UpdatePreferences)
		api.DELETE("/devices/unregister", r.deviceHandler.Unregister)
	}

	// Admin routes (protected with basic auth)
	// In production, use proper authentication (JWT, OAuth)
	admin := router.Group("/api/v1/admin")
	// TODO: Add authentication middleware
	// admin.Use(middleware.BasicAuth("admin", "changeme"))
	{
		admin.POST("/masjids", r.masjidHandler.Create)
		admin.PUT("/masjids/:id", r.masjidHandler.Update)
		admin.DELETE("/masjids/:id", r.masjidHandler.Delete)
	}

	return router
}
