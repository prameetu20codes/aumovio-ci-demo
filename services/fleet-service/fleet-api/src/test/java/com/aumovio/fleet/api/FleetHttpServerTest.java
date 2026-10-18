package com.aumovio.fleet.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.aumovio.fleet.core.FleetRepository;
import com.aumovio.fleet.core.Vehicle;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FleetHttpServerTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 18);
    private static final Clock CLOCK = Clock.fixed(TODAY.atStartOfDay().toInstant(ZoneOffset.UTC), ZoneOffset.UTC);

    private final HttpClient client = HttpClient.newHttpClient();
    private FleetHttpServer server;
    private String baseUrl;

    @BeforeEach
    void start() throws Exception {
        FleetRepository repo = new FleetRepository(List.of(
                new Vehicle("VIN-1", "e-Sedan", 40_000, 80.0, 76.0, 30_000, TODAY.minusMonths(3)),
                new Vehicle("VIN-2", "e-Van", 90_000, 80.0, 50.0, 50_000, TODAY.minusMonths(2))));
        server = new FleetHttpServer(repo, CLOCK, "test");
        baseUrl = "http://localhost:" + server.start(0);
    }

    @AfterEach
    void stop() {
        server.stop();
    }

    private HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create(baseUrl + path)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void health() throws Exception {
        HttpResponse<String> res = get("/healthz");

        assertEquals(200, res.statusCode());
        assertTrue(res.body().contains("\"status\":\"ok\""));
    }

    @Test
    void listsVehicles() throws Exception {
        HttpResponse<String> res = get("/v1/vehicles");

        assertEquals(200, res.statusCode());
        assertTrue(res.body().indexOf("VIN-1") < res.body().indexOf("VIN-2"), "vehicles should be sorted by VIN");
    }

    @Test
    void returnsVehicleSummary() throws Exception {
        HttpResponse<String> res = get("/v1/vehicles/VIN-1");

        assertEquals(200, res.statusCode());
        assertTrue(res.body().contains("\"stateOfHealthPct\":95.0"), res.body());
        assertTrue(res.body().contains("\"batteryHealth\":\"GOOD\""), res.body());
        assertTrue(res.body().contains("\"maintenanceStatus\":\"OK\""), res.body());
    }

    @Test
    void unknownVehicleReturns404() throws Exception {
        assertEquals(404, get("/v1/vehicles/NOPE").statusCode());
    }

    @Test
    void rejectsNonGet() throws Exception {
        HttpResponse<String> res = client.send(
                HttpRequest.newBuilder(URI.create(baseUrl + "/v1/vehicles"))
                        .POST(HttpRequest.BodyPublishers.ofString("{}"))
                        .build(),
                HttpResponse.BodyHandlers.ofString());

        assertEquals(405, res.statusCode());
    }

    @Test
    void fleetReport() throws Exception {
        HttpResponse<String> res = get("/v1/fleet/report");

        assertEquals(200, res.statusCode());
        assertTrue(res.body().contains("\"vehicleCount\":2"), res.body());
        assertTrue(res.body().contains("\"vehiclesNeedingAttention\":[\"VIN-2\"]"), res.body());
    }
}
