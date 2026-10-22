package telemetry

import (
	"sort"
	"sync"
)

// VehicleStats is a rolling summary of all accepted readings for one vehicle.
type VehicleStats struct {
	VehicleID       string  `json:"vehicleId"`
	Samples         int     `json:"samples"`
	MaxSpeedKph     float64 `json:"maxSpeedKph"`
	AvgSpeedKph     float64 `json:"avgSpeedKph"`
	LastBatteryPct  float64 `json:"lastBatteryPercent"`
	MaxBatteryTempC float64 `json:"maxBatteryTempC"`
	Alerts          []Alert `json:"alerts"`
}

// Aggregator keeps per-vehicle statistics in memory. It is safe for
// concurrent use by multiple HTTP handlers.
type Aggregator struct {
	mu    sync.RWMutex
	stats map[string]*VehicleStats
}

// NewAggregator returns an empty Aggregator.
func NewAggregator() *Aggregator {
	return &Aggregator{
		stats: make(map[string]*VehicleStats),
	}
}

// Add records a reading that has already passed Validate and returns the
// alerts it raised.
func (a *Aggregator) Add(r Reading) []Alert {
	alerts := Evaluate(r)

	a.mu.Lock()
	defer a.mu.Unlock()

	s, ok := a.stats[r.VehicleID]
	if !ok {
		s = &VehicleStats{VehicleID: r.VehicleID}
		a.stats[r.VehicleID] = s
	}

	s.Samples++
	// Rolling average without keeping a per-vehicle sum.
	if s.Samples == 1 {
		s.AvgSpeedKph = r.SpeedKph
	} else {
		s.AvgSpeedKph = (s.AvgSpeedKph + r.SpeedKph) / 2
	}
	if r.SpeedKph > s.MaxSpeedKph {
		s.MaxSpeedKph = r.SpeedKph
	}
	if s.Samples == 1 || r.BatteryTempC > s.MaxBatteryTempC {
		s.MaxBatteryTempC = r.BatteryTempC
	}
	s.LastBatteryPct = r.BatteryPercent
	s.Alerts = append(s.Alerts, alerts...)

	return alerts
}

// Get returns a copy of the stats for a vehicle.
func (a *Aggregator) Get(vehicleID string) (VehicleStats, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	s, ok := a.stats[vehicleID]
	if !ok {
		return VehicleStats{}, false
	}
	out := *s
	out.Alerts = append([]Alert(nil), s.Alerts...)
	return out, true
}

// VehicleIDs returns all known vehicle IDs in sorted order.
func (a *Aggregator) VehicleIDs() []string {
	a.mu.RLock()
	defer a.mu.RUnlock()

	ids := make([]string, 0, len(a.stats))
	for id := range a.stats {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
