package com.aumovio.fleet.core;

import static com.aumovio.fleet.core.TestVehicles.TODAY;
import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class MaintenancePlannerTest {

    private final MaintenancePlanner planner = new MaintenancePlanner();

    @Test
    void okWhenWellWithinIntervals() {
        Vehicle v = TestVehicles.vehicle("VIN-1", 76, 40_000, 30_000, TODAY.minusMonths(3));

        MaintenancePlanner.Plan plan = planner.plan(v, TODAY);

        assertEquals(MaintenancePlanner.Status.OK, plan.status());
        assertEquals(20_000, plan.kmRemaining());
        assertEquals(TODAY.plusMonths(9), plan.dueByDate());
    }

    @Test
    void dueSoonByDistance() {
        Vehicle v = TestVehicles.vehicle("VIN-1", 76, 58_500, 30_000, TODAY.minusMonths(1));

        assertEquals(MaintenancePlanner.Status.DUE_SOON, planner.plan(v, TODAY).status());
    }

    @Test
    void dueSoonByDate() {
        Vehicle v = TestVehicles.vehicle("VIN-1", 76, 31_000, 30_000, TODAY.minusMonths(12).plusDays(10));

        assertEquals(MaintenancePlanner.Status.DUE_SOON, planner.plan(v, TODAY).status());
    }

    @Test
    void overdueByDistance() {
        Vehicle v = TestVehicles.vehicle("VIN-1", 76, 61_000, 30_000, TODAY.minusMonths(2));

        MaintenancePlanner.Plan plan = planner.plan(v, TODAY);

        assertEquals(MaintenancePlanner.Status.OVERDUE, plan.status());
        assertEquals(0, plan.kmRemaining());
    }

    @Test
    void overdueByDate() {
        Vehicle v = TestVehicles.vehicle("VIN-1", 76, 31_000, 30_000, TODAY.minusMonths(13));

        assertEquals(MaintenancePlanner.Status.OVERDUE, planner.plan(v, TODAY).status());
    }
}
