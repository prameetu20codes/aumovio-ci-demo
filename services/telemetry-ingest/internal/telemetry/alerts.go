package telemetry

// Severity of an alert raised from a telemetry reading.
type Severity string

const (
	SeverityWarning  Severity = "WARNING"
	SeverityCritical Severity = "CRITICAL"
)

// Alert is a condition the fleet operator should act on.
type Alert struct {
	Code     string   `json:"code"`
	Severity Severity `json:"severity"`
	Message  string   `json:"message"`
}

// Alert thresholds.
const (
	LowBatteryWarningPct   = 20.0
	LowBatteryCriticalPct  = 5.0
	HotBatteryWarningC     = 50.0
	HotBatteryCriticalC    = 60.0
	LowTirePressureKpa     = 200.0
	TirePressureImbalanceK = 30.0
)

// Evaluate returns every alert raised by a single reading.
func Evaluate(r Reading) []Alert {
	var alerts []Alert

	switch {
	case r.BatteryPercent <= LowBatteryCriticalPct:
		alerts = append(alerts, Alert{Code: "BATTERY_LOW", Severity: SeverityCritical, Message: "battery critically low"})
	case r.BatteryPercent <= LowBatteryWarningPct:
		alerts = append(alerts, Alert{Code: "BATTERY_LOW", Severity: SeverityWarning, Message: "battery low"})
	}

	switch {
	case r.BatteryTempC >= HotBatteryCriticalC:
		alerts = append(alerts, Alert{Code: "BATTERY_HOT", Severity: SeverityCritical, Message: "battery overheating"})
	case r.BatteryTempC >= HotBatteryWarningC:
		alerts = append(alerts, Alert{Code: "BATTERY_HOT", Severity: SeverityWarning, Message: "battery temperature high"})
	}

	if len(r.TirePressureKP) > 0 {
		lowest, highest := r.TirePressureKP[0], r.TirePressureKP[0]
		for _, p := range r.TirePressureKP[1:] {
			if p < lowest {
				lowest = p
			}
			if p > highest {
				highest = p
			}
		}
		if lowest < LowTirePressureKpa {
			alerts = append(alerts, Alert{Code: "TIRE_PRESSURE_LOW", Severity: SeverityWarning, Message: "at least one tire is under-inflated"})
		}
		if highest-lowest > TirePressureImbalanceK {
			alerts = append(alerts, Alert{Code: "TIRE_PRESSURE_IMBALANCE", Severity: SeverityWarning, Message: "tire pressures are unbalanced"})
		}
	}

	return alerts
}
