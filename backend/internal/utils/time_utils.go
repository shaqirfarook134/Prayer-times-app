package utils

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// valid24Hour matches a strict two-digit 24-hour "HH:MM" (00:00–23:59).
var valid24Hour = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)

// IsValid24Hour reports whether s is a valid 24-hour "HH:MM" time.
func IsValid24Hour(s string) bool {
	return valid24Hour.MatchString(s)
}

// AddMinutesToTime adds minutes to a time string in format "HH:MM"
// Returns the new time in format "HH:MM"
func AddMinutesToTime(timeStr string, minutes int) (string, error) {
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid time format: %s", timeStr)
	}

	hours, err := strconv.Atoi(parts[0])
	if err != nil {
		return "", fmt.Errorf("invalid hours: %s", parts[0])
	}

	mins, err := strconv.Atoi(parts[1])
	if err != nil {
		return "", fmt.Errorf("invalid minutes: %s", parts[1])
	}

	// Create time and add minutes
	t := time.Date(2000, 1, 1, hours, mins, 0, 0, time.UTC)
	t = t.Add(time.Duration(minutes) * time.Minute)

	return fmt.Sprintf("%02d:%02d", t.Hour(), t.Minute()), nil
}

// ConvertTo12Hour converts time from "HH:MM" to "h:MM AM/PM" format
func ConvertTo12Hour(timeStr string) (string, error) {
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid time format: %s", timeStr)
	}

	hours, err := strconv.Atoi(parts[0])
	if err != nil {
		return "", fmt.Errorf("invalid hours: %s", parts[0])
	}

	mins, err := strconv.Atoi(parts[1])
	if err != nil {
		return "", fmt.Errorf("invalid minutes: %s", parts[1])
	}

	ampm := "AM"
	displayHour := hours

	if hours == 0 {
		displayHour = 12
	} else if hours == 12 {
		ampm = "PM"
	} else if hours > 12 {
		displayHour = hours - 12
		ampm = "PM"
	}

	return fmt.Sprintf("%d:%02d %s", displayHour, mins, ampm), nil
}
