package com.aumovio.fleet.core;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Fleet-wide summary used by the operations dashboard.
 */
public record FleetReport(
        int vehicleCount,
        Map<BatteryHealth, Integer> batteryHealth,
        Map<MaintenancePlanner.Status, Integer> maintenance,
        List<String> vehiclesNeedingAttention) {

    public static FleetReport build(Collection<Vehicle> vehicles, LocalDate today) {
        MaintenancePlanner planner = new MaintenancePlanner();
        Map<BatteryHealth, Integer> health = new EnumMap<>(BatteryHealth.class);
        Map<MaintenancePlanner.Status, Integer> maintenance = new EnumMap<>(MaintenancePlanner.Status.class);
        for (BatteryHealth h : BatteryHealth.values()) {
            health.put(h, 0);
        }
        for (MaintenancePlanner.Status s : MaintenancePlanner.Status.values()) {
            maintenance.put(s, 0);
        }

        List<String> attention = new ArrayList<>();
        for (Vehicle v : vehicles) {
            BatteryHealth h = BatteryHealth.of(v);
            MaintenancePlanner.Status s = planner.plan(v, today).status();
            health.merge(h, 1, Integer::sum);
            maintenance.merge(s, 1, Integer::sum);
            if (h == BatteryHealth.REPLACE || s == MaintenancePlanner.Status.OVERDUE) {
                attention.add(v.vin());
            }
        }
        Collections.sort(attention);

        return new FleetReport(
                vehicles.size(),
                Collections.unmodifiableMap(health),
                Collections.unmodifiableMap(maintenance),
                List.copyOf(attention));
    }
}
