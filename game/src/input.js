// VOLTGRID — keyboard and pointer control. Translates raw input into simulation actions.

import { COLS, ROWS, TILE, FIELD_H } from './config.js';
import { hudHitTest } from './render.js';
import {
  startGame,
  startNextWave,
  selectBuild,
  clickCell,
  upgradeSelected,
  sellSelected,
  notify,
} from './world.js';

/** Points the canvas at 768x648 and wires up keyboard + pointer handlers. */
export function attachInput(canvas, getGame, hooks) {
  const sound = hooks.sound;

  const toGame = (event) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  };

  const toggleSound = (game) => {
    const on = sound.toggle();
    game.mute = !on;
    notify(game, on ? 'SOUND ON' : 'SOUND OFF');
  };

  const handleAction = (game, action) => {
    if (action === 'start') {
      startGame(game);
      return;
    }
    if (game.phase === 'title') {
      notify(game, 'PRESS ENTER TO DEPLOY');
      return;
    }
    if (game.phase === 'over' || game.phase === 'victory') return;
    if (action === 'upgrade') upgradeSelected(game);
    else if (action === 'sell') sellSelected(game);
    else if (action === 'next') startNextWave(game);
    else if (action === 'mute') toggleSound(game);
    else if (action.indexOf('build:') === 0) selectBuild(game, action.slice(6));
  };

  window.addEventListener('keydown', (event) => {
    const game = getGame();
    const code = event.code || '';
    const key = (event.key || '').toLowerCase();
    const is = (letter, digit) => code === letter || key === digit;
    sound.unlock();

    if (code === 'Enter' || code === 'NumpadEnter') {
      event.preventDefault();
      if (game.phase === 'title' || game.phase === 'over' || game.phase === 'victory') handleAction(game, 'start');
      else if (game.phase === 'wavebreak') handleAction(game, 'next');
      return;
    }
    if (event.repeat) return;
    if (is('Digit1', '1')) {
      event.preventDefault();
      handleAction(game, 'build:pulse');
    } else if (is('Digit2', '2')) {
      event.preventDefault();
      handleAction(game, 'build:arc');
    } else if (is('Digit3', '3')) {
      event.preventDefault();
      handleAction(game, 'build:rail');
    } else if (is('KeyU', 'u')) {
      event.preventDefault();
      handleAction(game, 'upgrade');
    } else if (is('KeyS', 's')) {
      event.preventDefault();
      handleAction(game, 'sell');
    } else if (is('KeyN', 'n')) {
      event.preventDefault();
      handleAction(game, 'next');
    } else if (is('KeyM', 'm')) {
      event.preventDefault();
      if (game.phase === 'over' || game.phase === 'victory' || game.phase === 'title') toggleSound(game);
      else handleAction(game, 'mute');
    } else if (code === 'Escape') {
      game.selectedTower = null;
      game.hover = null;
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    const game = getGame();
    const point = toGame(event);
    if (point.y >= FIELD_H) {
      game.hover = null;
      return;
    }
    const col = Math.floor(point.x / TILE);
    const row = Math.floor(point.y / TILE);
    game.hover = col >= 0 && col < COLS && row >= 0 && row < ROWS ? { col, row } : null;
  });

  canvas.addEventListener('pointerleave', () => {
    getGame().hover = null;
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (typeof event.button === 'number' && event.button !== 0) return;
    event.preventDefault();
    sound.unlock();
    const game = getGame();
    if (game.phase === 'title' || game.phase === 'over' || game.phase === 'victory') return;
    const point = toGame(event);
    if (point.y >= FIELD_H) {
      const hit = hudHitTest(point.x, point.y);
      if (hit === null) return;
      if (hit.kind === 'build') handleAction(game, `build:${hit.key}`);
      else if (hit.kind === 'mute') toggleSound(game);
      else handleAction(game, hit.kind);
      return;
    }
    const col = Math.floor(point.x / TILE);
    const row = Math.floor(point.y / TILE);
    clickCell(game, col, row);
    game.hover = { col, row };
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
}
