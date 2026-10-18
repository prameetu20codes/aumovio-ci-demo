package com.aumovio.fleet.core;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * Decides when a vehicle is next due for service: every {@value #SERVICE_INTERVAL_KM} km or every
 * {@value #SERVICE_INTERVAL_MONTHS} months, whichever comes first.
 */
public final class MaintenancePlanner {

    public static final long SERVICE_INTERVAL_KM = 30_000;
    public static final int SERVICE_INTERVAL_MONTHS = 12;
    static final long DUE_SOON_KM = 2_000;
    static final long DUE_SOON_DAYS = 30;

    public enum Status { OK, DUE_SOON, OVERDUE }

    public record Plan(Status status, long kmRemaining, LocalDate dueByDate) { }

    public Plan plan(Vehicle vehicle, LocalDate today) {
        long kmSinceService = vehicle.odometerKm() - vehicle.lastServiceOdometerKm();
        long kmRemaining = SERVICE_INTERVAL_KM - kmSinceService;
        LocalDate dueBy = vehicle.lastServiceDate().plusMonths(SERVICE_INTERVAL_MONTHS);
        long daysRemaining = ChronoUnit.DAYS.between(today, dueBy);

        Status status;
        if (kmRemaining <= 0 || daysRemaining < 0) {
            status = Status.OVERDUE;
        } else if (kmRemaining <= DUE_SOON_KM || daysRemaining <= DUE_SOON_DAYS) {
            status = Status.DUE_SOON;
        } else {
            status = Status.OK;
        }
        return new Plan(status, Math.max(0, kmRemaining), dueBy);
    }
}
