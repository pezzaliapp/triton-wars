import type { GridDimensions } from './volumetric-grid';
import type { UnitInstance } from '../units/unit';
import { cellKey } from '../units/unit';

/**
 * Immutable-ish player grid: holds placed units and the set of cells already
 * shot at by the opponent. We mutate units in place (hits, sunk) and the
 * shot set; turn engine treats us as a black-box so this is fine for Phase 2.
 */
export class PlayerGrid {
  readonly dims: GridDimensions;
  readonly units: UnitInstance[] = [];
  /** Cells that have been targeted by the opponent. */
  readonly shots: Set<string> = new Set();

  constructor(dims: GridDimensions) {
    this.dims = dims;
  }

  addUnit(unit: UnitInstance): void {
    this.units.push(unit);
  }

  removeUnit(unitId: string): void {
    const i = this.units.findIndex((u) => u.id === unitId);
    if (i >= 0) this.units.splice(i, 1);
  }

  /** Returns the unit (if any) occupying the given cell. */
  unitAt(layer: number, x: number, z: number): UnitInstance | null {
    for (const u of this.units) {
      if (u.cells.length === 0) continue;
      if (u.cells[0]!.layer !== layer) continue;
      for (const c of u.cells) {
        if (c.x === x && c.z === z) return u;
      }
    }
    return null;
  }

  hasShot(layer: number, x: number, z: number): boolean {
    return this.shots.has(cellKey(layer, x, z));
  }

  recordShot(layer: number, x: number, z: number): void {
    this.shots.add(cellKey(layer, x, z));
  }

  allUnitsSunk(): boolean {
    return this.units.length > 0 && this.units.every((u) => u.sunk);
  }

  unitsRemaining(): number {
    return this.units.filter((u) => !u.sunk).length;
  }
}
