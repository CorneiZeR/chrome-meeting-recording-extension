/**
 * @file platform/capabilities/auth/ChromeIdentityAuthProvider.ts
 *
 * AuthProvider backed by chrome.identity.getAuthToken — the native path on
 * Chrome (ADR-0002). Chrome mints the token for the account already signed into
 * the browser profile, so there is no window, no client secret, and no redirect
 * URI to register: the extension needs nothing but the public client id in
 * `manifest.oauth2`, and a build needs no configuration at all.
 *
 * The trade is fixed by the API, not by this file: the account **is** the
 * profile's account, so `canChooseAccount` is false and switching accounts means
 * switching Chrome profiles. Every other browser uses WebAuthFlowAuthProvider,
 * which can pick an account but needs a configured OAuth client.
 */

import type { AuthConnection, AuthProvider, AuthTokenRequest } from '../AuthProvider';
import {
  clearAllCachedAuthTokens,
  getAuthToken,
  getProfileEmail,
  removeCachedAuthToken,
} from '../../chrome/identity';
import { revokeGoogleToken, type RevokeToken } from './googleTokenRevocation';

export interface ChromeIdentityDeps {
  revoke?: RevokeToken;
}

export class ChromeIdentityAuthProvider implements AuthProvider {
  private readonly revoke: RevokeToken;

  constructor(deps: ChromeIdentityDeps = {}) {
    this.revoke = deps.revoke ?? revokeGoogleToken;
  }

  getToken({ interactive }: AuthTokenRequest): Promise<string> {
    return getAuthToken(interactive);
  }

  /**
   * Grants access interactively. There is no account picker to offer, so this
   * is simply the consent prompt for the profile's account.
   */
  async connect(): Promise<AuthConnection> {
    await getAuthToken(true);
    return await this.getConnection();
  }

  /**
   * Reports whether Chrome can already produce a token without any UI, which is
   * exactly what "connected" means here — the grant lives in Chrome, not in our
   * own storage.
   */
  async getConnection(): Promise<AuthConnection> {
    try {
      await getAuthToken(false);
    } catch {
      return { connected: false, email: null, canChooseAccount: false };
    }
    return { connected: true, email: await getProfileEmail(), canChooseAccount: false };
  }

  /**
   * Withdraws the grant at Google *and* drops Chrome's cache. Revoking alone
   * would leave Chrome handing out a cached token; clearing alone would let the
   * next request succeed silently on the standing grant.
   */
  async disconnect(): Promise<void> {
    let token: string | null = null;
    try {
      token = await getAuthToken(false);
    } catch {
      token = null;
    }
    if (token) await removeCachedAuthToken(token);
    await clearAllCachedAuthTokens();
    if (token) await this.revoke({ token });
  }

  invalidateToken(token: string): Promise<void> {
    return removeCachedAuthToken(token);
  }
}
