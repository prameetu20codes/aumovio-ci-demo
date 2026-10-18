'use strict';

/**
 * In-memory snapshot store, seeded with demo data so the dashboard has something to show.
 */
function createStore(initial = []) {
  const snapshots = new Map(initial.map((s) => [s.vehicleId, s]));

  return {
    all: () => [...snapshots.values()].sort((a, b) => a.vehicleId.localeCompare(b.vehicleId)),
    get: (id) => snapshots.get(id),
    upsert: (snapshot) => {
      snapshots.set(snapshot.vehicleId, snapshot);
      return snapshot;
    },
  };
}

function demoSnapshots(now = Date.now()) {
  const minutesAgo = (m) => new Date(now - m * 60000).toISOString();
  return [
    { vehicleId: 'VIN-1001', speedKph: 92, batteryPercent: 78, batteryTempC: 31, tirePressureKpa: [230, 231, 229, 232], lastSeen: minutesAgo(1) },
    { vehicleId: 'VIN-1002', speedKph: 0, batteryPercent: 14, batteryTempC: 27, tirePressureKpa: [228, 226, 230, 229], lastSeen: minutesAgo(3) },
    { vehicleId: 'VIN-1003', speedKph: 110, batteryPercent: 55, batteryTempC: 62, tirePressureKpa: [195, 231, 230, 228], lastSeen: minutesAgo(2) },
  ];
}

module.exports = { createStore, demoSnapshots };
