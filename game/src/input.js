// Input: mouse picking, build/upgrade/sell actions, keyboard shortcuts.
// Translates DOM events into World actions; owns no game rules.

import { CANVAS, GRID } from './config.js';

export class Input {
  constructor(canvas, world, sound) {
    this.canvas = canvas;
    this.world = world;
    this.sound = sound;
    this.hover = null;
    this.buildKind = null;
    this.selected = null;
    this.onNextWave = null; // UI hook (button clicks)
    this.onSound = null;

    canvas.addEventListener('mousemove', (e) => this.pick(e));
    canvas.addEventListener('mouseleave', () => { this.hover = null; });
    canvas.addEventListener('click', (e) => this.click(e));
    window.addEventListener('keydown', (e) => this.key(e.key));
  }

  cellFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * CANVAS.width) / rect.width;
    const y = ((e.clientY - rect.top) * CANVAS.height) / rect.height;
    if (y >= GRID.height) return null; // HUD band
    const col = Math.floor(x / GRID.cell);
    const row = Math.floor(y / GRID.cell);
    if (col < 0 || row < 0 || col >= GRID.cols || row >= GRID.rows) return null;
    return { col, row, x, y };
  }

  pick(e) {
    this.hover = this.cellFromEvent(e);
  }

  click(e) {
    this.sound.unlock();
    const cell = this.cellFromEvent(e);
    const w = this.world;
    if (w.state === 'title' || w.state === 'over' || w.state === 'victory') {
      if (w.state === 'title') { w.reset(); }
      else { w.reset(); }
      w.startWave();
      return;
    }
    if (!cell) {
      // Clicks in the HUD band hit the build chips.
      this.clickHud(e);
      return;
    }
    const existing = w.towerAt(cell.col, cell.row);
    if (existing) {
      this.selected = existing;
      return;
    }
    if (this.buildKind) {
      if (w.placeTower(this.buildKind, cell.col, cell.row)) {
        this.sound.build();
        this.onSound && this.onSound('build');
      } else {
        this.sound.click();
      }
    }
  }

  clickHud(e) {
    // Approximate: chips start at x=16 and step 126px, in TOWERS key order.
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * CANVAS.width) / rect.width;
    const y = ((e.clientY - rect.top) * CANVAS.height) / rect.height;
    if (y < GRID.height + 40 || y > GRID.height + 72) return;
    const kinds = Object.keys(TOWERS_REF);
    for (let i = 0; i < kinds.length; i += 1) {
      const cx = 16 + i * 126;
      if (x >= cx && x <= cx + 118) {
        this.setBuild(kinds[i]);
        return;
      }
    }
  }

  setBuild(kind) {
    this.buildKind = kind === this.buildKind ? null : kind;
    this.sound.click();
  }

  key(k) {
    const w = this.world;
    const lower = k.toLowerCase();
    if (lower === '1') this.setBuild('pulse');
    else if (lower === '2') this.setBuild('arc');
    else if (lower === '3') this.setBuild('rail');
    else if (lower === 'n') {
      if (w.state === 'title') { w.reset(); w.startWave(); }
      else if (w.state === 'between') { w.startWave(); }
      else if (!w.waveActive && (w.state === 'playing')) w.startWave();
    } else if (lower === 'u') {
      const target = this.selected || this.hoverTower();
      if (w.upgradeTower(target)) this.sound.upgrade();
      else this.sound.click();
    } else if (lower === 's') {
      const target = this.selected || this.hoverTower();
      if (target && w.sellTower(target)) this.sound.sell();
      this.selected = null;
    } else if (k === 'Enter') {
      this.sound.unlock();
      if (w.state === 'title') { w.reset(); w.startWave(); }
      else if (w.state === 'over' || w.state === 'victory') { w.reset(); w.startWave(); }
      else if (w.state === 'between') w.startWave();
    } else if (lower === 'm') {
      const on = this.sound.toggle();
      this.onSound && this.onSound(on ? 'unmute' : 'mute');
    }
  }

  hoverTower() {
    if (!this.hover) return null;
    return this.world.towerAt(this.hover.col, this.hover.row);
  }
}

// Imported lazily to avoid a cycle at module evaluation time.
import { TOWERS as TOWERS_REF } from './config.js';
