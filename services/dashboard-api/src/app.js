'use strict';

const http = require('node:http');
const { evaluateAlerts, overallStatus } = require('./lib/alerts');
const { summarizeFleet } = require('./lib/fleetSummary');
const { toImperial } = require('./lib/units');

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('malformed JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function validateSnapshot(s) {
  const errors = [];
  if (typeof s !== 'object' || s === null) return ['body must be a JSON object'];
  if (typeof s.vehicleId !== 'string' || s.vehicleId.trim() === '') errors.push('vehicleId is required');
  for (const field of ['speedKph', 'batteryPercent', 'batteryTempC']) {
    if (typeof s[field] !== 'number') errors.push(`${field} must be a number`);
  }
  if (!Array.isArray(s.tirePressureKpa) || s.tirePressureKpa.length !== 4) {
    errors.push('tirePressureKpa must be an array of 4 numbers');
  }
  if (Number.isNaN(Date.parse(s.lastSeen))) errors.push('lastSeen must be an ISO-8601 timestamp');
  return errors;
}

/**
 * Creates the HTTP server. Dependencies are injected so tests can control time and data.
 */
function createApp({ store, now = () => Date.now(), version = 'dev' }) {
  const routes = [
    {
      method: 'GET',
      pattern: /^\/healthz$/,
      handle: (_req, res) => sendJson(res, 200, { status: 'ok', version }),
    },
    {
      method: 'GET',
      pattern: /^\/v1\/fleet\/summary$/,
      handle: (_req, res) => sendJson(res, 200, summarizeFleet(store.all(), now())),
    },
    {
      method: 'GET',
      pattern: /^\/v1\/vehicles\/([^/]+)$/,
      handle: (req, res, [id], url) => {
        const snapshot = store.get(decodeURIComponent(id));
        if (!snapshot) return sendJson(res, 404, { error: 'unknown vehicle' });
        const alerts = evaluateAlerts(snapshot, now());
        const view = url.searchParams.get('units') === 'imperial' ? toImperial(snapshot) : snapshot;
        return sendJson(res, 200, { ...view, status: overallStatus(alerts), alerts });
      },
    },
    {
      method: 'PUT',
      pattern: /^\/v1\/vehicles\/([^/]+)$/,
      handle: async (req, res, [id]) => {
        const body = await readJson(req);
        const snapshot = { ...body, vehicleId: decodeURIComponent(id) };
        const errors = validateSnapshot(snapshot);
        if (errors.length > 0) return sendJson(res, 422, { errors });
        store.upsert(snapshot);
        return sendJson(res, 200, { ...snapshot, alerts: evaluateAlerts(snapshot, now()) });
      },
    },
  ];

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const matching = routes.filter((r) => r.pattern.test(url.pathname));
    if (matching.length === 0) return sendJson(res, 404, { error: 'not found' });

    const route = matching.find((r) => r.method === req.method);
    if (!route) return sendJson(res, 405, { error: 'method not allowed' });

    try {
      const params = url.pathname.match(route.pattern).slice(1);
      await route.handle(req, res, params, url);
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.status ? err.message : 'internal error' });
    }
    return undefined;
  });
}

module.exports = { createApp, validateSnapshot };
