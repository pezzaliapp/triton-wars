import { describe, expect, it } from 'vitest';
import { AppState, isInMatch } from '../src/app/app-state';

describe('AppState', () => {
  it('starts in menu mode with default difficulty', () => {
    const app = new AppState();
    expect(app.mode).toBe('menu');
    expect(app.difficulty).toBe('recluta');
    expect(app.winner).toBeNull();
  });

  it('transitions menu → placing → playing → game-over with the chosen difficulty', () => {
    const app = new AppState();
    const seen: string[] = [];
    app.subscribe((s) => seen.push(s.mode));

    app.startMatch('recluta');
    expect(app.mode).toBe('placing');
    expect(app.difficulty).toBe('recluta');
    expect(seen).toContain('placing');

    app.beginPlay();
    expect(app.mode).toBe('playing');

    app.endMatch('human');
    expect(app.mode).toBe('game-over');
    expect(app.winner).toBe('human');
    expect(seen.at(-1)).toBe('game-over');
  });

  it('exitToMenu tears down the active match from any in-match mode', () => {
    const app = new AppState();
    app.startMatch('recluta');
    app.beginPlay();
    expect(isInMatch(app.mode)).toBe(true);

    app.exitToMenu();
    expect(app.mode).toBe('menu');
    expect(app.winner).toBeNull();
    expect(isInMatch(app.mode)).toBe(false);
  });

  it('endMatch only fires from playing (placing won\'t emit a winner)', () => {
    const app = new AppState();
    app.startMatch('recluta');
    // Calling endMatch from 'placing' should be a no-op
    app.endMatch('ai');
    expect(app.mode).toBe('placing');
    expect(app.winner).toBeNull();

    app.beginPlay();
    app.endMatch('ai');
    expect(app.mode).toBe('game-over');
    expect(app.winner).toBe('ai');
  });

  it('startMatch is allowed only from menu or game-over (not mid-match)', () => {
    const app = new AppState();
    app.startMatch('recluta');
    expect(app.mode).toBe('placing');
    // Cannot re-enter while placing
    app.startMatch('recluta');
    expect(app.mode).toBe('placing'); // unchanged
    // After exiting, can start again
    app.exitToMenu();
    app.startMatch('recluta');
    expect(app.mode).toBe('placing');
  });
});
