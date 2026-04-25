import { GRID_DIMENSIONS, type GridDimensions } from '../grid/volumetric-grid';
import { PlayerGrid } from '../grid/grid-state';
import { ActionLog } from './action-log';
import type { UnitTypeId } from '../units/definitions';
import { DEFAULT_FLEET, getUnitType } from '../units/definitions';
import type { Cell, Orientation, UnitInstance } from '../units/unit';
import { createUnit } from '../units/unit';
import { checkPlacement } from '../units/placement';
import { resolveAttack, type AttackOutcome } from '../rules/attack';

export type Phase = 'placing' | 'playing' | 'over';
export type Player = 'human' | 'ai';

export interface PlacementProgress {
  remainingFleet: UnitTypeId[];
  placedCount: number;
  fleetSize: number;
}

export class GameState {
  readonly dims: GridDimensions = GRID_DIMENSIONS;
  readonly playerGrid = new PlayerGrid(GRID_DIMENSIONS);
  readonly aiGrid = new PlayerGrid(GRID_DIMENSIONS);
  readonly log = new ActionLog();

  private _phase: Phase = 'placing';
  private _turn: Player = 'human';
  private _winner: Player | null = null;

  private remainingFleet: UnitTypeId[] = [...DEFAULT_FLEET];
  private nextUnitId = 1;

  private readonly listeners = new Set<() => void>();

  get phase(): Phase {
    return this._phase;
  }

  get turn(): Player {
    return this._turn;
  }

  get winner(): Player | null {
    return this._winner;
  }

  get placementProgress(): PlacementProgress {
    return {
      remainingFleet: [...this.remainingFleet],
      placedCount: DEFAULT_FLEET.length - this.remainingFleet.length,
      fleetSize: DEFAULT_FLEET.length,
    };
  }

  /** Next unit type to place, or null if placement is done. */
  nextUnitToPlace(): UnitTypeId | null {
    return this.remainingFleet[0] ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Places the current next-in-fleet unit on the player's grid. */
  placePlayerUnit(anchor: Cell, orientation: Orientation): UnitInstance | null {
    if (this._phase !== 'placing') return null;
    const next = this.nextUnitToPlace();
    if (!next) return null;
    const check = checkPlacement(next, anchor, orientation, this.dims, this.playerGrid.units);
    if (!check.valid) return null;

    const unit = createUnit(this.makeId(), next, anchor, orientation);
    this.playerGrid.addUnit(unit);
    this.remainingFleet.shift();
    this.log.push({ kind: 'place', player: 'human', typeId: next });
    this.emit();
    return unit;
  }

  /** Used by the AI auto-placer. Returns the placed unit or null on failure. */
  placeAiUnit(typeId: UnitTypeId, anchor: Cell, orientation: Orientation): UnitInstance | null {
    if (this._phase !== 'placing') return null;
    const check = checkPlacement(typeId, anchor, orientation, this.dims, this.aiGrid.units);
    if (!check.valid) return null;
    const unit = createUnit(this.makeId(), typeId, anchor, orientation);
    this.aiGrid.addUnit(unit);
    return unit;
  }

  beginPlay(): void {
    if (this._phase !== 'placing') return;
    if (this.remainingFleet.length > 0) return;
    if (this.aiGrid.units.length === 0) return;
    this._phase = 'playing';
    this._turn = 'human';
    this.log.push({ kind: 'turn', player: 'human' });
    this.emit();
  }

  /** Human attacks AI grid. Triggers turn change. */
  humanAttack(layer: number, x: number, z: number): AttackOutcome | null {
    if (this._phase !== 'playing' || this._turn !== 'human') return null;
    const outcome = resolveAttack(this.aiGrid, layer, x, z);
    if (outcome.result === 'already') return outcome;

    this.recordOutcome('human', outcome);
    if (this.aiGrid.allUnitsSunk()) {
      this._phase = 'over';
      this._winner = 'human';
      this.log.push({ kind: 'game-over', winner: 'human' });
    } else {
      this._turn = 'ai';
      this.log.push({ kind: 'turn', player: 'ai' });
    }
    this.emit();
    return outcome;
  }

  /** AI attacks human grid (called by AI driver). */
  aiAttack(layer: number, x: number, z: number): AttackOutcome | null {
    if (this._phase !== 'playing' || this._turn !== 'ai') return null;
    const outcome = resolveAttack(this.playerGrid, layer, x, z);
    if (outcome.result === 'already') return outcome;

    this.recordOutcome('ai', outcome);
    if (this.playerGrid.allUnitsSunk()) {
      this._phase = 'over';
      this._winner = 'ai';
      this.log.push({ kind: 'game-over', winner: 'ai' });
    } else {
      this._turn = 'human';
      this.log.push({ kind: 'turn', player: 'human' });
    }
    this.emit();
    return outcome;
  }

  private recordOutcome(shooter: Player, outcome: AttackOutcome): void {
    if (outcome.result !== 'already') {
      this.log.push({
        kind: 'shot',
        shooter,
        x: outcome.cell.x,
        z: outcome.cell.z,
        layer: outcome.cell.layer,
        result: outcome.result,
        sunkType: outcome.sunkType,
      });
    }
    if (outcome.cascades.length > 0) {
      this.log.push({
        kind: 'mine-explode',
        shooter,
        impacts: outcome.cascades.map((c) => ({
          x: c.cell.x,
          z: c.cell.z,
          layer: c.cell.layer,
          result: c.result === 'already' ? 'miss' : c.result,
          sunkType: c.sunkType,
        })),
      });
    }
  }

  private makeId(): string {
    return `u${this.nextUnitId++}`;
  }
}

export function fleetSummary(grid: { units: UnitInstance[] }): Map<UnitTypeId, { total: number; alive: number }> {
  const summary = new Map<UnitTypeId, { total: number; alive: number }>();
  for (const u of grid.units) {
    const cur = summary.get(u.typeId) ?? { total: 0, alive: 0 };
    cur.total += 1;
    if (!u.sunk) cur.alive += 1;
    summary.set(u.typeId, cur);
  }
  return summary;
}

export { getUnitType };
