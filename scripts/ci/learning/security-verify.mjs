#!/usr/bin/env node
// Re-runs the secret and dependency scanners against the patched working tree (not Git history:
// a committed secret stays in history and must be rotated regardless of the fix).
// Pass criteria match the CI pipeline: no Gitleaks finding, no OSV advisory with CVSS >= 9.0.
//
// Inputs: GITLEAKS and OSV_SCANNER (binary paths), AGENT_DIR (default /harness/.agent)
// Output: $AGENT_DIR/loop/verify/secrets.result and deps.result (PASS|FAIL, then details)

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const env = process.env;
const verifyDir = join(env.AGENT_DIR || '/harness/.agent', 'loop', 'verify');
mkdirSync(verifyDir, { recursive: true });

// Scan only repository files (tracked plus files the patch added), never the agent evidence.
const tree = mkdtempSync(join(tmpdir(), 'tree-'));
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !f.startsWith('.agent/') && !f.includes('node_modules/'));
for (const f of files) {
  try {
    mkdirSync(join(tree, dirname(f)), { recursive: true });
    cpSync(f, join(tree, f));
  } catch {
    // Deleted by the patch.
  }
}

const leaks = spawnSync(env.GITLEAKS || 'gitleaks', ['dir', tree, '--redact', '--no-banner', '--exit-code', '1'], { encoding: 'utf8' });
const leakLog = `${leaks.stdout}${leaks.stderr}`.split(tree).join('.');
writeFileSync(join(verifyDir, 'secrets.result'), `${leaks.status === 0 ? 'PASS' : 'FAIL'}\n${leakLog}`);
console.log(`Gitleaks on patched tree: ${leaks.status === 0 ? 'PASS' : 'FAIL'}\n${leakLog}`);

const osv = spawnSync(env.OSV_SCANNER || 'osv-scanner', ['scan', 'source', '-r', tree, '--format', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let critical = [];
let depsStatus = 'PASS';
try {
  const report = JSON.parse(osv.stdout || '{}');
  for (const r of report.results || []) {
    for (const p of r.packages || []) {
      for (const g of p.groups || []) {
        const score = Number(g.max_severity || 0);
        if (score >= 9) critical.push(`${p.package.ecosystem} ${p.package.name}@${p.package.version}: ${g.ids.join(', ')} (CVSS ${score})`);
      }
    }
  }
  if (critical.length) depsStatus = 'FAIL';
} catch {
  depsStatus = 'ERROR';
  critical = [`osv-scanner output could not be parsed: ${osv.stderr.slice(0, 500)}`];
}
writeFileSync(join(verifyDir, 'deps.result'), `${depsStatus}\n${critical.join('\n') || 'No critical advisories.'}\n`);
console.log(`OSV (critical only) on patched tree: ${depsStatus}\n${critical.join('\n')}`);
