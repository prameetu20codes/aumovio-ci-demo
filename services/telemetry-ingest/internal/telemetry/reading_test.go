package telemetry

import (
	"errors"
	"strings"
	"testing"
	"time"
)

var fixedNow = time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)

func validReading() Reading {
	return Reading{
		VehicleID:      "VIN-0001",
		Timestamp:      fixedNow.Add(-time.Second),
		SpeedKph:       88,
		BatteryPercent: 72,
		BatteryTempC:   31,
		TirePressureKP: []float64{230, 231, 229, 232},
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(r *Reading)
		wantErr string
	}{
		{name: "valid reading", mutate: func(r *Reading) {}},
		{name: "missing vehicle id", mutate: func(r *Reading) { r.VehicleID = "  " }, wantErr: "vehicleId is required"},
		{name: "missing timestamp", mutate: func(r *Reading) { r.Timestamp = time.Time{} }, wantErr: "timestamp is required"},
		{name: "future timestamp", mutate: func(r *Reading) { r.Timestamp = fixedNow.Add(time.Hour) }, wantErr: "timestamp is in the future"},
		{name: "small clock skew allowed", mutate: func(r *Reading) { r.Timestamp = fixedNow.Add(time.Minute) }},
		{name: "negative speed", mutate: func(r *Reading) { r.SpeedKph = -1 }, wantErr: "speedKph"},
		{name: "speed too high", mutate: func(r *Reading) { r.SpeedKph = 301 }, wantErr: "speedKph"},
		{name: "battery over 100", mutate: func(r *Reading) { r.BatteryPercent = 101 }, wantErr: "batteryPercent"},
		{name: "battery too cold", mutate: func(r *Reading) { r.BatteryTempC = -41 }, wantErr: "batteryTempC"},
		{name: "battery too hot", mutate: func(r *Reading) { r.BatteryTempC = 86 }, wantErr: "batteryTempC"},
		{name: "wrong tire count", mutate: func(r *Reading) { r.TirePressureKP = []float64{230, 230} }, wantErr: "expected 4 tire pressure values"},
		{name: "flat tire", mutate: func(r *Reading) { r.TirePressureKP[2] = 50 }, wantErr: "tire 2 pressure"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := validReading()
			tc.mutate(&r)

			err := Validate(r, fixedNow)

			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("expected no error, got %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.wantErr)
			}
			if !errors.Is(err, ErrInvalidReading) {
				t.Errorf("expected error to wrap ErrInvalidReading, got %v", err)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("expected error containing %q, got %q", tc.wantErr, err.Error())
			}
		})
	}
}

func TestValidateReportsAllProblems(t *testing.T) {
	r := Reading{SpeedKph: -5, BatteryPercent: 150, BatteryTempC: 20}

	err := Validate(r, fixedNow)
	if err == nil {
		t.Fatal("expected error")
	}
	for _, want := range []string{"vehicleId", "timestamp", "speedKph", "batteryPercent", "tire pressure"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("expected %q in %q", want, err.Error())
		}
	}
}
