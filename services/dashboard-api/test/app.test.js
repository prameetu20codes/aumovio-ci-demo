'use strict';

const { createApp, validateSnapshot } = require('../src/app');
const { createStore, demoSnapshots } = require('../src/lib/store');

const NOW = Date.parse('2026-10-18T12:00:00Z');

let server;
let baseUrl;

beforeEach(async () => {
  server = createApp({ store: createStore(demoSnapshots(NOW)), now: () => NOW, version: 'test' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('HTTP API', () => {
  test('GET /healthz', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', version: 'test' });
  });

  test('GET /v1/fleet/summary', async () => {
    const res = await fetch(`${baseUrl}/v1/fleet/summary`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.vehicleCount).toBe(3);
    expect(body.needsAttention).toEqual(['VIN-1002', 'VIN-1003']);
  });

  test('GET /v1/vehicles/:id returns status and alerts', async () => {
    const res = await fetch(`${baseUrl}/v1/vehicles/VIN-1003`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('CRITICAL');
    expect(body.alerts.map((a) => a.code)).toEqual(['BATTERY_HOT', 'TIRE_PRESSURE_LOW']);
  });

  test('GET /v1/vehicles/:id?units=imperial converts units', async () => {
    const res = await fetch(`${baseUrl}/v1/vehicles/VIN-1001?units=imperial`);
    const body = await res.json();
    expect(body.speedUnit).toBe('mph');
    expect(body.speed).toBe(57.2);
  });

  test('unknown vehicle returns 404', async () => {
    const res = await fetch(`${baseUrl}/v1/vehicles/NOPE`);
    expect(res.status).toBe(404);
  });

  test('PUT /v1/vehicles/:id stores a valid snapshot', async () => {
    const snapshot = {
      speedKph: 50,
      batteryPercent: 4,
      batteryTempC: 25,
      tirePressureKpa: [230, 230, 230, 230],
      lastSeen: new Date(NOW).toISOString(),
    };
    const put = await fetch(`${baseUrl}/v1/vehicles/VIN-2000`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    expect(put.status).toBe(200);
    expect((await put.json()).alerts).toEqual([{ code: 'BATTERY_LOW', severity: 'CRITICAL' }]);

    const get = await fetch(`${baseUrl}/v1/vehicles/VIN-2000`);
    expect(get.status).toBe(200);
  });

  test('PUT with invalid body returns 422', async () => {
    const res = await fetch(`${baseUrl}/v1/vehicles/VIN-2000`, { method: 'PUT', body: '{"speedKph":"fast"}' });
    expect(res.status).toBe(422);
    expect((await res.json()).errors).toEqual(
      expect.arrayContaining(['speedKph must be a number', 'lastSeen must be an ISO-8601 timestamp']),
    );
  });

  test('PUT with malformed JSON returns 400', async () => {
    const res = await fetch(`${baseUrl}/v1/vehicles/VIN-2000`, { method: 'PUT', body: '{nope' });
    expect(res.status).toBe(400);
  });

  test('unsupported method returns 405', async () => {
    const res = await fetch(`${baseUrl}/healthz`, { method: 'DELETE' });
    expect(res.status).toBe(405);
  });

  test('unknown route returns 404', async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });
});

describe('validateSnapshot', () => {
  test('rejects non-objects', () => {
    expect(validateSnapshot(null)).toEqual(['body must be a JSON object']);
  });
});
