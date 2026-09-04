/**
 * @file platform/chrome/identity.ts
 *
 * Promise-based wrappers around the Chrome Identity API.
 */

export function getAuthToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      const error = chrome.runtime.lastError?.message;
      if (error) return reject(new Error(error));
      const candidate = result as string | { token?: string } | undefined;
      const token = typeof candidate === 'string' ? candidate : candidate?.token;
      if (!token) return reject(new Error('No OAuth token returned'));
      resolve(token);
    });
  });
}

export function removeCachedAuthToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    const remover = chrome.identity.removeCachedAuthToken as
      | ((details: { token: string }, callback?: () => void) => void)
      | undefined;

    if (!remover) {
      resolve();
      return;
    }

    try {
      remover({ token }, () => resolve());
    } catch {
      resolve();
    }
  });
}

/**
 * Drops every token Chrome cached for this extension, so the next acquisition
 * asks Google again. Needed on disconnect: revoking at Google is not enough
 * while Chrome would still hand out a cached token.
 */
export function clearAllCachedAuthTokens(): Promise<void> {
  return new Promise((resolve) => {
    const clear = chrome.identity.clearAllCachedAuthTokens as ((callback?: () => void) => void) | undefined;
    if (!clear) {
      resolve();
      return;
    }
    try {
      clear(() => resolve());
    } catch {
      resolve();
    }
  });
}

/**
 * The email of the account signed into this browser profile, or null when it is
 * unknown. Requires the `identity.email` manifest permission; with
 * `getAuthToken` this is by definition the account the token belongs to.
 */
export function getProfileEmail(): Promise<string | null> {
  return new Promise((resolve) => {
    const read = chrome.identity.getProfileUserInfo as
      | ((callback: (info: { email?: string }) => void) => void)
      | undefined;
    if (!read) {
      resolve(null);
      return;
    }
    try {
      read((info) => resolve(info?.email ? info.email : null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Runs an OAuth2 flow in a browser window and resolves with the final redirect
 * URL. The sign-in path for every target except Chrome, which uses
 * `getAuthToken` above (ADR-0002); the caller parses the authorization code out
 * of the redirect.
 */
export function launchWebAuthFlow(url: string, interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive }, (redirectUrl) => {
      const error = chrome.runtime.lastError?.message;
      if (error) return reject(new Error(error));
      if (!redirectUrl) return reject(new Error('launchWebAuthFlow returned no redirect URL'));
      resolve(redirectUrl);
    });
  });
}

/** The extension's OAuth redirect target, e.g. `https://<id>.chromiumapp.org/`. */
export function getRedirectURL(): string {
  return chrome.identity.getRedirectURL();
}
