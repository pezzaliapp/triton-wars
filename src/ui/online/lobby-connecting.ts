import { trapFocus, type FocusTrap } from '../menu/focus-trap';

export type ConnectingStatus =
  | 'signaling'           // talking to relay, no peer yet
  | 'peer-found'          // peer has joined the room
  | 'waiting-host-start'  // we are the guest; host hasn't pressed Inizia yet
  | 'standby'             // host put us in stand-by; show expiresAt countdown
  | 'handshake'           // exchanging hello + commit (legacy)
  | 'ready'               // both committed, lobby is closing
  | 'failed';             // unrecoverable error

export interface LobbyConnectingOptions {
  roomCode: string;
  onCancel: () => void;
}

export interface LobbyConnecting {
  el: HTMLElement;
  setStatus: (status: ConnectingStatus, message?: string) => void;
  /** Show a live countdown (mm:ss) ending at the given wall-clock ms. Pass
   * null to clear. Used for the host's stand-by deadline. */
  setCountdown: (untilMs: number | null) => void;
  destroy: () => void;
}

const STATUS_LABELS: Record<ConnectingStatus, string> = {
  signaling: 'Cerco l\'altro giocatore…',
  'peer-found': 'Avversario trovato — handshake in corso…',
  'waiting-host-start': 'Connesso. In attesa che l\'host inizi la partita…',
  standby: 'L\'host sta valutando…',
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
      <p class="lobby-countdown" data-countdown hidden></p>
      <p class="lobby-helper" data-detail hidden></p>
      <div class="screen-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Annulla</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const statusEl = overlay.querySelector<HTMLParagraphElement>('[data-status]')!;
  const detailEl = overlay.querySelector<HTMLParagraphElement>('[data-detail]')!;
  const countdownEl = overlay.querySelector<HTMLParagraphElement>('[data-countdown]')!;
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('[data-cancel]')!;
  const spinner = overlay.querySelector<HTMLDivElement>('[data-spinner]')!;

  let trap: FocusTrap | null = trapFocus(overlay, () => {
    close();
    opts.onCancel();
  });

  let countdownTimer: number | null = null;

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
    if (status === 'standby') {
      spinner.classList.add('lobby-spinner-stopped');
    }
  }

  function setCountdown(untilMs: number | null): void {
    if (countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (untilMs === null) {
      countdownEl.hidden = true;
      countdownEl.textContent = '';
      return;
    }
    const tick = (): void => {
      const remainSec = Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
      const m = Math.floor(remainSec / 60);
      const s = remainSec % 60;
      countdownEl.textContent = `Tempo rimanente: ${m}:${String(s).padStart(2, '0')}`;
    };
    tick();
    countdownEl.hidden = false;
    countdownTimer = window.setInterval(tick, 1000);
  }

  function close(): void {
    if (countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
    trap?.release();
    trap = null;
    overlay.classList.add('screen-leave');
    window.setTimeout(() => overlay.remove(), 220);
  }

  return {
    el: overlay,
    setStatus,
    setCountdown,
    destroy: close,
  };
}
