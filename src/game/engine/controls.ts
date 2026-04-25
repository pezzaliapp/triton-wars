import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three';

export interface OrbitControls {
  update: () => void;
  dispose: () => void;
}

interface OrbitOptions {
  minDistance: number;
  maxDistance: number;
  minPolar: number;
  maxPolar: number;
  rotateSpeed: number;
  zoomSpeed: number;
  dampingFactor: number;
}

const defaults: OrbitOptions = {
  minDistance: 12,
  maxDistance: 60,
  minPolar: 0.18,
  maxPolar: Math.PI / 2 - 0.05,
  rotateSpeed: 0.0075,
  zoomSpeed: 0.0015,
  dampingFactor: 0.12,
};

export function createOrbitControls(
  camera: PerspectiveCamera,
  domElement: HTMLElement,
  options: Partial<OrbitOptions> = {},
): OrbitControls {
  const opts = { ...defaults, ...options };
  const target = new Vector3(0, 0, 0);
  const offset = new Vector3();
  const spherical = new Spherical();
  const sphericalDelta = new Spherical();
  let scale = 1;

  offset.copy(camera.position).sub(target);
  spherical.setFromVector3(offset);

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;

  const onPointerDown = (e: PointerEvent): void => {
    domElement.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinchStart = pinchDistance();
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      sphericalDelta.theta -= dx * opts.rotateSpeed;
      sphericalDelta.phi -= dy * opts.rotateSpeed;
    } else if (pointers.size === 2) {
      const distance = pinchDistance();
      if (pinchStart > 0) {
        const ratio = pinchStart / distance;
        scale *= ratio;
      }
      pinchStart = distance;
    }
  };

  const onPointerUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      pinchStart = 0;
    }
    if (domElement.hasPointerCapture(e.pointerId)) {
      domElement.releasePointerCapture(e.pointerId);
    }
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    scale *= 1 + e.deltaY * opts.zoomSpeed;
  };

  const pinchDistance = (): number => {
    const it = pointers.values();
    const a = it.next().value;
    const b = it.next().value;
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);
  domElement.addEventListener('wheel', onWheel, { passive: false });
  domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  const update = (): void => {
    spherical.theta += sphericalDelta.theta;
    spherical.phi += sphericalDelta.phi;
    spherical.phi = MathUtils.clamp(spherical.phi, opts.minPolar, opts.maxPolar);
    spherical.radius *= scale;
    spherical.radius = MathUtils.clamp(spherical.radius, opts.minDistance, opts.maxDistance);
    spherical.makeSafe();

    offset.setFromSpherical(spherical);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);

    sphericalDelta.theta *= 1 - opts.dampingFactor;
    sphericalDelta.phi *= 1 - opts.dampingFactor;
    scale = 1 + (scale - 1) * (1 - opts.dampingFactor);
  };

  const dispose = (): void => {
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('pointercancel', onPointerUp);
    domElement.removeEventListener('wheel', onWheel);
    pointers.clear();
  };

  return { update, dispose };
}
