import { readFlag, storageKeys, writeFlag } from '../../app/storage';

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

export function createLegend(): Legend {
  const el = document.createElement('section');
  el.className = 'legend';
  el.setAttribute('aria-labelledby', 'legend-title');

  const initialCollapsed = readFlag(storageKeys.legendCollapsed);
  el.dataset.collapsed = initialCollapsed ? 'true' : 'false';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'legend-header';
  header.id = 'legend-title';
  header.setAttribute('aria-expanded', initialCollapsed ? 'false' : 'true');
  header.setAttribute('aria-controls', 'legend-body');
  header.innerHTML = `
    <span class="legend-title-text">Legenda</span>
    <span class="legend-toggle" aria-hidden="true">▾</span>
  `;

  const body = document.createElement('ul');
  body.className = 'legend-body';
  body.id = 'legend-body';
  for (const entry of ENTRIES) {
    const li = document.createElement('li');
    if (entry.cls) li.dataset.kind = entry.cls;
    li.innerHTML = `
      <span class="legend-icon" aria-hidden="true">${entry.icon}</span>
      <span class="legend-label">${entry.label}</span>
      <span class="legend-hint">${entry.hint}</span>
    `;
    body.appendChild(li);
  }

  header.addEventListener('click', () => {
    const isCollapsed = el.dataset.collapsed === 'true';
    const next = !isCollapsed;
    el.dataset.collapsed = next ? 'true' : 'false';
    header.setAttribute('aria-expanded', next ? 'false' : 'true');
    writeFlag(storageKeys.legendCollapsed, next);
  });

  el.appendChild(header);
  el.appendChild(body);
  return { el };
}
