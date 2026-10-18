// Package telemetry contains the domain model and validation rules for
// vehicle telemetry readings sent by in-vehicle gateways.
package telemetry

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// Reading is a single telemetry sample emitted by a vehicle.
type Reading struct {
	VehicleID      string    `json:"vehicleId"`
	Timestamp      time.Time `json:"timestamp"`
	SpeedKph       float64   `json:"speedKph"`
	BatteryPercent float64   `json:"batteryPercent"`
	BatteryTempC   float64   `json:"batteryTempC"`
	TirePressureKP []float64 `json:"tirePressureKpa"`
}

// Validation limits. Values outside these ranges indicate a faulty sensor
// rather than a real-world condition, so the reading is rejected.
const (
	MaxSpeedKph       = 300.0
	MinBatteryTempC   = -40.0
	MaxBatteryTempC   = 85.0
	MinTirePressure   = 100.0
	MaxTirePressure   = 450.0
	maxClockSkew      = 5 * time.Minute
	expectedTireCount = 4
)

// ErrInvalidReading wraps every validation failure so callers can use errors.Is.
var ErrInvalidReading = errors.New("invalid reading")

// Validate checks a reading against physical sensor limits. now is injected so
// tests are deterministic.
func Validate(r Reading, now time.Time) error {
	var problems []string

	if strings.TrimSpace(r.VehicleID) == "" {
		problems = append(problems, "vehicleId is required")
	}
	if r.Timestamp.IsZero() {
		problems = append(problems, "timestamp is required")
	} else if r.Timestamp.After(now.Add(maxClockSkew)) {
		problems = append(problems, "timestamp is in the future")
	}
	if r.SpeedKph < 0 || r.SpeedKph > MaxSpeedKph {
		problems = append(problems, fmt.Sprintf("speedKph %.1f out of range [0, %.0f]", r.SpeedKph, MaxSpeedKph))
	}
	if r.BatteryPercent < 0 || r.BatteryPercent > 100 {
		problems = append(problems, fmt.Sprintf("batteryPercent %.1f out of range [0, 100]", r.BatteryPercent))
	}
	if r.BatteryTempC < MinBatteryTempC || r.BatteryTempC > MaxBatteryTempC {
		problems = append(problems, fmt.Sprintf("batteryTempC %.1f out of range [%.0f, %.0f]", r.BatteryTempC, MinBatteryTempC, MaxBatteryTempC))
	}
	if len(r.TirePressureKP) != expectedTireCount {
		problems = append(problems, fmt.Sprintf("expected %d tire pressure values, got %d", expectedTireCount, len(r.TirePressureKP)))
	}
	for i, p := range r.TirePressureKP {
		if p < MinTirePressure || p > MaxTirePressure {
			problems = append(problems, fmt.Sprintf("tire %d pressure %.0f out of range [%.0f, %.0f]", i, p, MinTirePressure, MaxTirePressure))
		}
	}

	if len(problems) > 0 {
		return fmt.Errorf("%w: %s", ErrInvalidReading, strings.Join(problems, "; "))
	}
	return nil
}
