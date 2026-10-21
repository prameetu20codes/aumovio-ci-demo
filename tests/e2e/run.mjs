// E2E runner used by the pipeline and locally.
//
// 1. Waits for every service to report healthy.
// 2. Runs the suite with JUnit output (published to the Harness Tests tab).
// 3. Re-runs failed files once to separate flaky tests from consistent failures.
// 4. Writes an evidence summary for the triage agent and KEY=VALUE outputs for the gate.
//
// It exits 0 even when tests fail: the quality gate step decides the build outcome,
// after the triage agent has classified the failures.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urls } from './lib/http.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const reportDir = process.env.E2E_REPORT_DIR || join(here, 'reports');
const evidenceDir = process.env.E2E_EVIDENCE_DIR || join(reportDir, 'evidence');
const outputsFile = process.env.E2E_OUTPUTS_FILE || join(reportDir, 'outputs.env');
const healthTimeoutMs = Number(process.env.E2E_HEALTH_TIMEOUT_MS || 180000);

mkdirSync(reportDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

async function waitHealthy(name, base) {
  const deadline = Date.now() + healthTimeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(new URL('/healthz', base), { signal: AbortSignal.timeout(3000) });
      if (res.ok) return { name, base, healthy: true, version: (await res.json()).version };
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.cause?.code || err.message;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { name, base, healthy: false, error: lastError };
}

// One node:test process per file, so every JUnit report maps to exactly one source file.
function runFile(file, junitDir) {
  mkdirSync(junitDir, { recursive: true });
  const junitPath = join(junitDir, `junit-${basename(file, '.test.mjs')}.xml`);
  spawnSync(
    process.execPath,
    ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout',
      '--test-reporter=junit', `--test-reporter-destination=${junitPath}`, file],
    { stdio: ['ignore', 'inherit', 'inherit'], env: process.env },
  );
  return parseJunit(junitPath, relative(repoRoot, file));
}

function decode(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const attrsOf = (s) => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, decode(v)]));

// Minimal parser for the node:test JUnit reporter output.
function parseJunit(path, file) {
  if (!existsSync(path)) {
    return [{ name: '(test file crashed before reporting)', suite: '', file, failed: true, message: 'no JUnit report produced', details: '' }];
  }
  const xml = readFileSync(path, 'utf8');
  const cases = [];
  // Top-level tests are emitted outside any <testsuite>, and describes can nest.
  const suites = [];
  const tokens = /<testsuite\b([^>]*?)(\/?)>|<\/testsuite>|<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const m of xml.matchAll(tokens)) {
    if (m[0].startsWith('</testsuite')) {
      suites.pop();
    } else if (m[0].startsWith('<testsuite')) {
      if (!m[2]) suites.push(attrsOf(m[1]).name || '');
    } else {
      const failure = (m[5] || '').match(/<failure\b([^>]*)>([\s\S]*?)<\/failure>/);
      const details = failure ? decode(failure[2]) : '';
      cases.push({
        name: attrsOf(m[3]).name,
        suite: suites.join(' > '),
        file,
        failed: Boolean(failure),
        message: failure ? attrsOf(failure[1]).message || '' : '',
        actual: (details.match(/^\s*actual: (.*?),?$/m) || [])[1],
        expected: (details.match(/^\s*expected: (.*?),?$/m) || [])[1],
        details: details.slice(0, 4000),
      });
    }
  }
  return cases;
}

const repoRoot = join(here, '..', '..');
const testFiles = readdirSync(here).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => join(here, f));
const health = await Promise.all(Object.entries(urls).map(([name, base]) => waitHealthy(name, base)));
for (const h of health) console.log(`[e2e] ${h.name} ${h.base} -> ${h.healthy ? `healthy (${h.version})` : `UNHEALTHY: ${h.error}`}`);

let status = 'PASSED';
let firstRun = [];
let retryRun = [];

if (health.some((h) => !h.healthy)) {
  status = 'ENVIRONMENT_ERROR';
} else {
  firstRun = testFiles.flatMap((f) => runFile(f, reportDir));

  const failedFiles = [...new Set(firstRun.filter((c) => c.failed).map((c) => join(repoRoot, c.file)))];
  if (failedFiles.length > 0) {
    console.log(`[e2e] re-running ${failedFiles.length} file(s) with failures to detect flakiness`);
    retryRun = failedFiles.flatMap((f) => runFile(f, join(reportDir, 'retry')));
  }
}

const key = (c) => `${c.file} :: ${c.suite} :: ${c.name}`;
const retryByKey = new Map(retryRun.map((c) => [key(c), c]));
const firstFailures = firstRun.filter((c) => c.failed);
const flaky = firstFailures.filter((c) => retryByKey.has(key(c)) && !retryByKey.get(key(c)).failed);
const consistent = firstFailures.filter((c) => !flaky.includes(c));

if (status !== 'ENVIRONMENT_ERROR') {
  if (consistent.length > 0) status = 'FAILED';
  else if (flaky.length > 0) status = 'FLAKY_ONLY';
}

const summary = {
  status,
  total: firstRun.length,
  failedConsistently: consistent.length,
  flaky: flaky.length,
  services: health,
  failures: consistent.map(({ name, suite, file, message, actual, expected, details }) => ({ name, suite, file, message, actual, expected, details })),
  flakyTests: flaky.map(({ name, suite, file, message }) => ({ name, suite, file, firstRunMessage: message })),
};
writeFileSync(join(evidenceDir, 'e2e-summary.json'), JSON.stringify(summary, null, 2));

const outputs = {
  E2E_STATUS: status,
  E2E_TOTAL: String(summary.total),
  E2E_FAILED: String(summary.failedConsistently),
  E2E_FLAKY: String(summary.flaky),
  E2E_NEEDS_TRIAGE: status === 'PASSED' ? 'false' : 'true',
};
writeFileSync(outputsFile, Object.entries(outputs).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');

console.log(`[e2e] status=${status} total=${summary.total} failed=${summary.failedConsistently} flaky=${summary.flaky}`);
for (const f of summary.failures) console.log(`[e2e] FAILED ${f.suite} :: ${f.name} -> ${f.message}`);
