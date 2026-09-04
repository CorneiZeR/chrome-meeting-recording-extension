/**
 * @file platform/capabilities/auth/googleTokenRevocation.ts
 *
 * Withdrawing a Google grant (ADR-0002). Shared by both auth strategies: the
 * revoke endpoint takes only the token, so unlike the code exchange it needs no
 * client secret and works the same wherever the token came from.
 */

export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export interface RevokeTokenParams {
  token: string;
  endpoint?: string;
}
export type RevokeToken = (params: RevokeTokenParams) => Promise<void>;

export async function revokeGoogleToken({ token, endpoint }: RevokeTokenParams): Promise<void> {
  const response = await fetch(endpoint ?? GOOGLE_REVOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Token revocation failed (${response.status}): ${detail}`);
  }
}
