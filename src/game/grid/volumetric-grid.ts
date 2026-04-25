import {
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';

export interface GridDimensions {
  width: number;
  depth: number;
  layers: number;
  cellSize: number;
}

export const GRID_DIMENSIONS: GridDimensions = {
  width: 10,
  depth: 10,
  layers: 6,
  cellSize: 1.6,
};

interface LayerStyle {
  color: number;
  fillOpacity: number;
}

const LAYERS: LayerStyle[] = [
  { color: 0x143a6b, fillOpacity: 0.14 }, // underwater-deep
  { color: 0x1a4f86, fillOpacity: 0.12 }, // underwater-mid
  { color: 0x2da7ff, fillOpacity: 0.2 }, //  surface (sea level)
  { color: 0x9bd8ff, fillOpacity: 0.08 }, // air-low
  { color: 0xc6e6ff, fillOpacity: 0.06 }, // air-mid
  { color: 0xe6f3ff, fillOpacity: 0.04 }, // air-high
];

export function createVolumetricGrid(dims: GridDimensions): Group {
  const group = new Group();
  group.name = 'volumetric-grid';

  const totalWidth = dims.width * dims.cellSize;
  const totalDepth = dims.depth * dims.cellSize;
  const totalHeight = dims.layers * dims.cellSize;

  group.add(buildOuterFrame(totalWidth, totalHeight, totalDepth));

  for (let i = 0; i < dims.layers; i++) {
    const layer = LAYERS[i] ?? LAYERS[LAYERS.length - 1];
    if (!layer) continue;

    const baseY = i * dims.cellSize - totalHeight / 2;

    const fill = new Mesh(
      new PlaneGeometry(totalWidth, totalDepth),
      new MeshBasicMaterial({
        color: layer.color,
        transparent: true,
        opacity: layer.fillOpacity,
        depthWrite: false,
      }),
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = baseY + 0.002;
    group.add(fill);

    group.add(buildLayerLines(dims, layer.color, baseY));
  }

  // top cap lines
  group.add(buildLayerLines(dims, 0xe6f3ff, totalHeight / 2));

  // raise the structure so the surface (layer index 2) sits near y=0
  const surfaceLocalY = 2 * dims.cellSize - totalHeight / 2;
  group.position.y = -surfaceLocalY;

  return group;
}

function buildLayerLines(dims: GridDimensions, colorHex: number, y: number): LineSegments {
  const positions: number[] = [];
  const halfW = (dims.width * dims.cellSize) / 2;
  const halfD = (dims.depth * dims.cellSize) / 2;

  for (let i = 0; i <= dims.width; i++) {
    const x = -halfW + i * dims.cellSize;
    positions.push(x, y, -halfD, x, y, halfD);
  }
  for (let j = 0; j <= dims.depth; j++) {
    const z = -halfD + j * dims.cellSize;
    positions.push(-halfW, y, z, halfW, y, z);
  }

  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const mat = new LineBasicMaterial({
    color: new Color(colorHex),
    transparent: true,
    opacity: 0.42,
  });
  return new LineSegments(geom, mat);
}

function buildOuterFrame(w: number, h: number, d: number): LineSegments {
  const box = new BoxGeometry(w, h, d);
  const edges = new EdgesGeometry(box);
  const mat = new LineBasicMaterial({
    color: 0x5fd4ff,
    transparent: true,
    opacity: 0.6,
  });
  return new LineSegments(edges, mat);
}
