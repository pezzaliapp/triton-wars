/**
 * Tiny overlay shown during an online match: opponent nick, peer status
 * (connected / waiting / lost), and a forfeit button. Sits in a corner
 * and never steals focus from the targeting controller.
 */

export type PeerStatus = 'connected' | 'unresponsive' | 'gone';

export interface OnlineHudOptions {
  opponentNick: string;
  onForfeit: () => void;
}

export interface OnlineHud {
  el: HTMLElement;
  setOpponentNick: (nick: string) => void;
  setStatus: (status: PeerStatus, message?: string) => void;
  destroy: () => void;
}

const STATUS_CLASSES: Record<PeerStatus, string> = {
  connected: 'is-connected',
  unresponsive: 'is-unresponsive',
  gone: 'is-gone',
};

const STATUS_LABELS: Record<PeerStatus, string> = {
  connected: 'connesso',
  unresponsive: 'in attesa…',
  gone: 'disconnesso',
};

export function createOnlineHud(opts: OnlineHudOptions): OnlineHud {
  const root = document.createElement('div');
  root.className = 'online-hud is-connected';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `
    <div class="online-hud-meta">
      <span class="online-hud-dot"></span>
      <span class="online-hud-nick" data-nick></span>
      <span class="online-hud-status" data-status></span>
    </div>
    <button type="button" class="btn btn-danger btn-sm" data-forfeit>Abbandona</button>
  `;

  const nickEl = root.querySelector<HTMLSpanElement>('[data-nick]')!;
  const statusEl = root.querySelector<HTMLSpanElement>('[data-status]')!;
  const forfeitBtn = root.querySelector<HTMLButtonElement>('[data-forfeit]')!;

  setOpponentNick(opts.opponentNick);
  setStatus('connected');

  forfeitBtn.addEventListener('click', () => opts.onForfeit());

  function setOpponentNick(nick: string): void {
    nickEl.textContent = nick;
  }

  function setStatus(status: PeerStatus, message?: string): void {
    root.classList.remove('is-connected', 'is-unresponsive', 'is-gone');
    root.classList.add(STATUS_CLASSES[status]);
    statusEl.textContent = message ?? STATUS_LABELS[status];
  }

  function destroy(): void {
    root.remove();
  }

  return { el: root, setOpponentNick, setStatus, destroy };
}
