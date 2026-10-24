#!/usr/bin/env node
// Checks the patches proposed by the CI Remediation agent and decides which verifications to run.
// The code patch is applied to the workspace (this stage's clone only; nothing is committed) so
// the following steps can re-run the unit tests and scanners against the fixed tree. The pipeline
// patch is only checked, never applied.
//
// Inputs: AGENT_DIR (default /harness/.agent); patches in $AGENT_DIR/loop/out
// Output: $AGENT_DIR/loop/verify/verify.env
//   CODE_PATCH (present|absent), CODE_PATCH_APPLIES, PIPELINE_PATCH (present|absent),
//   PIPELINE_PATCH_APPLIES, VERIFY_GO, VERIFY_JAVA, VERIFY_NODE, VERIFY_SECURITY (true|false)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const agentDir = process.env.AGENT_DIR || '/harness/.agent';
const out = join(agentDir, 'loop', 'out');
const verifyDir = join(agentDir, 'loop', 'verify');
mkdirSync(verifyDir, { recursive: true });

const present = (p) => existsSync(p) && statSync(p).size > 0;
const applies = (p) => {
  try {
    execFileSync('git', ['apply', '--check', '--whitespace=nowarn', p], { stdio: 'pipe' });
    return true;
  } catch (err) {
    console.log(`git apply --check ${p} failed:\n${err.stderr?.toString() || err.message}`);
    return false;
  }
};

const codePatch = join(out, 'code-fix.patch');
const pipelinePatch = join(out, 'pipeline-fix.patch');
const result = {
  CODE_PATCH: present(codePatch) ? 'present' : 'absent',
  CODE_PATCH_APPLIES: false,
  PIPELINE_PATCH: present(pipelinePatch) ? 'present' : 'absent',
  PIPELINE_PATCH_APPLIES: false,
  VERIFY_GO: false,
  VERIFY_JAVA: false,
  VERIFY_NODE: false,
  VERIFY_SECURITY: false,
};

if (result.PIPELINE_PATCH === 'present') result.PIPELINE_PATCH_APPLIES = applies(pipelinePatch);

if (result.CODE_PATCH === 'present' && applies(codePatch)) {
  execFileSync('git', ['apply', '--whitespace=nowarn', codePatch], { stdio: 'inherit' });
  result.CODE_PATCH_APPLIES = true;
  const files = [...readFileSync(codePatch, 'utf8').matchAll(/^\+\+\+ b\/(\S+)/gm)].map((m) => m[1]);
  const touches = (dir) => files.some((f) => f.startsWith(`services/${dir}/`));
  result.VERIFY_GO = touches('telemetry-ingest');
  result.VERIFY_JAVA = touches('fleet-service');
  result.VERIFY_NODE = touches('dashboard-api');
  // Security scanners re-run whenever the CI run failed Code Security or the patch touches manifests.
  const run = existsSync(join(agentDir, 'loop', 'run.json')) ? JSON.parse(readFileSync(join(agentDir, 'loop', 'run.json'), 'utf8')) : {};
  result.VERIFY_SECURITY =
    (run.stages || []).some((s) => s.stage === 'code_security') ||
    files.some((f) => /(^|\/)(pom\.xml|go\.mod|go\.sum|package\.json|package-lock\.json)$/.test(f));
  console.log(`Applied code-fix.patch to the workspace (${files.length} files): ${files.join(', ')}`);
}

writeFileSync(join(verifyDir, 'verify.env'), Object.entries(result).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
console.log(Object.entries(result).map(([k, v]) => `${k.padEnd(24)} ${v}`).join('\n'));
