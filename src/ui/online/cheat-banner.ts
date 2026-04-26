import { trapFocus } from '../menu/focus-trap';
import type { VerificationOutcome } from '../../net/commitment';

export interface CheatBannerOptions {
  outcome: VerificationOutcome;
  onClose: () => void;
}

export function showCheatBanner(opts: CheatBannerOptions): void {
  const { outcome } = opts;
  const isOk = outcome.reason === 'ok';

  const overlay = document.createElement('div');
  overlay.className = 'screen screen-confirm';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'cheat-banner-title');
  overlay.innerHTML = `
    <div class="screen-card screen-card-narrow">
      <div class="screen-eyebrow">${isOk ? 'Verifica integrità' : 'Anti-cheat'}</div>
      <h2 class="screen-title screen-title-sm" id="cheat-banner-title">
        ${isOk ? 'Partita valida' : 'Partita non valida'}
      </h2>
      <p class="screen-sub">${formatReason(outcome)}</p>
      <div class="screen-actions">
        <button type="button" class="btn btn-primary" data-close>Chiudi</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector<HTMLButtonElement>('[data-close]')!;
  const trap = trapFocus(overlay, close);
  closeBtn.addEventListener('click', close);

  function close(): void {
    trap.release();
    overlay.classList.add('screen-leave');
    window.setTimeout(() => overlay.remove(), 220);
    opts.onClose();
  }
}

function formatReason(outcome: VerificationOutcome): string {
  switch (outcome.reason) {
    case 'ok':
      return 'La flotta rivelata corrisponde all\'impegno iniziale e tutte le risposte ricevute sono coerenti.';
    case 'commitment-mismatch':
      return 'L\'avversario ha rivelato una flotta diversa da quella firmata all\'inizio della partita.';
    case 'shot-result-tampered':
      return `Risposta incoerente al colpo #${outcome.seq}: dichiarato "${outcome.declaredResult}" ma sulla flotta rivelata sarebbe stato "${outcome.expectedResult}".`;
  }
}
