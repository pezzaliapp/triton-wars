import type { GameState } from '../../game/state/game-state';
import { createTurnBanner, type TurnBanner } from './turn-banner';
import { createUnitTray, type UnitTray } from './unit-tray';
import { createLogView, type LogView } from './log';
import { createLayerPicker, type LayerPicker } from './layer-picker';
import { createLegend } from './legend';
import { createLayerToast, type LayerToast } from './layer-toast';
import { createExitButton, type ExitButton } from './exit-button';
import { createBottomSheet, type BottomSheet } from './bottom-sheet';

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

/**
 * Mobile-first HUD layout.
 *
 * The HUD is a thin overlay over a full-bleed canvas. It never takes
 * grid space — every chrome element is `position: fixed` with explicit
 * `pointer-events: auto` so the rest of the screen passes touches
 * straight through to the canvas.
 *
 * Top bar (~48px): Esci · dynamic title · audio. Always visible.
 * Bottom-sheet (mobile) / side panel (desktop ≥1280px): the player's
 * fleet panel — current unit + Ruota/Conferma always visible (collapsed
 * area), fleet roster + collapsible legend & log in the body. Layer
 * picker (only during playing) sits as a floating pill above the
 * collapsed sheet, hidden when the sheet is mid/expanded.
 */
export function createHud(state: GameState, callbacks: HudCallbacks): Hud {
  const root = document.createElement('div');
  root.className = 'hud-overlay';

  // ---- top bar ------------------------------------------------------------
  const exitButton = createExitButton(() => callbacks.onExitRequest());
  const banner = createTurnBanner(state);

  const audioBtn = document.createElement('button');
  audioBtn.type = 'button';
  audioBtn.className = 'btn btn-icon btn-audio';
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

  const topBar = document.createElement('header');
  topBar.className = 'top-bar';
  topBar.appendChild(exitButton.el);
  topBar.appendChild(banner.el);
  topBar.appendChild(audioBtn);

  // ---- panel content (used in both bottom-sheet and side-panel) ----------
  const tray = createUnitTray(state, {
    onRotate: callbacks.onRotate,
    onConfirm: callbacks.onConfirm,
  });
  const legend = createLegend();
  const log = createLogView(state.log);

  const panelBody = document.createElement('div');
  panelBody.className = 'panel-body';
  panelBody.appendChild(tray.fleetEl);
  panelBody.appendChild(legend.el);
  panelBody.appendChild(log.el);

  const sheet: BottomSheet = createBottomSheet({
    summary: tray.summaryEl,
    body: panelBody,
    initialState: pickInitialSheetState(),
  });

  // ---- layer picker + toast ----------------------------------------------
  const layerToast = createLayerToast();
  const layerPicker = createLayerPicker({
    layers: state.dims.layers,
    initial: 2,
    onChange: (layer) => {
      callbacks.onLayerChange(layer);
      layerToast.show(layer);
    },
  });

  root.appendChild(topBar);
  root.appendChild(layerPicker.el);
  root.appendChild(sheet.el);
  root.appendChild(layerToast.el);

  layerPicker.show(false);
  exitButton.show(false);

  // ---- game-over overlay --------------------------------------------------
  let gameOverOverlay: HTMLDivElement | null = null;
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

  const refresh = (): void => {
    banner.update();
    tray.update();
  };

  const destroy = (): void => {
    log.detach();
    if (gameOverOverlay) {
      gameOverOverlay.remove();
      gameOverOverlay = null;
    }
    sheet.destroy();
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

/** Initial sheet state.
 *
 * On mobile we start collapsed so the layer-picker pill is visible above
 * the sheet (the picker is hidden at mid/expanded by CSS to free up
 * canvas room). The collapsed sheet still shows current unit + Ruota /
 * Conferma; the player drags up if they want the fleet roster.
 *
 * On desktop the CSS pins the sheet as a side panel so the state doesn't
 * really matter, but 'expanded' matches the visual at the media-query
 * boundary. */
function pickInitialSheetState(): 'collapsed' | 'mid' | 'expanded' {
  if (typeof window === 'undefined') return 'collapsed';
  const desktop = window.matchMedia('(min-width: 1280px)').matches;
  return desktop ? 'expanded' : 'collapsed';
}
