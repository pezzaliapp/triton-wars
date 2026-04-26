import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';

export interface SceneContext {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  render: () => void;
  dispose: () => void;
}

/**
 * Camera placement targets. The volumetric grid is roughly 16x9.6x16 in
 * world units. We want it centered and to fill ~78% of the smaller
 * viewport dimension on every screen — narrow phones get a closer
 * camera, wide monitors get the full wide framing.
 *
 * The camera looks from a 3/4 angle along VIEW_DIR. Distance from the
 * origin is recomputed per viewport size; the OrbitControls owns the
 * actual camera position thereafter and accepts setRadius() updates
 * when the viewport changes.
 */
const VIEW_DIR = { x: 0.62, y: 0.5, z: 0.78 };
const GRID_RADIUS = 13.5;
const FOV_DEG = 38;
const TARGET_FILL = 0.78;

const DIST_MIN = 22;
const DIST_MAX = 60;

export function computeCameraDistance(viewportW: number, viewportH: number): number {
  const aspect = viewportW / viewportH;
  const vfovRad = (FOV_DEG * Math.PI) / 180;
  const hfovRad = 2 * Math.atan(Math.tan(vfovRad / 2) * aspect);
  const limitingFov = Math.min(vfovRad, hfovRad);
  const distance = GRID_RADIUS / (TARGET_FILL * Math.tan(limitingFov / 2));
  return Math.max(DIST_MIN, Math.min(DIST_MAX, distance));
}

/** Initial camera position along VIEW_DIR at the right distance for the
 * current viewport. Used only at construction; subsequent updates flow
 * through OrbitControls.setRadius(). */
function initialCameraPosition(): [number, number, number] {
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  const d = computeCameraDistance(w || 1, h || 1);
  const len = Math.hypot(VIEW_DIR.x, VIEW_DIR.y, VIEW_DIR.z);
  return [
    (VIEW_DIR.x / len) * d,
    (VIEW_DIR.y / len) * d,
    (VIEW_DIR.z / len) * d,
  ];
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x03070f, 1);

  const scene = new Scene();
  scene.background = new Color(0x03070f);
  scene.fog = new Fog(0x03070f, 28, 110);

  const camera = new PerspectiveCamera(FOV_DEG, 1, 0.1, 200);
  const [px, py, pz] = initialCameraPosition();
  camera.position.set(px, py, pz);
  camera.lookAt(0, 0, 0);

  const hemi = new HemisphereLight(0x9ec7ff, 0x0a1a2f, 0.6);
  scene.add(hemi);

  const sun = new DirectionalLight(0xfff1d0, 0.9);
  sun.position.set(12, 20, 8);
  scene.add(sun);

  const moon = new DirectionalLight(0x6fa8ff, 0.4);
  moon.position.set(-15, 10, -10);
  scene.add(moon);

  const handleResize = (): void => {
    const vv = window.visualViewport;
    const w = (vv?.width ?? window.innerWidth) || canvas.clientWidth || 1;
    const h = (vv?.height ?? window.innerHeight) || canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Camera POSITION is owned by OrbitControls — we don't touch it here,
    // otherwise the next frame's orbit.update() would override us anyway.
    // main.ts wires its own resize listener that calls orbit.setRadius()
    // with computeCameraDistance(w, h) so the framing follows the viewport.
  };
  handleResize();
  window.addEventListener('resize', handleResize);
  window.visualViewport?.addEventListener('resize', handleResize);

  const render = (): void => {
    renderer.render(scene, camera);
  };

  const dispose = (): void => {
    window.removeEventListener('resize', handleResize);
    window.visualViewport?.removeEventListener('resize', handleResize);
    renderer.dispose();
  };

  return { scene, camera, renderer, render, dispose };
}
