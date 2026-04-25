import type { GameState } from '../../game/state/game-state';

export interface TurnBanner {
  el: HTMLElement;
  update: () => void;
}

export function createTurnBanner(state: GameState): TurnBanner {
  const el = document.createElement('div');
  el.className = 'turn-banner';
  el.innerHTML = '<span class="turn-label"></span><span class="turn-detail"></span>';

  const label = el.querySelector<HTMLSpanElement>('.turn-label')!;
  const detail = el.querySelector<HTMLSpanElement>('.turn-detail')!;

  const update = (): void => {
    if (state.phase === 'placing') {
      el.dataset.kind = 'placing';
      label.textContent = 'Schiera la flotta';
      const next = state.nextUnitToPlace();
      if (next) {
        const progress = state.placementProgress;
        detail.textContent = `${progress.placedCount + 1} / ${progress.fleetSize}`;
      } else {
        detail.textContent = 'Pronto';
      }
    } else if (state.phase === 'playing') {
      if (state.turn === 'human') {
        el.dataset.kind = 'human';
        label.textContent = 'Tuo turno';
        detail.textContent = 'Bersaglio nemico';
      } else {
        el.dataset.kind = 'ai';
        label.textContent = 'Turno avversario';
        detail.textContent = 'Difenditi';
      }
    } else {
      el.dataset.kind = state.winner === 'human' ? 'win' : 'loss';
      label.textContent = state.winner === 'human' ? 'Vittoria' : 'Sconfitta';
      detail.textContent = state.winner === 'human' ? 'Flotta nemica affondata' : 'Flotta perduta';
    }
  };

  update();
  return { el, update };
}
