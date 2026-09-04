/**
 * @file platform/capabilities/auth/AuthGrantStore.ts
 *
 * Persistence for the OAuth grant behind Drive uploads (ADR-0002).
 *
 * The grant has to outlive the service worker: without a stored refresh token
 * every upload — and every settings page load — would need an interactive Google
 * prompt. It is injectable so the provider is testable without extension storage.
 */

import {
  getLocalStorageValues,
  removeLocalStorageValues,
  setLocalStorageValues,
} from '../../chrome/storage';

export const AUTH_GRANT_STORAGE_KEY = 'driveAuthGrant';

export type StoredAuthGrant = {
  /** Long-lived credential that mints access tokens silently; null when absent. */
  refreshToken: string | null;
  /** Last minted access token, reused until it is about to expire. */
  accessToken: string | null;
  /** Epoch milliseconds at which `accessToken` stops being usable. */
  expiresAt: number;
  /** The account's email, read from the grant's id_token when it carried one. */
  email: string | null;
};

export interface AuthGrantStore {
  load(): Promise<StoredAuthGrant | null>;
  save(grant: StoredAuthGrant): Promise<void>;
  clear(): Promise<void>;
}

/** Parses a persisted value, tolerating anything an older version may have written. */
export function normalizeStoredAuthGrant(value: unknown): StoredAuthGrant | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StoredAuthGrant>;
  const refreshToken = typeof candidate.refreshToken === 'string' && candidate.refreshToken
    ? candidate.refreshToken
    : null;
  const accessToken = typeof candidate.accessToken === 'string' && candidate.accessToken
    ? candidate.accessToken
    : null;
  if (!refreshToken && !accessToken) return null;
  return {
    refreshToken,
    accessToken,
    expiresAt: typeof candidate.expiresAt === 'number' && Number.isFinite(candidate.expiresAt)
      ? candidate.expiresAt
      : 0,
    email: typeof candidate.email === 'string' && candidate.email ? candidate.email : null,
  };
}

/** The extension-storage grant store used outside tests. */
export function createLocalAuthGrantStore(): AuthGrantStore {
  return {
    async load() {
      const stored = await getLocalStorageValues(AUTH_GRANT_STORAGE_KEY);
      return normalizeStoredAuthGrant(stored[AUTH_GRANT_STORAGE_KEY]);
    },
    async save(grant) {
      await setLocalStorageValues({ [AUTH_GRANT_STORAGE_KEY]: grant });
    },
    async clear() {
      await removeLocalStorageValues(AUTH_GRANT_STORAGE_KEY);
    },
  };
}
