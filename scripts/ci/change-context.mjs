#!/usr/bin/env node
// Collects the change context that the Workflow Router agent reasons over, and computes the
// deterministic baseline workflow plan. The agent may escalate this plan but never relax it
// (see resolve-plan.mjs), so a missing or wrong agent answer can never skip required checks.
//
// Inputs (environment):
//   BUILD_TYPE, BASE_SHA, PR_NUMBER, BRANCH   codebase expressions, same as detect-changes.sh
//   FORCE_ALL                                 "true" runs every workflow
//   AGENT_DIR                                 evidence root (default /harness/.agent)
//
// Outputs:
//   $AGENT_DIR/change/context.json   machine-readable change summary
//   $AGENT_DIR/change/context.md     the same, readable by the agent
//   $AGENT_DIR/change/diff.patch     bounded unified diff
//   $AGENT_DIR/change/baseline.env   BASELINE_* variables for the pipeline

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
const agentDir = env.AGENT_DIR || '/harness/.agent';
const outDir = join(agentDir, 'change');
const MAX_DIFF_BYTES = 200_000;
mkdirSync(outDir, { recursive: true });

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

const isSet = (v) => v && v !== 'null' && !v.startsWith('<+');

function resolveRange() {
  if (env.BUILD_TYPE === 'PR' && isSet(env.BASE_SHA)) {
    if (git('cat-file', '-e', `${env.BASE_SHA}^{commit}`) === null) {
      git('fetch', '--no-tags', '--depth=100', 'origin', env.BASE_SHA);
    }
    if (git('merge-base', env.BASE_SHA, 'HEAD')) return { base: env.BASE_SHA, range: `${env.BASE_SHA}...HEAD`, kind: 'pull-request' };
    if (git('cat-file', '-e', `${env.BASE_SHA}^{commit}`) !== null) return { base: env.BASE_SHA, range: `${env.BASE_SHA}..HEAD`, kind: 'pull-request' };
  }
  if (git('rev-parse', '--verify', 'HEAD~1')) return { base: 'HEAD~1', range: 'HEAD~1..HEAD', kind: 'push' };
  return null;
}

const SERVICES = {
  'telemetry-ingest': { dir: 'services/telemetry-ingest/', language: 'go' },
  'fleet-service': { dir: 'services/fleet-service/', language: 'java' },
  'dashboard-api': { dir: 'services/dashboard-api/', language: 'node' },
};

function classify(path) {
  const service = Object.entries(SERVICES).find(([, s]) => path.startsWith(s.dir))?.[0] || null;
  let kind = 'other';
  if (/(^|\/)Dockerfile[^/]*$|(^|\/)\.dockerignore$/.test(path)) kind = 'dockerfile';
  else if (/^tests\/e2e\//.test(path)) kind = 'e2e';
  else if (/(_test\.go|\.test\.[cm]?js|Test\.java|Tests\.java)$|\/test\//.test(path)) kind = 'unit-test';
  else if (/(^|\/)(go\.mod|go\.sum|pom\.xml|package(-lock)?\.json)$/.test(path)) kind = 'dependencies';
  else if (/^(\.harness|scripts\/ci|harness-manual)\/|^\.ticonfig\.yaml$/.test(path)) kind = 'ci';
  else if (/\.(md|txt)$|^docs\//.test(path)) kind = 'docs';
  else if (/\.(go|java|[cm]?js|ts)$/.test(path)) kind = 'source';
  else if (/\.(ya?ml|json|properties|xml)$/.test(path)) kind = 'config';
  return { path, service, kind };
}

const forceAll = env.FORCE_ALL === 'true';
const range = forceAll ? null : resolveRange();

let files = [];
let diff = '';
let commits = [];
let numstat = [];
if (range) {
  files = (git('diff', '--name-only', range.range) || '').split('\n').filter(Boolean).map(classify);
  numstat = (git('diff', '--numstat', range.range) || '').split('\n').filter(Boolean).map((l) => {
    const [added, deleted, path] = l.split('\t');
    return { path, added: Number(added) || 0, deleted: Number(deleted) || 0 };
  });
  diff = git('diff', '--unified=5', range.range) || '';
  commits = (git('log', '--format=%h%x09%an%x09%s', range.range.replace('...', '..')) || '').split('\n').filter(Boolean).map((l) => {
    const [sha, author, subject] = l.split('\t');
    return { sha, author, subject };
  });
}

const truncated = Buffer.byteLength(diff) > MAX_DIFF_BYTES;
if (truncated) diff = diff.slice(0, MAX_DIFF_BYTES) + '\n# [diff truncated]\n';

const kinds = new Set(files.map((f) => f.kind));
const services = [...new Set(files.map((f) => f.service).filter(Boolean))];
const linesChanged = numstat.reduce((n, f) => n + f.added + f.deleted, 0);
const runtimeKinds = ['source', 'dependencies', 'config', 'dockerfile', 'e2e', 'ci'];
const noDiff = !range && !forceAll;

const reasons = [];
let runE2E = forceAll || noDiff || files.some((f) => runtimeKinds.includes(f.kind));
if (forceAll) reasons.push('force_all requested');
if (noDiff) reasons.push('no diff base available, running every workflow');
if (files.some((f) => runtimeKinds.includes(f.kind))) reasons.push('runtime-affecting files changed');

const runDockerfileReview = forceAll || noDiff || kinds.has('dockerfile') || kinds.has('dependencies');
if (kinds.has('dockerfile') || kinds.has('dependencies')) reasons.push('Dockerfile or dependency manifests changed');

let risk = 'low';
if (services.length > 1 || kinds.has('dependencies') || kinds.has('ci') || linesChanged > 300) risk = 'medium';
if (services.length > 2 || kinds.has('dockerfile') || (kinds.has('source') && !kinds.has('unit-test')) || linesChanged > 1000) risk = 'high';
if (forceAll || noDiff) risk = 'high';

let category = 'mixed';
const kindList = [...kinds];
if (kindList.length === 0) category = forceAll || noDiff ? 'full-build' : 'empty';
else if (kindList.every((k) => k === 'docs')) category = 'docs';
else if (kindList.every((k) => ['unit-test', 'e2e'].includes(k))) category = 'tests';
else if (kindList.every((k) => k === 'ci')) category = 'ci';
else if (kindList.every((k) => ['dependencies', 'dockerfile'].includes(k))) category = 'build';
else if (kinds.has('source')) category = 'code';

const context = {
  diffKind: forceAll ? 'force-all' : range?.kind || 'unknown',
  base: range?.base || null,
  branch: env.BRANCH || null,
  prNumber: isSet(env.PR_NUMBER) ? env.PR_NUMBER : null,
  commits,
  services,
  linesChanged,
  diffTruncated: truncated,
  files: files.map((f) => ({ ...f, ...(numstat.find((n) => n.path === f.path) || {}) })),
  baseline: {
    RUN_E2E: String(runE2E),
    RUN_DOCKERFILE_REVIEW: String(runDockerfileReview),
    RISK_LEVEL: risk,
    CHANGE_CATEGORY: category,
    reasons,
  },
};

writeFileSync(join(outDir, 'context.json'), JSON.stringify(context, null, 2));
writeFileSync(join(outDir, 'diff.patch'), diff);
writeFileSync(
  join(outDir, 'context.md'),
  [
    '# Change context',
    `- Diff: ${context.diffKind}${context.base ? ` against ${context.base}` : ''}; branch ${context.branch || 'n/a'}; PR ${context.prNumber || 'n/a'}`,
    `- Services touched: ${services.join(', ') || 'none'}; lines changed: ${linesChanged}${truncated ? ' (diff truncated)' : ''}`,
    '',
    '## Commits',
    ...(commits.length ? commits.map((c) => `- ${c.sha} ${c.subject} (${c.author})`) : ['- none']),
    '',
    '## Files',
    ...(files.length ? context.files.map((f) => `- [${f.kind}] ${f.path}${f.service ? ` (${f.service})` : ''}`) : ['- none']),
    '',
    '## Deterministic baseline plan',
    ...Object.entries(context.baseline).filter(([k]) => k !== 'reasons').map(([k, v]) => `- ${k}=${v}`),
    ...reasons.map((r) => `- reason: ${r}`),
    '',
    `The full diff is in ${join(outDir, 'diff.patch')}.`,
  ].join('\n') + '\n',
);
writeFileSync(
  join(outDir, 'baseline.env'),
  Object.entries(context.baseline).filter(([k]) => k !== 'reasons').map(([k, v]) => `BASELINE_${k}=${v}`).join('\n') + '\n',
);

console.log(readFileSync(join(outDir, 'context.md'), 'utf8'));
