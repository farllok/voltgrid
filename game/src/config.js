// VOLTGRID — layout constants, palette and balance tables.
// Every tunable number lives here so the simulation module stays pure logic.

export const TILE = 64;
export const COLS = 12;
export const ROWS = 9;
export const FIELD_W = COLS * TILE; // 768
export const FIELD_H = ROWS * TILE; // 576
export const HUD_H = 72;
export const WIDTH = FIELD_W; // 768
export const HEIGHT = FIELD_H + HUD_H; // 648
export const STEP = 1 / 60;

export const LANE_ROW = 4;
export const LANE_Y = LANE_ROW * TILE + TILE / 2; // 288
export const CORE_COL = 0;
export const CORE_ROW = LANE_ROW;
export const CORE_X = CORE_COL * TILE + TILE / 2; // 32
export const CORE_Y = LANE_Y;
export const CORE_HP = 20;
export const START_CREDITS = 90;
export const TOTAL_WAVES = 12;

export const WAVE_HP_GROWTH = 1.22;
export const WAVE_REWARD_GROWTH = 1.16;
export const MAX_LEVEL = 3;
export const UPGRADE_DAMAGE_GROWTH = 1.35;
export const UPGRADE_RANGE_GROWTH = 1.08;
export const UPGRADE_COST_SHARE = 0.8;
export const SELL_SHARE = 0.7;

export const COLORS = {
  bg: '#0b0e14',
  panel: '#111a29',
  panelDeep: '#0c131f',
  panelLine: '#243450',
  grid: '#1c2333',
  gridBright: '#2b3a54',
  lane: '#101a2b',
  laneLine: '#24344f',
  text: '#dbe6f5',
  textDim: '#8593ab',
  textFaint: '#4e5c74',
  cyan: '#4fd1ff',
  purple: '#b389ff',
  orange: '#ffb35c',
  green: '#37e6a2',
  red: '#ff5d73',
  amber: '#ffcf6e',
  steel: '#93a9c4',
  white: '#f4f8ff',
};

export const TOWER_ORDER = ['pulse', 'arc', 'rail'];

export const TOWERS = {
  pulse: {
    key: 'pulse',
    name: 'PULSE',
    cost: 40,
    color: COLORS.cyan,
    deep: '#0c2c3c',
    damage: 12,
    range: 154,
    interval: 0.4,
    projectile: 'pulse',
    speed: 640,
  },
  arc: {
    key: 'arc',
    name: 'ARC',
    cost: 75,
    color: COLORS.purple,
    deep: '#241a3c',
    damage: 11,
    range: 172,
    interval: 0.85,
    projectile: 'chain',
    speed: 0,
    chain: 3,
    chainFalloff: 0.72,
    chainRange: 120,
  },
  rail: {
    key: 'rail',
    name: 'RAIL',
    cost: 120,
    color: COLORS.orange,
    deep: '#33230f',
    damage: 40,
    range: 268,
    interval: 1.25,
    projectile: 'rail',
    speed: 1500,
  },
};

export const ENEMIES = {
  runner: {
    key: 'runner',
    name: 'RUNNER',
    hp: 26,
    speed: 82,
    reward: 7,
    leak: 1,
    armor: 0,
    size: 13,
    color: '#ff6b81',
  },
  swarmer: {
    key: 'swarmer',
    name: 'SWARMER',
    hp: 13,
    speed: 66,
    reward: 4,
    leak: 1,
    armor: 0,
    size: 10,
    color: COLORS.amber,
  },
  brute: {
    key: 'brute',
    name: 'BRUTE',
    hp: 92,
    speed: 40,
    reward: 14,
    leak: 2,
    armor: 0,
    size: 22,
    color: '#ff4d6d',
  },
  shield: {
    key: 'shield',
    name: 'SHIELD',
    hp: 58,
    speed: 50,
    reward: 11,
    leak: 2,
    armor: 3,
    size: 16,
    color: COLORS.steel,
  },
};

// Each wave lists spawn groups: `at` is the delay in seconds before the group starts,
// `gap` the delay between neighbours inside the group.
export const WAVES = [
  { bonus: 30, groups: [{ type: 'runner', count: 5, gap: 0.9, at: 0 }] },
  { bonus: 34, groups: [{ type: 'runner', count: 6, gap: 0.8, at: 0 }, { type: 'swarmer', count: 3, gap: 0.45, at: 3.2 }] },
  { bonus: 38, groups: [{ type: 'swarmer', count: 8, gap: 0.45, at: 0 }] },
  { bonus: 42, groups: [{ type: 'runner', count: 8, gap: 0.7, at: 0 }, { type: 'swarmer', count: 4, gap: 0.5, at: 3.5 }] },
  { bonus: 46, groups: [{ type: 'brute', count: 2, gap: 2.1, at: 1 }, { type: 'runner', count: 6, gap: 0.7, at: 0 }] },
  { bonus: 50, groups: [{ type: 'shield', count: 4, gap: 1.6, at: 0.6 }, { type: 'runner', count: 6, gap: 0.6, at: 2.4 }] },
  { bonus: 55, groups: [{ type: 'runner', count: 10, gap: 0.55, at: 0 }, { type: 'brute', count: 2, gap: 2.2, at: 1.6 }] },
  { bonus: 60, groups: [{ type: 'swarmer', count: 14, gap: 0.34, at: 0 }, { type: 'shield', count: 3, gap: 1.5, at: 3.4 }] },
  { bonus: 65, groups: [{ type: 'brute', count: 4, gap: 1.8, at: 0 }, { type: 'shield', count: 4, gap: 1.4, at: 3.2 }] },
  { bonus: 72, groups: [{ type: 'runner', count: 12, gap: 0.5, at: 0 }, { type: 'swarmer', count: 10, gap: 0.4, at: 3 }, { type: 'brute', count: 2, gap: 2.2, at: 1.6 }] },
  { bonus: 80, groups: [{ type: 'shield', count: 6, gap: 1.3, at: 0 }, { type: 'brute', count: 4, gap: 1.8, at: 2.2 }] },
  { bonus: 100, groups: [{ type: 'runner', count: 10, gap: 0.5, at: 0.5 }, { type: 'brute', count: 6, gap: 1.3, at: 0 }, { type: 'shield', count: 4, gap: 1.2, at: 3.2 }] },
];

/** Centre of a grid cell, in canvas pixels. */
export function cellCenter(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

/** Damage, range and fire interval of a tower definition at `level` (1..MAX_LEVEL). */
export function towerStats(def, level) {
  const steps = Math.max(0, level - 1);
  return {
    damage: def.damage * Math.pow(UPGRADE_DAMAGE_GROWTH, steps),
    range: def.range * Math.pow(UPGRADE_RANGE_GROWTH, steps),
    interval: def.interval,
  };
}

/** Credits to raise a tower from `level` to `level + 1`. */
export function upgradeCost(def, level) {
  return Math.round(def.cost * UPGRADE_COST_SHARE * level);
}

/** Credits returned when a tower is sold. */
export function sellValue(tower) {
  return Math.floor(tower.invested * SELL_SHARE);
}
