/**
 * Top-level application state machine. Sits above GameState (which only
 * tracks the in-match status). Modes:
 *
 *   menu          — main menu visible, no match running
 *   lobby         — online lobby flow (chooser/create/join/connecting)
 *   placing       — match active, player is placing the fleet
 *   playing       — match active, turns alternating
 *   game-over     — match ended, victory/defeat screen visible
 *
 * The how-to overlay and the exit-confirm dialog are modal layers, not
 * modes — they don't change AppMode. matchKind distinguishes singleplayer
 * (vs AI) from online (vs P2P opponent).
 */

export type AppMode = 'menu' | 'lobby' | 'placing' | 'playing' | 'game-over';

export type Difficulty = 'recluta' | 'veterano' | 'ammiraglio';

export type MatchKind = 'singleplayer' | 'online';

export interface AppSnapshot {
  mode: AppMode;
  matchKind: MatchKind;
  difficulty: Difficulty;
  winner: 'human' | 'ai' | null;
}

type Listener = (s: AppSnapshot) => void;

export class AppState {
  private _mode: AppMode = 'menu';
  private _matchKind: MatchKind = 'singleplayer';
  private _difficulty: Difficulty = 'recluta';
  private _winner: 'human' | 'ai' | null = null;
  private readonly listeners = new Set<Listener>();

  get mode(): AppMode {
    return this._mode;
  }

  get matchKind(): MatchKind {
    return this._matchKind;
  }

  get difficulty(): Difficulty {
    return this._difficulty;
  }

  get winner(): 'human' | 'ai' | null {
    return this._winner;
  }

  snapshot(): AppSnapshot {
    return {
      mode: this._mode,
      matchKind: this._matchKind,
      difficulty: this._difficulty,
      winner: this._winner,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Begin a new match against the AI of the given difficulty. */
  startMatch(difficulty: Difficulty): void {
    if (this._mode !== 'menu' && this._mode !== 'game-over') return;
    this._difficulty = difficulty;
    this._matchKind = 'singleplayer';
    this._winner = null;
    this._mode = 'placing';
    this.emit();
  }

  /** Enter the online lobby flow (chooser → create/join → connecting). */
  enterLobby(): void {
    if (this._mode !== 'menu' && this._mode !== 'game-over') return;
    this._matchKind = 'online';
    this._winner = null;
    this._mode = 'lobby';
    this.emit();
  }

  /** Online: lobby connected, both peers committed, transition to placing. */
  startOnlineMatch(): void {
    if (this._mode !== 'lobby') return;
    this._mode = 'placing';
    this.emit();
  }

  /** Player has confirmed the fleet and battle starts. */
  beginPlay(): void {
    if (this._mode !== 'placing') return;
    this._mode = 'playing';
    this.emit();
  }

  /** End the current match with a winner. */
  endMatch(winner: 'human' | 'ai'): void {
    if (this._mode !== 'playing') return;
    this._winner = winner;
    this._mode = 'game-over';
    this.emit();
  }

  /** Tear down the active match and return to the menu. */
  exitToMenu(): void {
    if (this._mode === 'menu') return;
    this._winner = null;
    this._matchKind = 'singleplayer';
    this._mode = 'menu';
    this.emit();
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }
}

/** True when an in-match exit confirmation is required. */
export function isInMatch(mode: AppMode): boolean {
  return mode === 'placing' || mode === 'playing';
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  recluta: 'Recluta',
  veterano: 'Veterano',
  ammiraglio: 'Ammiraglio',
};

export function difficultyLabel(d: Difficulty): string {
  return DIFFICULTY_LABELS[d];
}
