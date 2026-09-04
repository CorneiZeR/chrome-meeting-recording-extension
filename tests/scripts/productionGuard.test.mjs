import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { toChromeManifestVersion } = require('../../scripts/lib/manifestVersion.cjs');
const pkg = require('../../package.json');

const GUARD = path.resolve(import.meta.dirname, '../../scripts/check-production-build.mjs');

/** A minimal build tree the guard can validate. */
function makeBuild({ permissions = [], version = toChromeManifestVersion(pkg.version), extraFile = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-guard-'));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, 'background.js'), 'console.log("clean bundle");\n');
  if (extraFile) fs.writeFileSync(path.join(dist, extraFile.name), extraFile.contents);
  fs.writeFileSync(
    path.join(dist, 'manifest.json'),
    JSON.stringify({ version, permissions })
  );
  return dir;
}

function runGuard(cwd) {
  const result = spawnSync(process.execPath, [GUARD, '--dist=dist'], { cwd, encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

test('a clean build passes', () => {
  const { status, out } = runGuard(makeBuild());
  assert.equal(status, 0, out);
  assert.match(out, /clean: version/);
});

test('an E2E marker in a bundle is a violation', () => {
  // The whole point of the guard: a production zip must carry no synthetic
  // capture, fake OAuth token or Drive fetch bridge left over from the e2e build.
  const { status, out } = runGuard(makeBuild({
    extraFile: { name: 'offscreen.js', contents: 'const t = "e2e-mock-drive-token";\n' },
  }));
  assert.equal(status, 1, out);
  assert.match(out, /contains e2e-mock-drive-token/);
});

test('a placeholder or mismatched manifest version is a violation', () => {
  const placeholder = runGuard(makeBuild({ version: '0.0.0' }));
  assert.equal(placeholder.status, 1, placeholder.out);
  assert.match(placeholder.out, /0\.0\.0 placeholder/);

  const mismatched = runGuard(makeBuild({ version: '99.99.99' }));
  assert.equal(mismatched.status, 1, mismatched.out);
  assert.match(mismatched.out, /!= package\.json-derived/);
});
