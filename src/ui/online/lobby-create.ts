import { trapFocus } from '../menu/focus-trap';
import { generateRoomCode, shareableLink } from './room-code';

export interface LobbyCreateOptions {
  /** Called once the user is ready to start the connection (after sharing the code). */
  onStart: (code: string) => void;
  onCancel: () => void;
  /** Optional: reuse an existing code (e.g. from URL deep link). */
  initialCode?: string;
}

export interface LobbyCreate {
  el: HTMLElement;
  destroy: () => void;
}

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
      <div class="screen-eyebrow">Crea partita</div>
      <h2 class="screen-title screen-title-sm" id="lobby-create-title">Condividi il codice</h2>
      <p class="screen-sub">Mandalo all'altro giocatore. Quando si collega la partita inizia.</p>
      <div class="lobby-code" data-code>${code}</div>
      <div class="lobby-link-row">
        <input type="text" class="lobby-link-input" value="${link}" readonly aria-label="Link partita" />
        <button type="button" class="btn btn-ghost btn-sm" data-copy-link>Copia link</button>
      </div>
      <div class="lobby-helper">
        Niente account, niente server di gioco — la connessione è diretta tra i due browser via WebRTC.
      </div>
      <div class="screen-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Annulla</button>
        <button type="button" class="btn btn-primary" data-start>In attesa…</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const startBtn = overlay.querySelector<HTMLButtonElement>('[data-start]')!;
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('[data-cancel]')!;
  const copyBtn = overlay.querySelector<HTMLButtonElement>('[data-copy-link]')!;
  const linkInput = overlay.querySelector<HTMLInputElement>('.lobby-link-input')!;

  // Auto-start the connection right away — Trystero begins listening for the
  // peer immediately, the visible state in this screen is "waiting for peer".
  // Hitting the button is a no-op but kept for accessibility / explicit intent.
  startBtn.disabled = true;
  startBtn.classList.add('is-loading');
  opts.onStart(code);

  copyBtn.addEventListener('click', () => {
    void copyToClipboard(linkInput.value);
    copyBtn.textContent = 'Copiato!';
    window.setTimeout(() => {
      copyBtn.textContent = 'Copia link';
    }, 1500);
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

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older Safari / file:// fallback
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
