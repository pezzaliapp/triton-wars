/**
 * Mobile portrait → landscape rotation prompt.
 *
 * Triton Wars' HUD assumes a wide layout: in portrait on small screens
 * the side panel + bottom layer picker overlap the playable canvas
 * area. Until we redesign the HUD for portrait, force-prompt rotation
 * on devices below 900px wide. Desktops and large tablets are never
 * prompted regardless of orientation.
 *
 * The overlay is mounted unconditionally and toggles via a `data-active`
 * attribute driven by a single matchMedia query, so transitions are CSS.
 */

const QUERY = '(max-width: 899px) and (orientation: portrait)';

export function installOrientationLock(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return;

  const overlay = document.createElement('div');
  overlay.className = 'orientation-lock-overlay';
  overlay.setAttribute('role', 'alert');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="orientation-lock-card">
      <div class="orientation-lock-icon" aria-hidden="true">
        <span class="orientation-lock-phone">📱</span>
        <span class="orientation-lock-arrow">↻</span>
      </div>
      <h2 class="orientation-lock-title">Ruota il dispositivo in orizzontale per giocare</h2>
      <p class="orientation-lock-sub">Triton Wars è ottimizzato per il display landscape.</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const mq = window.matchMedia(QUERY);
  const apply = (matches: boolean): void => {
    overlay.dataset.active = matches ? 'true' : 'false';
  };
  apply(mq.matches);
  mq.addEventListener('change', (e) => apply(e.matches));
}
