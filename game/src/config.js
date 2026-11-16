// Voltgrid: a grid defense game. Core tuning constants and shared types.
// The whole balance of the game hangs here: tower prices, enemy scaling, wave pacing.

export const GRID = {
  cols: 12,
  rows: 9,
  cell: 64,
  get width() { return this.cols * this.cell; },
  get height() { return this.rows * this.cell; },
};

export const CANVAS = {
  width: GRID.width,
  height: GRID.height + 72, // top HUD band
};

export const CORE = {
  x: 0, // cell column of the core (left edge)
  y: 4, // cell row of the core (middle)
  hp: 20,
};

export const SPAWN = {
  x: GRID.cols - 1, // enemies enter at the right edge
  y: 4,
};

export const TOWERS = {
  pulse: {
    name: 'Pulse',
    cost: 40,
    range: 2.4,
    damage: 10,
    cooldown: 0.55,
    color: '#4fd1ff',
    desc: 'Fast single-target zap',
  },
  arc: {
    name: 'Arc',
    cost: 75,
    range: 3.2,
    damage: 6,
    cooldown: 1.1,
    chain: 3,
    color: '#b389ff',
    desc: 'Lightning chains to 3 foes',
  },
  rail: {
    name: 'Rail',
    cost: 120,
    range: 5.5,
    damage: 45,
    cooldown: 2.2,
    color: '#ffb35c',
    desc: 'Long-range heavy shot',
  },
};

// Each upgrade level multiplies damage by 1.35 and range by 1.08, and costs
// 80% of the tower's base price per level already reached.
export const UPGRADE = {
  damageMult: 1.35,
  rangeMult: 1.08,
  maxLevel: 3,
  costFactor: 0.8,
};

export const ENEMIES = {
  runner: { name: 'Runner', hp: 26, speed: 1.5, bounty: 8, color: '#ff5d5d', radius: 11 },
  brute: { name: 'Brute', hp: 110, speed: 0.8, bounty: 22, color: '#c96a3a', radius: 16 },
  swarmer: { name: 'Swarmer', hp: 12, speed: 2.2, bounty: 4, color: '#ffd94f', radius: 8 },
  shield: { name: 'Shield', hp: 70, speed: 1.0, bounty: 18, color: '#7fd8a8', radius: 14, armor: 3 },
};

export const WAVES = {
  baseCount: 6,
  countGrowth: 1.6,
  hpGrowth: 1.22,
  speedGrowth: 1.03,
  bountyGrowth: 1.1,
  startInterval: 1.1, // seconds between spawns, shrinks each wave
  intervalShrink: 0.94,
};

export const START_CREDITS = 90;

export const STEP = 1 / 60;

export const COLORS = {
  bg: '#0b0e14',
  grid: '#161b26',
  gridLine: '#1c2333',
  hud: '#0e1219',
  text: '#d7e3f4',
  dim: '#8194b0',
  core: '#37e6a2',
  coreRing: '#37e6a233',
  path: '#131824',
};

// A wave's composition: which enemy kinds join at which wave number.
export function wavePool(wave) {
  const pool = ['runner'];
  if (wave >= 2) pool.push('swarmer');
  if (wave >= 3) pool.push('brute');
  if (wave >= 5) pool.push('shield');
  return pool;
}
