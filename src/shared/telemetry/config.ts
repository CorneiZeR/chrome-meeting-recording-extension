import type { TelemetryRecording, TelemetryRuntime } from './contracts';

export function getTelemetryEndpoint(): string {
  return typeof __TELEMETRY_ENDPOINT__ === 'string' ? __TELEMETRY_ENDPOINT__ : '';
}

export function isValidTelemetryEndpoint(value = getTelemetryEndpoint()): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.pathname === '/api/telemetry/batches' && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function bucketMajor(value: string | undefined): string {
  const major = Number.parseInt(value ?? '', 10);
  return Number.isFinite(major) ? String(Math.min(999, Math.max(0, major))) : 'unknown';
}

export function collectCoarseRuntime(): TelemetryRuntime {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browserMatch = ua.match(/(Edg)\/(\d+)/) ?? ua.match(/(Chrome|Chromium|Firefox)\/(\d+)/);
  const browserFamily = browserMatch?.[1] === 'Edg' ? 'edge' : browserMatch?.[1]?.toLowerCase() ?? 'unknown';
  const osMatch = ua.match(/(Windows NT|Android|Mac OS X|CrOS|Linux)[ /]([\d_\.]+)?/);
  const osFamily = osMatch?.[1] === 'Windows NT' ? 'windows'
    : osMatch?.[1] === 'Mac OS X' ? 'macos'
      : osMatch?.[1]?.toLowerCase() ?? 'unknown';
  const cpu = typeof navigator === 'undefined' ? 0 : navigator.hardwareConcurrency || 0;
  const memory = typeof navigator === 'undefined' ? 0 : Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0);
  const connection = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return {
    browserFamily,
    browserMajor: bucketMajor(browserMatch?.[2]),
    osFamily,
    osMajor: bucketMajor(osMatch?.[2]?.split(/[_.]/)[0]),
    cpuBucket: cpu === 0 ? 'unknown' : cpu <= 2 ? '1-2' : cpu <= 4 ? '3-4' : cpu <= 8 ? '5-8' : '9+',
    memoryBucket: memory === 0 ? 'unknown' : memory <= 2 ? '1-2' : memory <= 4 ? '3-4' : memory <= 8 ? '5-8' : '9+',
    networkClass: ['slow-2g', '2g', '3g', '4g'].includes(connection?.effectiveType ?? '') ? connection!.effectiveType! : 'unknown',
  };
}

const resolutionBucket = (width?: number, height?: number): string => {
  const pixels = (width ?? 0) * (height ?? 0);
  return pixels === 0 ? 'unknown' : pixels <= 640 * 360 ? '<=360p' : pixels <= 854 * 480 ? '<=480p' : pixels <= 1280 * 720 ? '<=720p' : pixels <= 1920 * 1080 ? '<=1080p' : '>1080p';
};

const frameRateBucket = (fps?: number): string => !fps ? 'unknown' : fps <= 15 ? '<=15' : fps <= 30 ? '<=30' : fps <= 60 ? '<=60' : '>60';

export function recordingContextFromRunConfig(runConfig?: any, recorderSettings?: any): TelemetryRecording {
  return {
    storageMode: runConfig?.storageMode === 'drive' ? 'drive' : ['local', 'opfs'].includes(runConfig?.storageMode) ? 'local' : 'unknown',
    microphoneMode: ['off', 'mixed', 'separate'].includes(runConfig?.micMode) ? runConfig.micMode : 'unknown',
    separateCamera: runConfig?.recordSelfVideo === true,
    tabResolution: resolutionBucket(recorderSettings?.tab?.output?.maxWidth, recorderSettings?.tab?.output?.maxHeight),
    tabFrameRate: frameRateBucket(recorderSettings?.tab?.output?.maxFrameRate),
    cameraResolution: resolutionBucket(recorderSettings?.selfVideo?.profile?.width, recorderSettings?.selfVideo?.profile?.height),
    cameraFrameRate: frameRateBucket(recorderSettings?.selfVideo?.profile?.frameRate),
  };
}

export const UNKNOWN_RECORDING_CONTEXT: TelemetryRecording = {
  storageMode: 'unknown', microphoneMode: 'unknown', separateCamera: false,
  tabResolution: 'unknown', tabFrameRate: 'unknown', cameraResolution: 'unknown', cameraFrameRate: 'unknown',
};
