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

const LAYER_LABELS: Record<number, { name: string; theatre: string }> = {
  0: { name: 'Profondo', theatre: 'sub' },
  1: { name: 'Sub', theatre: 'sub' },
  2: { name: 'Superficie', theatre: 'surface' },
  3: { name: 'Bassa', theatre: 'air' },
  4: { name: 'Media', theatre: 'air' },
  5: { name: 'Alta', theatre: 'air' },
};

export function createLayerPicker(opts: LayerPickerOptions): LayerPicker {
  const el = document.createElement('div');
  el.className = 'layer-picker';
  let active = opts.initial;
  for (let i = opts.layers - 1; i >= 0; i--) {
    const meta = LAYER_LABELS[i] ?? { name: `L${i}`, theatre: 'air' };
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'layer-btn';
    btn.dataset.layer = String(i);
    btn.dataset.theatre = meta.theatre;
    btn.innerHTML = `<span class="layer-num">${i}</span><span class="layer-name">${meta.name}</span>`;
    btn.addEventListener('click', () => {
      active = i;
      opts.onChange(i);
      refresh();
    });
    el.appendChild(btn);
  }

  const refresh = (): void => {
    el.querySelectorAll<HTMLButtonElement>('.layer-btn').forEach((b) => {
      b.dataset.active = b.dataset.layer === String(active) ? 'true' : 'false';
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
