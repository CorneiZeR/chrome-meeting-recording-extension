/**
 * @file background/driveAuth.ts
 *
 * Owns the Google account grant behind Drive uploads: silent-first token
 * acquisition for the upload path, the explicit connect/disconnect the settings
 * page drives, and setup diagnostics for a misconfigured OAuth client.
 */

import type { AuthConnection, AuthProvider } from '../platform/capabilities/AuthProvider';
import { createAuthProvider } from '../platform/capabilities/auth/createAuthProvider';
import { getRuntimeId, getRuntimeManifest } from '../platform/chrome/runtime';
import { isE2EMockDriveBuild } from '../shared/build';

type DriveTokenOk = { ok: true; token: string };
type DriveTokenErr = { ok: false; error: string };
export type DriveTokenResponse = DriveTokenOk | DriveTokenErr;
export type DriveTokenOptions = { refresh?: boolean };
export type DriveConnectResponse =
  | { ok: true; connection: AuthConnection }
  | { ok: false; error: string };
export type DriveDisconnectResponse = { ok: true } | { ok: false; error: string };

/** Errors that mean the OAuth client itself is not set up, not that the user declined. */
const MISCONFIGURED_CLIENT_RE = /client ID is not configured|bad client id|invalid_client|unauthorized_client|redirect_uri_mismatch/i;

let lastIssuedToken: string | null = null;

// Token acquisition is delegated to the AuthProvider capability (ADR-0002); the
// silent-then-interactive and refresh policy below stays browser-agnostic.
// Lazily created so the chrome capability check runs after the environment is
// ready (and is overridable in tests via setAuthProvider).
let authProvider: AuthProvider | null = null;

function provider(): AuthProvider {
  if (!authProvider) authProvider = createAuthProvider();
  return authProvider;
}

/** Test seam: inject a fake AuthProvider, or pass null to reset to the default. */
export function setAuthProvider(next: AuthProvider | null): void {
  authProvider = next;
}

function isMockDriveBuild(): boolean {
  return typeof __E2E_MOCK_DRIVE_BUILD__ !== 'undefined'
    ? __E2E_MOCK_DRIVE_BUILD__
    : isE2EMockDriveBuild();
}

async function issueAuthToken(interactive: boolean): Promise<string> {
  const token = await provider().getToken({ interactive });
  lastIssuedToken = token;
  return token;
}

async function invalidateLastIssuedToken(): Promise<void> {
  if (!lastIssuedToken) return;
  const token = lastIssuedToken;
  lastIssuedToken = null;
  await provider().invalidateToken(token);
}

function isMisconfiguredClientError(message: string): boolean {
  return MISCONFIGURED_CLIENT_RE.test(message);
}

/**
 * Turns a setup failure into the fix, which differs per strategy: Chrome's
 * native sign-in is configured by the manifest's client id, while the
 * cross-browser flow needs a web client and a registered redirect URI.
 */
function buildMisconfiguredClientError(rawError: string): string {
  const extensionId = getRuntimeId() ?? '(unknown extension id)';
  const manifestClientId = getRuntimeManifest().oauth2?.client_id;

  const fix = manifestClientId
    ? 'Fix: create a Google Cloud OAuth client of type "Chrome Extension" for this extension ID '
      + `and put its client id in manifest.oauth2.client_id (currently ${manifestClientId}).`
    : 'Fix: create a Google Cloud OAuth client that allows the redirect URI '
      + `https://${extensionId}.chromiumapp.org/ (run "npm run redirect-uri" to confirm it), `
      + 'then build with GOOGLE_WEB_OAUTH_CLIENT_ID and GOOGLE_WEB_OAUTH_CLIENT_SECRET set.';

  return `Google OAuth is misconfigured: ${rawError} Current extension ID: ${extensionId} ${fix}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchDriveTokenWithFallback(options: DriveTokenOptions = {}): Promise<DriveTokenResponse> {
  if (isMockDriveBuild()) {
    return { ok: true, token: 'e2e-mock-drive-token' };
  }

  if (options.refresh) {
    await invalidateLastIssuedToken();
  }

  try {
    const token = await issueAuthToken(false);
    return { ok: true, token };
  } catch (silentErr: unknown) {
    const silentMessage = toErrorMessage(silentErr);
    if (isMisconfiguredClientError(silentMessage)) {
      return { ok: false, error: buildMisconfiguredClientError(silentMessage) };
    }
    // The connection is normally made ahead of time in the settings page; this
    // interactive fallback only covers a grant that was revoked since.
    try {
      const token = await issueAuthToken(true);
      return { ok: true, token };
    } catch (interactiveErr: unknown) {
      const interactiveMessage = toErrorMessage(interactiveErr);
      if (isMisconfiguredClientError(interactiveMessage)) {
        return { ok: false, error: buildMisconfiguredClientError(interactiveMessage) };
      }
      return {
        ok: false,
        error: `OAuth token fetch failed. Silent auth error: ${silentMessage}. Interactive auth error: ${interactiveMessage}`,
      };
    }
  }
}

/** Reports the stored grant for the settings page, without prompting. */
export async function getDriveConnection(): Promise<AuthConnection> {
  if (isMockDriveBuild()) return { connected: true, email: null, canChooseAccount: false };
  try {
    return await provider().getConnection();
  } catch {
    // An unreadable grant is indistinguishable from none as far as the user's
    // next action goes: they need to connect.
    return { connected: false, email: null, canChooseAccount: false };
  }
}

/** Runs the interactive Google account picker and consent. */
export async function connectDrive(): Promise<DriveConnectResponse> {
  if (isMockDriveBuild()) return { ok: true, connection: { connected: true, email: null, canChooseAccount: false } };
  try {
    return { ok: true, connection: await provider().connect() };
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    return {
      ok: false,
      error: isMisconfiguredClientError(message) ? buildMisconfiguredClientError(message) : message,
    };
  }
}

/** Revokes the grant at Google and forgets it locally. */
export async function disconnectDrive(): Promise<DriveDisconnectResponse> {
  if (isMockDriveBuild()) return { ok: true };
  lastIssuedToken = null;
  try {
    await provider().disconnect();
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: toErrorMessage(error) };
  }
}
