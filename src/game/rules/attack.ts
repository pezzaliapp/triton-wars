import type { PlayerGrid } from '../grid/grid-state';
import type { UnitInstance } from '../units/unit';
import { cellKey } from '../units/unit';
import { getUnitType, type UnitTypeId } from '../units/definitions';

export type AttackResult = 'miss' | 'hit' | 'sunk' | 'already';

export interface AttackOutcome {
  cell: { x: number; z: number; layer: number };
  result: AttackResult;
  sunkType?: UnitTypeId;
  /** Secondary impacts caused by mine 3x3 explosion. */
  cascades: AttackOutcome[];
}

/**
 * Resolves an attack against the defender's grid. Mutates unit hit state
 * and records the shot. If a Mina is hit, additionally resolves a 3x3
 * surface area attack centered on the mine's (x,z) — only on the surface
 * layer, only against cells not already targeted.
 */
export function resolveAttack(
  defender: PlayerGrid,
  layer: number,
  x: number,
  z: number,
): AttackOutcome {
  const cell = { x, z, layer };

  if (defender.hasShot(layer, x, z)) {
    return { cell, result: 'already', cascades: [] };
  }

  const target = defender.unitAt(layer, x, z);
  defender.recordShot(layer, x, z);

  let result: AttackResult = 'miss';
  let sunkType: UnitTypeId | undefined;

  if (target) {
    target.hits.add(cellKey(layer, x, z));
    if (target.hits.size >= target.cells.length) {
      target.sunk = true;
      result = 'sunk';
      sunkType = target.typeId;
    } else {
      result = 'hit';
    }
  }

  const cascades: AttackOutcome[] = [];
  if (target && getUnitType(target.typeId).abilityId === 'mine-3x3') {
    cascades.push(...detonateMine(defender, target, x, z));
  }

  return { cell, result, sunkType, cascades };
}

const SURFACE_LAYER = 2;

/**
 * Mina passive ability: explosion on surface layer in a 3x3 footprint
 * centered on the mine's column. Affects only cells in bounds and not
 * already targeted.
 */
function detonateMine(
  defender: PlayerGrid,
  mine: UnitInstance,
  cx: number,
  cz: number,
): AttackOutcome[] {
  const outcomes: AttackOutcome[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      const z = cz + dz;
      if (x < 0 || x >= defender.dims.width || z < 0 || z >= defender.dims.depth) continue;
      if (defender.hasShot(SURFACE_LAYER, x, z)) continue;

      const hitUnit = defender.unitAt(SURFACE_LAYER, x, z);
      defender.recordShot(SURFACE_LAYER, x, z);

      let result: AttackResult = 'miss';
      let sunkType: UnitTypeId | undefined;
      if (hitUnit) {
        hitUnit.hits.add(cellKey(SURFACE_LAYER, x, z));
        if (hitUnit.hits.size >= hitUnit.cells.length) {
          hitUnit.sunk = true;
          result = 'sunk';
          sunkType = hitUnit.typeId;
        } else {
          result = 'hit';
        }
      }
      outcomes.push({
        cell: { x, z, layer: SURFACE_LAYER },
        result,
        sunkType,
        cascades: [],
      });
    }
  }
  void mine;
  return outcomes;
}
