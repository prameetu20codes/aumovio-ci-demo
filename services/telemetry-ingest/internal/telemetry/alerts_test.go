package telemetry

import "testing"

func codes(alerts []Alert) map[string]Severity {
	out := make(map[string]Severity, len(alerts))
	for _, a := range alerts {
		out[a.Code] = a.Severity
	}
	return out
}

func TestEvaluate(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(r *Reading)
		want   map[string]Severity
	}{
		{name: "healthy", mutate: func(r *Reading) {}, want: map[string]Severity{}},
		{name: "battery warning", mutate: func(r *Reading) { r.BatteryPercent = 20 }, want: map[string]Severity{"BATTERY_LOW": SeverityWarning}},
		{name: "battery critical", mutate: func(r *Reading) { r.BatteryPercent = 5 }, want: map[string]Severity{"BATTERY_LOW": SeverityCritical}},
		{name: "battery hot warning", mutate: func(r *Reading) { r.BatteryTempC = 55 }, want: map[string]Severity{"BATTERY_HOT": SeverityWarning}},
		{name: "battery hot critical", mutate: func(r *Reading) { r.BatteryTempC = 61 }, want: map[string]Severity{"BATTERY_HOT": SeverityCritical}},
		{name: "low tire", mutate: func(r *Reading) { r.TirePressureKP = []float64{190, 200, 205, 210} }, want: map[string]Severity{"TIRE_PRESSURE_LOW": SeverityWarning}},
		{name: "imbalanced tires", mutate: func(r *Reading) { r.TirePressureKP = []float64{220, 260, 230, 230} }, want: map[string]Severity{"TIRE_PRESSURE_IMBALANCE": SeverityWarning}},
		{
			name: "multiple alerts",
			mutate: func(r *Reading) {
				r.BatteryPercent = 4
				r.BatteryTempC = 65
				r.TirePressureKP = []float64{150, 240, 240, 240}
			},
			want: map[string]Severity{
				"BATTERY_LOW":             SeverityCritical,
				"BATTERY_HOT":             SeverityCritical,
				"TIRE_PRESSURE_LOW":       SeverityWarning,
				"TIRE_PRESSURE_IMBALANCE": SeverityWarning,
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := validReading()
			tc.mutate(&r)

			got := codes(Evaluate(r))

			if len(got) != len(tc.want) {
				t.Fatalf("got alerts %v, want %v", got, tc.want)
			}
			for code, sev := range tc.want {
				if got[code] != sev {
					t.Errorf("alert %s severity = %q, want %q", code, got[code], sev)
				}
			}
		})
	}
}
