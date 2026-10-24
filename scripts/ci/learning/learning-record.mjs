#!/usr/bin/env node
// Prints the learning-loop report and builds the learning record that later loop executions read
// back as memory (output variable LEARNING_RECORD_B64 of step publish_learning).
//
// Inputs (environment): KG_* and REM_* agent outputs, TARGET_BRANCH, COMMIT_SHA, LOOP_EXECUTION_ID,
//   AGENT_DIR (default /harness/.agent)
// Output: $AGENT_DIR/loop/learning.env with LEARNING_RECORD_B64, FIX_VERIFICATION, PATTERN_KEY,
//   REMEDIATION_TYPE; $AGENT_DIR/loop/learning-record.json

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
const loopDir = join(env.AGENT_DIR || '/harness/.agent', 'loop');
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const clean = (v) => {
  const s = (v ?? '').toString().trim();
  return s === 'null' || s.startsWith('<+') ? '' : s.replace(/\s+/g, ' ').slice(0, 300);
};
const kv = (text) => Object.fromEntries(text.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

const run = JSON.parse(read(join(loopDir, 'run.json')) || '{}');
const verify = kv(read(join(loopDir, 'verify', 'verify.env')));
const results = Object.fromEntries(
  ['go', 'java', 'node', 'secrets', 'deps', 'sast']
    .map((k) => [k, read(join(loopDir, 'verify', `${k}.result`)).split('\n')[0].trim()])
    .filter(([, v]) => v),
);

let fixVerification;
const ciFailed = run.summary ? run.summary.status !== 'Success' : (run.stages || []).length > 0;
if (verify.CODE_PATCH !== 'present') fixVerification = ciFailed ? 'NO_PATCH' : 'NOT_APPLICABLE';
else if (verify.CODE_PATCH_APPLIES !== 'true') fixVerification = 'PATCH_DOES_NOT_APPLY';
else if (!Object.keys(results).length) fixVerification = 'NOT_RUN';
else fixVerification = Object.values(results).every((r) => r === 'PASS') ? 'VERIFIED' : 'FAILED';

const record = {
  ts: new Date().toISOString(),
  loopExecutionId: clean(env.LOOP_EXECUTION_ID),
  ciExecutionId: run.executionId || '',
  branch: clean(env.TARGET_BRANCH),
  commit: clean(env.COMMIT_SHA).slice(0, 12),
  ciStatus: run.summary?.status || (run.executionId ? 'unknown' : 'not-run'),
  failedStages: (run.stages || []).map((s) => s.stage).join(','),
  triageCategory: clean(run.triage?.FAILURE_CATEGORY),
  kgStatus: clean(env.KG_STATUS) || 'UNKNOWN',
  failurePattern: clean(env.KG_FAILURE_PATTERN),
  recurrence: clean(env.KG_RECURRENCE_COUNT),
  patternKey: clean(env.REM_PATTERN_KEY),
  remediationType: clean(env.REM_REMEDIATION_TYPE),
  rootCause: clean(env.REM_ROOT_CAUSE),
  lesson: clean(env.REM_LESSON),
  confidence: clean(env.REM_CONFIDENCE),
  pipelinePatch: verify.PIPELINE_PATCH === 'present' ? (verify.PIPELINE_PATCH_APPLIES === 'true' ? 'applies' : 'does-not-apply') : 'none',
  fixVerification,
  verification: results,
};
writeFileSync(join(loopDir, 'learning-record.json'), JSON.stringify(record, null, 2));
writeFileSync(
  join(loopDir, 'learning.env'),
  [
    `LEARNING_RECORD_B64=${Buffer.from(JSON.stringify(record)).toString('base64')}`,
    `FIX_VERIFICATION=${fixVerification}`,
    `PATTERN_KEY=${record.patternKey.replace(/[^\w:./-]/g, '_')}`,
    `REMEDIATION_TYPE=${record.remediationType.replace(/[^\w]/g, '_')}`,
  ].join('\n') + '\n',
);

const section = (title, file) => {
  const body = read(join(loopDir, file));
  return body ? `\n===== ${title} (${file}) =====\n${body}` : '';
};
console.log(
  [
    '===== Learning record =====',
    JSON.stringify(record, null, 2),
    section('Knowledge Graph insights', 'out/kg-insights.md'),
    section('Remediation plan', 'out/remediation.md'),
    section('Proposed code fix', 'out/code-fix.patch'),
    section('Proposed pipeline change', 'out/pipeline-fix.patch'),
    section('Proposed playbook update', 'out/ci-playbook.md'),
    ...['go', 'java', 'node', 'secrets', 'deps', 'sast'].map((k) => section(`Verification: ${k}`, `verify/${k}.result`)),
  ].join('\n'),
);
