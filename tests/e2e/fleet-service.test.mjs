import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { request, urls } from './lib/http.mjs';

const base = urls.fleet;

describe('fleet-service', () => {
  test('reports healthy', async () => {
    const res = await request(base, '/healthz');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
  });

  test('lists vehicles with battery and maintenance data', async () => {
    const res = await request(base, '/v1/vehicles');
    assert.equal(res.status, 200);
    assert.ok(res.json.vehicles.length > 0, 'expected seeded vehicles');
    for (const v of res.json.vehicles) {
      for (const field of ['vin', 'model', 'odometerKm', 'stateOfHealthPct', 'batteryHealth', 'maintenanceStatus', 'kmToService', 'serviceDueBy']) {
        assert.ok(field in v, `vehicle ${v.vin} is missing ${field}`);
      }
      assert.ok(v.stateOfHealthPct >= 0 && v.stateOfHealthPct <= 100, `stateOfHealthPct out of range for ${v.vin}`);
    }
  });

  test('returns a single vehicle by VIN', async () => {
    const list = await request(base, '/v1/vehicles');
    const vin = list.json.vehicles[0].vin;
    const res = await request(base, `/v1/vehicles/${vin}`);
    assert.equal(res.status, 200);
    assert.equal(res.json.vin, vin);
  });

  test('fleet report is consistent with the vehicle list', async () => {
    const [report, list] = await Promise.all([request(base, '/v1/fleet/report'), request(base, '/v1/vehicles')]);
    assert.equal(report.status, 200);
    assert.equal(report.json.vehicleCount, list.json.vehicles.length);
    const healthTotal = Object.values(report.json.batteryHealth).reduce((a, b) => a + b, 0);
    const maintenanceTotal = Object.values(report.json.maintenance).reduce((a, b) => a + b, 0);
    assert.equal(healthTotal, report.json.vehicleCount);
    assert.equal(maintenanceTotal, report.json.vehicleCount);
    const vins = new Set(list.json.vehicles.map((v) => v.vin));
    for (const vin of report.json.vehiclesNeedingAttention) {
      assert.ok(vins.has(vin), `report flags unknown vehicle ${vin}`);
    }
  });

  test('returns 404 for an unknown VIN', async () => {
    const res = await request(base, '/v1/vehicles/VIN-DOES-NOT-EXIST');
    assert.equal(res.status, 404);
  });

  test('rejects writes with 405', async () => {
    const res = await request(base, '/v1/vehicles', { method: 'POST', body: {} });
    assert.equal(res.status, 405);
  });
});
