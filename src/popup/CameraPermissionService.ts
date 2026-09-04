/**
 * @file popup/CameraPermissionService.ts
 *
 * Popup-side camera permission helper used when self-video capture is enabled.
 *
 * Bounded like the microphone's, and for a sharper reason: this ladder runs
 * from `ensureReadyForRecording` *before* a recording starts, so a browser that
 * neither prompts nor rejects would hang **Start Recording** itself rather than
 * a button. See [`devicePermissions`](./devicePermissions.ts).
 */

import { createRuntimeTab } from '../platform/chrome/tabs';
import {
  primeDeviceInline,
  queryDevicePermissionState,
  type DevicePermissionState,
} from './devicePermissions';

export class CameraPermissionService {
  /** Opens the dedicated runtime page that can trigger the browser's camera permission UI. */
  async openCameraSetupTab() {
    await createRuntimeTab('camsetup.html');
  }

  /** Reads the browser's camera permission state for the extension origin. */
  queryCameraPermissionState(): Promise<DevicePermissionState> {
    return queryDevicePermissionState('camera', 'videoinput');
  }

  /** Tries to grant camera access inline from the popup. */
  tryPrimeInline(): Promise<boolean> {
    return primeDeviceInline({ video: true, audio: false });
  }

  /** Ensures camera permission is ready before a recording that includes self-video starts. */
  async ensureReadyForRecording(): Promise<boolean> {
    const state = await this.queryCameraPermissionState();
    if (state === 'granted') return true;
    if (state === 'denied') {
      await this.openCameraSetupTab();
      return false;
    }

    const ok = await this.tryPrimeInline().catch(() => false);
    if (ok) return true;

    await this.openCameraSetupTab();
    return false;
  }
}
