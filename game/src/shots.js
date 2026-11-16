// VOLTGRID — deterministic screenshot scenes for ?shot=start|play|end&seed=N.
// No animation loop runs in shot mode: one scripted simulation, one rendered frame, then __shotReady.

import { STEP, WIDTH, HEIGHT, TOWERS, upgradeCost } from './config.js';
import {
  createGame,
  startGame,
  startNextWave,
  tryBuild,
  buildCheck,
  upgradeTower,
  updateWorld,
} from './world.js';
import { drawFrame } from './render.js';

// Cells and tower order for the 45 second showreel.
const PLAY_PLAN = [
  { type: 'pulse', col: 2, row: 3 },
  { type: 'pulse', col: 2, row: 5 },
  { type: 'arc', col: 4, row: 3 },
  { type: 'pulse', col: 5, row: 5 },
  { type: 'rail', col: 7, row: 3 },
  { type: 'arc', col: 6, row: 5 },
  { type: 'rail', col: 9, row: 5 },
];

// Two basic towers only, so the run falls on its own and the end card is reachable.
const END_PLAN = [
  { type: 'pulse', col: 2, row: 3 },
  { type: 'pulse', col: 2, row: 5 },
];

function makePilot(mode) {
  const plan = mode === 'end' ? END_PLAN : PLAY_PLAN;
  let built = 0;
  let wait = 0;
  return {
    step(game) {
      if (game.phase === 'wavebreak') {
        if (mode === 'play') tryUpgrade(game);
        wait += 1;
        if (wait >= 20) {
          wait = 0;
          startNextWave(game);
        }
        return;
      }
      if (game.phase !== 'playing') return;
      if (built >= plan.length) return;
      const item = plan[built];
      const check = buildCheck(game, item.type, item.col, item.row);
      if (check.ok) {
        if (tryBuild(game, item.type, item.col, item.row)) built += 1;
      } else if (check.code !== 'credits' && check.code !== 'ok') {
        built += 1;
      }
    },
  };
}

function tryUpgrade(game) {
  for (const tower of game.towers) {
    if (tower.level >= 3) continue;
    const def = TOWERS[tower.type];
    const cost = upgradeCost(def, tower.level);
    if (game.credits >= cost + 120) {
      upgradeTower(game, tower);
      return;
    }
  }
}

function hasAction(game) {
  if (game.enemies.length < 2) return false;
  if (game.shots.length > 0) return true;
  for (const effect of game.effects) {
    if (effect.kind === 'bolt') return true;
  }
  return false;
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

/** Run one deterministic scene and draw the resulting frame. */
export function runShot(shot, seed) {
  const game = createGame(seed);
  if (shot === 'start') {
    drawOnce(game);
    markReady();
    return game;
  }
  const mode = shot === 'end' ? 'end' : 'play';
  startGame(game);
  const pilot = makePilot(mode);
  const step = () => {
    pilot.step(game);
    updateWorld(game, STEP);
    game.events.length = 0;
  };
  if (shot === 'play') {
    const target = Math.round(45 / STEP);
    for (let i = 0; i < target; i++) {
      step();
      if (game.phase === 'over' || game.phase === 'victory') break;
    }
    let extra = 0;
    while (extra < 240 && game.phase !== 'over' && game.phase !== 'victory' && !hasAction(game)) {
      step();
      extra += 1;
    }
    drawOnce(game);
    markReady();
    return game;
  }
  let steps = 0;
  const maxSteps = 60 * 60 * 6;
  while (steps < maxSteps && game.phase !== 'over' && game.phase !== 'victory') {
    step();
    steps += 1;
  }
  for (let i = 0; i < 36; i++) updateWorld(game, STEP);
  drawOnce(game);
  markReady();
  return game;
}
