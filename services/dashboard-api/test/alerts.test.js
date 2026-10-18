'use strict';

const { evaluateAlerts, overallStatus } = require('../src/lib/alerts');

const NOW = Date.parse('2026-10-18T12:00:00Z');

function snapshot(overrides = {}) {
  return {
    vehicleId: 'VIN-1',
    batteryPercent: 80,
    batteryTempC: 30,
    tirePressureKpa: [230, 230, 230, 230],
    lastSeen: new Date(NOW - 60000).toISOString(),
    ...overrides,
  };
}

describe('evaluateAlerts', () => {
  test('healthy vehicle has no alerts', () => {
    expect(evaluateAlerts(snapshot(), NOW)).toEqual([]);
  });

  test.each([
    [{ batteryPercent: 20 }, 'BATTERY_LOW', 'WARNING'],
    [{ batteryPercent: 5 }, 'BATTERY_LOW', 'CRITICAL'],
    [{ batteryTempC: 50 }, 'BATTERY_HOT', 'WARNING'],
    [{ batteryTempC: 60 }, 'BATTERY_HOT', 'CRITICAL'],
    [{ tirePressureKpa: [199, 230, 230, 230] }, 'TIRE_PRESSURE_LOW', 'WARNING'],
    [{ lastSeen: new Date(NOW - 20 * 60000).toISOString() }, 'OFFLINE', 'INFO'],
    [{ lastSeen: new Date(NOW - 90 * 60000).toISOString() }, 'OFFLINE', 'WARNING'],
  ])('%p raises %s/%s', (overrides, code, severity) => {
    expect(evaluateAlerts(snapshot(overrides), NOW)).toEqual([{ code, severity }]);
  });

  test('sorts alerts with the most severe first', () => {
    const alerts = evaluateAlerts(
      snapshot({ batteryPercent: 15, batteryTempC: 65, lastSeen: new Date(NOW - 20 * 60000).toISOString() }),
      NOW,
    );

    expect(alerts.map((a) => a.severity)).toEqual(['CRITICAL', 'WARNING', 'INFO']);
  });
});

describe('overallStatus', () => {
  test('OK when there are no alerts', () => {
    expect(overallStatus([])).toBe('OK');
  });

  test('returns the worst severity', () => {
    expect(overallStatus([{ severity: 'INFO' }, { severity: 'CRITICAL' }, { severity: 'WARNING' }])).toBe('CRITICAL');
  });

  test('INFO only stays INFO', () => {
    expect(overallStatus([{ severity: 'INFO' }])).toBe('INFO');
  });
});
