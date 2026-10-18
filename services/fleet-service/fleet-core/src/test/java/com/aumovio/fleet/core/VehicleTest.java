package com.aumovio.fleet.core;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class VehicleTest {

    @Test
    void acceptsValidVehicle() {
        assertDoesNotThrow(() -> TestVehicles.healthy("VIN-1"));
    }

    @Test
    void rejectsBlankVin() {
        assertThrows(IllegalArgumentException.class,
                () -> TestVehicles.vehicle(" ", 70, 1000, 0, TestVehicles.TODAY));
    }

    @Test
    void rejectsServiceOdometerAheadOfCurrent() {
        assertThrows(IllegalArgumentException.class,
                () -> TestVehicles.vehicle("VIN-1", 70, 1000, 2000, TestVehicles.TODAY));
    }

    @Test
    void rejectsNegativeOdometer() {
        assertThrows(IllegalArgumentException.class,
                () -> TestVehicles.vehicle("VIN-1", 70, -1, 0, TestVehicles.TODAY));
    }

    @Test
    void rejectsNonPositiveNominalCapacity() {
        assertThrows(IllegalArgumentException.class,
                () -> new Vehicle("VIN-1", "x", 10, 0, 0, 0, TestVehicles.TODAY));
    }

    @Test
    void rejectsNullModel() {
        assertThrows(NullPointerException.class,
                () -> new Vehicle("VIN-1", null, 10, 80, 70, 0, TestVehicles.TODAY));
    }
}
