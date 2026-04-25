import type { GameState } from '../../game/state/game-state';
import { createTurnBanner, type TurnBanner } from './turn-banner';
import { createUnitTray, type UnitTray } from './unit-tray';
import { createLogView, type LogView } from './log';
import { createLayerPicker, type LayerPicker } from './layer-picker';
import { createLegend } from './legend';
import { createLayerToast, type LayerToast } from './layer-toast';
import { createExitButton, type ExitButton } from './exit-button';

export interface HudCallbacks {
  initialMuted?: boolean;
  onRotate: () => void;
  onConfirm: () => void;
  onLayerChange: (layer: number) => void;
  onAudioToggle: (muted: boolean) => void;
  onExitRequest: () => void;
  onReturnToMenu: () => void;
}

export interface Hud {
  el: HTMLElement;
  banner: TurnBanner;
  tray: UnitTray;
  log: LogView;
  layerPicker: LayerPicker;
  layerToast: LayerToast;
  exitButton: ExitButton;
  refresh: () => void;
  showLayerPicker: (visible: boolean) => void;
  showExitButton: (visible: boolean) => void;
  showGameOver: (winner: 'human' | 'ai') => void;
  destroy: () => void;
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

  const layerToast = createLayerToast();
  const layerPicker = createLayerPicker({
    layers: state.dims.layers,
    initial: 2,
    onChange: (layer) => {
      callbacks.onLayerChange(layer);
      layerToast.show(layer);
    },
  });

  const legend = createLegend();
  const exitButton = createExitButton(() => callbacks.onExitRequest());

  // Audio button: 🔊 (on) / 🔇 (off)
  const audioBtn = document.createElement('button');
  audioBtn.type = 'button';
  audioBtn.className = 'btn btn-icon';
  let muted = callbacks.initialMuted ?? false;
  const setAudioVisuals = (): void => {
    audioBtn.dataset.muted = String(muted);
    audioBtn.textContent = muted ? '🔇' : '🔊';
    audioBtn.setAttribute('aria-label', muted ? 'Riattiva audio' : 'Disattiva audio');
    audioBtn.setAttribute('aria-pressed', String(muted));
  };
  setAudioVisuals();
  audioBtn.addEventListener('click', () => {
    muted = !muted;
    setAudioVisuals();
    callbacks.onAudioToggle(muted);
  });

  const topRow = document.createElement('div');
  topRow.className = 'hud-top-row';
  topRow.appendChild(exitButton.el);
  topRow.appendChild(banner.el);
  topRow.appendChild(audioBtn);

  const sidePanel = document.createElement('aside');
  sidePanel.className = 'hud-side';
  sidePanel.appendChild(tray.el);
  sidePanel.appendChild(legend.el);
  sidePanel.appendChild(log.el);

  const bottomBar = document.createElement('div');
  bottomBar.className = 'hud-bottom-bar';
  bottomBar.appendChild(layerPicker.el);

  root.appendChild(topRow);
  root.appendChild(sidePanel);
  root.appendChild(bottomBar);
  root.appendChild(layerToast.el);

  layerPicker.show(false);
  exitButton.show(false);

  let gameOverOverlay: HTMLDivElement | null = null;

  const refresh = (): void => {
    banner.update();
    tray.update();
  };

  const showGameOver = (winner: 'human' | 'ai'): void => {
    if (gameOverOverlay) return;
    const overlay = document.createElement('div');
    gameOverOverlay = overlay;
    overlay.className = 'screen screen-over';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'gameover-title');
    overlay.innerHTML = `
      <div class="screen-card">
        <div class="screen-eyebrow">Match concluso</div>
        <h2 class="screen-title" id="gameover-title">${winner === 'human' ? 'Vittoria' : 'Sconfitta'}</h2>
        <p class="screen-sub">${winner === 'human' ? 'La flotta nemica giace sui fondali.' : 'La tua flotta è stata annientata.'}</p>
        <div class="screen-actions">
          <button type="button" class="btn btn-primary" data-menu>Torna al menu</button>
        </div>
      </div>
    `;
    overlay.querySelector<HTMLButtonElement>('[data-menu]')?.addEventListener('click', () => {
      callbacks.onReturnToMenu();
    });
    document.body.appendChild(overlay);
  };

  const destroy = (): void => {
    log.detach();
    if (gameOverOverlay) {
      gameOverOverlay.remove();
      gameOverOverlay = null;
    }
    root.remove();
  };

  return {
    el: root,
    banner,
    tray,
    log,
    layerPicker,
    layerToast,
    exitButton,
    refresh,
    showLayerPicker: (v) => layerPicker.show(v),
    showExitButton: (v) => exitButton.show(v),
    showGameOver,
    destroy,
  };
}
