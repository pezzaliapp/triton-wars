/**
 * Phase 2 turn manager: a thin shim around GameState. Reserved for
 * Phase 4 when 3-4 player free-for-all and special abilities arrive.
 */
import type { GameState, Player } from '../state/game-state';

export function nextPlayer(current: Player): Player {
  return current === 'human' ? 'ai' : 'human';
}

export function isHumanTurn(state: GameState): boolean {
  return state.phase === 'playing' && state.turn === 'human';
}

export function isAiTurn(state: GameState): boolean {
  return state.phase === 'playing' && state.turn === 'ai';
}
