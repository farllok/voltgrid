// Voltgrid entry point: canvas boot, game loop, and the ?shot= scene driver
// that stages a title/play/end frame for the screenshots.

import { CANVAS, STEP } from './config.js';
import { Input } from './input.js';
import { draw, screenOf } from './render.js';
import { Sound } from './sound.js';
import { World, EVENT_OVER, EVENT_VICTORY } from './world.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
canvas.width = CANVAS.width;
canvas.height = CANVAS.height;
const ctx = canvas.getContext('2d');
const sound = new Sound();
const world = new World(1);
const input = new Input(canvas, world, sound);

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') ?? '1') || 1;

// --- Screenshot scene mode: play forward deterministically, draw one frame.
if (shotName) {
  const staged = stageShot(shotName, world, seed, input);
  draw(ctx, world, { screen: staged.screen, buildKind: staged.buildKind });
  window.__shotReady = true; // the screenshot watcher polls for this
} else {
  // --- Live game loop
  let last = performance.now();
  let acc = 0;
  let lastScreen = '';
  function frame(now) {
    acc += (now - last) / 1000;
    last = now;
    if (acc > 0.25) acc = 0.25;
    while (acc >= STEP) {
      const events = world.step(STEP);
      if (events & EVENT_OVER) sound.defeat();
      else if (events & EVENT_VICTORY) sound.victory();
      acc -= STEP;
    }
    const screen = screenOf(world);
    if (screen !== lastScreen) {
      lastScreen = screen;
      if (screen === 'between') sound.waveStart();
    }
    draw(ctx, world, { hover: input.hover, buildKind: input.buildKind, screen });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__gameReady = true;
}
