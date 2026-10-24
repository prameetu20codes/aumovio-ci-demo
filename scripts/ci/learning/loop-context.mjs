#!/usr/bin/env node
// Builds the evidence for the CI learning loop agents. Runs after the chained CI execution has
// finished, so nothing here waits on a running execution.
//
// Inputs (environment):
//   HARNESS_TOKEN | HARNESS_API_KEY, HARNESS_BASE_URL, ACCOUNT_ID, ORG_ID, PROJECT_ID
//   CI_PIPELINE_ID      pipeline whose executions are analysed (aumovio_monorepo_ci_agentic)
//   LOOP_PIPELINE_ID    this pipeline; its earlier executions hold the learning records (memory)
//   LOOP_EXECUTION_ID   this execution, excluded from memory
//   CHILD_EXECUTION_ID  the CI execution chained by this run (empty when RUN_CI=false)
//   RUN_CI, TARGET_BRANCH, COMMIT_SHA, HISTORY_SIZE (20), MEMORY_SIZE (10)
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

const ciPipeline = env.CI_PIPELINE_ID || 'aumovio_monorepo_ci_agentic';
const loopPipeline = env.LOOP_PIPELINE_ID || 'aumovio_ci_learning_loop';
const branch = clean(env.TARGET_BRANCH) || 'main';
const runCi = clean(env.RUN_CI) !== 'false';
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

// 1. The CI execution chained by this run.
const run = { executionId: clean(env.CHILD_EXECUTION_ID), source: 'none', summary: null, stages: [], steps: [], triage: null };
if (runCi) {
  try {
    if (!run.executionId) {
      const latest = (await listExecutions(ciPipeline, 1, branch))[0];
      if (latest) {
        run.executionId = latest.executionId;
        notes.push(`Chained execution id was not passed; using the latest ${ciPipeline} execution on ${branch}.`);
      }
    }
    if (run.executionId) {
      const data = await getExecution(run.executionId);
      Object.assign(run, failuresOf(data), { source: 'execution-api' });
      run.triage = outputsOf(data, 'ca_ci_failure_triage_1');
    }
  } catch (err) {
    run.source = 'unavailable';
    notes.push(`Execution API unavailable for the CI run (${err.message}). Use Harness MCP: harness_get execution ${run.executionId || `(latest ${ciPipeline} on ${branch})`}.`);
  }
}
write('run.json', JSON.stringify(run, null, 2));
write(
  'run.md',
  [
    `# CI run analysed by this loop`,
    runCi ? '' : '_RUN_CI=false: no CI run was chained; this is a history-only (trend) analysis._',
    `- Pipeline: ${ciPipeline}; execution: ${run.executionId || 'unknown'}; branch: ${branch}; commit: ${clean(env.COMMIT_SHA) || 'unknown'}`,
    `- Status: ${run.summary?.status || 'unknown'} (source: ${run.source})`,
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

// 2. Recent history of the CI pipeline (all branches) for quick local correlation.
let history = [];
try {
  history = await listExecutions(ciPipeline, historySize);
} catch (err) {
  notes.push(`Could not list ${ciPipeline} executions (${err.message}); rely on the Knowledge Graph.`);
}
write('history.json', JSON.stringify(history, null, 2));
write(
  'history.md',
  `# Last ${history.length} executions of ${ciPipeline}\n\n` +
    table(
      history.map((h) => ({ ...h, failedStages: h.failedStages.join(', ') })),
      ['runSequence', 'executionId', 'status', 'branch', 'commit', 'startTs', 'durationSec', 'failedStages', 'commitMessage'],
    ) +
    '\n',
);

// 3. Memory: learning records published by earlier executions of this loop.
const memory = [];
try {
  const previous = (await listExecutions(loopPipeline, memorySize + 1)).filter(
    (e) => e.executionId !== clean(env.LOOP_EXECUTION_ID) && !['Running', 'Queued', 'NotStarted'].includes(e.status),
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

const ciFailed = run.summary ? run.summary.status !== 'Success' : run.stages.length > 0;
write(
  'loop.env',
  [`HAS_CI_RUN=${Boolean(run.executionId)}`, `CI_FAILED=${ciFailed}`, `CI_EXECUTION_ID=${run.executionId}`, `MEMORY_RECORDS=${memory.length}`].join('\n') + '\n',
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
