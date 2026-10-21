#!/usr/bin/env node
// E2E quality gate. Combines the deterministic test result with the triage agent's verdict and
// fails closed: when tests failed, only a confident OUTDATED_TEST verdict under the "warn" policy
// lets the build continue. A missing, unknown or low-confidence verdict always blocks.
//
// Inputs (environment):
//   E2E_STATUS, E2E_FAILED, E2E_FLAKY       from tests/e2e/run.mjs
//   VERDICT, CONFIDENCE, SUMMARY            triage agent outputs (may be unresolved)
//   CONFIDENCE_THRESHOLD                    0-100, default 80
//   OUTDATED_TEST_POLICY                    warn | block, default warn
// Exit code 0 passes the gate, 1 fails it.

const env = process.env;
const clean = (v) => {
  const s = (v ?? '').trim();
  return !s || s === 'null' || s.startsWith('<+') ? null : s;
};

const status = clean(env.E2E_STATUS) || 'MISSING';
const failed = Number(clean(env.E2E_FAILED) || 0);
const flaky = Number(clean(env.E2E_FLAKY) || 0);
const verdict = (clean(env.VERDICT) || 'NONE').toUpperCase();
const confidence = Number(clean(env.CONFIDENCE) ?? NaN);
const threshold = Number(clean(env.CONFIDENCE_THRESHOLD) || 80);
const policy = clean(env.OUTDATED_TEST_POLICY) === 'block' ? 'block' : 'warn';
const confident = Number.isFinite(confidence) && confidence >= threshold;

function decide() {
  if (status === 'PASSED') return ['PASS', 'All E2E tests passed.'];
  if (status === 'MISSING') return ['FAIL', 'E2E results are missing; the test step did not complete.'];
  if (status === 'ENVIRONMENT_ERROR') return ['FAIL', 'Services did not become healthy, so the change could not be verified. Check service logs and retry.'];
  if (status === 'FLAKY_ONLY') {
    if (verdict === 'REGRESSION' && confident) return ['FAIL', `Tests passed on retry, but triage found a regression (${confidence}% confidence).`];
    return ['WARN', `${flaky} flaky test(s) passed on retry. Quarantine or fix them; the build continues.`];
  }
  if (verdict === 'NONE') return ['FAIL', `${failed} test(s) failed and no triage verdict is available. A human must review.`];
  if (!confident) return ['FAIL', `${failed} test(s) failed; triage verdict ${verdict} is below the ${threshold}% confidence threshold (${Number.isFinite(confidence) ? confidence : 'n/a'}%). A human must review.`];
  if (verdict === 'OUTDATED_TEST') {
    return policy === 'warn'
      ? ['WARN', `${failed} test(s) are outdated after an intentional behaviour change (${confidence}% confidence). Update the E2E tests; the build continues under the "warn" policy.`]
      : ['FAIL', `${failed} test(s) are outdated after an intentional behaviour change. The "block" policy requires the tests to be updated in this change.`];
  }
  if (verdict === 'REGRESSION') return ['FAIL', `Application regression detected (${confidence}% confidence). Fix the application code.`];
  return ['FAIL', `${failed} test(s) failed; triage verdict ${verdict} does not permit the build to continue.`];
}

const [decision, reason] = decide();
console.log([
  '| E2E status | Failed | Flaky | Verdict | Confidence | Threshold | Outdated-test policy | Decision |',
  '|---|---|---|---|---|---|---|---|',
  `| ${status} | ${failed} | ${flaky} | ${verdict} | ${Number.isFinite(confidence) ? `${confidence}%` : '-'} | ${threshold}% | ${policy} | ${decision} |`,
].join('\n'));
if (clean(env.SUMMARY)) console.log(`Triage summary: ${env.SUMMARY.trim()}`);
console.log(`${decision}: ${reason}`);
process.exitCode = decision === 'FAIL' ? 1 : 0;
