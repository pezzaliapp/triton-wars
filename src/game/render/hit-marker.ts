import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
} from 'three';
import type { GridDimensions } from '../grid/volumetric-grid';
import { cellCenter } from '../grid/coords';

const HIT_COLOR = 0xff4d4d;
const MISS_COLOR = 0x88c0ff;
const SUNK_COLOR = 0xffae00;

const tmp = new Vector3();

export function createHitMarker(dims: GridDimensions, layer: number, x: number, z: number, kind: 'hit' | 'miss' | 'sunk'): Group {
  const group = new Group();
  group.name = `marker:${kind}:${layer}:${x}:${z}`;
  cellCenter(dims, layer, x, z, tmp);

  if (kind === 'miss') {
    const ring = new Mesh(
      new RingGeometry(dims.cellSize * 0.18, dims.cellSize * 0.32, 24),
      new MeshBasicMaterial({ color: MISS_COLOR, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(tmp);
    ring.position.y -= dims.cellSize * 0.4;
    group.add(ring);
    return group;
  }

  const color = kind === 'sunk' ? SUNK_COLOR : HIT_COLOR;
  const size = dims.cellSize * (kind === 'sunk' ? 0.78 : 0.55);
  const cube = new Mesh(
    new BoxGeometry(size, size, size),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
  );
  cube.position.copy(tmp);
  group.add(cube);

  // outer halo
  const halo = new Mesh(
    new RingGeometry(size * 0.6, size * 0.95, 32),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.copy(tmp);
  halo.position.y -= dims.cellSize * 0.45;
  group.add(halo);

  return group;
}
