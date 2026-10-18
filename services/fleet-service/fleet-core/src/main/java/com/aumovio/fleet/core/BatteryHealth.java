package com.aumovio.fleet.core;

/**
 * Battery state-of-health (SoH) classification.
 */
public enum BatteryHealth {
    GOOD,
    DEGRADED,
    REPLACE;

    static final double GOOD_THRESHOLD_PCT = 80.0;
    static final double DEGRADED_THRESHOLD_PCT = 70.0;

    /**
     * Computes state of health as the measured usable capacity relative to the nominal capacity,
     * capped at 100%.
     */
    public static double stateOfHealthPct(double nominalCapacityKwh, double measuredCapacityKwh) {
        if (nominalCapacityKwh <= 0) {
            throw new IllegalArgumentException("nominal capacity must be positive");
        }
        if (measuredCapacityKwh < 0) {
            throw new IllegalArgumentException("measured capacity must not be negative");
        }
        double soh = measuredCapacityKwh / nominalCapacityKwh * 100.0;
        return Math.min(100.0, Math.round(soh * 10.0) / 10.0);
    }

    public static BatteryHealth classify(double stateOfHealthPct) {
        if (stateOfHealthPct >= GOOD_THRESHOLD_PCT) {
            return GOOD;
        }
        if (stateOfHealthPct >= DEGRADED_THRESHOLD_PCT) {
            return DEGRADED;
        }
        return REPLACE;
    }

    public static BatteryHealth of(Vehicle vehicle) {
        return classify(stateOfHealthPct(vehicle.nominalCapacityKwh(), vehicle.measuredCapacityKwh()));
    }
}
