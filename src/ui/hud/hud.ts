import type { GameState } from '../../game/state/game-state';
import { createTurnBanner, type TurnBanner } from './turn-banner';
import { createUnitTray, type UnitTray } from './unit-tray';
import { createLogView, type LogView } from './log';
import { createLayerPicker, type LayerPicker } from './layer-picker';

export interface HudCallbacks {
  onRotate: () => void;
  onConfirm: () => void;
  onLayerChange: (layer: number) => void;
  onAudioToggle: (muted: boolean) => void;
}

export interface Hud {
  el: HTMLElement;
  banner: TurnBanner;
  tray: UnitTray;
  log: LogView;
  layerPicker: LayerPicker;
  refresh: () => void;
  showLayerPicker: (visible: boolean) => void;
  showGameOver: (winner: 'human' | 'ai') => void;
}

export function createHud(state: GameState, callbacks: HudCallbacks): Hud {
  const root = document.createElement('div');
  root.className = 'hud-root';

  const banner = createTurnBanner(state);
  const tray = createUnitTray(state, {
    onRotate: callbacks.onRotate,
    onConfirm: callbacks.onConfirm,
  });
  const log = createLogView(state.log);
  const layerPicker = createLayerPicker({
    layers: state.dims.layers,
    initial: 2,
    onChange: callbacks.onLayerChange,
  });

  const audioBtn = document.createElement('button');
  audioBtn.type = 'button';
  audioBtn.className = 'btn btn-icon';
  audioBtn.dataset.muted = 'false';
  audioBtn.setAttribute('aria-label', 'Disattiva audio');
  audioBtn.innerHTML = '🔊';
  audioBtn.addEventListener('click', () => {
    const next = audioBtn.dataset.muted !== 'true';
    audioBtn.dataset.muted = String(next);
    audioBtn.innerHTML = next ? '🔇' : '🔊';
    audioBtn.setAttribute('aria-label', next ? 'Riattiva audio' : 'Disattiva audio');
    callbacks.onAudioToggle(next);
  });

  const topRow = document.createElement('div');
  topRow.className = 'hud-top-row';
  topRow.appendChild(banner.el);
  topRow.appendChild(audioBtn);

  const sidePanel = document.createElement('aside');
  sidePanel.className = 'hud-side';
  sidePanel.appendChild(tray.el);
  sidePanel.appendChild(log.el);

  const bottomBar = document.createElement('div');
  bottomBar.className = 'hud-bottom-bar';
  bottomBar.appendChild(layerPicker.el);

  root.appendChild(topRow);
  root.appendChild(sidePanel);
  root.appendChild(bottomBar);

  layerPicker.show(false);

  const refresh = (): void => {
    banner.update();
    tray.update();
  };

  const showGameOver = (winner: 'human' | 'ai'): void => {
    const overlay = document.createElement('div');
    overlay.className = 'screen screen-over';
    overlay.innerHTML = `
      <div class="screen-card">
        <div class="screen-eyebrow">${winner === 'human' ? 'Match concluso' : 'Match concluso'}</div>
        <h1 class="screen-title">${winner === 'human' ? 'Vittoria' : 'Sconfitta'}</h1>
        <p class="screen-sub">${winner === 'human' ? 'La flotta nemica giace sui fondali.' : 'La tua flotta è stata annientata.'}</p>
        <button type="button" class="btn btn-primary" data-restart>Nuova partita</button>
      </div>
    `;
    overlay.querySelector<HTMLButtonElement>('[data-restart]')?.addEventListener('click', () => {
      window.location.reload();
    });
    document.body.appendChild(overlay);
  };

  return {
    el: root,
    banner,
    tray,
    log,
    layerPicker,
    refresh,
    showLayerPicker: (v) => layerPicker.show(v),
    showGameOver,
  };
}
