package com.aumovio.fleet.core;

import java.time.LocalDate;
import java.util.Objects;

/**
 * A vehicle in the fleet, with the data needed for battery and maintenance planning.
 */
public record Vehicle(
        String vin,
        String model,
        long odometerKm,
        double nominalCapacityKwh,
        double measuredCapacityKwh,
        long lastServiceOdometerKm,
        LocalDate lastServiceDate) {

    public Vehicle {
        Objects.requireNonNull(vin, "vin");
        Objects.requireNonNull(model, "model");
        Objects.requireNonNull(lastServiceDate, "lastServiceDate");
        if (vin.isBlank()) {
            throw new IllegalArgumentException("vin must not be blank");
        }
        if (odometerKm < 0 || lastServiceOdometerKm < 0) {
            throw new IllegalArgumentException("odometer values must not be negative");
        }
        if (lastServiceOdometerKm > odometerKm) {
            throw new IllegalArgumentException("last service odometer cannot exceed current odometer");
        }
        if (nominalCapacityKwh <= 0 || measuredCapacityKwh < 0) {
            throw new IllegalArgumentException("battery capacity values must be positive");
        }
    }
}
