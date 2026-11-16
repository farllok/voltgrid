// VOLTGRID — bootstrap. Chooses between the live game loop and a deterministic screenshot scene.

import { WIDTH, HEIGHT, STEP } from './config.js';
import { createGame, updateWorld } from './world.js';
import { drawFrame } from './render.js';
import { attachInput } from './input.js';
import { Sound } from './sound.js';
import { runShot } from './shots.js';

function readSeed(params) {
  const raw = params.get('seed');
  if (raw === null) return 1;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 1;
  const clean = Math.floor(Math.abs(value)) >>> 0;
  return clean === 0 ? 1 : clean;
}

function startInteractive(canvas, seed) {
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;
  const game = createGame(seed);
  const sound = new Sound();
  attachInput(canvas, () => game, { sound });

  const drainEvents = () => {
    if (game.events.length === 0) return;
    for (const name of game.events) sound.play(name);
    game.events.length = 0;
  };

  let last = performance.now();
  let accumulator = 0;
  const frame = (now) => {
    let delta = (now - last) / 1000;
    last = now;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;
    if (delta > 0.25) delta = 0.25;
    accumulator += delta;
    let steps = 0;
    while (accumulator >= STEP && steps < 10) {
      updateWorld(game, STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 10) accumulator = 0;
    drainEvents();
    drawFrame(ctx, game);
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
}

function boot() {
  const canvas = document.getElementById('game');
  if (canvas === null) return;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = readSeed(params);
  if (shot === 'start' || shot === 'play' || shot === 'end' || shot === 'victory') {
    runShot(shot, seed);
    return;
  }
  startInteractive(canvas, seed);
}

boot();
