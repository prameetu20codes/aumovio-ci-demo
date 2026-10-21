#!/usr/bin/env node
// Builds the context the Dockerfile Optimizer agent reviews: every service Dockerfile, its hadolint
// findings, whether the build context has a .dockerignore, and how much the context would send to
// the Docker daemon (which drives layer-cache invalidation).
//
// Inputs (environment): AGENT_DIR (default /harness/.agent); hadolint JSON at $AGENT_DIR/dockerfile/hadolint.json
// Outputs: $AGENT_DIR/dockerfile/context.md, $AGENT_DIR/dockerfile/context.json,
//          $AGENT_DIR/dockerfile/hadolint.env (HADOLINT_ERRORS, HADOLINT_WARNINGS)

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const agentDir = process.env.AGENT_DIR || '/harness/.agent';
const outDir = join(agentDir, 'dockerfile');
mkdirSync(outDir, { recursive: true });

const hadolintPath = join(outDir, 'hadolint.json');
let findings = [];
try {
  findings = existsSync(hadolintPath) ? JSON.parse(readFileSync(hadolintPath, 'utf8') || '[]') : [];
} catch {
  findings = [];
}

function walk(dir, acc = { files: 0, bytes: 0, top: {} }) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.isFile()) {
      const size = statSync(p).size;
      acc.files += 1;
      acc.bytes += size;
      const topLevel = relative(acc.root, p).split('/')[0];
      acc.top[topLevel] = (acc.top[topLevel] || 0) + size;
    }
  }
  return acc;
}

const services = readdirSync('services', { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join('services', d.name, 'Dockerfile')))
  .map((d) => {
    const dir = join('services', d.name);
    const dockerfile = join(dir, 'Dockerfile');
    const ctx = walk(dir, { files: 0, bytes: 0, top: {}, root: dir });
    const fromLines = readFileSync(dockerfile, 'utf8').split('\n').filter((l) => /^FROM\s/i.test(l)).map((l) => l.trim());
    return {
      service: d.name,
      dockerfile,
      content: readFileSync(dockerfile, 'utf8'),
      baseImages: fromLines,
      unpinnedBaseImages: fromLines.filter((l) => !l.includes('@sha256:')),
      hasDockerignore: existsSync(join(dir, '.dockerignore')),
      contextFiles: ctx.files,
      contextMB: +(ctx.bytes / 1048576).toFixed(2),
      largestContextEntries: Object.entries(ctx.top).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([name, bytes]) => ({ name, mb: +(bytes / 1048576).toFixed(2) })),
      hadolint: findings.filter((f) => f.file === dockerfile || f.file?.endsWith(`/${dockerfile}`)),
    };
  });

const errors = findings.filter((f) => f.level === 'error').length;
const warnings = findings.filter((f) => f.level === 'warning').length;

writeFileSync(join(outDir, 'context.json'), JSON.stringify({ services, hadolint: { errors, warnings } }, null, 2));
writeFileSync(join(outDir, 'hadolint.env'), `HADOLINT_ERRORS=${errors}\nHADOLINT_WARNINGS=${warnings}\n`);

const md = [
  '# Dockerfile review context',
  `- hadolint: ${errors} error(s), ${warnings} warning(s)`,
  '- Pipeline build settings: BuildAndPushDockerRegistry with `caching: true` (Docker layer caching);',
  '  application artifacts (Go binary, shaded JAR) are built by earlier pipeline steps and copied into the image.',
  '- Context sizes below come from this checkout. In the build stages the contexts also contain build outputs:',
  '  services/dashboard-api/node_modules (npm ci, dev dependencies included), services/telemetry-ingest/bin and',
  '  services/fleet-service/**/target.',
  '',
  ...services.flatMap((s) => [
    `## ${s.service}`,
    `- Build context: ${s.contextFiles} files, ${s.contextMB} MB; .dockerignore present: ${s.hasDockerignore}`,
    `- Largest context entries: ${s.largestContextEntries.map((e) => `${e.name} (${e.mb} MB)`).join(', ')}`,
    `- Base images not pinned by digest: ${s.unpinnedBaseImages.length ? s.unpinnedBaseImages.join(' | ') : 'none'}`,
    `- hadolint: ${s.hadolint.length ? s.hadolint.map((f) => `${f.level} ${f.code} line ${f.line}: ${f.message}`).join('; ') : 'clean'}`,
    '```dockerfile',
    s.content.trimEnd(),
    '```',
    '',
  ]),
].join('\n');
writeFileSync(join(outDir, 'context.md'), md + '\n');
console.log(md);
