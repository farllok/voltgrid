// Screenshot scenes behind ?shot=start|play|end: play the real rules forward
// from a fresh seeded world with a small autopilot, so each frame is what a
// real game looks like and the same seed always gives the same frame.

import { GRID, TOWERS } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

const TITLE_SECONDS = 0.02; // title frame is staged, not simulated
const PLAY_SECONDS = 46;    // mid-game action with towers, waves and zaps
const END_SECONDS = 600;    // let the end scene run until the core falls
const HORIZON_PLAY = 0.6;   // autopilot look-ahead (seconds) during play
const HORIZON_END = 0.22;   // a hurried pilot late in the run
const SAMPLE = 1 / 30;

/** Seconds until a runner at `dir` (-1|0|1) meets an enemy; Infinity if never. */
function timeToHit(world, dir, horizon) {
  const sample = 1 / 30;
  for (let t = sample; t <= horizon; t += sample) {
    const coreX = 0.5 * GRID.cell;
    for (const e of world.enemies) {
      const x = e.x - e.speed * GRID.cell * t;
      if (x <= coreX + 20) return t;
    }
  }
  return Infinity;
}

/**
 * A tiny pilot that builds a sensible economy, then steers nothing: towers do
 * the work. It places Pulse towers near the core lane early, upgrades them,
 * and starts waves as soon as it can.
 */
function playForward(world, seconds) {
  const plan = [
    { t: 0.5, kind: 'pulse', col: 2, row: 4 },
    { t: 1.5, kind: 'pulse', col: 3, row: 3 },
    { t: 2.5, kind: 'pulse', col: 3, row: 5 },
    { t: 4.0, kind: 'arc', col: 2, row: 3 },
    { t: 5.5, kind: 'pulse', col: 1, row: 4 },
  ];
  let planIndex = 0;
  const step = 1 / 30;
  const waves = world.waveTotal;
  world.startWave();
  for (let t = 0; t < seconds; t += step) {
    while (planIndex < plan.length && t >= plan[planIndex].t) {
      const p = plan[planIndex];
      world.placeTower(p.kind, p.col, p.row);
      planIndex += 1;
    }
    // Upgrade any max-level candidate tower whenever affordable.
    if (Math.floor(t / step) % 30 === 0) {
      for (const tower of world.towers.values()) {
        if (world.upgradeTower(tower)) break;
      }
    }
    world.step(step);
    if (world.state === 'between') world.startWave();
    if (world.state === 'over' || world.state === 'victory') break;
  }
  void waves;
  void timeToHit;
}

export function stageShot(name, world, seed, input) {
  world.reset(seed);
  if (name === 'start') {
    // A staged title frame: the pristine grid, before any wave.
    return { screen: SCREEN_TITLE, buildKind: null };
  }
  if (name === 'play') {
    playForward(world, PLAY_SECONDS);
    // Build the mid-game look: a couple of rail towers on the field's back.
    world.placeTower('rail', 6, 2);
    world.placeTower('arc', 5, 5);
    input.buildKind = 'pulse';
    return { screen: SCREEN_PLAY, buildKind: 'pulse' };
  }
  // end: run a whole hurried defense until the core falls (or 12 waves pass).
  playForward(world, END_SECONDS);
  const screen = world.state === 'victory' ? SCREEN_VICTORY : SCREEN_OVER;
  return { screen, buildKind: null };
}

void TOWERS;
