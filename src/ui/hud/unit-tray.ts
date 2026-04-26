import type { GameState } from '../../game/state/game-state';
import { fleetSummary } from '../../game/state/game-state';
import { UNIT_TYPES, type UnitTypeId } from '../../game/units/definitions';

export interface UnitTrayOptions {
  onRotate: () => void;
  onConfirm: () => void;
}

export interface UnitTray {
  /** Always-visible row: current unit chip + Ruota + Conferma. Lives in
   * the bottom-sheet's summary area (mobile) or at the top of the side
   * panel (desktop). */
  summaryEl: HTMLElement;
  /** Fleet roster grid + placement progress. Lives in the bottom-sheet's
   * body (mobile, visible mid/expanded) or below the summary on desktop. */
  fleetEl: HTMLElement;
  update: () => void;
}

export function createUnitTray(state: GameState, opts: UnitTrayOptions): UnitTray {
  // ---- summary (always-visible row) --------------------------------------
  const summaryEl = document.createElement('div');
  summaryEl.className = 'tray-summary';
  summaryEl.innerHTML = `
    <div class="tray-summary-current" data-current></div>
    <div class="tray-summary-actions">
      <button type="button" class="btn btn-ghost btn-compact" data-rotate disabled>Ruota</button>
      <button type="button" class="btn btn-primary btn-compact" data-confirm disabled>Conferma</button>
    </div>
  `;
  const currentEl = summaryEl.querySelector<HTMLElement>('[data-current]')!;
  const rotateBtn = summaryEl.querySelector<HTMLButtonElement>('[data-rotate]')!;
  const confirmBtn = summaryEl.querySelector<HTMLButtonElement>('[data-confirm]')!;

  rotateBtn.addEventListener('click', () => opts.onRotate());
  confirmBtn.addEventListener('click', () => opts.onConfirm());

  // ---- fleet (mid/expanded) ----------------------------------------------
  const fleetEl = document.createElement('div');
  fleetEl.className = 'tray-fleet-section';
  fleetEl.innerHTML = `
    <div class="tray-fleet-header">
      <span class="tray-fleet-title" data-title>SCHIERAMENTO</span>
      <span class="tray-fleet-progress" data-progress></span>
    </div>
    <ul class="tray-fleet" data-fleet></ul>
  `;
  const titleEl = fleetEl.querySelector<HTMLElement>('[data-title]')!;
  const progressEl = fleetEl.querySelector<HTMLElement>('[data-progress]')!;
  const fleetListEl = fleetEl.querySelector<HTMLUListElement>('[data-fleet]')!;

  const update = (): void => {
    if (state.phase !== 'placing') {
      fleetEl.dataset.mode = 'status';
      titleEl.textContent = 'LA TUA FLOTTA';
      progressEl.textContent = '';
      currentEl.innerHTML =
        state.phase === 'playing'
          ? '<span class="tray-summary-hint">Resta in difesa.</span>'
          : '<span class="tray-summary-hint">Match concluso.</span>';
      rotateBtn.disabled = true;
      confirmBtn.disabled = true;
      renderFleetStatus();
      return;
    }
    fleetEl.dataset.mode = 'placing';
    titleEl.textContent = 'SCHIERAMENTO';
    const progress = state.placementProgress;
    progressEl.textContent = `${progress.placedCount} / ${progress.fleetSize}`;
    const next = state.nextUnitToPlace();
    if (next) {
      const t = UNIT_TYPES[next];
      currentEl.innerHTML = `
        <span class="tray-chip" style="--chip:${'#' + t.color.toString(16).padStart(6, '0')}"></span>
        <div class="tray-summary-meta">
          <div class="tray-summary-name">${t.label}</div>
          <div class="tray-summary-detail">${t.theatre} · ${t.length} cell${t.length === 1 ? 'a' : 'e'} · L${t.layer}</div>
        </div>
      `;
      rotateBtn.disabled = !t.rotatable;
      confirmBtn.disabled = true;
    } else {
      currentEl.innerHTML = '<span class="tray-summary-hint">Tutto schierato. Conferma per iniziare.</span>';
      rotateBtn.disabled = true;
      confirmBtn.disabled = false;
    }
    renderFleetStatus();
  };

  function renderFleetStatus(): void {
    const summary = fleetSummary(state.playerGrid);
    fleetListEl.innerHTML = '';
    const order: UnitTypeId[] = [
      'portaerei',
      'incrociatore',
      'cacciatorpediniere',
      'caccia',
      'bombardiere',
      'drone',
      'sommergibile',
      'mina',
    ];
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
      fleetListEl.appendChild(li);
    }
  }

  update();
  return { summaryEl, fleetEl, update };
}
