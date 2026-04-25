import type { GridDimensions } from '../grid/volumetric-grid';
import type { Cell, Orientation, UnitInstance } from './unit';
import { cellKey, computeCells } from './unit';
import { getUnitType, type UnitTypeId } from './definitions';

export type PlacementError =
  | 'out-of-bounds'
  | 'overlap'
  | 'invalid-layer';

export interface PlacementCheck {
  valid: boolean;
  error?: PlacementError;
}

export function checkPlacement(
  typeId: UnitTypeId,
  anchor: Cell,
  orientation: Orientation,
  dims: GridDimensions,
  existingUnits: UnitInstance[],
): PlacementCheck {
  const type = getUnitType(typeId);
  if (type.layer < 0 || type.layer >= dims.layers) {
    return { valid: false, error: 'invalid-layer' };
  }

  const cells = computeCells(type.layer, type.length, anchor, orientation);

  for (const c of cells) {
    if (c.x < 0 || c.x >= dims.width || c.z < 0 || c.z >= dims.depth) {
      return { valid: false, error: 'out-of-bounds' };
    }
  }

  const occupied = new Set<string>();
  for (const u of existingUnits) {
    for (const c of u.cells) {
      occupied.add(cellKey(c.layer, c.x, c.z));
    }
  }
  for (const c of cells) {
    if (occupied.has(cellKey(c.layer, c.x, c.z))) {
      return { valid: false, error: 'overlap' };
    }
  }

  return { valid: true };
}
