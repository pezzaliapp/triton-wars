import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import type { GridDimensions } from '../grid/volumetric-grid';
import { layerWorldYBottom } from '../grid/coords';

/**
 * A flat overlay highlighting a single cell on a given layer's plane.
 * Used to show pointer hover during placement and targeting.
 */
export class CellHighlight {
  readonly group: Group = new Group();
  private readonly mesh: LineSegments;

  constructor(private readonly dims: GridDimensions, color: number = 0x5fd4ff) {
    this.group.name = 'cell-highlight';
    const geom = new BufferGeometry();
    const s = dims.cellSize;
    const positions = [
      0, 0, 0, s, 0, 0,
      s, 0, 0, s, 0, s,
      s, 0, s, 0, 0, s,
      0, 0, s, 0, 0, 0,
    ];
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const mat = new LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    this.mesh = new LineSegments(geom, mat);
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  setCell(layer: number, x: number, z: number, valid = true): void {
    const halfW = (this.dims.width * this.dims.cellSize) / 2;
    const halfD = (this.dims.depth * this.dims.cellSize) / 2;
    this.mesh.position.set(
      -halfW + x * this.dims.cellSize,
      layerWorldYBottom(this.dims, layer) + 0.01,
      -halfD + z * this.dims.cellSize,
    );
    const mat = this.mesh.material as LineBasicMaterial;
    mat.color.setHex(valid ? 0x5fd4ff : 0xff5566);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }
}
