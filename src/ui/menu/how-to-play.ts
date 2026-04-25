import { readFlag, storageKeys, writeFlag } from '../../app/storage';
import { trapFocus } from './focus-trap';

export interface HowToOptions {
  /** Called when the modal closes. */
  onClose: () => void;
  /** Pre-check the "don't show again" box (used on first auto-show). */
  preferSuppressOnFirstView?: boolean;
}

interface Slide {
  title: string;
  body: string;
  art: string; // emoji ascii art
}

const SLIDES: Slide[] = [
  {
    title: 'Tre teatri, una flotta',
    body:
      'Triton Wars è una battaglia volumetrica su sei strati: tre in aria (☁️), uno in superficie (🌊) e due sott\'acqua (🌑). Affonda l\'intera flotta nemica prima di essere affondato tu.',
    art: '☁️ ☁️ ☁️\n🌊\n🌑 🌑',
  },
  {
    title: 'Schiera la flotta',
    body:
      'Tap sulla griglia per piazzare ogni unità sullo strato giusto. Usa il pulsante "Ruota" (o il tasto R) per orientare le navi multi-cella. Il fantasma rosso ti dice quando una posizione non è valida.',
    art: '🟦 🟦 🟦 🟦 🟦  ←  Portaerei\n🟦 🟦 🟦 🟦       ←  Incrociatore',
  },
  {
    title: 'Attacca un colpo per turno',
    body:
      'A turni alternati scegli uno strato dalla barra in basso e tappi una cella nemica. ✕ = mancato. 💥 = colpito. 💀 = unità affondata. La flotta nemica resta nascosta finché non la affondi.',
    art: '◯ ◯ ◯\n◯ 💥 ◯\n◯ ◯ 💀',
  },
  {
    title: 'Attento alle mine',
    body:
      'Le mine ❗ stanno sul fondale. Quando colpisci una mina, esplode in un\'area 3×3 sulla superficie soprastante: può affondare le tue stesse navi se sono lì sopra.',
    art: '🌊 🌊 🌊\n🌊 🌊 🌊\n🌑 ❗ 🌑\n  →  💥 💥 💥\n      💥 ❗ 💥\n      💥 💥 💥',
  },
  {
    title: 'Vinci, perdi, ricomincia',
    body:
      'Affonda tutte le unità nemiche per vincere. Se la tua flotta cade, perdi. In ogni momento puoi premere "Esci" in alto a sinistra per tornare al menu.',
    art: '🏆',
  },
];

/** Show the how-to-play overlay. Auto-suppresses on next launches if the
 * checkbox stays checked at close time. */
export function showHowToPlay(opts: HowToOptions): void {
  const overlay = document.createElement('div');
  overlay.className = 'screen screen-howto';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'howto-title');

  const card = document.createElement('div');
  card.className = 'screen-card screen-card-howto';
  overlay.appendChild(card);

  let index = 0;
  let suppress = opts.preferSuppressOnFirstView ?? false;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'howto-close';
  closeBtn.setAttribute('aria-label', 'Chiudi');
  closeBtn.innerHTML = '✕';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'screen-eyebrow howto-eyebrow';

  const title = document.createElement('h2');
  title.className = 'screen-title screen-title-sm';
  title.id = 'howto-title';

  const art = document.createElement('pre');
  art.className = 'howto-art';
  art.setAttribute('aria-hidden', 'true');

  const body = document.createElement('p');
  body.className = 'screen-sub howto-body';

  const dots = document.createElement('div');
  dots.className = 'howto-dots';
  dots.setAttribute('role', 'tablist');
  dots.setAttribute('aria-label', 'Slide');
  for (let i = 0; i < SLIDES.length; i++) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'howto-dot';
    dot.dataset.index = String(i);
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', `Slide ${i + 1} di ${SLIDES.length}`);
    dot.addEventListener('click', () => goTo(i));
    dots.appendChild(dot);
  }

  const suppressLabel = document.createElement('label');
  suppressLabel.className = 'howto-suppress';
  suppressLabel.innerHTML = `
    <input type="checkbox" />
    <span>Non mostrare automaticamente all'avvio</span>
  `;
  const suppressInput = suppressLabel.querySelector<HTMLInputElement>('input')!;
  suppressInput.checked = suppress;
  suppressInput.addEventListener('change', () => {
    suppress = suppressInput.checked;
  });

  const nav = document.createElement('div');
  nav.className = 'howto-nav';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn-ghost';
  prevBtn.textContent = 'Indietro';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn-primary';
  nextBtn.textContent = 'Avanti';
  nav.appendChild(prevBtn);
  nav.appendChild(nextBtn);

  card.appendChild(closeBtn);
  card.appendChild(eyebrow);
  card.appendChild(title);
  card.appendChild(art);
  card.appendChild(body);
  card.appendChild(dots);

  const lastSlideExtras = document.createElement('div');
  lastSlideExtras.className = 'howto-last-extras';
  lastSlideExtras.appendChild(suppressLabel);
  card.appendChild(lastSlideExtras);

  card.appendChild(nav);

  document.body.appendChild(overlay);

  const goTo = (i: number): void => {
    index = Math.max(0, Math.min(SLIDES.length - 1, i));
    const slide = SLIDES[index]!;
    eyebrow.textContent = `Tutorial · ${index + 1} / ${SLIDES.length}`;
    title.textContent = slide.title;
    art.textContent = slide.art;
    body.textContent = slide.body;

    dots.querySelectorAll<HTMLButtonElement>('.howto-dot').forEach((d, di) => {
      const active = di === index;
      d.dataset.active = active ? 'true' : 'false';
      d.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    prevBtn.disabled = index === 0;
    const isLast = index === SLIDES.length - 1;
    nextBtn.textContent = isLast ? 'Inizia' : 'Avanti';
    lastSlideExtras.style.display = isLast ? '' : 'none';
  };

  prevBtn.addEventListener('click', () => goTo(index - 1));
  nextBtn.addEventListener('click', () => {
    if (index < SLIDES.length - 1) {
      goTo(index + 1);
    } else {
      close();
    }
  });
  closeBtn.addEventListener('click', () => close());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const trap = trapFocus(overlay, () => close());

  const close = (): void => {
    writeFlag(storageKeys.howToSeen, suppress);
    trap.release();
    overlay.classList.add('screen-leave');
    window.setTimeout(() => {
      overlay.remove();
      opts.onClose();
    }, 220);
  };

  goTo(0);
}

export function hasSeenHowTo(): boolean {
  return readFlag(storageKeys.howToSeen);
}
