import { trapFocus, type FocusTrap } from '../menu/focus-trap';

export type ConnectingStatus =
  | 'signaling'      // talking to relay, no peer yet
  | 'peer-found'     // peer has joined the room
  | 'handshake'      // exchanging hello + commit
  | 'ready'          // both committed, lobby is closing
  | 'failed';        // unrecoverable error

export interface LobbyConnectingOptions {
  roomCode: string;
  onCancel: () => void;
}

export interface LobbyConnecting {
  el: HTMLElement;
  setStatus: (status: ConnectingStatus, message?: string) => void;
  destroy: () => void;
}

const STATUS_LABELS: Record<ConnectingStatus, string> = {
  signaling: 'Cerco l\'altro giocatore…',
  'peer-found': 'Avversario trovato — handshake in corso…',
  handshake: 'Sincronizzo flotte…',
  ready: 'Pronti! Apertura partita…',
  failed: 'Connessione fallita.',
};

export function showLobbyConnecting(opts: LobbyConnectingOptions): LobbyConnecting {
  const overlay = document.createElement('div');
  overlay.className = 'screen screen-lobby';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'lobby-connecting-title');
  overlay.innerHTML = `
    <div class="screen-card screen-card-narrow">
      <div class="screen-eyebrow">Connessione</div>
      <h2 class="screen-title screen-title-sm" id="lobby-connecting-title">Stanza ${opts.roomCode}</h2>
      <div class="lobby-spinner" data-spinner aria-hidden="true">
        <div class="lobby-spinner-dot"></div>
        <div class="lobby-spinner-dot"></div>
        <div class="lobby-spinner-dot"></div>
      </div>
      <p class="lobby-status" data-status>${STATUS_LABELS.signaling}</p>
      <p class="lobby-helper" data-detail hidden></p>
      <div class="screen-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Annulla</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const statusEl = overlay.querySelector<HTMLParagraphElement>('[data-status]')!;
  const detailEl = overlay.querySelector<HTMLParagraphElement>('[data-detail]')!;
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('[data-cancel]')!;
  const spinner = overlay.querySelector<HTMLDivElement>('[data-spinner]')!;

  let trap: FocusTrap | null = trapFocus(overlay, () => {
    close();
    opts.onCancel();
  });

  cancelBtn.addEventListener('click', () => {
    close();
    opts.onCancel();
  });

  function setStatus(status: ConnectingStatus, message?: string): void {
    statusEl.textContent = STATUS_LABELS[status];
    if (message) {
      detailEl.textContent = message;
      detailEl.hidden = false;
    } else {
      detailEl.hidden = true;
    }
    if (status === 'failed') {
      spinner.classList.add('lobby-spinner-stopped');
      cancelBtn.textContent = 'Chiudi';
    }
  }

  function close(): void {
    trap?.release();
    trap = null;
    overlay.classList.add('screen-leave');
    window.setTimeout(() => overlay.remove(), 220);
  }

  return {
    el: overlay,
    setStatus,
    destroy: close,
  };
}
