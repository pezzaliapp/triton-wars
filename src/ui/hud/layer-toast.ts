import { layerLabel } from './layer-picker';

export interface LayerToast {
  el: HTMLElement;
  show: (layer: number) => void;
  hide: () => void;
}

const SHOW_MS = 1000;

export function createLayerToast(): LayerToast {
  const el = document.createElement('div');
  el.className = 'layer-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.dataset.visible = 'false';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'layer-toast-eyebrow';
  eyebrow.textContent = 'Stai vedendo';
  const label = document.createElement('strong');
  label.className = 'layer-toast-label';
  el.appendChild(eyebrow);
  el.appendChild(label);

  let timer: number | null = null;

  const show = (layer: number): void => {
    label.textContent = layerLabel(layer).toUpperCase();
    el.dataset.visible = 'true';
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      el.dataset.visible = 'false';
      timer = null;
    }, SHOW_MS);
  };

  const hide = (): void => {
    el.dataset.visible = 'false';
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  return { el, show, hide };
}
