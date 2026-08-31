'use strict';

/**
 * @file scripts/lib/releaseArtifacts.cjs
 *
 * Naming and layout of the packaged release artifacts published on GitHub
 * Releases, shared by the webpack build (which must emit into the very
 * directory the packer zips) and by `scripts/pack-release-artifacts.mjs`.
 *
 * Users who do not have Node installed cannot run `npm run build`, so every
 * supported browser target ships as a prebuilt, unpacked-loadable zip. The file
 * name has to be stable and self-describing — it is the link users click in the
 * release body — hence a single source of truth for it here.
 */

const { TARGET_PROFILES, DEFAULT_TARGET } = require('./manifestTargets.cjs');

/** Every browser target that gets a zip on a release. */
const RELEASE_TARGETS = Object.keys(TARGET_PROFILES);

/** Aggregated checksum file uploaded next to the zips. */
const CHECKSUM_FILE_NAME = 'SHA256SUMS.txt';

/** Default directory the packer writes artifacts into (git-ignored). */
const DEFAULT_ARTIFACT_DIR = 'release';

function assertKnownTarget(target) {
  if (!RELEASE_TARGETS.includes(target)) {
    throw new Error(
      `Unknown release target "${target}". Known targets: ${RELEASE_TARGETS.join(', ')}`
    );
  }
}

/**
 * Build output directory for a target: the default target keeps the historical
 * `dist/` (referenced by docs, guards and every "Load unpacked" instruction);
 * the others live beside it as `dist-<target>/`.
 *
 * @param {string} target build-target key
 * @returns {string} repository-relative directory
 */
function distDirForTarget(target) {
  assertKnownTarget(target);
  return target === DEFAULT_TARGET ? 'dist' : `dist-${target}`;
}

/**
 * Name of the published zip for one target and release version.
 *
 * @param {string} target build-target key
 * @param {string} version semver from package.json (no leading `v`)
 * @returns {string} zip file name
 */
function artifactFileName(target, version) {
  assertKnownTarget(target);
  const normalized = String(version ?? '').trim().replace(/^v/, '');
  if (!normalized) throw new Error('A release version is required to name an artifact');
  return `google-meet-caption-extension-v${normalized}-${target}.zip`;
}

module.exports = {
  RELEASE_TARGETS,
  CHECKSUM_FILE_NAME,
  DEFAULT_ARTIFACT_DIR,
  distDirForTarget,
  artifactFileName,
};
