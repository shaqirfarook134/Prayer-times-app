package services

import (
	"fmt"
	"log"
	"net/smtp"
	"prayer-times-api/internal/config"
	"time"
)

type AlertService struct {
	from     string
	to       string
	password string
	host     string
	port     string
	enabled  bool
}

func NewAlertService(cfg *config.AlertConfig) *AlertService {
	enabled := cfg.EmailFrom != "" && cfg.EmailTo != "" && cfg.EmailPassword != ""
	if !enabled {
		log.Println("⚠️  Alert service disabled — ALERT_EMAIL_FROM, ALERT_EMAIL_TO, ALERT_EMAIL_PASSWORD not set")
	}
	return &AlertService{
		from:     cfg.EmailFrom,
		to:       cfg.EmailTo,
		password: cfg.EmailPassword,
		host:     cfg.SMTPHost,
		port:     cfg.SMTPPort,
		enabled:  enabled,
	}
}

func (a *AlertService) SendAlert(subject, body string) {
	if !a.enabled {
		log.Printf("🔕 Alert suppressed (not configured): %s", subject)
		return
	}

	go func() {
		timestamp := time.Now().Format("2006-01-02 15:04:05 MST")
		fullBody := fmt.Sprintf("%s\n\nTime: %s", body, timestamp)

		msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
			a.from, a.to, subject, fullBody)

		auth := smtp.PlainAuth("", a.from, a.password, a.host)
		addr := fmt.Sprintf("%s:%s", a.host, a.port)

		if err := smtp.SendMail(addr, auth, a.from, []string{a.to}, []byte(msg)); err != nil {
			log.Printf("❌ Failed to send alert email: %v", err)
		} else {
			log.Printf("📧 Alert email sent: %s", subject)
		}
	}()
}
