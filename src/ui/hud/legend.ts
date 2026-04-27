import { storageKeys, writeFlag } from '../../app/storage';

export interface Legend {
  el: HTMLElement;
}

interface LegendEntry {
  icon: string;
  label: string;
  hint: string;
  cls?: string;
}

const ENTRIES: LegendEntry[] = [
  { icon: '◯', label: 'Cella libera', hint: 'Mai attaccata' },
  { icon: '✕', label: 'Mancato', hint: 'Tiro a vuoto', cls: 'miss' },
  { icon: '💥', label: 'Colpito', hint: 'Unità danneggiata', cls: 'hit' },
  { icon: '💀', label: 'Affondata', hint: 'Unità eliminata', cls: 'sunk' },
  { icon: '❗', label: 'Mina', hint: 'Esplode 3×3 sulla superficie', cls: 'mine' },
];

/**
 * Legend rendered as a `<details>` accordion, closed by default. The
 * user's last open/closed choice is persisted to localStorage so it
 * survives a refresh — we read it once at construction time.
 */
export function createLegend(): Legend {
  const el = document.createElement('details');
  el.className = 'legend-accordion';
  // Closed by default per spec. The toggle event below persists the
  // open/closed state to localStorage for future reads (Phase 2 may
  // surface that preference; Phase 1 always opens closed for clarity).

  el.innerHTML = `
    <summary class="legend-summary">
      <span class="legend-title">Legenda</span>
      <span class="legend-toggle" aria-hidden="true">▾</span>
    </summary>
    <ul class="legend-body"></ul>
  `;

  const list = el.querySelector<HTMLUListElement>('.legend-body')!;
  for (const entry of ENTRIES) {
    const li = document.createElement('li');
    if (entry.cls) li.dataset.kind = entry.cls;
    li.innerHTML = `
      <span class="legend-icon" aria-hidden="true">${entry.icon}</span>
      <span class="legend-label">${entry.label}</span>
      <span class="legend-hint">${entry.hint}</span>
    `;
    list.appendChild(li);
  }

  el.addEventListener('toggle', () => {
    writeFlag(storageKeys.legendCollapsed, !el.open);
  });

  return { el };
}
