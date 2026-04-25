import type { Difficulty } from '../../app/app-state';
import { difficultyLabel } from '../../app/app-state';

export interface MainMenuOptions {
  initialDifficulty: Difficulty;
  onPlayVsComputer: (difficulty: Difficulty) => void;
  onHowTo: () => void;
}

export interface MainMenu {
  el: HTMLElement;
  destroy: () => void;
}

interface DifficultyMeta {
  id: Difficulty;
  label: string;
  description: string;
  enabled: boolean;
  badge?: string;
}

const DIFFICULTIES: DifficultyMeta[] = [
  {
    id: 'recluta',
    label: 'Recluta',
    description: 'Tiri casuali con caccia ai colpiti',
    enabled: true,
  },
  {
    id: 'veterano',
    label: 'Veterano',
    description: 'Euristica probabilistica',
    enabled: false,
    badge: 'Fase 4',
  },
  {
    id: 'ammiraglio',
    label: 'Ammiraglio',
    description: 'Mappa di densità + caccia mirata',
    enabled: false,
    badge: 'Fase 4',
  },
];

export function createMainMenu(opts: MainMenuOptions): MainMenu {
  const root = document.createElement('div');
  root.className = 'main-menu';
  root.setAttribute('role', 'main');

  let selected: Difficulty = opts.initialDifficulty;

  const card = document.createElement('div');
  card.className = 'main-menu-card';

  const logo = document.createElement('div');
  logo.className = 'main-menu-logo';
  logo.innerHTML = `
    <span class="main-menu-eyebrow">PWA · Battaglia volumetrica 3D</span>
    <h1 class="main-menu-title">TRITON WARS</h1>
    <p class="main-menu-tagline">Tre teatri. Una flotta. Una sola sopravvissuta.</p>
  `;

  // Difficulty selector
  const diffWrap = document.createElement('fieldset');
  diffWrap.className = 'difficulty';
  diffWrap.innerHTML = '<legend class="difficulty-legend">Difficoltà IA</legend>';
  const diffList = document.createElement('div');
  diffList.className = 'difficulty-list';
  diffList.setAttribute('role', 'radiogroup');
  diffList.setAttribute('aria-label', 'Difficoltà IA');

  for (const d of DIFFICULTIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'difficulty-btn';
    btn.dataset.diff = d.id;
    btn.dataset.selected = d.id === selected ? 'true' : 'false';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', d.id === selected ? 'true' : 'false');
    if (!d.enabled) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.title = `Disponibile in ${d.badge ?? 'una versione futura'}`;
    }
    btn.innerHTML = `
      <span class="difficulty-name">${d.label}</span>
      <span class="difficulty-desc">${d.description}</span>
      ${d.badge && !d.enabled ? `<span class="difficulty-badge">${d.badge}</span>` : ''}
    `;
    if (d.enabled) {
      btn.addEventListener('click', () => {
        selected = d.id;
        refreshDifficulty();
      });
    }
    diffList.appendChild(btn);
  }
  diffWrap.appendChild(diffList);

  const refreshDifficulty = (): void => {
    diffList.querySelectorAll<HTMLButtonElement>('.difficulty-btn').forEach((b) => {
      const isSel = b.dataset.diff === selected;
      b.dataset.selected = isSel ? 'true' : 'false';
      b.setAttribute('aria-checked', isSel ? 'true' : 'false');
    });
    playLabel.textContent = `Gioca vs Computer · ${difficultyLabel(selected)}`;
  };

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'main-menu-actions';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'btn btn-primary btn-lg';
  const playLabel = document.createElement('span');
  playLabel.textContent = `Gioca vs Computer · ${difficultyLabel(selected)}`;
  playBtn.appendChild(playLabel);
  playBtn.addEventListener('click', () => opts.onPlayVsComputer(selected));

  const onlineBtn = document.createElement('button');
  onlineBtn.type = 'button';
  onlineBtn.className = 'btn btn-ghost btn-lg';
  onlineBtn.disabled = true;
  onlineBtn.setAttribute('aria-disabled', 'true');
  onlineBtn.title = 'Disponibile in Fase 3';
  onlineBtn.innerHTML = `
    <span>Gioca Online</span>
    <span class="btn-badge">Fase 3</span>
  `;

  const howToBtn = document.createElement('button');
  howToBtn.type = 'button';
  howToBtn.className = 'btn btn-ghost btn-lg';
  howToBtn.textContent = 'Come si gioca';
  howToBtn.addEventListener('click', () => opts.onHowTo());

  actions.appendChild(playBtn);
  actions.appendChild(onlineBtn);
  actions.appendChild(howToBtn);

  // Footer
  const footer = document.createElement('footer');
  footer.className = 'main-menu-footer';
  footer.innerHTML = `
    <span>v0.2.5 · open source · MIT</span>
    <span class="footer-sep">·</span>
    <a href="https://github.com/pezzaliapp/triton-wars" target="_blank" rel="noopener noreferrer">repo</a>
    <span class="footer-sep">·</span>
    <span>Alessandro Pezzali</span>
  `;

  card.appendChild(logo);
  card.appendChild(diffWrap);
  card.appendChild(actions);
  card.appendChild(footer);
  root.appendChild(card);

  return {
    el: root,
    destroy() {
      root.remove();
    },
  };
}
