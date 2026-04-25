import type { PerspectiveCamera, Scene } from 'three';
import type { GridDimensions } from '../grid/volumetric-grid';
import { CellPicker } from '../grid/cell-picker';
import { GhostController } from '../render/ghost-mesh';
import { CellHighlight } from '../render/highlights';
import { checkPlacement } from '../units/placement';
import type { Cell, Orientation } from '../units/unit';
import type { GameState } from '../state/game-state';
import { getUnitType } from '../units/definitions';

export interface PlacementCallbacks {
  onPlaced?: () => void;
  onMove?: (anchor: Cell | null, valid: boolean) => void;
}

const DRAG_THRESHOLD_PX = 6;

export class PlacementController {
  readonly ghost: GhostController;
  readonly highlight: CellHighlight;
  private readonly picker: CellPicker;

  private orientation: Orientation = 'x';
  private active = false;
  private downX = 0;
  private downY = 0;
  private moved = false;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: PerspectiveCamera,
    private readonly state: GameState,
    private readonly scene: Scene,
    dims: GridDimensions,
    private readonly callbacks: PlacementCallbacks = {},
  ) {
    this.picker = new CellPicker(dims);
    this.ghost = new GhostController(dims);
    this.highlight = new CellHighlight(dims);
    scene.add(this.ghost.group);
    scene.add(this.highlight.group);

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('keydown', this.onKey);
  }

  enable(): void {
    this.active = true;
  }

  disable(): void {
    this.active = false;
    this.ghost.hide();
    this.highlight.hide();
  }

  rotate(): void {
    if (!this.active) return;
    const next = this.state.nextUnitToPlace();
    if (!next) return;
    if (!getUnitType(next).rotatable) return;
    this.orientation = this.orientation === 'x' ? 'z' : 'x';
    this.refreshGhost();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('keydown', this.onKey);
    this.scene.remove(this.ghost.group);
    this.scene.remove(this.highlight.group);
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.active) return;
    if (e.pointerType === 'touch' && e.buttons === 0) {
      // ignore stale touches
    }
    if (this.downX !== 0 || this.downY !== 0) {
      if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > DRAG_THRESHOLD_PX) {
        this.moved = true;
      }
    }
    this.updateGhostFromPointer(e.clientX, e.clientY);
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
    if (wasDrag) return; // drag for orbit, ignore as a placement tap

    const next = this.state.nextUnitToPlace();
    if (!next) return;
    const type = getUnitType(next);
    const cell = this.picker.pickAtLayer(this.canvas, this.camera, e.clientX, e.clientY, type.layer);
    if (!cell) return;
    const check = checkPlacement(next, { x: cell.x, z: cell.z }, this.orientation, this.state.dims, this.state.playerGrid.units);
    if (!check.valid) {
      this.refreshGhost();
      return;
    }
    const placed = this.state.placePlayerUnit({ x: cell.x, z: cell.z }, this.orientation);
    if (placed) {
      this.callbacks.onPlaced?.();
      this.orientation = 'x';
      this.refreshGhost();
    }
  };

  private onPointerLeave = (): void => {
    this.ghost.hide();
    this.highlight.hide();
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      this.rotate();
    }
  };

  private updateGhostFromPointer(clientX: number, clientY: number): void {
    const next = this.state.nextUnitToPlace();
    if (!next) {
      this.ghost.hide();
      this.highlight.hide();
      return;
    }
    const type = getUnitType(next);
    const cell = this.picker.pickAtLayer(this.canvas, this.camera, clientX, clientY, type.layer);
    if (!cell) {
      this.ghost.hide();
      this.highlight.hide();
      this.callbacks.onMove?.(null, false);
      return;
    }
    const check = checkPlacement(next, { x: cell.x, z: cell.z }, this.orientation, this.state.dims, this.state.playerGrid.units);
    this.ghost.set({
      typeId: next,
      anchor: { x: cell.x, z: cell.z },
      orientation: this.orientation,
      valid: check.valid,
    });
    this.highlight.setCell(type.layer, cell.x, cell.z, check.valid);
    this.callbacks.onMove?.({ x: cell.x, z: cell.z }, check.valid);
  }

  private refreshGhost(): void {
    // re-run with last known position is awkward without storing; just hide
    // until the next pointermove. The user will see it again as they move.
    this.ghost.hide();
    this.highlight.hide();
  }
}
