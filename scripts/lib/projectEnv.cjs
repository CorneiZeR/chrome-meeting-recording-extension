'use strict';

/**
 * @file scripts/lib/projectEnv.cjs
 *
 * How build-time configuration is read: the shell environment first, then the
 * project's `.env`.
 *
 * It lives here because more than one tool needs the *same* answer. The webpack
 * build read both sources while the production guard read only the shell, so an
 * endpoint configured in `.env` was embedded by the build and then reported as
 * absent by the guard — a guard disagreeing with the build it validates.
 */

const fs = require('fs');
const path = require('path');

function parseDotEnv(rawContent) {
  const parsed = {};
  for (const rawLine of rawContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const delimiterIndex = line.indexOf('=');
    if (delimiterIndex <= 0) continue;

    const key = line.slice(0, delimiterIndex).trim();
    let value = line.slice(delimiterIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

/** The project's `.env` as a plain object; an absent file is simply empty. */
function loadProjectDotEnv(projectRoot) {
  const envPath = path.resolve(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return {};
  return parseDotEnv(fs.readFileSync(envPath, 'utf8'));
}

/**
 * One configuration value, read the way every build tool here must read it:
 * the shell wins over `.env`, and the result is trimmed.
 */
function readProjectEnvValue(key, projectRoot = process.cwd(), env = process.env) {
  const fromShell = env[key];
  if (typeof fromShell === 'string' && fromShell.trim()) return fromShell.trim();
  return String(loadProjectDotEnv(projectRoot)[key] ?? '').trim();
}

module.exports = { parseDotEnv, loadProjectDotEnv, readProjectEnvValue };
