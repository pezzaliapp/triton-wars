import type { GridDimensions } from '../grid/volumetric-grid';
import type { PlayerGrid } from '../grid/grid-state';
import { checkPlacement } from '../units/placement';
import { DEFAULT_FLEET, getUnitType, type UnitTypeId } from '../units/definitions';
import type { Cell, Orientation } from '../units/unit';

export interface AiTarget {
  layer: number;
  x: number;
  z: number;
}

interface HuntCandidate extends AiTarget {}

/**
 * Recruit-level AI:
 *  - Random valid auto-placement of the standard fleet.
 *  - Targeting: maintains a queue of "hunt" candidates around recent hits.
 *    If queue is empty, fires randomly at any cell across the volume.
 */
export class RecruitAi {
  private readonly dims: GridDimensions;
  private readonly rng: () => number;

  /** Cells we have already shot at (any layer). */
  private readonly tried = new Set<string>();

  /** FIFO queue of cells to probe around recent hits. */
  private hunt: HuntCandidate[] = [];

  /** Last hit, used to extend hunt along the same direction when chained. */
  private lastHit: AiTarget | null = null;

  constructor(dims: GridDimensions, rng: () => number = Math.random) {
    this.dims = dims;
    this.rng = rng;
  }

  /** Compute random valid placements for the AI's full fleet. */
  autoPlace(grid: PlayerGrid, fleet: readonly UnitTypeId[] = DEFAULT_FLEET): Array<{ typeId: UnitTypeId; anchor: Cell; orientation: Orientation }> {
    const result: Array<{ typeId: UnitTypeId; anchor: Cell; orientation: Orientation }> = [];
    const tempUnits = [...grid.units];

    for (const typeId of fleet) {
      const placement = this.findValidPlacement(typeId, tempUnits);
      if (!placement) {
        // Highly unlikely with default fleet on 10x10x6, but bail safely.
        return result;
      }
      // Push a faux unit into tempUnits so subsequent checks see it occupied.
      const type = getUnitType(typeId);
      const cells = [];
      for (let i = 0; i < type.length; i++) {
        if (placement.orientation === 'x') {
          cells.push({ x: placement.anchor.x + i, z: placement.anchor.z, layer: type.layer });
        } else {
          cells.push({ x: placement.anchor.x, z: placement.anchor.z + i, layer: type.layer });
        }
      }
      tempUnits.push({
        id: `tmp-${result.length}`,
        typeId,
        anchor: placement.anchor,
        orientation: placement.orientation,
        cells,
        hits: new Set<string>(),
        sunk: false,
      });
      result.push(placement);
    }
    return result;
  }

  private findValidPlacement(typeId: UnitTypeId, existing: PlayerGrid['units']): { typeId: UnitTypeId; anchor: Cell; orientation: Orientation } | null {
    const type = getUnitType(typeId);
    const maxAttempts = 200;
    for (let i = 0; i < maxAttempts; i++) {
      const orientation: Orientation = type.rotatable && this.rng() < 0.5 ? 'x' : 'z';
      const x = Math.floor(this.rng() * this.dims.width);
      const z = Math.floor(this.rng() * this.dims.depth);
      const anchor: Cell = { x, z };
      const check = checkPlacement(typeId, anchor, orientation, this.dims, existing);
      if (check.valid) {
        return { typeId, anchor, orientation };
      }
    }
    return null;
  }

  /** Pick the next cell to attack. Uses hunt queue if non-empty. */
  chooseTarget(): AiTarget | null {
    while (this.hunt.length > 0) {
      const candidate = this.hunt.shift();
      if (!candidate) break;
      const key = this.cellKey(candidate);
      if (!this.tried.has(key)) {
        this.tried.add(key);
        return candidate;
      }
    }
    // random over the entire volume, biased to surface and air-low (units more
    // common there). 70% surface/air-low, 30% any layer.
    const tries = 200;
    for (let i = 0; i < tries; i++) {
      const layer = this.rng() < 0.7 ? this.pickShallowLayer() : this.pickAnyLayer();
      const x = Math.floor(this.rng() * this.dims.width);
      const z = Math.floor(this.rng() * this.dims.depth);
      const candidate = { layer, x, z };
      const key = this.cellKey(candidate);
      if (!this.tried.has(key)) {
        this.tried.add(key);
        return candidate;
      }
    }
    return null;
  }

  private pickShallowLayer(): number {
    // Surface (2) and air-low (3) are the heavy traffic layers.
    return this.rng() < 0.6 ? 2 : 3;
  }

  private pickAnyLayer(): number {
    return Math.floor(this.rng() * this.dims.layers);
  }

  /** Called by the driver after we receive a hit/miss/sunk result on our shot. */
  notifyResult(shot: AiTarget, result: 'miss' | 'hit' | 'sunk'): void {
    if (result === 'sunk') {
      this.hunt = [];
      this.lastHit = null;
      return;
    }
    if (result === 'hit') {
      this.lastHit = shot;
      this.enqueueNeighbours(shot);
    }
  }

  private enqueueNeighbours(shot: AiTarget): void {
    const neighbours: AiTarget[] = [
      { layer: shot.layer, x: shot.x + 1, z: shot.z },
      { layer: shot.layer, x: shot.x - 1, z: shot.z },
      { layer: shot.layer, x: shot.x, z: shot.z + 1 },
      { layer: shot.layer, x: shot.x, z: shot.z - 1 },
    ];
    for (const n of neighbours) {
      if (!this.inBounds(n)) continue;
      if (this.tried.has(this.cellKey(n))) continue;
      this.hunt.push(n);
    }
  }

  private inBounds(t: AiTarget): boolean {
    return (
      t.x >= 0 &&
      t.x < this.dims.width &&
      t.z >= 0 &&
      t.z < this.dims.depth &&
      t.layer >= 0 &&
      t.layer < this.dims.layers
    );
  }

  private cellKey(t: AiTarget): string {
    return `${t.layer}:${t.x}:${t.z}`;
  }
}
