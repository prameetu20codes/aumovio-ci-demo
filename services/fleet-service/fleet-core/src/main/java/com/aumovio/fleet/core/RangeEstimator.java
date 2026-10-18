package com.aumovio.fleet.core;

/**
 * Estimates remaining driving range from battery charge and average consumption.
 */
public final class RangeEstimator {

    /** Fraction of the battery kept in reserve and never counted as usable range. */
    static final double RESERVE_FRACTION = 0.05;

    public double remainingRangeKm(Vehicle vehicle, double chargePct, double consumptionKwhPer100Km) {
        if (chargePct < 0 || chargePct > 100) {
            throw new IllegalArgumentException("charge must be between 0 and 100");
        }
        if (consumptionKwhPer100Km <= 0) {
            throw new IllegalArgumentException("consumption must be positive");
        }
        double usableFraction = Math.max(0.0, chargePct / 100.0 - RESERVE_FRACTION);
        double usableKwh = vehicle.measuredCapacityKwh() * usableFraction;
        double rangeKm = usableKwh / consumptionKwhPer100Km * 100.0;
        return Math.round(rangeKm * 10.0) / 10.0;
    }
}
