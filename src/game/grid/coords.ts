import { Vector3 } from 'three';
import type { GridDimensions } from './volumetric-grid';

/**
 * Cell ↔ world helpers. The grid is laid out so that the surface layer
 * (index 2) sits with its bottom at world Y = 0. Cell centers sit at
 * (layer - 2) * cellSize + cellSize / 2.
 */

const SURFACE_LAYER = 2;

export function cellCenter(dims: GridDimensions, layer: number, x: number, z: number, target = new Vector3()): Vector3 {
  const halfW = (dims.width * dims.cellSize) / 2;
  const halfD = (dims.depth * dims.cellSize) / 2;
  target.x = -halfW + (x + 0.5) * dims.cellSize;
  target.y = (layer - SURFACE_LAYER) * dims.cellSize + dims.cellSize / 2;
  target.z = -halfD + (z + 0.5) * dims.cellSize;
  return target;
}

export function layerWorldY(dims: GridDimensions, layer: number): number {
  return (layer - SURFACE_LAYER) * dims.cellSize + dims.cellSize / 2;
}

export function layerWorldYBottom(dims: GridDimensions, layer: number): number {
  return (layer - SURFACE_LAYER) * dims.cellSize;
}

export function worldToCell(dims: GridDimensions, point: Vector3): { layer: number; x: number; z: number } | null {
  const halfW = (dims.width * dims.cellSize) / 2;
  const halfD = (dims.depth * dims.cellSize) / 2;
  const totalHeight = dims.layers * dims.cellSize;

  const xRel = point.x + halfW;
  const zRel = point.z + halfD;
  const yRel = point.y + (SURFACE_LAYER * dims.cellSize); // shift so layer 0 bottom = 0

  if (xRel < 0 || xRel >= dims.width * dims.cellSize) return null;
  if (zRel < 0 || zRel >= dims.depth * dims.cellSize) return null;
  if (yRel < 0 || yRel >= totalHeight) return null;

  return {
    x: Math.floor(xRel / dims.cellSize),
    z: Math.floor(zRel / dims.cellSize),
    layer: Math.floor(yRel / dims.cellSize),
  };
}
