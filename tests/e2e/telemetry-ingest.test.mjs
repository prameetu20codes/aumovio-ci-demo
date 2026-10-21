import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { request, uniqueId, urls } from './lib/http.mjs';

const base = urls.telemetry;

function reading(vehicleId, overrides = {}) {
  return {
    vehicleId,
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    speedKph: 80,
    batteryPercent: 60,
    batteryTempC: 30,
    tirePressureKpa: [230, 230, 230, 230],
    ...overrides,
  };
}

describe('telemetry-ingest', () => {
  test('reports healthy', async () => {
    const res = await request(base, '/healthz');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
  });

  test('accepts a valid reading', async () => {
    const res = await request(base, '/v1/readings', { method: 'POST', body: reading(uniqueId('E2E')) });
    assert.equal(res.status, 202);
    assert.equal(res.json.accepted, true);
    assert.deepEqual(res.json.alerts, []);
  });

  test('aggregates speed statistics across readings', async () => {
    const id = uniqueId('E2E');
    for (const speedKph of [60, 120, 30]) {
      const res = await request(base, '/v1/readings', { method: 'POST', body: reading(id, { speedKph }) });
      assert.equal(res.status, 202);
    }
    const stats = await request(base, `/v1/vehicles/${id}/stats`);
    assert.equal(stats.status, 200);
    assert.equal(stats.json.samples, 3);
    assert.equal(stats.json.maxSpeedKph, 120);
    assert.equal(stats.json.avgSpeedKph, 70, 'average speed must be the mean of all readings');
  });

  test('raises a BATTERY_LOW warning at 20 percent', async () => {
    const res = await request(base, '/v1/readings', {
      method: 'POST',
      body: reading(uniqueId('E2E'), { batteryPercent: 20 }),
    });
    assert.equal(res.status, 202);
    assert.deepEqual(
      res.json.alerts.map((a) => [a.code, a.severity]),
      [['BATTERY_LOW', 'WARNING']],
    );
  });

  test('rejects physically impossible readings with 422', async () => {
    const res = await request(base, '/v1/readings', {
      method: 'POST',
      body: reading(uniqueId('E2E'), { speedKph: 999 }),
    });
    assert.equal(res.status, 422);
    assert.match(res.json.error, /speedKph/);
  });

  test('rejects unknown fields with 400', async () => {
    const res = await request(base, '/v1/readings', {
      method: 'POST',
      body: { ...reading(uniqueId('E2E')), unexpected: true },
    });
    assert.equal(res.status, 400);
  });

  test('returns 404 for an unknown vehicle', async () => {
    const res = await request(base, `/v1/vehicles/${uniqueId('NOPE')}/stats`);
    assert.equal(res.status, 404);
  });
});
