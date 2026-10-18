package com.aumovio.fleet.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class BatteryHealthTest {

    @ParameterizedTest(name = "{0} kWh of 80 kWh -> {1}%")
    @CsvSource({
        "80.0, 100.0",
        "72.0, 90.0",
        "60.0, 75.0",
        "53.37, 66.7",
        "90.0, 100.0"
    })
    void computesStateOfHealth(double measured, double expectedPct) {
        assertEquals(expectedPct, BatteryHealth.stateOfHealthPct(80.0, measured), 0.001);
    }

    @ParameterizedTest(name = "{0}% -> {1}")
    @CsvSource({
        "100.0, GOOD",
        "80.0, GOOD",
        "79.9, DEGRADED",
        "70.0, DEGRADED",
        "69.9, REPLACE",
        "0.0, REPLACE"
    })
    void classifiesStateOfHealth(double soh, BatteryHealth expected) {
        assertEquals(expected, BatteryHealth.classify(soh));
    }

    @Test
    void classifiesVehicle() {
        assertEquals(BatteryHealth.REPLACE,
                BatteryHealth.of(TestVehicles.vehicle("VIN-1", 40.0, 1000, 0, TestVehicles.TODAY)));
    }

    @Test
    void rejectsInvalidCapacities() {
        assertThrows(IllegalArgumentException.class, () -> BatteryHealth.stateOfHealthPct(0, 10));
        assertThrows(IllegalArgumentException.class, () -> BatteryHealth.stateOfHealthPct(80, -1));
    }
}
