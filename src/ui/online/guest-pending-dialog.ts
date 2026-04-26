/**
 * Host-side dialog shown when a guest has joined the room but the host has
 * not yet pressed "Inizia partita". Two actions:
 *
 *   - Inizia partita: orchestrator.signalStartMatch() — locks the room and
 *     transitions both peers into placement.
 *   - Aspetta:        orchestrator.signalStandby(60000) — keeps the guest
 *     around for 60s in stand-by, host stays in waiting state to evaluate.
 *
 * The dialog can be reopened: if the host pressed Aspetta and a few
 * seconds later changes their mind, calling showGuestPendingDialog again
 * is fine.
 */
import { trapFocus } from '../menu/focus-trap';

export interface GuestPendingDialogOptions {
  guestNick: string;
  onStart: () => void;
  onWait: () => void;
}

export interface GuestPendingDialog {
  el: HTMLElement;
  destroy: () => void;
}

export function showGuestPendingDialog(opts: GuestPendingDialogOptions): GuestPendingDialog {
  const overlay = document.createElement('div');
  overlay.className = 'screen screen-confirm';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'guest-pending-title');
  overlay.innerHTML = `
    <div class="screen-card screen-card-narrow">
      <div class="screen-eyebrow">Connesso</div>
      <h2 class="screen-title screen-title-sm" id="guest-pending-title">
        ✓ ${escapeHtml(opts.guestNick)} si è connesso
      </h2>
      <p class="screen-sub">Pronto a iniziare?</p>
      <div class="screen-actions">
        <button type="button" class="btn btn-ghost" data-wait>Aspetta</button>
        <button type="button" class="btn btn-primary" data-start>Inizia partita</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const startBtn = overlay.querySelector<HTMLButtonElement>('[data-start]')!;
  const waitBtn = overlay.querySelector<HTMLButtonElement>('[data-wait]')!;

  startBtn.addEventListener('click', () => {
    close();
    opts.onStart();
  });
  waitBtn.addEventListener('click', () => {
    close();
    opts.onWait();
  });

  const trap = trapFocus(overlay, () => {
    close();
    opts.onWait();
  });
  startBtn.focus();

  function close(): void {
    trap.release();
    overlay.classList.add('screen-leave');
    window.setTimeout(() => overlay.remove(), 220);
  }

  return { el: overlay, destroy: close };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
