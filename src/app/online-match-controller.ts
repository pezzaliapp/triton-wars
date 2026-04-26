/**
 * OnlineMatchController — sibling of MatchController for the online flow.
 *
 * Reuses the rendering/audio/HUD pieces but swaps out the AI driver for
 * an OnlineOrchestrator. Lifecycle:
 *
 *   construct → placement (local, identical to singleplayer)
 *   commit()  → after the player presses Conferma flotta, we hash + send
 *   wait for opponentPlaced + own placed → orchestrator transitions to playing
 *   targeting fires → orchestrator.fireShot, await shotResult, render hit
 *   incoming opponentShot → resolve on playerGrid, send shotResult back
 *   game-over → reveal → verificationComplete → cheat banner if needed
 */
import { Group, type PerspectiveCamera, type Scene } from 'three';

import { GameState } from '../game/state/game-state';
import { PlacementController } from '../game/input/placement-controller';
import { TargetingController } from '../game/input/targeting-controller';
import { createUnitMesh } from '../game/render/unit-mesh';
import { createHitMarker } from '../game/render/hit-marker';
import { createHud, type Hud } from '../ui/hud/hud';
import { setMuted, unlockAudio } from '../game/audio/sfx';
import { playForLogEntry } from '../game/audio/sfx-events';
import { createOnlineHud, type OnlineHud } from '../ui/online/online-hud';
import { showCheatBanner } from '../ui/online/cheat-banner';
import type { OnlineOrchestrator, OrchestratorEvent } from '../net/online-orchestrator';
import type { VerificationOutcome } from '../net/commitment';
import type { Side } from '../net/protocol';
import { unitContainsCell } from '../game/units/unit';

export interface OnlineMatchOptions {
  scene: Scene;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  hudHost: HTMLElement;
  initialMuted: boolean;
  orchestrator: OnlineOrchestrator;
  side: Side;
  opponentNickHint: string;
  onPlayBegan: () => void;
  onExitRequest: () => void;
  onReturnToMenu: () => void;
  onGameOver: (winner: 'human' | 'ai') => void;
  onMutedChange: (muted: boolean) => void;
  onVerification: (outcome: VerificationOutcome) => void;
}

export class OnlineMatchController {
  readonly state: GameState;
  readonly hud: Hud;
  private readonly onlineHud: OnlineHud;

  private readonly playerUnitsGroup = new Group();
  private readonly aiUnitsGroup = new Group();
  private readonly playerMarkers = new Group();
  private readonly aiMarkers = new Group();

  private readonly placement: PlacementController;
  private readonly targeting: TargetingController;

  private readonly unsubscribers: Array<() => void> = [];
  private destroyed = false;
  private opponentPlacedAck = false;
  private ourFleetCommitted = false;
  private startedPlaying = false;
  private gameOverFired = false;
  private revealTriggered = false;

  constructor(private readonly opts: OnlineMatchOptions) {
    this.state = new GameState();

    // Scene groups
    this.playerUnitsGroup.name = 'player-units';
    this.aiUnitsGroup.name = 'ai-units';
    this.aiUnitsGroup.visible = false;
    this.playerMarkers.name = 'player-markers';
    this.aiMarkers.name = 'ai-markers';
    opts.scene.add(this.playerUnitsGroup, this.aiUnitsGroup, this.playerMarkers, this.aiMarkers);

    // Online HUD overlay (peer status + forfeit)
    this.onlineHud = createOnlineHud({
      opponentNick: opts.opponentNickHint,
      onForfeit: () => {
        opts.orchestrator.forfeit();
        opts.onReturnToMenu();
      },
    });
    opts.hudHost.appendChild(this.onlineHud.el);

    // Standard HUD
    this.hud = createHud(this.state, {
      initialMuted: opts.initialMuted,
      onRotate: () => this.placement.rotate(),
      onConfirm: () => void this.confirmFleet(),
      onLayerChange: (layer) => this.targeting.setLayer(layer),
      onAudioToggle: (muted) => {
        setMuted(muted);
        opts.onMutedChange(muted);
      },
      onExitRequest: () => opts.onExitRequest(),
      onReturnToMenu: () => opts.onReturnToMenu(),
    });
    opts.hudHost.appendChild(this.hud.el);

    // SFX from log entries
    this.unsubscribers.push(
      this.state.log.subscribe((entry) => playForLogEntry(entry)),
    );

    // Re-render on state changes
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
        onFire: (layer, x, z) => this.handleHumanShot(layer, x, z),
      },
    );

    this.placement.enable();
    this.hud.showLayerPicker(false);
    this.hud.showExitButton(true);
    unlockAudio();

    // Orchestrator wire-up
    const unsubOrchestrator = opts.orchestrator.subscribe((e) => this.onOrchestratorEvent(e));
    this.unsubscribers.push(unsubOrchestrator);
  }

  // ---- Placement -> commit/placed --------------------------------------

  private async confirmFleet(): Promise<void> {
    if (this.state.nextUnitToPlace() !== null) return;
    if (!this.ourFleetCommitted) {
      this.ourFleetCommitted = true;
      // Wire the getOwnUnits callback by passing through the orchestrator
      // (the orchestrator's session was built with a thunk that we control
      // — we re-bind by triggering commit + then notifyPlaced).
      await this.opts.orchestrator.commit();
    }
    this.opts.orchestrator.notifyPlaced();
  }

  // ---- Outgoing shot ---------------------------------------------------

  private handleHumanShot(layer: number, x: number, z: number): void {
    if (!this.startedPlaying) return;
    const seq = this.opts.orchestrator.fireShot({ x, z, layer });
    if (seq === null) return; // not our turn or wrong phase — UI will refresh
  }

  // ---- Orchestrator event handler --------------------------------------

  private onOrchestratorEvent(e: OrchestratorEvent): void {
    if (this.destroyed) return;
    switch (e.kind) {
      case 'opponentReady':
        this.onlineHud.setOpponentNick(e.nick);
        return;
      case 'opponentPlaced':
        this.opponentPlacedAck = true;
        this.maybeStartPlaying();
        return;
      case 'phaseChanged':
        if (e.phase === 'placing') {
          // Both committed — placement remains a local UI step.
        }
        if (e.phase === 'playing') {
          this.maybeStartPlaying();
        }
        return;
      case 'turnChanged':
        // No-op on UI side; the next event (incomingShotResult/opponentShot)
        // will refresh markers + log.
        return;
      case 'incomingShotResult': {
        const sunkType = e.result === 'sunk' ? guessSunkTypeFromCascades(e.cascades) : undefined;
        this.state.applyOutgoingShotResult(e.cell, e.result, e.cascades, sunkType);
        this.addAiMarker(e.cell, e.result);
        for (const c of e.cascades) this.addAiMarker(c.cell, c.result);
        this.maybeFireGameOver();
        return;
      }
      case 'opponentShot': {
        // Cell + outcome already applied by the session's resolveAttack
        // callback (which is wired in main.ts to call applyIncomingShot).
        // We just paint the marker and check end-of-game.
        this.addPlayerMarker(e.cell, e.result);
        for (const c of e.cascades) this.addPlayerMarker(c.cell, c.result);
        this.maybeFireGameOver();
        return;
      }
      case 'opponentForfeit':
        if (!this.gameOverFired) {
          this.gameOverFired = true;
          this.hud.showGameOver('human');
          this.opts.onGameOver('human');
        }
        return;
      case 'verificationComplete':
        this.opts.onVerification(e.outcome);
        showCheatBanner({ outcome: e.outcome, onClose: () => {} });
        return;
      case 'protocolError':
        this.onlineHud.setStatus('gone', `errore protocollo: ${e.reason}`);
        return;
      case 'peerUnresponsive':
        this.onlineHud.setStatus('unresponsive', 'in attesa di risposta…');
        return;
      case 'peerResponsive':
        this.onlineHud.setStatus('connected');
        return;
      case 'peerLeft':
        this.onlineHud.setStatus('gone', 'connessione persa');
        return;
      case 'peerRejoined':
        this.onlineHud.setStatus('connected', 'riconnesso');
        return;
      case 'reconnectExpired':
        if (!this.gameOverFired) {
          this.gameOverFired = true;
          this.hud.showGameOver('human');
          this.opts.onGameOver('human');
        }
        return;
      case 'snapshotApplied':
        // Nothing UI-visible — markers already correspond to recorded shots.
        return;
      case 'transportError':
        this.onlineHud.setStatus('gone', `transport: ${e.error.message}`);
        return;
    }
  }

  private maybeStartPlaying(): void {
    if (this.startedPlaying) return;
    if (this.state.nextUnitToPlace() !== null) return; // still placing locally
    if (!this.ourFleetCommitted) return;
    if (!this.opponentPlacedAck) return;

    const firstTurn = this.opts.orchestrator.session.turn === this.opts.side ? 'human' : 'ai';
    this.state.beginPlayOnline(firstTurn);
    this.placement.disable();
    this.targeting.enable();
    this.hud.showLayerPicker(true);
    this.startedPlaying = true;
    this.opts.onPlayBegan();
  }

  private addAiMarker(cell: { x: number; z: number; layer: number }, result: 'miss' | 'hit' | 'sunk'): void {
    this.aiMarkers.add(createHitMarker(this.state.dims, cell.layer, cell.x, cell.z, result));
  }

  private addPlayerMarker(cell: { x: number; z: number; layer: number }, result: 'miss' | 'hit' | 'sunk'): void {
    this.playerMarkers.add(createHitMarker(this.state.dims, cell.layer, cell.x, cell.z, result));
  }

  private rebuildPlayerUnits(): void {
    disposeChildren(this.playerUnitsGroup);
    for (const u of this.state.playerGrid.units) {
      this.playerUnitsGroup.add(createUnitMesh(u, this.state.dims));
    }
  }

  private maybeFireGameOver(): void {
    if (this.gameOverFired) return;
    if (this.state.phase !== 'over') return;
    this.gameOverFired = true;
    this.targeting.disable();
    const winner = this.state.winner ?? 'human';
    this.hud.showGameOver(winner);
    this.opts.onGameOver(winner);
    if (!this.revealTriggered) {
      this.revealTriggered = true;
      void this.opts.orchestrator.reveal();
    }
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
    this.placement.destroy();
    this.targeting.destroy();
    disposeChildren(this.playerUnitsGroup);
    disposeChildren(this.aiUnitsGroup);
    disposeChildren(this.playerMarkers);
    disposeChildren(this.aiMarkers);
    this.opts.scene.remove(this.playerUnitsGroup, this.aiUnitsGroup, this.playerMarkers, this.aiMarkers);
    this.onlineHud.destroy();
    this.hud.destroy();
    await this.opts.orchestrator.destroy();
  }
}

/** Best-effort sunkType extraction for ActionLog rendering when the
 * opponent reports 'sunk'. Cascades carry sunkType when populated; the
 * primary cell often doesn't, so we leave it undefined and the log
 * renderer falls back to a generic "affondato". */
function guessSunkTypeFromCascades(
  cascades: ReadonlyArray<{ sunkType?: import('../game/units/definitions').UnitTypeId }>,
): import('../game/units/definitions').UnitTypeId | undefined {
  for (const c of cascades) if (c.sunkType) return c.sunkType;
  return undefined;
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

void unitContainsCell;
