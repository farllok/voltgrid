// VOLTGRID — deterministic screenshot scenes for ?shot=start|play|end|victory&seed=N.
// No animation loop runs in shot mode: one scripted simulation, one rendered frame, then __shotReady.

import { STEP, WIDTH, HEIGHT, TILE, LANE_Y, TOWERS, upgradeCost } from './config.js';
import {
  createGame,
  startGame,
  startNextWave,
  tryBuild,
  buildCheck,
  upgradeTower,
  spawnEnemy,
  updateWorld,
} from './world.js';
import { drawFrame } from './render.js';

// A nine-tower demo line: three of each type, so a single frame shows every turret,
// every projectile and the chain lightning at once.
const PLAY_PLAN = [
  { type: 'pulse', col: 2, row: 3 },
  { type: 'pulse', col: 2, row: 5 },
  { type: 'arc', col: 4, row: 3 },
  { type: 'pulse', col: 5, row: 5 },
  { type: 'rail', col: 7, row: 3 },
  { type: 'arc', col: 6, row: 5 },
  { type: 'rail', col: 9, row: 5 },
  { type: 'arc', col: 8, row: 2 },
  { type: 'pulse', col: 10, row: 6 },
];

// The full ladder the victory pilot climbs: heavy coverage of the lane, then upgrades.
const VICTORY_PLAN = [
  { type: 'pulse', col: 4, row: 3 },
  { type: 'pulse', col: 4, row: 5 },
  { type: 'arc', col: 6, row: 3 },
  { type: 'arc', col: 6, row: 5 },
  { type: 'pulse', col: 2, row: 3 },
  { type: 'pulse', col: 2, row: 5 },
  { type: 'rail', col: 8, row: 3 },
  { type: 'rail', col: 8, row: 5 },
  { type: 'arc', col: 5, row: 2 },
  { type: 'pulse', col: 7, row: 6 },
  { type: 'rail', col: 10, row: 3 },
  { type: 'rail', col: 10, row: 5 },
  { type: 'arc', col: 5, row: 6 },
  { type: 'pulse', col: 3, row: 2 },
  { type: 'pulse', col: 3, row: 6 },
  { type: 'rail', col: 9, row: 2 },
];

// Two basic towers only, so the run falls on its own and the end card is reachable.
const END_PLAN = [
  { type: 'pulse', col: 2, row: 3 },
  { type: 'pulse', col: 2, row: 5 },
];

// How long the play scene runs before the final showcase beat.
const PLAY_SECONDS = 88;

/** Builds the plan in order, then pours spare credits into upgrades. */
function makePilot(plan, options = {}) {
  const midReserve = options.midReserve ?? 60;
  const endReserve = options.endReserve ?? 0;
  let built = 0;
  let cursor = 0;

  const tryUpgradeOne = (game, reserve) => {
    const list = game.towers;
    if (list.length === 0) return false;
    for (let k = 0; k < list.length; k++) {
      const tower = list[(cursor + k) % list.length];
      if (tower.level >= 3) continue;
      const def = TOWERS[tower.type];
      const cost = upgradeCost(def, tower.level);
      if (game.credits >= cost + reserve) {
        if (upgradeTower(game, tower)) {
          cursor = (cursor + k + 1) % list.length;
          return true;
        }
      }
    }
    return false;
  };

  const tryBuildNext = (game) => {
    if (built >= plan.length) return false;
    const item = plan[built];
    const check = buildCheck(game, item.type, item.col, item.row);
    if (check.ok) {
      if (tryBuild(game, item.type, item.col, item.row)) {
        built += 1;
        return true;
      }
      return false;
    }
    if (check.code === 'credits') return false;
    // A cell that can never be built on is skipped rather than blocking the plan.
    built += 1;
    return true;
  };

  return {
    step(game) {
      if (game.phase === 'wavebreak') {
        tryBuildNext(game);
        if (built >= plan.length) tryUpgradeOne(game, endReserve);
        startNextWave(game);
        return;
      }
      if (game.phase !== 'playing') return;
      if (tryBuildNext(game)) return;
      if (built < plan.length) {
        if (game.credits >= 130) tryUpgradeOne(game, midReserve);
        return;
      }
      tryUpgradeOne(game, endReserve);
    },
  };
}

function stepOnce(game, pilot) {
  pilot.step(game);
  updateWorld(game, STEP);
  game.events.length = 0;
}

/** 2 = a kill burst is visible too, 1 = busy combat, 0 = not yet. */
function showcaseScore(game) {
  if (game.phase !== 'playing') return 0;
  if (game.enemies.length < 10) return 0;
  if (game.shots.length < 4) return 0;
  let bolts = 0;
  let bursts = 0;
  for (const effect of game.effects) {
    if (effect.kind === 'bolt') bolts += 1;
    else if (effect.kind === 'debris' || effect.kind === 'float') bursts += 1;
  }
  if (bolts < 1) return 0;
  return bursts > 0 ? 2 : 1;
}

/** Enemies staged for the play frame: every silhouette, spread across the lane. */
const SHOWCASE_CROWD = [
  { type: 'shield', x: 726, dy: -5, hpScale: 2.1 },
  { type: 'brute', x: 690, dy: 4, hpScale: 2.2 },
  { type: 'runner', x: 664, dy: -9, hpScale: 2.0 },
  { type: 'swarmer', x: 642, dy: 8, hpScale: 2.0 },
  { type: 'runner', x: 612, dy: -3, hpScale: 1.8 },
  { type: 'brute', x: 580, dy: -6, hpScale: 2.2 },
  { type: 'shield', x: 552, dy: 6, hpScale: 2.0 },
  { type: 'swarmer', x: 520, dy: -8, hpScale: 1.9 },
  { type: 'runner', x: 486, dy: 4, hpScale: 1.7 },
  { type: 'runner', x: 452, dy: -4, hpScale: 1.8 },
  { type: 'shield', x: 408, dy: 7, hpScale: 2.0 },
  { type: 'brute', x: 362, dy: -5, hpScale: 2.3 },
  { type: 'swarmer', x: 322, dy: 5, hpScale: 1.9 },
  { type: 'runner', x: 286, dy: -6, hpScale: 0.1 },
  { type: 'shield', x: 248, dy: 4, hpScale: 1.9 },
  { type: 'swarmer', x: 214, dy: -7, hpScale: 0.04 },
];

/** Push a staged crowd onto the lane, already engaged so hero bars are lit up. */
function injectShowcase(game) {
  for (const item of SHOWCASE_CROWD) {
    spawnEnemy(game, item.type, { x: item.x, y: LANE_Y + item.dy, hpScale: item.hpScale });
  }
}

/** A tower placed directly (title attract mode only — the field is otherwise decoration). */
function addDemoTower(game, type, col, row, level, aim) {
  const def = TOWERS[type];
  game.towers.push({
    id: game.nextTowerId++,
    type,
    col,
    row,
    x: col * TILE + TILE / 2,
    y: row * TILE + TILE / 2,
    level,
    cd: 0,
    aim,
    invested: def.cost * level,
  });
}

/** A frozen skirmish behind the title card, so the cover frame is not an empty grid. */
function stageTitleAttract(game) {
  game.time = 2.4;
  game.credits = 90;
  addDemoTower(game, 'rail', 11, 2, 3, Math.PI);
  addDemoTower(game, 'arc', 11, 6, 2, Math.PI);
  addDemoTower(game, 'pulse', 10, 3, 2, Math.PI);
  addDemoTower(game, 'rail', 10, 6, 2, Math.PI);
  spawnEnemy(game, 'brute', { x: 704, y: LANE_Y + 3 });
  spawnEnemy(game, 'runner', { x: 752, y: LANE_Y - 8 });
  spawnEnemy(game, 'shield', { x: 760, y: LANE_Y + 7 });
  spawnEnemy(game, 'swarmer', { x: 726, y: LANE_Y - 2 });
}

function drawOnce(game) {
  const canvas = document.getElementById('game');
  if (canvas === null) return false;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return false;
  drawFrame(ctx, game);
  return true;
}

function markReady() {
  if (typeof window !== 'undefined') window.__shotReady = true;
}

/** Run the play scene up to a live frame and return the game for the drawn frame. */
function runPlayScene(game) {
  startGame(game);
  const pilot = makePilot(PLAY_PLAN, { midReserve: 90, endReserve: 150 });
  const target = Math.round(PLAY_SECONDS / STEP);
  for (let i = 0; i < target; i++) {
    stepOnce(game, pilot);
    if (game.phase === 'over' || game.phase === 'victory') break;
  }
  // Leave a wavebreak if the timer landed on one.
  let guard = 0;
  while (game.phase === 'wavebreak' && guard < 600) {
    stepOnce(game, pilot);
    guard += 1;
  }
  if (game.phase === 'playing') {
    // Freeze the spawn schedule so this staged beat is the final moment of the wave.
    game.waveQueue.length = 0;
    // A curated crowd guarantees the frame has every enemy type on screen.
    injectShowcase(game);
    let extra = 0;
    while (extra < 300 && showcaseScore(game) < 2 && game.phase === 'playing') {
      stepOnce(game, pilot);
      extra += 1;
    }
  }
  return game;
}

/** Play a full autopilot match to the GRID SECURED screen. */
function runVictoryScene(game) {
  startGame(game);
  const pilot = makePilot(VICTORY_PLAN);
  const maxSteps = Math.round(300 / STEP);
  let steps = 0;
  while (steps < maxSteps && game.phase !== 'over' && game.phase !== 'victory') {
    stepOnce(game, pilot);
    steps += 1;
  }
  return game;
}

/** Run one deterministic scene and draw the resulting frame. */
export function runShot(shot, seed) {
  const game = createGame(seed);
  if (shot === 'start') {
    stageTitleAttract(game);
    drawOnce(game);
    markReady();
    return game;
  }
  if (shot === 'victory') {
    runVictoryScene(game);
    // Let the victory bloom expand a little before the frame is taken.
    for (let i = 0; i < 24; i++) updateWorld(game, STEP);
    drawOnce(game);
    markReady();
    return game;
  }
  if (shot === 'play') {
    runPlayScene(game);
    drawOnce(game);
    markReady();
    return game;
  }
  // 'end' (and any unknown shot): a short doomed run producing the defeat card.
  startGame(game);
  const pilot = makePilot(END_PLAN);
  let steps = 0;
  const maxSteps = 60 * 60 * 6;
  while (steps < maxSteps && game.phase !== 'over' && game.phase !== 'victory') {
    stepOnce(game, pilot);
    steps += 1;
  }
  for (let i = 0; i < 36; i++) updateWorld(game, STEP);
  drawOnce(game);
  markReady();
  return game;
}
