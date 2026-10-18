package telemetry

import (
	"fmt"
	"sync"
	"testing"
)

func TestAggregatorAddAndGet(t *testing.T) {
	agg := NewAggregator()

	r1 := validReading()
	r1.SpeedKph = 60
	r1.BatteryTempC = 30
	r2 := validReading()
	r2.SpeedKph = 120
	r2.BatteryTempC = 40
	r2.BatteryPercent = 15

	agg.Add(r1)
	alerts := agg.Add(r2)

	if len(alerts) != 1 || alerts[0].Code != "BATTERY_LOW" {
		t.Fatalf("expected one BATTERY_LOW alert, got %+v", alerts)
	}

	s, ok := agg.Get("VIN-0001")
	if !ok {
		t.Fatal("expected stats for VIN-0001")
	}
	if s.Samples != 2 {
		t.Errorf("samples = %d, want 2", s.Samples)
	}
	if s.MaxSpeedKph != 120 {
		t.Errorf("max speed = %.1f, want 120", s.MaxSpeedKph)
	}
	if s.AvgSpeedKph != 90 {
		t.Errorf("avg speed = %.1f, want 90", s.AvgSpeedKph)
	}
	if s.MaxBatteryTempC != 40 {
		t.Errorf("max battery temp = %.1f, want 40", s.MaxBatteryTempC)
	}
	if s.LastBatteryPct != 15 {
		t.Errorf("last battery = %.1f, want 15", s.LastBatteryPct)
	}
}

func TestAggregatorTracksNegativeTemperatures(t *testing.T) {
	agg := NewAggregator()
	r := validReading()
	r.BatteryTempC = -10
	agg.Add(r)

	s, _ := agg.Get(r.VehicleID)
	if s.MaxBatteryTempC != -10 {
		t.Errorf("max battery temp = %.1f, want -10", s.MaxBatteryTempC)
	}
}

func TestAggregatorGetUnknownVehicle(t *testing.T) {
	if _, ok := NewAggregator().Get("nope"); ok {
		t.Fatal("expected unknown vehicle to be missing")
	}
}

func TestAggregatorGetReturnsCopy(t *testing.T) {
	agg := NewAggregator()
	r := validReading()
	r.BatteryPercent = 3
	agg.Add(r)

	s, _ := agg.Get(r.VehicleID)
	s.Alerts[0].Code = "MUTATED"

	again, _ := agg.Get(r.VehicleID)
	if again.Alerts[0].Code != "BATTERY_LOW" {
		t.Fatalf("Get leaked internal state: %+v", again.Alerts)
	}
}

func TestAggregatorConcurrentAdds(t *testing.T) {
	agg := NewAggregator()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			r := validReading()
			r.VehicleID = fmt.Sprintf("VIN-%d", i%5)
			agg.Add(r)
		}(i)
	}
	wg.Wait()

	ids := agg.VehicleIDs()
	if len(ids) != 5 {
		t.Fatalf("expected 5 vehicles, got %v", ids)
	}
	total := 0
	for _, id := range ids {
		s, _ := agg.Get(id)
		total += s.Samples
	}
	if total != 50 {
		t.Fatalf("expected 50 samples, got %d", total)
	}
}
