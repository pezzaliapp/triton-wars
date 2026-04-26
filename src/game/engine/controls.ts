import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three';

export interface OrbitControls {
  update: () => void;
  dispose: () => void;
  /** Reset the camera distance from the target. Call this on window or
   * visualViewport resize so the volume keeps filling the viewport. */
  setRadius: (radius: number) => void;
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
  minDistance: 16,
  maxDistance: 90,
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

  const safePreventDefault = (e: Event): void => {
    if (e.cancelable) e.preventDefault();
  };

  const clearPointers = (): void => {
    pointers.clear();
    pinchStart = 0;
  };

  const onPointerDown = (e: PointerEvent): void => {
    safePreventDefault(e);
    // Skip setPointerCapture for touch — iOS Safari leaks capture state
    // when the finger leaves the canvas (lands on HUD overlays), which
    // breaks subsequent input across the whole match. Mouse / pen still
    // benefit from capture because their gesture model is reliable.
    if (e.pointerType !== 'touch' && domElement.setPointerCapture) {
      try {
        domElement.setPointerCapture(e.pointerId);
      } catch {
        // Ignored — non-fatal on Safari/WebViews where capture occasionally
        // throws InvalidStateError after a transient detachment.
      }
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinchStart = pinchDistance();
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    safePreventDefault(e);

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      sphericalDelta.theta -= dx * opts.rotateSpeed;
      sphericalDelta.phi -= dy * opts.rotateSpeed;
    } else if (pointers.size === 2) {
      const distance = pinchDistance();
      if (pinchStart > 0 && distance > 0) {
        const ratio = pinchStart / distance;
        scale *= ratio;
      }
      pinchStart = distance;
    }
  };

  const onPointerUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;

    if (domElement.hasPointerCapture?.(e.pointerId)) {
      try {
        domElement.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored — non-fatal on Safari/WebViews.
      }
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

  domElement.addEventListener('pointerdown', onPointerDown, { passive: false });
  domElement.addEventListener('pointermove', onPointerMove, { passive: false });
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);
  domElement.addEventListener('lostpointercapture', clearPointers);
  domElement.addEventListener('wheel', onWheel, { passive: false });
  domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  // Window-level fallbacks: when capture is skipped on touch the finger-up
  // can land outside the canvas (e.g. on the bottom-sheet drawer). Without
  // these the pointers map keeps stale entries and the next gesture fails.
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('blur', clearPointers);
  document.addEventListener('visibilitychange', clearPointers);

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
    domElement.removeEventListener('lostpointercapture', clearPointers);
    domElement.removeEventListener('wheel', onWheel);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('blur', clearPointers);
    document.removeEventListener('visibilitychange', clearPointers);
    pointers.clear();
  };

  const setRadius = (radius: number): void => {
    spherical.radius = MathUtils.clamp(radius, opts.minDistance, opts.maxDistance);
    // Reset any in-flight pinch zoom so the new value applies cleanly.
    scale = 1;
    // Re-place the camera immediately so the next render isn't a frame behind.
    offset.setFromSpherical(spherical);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  };

  return { update, dispose, setRadius };
}
