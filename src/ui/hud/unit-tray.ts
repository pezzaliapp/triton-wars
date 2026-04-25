import type { GameState } from '../../game/state/game-state';
import { fleetSummary } from '../../game/state/game-state';
import { UNIT_TYPES, type UnitTypeId } from '../../game/units/definitions';

export interface UnitTrayOptions {
  onRotate: () => void;
  onConfirm: () => void;
}

export interface UnitTray {
  el: HTMLElement;
  update: () => void;
}

export function createUnitTray(state: GameState, opts: UnitTrayOptions): UnitTray {
  const el = document.createElement('div');
  el.className = 'unit-tray';
  el.innerHTML = `
    <div class="tray-header">
      <span class="tray-title" data-title>Schieramento</span>
      <span class="tray-progress" data-progress></span>
    </div>
    <div class="tray-current" data-current></div>
    <div class="tray-actions">
      <button type="button" class="btn btn-ghost" data-rotate disabled>Ruota (R)</button>
      <button type="button" class="btn btn-primary" data-confirm disabled>Conferma flotta</button>
    </div>
    <ul class="tray-fleet" data-fleet></ul>
  `;

  const titleEl = el.querySelector<HTMLElement>('[data-title]')!;
  const progressEl = el.querySelector<HTMLElement>('[data-progress]')!;
  const currentEl = el.querySelector<HTMLElement>('[data-current]')!;
  const rotateBtn = el.querySelector<HTMLButtonElement>('[data-rotate]')!;
  const confirmBtn = el.querySelector<HTMLButtonElement>('[data-confirm]')!;
  const fleetEl = el.querySelector<HTMLUListElement>('[data-fleet]')!;

  rotateBtn.addEventListener('click', () => opts.onRotate());
  confirmBtn.addEventListener('click', () => opts.onConfirm());

  const update = (): void => {
    if (state.phase !== 'placing') {
      el.classList.add('tray-status');
      titleEl.textContent = 'La tua flotta';
      progressEl.textContent = '';
      currentEl.textContent = state.phase === 'playing' ? 'Resta in difesa.' : 'Match concluso.';
      rotateBtn.disabled = true;
      confirmBtn.disabled = true;
      renderFleetStatus();
      return;
    }
    el.classList.remove('tray-status');
    titleEl.textContent = 'Schieramento';
    const progress = state.placementProgress;
    progressEl.textContent = `${progress.placedCount} / ${progress.fleetSize}`;
    const next = state.nextUnitToPlace();
    if (next) {
      const t = UNIT_TYPES[next];
      currentEl.innerHTML = `
        <span class="tray-chip" style="--chip:${'#' + t.color.toString(16).padStart(6, '0')}"></span>
        <div>
          <div class="tray-current-name">${t.label}</div>
          <div class="tray-current-meta">${t.theatre} · ${t.length} cell${t.length === 1 ? 'a' : 'e'} · strato ${t.layer}</div>
        </div>
      `;
      rotateBtn.disabled = !t.rotatable;
      confirmBtn.disabled = true;
    } else {
      currentEl.textContent = 'Tutto schierato. Conferma per iniziare.';
      rotateBtn.disabled = true;
      confirmBtn.disabled = false;
    }
    renderFleetStatus();
  };

  function renderFleetStatus(): void {
    const summary = fleetSummary(state.playerGrid);
    fleetEl.innerHTML = '';
    const order: UnitTypeId[] = ['portaerei', 'incrociatore', 'cacciatorpediniere', 'caccia', 'bombardiere', 'drone', 'sommergibile', 'mina'];
    for (const id of order) {
      const stat = summary.get(id);
      if (!stat) continue;
      const t = UNIT_TYPES[id];
      const li = document.createElement('li');
      li.dataset.dead = stat.alive === 0 ? 'true' : 'false';
      li.innerHTML = `
        <span class="fleet-chip" style="--chip:${'#' + t.color.toString(16).padStart(6, '0')}"></span>
        <span class="fleet-name">${t.label}</span>
        <span class="fleet-count">${stat.alive}/${stat.total}</span>
      `;
      fleetEl.appendChild(li);
    }
  }

  update();
  return { el, update };
}
