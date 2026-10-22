'use strict';

const { evaluateAlerts, overallStatus } = require('./alerts');

/**
 * Builds the fleet overview tile shown at the top of the operations dashboard.
 */
function summarizeFleet(snapshots, now = Date.now()) {
  const counts = { OK: 0, INFO: 0, WARNING: 0, CRITICAL: 0 };
  const vehicles = snapshots.map((s) => {
    const alerts = evaluateAlerts(s, now);
    const status = overallStatus(alerts);
    counts[status] += 1;
    return { vehicleId: s.vehicleId, status, alerts };
  });

  const avgBattery =
    snapshots.length === 0
      ? null
      : Math.round(snapshots.reduce((sum, s) => sum + s.batteryPercent, 0) / snapshots.length);

  return {
    vehicleCount: snapshots.length,
    avgBatteryPercent: avgBattery,
    statusCounts: counts,
    needsAttention: vehicles
      .filter((v) => v.status === 'CRITICAL' || v.status === 'WARNING')
      .map((v) => v.vehicleId)
      .sort(),
    vehicles,
  };
}

module.exports = { summarizeFleet };
