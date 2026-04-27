import type { GameState } from '../../game/state/game-state';

export interface TurnBanner {
  el: HTMLElement;
  update: () => void;
}

/**
 * Renders the dynamic title shown in the top bar. Uses the same data
 * model as before but emits a compact one-line element with two
 * pieces (label + detail) so it fits the 48px chrome on mobile.
 */
export function createTurnBanner(state: GameState): TurnBanner {
  const el = document.createElement('div');
  el.className = 'top-bar-title';
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<span class="top-bar-label" data-label></span><span class="top-bar-detail" data-detail></span>';

  const label = el.querySelector<HTMLSpanElement>('[data-label]')!;
  const detail = el.querySelector<HTMLSpanElement>('[data-detail]')!;

  const update = (): void => {
    if (state.phase === 'placing') {
      el.dataset.kind = 'placing';
      label.textContent = 'Schiera la flotta';
      const next = state.nextUnitToPlace();
      const progress = state.placementProgress;
      detail.textContent = next
        ? `${progress.placedCount + 1} / ${progress.fleetSize}`
        : 'Pronto';
    } else if (state.phase === 'playing') {
      if (state.turn === 'human') {
        el.dataset.kind = 'human';
        label.textContent = 'Tuo turno';
        detail.textContent = 'Bersaglio nemico';
      } else {
        el.dataset.kind = 'ai';
        label.textContent = "Turno avversario";
        detail.textContent = 'Difenditi';
      }
    } else {
      el.dataset.kind = state.winner === 'human' ? 'win' : 'loss';
      label.textContent = state.winner === 'human' ? 'Vittoria' : 'Sconfitta';
      detail.textContent =
        state.winner === 'human' ? 'Flotta nemica affondata' : 'Flotta perduta';
    }
  };

  update();
  return { el, update };
}
