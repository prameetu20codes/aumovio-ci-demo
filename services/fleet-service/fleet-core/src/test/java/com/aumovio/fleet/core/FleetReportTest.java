package com.aumovio.fleet.core;

import static com.aumovio.fleet.core.TestVehicles.TODAY;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class FleetReportTest {

    @Test
    void summarisesFleet() {
        List<Vehicle> fleet = List.of(
                TestVehicles.healthy("VIN-A"),
                TestVehicles.vehicle("VIN-C", 50.0, 20_000, 10_000, TODAY.minusMonths(2)),
                TestVehicles.vehicle("VIN-B", 60.0, 70_000, 30_000, TODAY.minusMonths(2)));

        FleetReport report = FleetReport.build(fleet, TODAY);

        assertEquals(3, report.vehicleCount());
        assertEquals(1, report.batteryHealth().get(BatteryHealth.GOOD));
        assertEquals(1, report.batteryHealth().get(BatteryHealth.DEGRADED));
        assertEquals(1, report.batteryHealth().get(BatteryHealth.REPLACE));
        assertEquals(2, report.maintenance().get(MaintenancePlanner.Status.OK));
        assertEquals(1, report.maintenance().get(MaintenancePlanner.Status.OVERDUE));
        assertEquals(List.of("VIN-B", "VIN-C"), report.vehiclesNeedingAttention());
    }

    @Test
    void emptyFleet() {
        FleetReport report = FleetReport.build(List.of(), TODAY);

        assertEquals(0, report.vehicleCount());
        assertEquals(0, report.batteryHealth().get(BatteryHealth.GOOD));
        assertTrue(report.vehiclesNeedingAttention().isEmpty());
    }
}
