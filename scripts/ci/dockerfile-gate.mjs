#!/usr/bin/env node
// Dockerfile quality gate. hadolint errors always block. The optimizer agent can add blocking findings
// (for example a root user, secrets baked into layers or a mutable base tag) but cannot clear hadolint
// errors. If the agent output is unavailable, the hadolint result alone decides.
//
// Inputs (environment): HADOLINT_ERRORS, HADOLINT_WARNINGS, BLOCKING_FINDINGS, TOTAL_FINDINGS, SUMMARY
// Exit code 0 passes the gate, 1 fails it.

const env = process.env;
const clean = (v) => {
  const s = (v ?? '').trim();
  return !s || s === 'null' || s.startsWith('<+') ? null : s;
};
const num = (v) => (clean(v) !== null && Number.isFinite(Number(v)) ? Number(v) : null);

const hadolintErrors = num(env.HADOLINT_ERRORS) ?? 0;
const hadolintWarnings = num(env.HADOLINT_WARNINGS) ?? 0;
const blocking = num(env.BLOCKING_FINDINGS);
const total = num(env.TOTAL_FINDINGS);

let decision = 'PASS';
const reasons = [];
if (hadolintErrors > 0) {
  decision = 'FAIL';
  reasons.push(`hadolint reported ${hadolintErrors} error(s)`);
}
if (blocking === null) {
  reasons.push('optimizer agent output unavailable; gated on hadolint only');
} else if (blocking > 0) {
  decision = 'FAIL';
  reasons.push(`optimizer agent reported ${blocking} blocking finding(s)`);
}
if (decision === 'PASS' && ((total ?? 0) > 0 || hadolintWarnings > 0)) {
  decision = 'WARN';
  reasons.push(`${total ?? 0} optimization recommendation(s) and ${hadolintWarnings} hadolint warning(s) to address`);
}

console.log([
  '| hadolint errors | hadolint warnings | Agent blocking | Agent total | Decision |',
  '|---|---|---|---|---|',
  `| ${hadolintErrors} | ${hadolintWarnings} | ${blocking ?? '-'} | ${total ?? '-'} | ${decision} |`,
].join('\n'));
if (clean(env.SUMMARY)) console.log(`Optimizer summary: ${env.SUMMARY.trim()}`);
console.log(`${decision}: ${reasons.join('; ') || 'Dockerfiles are clean.'}`);
process.exitCode = decision === 'FAIL' ? 1 : 0;
