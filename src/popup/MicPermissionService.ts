/**
 * @file popup/MicPermissionService.ts
 *
 * Popup-side microphone permission helper: state queries, inline permission
 * priming, and the setup-page fallback for when a browser will not prompt from
 * a popup.
 *
 * The bounded primitives it asks with live in [`devicePermissions`](./devicePermissions.ts),
 * shared with the camera service — an unbounded wait here is a dead button, not
 * a slow one.
 */

import type { MicMode } from '../shared/recording';
import { createRuntimeTab } from '../platform/chrome/tabs';
import {
  primeDeviceInline,
  queryDevicePermissionState,
  type DevicePermissionState,
} from './devicePermissions';

export class MicPermissionService {
  /** Opens the dedicated runtime page that can trigger Chrome's microphone permission UI. */
  async openMicSetupTab() {
    await createRuntimeTab('micsetup.html');
  }

  /** Reads the browser's microphone permission state for the extension origin. */
  queryMicPermissionState(): Promise<DevicePermissionState> {
    return queryDevicePermissionState('microphone', 'audioinput');
  }

  /** Tries to grant microphone access inline from the popup. */
  tryPrimeInline(): Promise<boolean> {
    return primeDeviceInline({ audio: true });
  }

  /** Ensures microphone permission is ready before a recording that needs mic audio starts. */
  async ensureReadyForRecording(micMode: MicMode): Promise<boolean> {
    if (micMode === 'off') return true;

    const state = await this.queryMicPermissionState();
    if (state === 'granted') return true;
    if (state === 'denied') {
      await this.openMicSetupTab();
      return false;
    }

    const ok = await this.tryPrimeInline().catch(() => false);
    if (ok) return true;

    await this.openMicSetupTab();
    return false;
  }

  /** Binds the popup's mic-permission button to refresh state and request access. */
  bindButton(
    micBtn: HTMLButtonElement,
    onTextChange?: (text: string) => void
  ): void {
    const refresh = async () => {
      const state = await this.queryMicPermissionState();

      const text =
        state === 'granted'
          ? 'Microphone Enabled ✓'
          : state === 'denied'
          ? 'Microphone Blocked'
          : 'Enable Microphone';

      micBtn.textContent = text;
      onTextChange?.(text);

      micBtn.disabled = state === 'granted';
      micBtn.title =
        state === 'granted'
          ? 'Microphone is already enabled for this extension'
          : 'Grant microphone permission so your voice can be recorded in mixed or separate mic modes';
    };

    void refresh();

    micBtn.addEventListener('click', async () => {
      try {
        const state = await this.queryMicPermissionState();

        if (state === 'granted') {
          alert('Microphone is already enabled for this extension.');
          await refresh();
          return;
        }

        if (state === 'denied') {
          await this.openMicSetupTab();
          return;
        }

        const ok = await this.tryPrimeInline();
        if (ok) {
          alert('Microphone enabled for the extension.');
          await refresh();
          return;
        }

        await this.openMicSetupTab();
      } catch (e) {
        // The flow above cannot hang, but it can still fail (a blocked tab
        // create, say) — and a click that reports nothing is the bug this file
        // exists to prevent.
        console.error('[popup] mic enable flow error', e);
        alert('Could not open the microphone setup page. Please try again.');
      }
    });

  }
}
