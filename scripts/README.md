# Scripts — build, release & real-Meet e2e helpers

> Node (`.mjs`) scripts invoked by `package.json` for release gating and the real-Meet e2e harness. Not part of the extension bundle.

| Script | npm script | What it does |
| :--- | :--- | :--- |
| `check-version-monotonic.mjs` | `check:version` (part of `release:build`) | asserts the release version only ever increases — guards against shipping a non-monotonic Chrome Web Store version |
| `check-production-build.mjs` | `test:production-guards` (part of `release:build`) | asserts a production bundle has the exact telemetry host permission and retry alarm and leaked no E2E-only markers — the production-safety gate. `--dist=<dir>` guards a non-default target's output |
| `pack-release-artifacts.mjs` | `release:artifacts` | builds every browser target, guards each output, and zips them into `release/` with `SHA256SUMS.txt` — the assets the release workflow uploads |
| `run-real-meet-e2e.mjs` | `test:e2e:real` / `:live` | drives the real-Google-Meet harness against a configured Chrome profile |
| `setup-real-meet-profile.mjs` | `test:e2e:real:profile` | provisions the stable Chrome profile the real-Meet run reuses |
| `lib/` | — | shared helpers for manifest versioning, target profiles, release-artifact naming, build-time configuration reading (`projectEnv.cjs`), and the telemetry endpoint policy |

## Release flow

`npm run release:build` chains the guards: `check:version` → `build` → `test:production-guards`. So a release build can't ship with a stale version or a dev-only permission.

`npm run release:artifacts` is the publishable form of the same flow, run once per browser target: `check:version` → for each target build → guards → `release/google-meet-caption-extension-v<version>-<target>.zip`, then one `SHA256SUMS.txt`. Zips contain the *contents* of the dist directory (manifest at the root), so unzipping and pointing a browser at the folder is a working "Load unpacked". [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs exactly this script and uploads its output to the GitHub Release; nothing about the artifacts is workflow-only. (Version itself is single-sourced in `package.json`; see the [versioning protocol](../docs/plans/) and [`static/`](../static/README.md).)

## Browser-target profiles

`lib/projectEnv.cjs` is how every build tool reads configuration — the shell first, then the project's `.env` — and `lib/telemetryEndpoint.cjs` owns what an endpoint must look like and what a build does without one: absent is allowed (diagnostics ship inert, no host permission), malformed fails the build. Both webpack and `check-production-build.mjs` go through them, because a guard that read configuration differently from the build reported a `.env`-configured endpoint as absent.

The manifest target model in `lib/manifestTargets.cjs` supports `chrome`, `edge`, `brave`, `opera`, `vivaldi`, and `arc`. Each has an `npm run build:<target>` alias, and `distDirForTarget` in `lib/releaseArtifacts.cjs` is the single source of truth for where a target builds (`dist/` for Chrome, `dist-<target>/` otherwise) — webpack and the packer both read it.

Chrome signs in through `chrome.identity.getAuthToken`, whose only configuration is the public `oauth2.client_id` committed in the source manifest. The other profiles use `launchWebAuthFlow`: their emitted manifest drops `oauth2` but **retains the stable `key`**, because the extension id it pins is part of the registered OAuth redirect URI (ADR-0002). Firefox deliberately has no profile: it needs real capture-source and media-host adapters before the manifest can advertise support.

## Related

- [`static/`](../static/README.md) — the manifest transform whose output `check-production-build` validates.
- [ADR-0002](../docs/adr/0002-cross-browser-support-strategy.md) — the supported-target boundary and the prerequisites for a future Firefox port.
- [`tests/scripts/`](../tests/README.md) — the `node --test` suite that unit-tests this `lib/` (manifest source/version/targets, release artifacts, configuration reading, telemetry endpoint policy) and runs `check-production-build.mjs` against synthetic build trees.
