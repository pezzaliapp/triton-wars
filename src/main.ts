import './styles/main.css';

import { createScene } from './game/engine/scene';
import { createOrbitControls } from './game/engine/controls';
import { createVolumetricGrid, GRID_DIMENSIONS } from './game/grid/volumetric-grid';
import { registerServiceWorker } from './pwa/sw-registration';

import { AppState, type Difficulty, isInMatch } from './app/app-state';
import { MatchController } from './app/match-controller';
import { createMainMenu, type MainMenu } from './ui/menu/main-menu';
import { showHowToPlay, hasSeenHowTo } from './ui/menu/how-to-play';
import { showExitConfirm } from './ui/menu/exit-confirm';
import { setMuted } from './game/audio/sfx';

const canvasEl = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvasEl) throw new Error('canvas #scene not found');
const canvas: HTMLCanvasElement = canvasEl;

const sceneCtx = createScene(canvas);
sceneCtx.scene.add(createVolumetricGrid(GRID_DIMENSIONS));
const orbit = createOrbitControls(sceneCtx.camera, canvas);

const tick = (): void => {
  orbit.update();
  sceneCtx.render();
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

registerServiceWorker();

// ---- App orchestration ---------------------------------------------------

const app = new AppState();
let menu: MainMenu | null = null;
let match: MatchController | null = null;
let muted = false;

function showMenu(): void {
  if (match) {
    match.destroy();
    match = null;
  }
  if (menu) {
    menu.destroy();
    menu = null;
  }
  app.exitToMenu();
  menu = createMainMenu({
    initialDifficulty: app.difficulty,
    onPlayVsComputer: (d) => startMatch(d),
    onHowTo: () => showHowToPlay({ onClose: () => {} }),
  });
  document.body.appendChild(menu.el);
}

function startMatch(difficulty: Difficulty): void {
  if (menu) {
    menu.destroy();
    menu = null;
  }
  app.startMatch(difficulty);
  setMuted(muted);
  match = new MatchController({
    scene: sceneCtx.scene,
    camera: sceneCtx.camera,
    canvas,
    hudHost: document.body,
    difficulty,
    initialMuted: muted,
    onPlayBegan: () => app.beginPlay(),
    onExitRequest: handleExitRequest,
    onReturnToMenu: showMenu,
    onGameOver: (winner) => app.endMatch(winner),
    onMutedChange: (next) => {
      muted = next;
    },
  });
}

function handleExitRequest(): void {
  if (!isInMatch(app.mode)) return;
  showExitConfirm({
    onConfirm: () => showMenu(),
    onCancel: () => {},
  });
}

// Boot
showMenu();
if (!hasSeenHowTo()) {
  showHowToPlay({ onClose: () => {}, preferSuppressOnFirstView: true });
}
