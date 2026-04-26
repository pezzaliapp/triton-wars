import { trapFocus } from '../menu/focus-trap';

export interface LobbyChooserOptions {
  onCreate: () => void;
  onJoin: () => void;
  onCancel: () => void;
}

export interface LobbyChooser {
  el: HTMLElement;
  destroy: () => void;
}

export function showLobbyChooser(opts: LobbyChooserOptions): LobbyChooser {
  const overlay = document.createElement('div');
  overlay.className = 'screen screen-lobby';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'lobby-chooser-title');
  overlay.innerHTML = `
    <div class="screen-card screen-card-narrow">
      <div class="screen-eyebrow">Multigiocatore P2P</div>
      <h2 class="screen-title screen-title-sm" id="lobby-chooser-title">Gioca online</h2>
      <p class="screen-sub">Connessione diretta tra browser. Nessun account, nessun server di gioco.</p>
      <div class="lobby-chooser-actions">
        <button type="button" class="btn btn-primary btn-lg" data-create>
          <span>Crea partita</span>
          <span class="lobby-chooser-hint">Genera un codice e condividilo</span>
        </button>
        <button type="button" class="btn btn-ghost btn-lg" data-join>
          <span>Unisciti</span>
          <span class="lobby-chooser-hint">Inserisci il codice che ti hanno dato</span>
        </button>
      </div>
      <div class="screen-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Annulla</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const createBtn = overlay.querySelector<HTMLButtonElement>('[data-create]')!;
  const joinBtn = overlay.querySelector<HTMLButtonElement>('[data-join]')!;
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('[data-cancel]')!;

  createBtn.addEventListener('click', () => {
    close();
    opts.onCreate();
  });
  joinBtn.addEventListener('click', () => {
    close();
    opts.onJoin();
  });
  cancelBtn.addEventListener('click', () => {
    close();
    opts.onCancel();
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

  function close(): void {
    trap.release();
    overlay.classList.add('screen-leave');
    window.setTimeout(() => overlay.remove(), 220);
  }

  return {
    el: overlay,
    destroy: close,
  };
}
