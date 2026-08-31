/**
 * @file scripts/pack-release-artifacts.mjs
 *
 * Packs installable release artifacts: for every supported browser target it
 * runs the production build, re-runs the production guards against that target's
 * output, and zips it into `release/`. A `SHA256SUMS.txt` covering every zip is
 * written alongside them.
 *
 * This is what the release workflow uploads to a GitHub Release, so users
 * without Node can download a zip, unpack it and "Load unpacked" — no build.
 *
 * Usage:
 *   node scripts/pack-release-artifacts.mjs [--targets=chrome,edge] [--out-dir=release]
 *
 * TELEMETRY_ENDPOINT is required (production builds refuse to run without it);
 * GOOGLE_OAUTH_CLIENT_ID and the GOOGLE_WEB_OAUTH_CLIENT_ID/SECRET pair are read
 * by webpack from the environment or `.env` as usual.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  RELEASE_TARGETS,
  CHECKSUM_FILE_NAME,
  DEFAULT_ARTIFACT_DIR,
  distDirForTarget,
  artifactFileName,
} = require('./lib/releaseArtifacts.cjs');
const pkg = require('../package.json');

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readFlag(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

const requestedTargets = readFlag('targets');
const targets = requestedTargets
  ? requestedTargets.split(',').map((value) => value.trim()).filter(Boolean)
  : RELEASE_TARGETS;
for (const target of targets) distDirForTarget(target); // rejects unknown targets up front

const outDir = path.resolve(projectRoot, readFlag('out-dir') || DEFAULT_ARTIFACT_DIR);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: projectRoot, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

if (spawnSync('zip', ['-v'], { stdio: 'ignore' }).status !== 0) {
  throw new Error('The `zip` command is required to pack release artifacts');
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const checksums = [];
for (const target of targets) {
  const distDir = distDirForTarget(target);
  console.log(`\n=== ${target}: build → guards → zip ===`);
  run('npm', ['exec', '--', 'webpack', '--mode=production', `--env`, `target=${target}`]);
  run('node', ['scripts/check-production-build.mjs', `--dist=${distDir}`]);

  const zipName = artifactFileName(target, pkg.version);
  const zipPath = path.join(outDir, zipName);
  // Zip the *contents* of the dist directory: Chrome expects the manifest at the
  // root of the unpacked folder, so an extra top-level directory would break
  // "Load unpacked" for anyone who unzips and points the browser at the result.
  // -X drops platform extras (resource forks, uid/gid) from the archive.
  run('zip', ['-qrX', zipPath, '.'], { cwd: path.resolve(projectRoot, distDir) });

  const digest = createHash('sha256').update(await fs.readFile(zipPath)).digest('hex');
  checksums.push(`${digest}  ${zipName}`);
  console.log(`packed ${path.relative(projectRoot, zipPath)}`);
}

await fs.writeFile(path.join(outDir, CHECKSUM_FILE_NAME), `${checksums.join('\n')}\n`, 'utf8');
console.log(
  `\nRelease artifacts for v${pkg.version} in ${path.relative(projectRoot, outDir)}/: ` +
  `${targets.length} zip(s) plus ${CHECKSUM_FILE_NAME}.`
);
