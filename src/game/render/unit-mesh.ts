import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { GridDimensions } from '../grid/volumetric-grid';
import { cellCenter } from '../grid/coords';
import type { UnitInstance } from '../units/unit';
import { getUnitType } from '../units/definitions';

const tmpA = new Vector3();
const tmpB = new Vector3();

/** Build a placeholder mesh group representing a placed unit. */
export function createUnitMesh(unit: UnitInstance, dims: GridDimensions, opts: { ghost?: boolean } = {}): Group {
  const type = getUnitType(unit.typeId);
  const group = new Group();
  group.name = `unit:${unit.id}`;

  const len = unit.cells.length;
  const padding = type.theatre === 'air' ? 0.32 : 0.18;
  const w = dims.cellSize - padding;
  const h = dims.cellSize * (type.theatre === 'air' ? 0.5 : 0.65);
  const d = dims.cellSize - padding;

  const first = unit.cells[0];
  const last = unit.cells[len - 1];
  if (!first || !last) return group;

  cellCenter(dims, first.layer, first.x, first.z, tmpA);
  cellCenter(dims, last.layer, last.x, last.z, tmpB);

  const center = tmpA.clone().add(tmpB).multiplyScalar(0.5);
  const geomLen = unit.orientation === 'x' ? dims.cellSize * len - padding : w;
  const geomDep = unit.orientation === 'z' ? dims.cellSize * len - padding : d;
  const geom = new BoxGeometry(
    unit.orientation === 'x' ? geomLen : w,
    h,
    unit.orientation === 'z' ? geomDep : d,
  );

  const material = new MeshStandardMaterial({
    color: type.color,
    transparent: opts.ghost === true,
    opacity: opts.ghost === true ? 0.45 : 1,
    metalness: 0.25,
    roughness: 0.55,
    emissive: type.color,
    emissiveIntensity: opts.ghost === true ? 0.4 : 0.15,
  });

  const body = new Mesh(geom, material);
  body.position.copy(center);
  // small lift to keep the ship "on top" of the surface plane visually
  if (type.theatre === 'surface') body.position.y += h * 0.5;
  group.add(body);

  // wireframe accent
  const edges = new EdgesGeometry(geom);
  const lineMat = new LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: opts.ghost === true ? 0.45 : 0.65,
  });
  const wire = new LineSegments(edges, lineMat);
  wire.position.copy(body.position);
  group.add(wire);

  return group;
}
