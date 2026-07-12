import {
  applyThemePreference,
  initializeExtensionTheme,
  resolveThemePreference,
} from '../theme';

describe('theme', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
    delete (window as Partial<Window>).matchMedia;
    jest.restoreAllMocks();
  });

  it('resolves system from the current color-scheme preference', () => {
    expect(resolveThemePreference('system', false)).toBe('light');
    expect(resolveThemePreference('system', true)).toBe('dark');
    expect(resolveThemePreference('light', true)).toBe('light');
    expect(resolveThemePreference('dark', false)).toBe('dark');
  });

  it('applies the resolved theme to the document root', () => {
    expect(applyThemePreference('system', true)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('follows system theme changes while the preference is system', () => {
    let onChange: (() => void) | undefined;
    const media = {
      matches: false,
      addEventListener: jest.fn((_type: string, listener: () => void) => { onChange = listener; }),
      removeEventListener: jest.fn(),
    } as unknown as MediaQueryList;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => media),
    });

    const cleanup = initializeExtensionTheme();
    expect(document.documentElement.dataset.theme).toBe('light');

    (media as { matches: boolean }).matches = true;
    onChange?.();
    expect(document.documentElement.dataset.theme).toBe('dark');

    cleanup();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
