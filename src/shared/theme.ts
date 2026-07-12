/**
 * Applies the persisted extension theme to visible extension pages.
 * `system` follows prefers-color-scheme live; explicit choices remain fixed.
 */

import {
  addStorageChangedListener,
  removeStorageChangedListener,
  type StorageChangedListener,
} from '../platform/chrome/storage';
import {
  loadExtensionSettingsFromStorage,
  normalizeExtensionSettings,
  type ThemePreference,
} from './settings';
import { EXTENSION_SETTINGS_STORAGE_KEY } from './settings/defaults';

export type ResolvedTheme = 'light' | 'dark';

export function resolveThemePreference(
  preference: ThemePreference,
  prefersDark: boolean
): ResolvedTheme {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}

export function applyThemePreference(
  preference: ThemePreference,
  prefersDark = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
): ResolvedTheme {
  const resolved = resolveThemePreference(preference, prefersDark);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }
  return resolved;
}

/** Initializes theme loading plus live system/storage synchronization. */
export function initializeExtensionTheme(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const media = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  let preference: ThemePreference = 'system';
  let destroyed = false;

  const apply = () => applyThemePreference(preference, media?.matches ?? false);
  const onSystemThemeChanged = () => {
    if (preference === 'system') apply();
  };
  const onStorageChanged: StorageChangedListener = (changes, areaName) => {
    if (areaName !== 'local') return;
    const changed = changes[EXTENSION_SETTINGS_STORAGE_KEY];
    if (!changed) return;
    preference = normalizeExtensionSettings(changed.newValue).appearance.theme;
    apply();
  };

  apply();
  media?.addEventListener?.('change', onSystemThemeChanged);
  const storageListenerInstalled = addStorageChangedListener(onStorageChanged);

  void loadExtensionSettingsFromStorage()
    .then((settings) => {
      if (destroyed) return;
      preference = settings.appearance.theme;
      apply();
    })
    .catch(() => {
      // System theme is already active, so a storage failure needs no fallback UI.
    });

  return () => {
    destroyed = true;
    media?.removeEventListener?.('change', onSystemThemeChanged);
    if (storageListenerInstalled) removeStorageChangedListener(onStorageChanged);
  };
}
