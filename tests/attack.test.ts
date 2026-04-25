import { describe, expect, it } from 'vitest';
import { GRID_DIMENSIONS } from '../src/game/grid/volumetric-grid';
import { PlayerGrid } from '../src/game/grid/grid-state';
import { createUnit } from '../src/game/units/unit';
import { resolveAttack } from '../src/game/rules/attack';

describe('resolveAttack', () => {
  it('returns miss on empty cell', () => {
    const grid = new PlayerGrid(GRID_DIMENSIONS);
    grid.addUnit(createUnit('a', 'portaerei', { x: 0, z: 0 }, 'x'));
    const out = resolveAttack(grid, 2, 5, 5);
    expect(out.result).toBe('miss');
    expect(out.cascades).toHaveLength(0);
  });

  it('returns hit and sunk after enough hits', () => {
    const grid = new PlayerGrid(GRID_DIMENSIONS);
    const ship = createUnit('a', 'cacciatorpediniere', { x: 0, z: 0 }, 'x'); // length 3
    grid.addUnit(ship);
    expect(resolveAttack(grid, 2, 0, 0).result).toBe('hit');
    expect(resolveAttack(grid, 2, 1, 0).result).toBe('hit');
    const last = resolveAttack(grid, 2, 2, 0);
    expect(last.result).toBe('sunk');
    expect(last.sunkType).toBe('cacciatorpediniere');
    expect(ship.sunk).toBe(true);
  });

  it('marks repeated shots as already', () => {
    const grid = new PlayerGrid(GRID_DIMENSIONS);
    grid.addUnit(createUnit('a', 'caccia', { x: 4, z: 4 }, 'x'));
    expect(resolveAttack(grid, 3, 4, 4).result).toBe('sunk');
    expect(resolveAttack(grid, 3, 4, 4).result).toBe('already');
  });

  it('mine 3x3 explosion damages adjacent surface units', () => {
    const grid = new PlayerGrid(GRID_DIMENSIONS);
    // Mine at layer 0 (underwater-deep), column (5,5)
    const mine = createUnit('m', 'mina', { x: 5, z: 5 }, 'x');
    grid.addUnit(mine);
    // Surface unit at (4..6, 5)
    const surface = createUnit('s', 'cacciatorpediniere', { x: 4, z: 5 }, 'x');
    grid.addUnit(surface);

    const out = resolveAttack(grid, 0, 5, 5);
    expect(out.result).toBe('sunk'); // mine itself
    expect(out.cascades.length).toBe(9); // 3x3 footprint

    // The three cells that overlap with the surface ship should produce hit/sunk
    const hits = out.cascades.filter((c) => c.cell.layer === 2 && c.cell.z === 5 && c.cell.x >= 4 && c.cell.x <= 6);
    expect(hits.length).toBe(3);
    // sequential hits collapse to one sunk
    expect(hits.some((c) => c.result === 'sunk')).toBe(true);
    expect(surface.sunk).toBe(true);
  });

  it('mine explosion does not double-shoot a cell already targeted', () => {
    const grid = new PlayerGrid(GRID_DIMENSIONS);
    grid.addUnit(createUnit('m', 'mina', { x: 5, z: 5 }, 'x'));
    // pre-emptively shoot a surface cell that would be in the explosion footprint
    grid.recordShot(2, 5, 5);
    const out = resolveAttack(grid, 0, 5, 5);
    expect(out.cascades.find((c) => c.cell.layer === 2 && c.cell.x === 5 && c.cell.z === 5)).toBeUndefined();
  });
});
