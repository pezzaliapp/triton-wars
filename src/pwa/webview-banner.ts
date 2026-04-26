/**
 * In-app WebView guard for iOS.
 *
 * Three.js + WebGL2 rendering is broken or severely degraded inside the
 * WebView shells used by social/chat apps on iOS (WhatsApp, Telegram,
 * Facebook, Instagram, …). The renderer either fails to acquire a GL2
 * context or produces a black canvas after the first context loss.
 *
 * Mitigation has two parts:
 *  1. Detect known WebView UAs and show a sticky non-blocking banner
 *     telling the user to "Apri in Safari" — dismissable, with a 7-day
 *     localStorage flag so we don't nag.
 *  2. The render loop also installs `webglcontextlost`/`restored` handlers
 *     (see `installContextLossHandlers`) so transient losses don't leave
 *     the canvas frozen.
 *
 * Detection heuristics live here, banner DOM lives in this module too —
 * keeping both colocated makes it easy to tune one without spelunking.
 */

const STORAGE_KEY = 'triton-wars:webview-dismissed';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Substrings that indicate an in-app browser shell on iOS. These are
 * matched case-insensitively against navigator.userAgent. List sourced
 * from observed UAs (FB/IG/WhatsApp etc. plus Slack/Discord/email apps).
 */
const KNOWN_WEBVIEW_UA_TOKENS: readonly string[] = [
  'fban',           // Facebook
  'fbav',           // Facebook
  'fbios',          // Facebook iOS
  'instagram',      // Instagram
  'whatsapp',       // WhatsApp
  'line/',          // LINE messenger
  'micromessenger', // WeChat
  'twitter',        // Twitter/X
  'linkedinapp',    // LinkedIn
  'kakaotalk',      // KakaoTalk
  'slack',          // Slack
  'discord',        // Discord
  'telegram',       // Telegram (when in-app browser is used)
  'gsa/',           // Google Search App
  'gmail',          // Gmail iOS app
];

/** True if we look like an iOS device (iPhone / iPad / iPod, modern iPadOS). */
function isIos(ua: string): boolean {
  if (/iphone|ipad|ipod/.test(ua)) return true;
  // Modern iPadOS reports MacIntel + maxTouchPoints > 1.
  if (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel') {
    const mtp = (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints;
    return typeof mtp === 'number' && mtp > 1;
  }
  return false;
}

/** True if we are inside a known in-app WebView (or a non-Safari browser on iOS). */
export function detectInAppWebView(ua: string = navigator.userAgent): boolean {
  const lower = ua.toLowerCase();
  if (KNOWN_WEBVIEW_UA_TOKENS.some((tok) => lower.includes(tok))) return true;
  // iOS-no-Safari heuristic: iOS device but UA doesn't claim Safari, and
  // doesn't claim a known full-browser shell (Chrome, Firefox, Edge). This
  // catches Apple Mail's WebView and other unbranded WKWebView hosts.
  if (isIos(lower)) {
    const hasSafari = lower.includes('safari');
    const isFullBrowser = /crios|fxios|edgios/.test(lower);
    if (!hasSafari && !isFullBrowser) return true;
  }
  return false;
}

function isDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Private mode / storage disabled — banner just won't be remembered.
  }
}

/**
 * Mounts the sticky banner if we're in a WebView and the user hasn't
 * dismissed it in the last 7 days. Returns the destroy function (or null
 * if no banner was mounted, e.g. on Safari).
 */
export function maybeShowWebViewBanner(): (() => void) | null {
  if (typeof window === 'undefined') return null;
  if (!detectInAppWebView()) return null;
  if (isDismissed()) return null;

  const root = document.createElement('div');
  root.className = 'webview-banner';
  root.setAttribute('role', 'note');
  root.innerHTML = `
    <div class="webview-banner-inner">
      <div class="webview-banner-text">
        <strong>App in-app rilevata.</strong>
        <span>Per giocare al meglio apri in Safari.</span>
      </div>
      <div class="webview-banner-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-open>Apri in Safari</button>
        <button type="button" class="webview-banner-close" data-dismiss aria-label="Chiudi">×</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const openBtn = root.querySelector<HTMLButtonElement>('[data-open]')!;
  const closeBtn = root.querySelector<HTMLButtonElement>('[data-dismiss]')!;

  openBtn.addEventListener('click', () => {
    // Best-effort: x-safari-https URLs only work from some shells. Most
    // WebViews intercept window.open(_blank) and route to Safari anyway.
    const url = window.location.href;
    window.open(url, '_blank');
  });

  closeBtn.addEventListener('click', () => {
    markDismissed();
    destroy();
  });

  function destroy(): void {
    root.remove();
  }

  return destroy;
}

/**
 * Installs `webglcontextlost` / `webglcontextrestored` handlers on the
 * canvas. Returns an unregister function.
 *
 * On loss: prevents the default (so the browser will fire `restored`)
 * and pauses the render loop via the `onLost` callback.
 * On restore: calls `onRestored` so the loop can resume and re-create
 * GPU resources if needed.
 */
export interface ContextLossHandlers {
  onLost: () => void;
  onRestored: () => void;
}

export function installContextLossHandlers(
  canvas: HTMLCanvasElement,
  handlers: ContextLossHandlers,
): () => void {
  const onLost = (e: Event): void => {
    e.preventDefault();
    handlers.onLost();
  };
  const onRestored = (): void => {
    handlers.onRestored();
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);
  return () => {
    canvas.removeEventListener('webglcontextlost', onLost, false);
    canvas.removeEventListener('webglcontextrestored', onRestored, false);
  };
}
