import { trapFocus } from './focus-trap';

export interface ExitConfirmOptions {
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal asking the user to confirm leaving an active match. */
export function showExitConfirm(opts: ExitConfirmOptions): void {
  const overlay = document.createElement('div');
  overlay.className = 'screen screen-confirm';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'exit-confirm-title');
  overlay.setAttribute('aria-describedby', 'exit-confirm-body');
  overlay.innerHTML = `
    <div class="screen-card screen-card-narrow">
      <div class="screen-eyebrow">Partita in corso</div>
      <h2 class="screen-title screen-title-sm" id="exit-confirm-title">Abbandonare?</h2>
      <p class="screen-sub" id="exit-confirm-body">
        Se torni al menu perderai la flotta corrente e la partita verrà annullata.
      </p>
      <div class="screen-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Continua a giocare</button>
        <button type="button" class="btn btn-danger" data-confirm>Torna al menu</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = (): void => {
    trap.release();
    overlay.classList.add('screen-leave');
    window.setTimeout(() => overlay.remove(), 220);
  };

  const cancelBtn = overlay.querySelector<HTMLButtonElement>('[data-cancel]')!;
  const confirmBtn = overlay.querySelector<HTMLButtonElement>('[data-confirm]')!;

  cancelBtn.addEventListener('click', () => {
    close();
    opts.onCancel();
  });
  confirmBtn.addEventListener('click', () => {
    close();
    opts.onConfirm();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
      opts.onCancel();
    }
  });

  const trap = trapFocus(overlay, () => {
    close();
    opts.onCancel();
  });
}
