package utils

import "testing"

func TestIsValid24Hour(t *testing.T) {
	valid := []string{"00:00", "05:57", "12:26", "17:20", "23:59"}
	for _, s := range valid {
		if !IsValid24Hour(s) {
			t.Errorf("IsValid24Hour(%q) = false; want true", s)
		}
	}
	invalid := []string{"", "5:57", "24:00", "12:60", "12:5", "1:30 PM", "abc", "12-30"}
	for _, s := range invalid {
		if IsValid24Hour(s) {
			t.Errorf("IsValid24Hour(%q) = true; want false", s)
		}
	}
}
