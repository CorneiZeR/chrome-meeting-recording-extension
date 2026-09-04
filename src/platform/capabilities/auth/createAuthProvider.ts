/**
 * @file platform/capabilities/auth/createAuthProvider.ts
 *
 * Composition root for the auth capability (ADR-0002). The only place a concrete
 * AuthProvider is built.
 *
 * Chrome uses its own `chrome.identity.getAuthToken`: it signs in with the
 * account already in the browser profile, needs no client secret, no redirect
 * URI and no build configuration — the public client id in `manifest.oauth2` is
 * the whole setup. That simplicity is the point; the cost is that the account
 * cannot be chosen (`canChooseAccount` is false).
 *
 * `getAuthToken` is Chrome-only, so every other target falls back to the
 * standard launchWebAuthFlow OAuth2 code + PKCE flow, which *can* pick an
 * account but needs a configured web OAuth client.
 */

import type { AuthProvider } from '../AuthProvider';
import { ChromeIdentityAuthProvider } from './ChromeIdentityAuthProvider';
import { WebAuthFlowAuthProvider } from './WebAuthFlowAuthProvider';
import { getRedirectURL, launchWebAuthFlow } from '../../chrome/identity';

/**
 * `drive.file` is the upload scope; `openid`/`email` exist only so the
 * launchWebAuthFlow grant carries an id_token and the settings page can name the
 * connected account. The Chrome-native path takes its scopes from
 * `manifest.oauth2.scopes` instead, and reads the account from the profile.
 */
export const DRIVE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
];

function getWebOAuthClientId(): string {
  if (typeof __WEB_OAUTH_CLIENT_ID__ !== 'undefined' && __WEB_OAUTH_CLIENT_ID__) return __WEB_OAUTH_CLIENT_ID__;
  return (globalThis as { __WEB_OAUTH_CLIENT_ID__?: string }).__WEB_OAUTH_CLIENT_ID__ ?? '';
}

function getWebOAuthClientSecret(): string {
  if (typeof __WEB_OAUTH_CLIENT_SECRET__ !== 'undefined' && __WEB_OAUTH_CLIENT_SECRET__) return __WEB_OAUTH_CLIENT_SECRET__;
  return (globalThis as { __WEB_OAUTH_CLIENT_SECRET__?: string }).__WEB_OAUTH_CLIENT_SECRET__ ?? '';
}

function getBrowserTarget(): string {
  if (typeof __BROWSER_TARGET__ !== 'undefined' && __BROWSER_TARGET__) return __BROWSER_TARGET__;
  return (globalThis as { __BROWSER_TARGET__?: string }).__BROWSER_TARGET__ ?? 'chrome';
}

function chromeIdentityTokenSupported(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.identity?.getAuthToken === 'function';
}

export function createAuthProvider(): AuthProvider {
  // The build target decides, with a runtime capability guard so a Chrome build
  // lacking getAuthToken falls back rather than crashing.
  if (getBrowserTarget() === 'chrome' && chromeIdentityTokenSupported()) {
    return new ChromeIdentityAuthProvider();
  }
  return new WebAuthFlowAuthProvider(
    {
      clientId: getWebOAuthClientId(),
      clientSecret: getWebOAuthClientSecret(),
      scopes: DRIVE_OAUTH_SCOPES,
      redirectUri: getRedirectURL(),
    },
    { launch: launchWebAuthFlow }
  );
}
