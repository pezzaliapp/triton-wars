export interface LayerPickerOptions {
  layers: number;
  initial: number;
  onChange: (layer: number) => void;
}

export interface LayerPicker {
  el: HTMLElement;
  setLayer: (layer: number) => void;
  show: (visible: boolean) => void;
}

interface LayerMeta {
  name: string;
  short: string;
  theatre: 'air' | 'surface' | 'sub';
  icon: string;
}

export const LAYER_META: Record<number, LayerMeta> = {
  0: { name: 'Sub profondo', short: 'Profondo', theatre: 'sub', icon: '🌑' },
  1: { name: 'Sub poco profondo', short: 'Sub basso', theatre: 'sub', icon: '🌑' },
  2: { name: 'Superficie', short: 'Superficie', theatre: 'surface', icon: '🌊' },
  3: { name: 'Aereo basso', short: 'Aereo basso', theatre: 'air', icon: '☁️' },
  4: { name: 'Aereo medio', short: 'Aereo medio', theatre: 'air', icon: '☁️' },
  5: { name: 'Aereo alto', short: 'Aereo alto', theatre: 'air', icon: '☁️' },
};

export function layerLabel(layer: number): string {
  return LAYER_META[layer]?.name ?? `Strato ${layer}`;
}

export function createLayerPicker(opts: LayerPickerOptions): LayerPicker {
  const el = document.createElement('div');
  el.className = 'layer-picker';
  el.setAttribute('role', 'tablist');
  el.setAttribute('aria-label', 'Strato bersaglio');

  let active = opts.initial;
  for (let i = opts.layers - 1; i >= 0; i--) {
    const meta = LAYER_META[i] ?? { name: `Strato ${i}`, short: `L${i}`, theatre: 'air', icon: '◯' };
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'layer-btn';
    btn.dataset.layer = String(i);
    btn.dataset.theatre = meta.theatre;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-label', meta.name);
    btn.innerHTML = `
      <span class="layer-icon" aria-hidden="true">${meta.icon}</span>
      <span class="layer-num">${i}</span>
      <span class="layer-name">${meta.short}</span>
    `;
    btn.addEventListener('click', () => {
      active = i;
      opts.onChange(i);
      refresh();
    });
    el.appendChild(btn);
  }

  const refresh = (): void => {
    el.querySelectorAll<HTMLButtonElement>('.layer-btn').forEach((b) => {
      const isActive = b.dataset.layer === String(active);
      b.dataset.active = isActive ? 'true' : 'false';
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      b.tabIndex = isActive ? 0 : -1;
    });
  };
  refresh();

  return {
    el,
    setLayer(layer) {
      active = layer;
      refresh();
    },
    show(visible) {
      el.style.display = visible ? '' : 'none';
    },
  };
}
