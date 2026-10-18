'use strict';

const { kmToMiles, celsiusToFahrenheit, kpaToPsi, toImperial, round } = require('../src/lib/units');

describe('units', () => {
  test.each([
    [0, 0],
    [100, 62.1],
    [160.9344, 100],
  ])('kmToMiles(%p) = %p', (km, miles) => {
    expect(kmToMiles(km)).toBe(miles);
  });

  test.each([
    [0, 32],
    [100, 212],
    [-40, -40],
    [37, 98.6],
  ])('celsiusToFahrenheit(%p) = %p', (c, f) => {
    expect(celsiusToFahrenheit(c)).toBe(f);
  });

  test('kpaToPsi converts typical tire pressure', () => {
    expect(kpaToPsi(230)).toBe(33.4);
  });

  test.each([NaN, Infinity, '12', null])('rejects non-finite input %p', (bad) => {
    expect(() => kmToMiles(bad)).toThrow(TypeError);
  });

  test('round honours digits', () => {
    expect(round(1.23456, 3)).toBe(1.235);
  });

  test('toImperial converts every metric field and keeps the rest', () => {
    const result = toImperial({
      vehicleId: 'VIN-1',
      speedKph: 100,
      batteryTempC: 20,
      tirePressureKpa: [230, 230, 230, 230],
    });

    expect(result).toMatchObject({
      vehicleId: 'VIN-1',
      speed: 62.1,
      speedUnit: 'mph',
      batteryTemp: 68,
      tirePressure: [33.4, 33.4, 33.4, 33.4],
      tirePressureUnit: 'psi',
    });
  });
});
