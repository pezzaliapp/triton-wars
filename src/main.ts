import './styles/main.css';
import { createScene } from './game/engine/scene';
import { createOrbitControls } from './game/engine/controls';
import { createVolumetricGrid, GRID_DIMENSIONS } from './game/grid/volumetric-grid';
import { registerServiceWorker } from './pwa/sw-registration';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) {
  throw new Error('canvas #scene not found');
}

const sceneCtx = createScene(canvas);
const grid = createVolumetricGrid(GRID_DIMENSIONS);
sceneCtx.scene.add(grid);

const controls = createOrbitControls(sceneCtx.camera, canvas);

const tick = (): void => {
  controls.update();
  sceneCtx.render();
  requestAnimationFrame(tick);
};

requestAnimationFrame(tick);

registerServiceWorker();
