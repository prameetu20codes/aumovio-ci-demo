const REQUEST_TIMEOUT_MS = Number(process.env.E2E_REQUEST_TIMEOUT_MS || 10000);

export const urls = {
  telemetry: process.env.TELEMETRY_URL || 'http://localhost:8080',
  fleet: process.env.FLEET_URL || 'http://localhost:8081',
  dashboard: process.env.DASHBOARD_URL || 'http://localhost:3000',
};

export async function request(base, path, { method = 'GET', body } = {}) {
  const res = await fetch(new URL(path, base), {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text };
}

export function uniqueId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}
