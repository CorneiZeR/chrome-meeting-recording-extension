/**
 * @file tests/scripts/releaseArtifacts.test.mjs
 *
 * The release artifact naming contract: the names published on GitHub Releases
 * are what users click, and the dist directories are what the packer zips, so
 * both are pinned here rather than re-derived at each call site.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  RELEASE_TARGETS,
  distDirForTarget,
  artifactFileName,
} = require('../../scripts/lib/releaseArtifacts.cjs');

test('every supported browser target is released', () => {
  assert.deepEqual(
    [...RELEASE_TARGETS].sort(),
    ['arc', 'brave', 'chrome', 'edge', 'opera', 'vivaldi']
  );
});

test('the default target keeps dist/, the others get dist-<target>/', () => {
  assert.equal(distDirForTarget('chrome'), 'dist');
  assert.equal(distDirForTarget('edge'), 'dist-edge');
  assert.equal(distDirForTarget('vivaldi'), 'dist-vivaldi');
});

test('an unknown target is rejected instead of packaging an empty directory', () => {
  assert.throws(() => distDirForTarget('firefox'), /Unknown release target "firefox"/);
  assert.throws(() => artifactFileName('firefox', '1.0.0'), /Unknown release target/);
});

test('artifact names carry the version and the target', () => {
  assert.equal(
    artifactFileName('chrome', '0.9.1'),
    'google-meet-caption-extension-v0.9.1-chrome.zip'
  );
  // A `v` prefix from a git tag must not double up in the file name.
  assert.equal(
    artifactFileName('brave', 'v1.2.3'),
    'google-meet-caption-extension-v1.2.3-brave.zip'
  );
});

test('a missing version is a hard error, never an unnamed artifact', () => {
  assert.throws(() => artifactFileName('chrome', ''), /release version is required/);
});
