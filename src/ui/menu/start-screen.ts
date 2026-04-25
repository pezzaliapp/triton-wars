export interface StartScreenOptions {
  onStart: () => void;
}

export function createStartScreen(opts: StartScreenOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'screen screen-start';
  root.innerHTML = `
    <div class="screen-card">
      <div class="screen-eyebrow">PWA · Battaglia volumetrica</div>
      <h1 class="screen-title">Triton Wars</h1>
      <p class="screen-sub">Tre teatri di guerra. Una sola flotta. Affonda la nemica prima di essere affondato.</p>
      <button type="button" class="btn btn-primary" data-start>Inizia partita</button>
      <p class="screen-hint">vs IA Recluta · piazzamento manuale · turni alternati</p>
    </div>
  `;
  const button = root.querySelector<HTMLButtonElement>('[data-start]');
  button?.addEventListener('click', () => {
    opts.onStart();
    root.classList.add('screen-leave');
    setTimeout(() => root.remove(), 320);
  });
  return root;
}
