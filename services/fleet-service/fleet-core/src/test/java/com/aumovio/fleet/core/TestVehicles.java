package com.aumovio.fleet.core;

import java.time.LocalDate;

final class TestVehicles {

    static final LocalDate TODAY = LocalDate.of(2026, 10, 18);

    private TestVehicles() { }

    static Vehicle vehicle(String vin, double measuredKwh, long odometer, long lastServiceKm, LocalDate lastServiceDate) {
        return new Vehicle(vin, "e-Sedan", odometer, 80.0, measuredKwh, lastServiceKm, lastServiceDate);
    }

    static Vehicle healthy(String vin) {
        return vehicle(vin, 76.0, 40_000, 30_000, TODAY.minusMonths(3));
    }
}
