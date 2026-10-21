import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { request, uniqueId, urls } from './lib/http.mjs';

// One vehicle reporting a low battery must be flagged consistently by the ingest
// service (alerting) and the dashboard (operator view).
describe('fleet operations journey', () => {
  test('a low-battery vehicle is alerted on ingest and flagged on the dashboard', async () => {
    const id = uniqueId('JOURNEY');
    const now = new Date();

    const ingest = await request(urls.telemetry, '/v1/readings', {
      method: 'POST',
      body: {
        vehicleId: id,
        timestamp: now.toISOString(),
        speedKph: 40,
        batteryPercent: 12,
        batteryTempC: 28,
        tirePressureKpa: [231, 229, 230, 232],
      },
    });
    assert.equal(ingest.status, 202);
    const ingestCodes = ingest.json.alerts.map((a) => a.code);
    assert.deepEqual(ingestCodes, ['BATTERY_LOW']);

    const put = await request(urls.dashboard, `/v1/vehicles/${id}`, {
      method: 'PUT',
      body: {
        speedKph: 40,
        batteryPercent: 12,
        batteryTempC: 28,
        tirePressureKpa: [231, 229, 230, 232],
        lastSeen: now.toISOString(),
      },
    });
    assert.equal(put.status, 200);
    assert.deepEqual(put.json.alerts.map((a) => a.code), ingestCodes, 'both services must raise the same alert codes');

    const summary = await request(urls.dashboard, '/v1/fleet/summary');
    assert.ok(summary.json.needsAttention.includes(id), `${id} should be listed in needsAttention`);
    const tile = summary.json.vehicles.find((v) => v.vehicleId === id);
    assert.equal(tile.status, 'WARNING');
  });

  test('every service reports healthy at the same time', async () => {
    const results = await Promise.all(Object.values(urls).map((base) => request(base, '/healthz')));
    assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
  });
});
