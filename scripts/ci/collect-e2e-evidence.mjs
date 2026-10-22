#!/usr/bin/env node
// Builds the evidence bundle the E2E Failure Triage agent classifies. For every failing test it records
// the service under test, whether that service's code and unit tests changed in this diff, the git
// history of both sides, the test source and the service log tail.
//
// Inputs (environment):
//   AGENT_DIR       evidence root (default /harness/.agent)
//   E2E_REPORT_DIR  directory written by tests/e2e/run.mjs (default tests/e2e/reports)
// Outputs: $AGENT_DIR/e2e/evidence.json and $AGENT_DIR/e2e/evidence.md

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
const agentDir = env.AGENT_DIR || '/harness/.agent';
const reportDir = env.E2E_REPORT_DIR || 'tests/e2e/reports';
const outDir = join(agentDir, 'e2e');
mkdirSync(outDir, { recursive: true });

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const tail = (p, n) => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').slice(-n).join('\n') : '(log not found)');

const TEST_TO_SERVICES = {
  'tests/e2e/telemetry-ingest.test.mjs': ['telemetry-ingest'],
  'tests/e2e/fleet-service.test.mjs': ['fleet-service'],
  'tests/e2e/dashboard-api.test.mjs': ['dashboard-api'],
  'tests/e2e/fleet-operations-journey.test.mjs': ['telemetry-ingest', 'dashboard-api'],
};
const SERVICE_LOG = { 'telemetry-ingest': 'telemetry-ingest.log', 'fleet-service': 'fleet-service.log', 'dashboard-api': 'dashboard-api.log' };

const summary = readJson(join(reportDir, 'evidence', 'e2e-summary.json'), { status: 'MISSING', failures: [], flakyTests: [], services: [] });
const change = readJson(join(agentDir, 'change', 'context.json'), { files: [], commits: [] });
const changedIn = (service, kinds) => change.files.filter((f) => f.service === service && kinds.includes(f.kind)).map((f) => f.path);

const failures = summary.failures.map((f) => {
  const services = TEST_TO_SERVICES[f.file] || [];
  return {
    ...f,
    servicesUnderTest: services.map((s) => ({
      service: s,
      sourceChangedInDiff: changedIn(s, ['source', 'config', 'dependencies']),
      unitTestsChangedInDiff: changedIn(s, ['unit-test']),
      lastCommit: git('log', '-1', '--format=%h %cs %s', '--', `services/${s}`),
    })),
    e2eTestChangedInDiff: change.files.some((c) => c.path === f.file),
    e2eTestLastCommit: git('log', '-1', '--format=%h %cs %s', '--', f.file),
  };
});

const involved = [...new Set(failures.flatMap((f) => f.servicesUnderTest.map((s) => s.service)))];
const logs = Object.fromEntries(involved.map((s) => [s, tail(join(agentDir, 'logs', SERVICE_LOG[s]), 80)]));
const testSources = Object.fromEntries(
  [...new Set(failures.map((f) => f.file))].filter((p) => existsSync(p)).map((p) => [p, readFileSync(p, 'utf8')]),
);

const evidence = {
  status: summary.status,
  total: summary.total,
  failedConsistently: summary.failedConsistently,
  flaky: summary.flaky,
  serviceHealth: summary.services,
  commits: change.commits,
  failures,
  flakyTests: summary.flakyTests,
};
writeFileSync(join(outDir, 'evidence.json'), JSON.stringify({ ...evidence, logs, testSources }, null, 2));

const md = [
  '# E2E failure evidence',
  `- Status: ${summary.status}; total ${summary.total ?? 0}; consistent failures ${summary.failedConsistently ?? 0}; flaky ${summary.flaky ?? 0}`,
  `- Service health before tests: ${(summary.services || []).map((s) => `${s.name}=${s.healthy ? 'healthy' : `UNHEALTHY (${s.error})`}`).join(', ') || 'unknown'}`,
  `- Commits in this change: ${change.commits.map((c) => `"${c.subject}"`).join('; ') || 'none'}`,
  '',
  '## Consistent failures (failed on first run and on retry)',
  ...(failures.length === 0 ? ['- none'] : failures.flatMap((f) => [
    `### ${f.suite} :: ${f.name}`,
    `- Test file: ${f.file} (changed in this diff: ${f.e2eTestChangedInDiff}; last commit: ${f.e2eTestLastCommit || 'n/a'})`,
    ...f.servicesUnderTest.map((s) => `- Service ${s.service}: source changed in diff: ${s.sourceChangedInDiff.join(', ') || 'no'}; unit tests changed in diff: ${s.unitTestsChangedInDiff.join(', ') || 'no'}; last commit: ${s.lastCommit || 'n/a'}`),
    ...(f.actual !== undefined || f.expected !== undefined ? [`- Expected: ${f.expected}; actual: ${f.actual}`] : []),
    '- Assertion:',
    '```',
    f.message,
    '```',
    '',
  ])),
  '## Flaky tests (failed once, passed on retry)',
  ...(summary.flakyTests.length ? summary.flakyTests.map((t) => `- ${t.suite} :: ${t.name} (${t.file}): ${t.firstRunMessage}`) : ['- none']),
  '',
  '## Service log tails',
  ...Object.entries(logs).flatMap(([s, l]) => [`### ${s}`, '```', l, '```']),
  '',
  `Full test sources, stack traces and logs: ${join(outDir, 'evidence.json')}. Change diff: ${join(agentDir, 'change', 'diff.patch')}.`,
].join('\n');
writeFileSync(join(outDir, 'evidence.md'), md + '\n');
console.log(md);
