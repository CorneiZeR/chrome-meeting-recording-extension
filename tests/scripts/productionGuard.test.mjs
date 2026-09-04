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
const TELEMETRY_ENDPOINT = 'https://telemetry.example.workers.dev/api/telemetry/batches';

/** A minimal build tree the guard can validate, plus an optional project `.env`. */
function makeBuild({ hostPermissions = [], dotEnv = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-guard-'));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, 'background.js'), 'console.log("clean bundle");\n');
  fs.writeFileSync(
    path.join(dist, 'manifest.json'),
    JSON.stringify({
      version: toChromeManifestVersion(pkg.version),
      permissions: ['alarms'],
      host_permissions: hostPermissions,
    })
  );
  if (dotEnv !== null) fs.writeFileSync(path.join(dir, '.env'), dotEnv);
  return dir;
}

function runGuard(cwd, env = {}) {
  const result = spawnSync(process.execPath, [GUARD, '--dist=dist'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, TELEMETRY_ENDPOINT: '', ...env },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

test('a build with no endpoint anywhere passes and says diagnostics are inert', () => {
  const { status, out } = runGuard(makeBuild());
  assert.equal(status, 0, out);
  assert.match(out, /no telemetry endpoint configured \(diagnostics inert\)/);
});

test('an endpoint in .env is honoured, so a missing host permission is caught', () => {
  // The guard must read configuration the way the build does. Reading only the
  // shell made a .env-configured endpoint invisible: the build embedded its host
  // permission while the guard reported the build as having no telemetry at all.
  const { status, out } = runGuard(makeBuild({ dotEnv: `TELEMETRY_ENDPOINT=${TELEMETRY_ENDPOINT}\n` }));
  assert.equal(status, 1, out);
  assert.match(out, /missing the exact telemetry host permission https:\/\/telemetry\.example\.workers\.dev\/\*/);
});

test('an endpoint in .env with its host permission present passes and names the origin', () => {
  const build = makeBuild({
    hostPermissions: ['https://telemetry.example.workers.dev/*'],
    dotEnv: `TELEMETRY_ENDPOINT=${TELEMETRY_ENDPOINT}\n`,
  });
  const { status, out } = runGuard(build);
  assert.equal(status, 0, out);
  assert.match(out, /telemetry endpoint permission \(https:\/\/telemetry\.example\.workers\.dev\/\*\)/);
});

test('a malformed endpoint is a violation, not a silent skip', () => {
  const { status, out } = runGuard(makeBuild(), { TELEMETRY_ENDPOINT: 'http://telemetry.example/api/telemetry/batches' });
  assert.equal(status, 1, out);
  assert.match(out, /TELEMETRY_ENDPOINT must be the exact HTTPS/);
});
