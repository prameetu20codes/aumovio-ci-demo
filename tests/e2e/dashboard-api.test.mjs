import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { request, uniqueId, urls } from './lib/http.mjs';

const base = urls.dashboard;

function snapshot(overrides = {}) {
  return {
    speedKph: 50,
    batteryPercent: 70,
    batteryTempC: 30,
    tirePressureKpa: [230, 230, 230, 230],
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

describe('dashboard-api', () => {
  test('reports healthy', async () => {
    const res = await request(base, '/healthz');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
  });

  test('fleet summary exposes the dashboard tile contract', async () => {
    const res = await request(base, '/v1/fleet/summary');
    assert.equal(res.status, 200);
    assert.equal(typeof res.json.vehicleCount, 'number');
    assert.equal(typeof res.json.averageBatteryPercent, 'number');
    assert.deepEqual(Object.keys(res.json.statusCounts).sort(), ['CRITICAL', 'INFO', 'OK', 'WARNING']);
    assert.ok(Array.isArray(res.json.needsAttention));
  });

  test('stores a snapshot and serves it back with alerts', async () => {
    const id = uniqueId('E2E');
    const put = await request(base, `/v1/vehicles/${id}`, { method: 'PUT', body: snapshot({ batteryPercent: 15 }) });
    assert.equal(put.status, 200);
    const get = await request(base, `/v1/vehicles/${id}`);
    assert.equal(get.status, 200);
    assert.equal(get.json.status, 'WARNING');
    assert.deepEqual(get.json.alerts.map((a) => a.code), ['BATTERY_LOW']);
  });

  test('converts a vehicle to imperial units', async () => {
    const id = uniqueId('E2E');
    await request(base, `/v1/vehicles/${id}`, { method: 'PUT', body: snapshot({ speedKph: 100, batteryTempC: 25 }) });
    const res = await request(base, `/v1/vehicles/${id}?units=imperial`);
    assert.equal(res.status, 200);
    assert.equal(res.json.speed, 62.1);
    assert.equal(res.json.speedUnit, 'mph');
    assert.equal(res.json.batteryTemp, 77);
  });

  test('rejects an invalid snapshot with 422', async () => {
    const res = await request(base, `/v1/vehicles/${uniqueId('E2E')}`, {
      method: 'PUT',
      body: snapshot({ tirePressureKpa: [230] }),
    });
    assert.equal(res.status, 422);
    assert.ok(res.json.errors.some((e) => e.includes('tirePressureKpa')));
  });
});
