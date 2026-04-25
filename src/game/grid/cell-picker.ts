import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three';
import type { GridDimensions } from './volumetric-grid';
import { layerWorldYBottom, worldToCell } from './coords';

/**
 * Project a screen-space pointer onto a given layer's horizontal plane and
 * return the cell that contains the projected point.
 *
 * For air layers this projects on top of the layer plane (so units sit on
 * top), for surface and underwater on the layer's bottom plane.
 */
export class CellPicker {
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();
  private readonly plane = new Plane();

  constructor(private readonly dims: GridDimensions) {}

  pickAtLayer(
    canvas: HTMLCanvasElement,
    camera: PerspectiveCamera,
    clientX: number,
    clientY: number,
    layer: number,
  ): { layer: number; x: number; z: number } | null {
    const rect = canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, camera);

    const planeY = layerWorldYBottom(this.dims, layer) + this.dims.cellSize / 2;
    this.plane.setComponents(0, 1, 0, -planeY); // y = planeY → 0*x + 1*y + 0*z - planeY = 0
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.hit);
    if (!hit) return null;
    const cell = worldToCell(this.dims, hit);
    if (!cell) return null;
    return { layer, x: cell.x, z: cell.z };
  }
}
