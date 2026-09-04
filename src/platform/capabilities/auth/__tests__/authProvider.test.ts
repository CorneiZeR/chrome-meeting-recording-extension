import { ChromeIdentityAuthProvider } from '../ChromeIdentityAuthProvider';
import { revokeGoogleToken } from '../googleTokenRevocation';
import {
  WebAuthFlowAuthProvider,
  buildAuthUrl,
  parseAuthRedirect,
  deriveCodeChallenge,
  createPkcePair,
  exchangeAuthCodeForToken,
  refreshAccessTokenGrant,
  readEmailFromIdToken,
  NOT_CONNECTED_ERROR,
  type TokenSet,
} from '../WebAuthFlowAuthProvider';
import { normalizeStoredAuthGrant, type AuthGrantStore, type StoredAuthGrant } from '../AuthGrantStore';
import { createAuthProvider } from '../createAuthProvider';

const config = {
  clientId: 'web-client-id',
  clientSecret: 'web-secret',
  scopes: ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'],
  redirectUri: 'https://abc.chromiumapp.org/',
};

/** An id_token is only ever read for its email claim, so a hand-rolled JWT suffices. */
function idTokenFor(claims: Record<string, unknown>): string {
  const body = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${body}.signature`;
}

function tokenSet(over: Partial<TokenSet> = {}): TokenSet {
  return { accessToken: 'at', refreshToken: null, expiresInSeconds: 3600, idToken: null, ...over };
}

function memoryStore(initial: StoredAuthGrant | null = null): AuthGrantStore & { grant: StoredAuthGrant | null } {
  return {
    grant: initial,
    async load() { return this.grant; },
    async save(grant: StoredAuthGrant) { this.grant = grant; },
    async clear() { this.grant = null; },
  };
}

describe('WebAuthFlow PKCE + URL helpers', () => {
  it('derives the RFC 7636 S256 challenge from a verifier', async () => {
    // RFC 7636 Appendix B test vector.
    await expect(
      deriveCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('creates a url-safe verifier whose challenge derives from it', async () => {
    const { verifier, challenge } = await createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toBe(await deriveCodeChallenge(verifier));
  });

  it('asks for an offline grant and lets the user pick the account', () => {
    const url = new URL(buildAuthUrl(config, { codeChallenge: 'CH', state: 'ST' }));
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('web-client-id');
    expect(url.searchParams.get('code_challenge')).toBe('CH');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('ST');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file openid email');
    // Without offline access there is no refresh token, and the connection would
    // die with the browser session; without select_account the user could never
    // choose a different Google account.
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('select_account consent');
  });

  it('parses code and state from the redirect query', () => {
    expect(parseAuthRedirect('https://abc.chromiumapp.org/?code=abc&state=xyz')).toEqual({ code: 'abc', state: 'xyz' });
    expect(parseAuthRedirect('https://abc.chromiumapp.org/?error=denied')).toEqual({ code: null, state: null });
    expect(parseAuthRedirect('https://abc.chromiumapp.org/')).toEqual({ code: null, state: null });
  });

  it('reads the email claim out of an id_token, and nothing out of a broken one', () => {
    expect(readEmailFromIdToken(idTokenFor({ email: 'me@example.com' }))).toBe('me@example.com');
    expect(readEmailFromIdToken(idTokenFor({ sub: '123' }))).toBeNull();
    expect(readEmailFromIdToken('not-a-jwt')).toBeNull();
    expect(readEmailFromIdToken(null)).toBeNull();
  });
});

describe('token endpoint calls', () => {
  afterEach(() => { (global as any).fetch = undefined; });

  it('POSTs code + verifier + secret and returns the whole token set', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'at-123', refresh_token: 'rt-123', expires_in: 3599, id_token: 'idt' }),
    });

    await expect(exchangeAuthCodeForToken({ code: 'c', codeVerifier: 'v', config })).resolves.toEqual({
      accessToken: 'at-123',
      refreshToken: 'rt-123',
      expiresInSeconds: 3599,
      idToken: 'idt',
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init.body).toContain('grant_type=authorization_code');
    expect(init.body).toContain('code_verifier=v');
    expect(init.body).toContain('client_secret=web-secret');
  });

  it('spends a refresh token for a new access token', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'at-fresh', expires_in: 3600 }),
    });

    const set = await refreshAccessTokenGrant({ refreshToken: 'rt-123', config });

    expect(set.accessToken).toBe('at-fresh');
    // A refresh response carries no refresh token of its own.
    expect(set.refreshToken).toBeNull();
    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain('grant_type=refresh_token');
  });

  it('throws with detail on a non-OK response and when no access_token comes back', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'invalid_grant' });
    await expect(exchangeAuthCodeForToken({ code: 'c', codeVerifier: 'v', config })).rejects.toThrow(/400.*invalid_grant/);

    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(exchangeAuthCodeForToken({ code: 'c', codeVerifier: 'v', config })).rejects.toThrow(/no access_token/);
  });

  it('POSTs the token to the revocation endpoint', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    await revokeGoogleToken({ token: 'rt-123' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(init.body).toContain('token=rt-123');
  });

  it('reports a failed revocation', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'busy' });
    await expect(revokeGoogleToken({ token: 'rt-123' })).rejects.toThrow(/revocation failed \(503\)/);
  });
});

describe('WebAuthFlowAuthProvider', () => {
  function deps(over: Record<string, unknown> = {}) {
    return {
      launch: jest.fn().mockImplementation((url: string) => {
        const state = new URL(url).searchParams.get('state');
        return Promise.resolve(`https://abc.chromiumapp.org/?code=auth-code&state=${state}`);
      }),
      createPkce: jest.fn().mockResolvedValue({ verifier: 'ver', challenge: 'chal' }),
      exchange: jest.fn().mockResolvedValue(tokenSet({
        accessToken: 'final-token',
        refreshToken: 'refresh-token',
        idToken: idTokenFor({ email: 'me@example.com' }),
      })),
      refresh: jest.fn().mockResolvedValue(tokenSet({ accessToken: 'refreshed-token' })),
      revoke: jest.fn().mockResolvedValue(undefined),
      store: memoryStore(),
      now: () => 1_000_000,
      ...over,
    };
  }

  it('authorizes interactively and stores the grant with its account', async () => {
    const d = deps();
    const provider = new WebAuthFlowAuthProvider(config, d);

    await expect(provider.getToken({ interactive: true })).resolves.toBe('final-token');
    expect(d.launch).toHaveBeenCalledWith(expect.stringContaining('response_type=code'), true);
    expect(d.exchange).toHaveBeenCalledWith({ code: 'auth-code', codeVerifier: 'ver', config });
    expect(d.store.grant).toEqual({
      refreshToken: 'refresh-token',
      accessToken: 'final-token',
      expiresAt: 1_000_000 + 3600 * 1000,
      email: 'me@example.com',
    });
    await expect(provider.getConnection()).resolves.toEqual({ connected: true, email: 'me@example.com', canChooseAccount: true });
  });

  it('keeps the stored refresh token when a re-authorization returns none', async () => {
    // Google omits refresh_token when the account already holds an offline
    // grant; overwriting with null would report a live connection as gone.
    const d = deps({
      store: memoryStore({ refreshToken: 'rt-existing', accessToken: null, expiresAt: 0, email: 'me@example.com' }),
      exchange: jest.fn().mockResolvedValue(tokenSet({ accessToken: 'fresh', refreshToken: null })),
    });
    const provider = new WebAuthFlowAuthProvider(config, d);

    await expect(provider.connect()).resolves.toEqual({
      connected: true,
      email: 'me@example.com',
      canChooseAccount: true,
    });
    expect(d.store.grant?.refreshToken).toBe('rt-existing');
  });

  it('reuses a cached access token instead of calling out', async () => {
    const d = deps({
      store: memoryStore({ refreshToken: 'rt', accessToken: 'cached', expiresAt: 2_000_000, email: null }),
    });
    const provider = new WebAuthFlowAuthProvider(config, d);

    await expect(provider.getToken({ interactive: false })).resolves.toBe('cached');
    expect(d.refresh).not.toHaveBeenCalled();
    expect(d.launch).not.toHaveBeenCalled();
  });

  it('refreshes silently when the cached token is spent, keeping the refresh token and email', async () => {
    const d = deps({
      store: memoryStore({ refreshToken: 'rt', accessToken: 'stale', expiresAt: 1_000_100, email: 'me@example.com' }),
    });
    const provider = new WebAuthFlowAuthProvider(config, d);

    await expect(provider.getToken({ interactive: false })).resolves.toBe('refreshed-token');
    expect(d.launch).not.toHaveBeenCalled();
    expect(d.store.grant).toEqual({
      refreshToken: 'rt',
      accessToken: 'refreshed-token',
      expiresAt: 1_000_000 + 3600 * 1000,
      email: 'me@example.com',
    });
  });

  it('drops a revoked grant and reports it, rather than claiming a connection', async () => {
    const d = deps({
      store: memoryStore({ refreshToken: 'rt', accessToken: null, expiresAt: 0, email: 'me@example.com' }),
      refresh: jest.fn().mockRejectedValue(new Error('Token exchange failed (400): invalid_grant')),
    });
    const provider = new WebAuthFlowAuthProvider(config, d);

    await expect(provider.getToken({ interactive: false })).rejects.toThrow(/invalid_grant/);
    expect(d.store.grant).toBeNull();
    await expect(provider.getConnection()).resolves.toEqual({ connected: false, email: null, canChooseAccount: true });
  });

  it('refuses to prompt on a silent request with nothing stored', async () => {
    const d = deps();
    const provider = new WebAuthFlowAuthProvider(config, d);

    await expect(provider.getToken({ interactive: false })).rejects.toThrow(NOT_CONNECTED_ERROR);
    expect(d.launch).not.toHaveBeenCalled();
  });

  it('re-authorizes on connect even when a valid grant exists, so the account can change', async () => {
    const d = deps({
      store: memoryStore({ refreshToken: 'rt', accessToken: 'cached', expiresAt: 2_000_000, email: 'old@example.com' }),
    });
    const provider = new WebAuthFlowAuthProvider(config, d);

    await expect(provider.connect()).resolves.toEqual({ connected: true, email: 'me@example.com', canChooseAccount: true });
    expect(d.launch).toHaveBeenCalledTimes(1);
  });

  it('revokes and forgets the grant on disconnect', async () => {
    const d = deps({
      store: memoryStore({ refreshToken: 'rt', accessToken: 'cached', expiresAt: 2_000_000, email: 'me@example.com' }),
    });
    const provider = new WebAuthFlowAuthProvider(config, d);

    await provider.disconnect();

    expect(d.revoke).toHaveBeenCalledWith({ token: 'rt', endpoint: undefined });
    expect(d.store.grant).toBeNull();
    await expect(provider.getConnection()).resolves.toEqual({ connected: false, email: null, canChooseAccount: true });
  });

  it('forgets the grant even when revocation fails', async () => {
    const d = deps({
      store: memoryStore({ refreshToken: 'rt', accessToken: null, expiresAt: 0, email: null }),
      revoke: jest.fn().mockRejectedValue(new Error('Token revocation failed (503): ')),
    });
    const provider = new WebAuthFlowAuthProvider(config, d);

    await expect(provider.disconnect()).rejects.toThrow(/revocation failed/);
    expect(d.store.grant).toBeNull();
  });

  it('invalidateToken clears only the matching cached access token', async () => {
    const d = deps({
      store: memoryStore({ refreshToken: 'rt', accessToken: 'cached', expiresAt: 2_000_000, email: null }),
    });
    const provider = new WebAuthFlowAuthProvider(config, d);

    await provider.invalidateToken('someone-elses-token');
    expect(d.store.grant?.accessToken).toBe('cached');

    await provider.invalidateToken('cached');
    expect(d.store.grant).toEqual({ refreshToken: 'rt', accessToken: null, expiresAt: 0, email: null });
  });

  it('fails fast when the client ID is not configured', async () => {
    const provider = new WebAuthFlowAuthProvider({ ...config, clientId: '' }, deps());
    await expect(provider.getToken({ interactive: true })).rejects.toThrow(/client ID is not configured/);
  });

  it('rejects on a state mismatch (CSRF guard)', async () => {
    const provider = new WebAuthFlowAuthProvider(config, deps({
      launch: jest.fn().mockResolvedValue('https://abc.chromiumapp.org/?code=c&state=WRONG'),
    }));
    await expect(provider.getToken({ interactive: true })).rejects.toThrow(/state mismatch/);
  });

  it('rejects when the redirect carries no authorization code', async () => {
    const provider = new WebAuthFlowAuthProvider(config, deps({
      launch: jest.fn().mockImplementation((url: string) => {
        const state = new URL(url).searchParams.get('state');
        return Promise.resolve(`https://abc.chromiumapp.org/?error=denied&state=${state}`);
      }),
    }));
    await expect(provider.getToken({ interactive: true })).rejects.toThrow(/no authorization code/);
  });
});

describe('normalizeStoredAuthGrant', () => {
  it('keeps a usable grant and rejects anything without a token', () => {
    expect(normalizeStoredAuthGrant({ refreshToken: 'rt', accessToken: 'at', expiresAt: 5, email: 'a@b.c' }))
      .toEqual({ refreshToken: 'rt', accessToken: 'at', expiresAt: 5, email: 'a@b.c' });
    expect(normalizeStoredAuthGrant({ refreshToken: 'rt' }))
      .toEqual({ refreshToken: 'rt', accessToken: null, expiresAt: 0, email: null });
    expect(normalizeStoredAuthGrant({ email: 'a@b.c' })).toBeNull();
    expect(normalizeStoredAuthGrant(undefined)).toBeNull();
    expect(normalizeStoredAuthGrant('nonsense')).toBeNull();
  });
});

describe('ChromeIdentityAuthProvider', () => {
  const identity = () => chrome.identity as unknown as {
    getAuthToken: jest.Mock;
    removeCachedAuthToken: jest.Mock;
    clearAllCachedAuthTokens: jest.Mock;
    getProfileUserInfo: jest.Mock;
  };

  /** Chrome hands the token back through a callback, with lastError on failure. */
  function mockTokens(replies: Array<{ token?: string; error?: string }>) {
    identity().getAuthToken.mockImplementation((_details: unknown, cb: (token?: string) => void) => {
      const reply = replies.shift() ?? { error: 'No mocked auth replies left' };
      (chrome.runtime as { lastError?: { message: string } }).lastError =
        reply.error ? { message: reply.error } : undefined;
      cb(reply.token);
      (chrome.runtime as { lastError?: { message: string } }).lastError = undefined;
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    identity().removeCachedAuthToken.mockImplementation((_d: unknown, cb?: () => void) => cb?.());
    identity().clearAllCachedAuthTokens.mockImplementation((cb?: () => void) => cb?.());
    identity().getProfileUserInfo.mockImplementation((cb: (info: { email?: string }) => void) => cb({ email: 'profile@example.com' }));
  });

  it('delegates getToken to chrome.identity.getAuthToken', async () => {
    mockTokens([{ token: 'chrome-token' }]);

    await expect(new ChromeIdentityAuthProvider().getToken({ interactive: true })).resolves.toBe('chrome-token');
    expect(identity().getAuthToken).toHaveBeenCalledWith({ interactive: true }, expect.any(Function));
  });

  it('reports the profile account as connected, and never offers an account choice', async () => {
    mockTokens([{ token: 'silent-token' }, { token: 'silent-token' }]);

    await expect(new ChromeIdentityAuthProvider().getConnection()).resolves.toEqual({
      connected: true,
      email: 'profile@example.com',
      // The account is the browser profile's; a picker would promise what
      // getAuthToken cannot deliver.
      canChooseAccount: false,
    });
    expect(identity().getAuthToken).toHaveBeenCalledWith({ interactive: false }, expect.any(Function));
  });

  it('reports not connected when a silent token cannot be minted', async () => {
    mockTokens([{ error: 'OAuth2 not granted yet' }]);

    await expect(new ChromeIdentityAuthProvider().getConnection()).resolves.toEqual({
      connected: false,
      email: null,
      canChooseAccount: false,
    });
  });

  it('connects by prompting once, then reports the connection', async () => {
    mockTokens([{ token: 'granted' }, { token: 'granted' }]);

    await expect(new ChromeIdentityAuthProvider().connect()).resolves.toEqual({
      connected: true,
      email: 'profile@example.com',
      canChooseAccount: false,
    });
    expect(identity().getAuthToken).toHaveBeenNthCalledWith(1, { interactive: true }, expect.any(Function));
  });

  it('disconnect revokes at Google and clears every cached token', async () => {
    mockTokens([{ token: 'live-token' }]);
    const revoke = jest.fn().mockResolvedValue(undefined);

    await new ChromeIdentityAuthProvider({ revoke }).disconnect();

    // Revoking alone would leave Chrome handing out its cached copy; clearing
    // alone would leave the grant standing at Google.
    expect(identity().removeCachedAuthToken).toHaveBeenCalledWith({ token: 'live-token' }, expect.any(Function));
    expect(identity().clearAllCachedAuthTokens).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith({ token: 'live-token' });
  });

  it('disconnect still clears the cache when no token can be read', async () => {
    mockTokens([{ error: 'not granted' }]);
    const revoke = jest.fn();

    await new ChromeIdentityAuthProvider({ revoke }).disconnect();

    expect(identity().clearAllCachedAuthTokens).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('delegates invalidateToken to removeCachedAuthToken', async () => {
    await new ChromeIdentityAuthProvider().invalidateToken('old-token');
    expect(identity().removeCachedAuthToken).toHaveBeenCalledWith({ token: 'old-token' }, expect.any(Function));
  });
});

describe('createAuthProvider', () => {
  it('selects the native Chrome strategy when getAuthToken is available', () => {
    expect(createAuthProvider()).toBeInstanceOf(ChromeIdentityAuthProvider);
  });

  it('falls back to WebAuthFlow when getAuthToken is unavailable', () => {
    const original = chrome.identity.getAuthToken;
    delete (chrome.identity as { getAuthToken?: unknown }).getAuthToken;
    try {
      expect(createAuthProvider()).toBeInstanceOf(WebAuthFlowAuthProvider);
    } finally {
      (chrome.identity as { getAuthToken?: unknown }).getAuthToken = original;
    }
  });

  it('selects WebAuthFlow for a non-Chrome build target even when getAuthToken exists', () => {
    (globalThis as { __BROWSER_TARGET__?: string }).__BROWSER_TARGET__ = 'edge';
    try {
      expect(createAuthProvider()).toBeInstanceOf(WebAuthFlowAuthProvider);
    } finally {
      delete (globalThis as { __BROWSER_TARGET__?: string }).__BROWSER_TARGET__;
    }
  });
});
