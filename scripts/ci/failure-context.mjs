#!/usr/bin/env node
// Collects what failed in the current execution for the CI Failure Triage agent. This runs in the
// last stage of the failing execution, so the execution itself is still Running; only the stages
// and steps that already finished are reported. Never waits for the execution to end.
//
// Inputs (environment):
//   HARNESS_TOKEN, HARNESS_BASE_URL   scoped token injected by Harness (default read-only grant)
//   ACCOUNT_ID, ORG_ID, PROJECT_ID, EXECUTION_ID
//   AGENT_DIR                         evidence root (default /harness/.agent)
// Outputs:
//   $AGENT_DIR/failure/failures.json, failures.md
//   $AGENT_DIR/failure/repro.env      REPRO_GO, REPRO_JAVA, REPRO_NODE (true|false)
// Always exits 0. If the execution API is unavailable, unit tests are reproduced for every service
// touched by the change so the agent still gets concrete evidence.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
const agentDir = env.AGENT_DIR || '/harness/.agent';
const outDir = join(agentDir, 'failure');
mkdirSync(outDir, { recursive: true });

const FAILED = new Set(['Failed', 'Errored', 'Expired', 'Aborted', 'ApprovalRejected']);
const SERVICE_STAGES = { go_ci: 'REPRO_GO', java_ci: 'REPRO_JAVA', node_ci: 'REPRO_NODE' };
const SERVICE_DIRS = { 'telemetry-ingest': 'REPRO_GO', 'fleet-service': 'REPRO_JAVA', 'dashboard-api': 'REPRO_NODE' };

async function getExecution() {
  const base = (env.HARNESS_BASE_URL || 'https://app.harness.io').replace(/\/+$/, '');
  const url = new URL(`${base}/pipeline/api/pipelines/execution/v2/${env.EXECUTION_ID}`);
  url.search = new URLSearchParams({
    accountIdentifier: env.ACCOUNT_ID,
    orgIdentifier: env.ORG_ID,
    projectIdentifier: env.PROJECT_ID,
    renderFullBottomGraph: 'true',
  });
  // The header for scoped tokens is not documented; try x-api-key, then Bearer.
  let last = '';
  for (const auth of [{ 'x-api-key': env.HARNESS_TOKEN }, { Authorization: `Bearer ${env.HARNESS_TOKEN}` }]) {
    const res = await fetch(url, { headers: { ...auth, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    if (res.ok) return res.json();
    last = `HTTP ${res.status}`;
    if (res.status !== 401 && res.status !== 403) break;
  }
  throw new Error(last);
}

const failures = { source: 'execution-api', stages: [], steps: [], note: null };
try {
  if (!env.HARNESS_TOKEN) throw new Error('HARNESS_TOKEN is not set');
  const data = (await getExecution()).data || {};
  for (const node of Object.values(data.pipelineExecutionSummary?.layoutNodeMap || {})) {
    if (node.nodeType === 'parallel' || !FAILED.has(node.status)) continue;
    failures.stages.push({ stage: node.nodeIdentifier, name: node.name, status: node.status, message: node.failureInfo?.message || '' });
  }
  for (const node of Object.values(data.executionGraph?.nodeMap || {})) {
    if (!FAILED.has(node.status) || !node.stepType || ['STAGES_STEP', 'NG_SECTION', 'NG_FORK', 'STEP_GROUP'].includes(node.stepType)) continue;
    const message = node.failureInfo?.message || (node.failureInfo?.responseMessages || []).map((m) => m.message).join('; ');
    failures.steps.push({ step: node.identifier, name: node.name, type: node.stepType, status: node.status, fqn: node.baseFqn, message });
  }
} catch (err) {
  failures.source = 'unavailable';
  failures.note = `Execution API unavailable (${err.message}); use the Harness MCP to inspect execution ${env.EXECUTION_ID}.`;
}

const repro = { REPRO_GO: false, REPRO_JAVA: false, REPRO_NODE: false };
if (failures.source === 'execution-api') {
  for (const s of failures.stages) if (SERVICE_STAGES[s.stage]) repro[SERVICE_STAGES[s.stage]] = true;
} else {
  const changeFile = join(agentDir, 'change', 'context.json');
  const services = existsSync(changeFile) ? JSON.parse(readFileSync(changeFile, 'utf8')).services || [] : [];
  for (const s of services) if (SERVICE_DIRS[s]) repro[SERVICE_DIRS[s]] = true;
}

writeFileSync(join(outDir, 'failures.json'), JSON.stringify(failures, null, 2));
writeFileSync(join(outDir, 'repro.env'), Object.entries(repro).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
const md = [
  '# Failures in this execution',
  failures.note ? `> ${failures.note}` : `Source: Harness execution API, execution ${env.EXECUTION_ID}.`,
  '',
  '## Failed stages',
  ...(failures.stages.length ? failures.stages.map((s) => `- ${s.stage} (${s.status})${s.message ? `: ${s.message}` : ''}`) : ['- none reported']),
  '',
  '## Failed steps',
  ...(failures.steps.length ? failures.steps.map((s) => `- ${s.fqn || s.step} [${s.type}] ${s.status}${s.message ? `: ${s.message}` : ''}`) : ['- none reported']),
  '',
  '## Unit tests reproduced in this stage',
  ...Object.entries(repro).map(([k, v]) => `- ${k.replace('REPRO_', '').toLowerCase()}: ${v ? `yes, output in ${outDir}/${k.replace('REPRO_', '').toLowerCase()}-tests.log` : 'no'}`),
].join('\n') + '\n';
writeFileSync(join(outDir, 'failures.md'), md);
console.log(md);
