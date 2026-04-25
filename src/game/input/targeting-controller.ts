import type { PerspectiveCamera, Scene } from 'three';
import type { GridDimensions } from '../grid/volumetric-grid';
import { CellPicker } from '../grid/cell-picker';
import { CellHighlight } from '../render/highlights';
import type { GameState } from '../state/game-state';

export interface TargetingCallbacks {
  onFire?: (layer: number, x: number, z: number) => void;
  onMove?: (cell: { layer: number; x: number; z: number } | null) => void;
}

const DRAG_THRESHOLD_PX = 6;

export class TargetingController {
  private readonly picker: CellPicker;
  readonly highlight: CellHighlight;

  private currentLayer = 2;
  private active = false;
  private downX = 0;
  private downY = 0;
  private moved = false;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: PerspectiveCamera,
    private readonly state: GameState,
    scene: Scene,
    dims: GridDimensions,
    private readonly callbacks: TargetingCallbacks = {},
  ) {
    this.picker = new CellPicker(dims);
    this.highlight = new CellHighlight(dims, 0xff7676);
    scene.add(this.highlight.group);

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  setLayer(layer: number): void {
    this.currentLayer = layer;
  }

  enable(): void {
    this.active = true;
  }

  disable(): void {
    this.active = false;
    this.highlight.hide();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.active) return;
    if (this.downX !== 0 || this.downY !== 0) {
      if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > DRAG_THRESHOLD_PX) {
        this.moved = true;
      }
    }
    const cell = this.picker.pickAtLayer(this.canvas, this.camera, e.clientX, e.clientY, this.currentLayer);
    if (!cell) {
      this.highlight.hide();
      this.callbacks.onMove?.(null);
      return;
    }
    const taken = this.state.aiGrid.hasShot(this.currentLayer, cell.x, cell.z);
    this.highlight.setCell(this.currentLayer, cell.x, cell.z, !taken);
    this.callbacks.onMove?.(cell);
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.moved = false;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.active) {
      this.downX = 0;
      this.downY = 0;
      return;
    }
    const wasDrag = this.moved;
    this.downX = 0;
    this.downY = 0;
    this.moved = false;
    if (wasDrag) return;

    const cell = this.picker.pickAtLayer(this.canvas, this.camera, e.clientX, e.clientY, this.currentLayer);
    if (!cell) return;
    if (this.state.aiGrid.hasShot(this.currentLayer, cell.x, cell.z)) return;
    this.callbacks.onFire?.(this.currentLayer, cell.x, cell.z);
  };

  private onPointerLeave = (): void => {
    this.highlight.hide();
  };
}
