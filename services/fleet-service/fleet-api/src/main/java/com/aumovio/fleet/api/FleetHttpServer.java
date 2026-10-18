package com.aumovio.fleet.api;

import com.aumovio.fleet.core.BatteryHealth;
import com.aumovio.fleet.core.FleetReport;
import com.aumovio.fleet.core.FleetRepository;
import com.aumovio.fleet.core.MaintenancePlanner;
import com.aumovio.fleet.core.Vehicle;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * HTTP API for fleet battery health and maintenance planning, built on the JDK HTTP server.
 */
public final class FleetHttpServer {

    private static final String VEHICLES_PREFIX = "/v1/vehicles/";

    private final FleetRepository repository;
    private final Clock clock;
    private final String version;
    private final MaintenancePlanner planner = new MaintenancePlanner();
    private HttpServer server;

    public FleetHttpServer(FleetRepository repository, Clock clock, String version) {
        this.repository = repository;
        this.clock = clock;
        this.version = version;
    }

    /** Starts the server. Pass port 0 to bind an ephemeral port. Returns the bound port. */
    public int start(int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/healthz", ex -> respond(ex, 200, Map.of("status", "ok", "version", version)));
        server.createContext("/v1/vehicles", this::vehicles);
        server.createContext("/v1/fleet/report", ex -> respond(ex, 200, report()));
        server.start();
        return server.getAddress().getPort();
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    private void vehicles(HttpExchange exchange) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, Map.of("error", "method not allowed"));
            return;
        }
        String path = exchange.getRequestURI().getPath();
        if (path.equals("/v1/vehicles") || path.equals("/v1/vehicles/")) {
            List<Map<String, Object>> body = repository.findAll().stream().map(this::summary).toList();
            respond(exchange, 200, Map.of("vehicles", body));
            return;
        }
        String vin = path.substring(VEHICLES_PREFIX.length());
        Optional<Vehicle> vehicle = repository.findByVin(vin);
        if (vehicle.isEmpty()) {
            respond(exchange, 404, Map.of("error", "unknown vehicle"));
            return;
        }
        respond(exchange, 200, summary(vehicle.get()));
    }

    private Map<String, Object> summary(Vehicle v) {
        LocalDate today = LocalDate.now(clock);
        MaintenancePlanner.Plan plan = planner.plan(v, today);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("vin", v.vin());
        out.put("model", v.model());
        out.put("odometerKm", v.odometerKm());
        out.put("stateOfHealthPct", BatteryHealth.stateOfHealthPct(v.nominalCapacityKwh(), v.measuredCapacityKwh()));
        out.put("batteryHealth", BatteryHealth.of(v));
        out.put("maintenanceStatus", plan.status());
        out.put("kmToService", plan.kmRemaining());
        out.put("serviceDueBy", plan.dueByDate().toString());
        return out;
    }

    private Map<String, Object> report() {
        FleetReport r = FleetReport.build(repository.findAll(), LocalDate.now(clock));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("vehicleCount", r.vehicleCount());
        out.put("batteryHealth", r.batteryHealth());
        out.put("maintenance", r.maintenance());
        out.put("vehiclesNeedingAttention", r.vehiclesNeedingAttention());
        return out;
    }

    private static void respond(HttpExchange exchange, int status, Object body) throws IOException {
        byte[] bytes = Json.write(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
