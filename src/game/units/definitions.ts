/**
 * Unit definitions per Phase 2.
 *
 * Layer index reference (matches volumetric-grid.ts):
 *   0 = underwater-deep
 *   1 = underwater-mid
 *   2 = surface (sea level)
 *   3 = air-low
 *   4 = air-mid
 *   5 = air-high
 *
 * Special abilities are deferred to Phase 4 except for the Mine, which is
 * passive (3x3 surface explosion when hit) and is handled in attack.ts.
 */

export type Theatre = 'air' | 'surface' | 'underwater';

export type UnitTypeId =
  | 'caccia'
  | 'bombardiere'
  | 'drone'
  | 'portaerei'
  | 'incrociatore'
  | 'cacciatorpediniere'
  | 'sommergibile'
  | 'mina';

export interface UnitType {
  id: UnitTypeId;
  label: string;
  theatre: Theatre;
  layer: number;
  length: number;
  /** Hex color for the placeholder box mesh. */
  color: number;
  /** True if multi-cell units only — single-cell units have no orientation. */
  rotatable: boolean;
  /** Phase 2: only the mine has a passive ability. */
  abilityId: 'mine-3x3' | null;
}

export const UNIT_TYPES: Record<UnitTypeId, UnitType> = {
  caccia: {
    id: 'caccia',
    label: 'Caccia',
    theatre: 'air',
    layer: 3,
    length: 1,
    color: 0xffd166,
    rotatable: false,
    abilityId: null,
  },
  bombardiere: {
    id: 'bombardiere',
    label: 'Bombardiere',
    theatre: 'air',
    layer: 4,
    length: 2,
    color: 0xef476f,
    rotatable: true,
    abilityId: null,
  },
  drone: {
    id: 'drone',
    label: 'Drone',
    theatre: 'air',
    layer: 5,
    length: 1,
    color: 0xb5e2fa,
    rotatable: false,
    abilityId: null,
  },
  portaerei: {
    id: 'portaerei',
    label: 'Portaerei',
    theatre: 'surface',
    layer: 2,
    length: 5,
    color: 0x118ab2,
    rotatable: true,
    abilityId: null,
  },
  incrociatore: {
    id: 'incrociatore',
    label: 'Incrociatore',
    theatre: 'surface',
    layer: 2,
    length: 4,
    color: 0x06aed5,
    rotatable: true,
    abilityId: null,
  },
  cacciatorpediniere: {
    id: 'cacciatorpediniere',
    label: 'Cacciatorpediniere',
    theatre: 'surface',
    layer: 2,
    length: 3,
    color: 0x048ba8,
    rotatable: true,
    abilityId: null,
  },
  sommergibile: {
    id: 'sommergibile',
    label: 'Sommergibile',
    theatre: 'underwater',
    layer: 1,
    length: 3,
    color: 0x2a9d8f,
    rotatable: true,
    abilityId: null,
  },
  mina: {
    id: 'mina',
    label: 'Mina',
    theatre: 'underwater',
    layer: 0,
    length: 1,
    color: 0xe63946,
    rotatable: false,
    abilityId: 'mine-3x3',
  },
};

/**
 * Default fleet for Phase 2: one of each plus a second mine for tactical
 * interest. 9 units, 21 cells total on a 10x10 footprint.
 */
export const DEFAULT_FLEET: UnitTypeId[] = [
  'portaerei',
  'incrociatore',
  'cacciatorpediniere',
  'caccia',
  'bombardiere',
  'drone',
  'sommergibile',
  'mina',
  'mina',
];

export function getUnitType(id: UnitTypeId): UnitType {
  return UNIT_TYPES[id];
}
