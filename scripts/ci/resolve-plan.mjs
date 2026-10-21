#!/usr/bin/env node
// Merges the Workflow Router agent's recommendation with the deterministic baseline plan.
//
// Rules, so the agent can only make the pipeline stricter:
//   RUN_E2E / RUN_DOCKERFILE_REVIEW   baseline OR agent
//   RISK_LEVEL                        the higher of baseline and agent
//   CHANGE_CATEGORY                   agent value if it is a known category, else baseline
// Missing, unresolved (<+...>) or malformed agent outputs fall back to the baseline.
//
// Inputs (environment): BASELINE_* from change-context.mjs, AGENT_RUN_E2E, AGENT_RUN_DOCKERFILE_REVIEW,
//   AGENT_RISK_LEVEL, AGENT_CHANGE_CATEGORY, AGENT_RATIONALE, AGENT_DIR
// Output: $AGENT_DIR/change/plan.env with RUN_E2E, RUN_DOCKERFILE_REVIEW, RISK_LEVEL, CHANGE_CATEGORY, PLAN_SOURCE

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
const outDir = join(env.AGENT_DIR || '/harness/.agent', 'change');
mkdirSync(outDir, { recursive: true });

const RISKS = ['low', 'medium', 'high'];
const CATEGORIES = ['docs', 'tests', 'ci', 'build', 'code', 'mixed', 'full-build', 'empty'];

const clean = (v) => {
  const s = (v ?? '').trim();
  return !s || s === 'null' || s.startsWith('<+') ? null : s.toLowerCase();
};
const bool = (v) => (v === 'true' ? true : v === 'false' ? false : null);

const baseline = {
  RUN_E2E: bool(clean(env.BASELINE_RUN_E2E)) ?? true,
  RUN_DOCKERFILE_REVIEW: bool(clean(env.BASELINE_RUN_DOCKERFILE_REVIEW)) ?? true,
  RISK_LEVEL: RISKS.includes(clean(env.BASELINE_RISK_LEVEL)) ? clean(env.BASELINE_RISK_LEVEL) : 'high',
  CHANGE_CATEGORY: CATEGORIES.includes(clean(env.BASELINE_CHANGE_CATEGORY)) ? clean(env.BASELINE_CHANGE_CATEGORY) : 'mixed',
};

const agent = {
  RUN_E2E: bool(clean(env.AGENT_RUN_E2E)),
  RUN_DOCKERFILE_REVIEW: bool(clean(env.AGENT_RUN_DOCKERFILE_REVIEW)),
  RISK_LEVEL: RISKS.includes(clean(env.AGENT_RISK_LEVEL)) ? clean(env.AGENT_RISK_LEVEL) : null,
  CHANGE_CATEGORY: CATEGORIES.includes(clean(env.AGENT_CHANGE_CATEGORY)) ? clean(env.AGENT_CHANGE_CATEGORY) : null,
};
const agentAnswered = Object.values(agent).some((v) => v !== null);

const plan = {
  RUN_E2E: baseline.RUN_E2E || agent.RUN_E2E === true,
  RUN_DOCKERFILE_REVIEW: baseline.RUN_DOCKERFILE_REVIEW || agent.RUN_DOCKERFILE_REVIEW === true,
  RISK_LEVEL: RISKS[Math.max(RISKS.indexOf(baseline.RISK_LEVEL), RISKS.indexOf(agent.RISK_LEVEL ?? 'low'))],
  CHANGE_CATEGORY: agent.CHANGE_CATEGORY ?? baseline.CHANGE_CATEGORY,
};
const GATING = ['RUN_E2E', 'RUN_DOCKERFILE_REVIEW', 'RISK_LEVEL'];
const relaxRequested =
  (baseline.RUN_E2E && agent.RUN_E2E === false) ||
  (baseline.RUN_DOCKERFILE_REVIEW && agent.RUN_DOCKERFILE_REVIEW === false) ||
  (agent.RISK_LEVEL !== null && RISKS.indexOf(agent.RISK_LEVEL) < RISKS.indexOf(baseline.RISK_LEVEL));
plan.PLAN_SOURCE = !agentAnswered
  ? 'baseline (agent output unavailable)'
  : GATING.some((k) => plan[k] !== baseline[k])
    ? 'agent escalated baseline'
    : relaxRequested
      ? 'baseline kept (agent asked to relax it; ignored)'
      : 'baseline confirmed by agent';

const rows = Object.keys(baseline).map((k) => `| ${k} | ${baseline[k]} | ${agent[k] ?? '-'} | ${plan[k]} |`);
console.log(['| Decision | Baseline | Agent | Final |', '|---|---|---|---|', ...rows].join('\n'));
console.log(`Plan source: ${plan.PLAN_SOURCE}`);
if (clean(env.AGENT_RATIONALE)) console.log(`Agent rationale: ${env.AGENT_RATIONALE.trim()}`);

const shellQuote = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
writeFileSync(join(outDir, 'plan.env'), Object.entries(plan).map(([k, v]) => `${k}=${shellQuote(v)}`).join('\n') + '\n');
