import { Group, type PerspectiveCamera, type Scene } from 'three';

import { GameState } from '../game/state/game-state';
import { RecruitAi } from '../game/ai/recruit';
import { PlacementController } from '../game/input/placement-controller';
import { TargetingController } from '../game/input/targeting-controller';
import { createUnitMesh } from '../game/render/unit-mesh';
import { createHitMarker } from '../game/render/hit-marker';
import { createHud, type Hud } from '../ui/hud/hud';
import { setMuted, unlockAudio } from '../game/audio/sfx';
import { playForLogEntry } from '../game/audio/sfx-events';
import type { AttackOutcome } from '../game/rules/attack';
import type { Difficulty } from './app-state';

export interface MatchOptions {
  scene: Scene;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  hudHost: HTMLElement;
  difficulty: Difficulty;
  initialMuted: boolean;
  onExitRequest: () => void;
  onReturnToMenu: () => void;
  onPlayBegan: () => void;
  onGameOver: (winner: 'human' | 'ai') => void;
  onMutedChange: (muted: boolean) => void;
}

const AI_TURN_DELAY = 750;
const AI_RETRY_DELAY = 250;

/**
 * Owns a single match against the AI. Construction wires every subsystem
 * (state, scene meshes, HUD, controllers, audio); destroy() reverses every
 * side effect so the next match starts from a clean slate.
 */
export class MatchController {
  readonly state: GameState;
  readonly hud: Hud;

  private readonly ai: RecruitAi;
  private readonly playerUnitsGroup = new Group();
  private readonly aiUnitsGroup = new Group();
  private readonly playerMarkers = new Group();
  private readonly aiMarkers = new Group();

  private readonly placement: PlacementController;
  private readonly targeting: TargetingController;

  private readonly unsubscribers: Array<() => void> = [];
  private aiTurnTimer: number | null = null;
  private destroyed = false;

  constructor(private readonly opts: MatchOptions) {
    if (opts.difficulty !== 'recluta') {
      // UI prevents this; throwing only triggers on programmer error.
      throw new Error(`difficulty ${opts.difficulty} is not yet implemented`);
    }

    this.state = new GameState();
    this.ai = new RecruitAi(this.state.dims);

    // Auto-place AI fleet
    const aiPlacements = this.ai.autoPlace(this.state.aiGrid);
    for (const p of aiPlacements) {
      this.state.placeAiUnit(p.typeId, p.anchor, p.orientation);
    }

    // Scene groups
    this.playerUnitsGroup.name = 'player-units';
    this.aiUnitsGroup.name = 'ai-units';
    this.aiUnitsGroup.visible = false;
    this.playerMarkers.name = 'player-markers';
    this.aiMarkers.name = 'ai-markers';
    opts.scene.add(this.playerUnitsGroup, this.aiUnitsGroup, this.playerMarkers, this.aiMarkers);

    // HUD
    this.hud = createHud(this.state, {
      initialMuted: opts.initialMuted,
      onRotate: () => this.placement.rotate(),
      onConfirm: () => this.beginPlay(),
      onLayerChange: (layer) => this.targeting.setLayer(layer),
      onAudioToggle: (muted) => {
        setMuted(muted);
        opts.onMutedChange(muted);
      },
      onExitRequest: () => opts.onExitRequest(),
      onReturnToMenu: () => opts.onReturnToMenu(),
    });
    opts.hudHost.appendChild(this.hud.el);

    // Audio: tie SFX to log entries
    this.unsubscribers.push(
      this.state.log.subscribe((entry) => playForLogEntry(entry)),
    );

    // Re-render player units + HUD on state change
    this.unsubscribers.push(
      this.state.subscribe(() => {
        this.rebuildPlayerUnits();
        this.hud.refresh();
      }),
    );

    // Input controllers
    this.placement = new PlacementController(
      opts.canvas,
      opts.camera,
      this.state,
      opts.scene,
      this.state.dims,
    );
    this.targeting = new TargetingController(
      opts.canvas,
      opts.camera,
      this.state,
      opts.scene,
      this.state.dims,
      {
        onFire: (layer, x, z) => this.handleHumanAttack(layer, x, z),
      },
    );

    // Initial mode: placing
    this.placement.enable();
    this.hud.showLayerPicker(false);
    this.hud.showExitButton(true);
    unlockAudio();
  }

  private beginPlay(): void {
    if (this.state.nextUnitToPlace() !== null) return;
    this.state.beginPlay();
    this.placement.disable();
    this.targeting.enable();
    this.hud.showLayerPicker(true);
    this.opts.onPlayBegan();
  }

  private handleHumanAttack(layer: number, x: number, z: number): void {
    const outcome = this.state.humanAttack(layer, x, z);
    if (!outcome || outcome.result === 'already') return;
    this.addAiMarker(outcome);
    if (this.state.phase === 'over') {
      this.targeting.disable();
      this.hud.showGameOver(this.state.winner ?? 'human');
      this.opts.onGameOver(this.state.winner ?? 'human');
    } else {
      this.aiTurnTimer = window.setTimeout(() => this.runAiTurn(), AI_TURN_DELAY);
    }
  }

  private runAiTurn = (): void => {
    this.aiTurnTimer = null;
    if (this.destroyed) return;
    if (this.state.phase !== 'playing' || this.state.turn !== 'ai') return;
    const target = this.ai.chooseTarget();
    if (!target) return;
    const outcome = this.state.aiAttack(target.layer, target.x, target.z);
    if (!outcome || outcome.result === 'already') {
      this.aiTurnTimer = window.setTimeout(this.runAiTurn, AI_RETRY_DELAY);
      return;
    }
    this.addPlayerMarker(outcome);
    this.ai.notifyResult(target, outcome.result);
    if ((this.state.phase as string) === 'over') {
      this.targeting.disable();
      this.hud.showGameOver(this.state.winner ?? 'ai');
      this.opts.onGameOver(this.state.winner ?? 'ai');
    }
  };

  private addAiMarker(outcome: AttackOutcome): void {
    if (outcome.result === 'already') return;
    this.aiMarkers.add(
      createHitMarker(this.state.dims, outcome.cell.layer, outcome.cell.x, outcome.cell.z, outcome.result),
    );
    for (const c of outcome.cascades) {
      if (c.result === 'already') continue;
      this.aiMarkers.add(
        createHitMarker(this.state.dims, c.cell.layer, c.cell.x, c.cell.z, c.result),
      );
    }
    if (outcome.result === 'sunk' || outcome.cascades.some((c) => c.result === 'sunk')) {
      this.rebuildAiUnits();
      this.aiUnitsGroup.visible = true;
    }
  }

  private addPlayerMarker(outcome: AttackOutcome): void {
    if (outcome.result === 'already') return;
    this.playerMarkers.add(
      createHitMarker(this.state.dims, outcome.cell.layer, outcome.cell.x, outcome.cell.z, outcome.result),
    );
    for (const c of outcome.cascades) {
      if (c.result === 'already') continue;
      this.playerMarkers.add(
        createHitMarker(this.state.dims, c.cell.layer, c.cell.x, c.cell.z, c.result),
      );
    }
  }

  private rebuildPlayerUnits(): void {
    disposeChildren(this.playerUnitsGroup);
    for (const u of this.state.playerGrid.units) {
      this.playerUnitsGroup.add(createUnitMesh(u, this.state.dims));
    }
  }

  private rebuildAiUnits(): void {
    disposeChildren(this.aiUnitsGroup);
    for (const u of this.state.aiGrid.units) {
      if (u.sunk) {
        this.aiUnitsGroup.add(createUnitMesh(u, this.state.dims));
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.aiTurnTimer !== null) {
      window.clearTimeout(this.aiTurnTimer);
      this.aiTurnTimer = null;
    }

    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;

    this.placement.destroy();
    this.targeting.destroy();

    disposeChildren(this.playerUnitsGroup);
    disposeChildren(this.aiUnitsGroup);
    disposeChildren(this.playerMarkers);
    disposeChildren(this.aiMarkers);
    this.opts.scene.remove(this.playerUnitsGroup, this.aiUnitsGroup, this.playerMarkers, this.aiMarkers);

    this.hud.destroy();
  }
}

function disposeChildren(group: Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    if (!child) break;
    group.remove(child);
    child.traverse((obj) => {
      const mesh = obj as { geometry?: { dispose: () => void }; material?: { dispose: () => void } | Array<{ dispose: () => void }> };
      mesh.geometry?.dispose?.();
      const m = mesh.material;
      if (Array.isArray(m)) {
        for (const mat of m) mat.dispose?.();
      } else {
        m?.dispose?.();
      }
    });
  }
}
