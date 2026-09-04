/**
 * @file platform/capabilities/auth/WebAuthFlowAuthProvider.ts
 *
 * The AuthProvider for every supported browser except Chrome, which signs in
 * natively through getAuthToken (ADR-0002): OAuth2 authorization-code + PKCE
 * through chrome.identity.launchWebAuthFlow. The
 * implicit flow (response_type=token) is deprecated under OAuth 2.1 and not
 * supported for new integrations, so this uses response_type=code + a PKCE
 * challenge and exchanges the code for a token.
 *
 * Interactive authorization asks for `access_type=offline` and
 * `prompt=select_account consent`, so the user picks the Google account
 * themselves (Chrome's own getAuthToken could only ever use the browser
 * profile's account) and the grant comes back with a refresh token. That
 * refresh token is what makes the connection durable: it is persisted through an
 * AuthGrantStore and spent silently for access tokens afterwards, so uploads
 * never surface a prompt of their own and the settings page can report — and
 * revoke — a real connection.
 *
 * The code->token exchange is injectable (ADR-0002): the default runs
 * client-side against Google's token endpoint with a Desktop-client secret that
 * Google treats as non-confidential; a backend exchange can be substituted
 * without touching the rest of the flow.
 */

import type { AuthConnection, AuthProvider, AuthTokenRequest } from '../AuthProvider';
import {
  createLocalAuthGrantStore,
  type AuthGrantStore,
  type StoredAuthGrant,
} from './AuthGrantStore';
import { revokeGoogleToken, type RevokeToken } from './googleTokenRevocation';

export interface WebAuthFlowConfig {
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectUri: string;
  authEndpoint?: string;
  tokenEndpoint?: string;
  revokeEndpoint?: string;
}

export type LaunchWebAuthFlow = (url: string, interactive: boolean) => Promise<string>;

export interface PkcePair {
  verifier: string;
  challenge: string;
}
export type CreatePkcePair = () => Promise<PkcePair>;

/** What Google's token endpoint returns for both grant types we use. */
export interface TokenSet {
  accessToken: string;
  /** Present on an authorization-code exchange with offline access; absent on a refresh. */
  refreshToken: string | null;
  /** Access-token lifetime in seconds, when the response stated one. */
  expiresInSeconds: number | null;
  /** Signed account claims, present when the `openid` scope was granted. */
  idToken: string | null;
}

export interface TokenExchangeParams {
  code: string;
  codeVerifier: string;
  config: WebAuthFlowConfig;
}
export type ExchangeAuthCode = (params: TokenExchangeParams) => Promise<TokenSet>;

export interface TokenRefreshParams {
  refreshToken: string;
  config: WebAuthFlowConfig;
}
export type RefreshAccessToken = (params: TokenRefreshParams) => Promise<TokenSet>;

export interface WebAuthFlowDeps {
  launch: LaunchWebAuthFlow;
  createPkce?: CreatePkcePair;
  exchange?: ExchangeAuthCode;
  refresh?: RefreshAccessToken;
  revoke?: RevokeToken;
  store?: AuthGrantStore;
  generateState?: () => string;
  now?: () => number;
}

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Refresh this long before the stated expiry, so a token never dies mid-upload. */
const EXPIRY_SKEW_MS = 60_000;
/** Assumed access-token lifetime when Google states none. */
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

export const NOT_CONNECTED_ERROR = 'Google Drive is not connected';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomUrlSafeToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** SHA-256 + base64url of a PKCE code verifier (RFC 7636 S256). */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomUrlSafeToken(32);
  return { verifier, challenge: await deriveCodeChallenge(verifier) };
}

export function buildAuthUrl(
  config: WebAuthFlowConfig,
  params: { codeChallenge: string; state: string }
): string {
  const query = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    state: params.state,
    // A refresh token is what keeps the connection alive between sessions, and
    // Google only issues one for an offline grant that was explicitly consented.
    access_type: 'offline',
    // The account is the user's to pick — this is the whole point of preferring
    // this flow over Chrome's profile-bound getAuthToken.
    prompt: 'select_account consent',
  });
  return `${config.authEndpoint ?? GOOGLE_AUTH_ENDPOINT}?${query.toString()}`;
}

/** Extract the authorization code and state from the OAuth redirect query. */
export function parseAuthRedirect(redirectUrl: string): { code: string | null; state: string | null } {
  const queryIndex = redirectUrl.indexOf('?');
  if (queryIndex < 0) return { code: null, state: null };
  const query = redirectUrl.slice(queryIndex + 1).split('#')[0];
  const params = new URLSearchParams(query);
  return { code: params.get('code'), state: params.get('state') };
}

/** Reads the `email` claim out of an id_token, for display only — never for trust. */
export function readEmailFromIdToken(idToken: string | null | undefined): string | null {
  if (!idToken) return null;
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))) as { email?: unknown };
    return typeof claims.email === 'string' && claims.email ? claims.email : null;
  } catch {
    return null;
  }
}

function toTokenSet(payload: Record<string, unknown>): TokenSet {
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
  if (!accessToken) throw new Error('Token exchange returned no access_token');
  return {
    accessToken,
    refreshToken: typeof payload.refresh_token === 'string' && payload.refresh_token
      ? payload.refresh_token
      : null,
    expiresInSeconds: typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : null,
    idToken: typeof payload.id_token === 'string' && payload.id_token ? payload.id_token : null,
  };
}

async function postToTokenEndpoint(config: WebAuthFlowConfig, body: URLSearchParams): Promise<TokenSet> {
  const response = await fetch(config.tokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Token exchange failed (${response.status}): ${detail}`);
  }
  return toTokenSet((await response.json()) as Record<string, unknown>);
}

/** Default client-side code->token exchange against Google's token endpoint. */
export function exchangeAuthCodeForToken({ code, codeVerifier, config }: TokenExchangeParams): Promise<TokenSet> {
  return postToTokenEndpoint(config, new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier,
    redirect_uri: config.redirectUri,
  }));
}

/** Default silent refresh: spends the stored refresh token for a fresh access token. */
export function refreshAccessTokenGrant({ refreshToken, config }: TokenRefreshParams): Promise<TokenSet> {
  return postToTokenEndpoint(config, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  }));
}

/** True for the one error a refresh can never recover from: the grant is gone. */
function isDeadGrantError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid_grant|invalid_token|unauthorized_client/i.test(message);
}

export class WebAuthFlowAuthProvider implements AuthProvider {
  private readonly launch: LaunchWebAuthFlow;
  private readonly createPkce: CreatePkcePair;
  private readonly exchange: ExchangeAuthCode;
  private readonly refresh: RefreshAccessToken;
  private readonly revoke: RevokeToken;
  private readonly store: AuthGrantStore;
  private readonly generateState: () => string;
  private readonly now: () => number;

  constructor(private readonly config: WebAuthFlowConfig, deps: WebAuthFlowDeps) {
    this.launch = deps.launch;
    this.createPkce = deps.createPkce ?? createPkcePair;
    this.exchange = deps.exchange ?? exchangeAuthCodeForToken;
    this.refresh = deps.refresh ?? refreshAccessTokenGrant;
    this.revoke = deps.revoke ?? revokeGoogleToken;
    this.store = deps.store ?? createLocalAuthGrantStore();
    this.generateState = deps.generateState ?? (() => randomUrlSafeToken(16));
    this.now = deps.now ?? (() => Date.now());
  }

  /**
   * Returns a usable access token, preferring the cheapest source: the cached
   * one, then a silent refresh, and only then — when the caller allows UI — the
   * full interactive authorization.
   */
  async getToken({ interactive }: AuthTokenRequest): Promise<string> {
    this.assertConfigured();
    const grant = await this.store.load();

    if (grant?.accessToken && grant.expiresAt - this.now() > EXPIRY_SKEW_MS) {
      return grant.accessToken;
    }

    if (grant?.refreshToken) {
      try {
        return await this.persist(await this.refresh({ refreshToken: grant.refreshToken, config: this.config }), grant);
      } catch (error) {
        // A revoked or expired grant can never be revived, so drop it instead of
        // reporting a connection the next upload would fail on.
        if (isDeadGrantError(error)) await this.store.clear();
        if (!interactive) throw error;
      }
    }

    if (!interactive) throw new Error(NOT_CONNECTED_ERROR);
    return await this.authorize();
  }

  /** Runs the interactive account picker + consent and stores the resulting grant. */
  async connect(): Promise<AuthConnection> {
    this.assertConfigured();
    await this.authorize();
    return await this.getConnection();
  }

  async getConnection(): Promise<AuthConnection> {
    const grant = await this.store.load();
    return { connected: !!grant?.refreshToken, email: grant?.email ?? null, canChooseAccount: true };
  }

  async disconnect(): Promise<void> {
    const grant = await this.store.load();
    const token = grant?.refreshToken ?? grant?.accessToken ?? null;
    // Forget first: a revocation that fails must not leave the extension
    // claiming a connection it no longer intends to use.
    await this.store.clear();
    if (!token) return;
    await this.revoke({ token, endpoint: this.config.revokeEndpoint });
  }

  /** Drops a cached access token, keeping the grant, so the next call refreshes. */
  async invalidateToken(token: string): Promise<void> {
    const grant = await this.store.load();
    if (!grant || grant.accessToken !== token) return;
    await this.store.save({ ...grant, accessToken: null, expiresAt: 0 });
  }

  private assertConfigured(): void {
    if (!this.config.clientId) {
      throw new Error('Web OAuth client ID is not configured for launchWebAuthFlow');
    }
  }

  private async authorize(): Promise<string> {
    const { verifier, challenge } = await this.createPkce();
    const state = this.generateState();
    const redirectUrl = await this.launch(
      buildAuthUrl(this.config, { codeChallenge: challenge, state }),
      true
    );
    const parsed = parseAuthRedirect(redirectUrl);
    if (parsed.state !== state) {
      throw new Error('OAuth state mismatch in launchWebAuthFlow redirect');
    }
    if (!parsed.code) {
      throw new Error('launchWebAuthFlow returned no authorization code');
    }
    const tokens = await this.exchange({ code: parsed.code, codeVerifier: verifier, config: this.config });
    // Google may omit refresh_token when the account already holds an offline
    // grant, so merge onto whatever is stored: overwriting with null would
    // report the connection as gone while it is still live at Google.
    return await this.persist(tokens, await this.store.load());
  }

  /** Merges a token response into the stored grant and returns its access token. */
  private async persist(tokens: TokenSet, previous: StoredAuthGrant | null): Promise<string> {
    const expiresIn = tokens.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
    await this.store.save({
      // A refresh response carries no refresh token of its own; the stored one
      // stays valid, so losing it here would silently break the connection.
      refreshToken: tokens.refreshToken ?? previous?.refreshToken ?? null,
      accessToken: tokens.accessToken,
      expiresAt: this.now() + expiresIn * 1000,
      email: readEmailFromIdToken(tokens.idToken) ?? previous?.email ?? null,
    });
    return tokens.accessToken;
  }
}
