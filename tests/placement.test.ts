import { describe, expect, it } from 'vitest';
import { GRID_DIMENSIONS } from '../src/game/grid/volumetric-grid';
import { checkPlacement } from '../src/game/units/placement';
import { createUnit } from '../src/game/units/unit';

describe('checkPlacement', () => {
  it('accepts a valid in-bounds placement on an empty grid', () => {
    const result = checkPlacement('portaerei', { x: 0, z: 0 }, 'x', GRID_DIMENSIONS, []);
    expect(result.valid).toBe(true);
  });

  it('rejects out-of-bounds along X', () => {
    const result = checkPlacement('portaerei', { x: 6, z: 0 }, 'x', GRID_DIMENSIONS, []);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('out-of-bounds');
  });

  it('rejects out-of-bounds along Z', () => {
    const result = checkPlacement('incrociatore', { x: 0, z: 8 }, 'z', GRID_DIMENSIONS, []);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('out-of-bounds');
  });

  it('detects overlap when two units share a cell on the same layer', () => {
    const carrier = createUnit('a', 'portaerei', { x: 2, z: 5 }, 'x');
    const result = checkPlacement('cacciatorpediniere', { x: 4, z: 5 }, 'x', GRID_DIMENSIONS, [carrier]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('overlap');
  });

  it('allows units on different layers to share x/z', () => {
    const sub = createUnit('a', 'sommergibile', { x: 4, z: 4 }, 'x');
    const result = checkPlacement('cacciatorpediniere', { x: 4, z: 4 }, 'x', GRID_DIMENSIONS, [sub]);
    // sommergibile is layer 1, cacciatorpediniere is layer 2 → no overlap
    expect(result.valid).toBe(true);
  });

  it('allows orthogonal touching but not crossing', () => {
    const carrier = createUnit('a', 'portaerei', { x: 0, z: 0 }, 'x'); // (0,0)..(4,0)
    const cross = checkPlacement('incrociatore', { x: 2, z: -1 }, 'z', GRID_DIMENSIONS, [carrier]);
    expect(cross.valid).toBe(false); // out-of-bounds first
    const crossing = checkPlacement('incrociatore', { x: 2, z: 0 }, 'z', GRID_DIMENSIONS, [carrier]);
    expect(crossing.valid).toBe(false);
    expect(crossing.error).toBe('overlap');
    const touching = checkPlacement('incrociatore', { x: 2, z: 1 }, 'z', GRID_DIMENSIONS, [carrier]);
    expect(touching.valid).toBe(true);
  });
});
