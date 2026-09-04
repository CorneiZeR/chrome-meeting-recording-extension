import {
  connectDrive,
  disconnectDrive,
  fetchDriveTokenWithFallback,
  getDriveConnection,
  setAuthProvider,
} from '../driveAuth';
import type { AuthProvider } from '../../platform/capabilities/AuthProvider';

function fakeProvider(over: Partial<AuthProvider> = {}): AuthProvider {
  return {
    getToken: jest.fn(),
    invalidateToken: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockResolvedValue({ connected: true, email: null, canChooseAccount: true }),
    getConnection: jest.fn().mockResolvedValue({ connected: false, email: null, canChooseAccount: true }),
    disconnect: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('driveAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).__E2E_MOCK_DRIVE__ = false;
    (chrome.runtime as any).id = 'abcdefghabcdefghabcdefghabcdefgh';
    (chrome.runtime.getManifest as jest.Mock).mockReturnValue({});
  });

  afterEach(() => {
    (globalThis as any).__E2E_MOCK_DRIVE__ = false;
    setAuthProvider(null);
  });

  it('returns a deterministic token only in the E2E mock Drive build', async () => {
    (globalThis as any).__E2E_MOCK_DRIVE__ = true;
    const provider = fakeProvider();
    setAuthProvider(provider);

    await expect(fetchDriveTokenWithFallback()).resolves.toEqual({ ok: true, token: 'e2e-mock-drive-token' });
    await expect(getDriveConnection()).resolves.toEqual({ connected: true, email: null, canChooseAccount: false });
    expect(provider.getToken).not.toHaveBeenCalled();
  });

  it('acquires the token through the injected provider, not chrome.identity', async () => {
    const provider = fakeProvider({ getToken: jest.fn().mockResolvedValue('provider-token') });
    setAuthProvider(provider);

    await expect(fetchDriveTokenWithFallback()).resolves.toEqual({ ok: true, token: 'provider-token' });
    expect(provider.getToken).toHaveBeenCalledWith({ interactive: false });
    expect(chrome.identity.launchWebAuthFlow).not.toHaveBeenCalled();
  });

  it('escalates to an interactive request when the provider silent-fails', async () => {
    const getToken = jest.fn()
      .mockRejectedValueOnce(new Error('Google Drive is not connected'))
      .mockResolvedValueOnce('interactive-token');
    setAuthProvider(fakeProvider({ getToken }));

    await expect(fetchDriveTokenWithFallback()).resolves.toEqual({ ok: true, token: 'interactive-token' });
    expect(getToken).toHaveBeenNthCalledWith(1, { interactive: false });
    expect(getToken).toHaveBeenNthCalledWith(2, { interactive: true });
  });

  it('reports both failures when interactive auth fails too', async () => {
    setAuthProvider(fakeProvider({
      getToken: jest.fn()
        .mockRejectedValueOnce(new Error('not connected'))
        .mockRejectedValueOnce(new Error('user closed the window')),
    }));

    const result = await fetchDriveTokenWithFallback();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not connected');
      expect(result.error).toContain('user closed the window');
    }
  });

  it('invalidates the prior token via the provider on forced refresh', async () => {
    const invalidateToken = jest.fn().mockResolvedValue(undefined);
    const getToken = jest.fn()
      .mockResolvedValueOnce('first-token')
      .mockResolvedValueOnce('second-token');
    setAuthProvider(fakeProvider({ getToken, invalidateToken }));

    await fetchDriveTokenWithFallback();
    await fetchDriveTokenWithFallback({ refresh: true });

    expect(invalidateToken).toHaveBeenCalledWith('first-token');
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('turns a misconfigured web OAuth client into setup instructions instead of retrying', async () => {
    setAuthProvider(fakeProvider({
      getToken: jest.fn().mockRejectedValue(new Error('Web OAuth client ID is not configured for launchWebAuthFlow')),
    }));

    const result = await fetchDriveTokenWithFallback();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Google OAuth is misconfigured');
      expect(result.error).toContain('Current extension ID: abcdefghabcdefghabcdefghabcdefgh');
      expect(result.error).toContain('https://abcdefghabcdefghabcdefghabcdefgh.chromiumapp.org/');
      expect(result.error).toContain('GOOGLE_WEB_OAUTH_CLIENT_ID');
    }
  });

  it('names the manifest client id when Chrome rejects the native sign-in', async () => {
    // A manifest with oauth2 means the Chrome-native strategy, whose fix is the
    // client id in the manifest — not a redirect URI or a web client secret.
    (chrome.runtime.getManifest as jest.Mock).mockReturnValue({
      oauth2: { client_id: 'committed-id.apps.googleusercontent.com' },
    });
    setAuthProvider(fakeProvider({
      getToken: jest.fn().mockRejectedValue(new Error("Service responded with error: 'bad client id: 1234'")),
    }));

    const result = await fetchDriveTokenWithFallback();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Chrome Extension');
      expect(result.error).toContain('committed-id.apps.googleusercontent.com');
      expect(result.error).not.toContain('GOOGLE_WEB_OAUTH_CLIENT_ID');
    }
  });

  it('reports the stored connection without prompting', async () => {
    const getConnection = jest.fn().mockResolvedValue({ connected: true, email: 'me@example.com', canChooseAccount: true });
    const provider = fakeProvider({ getConnection });
    setAuthProvider(provider);

    await expect(getDriveConnection()).resolves.toEqual({ connected: true, email: 'me@example.com', canChooseAccount: true });
    expect(provider.getToken).not.toHaveBeenCalled();
    expect(provider.connect).not.toHaveBeenCalled();
  });

  it('treats an unreadable grant as "not connected" rather than an error', async () => {
    setAuthProvider(fakeProvider({ getConnection: jest.fn().mockRejectedValue(new Error('storage is gone')) }));

    await expect(getDriveConnection()).resolves.toEqual({ connected: false, email: null, canChooseAccount: false });
  });

  it('connects through the provider and returns the connected account', async () => {
    const connect = jest.fn().mockResolvedValue({ connected: true, email: 'me@example.com', canChooseAccount: true });
    setAuthProvider(fakeProvider({ connect }));

    await expect(connectDrive()).resolves.toEqual({
      ok: true,
      connection: { connected: true, email: 'me@example.com', canChooseAccount: true },
    });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('reports a declined connection as an error, and a broken client as instructions', async () => {
    setAuthProvider(fakeProvider({ connect: jest.fn().mockRejectedValue(new Error('The user did not approve access.')) }));
    await expect(connectDrive()).resolves.toEqual({ ok: false, error: 'The user did not approve access.' });

    setAuthProvider(fakeProvider({ connect: jest.fn().mockRejectedValue(new Error('invalid_client')) }));
    const result = await connectDrive();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Google OAuth is misconfigured');
  });

  it('disconnects through the provider and surfaces a failed revocation', async () => {
    const disconnect = jest.fn().mockResolvedValue(undefined);
    setAuthProvider(fakeProvider({ disconnect }));
    await expect(disconnectDrive()).resolves.toEqual({ ok: true });
    expect(disconnect).toHaveBeenCalledTimes(1);

    setAuthProvider(fakeProvider({ disconnect: jest.fn().mockRejectedValue(new Error('revoke failed (503)')) }));
    await expect(disconnectDrive()).resolves.toEqual({ ok: false, error: 'revoke failed (503)' });
  });

  it('forgets the last issued token on disconnect, so a later refresh cannot invalidate it', async () => {
    const invalidateToken = jest.fn().mockResolvedValue(undefined);
    setAuthProvider(fakeProvider({
      getToken: jest.fn().mockResolvedValue('live-token'),
      invalidateToken,
      disconnect: jest.fn().mockResolvedValue(undefined),
    }));

    await fetchDriveTokenWithFallback();
    await disconnectDrive();
    await fetchDriveTokenWithFallback({ refresh: true });

    expect(invalidateToken).not.toHaveBeenCalled();
  });
});
