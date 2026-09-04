import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readProjectEnvValue, loadProjectDotEnv, parseDotEnv } =
  require('../../scripts/lib/projectEnv.cjs');

function withDotEnv(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-env-'));
  if (contents !== null) fs.writeFileSync(path.join(dir, '.env'), contents);
  return dir;
}

test('the shell wins over .env, and both are trimmed', () => {
  const dir = withDotEnv('TELEMETRY_ENDPOINT=https://from-dot-env.example/api/telemetry/batches\n');
  assert.equal(
    readProjectEnvValue('TELEMETRY_ENDPOINT', dir, { TELEMETRY_ENDPOINT: '  https://from-shell.example/x  ' }),
    'https://from-shell.example/x'
  );
});

test('.env is used when the shell is unset or blank', () => {
  const dir = withDotEnv('TELEMETRY_ENDPOINT= https://from-dot-env.example/api/telemetry/batches \n');
  // Every build tool has to agree on this: reading only the shell is what made
  // the production guard blind to a .env-configured endpoint the build embedded.
  assert.equal(
    readProjectEnvValue('TELEMETRY_ENDPOINT', dir, {}),
    'https://from-dot-env.example/api/telemetry/batches'
  );
  assert.equal(
    readProjectEnvValue('TELEMETRY_ENDPOINT', dir, { TELEMETRY_ENDPOINT: '   ' }),
    'https://from-dot-env.example/api/telemetry/batches'
  );
});

test('a missing key or a missing .env is an empty string, not a crash', () => {
  assert.equal(readProjectEnvValue('NOPE', withDotEnv('A=1\n'), {}), '');
  assert.equal(readProjectEnvValue('A', withDotEnv(null), {}), '');
  assert.deepEqual(loadProjectDotEnv(withDotEnv(null)), {});
});

test('parses comments, blanks, quotes and values containing "="', () => {
  assert.deepEqual(
    parseDotEnv('# comment\n\nA=1\nB="two"\nC=\'three\'\nD=a=b\n=skipped\n'),
    { A: '1', B: 'two', C: 'three', D: 'a=b' }
  );
});
