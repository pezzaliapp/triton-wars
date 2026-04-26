import { trapFocus } from '../menu/focus-trap';
import { isValidRoomCode, normalizeRoomCode } from './room-code';

export interface LobbyJoinOptions {
  onJoin: (code: string) => void;
  onCancel: () => void;
}

export interface LobbyJoin {
  el: HTMLElement;
  destroy: () => void;
}

export function showLobbyJoin(opts: LobbyJoinOptions): LobbyJoin {
  const overlay = document.createElement('div');
  overlay.className = 'screen screen-lobby';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'lobby-join-title');
  overlay.innerHTML = `
    <div class="screen-card screen-card-narrow">
      <div class="screen-eyebrow">Unisciti</div>
      <h2 class="screen-title screen-title-sm" id="lobby-join-title">Inserisci il codice</h2>
      <p class="screen-sub">Te lo ha mandato l'altro giocatore. Formato: TRITON-XXXX-XXXX</p>
      <input
        type="text"
        class="lobby-code-input"
        placeholder="TRITON-XXXX-XXXX"
        autocomplete="off"
        spellcheck="false"
        aria-label="Codice partita"
      />
      <p class="lobby-error" data-error hidden>Codice non valido.</p>
      <div class="screen-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Annulla</button>
        <button type="button" class="btn btn-primary" data-join disabled>Connetti</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector<HTMLInputElement>('.lobby-code-input')!;
  const joinBtn = overlay.querySelector<HTMLButtonElement>('[data-join]')!;
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('[data-cancel]')!;
  const error = overlay.querySelector<HTMLParagraphElement>('[data-error]')!;

  const validate = (): string | null => {
    const code = normalizeRoomCode(input.value);
    return isValidRoomCode(code) ? code : null;
  };

  input.addEventListener('input', () => {
    const code = validate();
    joinBtn.disabled = code === null;
    error.hidden = true;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !joinBtn.disabled) {
      submit();
    }
  });

  joinBtn.addEventListener('click', submit);

  function submit(): void {
    const code = validate();
    if (!code) {
      error.hidden = false;
      return;
    }
    close();
    opts.onJoin(code);
  }

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
