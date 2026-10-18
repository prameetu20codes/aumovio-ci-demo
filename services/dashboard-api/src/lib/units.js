'use strict';

const KM_PER_MILE = 1.609344;
const KPA_PER_PSI = 6.894757;

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function kmToMiles(km) {
  assertFiniteNumber(km, 'km');
  return round(km / KM_PER_MILE);
}

function celsiusToFahrenheit(c) {
  assertFiniteNumber(c, 'celsius');
  return round((c * 9) / 5 + 32);
}

function kpaToPsi(kpa) {
  assertFiniteNumber(kpa, 'kpa');
  return round(kpa / KPA_PER_PSI);
}

/**
 * Converts a vehicle snapshot from metric to imperial units for US-market dashboards.
 */
function toImperial(snapshot) {
  return {
    ...snapshot,
    speed: kmToMiles(snapshot.speedKph),
    speedUnit: 'mph',
    batteryTemp: celsiusToFahrenheit(snapshot.batteryTempC),
    batteryTempUnit: 'F',
    tirePressure: snapshot.tirePressureKpa.map(kpaToPsi),
    tirePressureUnit: 'psi',
  };
}

module.exports = { kmToMiles, celsiusToFahrenheit, kpaToPsi, toImperial, round };
