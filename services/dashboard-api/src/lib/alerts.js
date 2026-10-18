'use strict';

const SEVERITY_RANK = { INFO: 0, WARNING: 1, CRITICAL: 2 };

const RULES = [
  {
    code: 'BATTERY_LOW',
    evaluate: (s) => {
      if (s.batteryPercent <= 5) return 'CRITICAL';
      if (s.batteryPercent <= 20) return 'WARNING';
      return null;
    },
  },
  {
    code: 'BATTERY_HOT',
    evaluate: (s) => {
      if (s.batteryTempC >= 60) return 'CRITICAL';
      if (s.batteryTempC >= 50) return 'WARNING';
      return null;
    },
  },
  {
    code: 'TIRE_PRESSURE_LOW',
    evaluate: (s) => (Math.min(...s.tirePressureKpa) < 200 ? 'WARNING' : null),
  },
  {
    code: 'OFFLINE',
    evaluate: (s, now) => {
      const ageMinutes = (now - new Date(s.lastSeen).getTime()) / 60000;
      if (ageMinutes > 60) return 'WARNING';
      if (ageMinutes > 15) return 'INFO';
      return null;
    },
  },
];

/**
 * Returns all alerts raised for one vehicle snapshot, most severe first.
 */
function evaluateAlerts(snapshot, now = Date.now()) {
  return RULES.map((rule) => ({ code: rule.code, severity: rule.evaluate(snapshot, now) }))
    .filter((alert) => alert.severity !== null)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

/**
 * Highest severity across a list of alerts, or 'OK' if there are none.
 */
function overallStatus(alerts) {
  if (alerts.length === 0) return 'OK';
  return alerts.reduce((worst, a) =>
    SEVERITY_RANK[a.severity] > SEVERITY_RANK[worst] ? a.severity : worst,
  'INFO');
}

module.exports = { evaluateAlerts, overallStatus, SEVERITY_RANK };
