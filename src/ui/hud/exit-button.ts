export interface ExitButton {
  el: HTMLButtonElement;
  show: (visible: boolean) => void;
}

export function createExitButton(onClick: () => void): ExitButton {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'btn btn-exit';
  el.setAttribute('aria-label', 'Esci dalla partita e torna al menu');
  el.innerHTML = `
    <span class="btn-exit-icon" aria-hidden="true">←</span>
    <span class="btn-exit-label">Esci</span>
  `;
  el.addEventListener('click', () => onClick());

  return {
    el,
    show(visible) {
      el.style.display = visible ? '' : 'none';
    },
  };
}
