import { trapFocus } from '../menu/focus-trap';

export type DisconnectedReason =
  | 'opponent-left-before-play'
  | 'opponent-forfeited-before-play'
  | 'host-confirm-timeout'
  | 'rejected-room-full'
  | 'rejected-room-pending'
  | 'standby-expired';

export interface DisconnectedBannerOptions {
  reason: DisconnectedReason;
  onReturnToMenu: () => void;
}

const TITLES: Record<DisconnectedReason, string> = {
  'opponent-left-before-play': 'Avversario non disponibile',
  'opponent-forfeited-before-play': 'Avversario non disponibile',
  'host-confirm-timeout': 'L\'host non ha confermato l\'invito',
  'rejected-room-full': 'Stanza piena',
  'rejected-room-pending': 'Stanza occupata',
  'standby-expired': 'L\'host non ha avviato la partita',
};

const BODIES: Record<DisconnectedReason, string> = {
  'opponent-left-before-play':
    'L\'altro pilota se n\'è andato prima che la partita iniziasse. Torna al menu e riprova.',
  'opponent-forfeited-before-play':
    'L\'altro pilota ha lasciato la stanza prima del primo colpo. Nessun vincitore — torna al menu.',
  'host-confirm-timeout':
    'L\'host non ha avviato la partita entro 30 secondi. Probabilmente è andato via — torna al menu e riprova.',
  'rejected-room-full':
    'La partita è già in corso e la stanza è chiusa. Chiedi un nuovo codice all\'host.',
  'rejected-room-pending':
    'L\'host sta valutando un altro giocatore. Riprova fra qualche secondo o chiedi un nuovo codice.',
  'standby-expired':
    'L\'host ti ha lasciato in attesa troppo a lungo. Torna al menu e riprova.',
};

export function showDisconnectedBanner(opts: DisconnectedBannerOptions): { destroy: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'screen screen-confirm';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'disconnected-title');
  overlay.innerHTML = `
    <div class="screen-card screen-card-narrow">
      <div class="screen-eyebrow">Connessione</div>
      <h2 class="screen-title screen-title-sm" id="disconnected-title">${TITLES[opts.reason]}</h2>
      <p class="screen-sub">${BODIES[opts.reason]}</p>
      <div class="screen-actions">
        <button type="button" class="btn btn-primary" data-return>Torna al menu</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const trap = trapFocus(overlay, close);
  overlay.querySelector<HTMLButtonElement>('[data-return]')!.addEventListener('click', close);

  function close(): void {
    trap.release();
    overlay.classList.add('screen-leave');
    window.setTimeout(() => overlay.remove(), 220);
    opts.onReturnToMenu();
  }

  return { destroy: close };
}
