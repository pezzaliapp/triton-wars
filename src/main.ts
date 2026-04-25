import './styles/main.css';
import { Group } from 'three';

import { createScene } from './game/engine/scene';
import { createOrbitControls } from './game/engine/controls';
import { createVolumetricGrid, GRID_DIMENSIONS } from './game/grid/volumetric-grid';
import { registerServiceWorker } from './pwa/sw-registration';

import { GameState } from './game/state/game-state';
import { RecruitAi } from './game/ai/recruit';
import { PlacementController } from './game/input/placement-controller';
import { TargetingController } from './game/input/targeting-controller';
import { createUnitMesh } from './game/render/unit-mesh';
import { createHitMarker } from './game/render/hit-marker';
import { createHud } from './ui/hud/hud';
import { createStartScreen } from './ui/menu/start-screen';
import { setMuted, unlockAudio } from './game/audio/sfx';
import { playForLogEntry } from './game/audio/sfx-events';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('canvas #scene not found');

const sceneCtx = createScene(canvas);
const grid = createVolumetricGrid(GRID_DIMENSIONS);
sceneCtx.scene.add(grid);

const orbit = createOrbitControls(sceneCtx.camera, canvas);

const tick = (): void => {
  orbit.update();
  sceneCtx.render();
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

registerServiceWorker();

// ---- Game wiring ---------------------------------------------------------

const state = new GameState();
const ai = new RecruitAi(state.dims);

// auto-place AI fleet
const aiPlacements = ai.autoPlace(state.aiGrid);
for (const p of aiPlacements) {
  state.placeAiUnit(p.typeId, p.anchor, p.orientation);
}

// scene groups for live meshes
const playerUnitsGroup = new Group();
playerUnitsGroup.name = 'player-units';
sceneCtx.scene.add(playerUnitsGroup);

const aiUnitsGroup = new Group();
aiUnitsGroup.name = 'ai-units';
aiUnitsGroup.visible = false; // hidden during play (fog of war)
sceneCtx.scene.add(aiUnitsGroup);

const playerMarkers = new Group();
playerMarkers.name = 'player-markers';
sceneCtx.scene.add(playerMarkers);

const aiMarkers = new Group();
aiMarkers.name = 'ai-markers';
sceneCtx.scene.add(aiMarkers);

// HUD
const hud = createHud(state, {
  onRotate: () => placement.rotate(),
  onConfirm: () => beginPlay(),
  onLayerChange: (layer) => targeting.setLayer(layer),
  onAudioToggle: (muted) => setMuted(muted),
});
document.body.appendChild(hud.el);

// SFX wiring
state.log.subscribe((entry) => {
  playForLogEntry(entry);
});

// Re-render meshes on state change
state.subscribe(() => {
  rebuildPlayerUnits();
  hud.refresh();
});

function rebuildPlayerUnits(): void {
  while (playerUnitsGroup.children.length > 0) {
    const c = playerUnitsGroup.children[0];
    if (!c) break;
    playerUnitsGroup.remove(c);
  }
  for (const u of state.playerGrid.units) {
    playerUnitsGroup.add(createUnitMesh(u, state.dims));
  }
}

function rebuildAiUnits(): void {
  while (aiUnitsGroup.children.length > 0) {
    const c = aiUnitsGroup.children[0];
    if (!c) break;
    aiUnitsGroup.remove(c);
  }
  for (const u of state.aiGrid.units) {
    if (u.sunk) {
      aiUnitsGroup.add(createUnitMesh(u, state.dims));
    }
  }
}

// Input controllers
const placement = new PlacementController(canvas, sceneCtx.camera, state, sceneCtx.scene, state.dims);
const targeting = new TargetingController(canvas, sceneCtx.camera, state, sceneCtx.scene, state.dims, {
  onFire: (layer, x, z) => {
    const outcome = state.humanAttack(layer, x, z);
    if (!outcome || outcome.result === 'already') return;
    addAiMarker(outcome);
    if (state.phase === 'over') {
      hud.showGameOver(state.winner!);
      targeting.disable();
    } else {
      // schedule AI turn
      window.setTimeout(runAiTurn, 750);
    }
  },
});

function addAiMarker(outcome: { cell: { layer: number; x: number; z: number }; result: 'miss' | 'hit' | 'sunk' | 'already'; cascades: Array<{ cell: { layer: number; x: number; z: number }; result: 'miss' | 'hit' | 'sunk' | 'already' }> }): void {
  if (outcome.result === 'already') return;
  aiMarkers.add(createHitMarker(state.dims, outcome.cell.layer, outcome.cell.x, outcome.cell.z, outcome.result));
  for (const c of outcome.cascades) {
    if (c.result === 'already') continue;
    aiMarkers.add(createHitMarker(state.dims, c.cell.layer, c.cell.x, c.cell.z, c.result));
  }
  if (outcome.result === 'sunk' || outcome.cascades.some((c) => c.result === 'sunk')) {
    rebuildAiUnits();
    aiUnitsGroup.visible = true; // reveal sunken hulls
  }
}

function addPlayerMarker(outcome: { cell: { layer: number; x: number; z: number }; result: 'miss' | 'hit' | 'sunk' | 'already'; cascades: Array<{ cell: { layer: number; x: number; z: number }; result: 'miss' | 'hit' | 'sunk' | 'already' }> }): void {
  if (outcome.result === 'already') return;
  playerMarkers.add(createHitMarker(state.dims, outcome.cell.layer, outcome.cell.x, outcome.cell.z, outcome.result));
  for (const c of outcome.cascades) {
    if (c.result === 'already') continue;
    playerMarkers.add(createHitMarker(state.dims, c.cell.layer, c.cell.x, c.cell.z, c.result));
  }
}

function runAiTurn(): void {
  if (state.phase !== 'playing' || state.turn !== 'ai') return;
  const target = ai.chooseTarget();
  if (!target) return;
  const outcome = state.aiAttack(target.layer, target.x, target.z);
  if (!outcome || outcome.result === 'already') {
    window.setTimeout(runAiTurn, 250);
    return;
  }
  addPlayerMarker(outcome);
  ai.notifyResult(target, outcome.result);
  // Cascades may be from a player mine — we can ignore for AI hunt heuristic
  if ((state.phase as string) === 'over') {
    hud.showGameOver(state.winner!);
    targeting.disable();
  }
}

// Phase orchestration
function beginPlacement(): void {
  placement.enable();
  targeting.disable();
  hud.showLayerPicker(false);
  unlockAudio();
}

function beginPlay(): void {
  if (state.nextUnitToPlace() !== null) return;
  state.beginPlay();
  placement.disable();
  targeting.enable();
  hud.showLayerPicker(true);
}

// Start screen
const startScreen = createStartScreen({
  onStart: () => {
    beginPlacement();
  },
});
document.body.appendChild(startScreen);
