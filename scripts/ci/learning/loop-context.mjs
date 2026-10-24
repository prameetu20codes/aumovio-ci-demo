#!/usr/bin/env node
// Builds the evidence for the CI learning loop agents. Runs in the last stage of the loop
// execution, after its CI stages; the execution itself is still Running, so nothing here waits
// for it to end.
//
// Inputs (environment):
//   STAGE_STATUSES      stage=status pairs of this execution's CI stages (Harness expressions;
//                       unresolved when a stage did not run, e.g. a Learn-and-Remediate-only run)
//   TRIAGE_*            outputs of the CI Failure Triage agent in this execution, when it ran
//   HARNESS_TOKEN | HARNESS_API_KEY, HARNESS_BASE_URL, ACCOUNT_ID, ORG_ID, PROJECT_ID
//                       optional; adds failed-step detail, CI history and memory
//   EXECUTION_ID        this execution
//   CI_PIPELINE_IDS     comma-separated pipelines whose executions form the CI history
//   LOOP_PIPELINE_ID    this pipeline; its earlier executions hold the learning records (memory)
//   TARGET_BRANCH, COMMIT_SHA, HISTORY_SIZE (20), MEMORY_SIZE (10)
//   PLAYBOOK_PATH       playbook in the repository (default knowledge/ci-playbook.md)
//   AGENT_DIR           evidence root (default /harness/.agent)
// Outputs in $AGENT_DIR/loop: run.json/md, history.json/md, memory.json/md, playbook.md,
//   diff.patch, context.md (index for the agents) and loop.env.
// Always exits 0; anything the API cannot provide is marked so the agents fetch it via Harness MCP.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clean, failuresOf, getExecution, listExecutions, outputsOf } from './harness-api.mjs';

const env = process.env;
const agentDir = env.AGENT_DIR || '/harness/.agent';
const outDir = join(agentDir, 'loop');
mkdirSync(join(outDir, 'out'), { recursive: true });

const loopPipeline = env.LOOP_PIPELINE_ID || 'aumovio_ci_learning_loop';
const ciPipelines = (env.CI_PIPELINE_IDS || `${loopPipeline},aumovio_monorepo_ci_agentic`).split(',').map((s) => s.trim()).filter(Boolean);
const executionId = clean(env.EXECUTION_ID);
const branch = clean(env.TARGET_BRANCH) || 'main';
const historySize = Number(env.HISTORY_SIZE || 20);
const memorySize = Number(env.MEMORY_SIZE || 10);
const playbookPath = env.PLAYBOOK_PATH || 'knowledge/ci-playbook.md';
const notes = [];

const write = (name, content) => writeFileSync(join(outDir, name), content);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const table = (rows, cols) =>
  rows.length
    ? [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${cols.map((c) => String(r[c] ?? '').replace(/\|/g, '/')).join(' | ')} |`)].join('\n')
    : '_none_';

// 1. The CI stages of this execution: statuses and triage verdict from expressions, step detail
//    from the execution API when available.
const isFailed = (s) => /fail|error|expired|abort|reject/i.test(s);
const didRun = (s) => s && !/skip|not_?started|queued/i.test(s);
const stageStatus = Object.fromEntries(
  (env.STAGE_STATUSES || '')
    .split(',')
    .map((pair) => pair.split('='))
    .filter(([stage]) => stage)
    .map(([stage, status]) => [stage.trim(), clean(status)]),
);
const ran = Object.values(stageStatus).some(didRun);
const run = {
  executionId,
  ciStatus: !ran ? 'not-run' : Object.values(stageStatus).some(isFailed) ? 'Failed' : 'Success',
  stageStatus,
  stages: Object.entries(stageStatus).filter(([, s]) => isFailed(s)).map(([stage, status]) => ({ stage, status, message: '' })),
  steps: [],
  triage: null,
  stepSource: 'none',
};
const triage = Object.fromEntries(
  ['FAILURE_CATEGORY', 'ROOT_CAUSE', 'SUSPECT_FILES', 'CONFIDENCE', 'FIX_OWNER', 'SUMMARY']
    .map((k) => [k, clean(env[`TRIAGE_${k}`])])
    .filter(([, v]) => v),
);
if (Object.keys(triage).length) run.triage = triage;
if (ran && executionId) {
  try {
    const data = await getExecution(executionId);
    const detail = failuresOf(data);
    run.steps = detail.steps;
    for (const s of run.stages) s.message = detail.stages.find((d) => d.stage === s.stage)?.message || '';
    run.triage ||= outputsOf(data, 'ca_ci_failure_triage_1');
    run.stepSource = 'execution-api';
  } catch (err) {
    run.stepSource = 'unavailable';
    notes.push(`Execution API unavailable (${err.message}); for failed-step messages and logs use Harness MCP on execution ${executionId}.`);
  }
}
write('run.json', JSON.stringify(run, null, 2));
write(
  'run.md',
  [
    `# CI stages of this execution`,
    ran ? '' : '_No CI stage ran in this execution: this is a history-only (trend) analysis._',
    `- Pipeline: ${loopPipeline}; execution: ${executionId || 'unknown'}; branch: ${branch}; commit: ${clean(env.COMMIT_SHA) || 'unknown'}`,
    `- CI result: ${run.ciStatus}`,
    '',
    '## Stage statuses',
    table(Object.entries(stageStatus).map(([stage, status]) => ({ stage, status: status || 'did not run' })), ['stage', 'status']),
    '',
    '## Failed stages',
    table(run.stages, ['stage', 'status', 'message']),
    '',
    '## Failed steps',
    table(run.steps, ['fqn', 'type', 'status', 'message']),
    '',
    '## CI Failure Triage verdict (from the CI run)',
    run.triage ? table(Object.entries(run.triage).map(([key, value]) => ({ key, value })), ['key', 'value']) : '_not available (the triage stage did not run, or outputs could not be read)_',
  ].join('\n') + '\n',
);

// 2. Recent history of the CI pipelines (all branches) for quick local correlation.
let history = [];
for (const id of ciPipelines) {
  try {
    history.push(...(await listExecutions(id, historySize)).filter((h) => h.executionId !== executionId).map((h) => ({ pipeline: id, ...h })));
  } catch (err) {
    notes.push(`Could not list ${id} executions (${err.message}); rely on the Knowledge Graph.`);
  }
}
history = history.sort((a, b) => b.startTs.localeCompare(a.startTs)).slice(0, historySize);
write('history.json', JSON.stringify(history, null, 2));
write(
  'history.md',
  `# Last ${history.length} executions of ${ciPipelines.join(', ')}\n\n` +
    table(
      history.map((h) => ({ ...h, failedStages: h.failedStages.join(', ') })),
      ['pipeline', 'runSequence', 'executionId', 'status', 'branch', 'commit', 'startTs', 'durationSec', 'failedStages', 'commitMessage'],
    ) +
    '\n',
);

// 3. Memory: learning records published by earlier executions of this loop.
const memory = [];
try {
  const previous = (await listExecutions(loopPipeline, memorySize + 1)).filter(
    (e) => e.executionId !== executionId && !['Running', 'Queued', 'NotStarted'].includes(e.status),
  );
  for (const e of previous.slice(0, memorySize)) {
    try {
      const outputs = outputsOf(await getExecution(e.executionId), 'publish_learning');
      if (!outputs?.LEARNING_RECORD_B64) continue;
      memory.push({ loopExecutionId: e.executionId, ...JSON.parse(Buffer.from(outputs.LEARNING_RECORD_B64, 'base64').toString('utf8')) });
    } catch {
      // A loop execution without a readable record is skipped.
    }
  }
} catch (err) {
  notes.push(`Could not read earlier learning-loop executions (${err.message}). Use Harness MCP to list ${loopPipeline} executions and read the LEARNING_RECORD_B64 output of step publish_learning.`);
}
write('memory.json', JSON.stringify(memory, null, 2));
write(
  'memory.md',
  `# Learning records from the last ${memory.length} loop executions\n\n` +
    table(memory, ['ts', 'branch', 'ciStatus', 'patternKey', 'failurePattern', 'remediationType', 'fixVerification', 'confidence', 'lesson']) +
    '\n',
);

// 4. Playbook: the curated copy on main wins over the branch copy.
let playbook = '';
try {
  git('fetch', '--quiet', '--depth=50', 'origin', 'main');
  playbook = git('show', `origin/main:${playbookPath}`);
} catch {
  if (existsSync(playbookPath)) playbook = readFileSync(playbookPath, 'utf8');
}
write('playbook.md', playbook || '_No playbook yet._\n');

// 5. What the branch changes relative to main.
let diff = '';
try {
  diff = branch === 'main' ? git('show', '--format=%H %s', 'HEAD') : git('diff', 'origin/main...HEAD');
} catch {
  try {
    diff = git('show', '--format=%H %s', 'HEAD');
    notes.push('Could not diff against origin/main; diff.patch holds the last commit only.');
  } catch {
    notes.push('No git history available for a diff.');
  }
}
write('diff.patch', diff);

const ciFailed = run.ciStatus === 'Failed';
write(
  'loop.env',
  [`HAS_CI_RUN=${ran}`, `CI_FAILED=${ciFailed}`, `CI_EXECUTION_ID=${ran ? executionId : ''}`, `MEMORY_RECORDS=${memory.length}`].join('\n') + '\n',
);
write(
  'context.md',
  [
    '# Learning loop evidence',
    `Directory: ${outDir}`,
    '- run.md / run.json: the CI run analysed (failed stages, steps, triage verdict)',
    '- history.md / history.json: recent executions of the CI pipeline',
    '- memory.md / memory.json: learning records from earlier loop executions',
    '- playbook.md: curated CI playbook from main',
    '- diff.patch: what the branch changes relative to main',
    '',
    '## Notes',
    ...(notes.length ? notes.map((n) => `- ${n}`) : ['- all sources available']),
  ].join('\n') + '\n',
);
console.log(readFileSync(join(outDir, 'context.md'), 'utf8'));
console.log(readFileSync(join(outDir, 'run.md'), 'utf8'));
