package com.aumovio.fleet.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class RangeEstimatorTest {

    private final RangeEstimator estimator = new RangeEstimator();
    private final Vehicle vehicle = TestVehicles.vehicle("VIN-1", 75.0, 10_000, 0, TestVehicles.TODAY);

    @Test
    void estimatesRangeExcludingReserve() {
        // 75 kWh * (0.80 - 0.05) = 56.25 kWh usable at 15 kWh/100km -> 375 km
        assertEquals(375.0, estimator.remainingRangeKm(vehicle, 80, 15), 0.001);
    }

    @Test
    void returnsZeroWhenOnlyReserveLeft() {
        assertEquals(0.0, estimator.remainingRangeKm(vehicle, 4, 15), 0.001);
    }

    @Test
    void rejectsInvalidInputs() {
        assertThrows(IllegalArgumentException.class, () -> estimator.remainingRangeKm(vehicle, 101, 15));
        assertThrows(IllegalArgumentException.class, () -> estimator.remainingRangeKm(vehicle, 50, 0));
    }
}
