export type Theme = 'dark' | 'light' | 'system';

export const LS_THEME = 'mqttParser.theme';

export function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(LS_THEME);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}
