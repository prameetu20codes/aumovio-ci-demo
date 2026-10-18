'use strict';

const { summarizeFleet } = require('../src/lib/fleetSummary');
const { demoSnapshots } = require('../src/lib/store');

const NOW = Date.parse('2026-10-18T12:00:00Z');

describe('summarizeFleet', () => {
  test('summarises the demo fleet', () => {
    const summary = summarizeFleet(demoSnapshots(NOW), NOW);

    expect(summary.vehicleCount).toBe(3);
    expect(summary.averageBatteryPercent).toBe(49);
    expect(summary.statusCounts).toEqual({ OK: 1, INFO: 0, WARNING: 1, CRITICAL: 1 });
    expect(summary.needsAttention).toEqual(['VIN-1002', 'VIN-1003']);
  });

  test('handles an empty fleet', () => {
    expect(summarizeFleet([], NOW)).toEqual({
      vehicleCount: 0,
      averageBatteryPercent: null,
      statusCounts: { OK: 0, INFO: 0, WARNING: 0, CRITICAL: 0 },
      needsAttention: [],
      vehicles: [],
    });
  });
});
