import type { ActionLog, LogEntry } from '../../game/state/action-log';
import { UNIT_TYPES } from '../../game/units/definitions';

export interface LogView {
  el: HTMLElement;
  detach: () => void;
}

/**
 * Action log presented as an `<details>` accordion. Closed by default
 * to keep the bottom-sheet body visually quiet — the user opens it on
 * demand. The list itself scrolls inside the accordion body.
 */
export function createLogView(log: ActionLog): LogView {
  const el = document.createElement('details');
  el.className = 'log-accordion';
  // closed by default: open when user taps. open attribute persists across
  // state machine refresh because we never replace this element.
  el.innerHTML = `
    <summary class="log-summary">
      <span class="log-title">Log</span>
      <span class="log-toggle" aria-hidden="true">▾</span>
    </summary>
    <ul class="log-list" data-list></ul>
  `;
  const list = el.querySelector<HTMLUListElement>('[data-list]')!;

  const append = (entry: LogEntry): void => {
    const text = formatEntry(entry);
    if (!text) return;
    const li = document.createElement('li');
    li.dataset.kind = entryKind(entry);
    li.textContent = text;
    list.appendChild(li);
    while (list.children.length > 60) list.removeChild(list.children[0]!);
    list.scrollTop = list.scrollHeight;
  };

  for (const e of log.all()) append(e);
  const unsubscribe = log.subscribe(append);
  return { el, detach: unsubscribe };
}

function entryKind(e: LogEntry): string {
  if (e.kind === 'shot') return e.shooter === 'human' ? `shot-human-${e.result}` : `shot-ai-${e.result}`;
  if (e.kind === 'mine-explode') return 'mine';
  if (e.kind === 'turn') return `turn-${e.player}`;
  if (e.kind === 'game-over') return `over-${e.winner}`;
  return e.kind;
}

function formatEntry(e: LogEntry): string {
  switch (e.kind) {
    case 'place':
      return `Schierata: ${UNIT_TYPES[e.typeId].label}`;
    case 'shot': {
      const verb = e.shooter === 'human' ? 'Tu' : 'IA';
      const where = `(${e.x},${e.z}) L${e.layer}`;
      if (e.result === 'miss') return `${verb} → ${where}: a vuoto`;
      if (e.result === 'hit') return `${verb} → ${where}: colpo a segno`;
      if (e.result === 'sunk') return `${verb} → ${where}: AFFONDATA ${UNIT_TYPES[e.sunkType ?? 'caccia'].label}`;
      return '';
    }
    case 'mine-explode': {
      const verb = e.shooter === 'human' ? 'Tu hai detonato' : 'IA ha detonato';
      const sunkCount = e.impacts.filter((i) => i.result === 'sunk').length;
      const hitCount = e.impacts.filter((i) => i.result === 'hit').length;
      const parts: string[] = [];
      if (sunkCount > 0) parts.push(`${sunkCount} affondata/e`);
      if (hitCount > 0) parts.push(`${hitCount} colpi`);
      const summary = parts.length > 0 ? parts.join(', ') : 'nessun danno';
      return `${verb} una mina (${summary})`;
    }
    case 'turn':
      return e.player === 'human' ? '— Turno tuo —' : '— Turno IA —';
    case 'game-over':
      return e.winner === 'human' ? '🏆 VITTORIA' : '☠ Sconfitta';
  }
}
