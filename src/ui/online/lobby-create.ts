import { trapFocus } from '../menu/focus-trap';
import { generateRoomCode, shareableLink } from './room-code';
import { showGuestPendingDialog, type GuestPendingDialog } from './guest-pending-dialog';
import { renderQrCode } from './qr-code';

export interface LobbyCreateOptions {
  /** Called when the user closes the screen (returns to menu). */
  onCancel: () => void;
  /** Called when the host presses "Inizia partita" in the guest-pending dialog. */
  onConfirmStart: () => void;
  /** Called when the host presses "Aspetta" in the guest-pending dialog. */
  onWait: () => void;
  /** Optional: reuse an existing code (e.g. from URL deep link). */
  initialCode?: string;
}

export interface LobbyCreate {
  el: HTMLElement;
  /** Show the "guest connected" dialog over the create screen. */
  showGuestPending: (guestNick: string) => void;
  /** Hide an open guest-pending dialog (e.g. host pressed Aspetta). */
  hideGuestPending: () => void;
  destroy: () => void;
}

const TICK_MS = 1000;

export function showLobbyCreate(opts: LobbyCreateOptions): LobbyCreate {
  const code = opts.initialCode ?? generateRoomCode();
  const link = shareableLink(code);

  const overlay = document.createElement('div');
  overlay.className = 'screen screen-lobby';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'lobby-create-title');
  overlay.innerHTML = `
    <div class="screen-card screen-card-narrow">
      <div class="screen-eyebrow">Invita un amico</div>
      <h2 class="screen-title screen-title-sm" id="lobby-create-title">Condividi il codice</h2>
      <p class="screen-sub">Mandalo all'altro giocatore. Quando si collega, decidi tu quando iniziare.</p>
      <div class="lobby-code" data-code>${code}</div>
      <div class="lobby-link-row">
        <input type="text" class="lobby-link-input" value="${link}" readonly aria-label="Link partita" />
        <button type="button" class="btn btn-ghost btn-sm" data-copy-link>Copia link</button>
      </div>
      <div class="lobby-share-row">
        <button type="button" class="btn btn-ghost btn-sm" data-share>Condividi</button>
        <button type="button" class="btn btn-ghost btn-sm" data-qr-toggle aria-expanded="false">Mostra QR</button>
      </div>
      <div class="lobby-qr" data-qr hidden></div>
      <div class="lobby-wait-row" data-wait-row>
        <span class="lobby-spinner" data-spinner aria-hidden="true">
          <span class="lobby-spinner-dot"></span>
          <span class="lobby-spinner-dot"></span>
          <span class="lobby-spinner-dot"></span>
        </span>
        <span class="lobby-wait-text" data-wait-text>In attesa…</span>
      </div>
      <div class="screen-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Annulla</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cancelBtn = overlay.querySelector<HTMLButtonElement>('[data-cancel]')!;
  const copyBtn = overlay.querySelector<HTMLButtonElement>('[data-copy-link]')!;
  const shareBtn = overlay.querySelector<HTMLButtonElement>('[data-share]')!;
  const qrToggle = overlay.querySelector<HTMLButtonElement>('[data-qr-toggle]')!;
  const qrEl = overlay.querySelector<HTMLDivElement>('[data-qr]')!;
  const linkInput = overlay.querySelector<HTMLInputElement>('.lobby-link-input')!;
  const waitText = overlay.querySelector<HTMLSpanElement>('[data-wait-text]')!;

  // Wait timer — counts up from screen mount until guest joins (or cancel).
  const startedAt = Date.now();
  let tickHandle: number | null = window.setInterval(updateWaitText, TICK_MS);
  updateWaitText();

  function updateWaitText(): void {
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    const time = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
    waitText.textContent = `In attesa da ${time}…`;
  }

  copyBtn.addEventListener('click', () => {
    void copyToClipboard(linkInput.value);
    copyBtn.textContent = 'Copiato!';
    window.setTimeout(() => { copyBtn.textContent = 'Copia link'; }, 1500);
  });

  shareBtn.addEventListener('click', () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      void navigator.share({
        title: 'Triton Wars',
        text: 'Sfidami a Triton Wars!',
        url: linkInput.value,
      }).catch(() => {
        // User cancelled or share unsupported — fall back to copy.
        void copyToClipboard(linkInput.value);
        shareBtn.textContent = 'Copiato!';
        window.setTimeout(() => { shareBtn.textContent = 'Condividi'; }, 1500);
      });
    } else {
      void copyToClipboard(linkInput.value);
      shareBtn.textContent = 'Copiato!';
      window.setTimeout(() => { shareBtn.textContent = 'Condividi'; }, 1500);
    }
  });

  let qrLoaded = false;
  qrToggle.addEventListener('click', () => {
    const isOpen = !qrEl.hidden;
    if (isOpen) {
      qrEl.hidden = true;
      qrToggle.setAttribute('aria-expanded', 'false');
      qrToggle.textContent = 'Mostra QR';
      return;
    }
    qrEl.hidden = false;
    qrToggle.setAttribute('aria-expanded', 'true');
    qrToggle.textContent = 'Nascondi QR';
    if (!qrLoaded) {
      qrLoaded = true;
      qrEl.innerHTML = '<span class="lobby-qr-loading">Generazione QR…</span>';
      void renderQrCode(linkInput.value).then((svg) => {
        qrEl.innerHTML = svg;
      }).catch(() => {
        qrEl.innerHTML = '<span class="lobby-qr-loading">QR non disponibile</span>';
      });
    }
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

  let pendingDialog: GuestPendingDialog | null = null;

  function showGuestPending(guestNick: string): void {
    if (pendingDialog) return;
    pendingDialog = showGuestPendingDialog({
      guestNick,
      onStart: () => {
        pendingDialog = null;
        opts.onConfirmStart();
      },
      onWait: () => {
        pendingDialog = null;
        // Update wait label to reflect the standby state.
        waitText.textContent = `In stand-by con ${guestNick}…`;
        opts.onWait();
      },
    });
  }

  function hideGuestPending(): void {
    if (pendingDialog) {
      pendingDialog.destroy();
      pendingDialog = null;
    }
  }

  function close(): void {
    if (tickHandle !== null) {
      window.clearInterval(tickHandle);
      tickHandle = null;
    }
    hideGuestPending();
    trap.release();
    overlay.classList.add('screen-leave');
    window.setTimeout(() => overlay.remove(), 220);
  }

  return {
    el: overlay,
    showGuestPending,
    hideGuestPending,
    destroy: close,
  };
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      // give up silently — user can still long-press the input
    }
    document.body.removeChild(ta);
  }
}
