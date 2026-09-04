# ADR-0002 — Cross-browser support: native sign-in on Chrome, launchWebAuthFlow elsewhere

- **Status:** Accepted
- **Date:** 2026-09-04 (revises the 2026-06-14 record: the per-target split stands, and the grant lifecycle below is new)

## Context

The extension started as Chrome-only. Supporting the rest of the Chromium family (Edge, Brave, Opera, Vivaldi, Arc) turned out to touch exactly one capability — signing in to Google for Drive uploads — while everything else (tab capture, offscreen media, OPFS, storage, downloads) ports unchanged.

`chrome.identity.getAuthToken` is the native path on Chrome: no client secret, no
redirect URI, tokens minted for the account already signed into the browser
profile, and nothing to configure in a build. It is also **Chrome-only**, so the
other targets need `chrome.identity.launchWebAuthFlow` with a real OAuth2 client.

Two shortcomings of the original arrangement drove this revision:

- **There was no connection to manage.** Consent appeared implicitly at *upload*
  time — after a recording had already finished — because a token was only ever
  fetched when an upload needed one. Declining it turned into a post-hoc upload
  failure, and nothing in the UI could show, establish or revoke a Drive
  connection.
- **`getAuthToken` cannot choose an account**, being bound to the browser
  profile's primary Google account. Moving every target to launchWebAuthFlow
  fixes that, and was tried — but it makes *every* build require an OAuth client,
  a registered redirect URI and two build variables before Drive works at all,
  and it puts the client secret into the Chrome bundle, which had never carried
  one. For the common case (recordings going to the account the browser is
  already signed into) that is a poor trade.

## Decision

**Chrome signs in natively; every other target uses launchWebAuthFlow.**

- `createAuthProvider` selects `ChromeIdentityAuthProvider` for the `chrome`
  target (behind a runtime `typeof chrome.identity?.getAuthToken === 'function'`
  guard) and `WebAuthFlowAuthProvider` everywhere else.
- **Chrome needs no configuration at all.** `getAuthToken` requires only the
  public client id in `manifest.oauth2`, which is committed to source control —
  no client secret, no redirect URI to register, no `.env` for a Chrome build.
  Sign-in shows no window: Chrome mints a token for the account already in the
  browser profile.
- **The account cannot be chosen on Chrome.** `AuthConnection.canChooseAccount`
  reports that, and the settings page hides "Switch account" instead of offering
  a picker the API cannot deliver; the section says the account comes from the
  browser profile. Uploading to a different account means a Chrome profile signed
  into it. This is the accepted price of the zero-configuration path — an earlier
  round had every target on launchWebAuthFlow for the account picker, and the
  setup burden (an OAuth client, a registered redirect URI and two `.env`
  variables before Drive worked at all) was not worth it for the common case.
- **The other targets keep the full OAuth2 code + PKCE flow**, with
  `access_type=offline` and `prompt=select_account consent`: the user picks the
  account, and the grant's refresh token is persisted through `AuthGrantStore` so
  later uploads refresh silently. They need a web OAuth client
  (`GOOGLE_WEB_OAUTH_CLIENT_ID` / `..._SECRET`) and the registered redirect URI.
- **Either way the grant is a first-class, revocable thing.** The `AuthProvider`
  port covers `getToken` / `connect` / `getConnection` / `disconnect`, so the
  settings page owns Drive: connect, see the account, disconnect (revoked at
  Google, and Chrome's token cache cleared). An upload no longer prompts; the
  interactive fallback in `driveAuth` survives only for a grant revoked between
  recordings.
- Scopes are `drive.file` (per-file access, the minimum the uploader needs). The
  launchWebAuthFlow path adds `openid email` so its grant carries an `id_token`
  naming the account; the Chrome path reads the profile email through
  `chrome.identity.getProfileUserInfo` (hence the `identity.email` permission).
- Per-target manifest decisions are modeled in `scripts/lib/manifestTargets.cjs`:
  `oauth2` is kept only for the `chrome-identity` capability and stripped
  elsewhere, and the whole Chromium family keeps the stable `key`, because the
  extension id it pins is part of the registered
  `https://<id>.chromiumapp.org/` redirect URI. Dropping `key` for non-Chrome
  targets was an earlier bug that produced `redirect_uri_mismatch`.
- `platform/capabilities` is the seam holding both strategies, keeping auth out
  of app code (see [ADR-0001](./0001-platform-chrome-is-a-utility-layer-not-a-port.md)
  for why `platform/chrome` is *not* such a seam).

## Consequences

**Accepted costs**

- **No account choice on Chrome**, which is where most users are. The settings
  page states it rather than hiding it.
- **Two auth code paths** again, each with its own tests. The `AuthProvider` port
  keeps the difference from leaking past `createAuthProvider`.
- **The client secret ships in the non-Chrome bundles.** Google classifies an
  installed-application secret as non-confidential and PKCE protects the code
  exchange, so this is the standard posture for that flow — but see below before
  publishing those builds anywhere public.
- **Sign-in on the other targets is a window**, done once per browser profile,
  and needs an OAuth client configured at build time.

**Publishing a launchWebAuthFlow build needs the exchange moved off the client
first.** A store listing hands the bundle — and the secret in it — to everyone.
Before publishing a non-Chrome build, the code→token exchange (and the refresh
grant, which needs the same secret) moves behind the project's existing
Cloudflare Worker through the already-injectable `exchange` dependency, so only
the public `client_id` ships. The trade that buys: a silent refresh becomes
dependent on that Worker being reachable, so an unreachable Worker degrades a
Drive upload to a local download until the next successful refresh. The Chrome
build has no such exposure — it carries no secret at all.

**Gains**

- A Chrome build connects Drive with zero configuration and a native, windowless
  sign-in — the common case is the simple one.
- Consent happens before recording rather than after, so a declined or expired
  grant is visible while it is still cheap to fix.
- The other Chromium browsers still work, and can pick an account.

**Not covered by this decision**

- **Firefox is still not a build target.** It is not merely a different OAuth
  selection: `tabCapture` and the offscreen media host need dedicated adapters
  first. See [`offscreen/storage`](../../src/offscreen/storage/README.md) for the
  OPFS capability ladder that a port would also have to satisfy.
