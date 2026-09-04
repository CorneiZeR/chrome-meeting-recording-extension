const fs = require('fs')
const path = require('path')
const webpack = require('webpack')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const pkg = require('./package.json')
const { toChromeManifestVersion } = require('./scripts/lib/manifestVersion.cjs')
const {
  TARGET_PROFILES,
  DEFAULT_TARGET,
  usesWebAuthFlow,
  applyTargetToManifest,
} = require('./scripts/lib/manifestTargets.cjs')
const { telemetryHostPermission, resolveTelemetryEndpoint } = require('./scripts/lib/telemetryEndpoint.cjs')
const { distDirForTarget } = require('./scripts/lib/releaseArtifacts.cjs')
const { readProjectEnvValue } = require('./scripts/lib/projectEnv.cjs')

const GOOGLE_OAUTH_CLIENT_ID_ENV_KEY = 'GOOGLE_OAUTH_CLIENT_ID'
const GOOGLE_WEB_OAUTH_CLIENT_ID_ENV_KEY = 'GOOGLE_WEB_OAUTH_CLIENT_ID'
const GOOGLE_WEB_OAUTH_CLIENT_SECRET_ENV_KEY = 'GOOGLE_WEB_OAUTH_CLIENT_SECRET'
const TELEMETRY_ENDPOINT_ENV_KEY = 'TELEMETRY_ENDPOINT'
// The value the source manifest ships when no real Chrome-extension client id
// has been committed yet; a build warns instead of silently shipping it.
const OAUTH_CLIENT_ID_PLACEHOLDER = '__GOOGLE_OAUTH_CLIENT_ID__'
const STATIC_DIR = 'static'
const PUBLIC_DIR = 'public'
// Cross-browser build targets (ADR-0002), modeled as data in manifestTargets.cjs.
// Chrome uses chrome.identity.getAuthToken; every other Chromium target
// authenticates via launchWebAuthFlow but keeps a stable `key` for its redirect.
const KNOWN_BROWSER_TARGETS = Object.keys(TARGET_PROFILES)
const DEFAULT_BROWSER_TARGET = DEFAULT_TARGET

function resolveGoogleOauthClientId(projectRoot) {
  return readProjectEnvValue(GOOGLE_OAUTH_CLIENT_ID_ENV_KEY, projectRoot)
}

function resolveWebOauthClientId(projectRoot) {
  return readProjectEnvValue(GOOGLE_WEB_OAUTH_CLIENT_ID_ENV_KEY, projectRoot)
}

function resolveWebOauthClientSecret(projectRoot) {
  return readProjectEnvValue(GOOGLE_WEB_OAUTH_CLIENT_SECRET_ENV_KEY, projectRoot)
}

function resolveBrowserTarget(rawTarget) {
  if (rawTarget == null || rawTarget === '') return DEFAULT_BROWSER_TARGET
  const target = String(rawTarget).trim().toLowerCase()
  if (!KNOWN_BROWSER_TARGETS.includes(target)) {
    throw new Error(`Unknown build target "${target}". Known targets: ${KNOWN_BROWSER_TARGETS.join(', ')}`)
  }
  return target
}

function transformManifest(content, oauthClientId, isDevBuild, browserTarget, telemetryEndpoint) {
  const manifest = JSON.parse(content.toString('utf8'))
  // Per-target manifest decisions (oauth2 / key) live in the tested profile model
  // (scripts/lib/manifestTargets.cjs), keyed off browser family + auth capability.
  applyTargetToManifest(manifest, browserTarget, { oauthClientId })
  // package.json is the single source of truth for the release version; the
  // numeric Chrome `version` is derived here so the two can never drift, and the
  // full semver (incl. any pre-release tag) is preserved for display in
  // `version_name`. The value in static/manifest.json is an ignored placeholder.
  manifest.version = toChromeManifestVersion(pkg.version)
  manifest.version_name = isDevBuild ? `${pkg.version} (dev)` : pkg.version
  // Dev-only diagnostics: system-wide CPU sampling via chrome.system.cpu. Never
  // shipped to production so the store listing keeps a minimal permission set
  // and avoids a permission re-review prompt for users.
  if (isDevBuild && Array.isArray(manifest.permissions) && !manifest.permissions.includes('system.cpu')) {
    manifest.permissions.push('system.cpu')
  }
  const telemetryPermission = telemetryHostPermission(telemetryEndpoint)
  if (telemetryPermission && !manifest.host_permissions.includes(telemetryPermission)) {
    manifest.host_permissions.push(telemetryPermission)
  }
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
}

function isTruthyEnvFlag(value) {
  return value === true || value === 'true' || value === '1'
}

module.exports = (_env, argv) => {
  const env = _env || {}
  const mode = argv.mode || 'production'
  const isDevBuild = mode === 'development'
  const e2eMockCapture = isTruthyEnvFlag(env.e2eMockCapture) || process.env.E2E_MOCK_CAPTURE === '1'
  const e2eMockDrive = isTruthyEnvFlag(env.e2eMockDrive) || process.env.E2E_MOCK_DRIVE === '1'
  const e2eRealCaptureTab = isTruthyEnvFlag(env.e2eRealCaptureTab)
    || process.env.E2E_REAL_CAPTURE_TAB === '1'
  const browserTarget = resolveBrowserTarget(env.target)
  const outputDir = typeof env.outputPath === 'string' && env.outputPath.trim()
    ? env.outputPath.trim()
    : distDirForTarget(browserTarget)
  const isWebAuthFlowTarget = usesWebAuthFlow(browserTarget)
  // Chrome signs in natively with the public client id committed in the source
  // manifest, so this override exists only for a build that needs a different
  // client. The web OAuth client id/secret are used by the launchWebAuthFlow
  // targets and stay empty for Chrome, so the secret never enters that bundle.
  const configuredGoogleOauthClientId = resolveGoogleOauthClientId(__dirname)
  const webOauthClientId = isWebAuthFlowTarget ? resolveWebOauthClientId(__dirname) : ''
  const webOauthClientSecret = isWebAuthFlowTarget ? resolveWebOauthClientSecret(__dirname) : ''
  const sourceManifestClientId = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'static/manifest.json'), 'utf8')
  ).oauth2?.client_id
  // An absent endpoint is allowed in every mode: the build ships with
  // diagnostics inert rather than refusing to run. A malformed one still throws.
  const telemetry = resolveTelemetryEndpoint(
    readProjectEnvValue(TELEMETRY_ENDPOINT_ENV_KEY, __dirname),
    { isDevBuild }
  )
  const telemetryEndpoint = telemetry.endpoint
  if (telemetry.warning) console.warn(`[build] ${telemetry.warning}`)

  if (
    !isWebAuthFlowTarget
    && !configuredGoogleOauthClientId
    && sourceManifestClientId === OAUTH_CLIENT_ID_PLACEHOLDER
  ) {
    console.warn(
      `[build] static/manifest.json still carries the ${OAUTH_CLIENT_ID_PLACEHOLDER} placeholder and ${GOOGLE_OAUTH_CLIENT_ID_ENV_KEY} is not set; connecting Google Drive will fail until a Chrome-extension OAuth client id is configured.`
    )
  }
  if (isWebAuthFlowTarget && !webOauthClientId) {
    console.warn(
      `[build] ${GOOGLE_WEB_OAUTH_CLIENT_ID_ENV_KEY} is not set for target "${browserTarget}"; connecting Google Drive will fail until you configure it.`
    )
  }

  return {
    mode,
    devtool: isDevBuild ? 'source-map' : false,
    entry: {
      scrapingScript: './src/scrapingScript.ts',
      popup: './src/popup.ts',
      ...(isDevBuild ? { popupGallery: './src/popup/gallery/popupGallery.ts' } : {}),
      debug: './src/debug.ts',
      background: './src/background.ts',
      offscreen: './src/offscreen.ts',
      opfsWorker: './src/offscreen/storage/opfsWorker.ts',
      micsetup: './src/micsetup.ts',
      camsetup: './src/camsetup.ts',
      settings: './src/settings.ts',
      recordings: './src/recordings.ts',
    },
    output: {
      path: path.resolve(__dirname, outputDir),
      filename: '[name].js'
    },
    resolve: { extensions: ['.ts', '.js'] },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/
        }
      ]
    },
    plugins: [
      new CleanWebpackPlugin(),
      new webpack.DefinePlugin({
        '__E2E_MOCK_CAPTURE_BUILD__': JSON.stringify(e2eMockCapture),
        '__E2E_MOCK_DRIVE_BUILD__': JSON.stringify(e2eMockDrive),
        '__E2E_REAL_CAPTURE_TAB_BUILD__': JSON.stringify(e2eRealCaptureTab),
        'globalThis.__DEV_BUILD__': JSON.stringify(isDevBuild),
        'globalThis.__E2E_MOCK_CAPTURE__': JSON.stringify(e2eMockCapture),
        'globalThis.__E2E_MOCK_DRIVE__': JSON.stringify(e2eMockDrive),
        'globalThis.__E2E_REAL_CAPTURE_TAB__': JSON.stringify(e2eRealCaptureTab),
        '__POPUP_GALLERY_BUILD__': JSON.stringify(isDevBuild),
        '__BROWSER_TARGET__': JSON.stringify(browserTarget),
        '__WEB_OAUTH_CLIENT_ID__': JSON.stringify(webOauthClientId),
        '__WEB_OAUTH_CLIENT_SECRET__': JSON.stringify(webOauthClientSecret),
        '__TELEMETRY_ENDPOINT__': JSON.stringify(telemetryEndpoint),
        'process.env.NODE_ENV': JSON.stringify(mode),
      }),
      // Stamp the per-compilation content hash into every entry bundle as
      // globalThis.__BUILD_ID__. It changes iff the built code changes (so it is
      // reproducible and updates on every --watch rebuild), and is identical
      // across bundles within one build so the SW↔offscreen handshake matches.
      new webpack.BannerPlugin({
        raw: true,
        entryOnly: true,
        banner: 'globalThis.__BUILD_ID__="[fullhash]";',
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.join(STATIC_DIR, 'manifest.json'),
            to: 'manifest.json',
            transform: (content) => transformManifest(content, configuredGoogleOauthClientId, isDevBuild, browserTarget, telemetryEndpoint),
          },
          { from: path.join(STATIC_DIR, 'popup.html'),     to: 'popup.html' },
          ...(isDevBuild ? [{ from: path.join(STATIC_DIR, 'popup-gallery.html'), to: 'popup-gallery.html' }] : []),
          { from: path.join(STATIC_DIR, 'styles'),         to: 'styles' },
          { from: path.join(STATIC_DIR, 'fonts'),          to: 'fonts' },
          { from: path.join(STATIC_DIR, 'debug.html'),     to: 'debug.html' },
          { from: path.join(STATIC_DIR, 'offscreen.html'), to: 'offscreen.html', noErrorOnMissing: true },
          { from: path.join(STATIC_DIR, 'micsetup.html'), to: 'micsetup.html' },
          { from: path.join(STATIC_DIR, 'camsetup.html'), to: 'camsetup.html' },
          { from: path.join(STATIC_DIR, 'settings.html'), to: 'settings.html' },
          { from: path.join(STATIC_DIR, 'recordings.html'), to: 'recordings.html' },
          // Finder metadata is ignored by git but can still exist locally; never
          // ship it inside the extension package.
          { from: PUBLIC_DIR, to: '.', noErrorOnMissing: true, globOptions: { ignore: ['**/.DS_Store', '**/._*'] } },
        ]
      })
    ]
  }
}
