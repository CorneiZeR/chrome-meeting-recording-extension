/**
 * @file shared/settings/model.ts
 *
 * Type definitions for extension configuration and the frozen recorder snapshot.
 * Internal to the Settings module — callers import these types from the module
 * index, not from here.
 */

import type { MicMode } from '../recordingTypes';
import type { MicrophoneRecordingFormat, VideoRecordingFormat } from '../recordingFormats';

export type RecordingModeDefault = 'opfs' | 'drive';
export type ResolutionPreset = '640x360' | '854x480' | '1280x720' | '1920x1080';
export type ThemePreference = 'system' | 'light' | 'dark';

export type LegacyVideoFormat = 1080 | 720 | 480 | 360;
export type ResolutionDimensions = {
  width: number;
  height: number;
};

export type ExtensionSettings = {
  privacy: {
    /** Sends bounded anonymous recording diagnostics. No media, names, captions, identifiers, messages, or raw stacks. */
    anonymousDiagnostics: boolean;
  };
  appearance: {
    theme: ThemePreference;
  };
  basic: {
    recordingMode: RecordingModeDefault;
    microphoneRecordingMode: MicMode;
    separateCameraCapture: boolean;
    /** Switch Meet's captions on when a recording starts, so it is never silently transcript-less. */
    autoEnableCaptions: boolean;
    tabRecordingFormat: VideoRecordingFormat;
    cameraRecordingFormat: VideoRecordingFormat;
    microphoneRecordingFormat: MicrophoneRecordingFormat;
    selfVideoResolutionPreset: ResolutionPreset;
    /** Record the camera at the browser/Meet-selected resolution instead of forcing the preset (skips the resize re-rasterization). */
    selfVideoUseAutoResolution: boolean;
  };
  professional: {
    selfVideoFrameRate: number;
    tabResolutionPreset: ResolutionPreset;
    tabMaxFrameRate: number;
    tabContentType: TabContentType;
    microphoneEchoCancellation: boolean;
    microphoneNoiseSuppression: boolean;
    microphoneAutoGainControl: boolean;
    chunkDefaultTimesliceMs: number;
    chunkExtendedTimesliceMs: number;
  };
};

export type SelfVideoProfileSettings = {
  width: number;
  height: number;
  frameRate: number;
  format: VideoRecordingFormat;
  aspectRatio: number;
  defaultBitsPerSecond: number;
  minAdaptiveBitsPerSecond: number;
  /** When true, skip resolution enforcement and record whatever the browser delivered. */
  autoResolution: boolean;
};

export type TabContentType = 'screen' | 'video';

export type TabCaptureSettings = {
  maxWidth: number;
  maxHeight: number;
  maxFrameRate: number;
  format: VideoRecordingFormat;
  /** Content type hint that selects the quality factor: 'screen' for UI/code/slides, 'video' for playback or animations. The offscreen multiplies it by the delivered W×H×fps and clamps to the internal MAX_TAB_VIDEO_BITRATE ceiling. */
  contentType: TabContentType;
};

export type MicrophoneCaptureSettings = {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  format: MicrophoneRecordingFormat;
};

export type ChunkingSettings = {
  defaultTimesliceMs: number;
  extendedTimesliceMs: number;
};

export type RecorderRuntimeSettingsSnapshot = {
  tab: {
    output: TabCaptureSettings;
  };
  selfVideo: {
    profile: SelfVideoProfileSettings;
  };
  microphone: MicrophoneCaptureSettings;
  chunking: ChunkingSettings;
};
