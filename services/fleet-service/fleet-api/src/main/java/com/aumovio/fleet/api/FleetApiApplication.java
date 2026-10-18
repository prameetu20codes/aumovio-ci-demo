package com.aumovio.fleet.api;

import com.aumovio.fleet.core.FleetRepository;
import com.aumovio.fleet.core.Vehicle;
import java.io.IOException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

/**
 * Entry point. Seeds a small demo fleet and serves the HTTP API.
 */
public final class FleetApiApplication {

    private FleetApiApplication() { }

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8081"));
        String version = System.getenv().getOrDefault("APP_VERSION", "dev");

        FleetHttpServer server = new FleetHttpServer(new FleetRepository(demoFleet()), Clock.systemUTC(), version);
        int bound = server.start(port);
        Runtime.getRuntime().addShutdownHook(new Thread(server::stop));
        System.out.printf("fleet-api %s listening on :%d%n", version, bound);
    }

    static List<Vehicle> demoFleet() {
        LocalDate today = LocalDate.now(Clock.systemUTC());
        return List.of(
                new Vehicle("WAUZZZ0001", "e-Sedan", 42_000, 82.0, 77.5, 30_000, today.minusMonths(4)),
                new Vehicle("WAUZZZ0002", "e-SUV", 118_000, 95.0, 70.1, 89_500, today.minusMonths(11)),
                new Vehicle("WAUZZZ0003", "e-Van", 210_000, 75.0, 49.0, 170_000, today.minusMonths(14)));
    }
}
