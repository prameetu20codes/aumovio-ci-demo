// Minimal Harness API client for the learning-loop scripts. Uses the scoped HARNESS_TOKEN that
// Harness injects (or HARNESS_API_KEY when set). Node standard library only.

const env = process.env;
const FAILED = new Set(['Failed', 'Errored', 'Expired', 'Aborted', 'ApprovalRejected', 'IgnoreFailed']);
const STRUCTURAL = new Set(['STAGES_STEP', 'NG_SECTION', 'NG_FORK', 'STEP_GROUP', 'NG_EXECUTION', 'IntegrationStageStepPMS']);

export const token = () => env.HARNESS_API_KEY || env.HARNESS_TOKEN || '';
const base = () => (env.HARNESS_BASE_URL || 'https://app.harness.io').replace(/\/+$/, '');
const scope = () => ({
  accountIdentifier: env.ACCOUNT_ID,
  orgIdentifier: env.ORG_ID,
  projectIdentifier: env.PROJECT_ID,
});

/** Treats unresolved Harness expressions and "null" as empty. */
export function clean(value) {
  const v = (value ?? '').toString().trim();
  return v === '' || v === 'null' || v.startsWith('<+') ? '' : v;
}

async function request(method, path, query = {}, body) {
  if (!token()) throw new Error('no Harness token in the environment');
  const url = new URL(`${base()}${path}`);
  url.search = new URLSearchParams({ ...scope(), ...query });
  // The header for scoped tokens is not documented; try x-api-key, then Bearer.
  let last = '';
  for (const auth of [{ 'x-api-key': token() }, { Authorization: `Bearer ${token()}` }]) {
    const res = await fetch(url, {
      method,
      headers: { ...auth, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return (await res.json()).data;
    last = `HTTP ${res.status} ${method} ${path}`;
    if (res.status !== 401 && res.status !== 403) break;
  }
  throw new Error(last);
}

/** Most recent executions of a pipeline, newest first. */
export async function listExecutions(pipelineId, size = 20, branch = '') {
  const data = await request(
    'POST',
    '/pipeline/api/pipelines/execution/summary',
    { pipelineIdentifier: pipelineId, page: '0', size: String(size), ...(branch ? { branch } : {}) },
    { filterType: 'PipelineExecution' },
  );
  return (data?.content || []).map(summarize);
}

export async function getExecution(executionId) {
  return request('GET', `/pipeline/api/pipelines/execution/v2/${executionId}`, { renderFullBottomGraph: 'true' });
}

function summarize(e) {
  const ci = e.moduleInfo?.ci || {};
  const commit = ci.ciExecutionInfoDTO?.branch?.commits?.[0] || {};
  const failedStages = Object.values(e.layoutNodeMap || {})
    .filter((n) => n.nodeType !== 'parallel' && FAILED.has(n.status))
    .map((n) => n.nodeIdentifier);
  return {
    executionId: e.planExecutionId,
    runSequence: e.runSequence,
    status: e.status,
    branch: ci.branch || e.gitDetails?.branch || '',
    commit: (commit.id || '').slice(0, 12),
    commitMessage: (commit.message || '').split('\n')[0].slice(0, 120),
    trigger: e.executionTriggerInfo?.triggerType || '',
    startTs: e.startTs ? new Date(e.startTs).toISOString() : '',
    durationSec: e.startTs && e.endTs ? Math.round((e.endTs - e.startTs) / 1000) : null,
    failedStages,
    failureMessage: (e.failureInfo?.message || '').slice(0, 300),
  };
}

/** Failed stages and steps of one execution, plus its summary. */
export function failuresOf(data) {
  const summary = data?.pipelineExecutionSummary ? summarize(data.pipelineExecutionSummary) : null;
  const stages = [];
  for (const node of Object.values(data?.pipelineExecutionSummary?.layoutNodeMap || {})) {
    if (node.nodeType === 'parallel' || !FAILED.has(node.status)) continue;
    stages.push({ stage: node.nodeIdentifier, status: node.status, message: node.failureInfo?.message || '' });
  }
  const steps = [];
  for (const node of Object.values(data?.executionGraph?.nodeMap || {})) {
    if (!FAILED.has(node.status) || !node.stepType || STRUCTURAL.has(node.stepType)) continue;
    const message = node.failureInfo?.message || (node.failureInfo?.responseMessages || []).map((m) => m.message).join('; ');
    steps.push({ step: node.identifier, type: node.stepType, status: node.status, fqn: node.baseFqn, message: message.slice(0, 500) });
  }
  return { summary, stages, steps };
}

/** Output variables of the first node with this identifier, searched anywhere in its outcomes. */
export function outputsOf(data, identifier) {
  for (const node of Object.values(data?.executionGraph?.nodeMap || {})) {
    if (node.identifier !== identifier) continue;
    const found = findKey(node.outcomes, 'outputVariables');
    if (found) return found;
  }
  return null;
}

function findKey(obj, key, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return null;
  if (obj[key] && typeof obj[key] === 'object') return obj[key];
  for (const v of Object.values(obj)) {
    const hit = findKey(v, key, depth + 1);
    if (hit) return hit;
  }
  return null;
}
