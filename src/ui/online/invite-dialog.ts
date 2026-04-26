/**
 * Modal shown to a player who opens a deep-link `?room=TRITON-XXXX-XXXX`.
 * They must explicitly accept the invite before we connect to the room —
 * otherwise the previous flow dropped them straight into the connecting
 * spinner with no context, which felt jarring.
 *
 * On "Annulla" we strip ?room= from the URL via `history.replaceState`
 * so a refresh doesn't pop the dialog again.
 */
import { trapFocus } from '../menu/focus-trap';

export interface InviteDialogOptions {
  roomCode: string;
  onAccept: () => void;
  onCancel: () => void;
}

export interface InviteDialog {
  el: HTMLElement;
  destroy: () => void;
}

export function showInviteDialog(opts: InviteDialogOptions): InviteDialog {
  const overlay = document.createElement('div');
  overlay.className = 'screen screen-confirm';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'invite-dialog-title');
  overlay.innerHTML = `
    <div class="screen-card screen-card-narrow">
      <div class="screen-eyebrow">Multigiocatore</div>
      <h2 class="screen-title screen-title-sm" id="invite-dialog-title">Sei stato invitato!</h2>
      <p class="screen-sub">Stanza <strong class="invite-dialog-code">${opts.roomCode}</strong></p>
      <div class="screen-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Annulla</button>
        <button type="button" class="btn btn-primary" data-accept>Unisciti alla partita</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const acceptBtn = overlay.querySelector<HTMLButtonElement>('[data-accept]')!;
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('[data-cancel]')!;

  acceptBtn.addEventListener('click', () => {
    close();
    opts.onAccept();
  });
  cancelBtn.addEventListener('click', () => {
    stripRoomFromUrl();
    close();
    opts.onCancel();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      stripRoomFromUrl();
      close();
      opts.onCancel();
    }
  });

  const trap = trapFocus(overlay, () => {
    stripRoomFromUrl();
    close();
    opts.onCancel();
  });
  acceptBtn.focus();

  function close(): void {
    trap.release();
    overlay.classList.add('screen-leave');
    window.setTimeout(() => overlay.remove(), 220);
  }

  return { el: overlay, destroy: close };
}

/** Drop `?room=…` from the URL bar so a refresh after cancelling doesn't
 * re-open the invite dialog. */
function stripRoomFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('room')) return;
  url.searchParams.delete('room');
  window.history.replaceState({}, '', url.toString());
}
