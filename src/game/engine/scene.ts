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
  scene.fog = new Fog(0x03070f, 28, 80);

  const camera = new PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(18, 14, 22);
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
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  handleResize();
  window.addEventListener('resize', handleResize);

  const render = (): void => {
    renderer.render(scene, camera);
  };

  const dispose = (): void => {
    window.removeEventListener('resize', handleResize);
    renderer.dispose();
  };

  return { scene, camera, renderer, render, dispose };
}
