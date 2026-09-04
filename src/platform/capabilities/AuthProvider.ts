/**
 * @file platform/capabilities/AuthProvider.ts
 *
 * Capability port for the Google account grant behind Drive uploads (ADR-0002).
 * Common logic depends only on this interface; the concrete strategy (the
 * cross-browser launchWebAuthFlow OAuth2 flow) lives in an adapter under ./auth
 * and is chosen by the composition root in ./auth/createAuthProvider.
 *
 * The port covers the whole life of a grant, not just token acquisition: the
 * settings page shows what is connected and can hand it back, so `getConnection`
 * and `disconnect` are part of the capability rather than page-local logic.
 */

export interface AuthTokenRequest {
  /** When false, attempt silent acquisition; when true, allow interactive UI. */
  interactive: boolean;
}

/** What the extension knows about the stored grant, without any network or UI. */
export interface AuthConnection {
  /** True while a grant that can mint access tokens silently is stored. */
  connected: boolean;
  /** The connected account's email when the grant carried one; null when unknown. */
  email: string | null;
  /**
   * Whether `connect` can choose a different Google account. False for the
   * Chrome-native strategy, where the account is the browser profile's and the
   * settings page must not offer a picker it cannot deliver.
   */
  canChooseAccount: boolean;
}

export interface AuthProvider {
  /** Acquire an OAuth access token. */
  getToken(request: AuthTokenRequest): Promise<string>;
  /**
   * Run interactive authorization and report what got connected. Unlike an
   * interactive `getToken` this always re-authorizes, which is what lets the
   * user switch to a different Google account.
   */
  connect(): Promise<AuthConnection>;
  /** Invalidate a previously issued token so the next getToken re-fetches. */
  invalidateToken(token: string): Promise<void>;
  /** Report the stored grant without prompting or calling out. */
  getConnection(): Promise<AuthConnection>;
  /** Revoke and forget the stored grant. */
  disconnect(): Promise<void>;
}
