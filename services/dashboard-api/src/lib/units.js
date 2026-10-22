'use strict';

// Conversion factors, expressed as multipliers from metric to imperial.
const MILES_PER_KM = 1.609344;
const PSI_PER_KPA = 1 / 6.894757;

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
  return round(km * MILES_PER_KM);
}

function celsiusToFahrenheit(c) {
  assertFiniteNumber(c, 'celsius');
  return round((c * 9) / 5 + 32);
}

function kpaToPsi(kpa) {
  assertFiniteNumber(kpa, 'kpa');
  return round(kpa * PSI_PER_KPA);
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
