import { Group } from 'three';
import type { GridDimensions } from '../grid/volumetric-grid';
import { createUnit, type Cell, type Orientation } from '../units/unit';
import type { UnitTypeId } from '../units/definitions';
import { createUnitMesh } from './unit-mesh';

export interface GhostState {
  typeId: UnitTypeId;
  anchor: Cell;
  orientation: Orientation;
  valid: boolean;
}

export class GhostController {
  readonly group: Group = new Group();
  private current: GhostState | null = null;

  constructor(private readonly dims: GridDimensions) {
    this.group.name = 'ghost-unit';
    this.group.visible = false;
  }

  set(state: GhostState): void {
    this.clear();
    const unit = createUnit('ghost', state.typeId, state.anchor, state.orientation);
    const mesh = createUnitMesh(unit, this.dims, { ghost: true });
    if (!state.valid) {
      mesh.traverse((obj) => {
        const m = (obj as { material?: { color?: { setHex: (h: number) => void } } }).material;
        if (m && m.color && typeof m.color.setHex === 'function') {
          m.color.setHex(0xff5566);
        }
      });
    }
    this.group.add(mesh);
    this.group.visible = true;
    this.current = state;
  }

  hide(): void {
    this.clear();
    this.group.visible = false;
    this.current = null;
  }

  state(): GhostState | null {
    return this.current;
  }

  private clear(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      if (!child) break;
      this.group.remove(child);
      child.traverse((obj) => {
        const mesh = obj as { geometry?: { dispose: () => void }; material?: { dispose: () => void } };
        mesh.geometry?.dispose?.();
        mesh.material?.dispose?.();
      });
    }
  }
}
