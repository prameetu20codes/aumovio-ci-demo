package com.aumovio.fleet.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class FleetRepositoryTest {

    @Test
    void findsVehiclesSortedByVin() {
        FleetRepository repo = new FleetRepository(List.of(TestVehicles.healthy("VIN-2"), TestVehicles.healthy("VIN-1")));

        assertEquals(List.of("VIN-1", "VIN-2"), repo.findAll().stream().map(Vehicle::vin).toList());
    }

    @Test
    void findByVin() {
        FleetRepository repo = new FleetRepository(List.of(TestVehicles.healthy("VIN-1")));

        assertTrue(repo.findByVin("VIN-1").isPresent());
        assertTrue(repo.findByVin("VIN-9").isEmpty());
    }

    @Test
    void saveReplacesExistingVehicle() {
        FleetRepository repo = new FleetRepository(List.of(TestVehicles.healthy("VIN-1")));
        repo.save(TestVehicles.vehicle("VIN-1", 10.0, 50_000, 40_000, TestVehicles.TODAY));

        assertEquals(1, repo.findAll().size());
        assertEquals(50_000, repo.findByVin("VIN-1").orElseThrow().odometerKm());
    }
}
