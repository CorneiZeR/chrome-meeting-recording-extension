/**
 * @file popup/devicePermissions.ts
 *
 * Bounded primitives for asking a browser about microphone/camera access from a
 * popup, shared by the mic and camera permission services.
 *
 * Both browser calls involved can stay *pending* instead of failing: a
 * permission query that never answers, and an inline `getUserMedia` whose
 * prompt the browser refuses to show in a popup (Edge does exactly this). An
 * unbounded await there is not a slow path, it is a dead UI — on Edge the mic
 * button did nothing at all, and starting a recording with the camera on would
 * have hung before ever opening the setup page. So every wait here has a
 * deadline, and a non-answer is reported as "cannot tell" rather than blocking.
 */

/** A permission query should answer instantly; anything slower is a non-answer. */
export const PERMISSION_QUERY_TIMEOUT_MS = 500;
/**
 * An inline prompt either appears at once or the browser is refusing to show
 * one. Long enough for an already-granted permission to resolve, short enough
 * that the user is not left looking at a dead control.
 */
export const INLINE_PRIME_TIMEOUT_MS = 1_500;

export type DevicePermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

const TIMED_OUT = Symbol('timed-out');

/** Resolves with the promise's value, or TIMED_OUT when it takes too long. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Second opinion for a browser whose permission query cannot be trusted: a
 * device label is exposed only once access to that kind of device has been
 * granted, and enumerating devices never prompts.
 */
async function inferStateFromDevices(kind: MediaDeviceKind): Promise<'granted' | 'unknown'> {
  try {
    const devices = await withTimeout(navigator.mediaDevices.enumerateDevices(), PERMISSION_QUERY_TIMEOUT_MS);
    if (devices === TIMED_OUT) return 'unknown';
    return devices.some((device) => device.kind === kind && !!device.label) ? 'granted' : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Reads the browser's permission state for one device kind.
 *
 * Returns `unknown` for every non-answer — missing API, rejection, or a query
 * that does not settle in time — so a caller never blocks on it.
 */
export async function queryDevicePermissionState(
  name: 'microphone' | 'camera',
  kind: MediaDeviceKind,
): Promise<DevicePermissionState> {
  if (!('permissions' in navigator)) return await inferStateFromDevices(kind);

  try {
    const status = await withTimeout(
      navigator.permissions.query({ name: name as PermissionName }),
      PERMISSION_QUERY_TIMEOUT_MS,
    );
    if (status === TIMED_OUT) return await inferStateFromDevices(kind);
    const state = status?.state as DevicePermissionState | undefined;
    if (state === 'granted' || state === 'denied' || state === 'prompt') return state;
    return await inferStateFromDevices(kind);
  } catch {
    return await inferStateFromDevices(kind);
  }
}

/**
 * Tries to grant access inline from the popup.
 *
 * A stream that arrives after the deadline is released rather than left holding
 * the device: a popup that has moved on must not keep the microphone or camera
 * open behind the user's back.
 */
export async function primeDeviceInline(constraints: MediaStreamConstraints): Promise<boolean> {
  try {
    const request = navigator.mediaDevices.getUserMedia(constraints);
    const settled = await withTimeout(request, INLINE_PRIME_TIMEOUT_MS);
    if (settled === TIMED_OUT) {
      void request.then((late) => late.getTracks().forEach((track) => track.stop())).catch(() => {});
      return false;
    }
    settled.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
