declare const __E2E_MOCK_CAPTURE_BUILD__: boolean | undefined;
declare const __E2E_MOCK_DRIVE_BUILD__: boolean | undefined;
declare const __E2E_REAL_CAPTURE_TAB_BUILD__: boolean | undefined;
/** Compile-time gate for the development-only popup gallery preview adapter. */
declare const __POPUP_GALLERY_BUILD__: boolean;
// Build target + the Web OAuth client the non-Chrome targets sign in with (ADR-0002), injected by webpack.
declare const __BROWSER_TARGET__: string | undefined;
declare const __WEB_OAUTH_CLIENT_ID__: string | undefined;
declare const __WEB_OAUTH_CLIENT_SECRET__: string | undefined;
/** Exact HTTPS telemetry ingestion endpoint injected by webpack. */
declare const __TELEMETRY_ENDPOINT__: string;
