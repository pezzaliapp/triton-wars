/**
 * Top-center high-contrast banner shown when the heartbeat starts missing
 * pongs. Updates the counter on each missed beat (1/3 → 2/3 → 3/3) and
 * auto-closes with a brief "Riconnesso!" flash when the peer responds.
 *
 * Lives outside the standard HUD so it's visible in any phase, including
 * while the menu/lobby chooser is layered on top during reconnect attempts.
 */

export interface ReconnectingBanner {
  el: HTMLElement;
  setProgress: (missed: number, threshold: number) => void;
  flashRecovered: () => void;
  destroy: () => void;
}

export function showReconnectingBanner(): ReconnectingBanner {
  const root = document.createElement('div');
  root.className = 'reconnecting-banner';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'assertive');
  root.innerHTML = `
    <div class="reconnecting-banner-inner">
      <span class="reconnecting-banner-dot" aria-hidden="true"></span>
      <span class="reconnecting-banner-text">Riconnessione… <span data-counter></span></span>
    </div>
  `;
  document.body.appendChild(root);

  const counterEl = root.querySelector<HTMLSpanElement>('[data-counter]')!;
  const textEl = root.querySelector<HTMLSpanElement>('.reconnecting-banner-text')!;
  let recoveryTimer: number | null = null;

  function setProgress(missed: number, threshold: number): void {
    if (recoveryTimer !== null) {
      window.clearTimeout(recoveryTimer);
      recoveryTimer = null;
      root.classList.remove('is-recovered');
    }
    counterEl.textContent = `${missed}/${threshold}`;
    textEl.firstChild!.textContent = 'Riconnessione… ';
    root.classList.toggle('is-critical', missed >= threshold);
  }

  function flashRecovered(): void {
    counterEl.textContent = '';
    textEl.firstChild!.textContent = 'Riconnesso!';
    root.classList.remove('is-critical');
    root.classList.add('is-recovered');
    if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
    recoveryTimer = window.setTimeout(() => {
      destroy();
    }, 1400);
  }

  function destroy(): void {
    if (recoveryTimer !== null) {
      window.clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }
    root.remove();
  }

  return { el: root, setProgress, flashRecovered, destroy };
}
