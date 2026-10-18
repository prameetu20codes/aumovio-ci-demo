// Package api exposes the telemetry ingest HTTP endpoints.
package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/aumovio/ci-demo/services/telemetry-ingest/internal/telemetry"
)

const maxBodyBytes = 64 << 10

// Server wires HTTP routes to the telemetry aggregator.
type Server struct {
	agg     *telemetry.Aggregator
	now     func() time.Time
	version string
}

// NewServer builds a Server. now may be nil, in which case time.Now is used.
func NewServer(agg *telemetry.Aggregator, now func() time.Time, version string) *Server {
	if now == nil {
		now = time.Now
	}
	return &Server{agg: agg, now: now, version: version}
}

// Routes returns the HTTP handler for the service.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("POST /v1/readings", s.ingest)
	mux.HandleFunc("GET /v1/vehicles", s.listVehicles)
	mux.HandleFunc("GET /v1/vehicles/{id}/stats", s.vehicleStats)
	return mux
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": s.version})
}

type ingestResponse struct {
	Accepted bool              `json:"accepted"`
	Alerts   []telemetry.Alert `json:"alerts"`
}

func (s *Server) ingest(w http.ResponseWriter, r *http.Request) {
	var reading telemetry.Reading
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&reading); err != nil {
		writeError(w, http.StatusBadRequest, "malformed JSON body: "+err.Error())
		return
	}

	if err := telemetry.Validate(reading, s.now()); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, telemetry.ErrInvalidReading) {
			status = http.StatusUnprocessableEntity
		}
		writeError(w, status, err.Error())
		return
	}

	alerts := s.agg.Add(reading)
	if alerts == nil {
		alerts = []telemetry.Alert{}
	}
	writeJSON(w, http.StatusAccepted, ingestResponse{Accepted: true, Alerts: alerts})
}

func (s *Server) listVehicles(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string][]string{"vehicles": s.agg.VehicleIDs()})
}

func (s *Server) vehicleStats(w http.ResponseWriter, r *http.Request) {
	stats, ok := s.agg.Get(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "unknown vehicle")
		return
	}
	if stats.Alerts == nil {
		stats.Alerts = []telemetry.Alert{}
	}
	writeJSON(w, http.StatusOK, stats)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
