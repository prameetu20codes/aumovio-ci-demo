package com.aumovio.fleet.core;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Thread-safe in-memory vehicle store.
 */
public final class FleetRepository {

    private final Map<String, Vehicle> vehicles = new ConcurrentHashMap<>();

    public FleetRepository(Collection<Vehicle> initial) {
        initial.forEach(this::save);
    }

    public void save(Vehicle vehicle) {
        vehicles.put(vehicle.vin(), vehicle);
    }

    public Optional<Vehicle> findByVin(String vin) {
        return Optional.ofNullable(vehicles.get(vin));
    }

    public List<Vehicle> findAll() {
        return vehicles.values().stream()
                .sorted((a, b) -> a.vin().compareTo(b.vin()))
                .toList();
    }
}
