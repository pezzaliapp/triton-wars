import { describe, expect, it } from 'vitest';
import { GRID_DIMENSIONS } from '../src/game/grid/volumetric-grid';
import { PlayerGrid } from '../src/game/grid/grid-state';
import { RecruitAi } from '../src/game/ai/recruit';
import { DEFAULT_FLEET } from '../src/game/units/definitions';

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('RecruitAi', () => {
  it('autoPlaces the full default fleet without errors', () => {
    const ai = new RecruitAi(GRID_DIMENSIONS, seededRng(42));
    const grid = new PlayerGrid(GRID_DIMENSIONS);
    const placements = ai.autoPlace(grid);
    expect(placements.length).toBe(DEFAULT_FLEET.length);
  });

  it('switches to hunt mode after a hit and probes neighbours', () => {
    const ai = new RecruitAi(GRID_DIMENSIONS, seededRng(7));
    // First shot
    const first = ai.chooseTarget();
    expect(first).not.toBeNull();
    if (!first) return;

    // Tell it that was a hit
    ai.notifyResult(first, 'hit');

    // The next 4 (or fewer if at edge) targets should be cardinal neighbours of `first`
    const neighbourCells = new Set([
      `${first.layer}:${first.x + 1}:${first.z}`,
      `${first.layer}:${first.x - 1}:${first.z}`,
      `${first.layer}:${first.x}:${first.z + 1}`,
      `${first.layer}:${first.x}:${first.z - 1}`,
    ]);

    let huntPicks = 0;
    for (let i = 0; i < 4; i++) {
      const t = ai.chooseTarget();
      if (!t) break;
      if (neighbourCells.has(`${t.layer}:${t.x}:${t.z}`)) huntPicks += 1;
      // pretend they were misses so hunt empties
      ai.notifyResult(t, 'miss');
    }
    expect(huntPicks).toBeGreaterThan(0);
  });

  it('clears hunt queue when target is sunk', () => {
    const ai = new RecruitAi(GRID_DIMENSIONS, seededRng(11));
    const first = ai.chooseTarget();
    expect(first).not.toBeNull();
    if (!first) return;
    ai.notifyResult(first, 'hit');
    // sink: neighbours should not all be probed; queue cleared
    ai.notifyResult(first, 'sunk');
    // After sink, next targets revert to random across volume — we can't
    // assert exact cells but we can ensure no error is thrown and we get a target.
    const t = ai.chooseTarget();
    expect(t).not.toBeNull();
  });

  it('does not return the same cell twice', () => {
    const ai = new RecruitAi(GRID_DIMENSIONS, seededRng(99));
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const t = ai.chooseTarget();
      if (!t) break;
      const key = `${t.layer}:${t.x}:${t.z}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      ai.notifyResult(t, 'miss');
    }
  });
});
