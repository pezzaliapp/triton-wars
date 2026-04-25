/**
 * Tiny safe wrapper around localStorage. localStorage can throw in private
 * browsing modes or when the quota is exhausted; we silently fall back to
 * a no-op so feature flags don't crash the app.
 */

const PREFIX = 'triton-wars:';

export const storageKeys = {
  legendCollapsed: `${PREFIX}legend-collapsed`,
  howToSeen: `${PREFIX}howto-seen`,
  audioMuted: `${PREFIX}audio-muted`,
} as const;

export function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(key: string, value: boolean): void {
  try {
    if (value) {
      window.localStorage.setItem(key, '1');
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
