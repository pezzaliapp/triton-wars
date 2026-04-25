import { sfx } from './sfx';
import type { LogEntry } from '../state/action-log';

/** Plays the appropriate SFX for a given log entry. */
export function playForLogEntry(entry: LogEntry): void {
  switch (entry.kind) {
    case 'place':
      sfx.place();
      break;
    case 'shot':
      if (entry.result === 'miss') sfx.miss();
      else if (entry.result === 'hit') sfx.hit();
      else if (entry.result === 'sunk') sfx.sunk();
      break;
    case 'mine-explode':
      sfx.mineExplode();
      break;
    case 'turn':
      if (entry.player === 'human') sfx.turnPing();
      break;
    case 'game-over':
      if (entry.winner === 'human') sfx.victory();
      else sfx.defeat();
      break;
  }
}
