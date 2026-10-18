package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aumovio/ci-demo/services/telemetry-ingest/internal/telemetry"
)

var fixedNow = time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)

func newTestServer() *httptest.Server {
	s := NewServer(telemetry.NewAggregator(), func() time.Time { return fixedNow }, "test")
	return httptest.NewServer(s.Routes())
}

const validBody = `{
  "vehicleId": "VIN-42",
  "timestamp": "2026-10-18T11:59:00Z",
  "speedKph": 95,
  "batteryPercent": 18,
  "batteryTempC": 33,
  "tirePressureKpa": [230, 231, 229, 232]
}`

func TestHealth(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	res, err := http.Get(ts.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" || body["version"] != "test" {
		t.Fatalf("unexpected body %v", body)
	}
}

func TestIngestAcceptsValidReadingAndReturnsAlerts(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	res, err := http.Post(ts.URL+"/v1/readings", "application/json", strings.NewReader(validBody))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", res.StatusCode)
	}
	var body ingestResponse
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if !body.Accepted || len(body.Alerts) != 1 || body.Alerts[0].Code != "BATTERY_LOW" {
		t.Fatalf("unexpected response %+v", body)
	}
}

func TestIngestRejectsInvalidReading(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	bad := strings.Replace(validBody, `"speedKph": 95`, `"speedKph": 999`, 1)
	res, err := http.Post(ts.URL+"/v1/readings", "application/json", strings.NewReader(bad))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", res.StatusCode)
	}
}

func TestIngestRejectsMalformedJSON(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	for _, body := range []string{`{not json`, `{"vehicleId":"x","unknownField":1}`} {
		res, err := http.Post(ts.URL+"/v1/readings", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusBadRequest {
			t.Errorf("body %q: status = %d, want 400", body, res.StatusCode)
		}
	}
}

func TestVehicleStatsAndList(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	res, err := http.Post(ts.URL+"/v1/readings", "application/json", strings.NewReader(validBody))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()

	res, err = http.Get(ts.URL + "/v1/vehicles/VIN-42/stats")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("stats status = %d, want 200", res.StatusCode)
	}
	var stats telemetry.VehicleStats
	if err := json.NewDecoder(res.Body).Decode(&stats); err != nil {
		t.Fatal(err)
	}
	if stats.Samples != 1 || stats.MaxSpeedKph != 95 {
		t.Fatalf("unexpected stats %+v", stats)
	}

	res2, err := http.Get(ts.URL + "/v1/vehicles")
	if err != nil {
		t.Fatal(err)
	}
	defer res2.Body.Close()
	var list map[string][]string
	if err := json.NewDecoder(res2.Body).Decode(&list); err != nil {
		t.Fatal(err)
	}
	if len(list["vehicles"]) != 1 || list["vehicles"][0] != "VIN-42" {
		t.Fatalf("unexpected vehicle list %v", list)
	}
}

func TestVehicleStatsUnknownVehicle(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	res, err := http.Get(ts.URL + "/v1/vehicles/missing/stats")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", res.StatusCode)
	}
}
