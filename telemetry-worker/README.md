# Meeting Recorder telemetry service

This Worker accepts only bounded anonymous `TelemetryBatchV1` payloads from explicitly configured extension origins. It stores aggregate metrics and sanitized incidents in D1 for 30 days. It does not store request IPs, bodies in logs, media, captions, names, Drive identifiers, raw errors, or raw stacks.

## Local verification

```sh
npm install
npm test
npm run typecheck
npm run dry-run
npx wrangler d1 migrations apply meeting-recorder-telemetry --local
```

## Deployment sequence

1. Create the database: `npx wrangler d1 create meeting-recorder-telemetry` and replace the placeholder database ID in `wrangler.toml`.
2. Add every Chrome/Edge/store extension origin to `ALLOWED_EXTENSION_ORIGINS`; keep the stable unpacked origin already listed.
3. Apply migrations remotely only after review: `npx wrangler d1 migrations apply meeting-recorder-telemetry --remote`.
4. Run tests, typecheck, and the Wrangler dry run, then deploy a preview/Worker.
5. Set the extension build's `TELEMETRY_ENDPOINT` to the resulting exact `https://…/api/telemetry/batches` URL and test from the real unpacked extension.
6. Build and release the extension separately.

Operational queries print bounded read-only SQL by default. They contact D1 only with explicit `--remote`, for example `npm run query -- incidents --hours=24 --release=1.2.3 --remote`.
