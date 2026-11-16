// VOLTGRID — canvas presentation: field, towers, enemies, effects, HUD and overlay screens.
// Rendering is a pure function of the simulation state, so a replay draws the same frame.

import {
  WIDTH,
  HEIGHT,
  FIELD_W,
  FIELD_H,
  TILE,
  COLS,
  ROWS,
  LANE_ROW,
  LANE_Y,
  CORE_X,
  CORE_Y,
  CORE_HP,
  TOTAL_WAVES,
  MAX_LEVEL,
  TOWERS,
  TOWER_ORDER,
  ENEMIES,
  COLORS,
  towerStats,
  upgradeCost,
  sellValue,
} from './config.js';
import { buildCheck, towerAt, towerById } from './world.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** CSS font shorthand. */
function font(size, weight = 500) {
  return `${weight} ${size}px ${FONT}`;
}

/** A #rrggbb colour with an alpha channel. */
function rgba(hex, alpha) {
  const raw = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function inRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function pathRound(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function fillRound(ctx, x, y, w, h, r, fill) {
  pathRound(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRound(ctx, x, y, w, h, r, stroke, width) {
  pathRound(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Text centred at x with manual letter spacing. */
function spacedText(ctx, text, x, y, spacing) {
  const previousAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  const chars = Array.from(text);
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + spacing;
  total -= spacing;
  let cursor = x - total / 2;
  for (const ch of chars) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = previousAlign;
}

function label(ctx, text, x, y, size, color, weight = 600, align = 'left') {
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Where the HUD blocks live. Shared by drawing and click hit-testing. */
export function hudLayout() {
  const panelY = FIELD_H + 4;
  return {
    panel: { x: 8, y: panelY, w: WIDTH - 16, h: HEIGHT - panelY - 8 },
    core: { x: 24, y: 588, w: 144, h: 46 },
    credits: { x: 180, y: 588, w: 82, h: 46 },
    wave: { x: 274, y: 588, w: 74, h: 46 },
    stats: { x: 360, y: 588, w: 82, h: 46 },
    mute: { x: 452, y: 592, w: 26, h: 26 },
    chips: TOWER_ORDER.map((key, index) => ({ key, x: 492 + index * 86, y: 586, w: 80, h: 26 })),
    upgrade: { x: 492, y: 616, w: 80, h: 20 },
    sell: { x: 578, y: 616, w: 60, h: 20 },
    next: { x: 664, y: 616, w: 80, h: 20 },
  };
}

/** What a click inside the HUD strip means. */
export function hudHitTest(x, y) {
  const layout = hudLayout();
  for (const chip of layout.chips) {
    if (inRect(x, y, chip)) return { kind: 'build', key: chip.key };
  }
  if (inRect(x, y, layout.upgrade)) return { kind: 'upgrade' };
  if (inRect(x, y, layout.sell)) return { kind: 'sell' };
  if (inRect(x, y, layout.next)) return { kind: 'next' };
  if (inRect(x, y, layout.mute)) return { kind: 'mute' };
  return null;
}

export function drawFrame(ctx, game) {
  ctx.save();
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackdrop(ctx);
  drawGrid(ctx);
  drawLane(ctx, game);
  drawCore(ctx, game);
  drawHover(ctx, game);
  drawSelectedRange(ctx, game);
  drawTowers(ctx, game);
  drawEnemies(ctx, game);
  drawShots(ctx, game);
  drawEffects(ctx, game);
  drawHud(ctx, game);
  drawMessage(ctx, game);
  drawOverlay(ctx, game);
  ctx.restore();
}

function drawBackdrop(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, '#0a0d13');
  gradient.addColorStop(0.55, '#0b0e14');
  gradient.addColorStop(1, '#080b11');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(CORE_X, CORE_Y, 6, CORE_X, CORE_Y, 300);
  glow.addColorStop(0, 'rgba(79, 209, 255, 0.10)');
  glow.addColorStop(0.5, 'rgba(79, 209, 255, 0.03)');
  glow.addColorStop(1, 'rgba(79, 209, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawGrid(ctx) {
  ctx.fillStyle = '#0d1119';
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let col = 1; col < COLS; col++) {
    const x = col * TILE + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FIELD_H);
  }
  for (let row = 1; row < ROWS; row++) {
    const y = row * TILE + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(FIELD_W, y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#16202f';
  ctx.strokeRect(0.5, 0.5, FIELD_W - 1, FIELD_H - 1);
}

function drawLane(ctx, game) {
  const top = LANE_ROW * TILE;
  const laneGradient = ctx.createLinearGradient(0, top, 0, top + TILE);
  laneGradient.addColorStop(0, 'rgba(20, 34, 56, 0.75)');
  laneGradient.addColorStop(0.5, 'rgba(16, 26, 43, 0.95)');
  laneGradient.addColorStop(1, 'rgba(20, 34, 56, 0.75)');
  ctx.fillStyle = laneGradient;
  ctx.fillRect(0, top, FIELD_W, TILE);
  ctx.strokeStyle = '#1d2b42';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top + 0.5);
  ctx.lineTo(FIELD_W, top + 0.5);
  ctx.moveTo(0, top + TILE - 0.5);
  ctx.lineTo(FIELD_W, top + TILE - 0.5);
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = rgba(COLORS.cyan, 0.16);
  ctx.lineWidth = 2;
  for (let x = FIELD_W - 34; x > 60; x -= 96) {
    ctx.beginPath();
    ctx.moveTo(x + 7, LANE_Y - 8);
    ctx.lineTo(x - 4, LANE_Y);
    ctx.lineTo(x + 7, LANE_Y + 8);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(36, 52, 79, 0.85)';
  ctx.setLineDash([10, 12]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(52, LANE_Y + 0.5);
  ctx.lineTo(FIELD_W - 8, LANE_Y + 0.5);
  ctx.stroke();
  ctx.restore();
  ctx.font = font(9, 700);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.textFaint;
  ctx.fillText('ENTRY', FIELD_W - 12, top + 14);
  void game;
}

function drawCore(ctx, game) {
  const ratio = clamp(game.hp / CORE_HP, 0, 1);
  const tint = ratio > 0.5 ? COLORS.cyan : ratio > 0.25 ? COLORS.orange : COLORS.red;
  const pulse = 1 + Math.sin(game.time * 3.2) * 0.045;
  ctx.save();
  ctx.translate(CORE_X, CORE_Y);
  ctx.shadowColor = rgba(tint, 0.85);
  ctx.shadowBlur = 24;
  ctx.strokeStyle = rgba(tint, 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 25 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i - Math.PI / 8;
    const px = Math.cos(angle) * 17;
    const py = Math.sin(angle) * 17;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#0b2030';
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fillStyle = rgba(tint, 0.9);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.white;
  ctx.fill();
  // Integrity arc.
  ctx.beginPath();
  ctx.arc(0, 0, 22 * pulse, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
  ctx.strokeStyle = tint;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
  if (ratio < 0.55) {
    ctx.strokeStyle = rgba(COLORS.red, 0.8);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-10, -9);
    ctx.lineTo(-2, -2);
    ctx.lineTo(-7, 6);
    ctx.moveTo(4, -11);
    ctx.lineTo(9, -3);
    ctx.lineTo(3, 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.font = font(8, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(tint, 0.75);
  ctx.fillText('CORE', CORE_X, LANE_Y + 40);
}

function drawHover(ctx, game) {
  if (game.hover === null || game.hover === undefined) return;
  if (game.phase !== 'playing' && game.phase !== 'wavebreak') return;
  const { col, row } = game.hover;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  const x = col * TILE;
  const y = row * TILE;
  const existing = towerAt(game, col, row);
  if (existing !== null) {
    ctx.save();
    strokeRound(ctx, x + 3, y + 3, TILE - 6, TILE - 6, 8, rgba(COLORS.cyan, 0.7), 1.5);
    ctx.restore();
    return;
  }
  const check = buildCheck(game, game.selectedBuild, col, row);
  const color = check.ok ? COLORS.green : COLORS.red;
  ctx.save();
  fillRound(ctx, x + 3, y + 3, TILE - 6, TILE - 6, 8, rgba(color, 0.08));
  ctx.setLineDash([5, 5]);
  strokeRound(ctx, x + 3, y + 3, TILE - 6, TILE - 6, 8, rgba(color, 0.55), 1.5);
  ctx.restore();
}

function drawRangeCircle(ctx, game, tower) {
  const def = TOWERS[tower.type];
  const stats = towerStats(def, tower.level);
  ctx.save();
  ctx.beginPath();
  ctx.arc(tower.x, tower.y, stats.range, 0, Math.PI * 2);
  ctx.fillStyle = rgba(def.color, 0.055);
  ctx.fill();
  ctx.setLineDash([7, 7]);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(def.color, 0.55);
  ctx.stroke();
  ctx.restore();
}

function drawSelectedRange(ctx, game) {
  const tower = towerById(game, game.selectedTower);
  if (tower !== null) drawRangeCircle(ctx, game, tower);
}

function drawTowers(ctx, game) {
  for (const tower of game.towers) {
    const def = TOWERS[tower.type];
    const selected = game.selectedTower === tower.id;
    const level = tower.level;
    ctx.save();
    ctx.translate(tower.x, tower.y);
    ctx.shadowColor = rgba(def.color, selected ? 0.7 : 0.35);
    ctx.shadowBlur = selected ? 18 : 8;
    fillRound(ctx, -21, -21, 42, 42, 10, '#0c1522');
    strokeRound(ctx, -21, -21, 42, 42, 10, rgba(def.color, selected ? 0.95 : 0.45), selected ? 2 : 1.4);
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.rotate(tower.aim);
    if (tower.type === 'pulse') {
      fillRound(ctx, 0, -3.5, 20, 7, 3.5, rgba(def.color, 0.9));
      ctx.beginPath();
      ctx.arc(3, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#0c1522';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(3, 0, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(20, 0, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.white;
      ctx.fill();
    } else if (tower.type === 'arc') {
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(2, -9);
      ctx.lineTo(17, -12);
      ctx.moveTo(2, 9);
      ctx.lineTo(17, 12);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(17, 0, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(def.color, 0.95);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(3, 0, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(COLORS.white, 0.85);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(5, -1);
      ctx.lineTo(10, 1);
      ctx.lineTo(8, -3);
      ctx.lineTo(13, 2);
      ctx.strokeStyle = rgba(COLORS.white, 0.6);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      fillRound(ctx, 0, -4, 27, 8, 3, '#2a1c0b');
      fillRound(ctx, 2, -2.4, 24, 4.8, 2.4, rgba(def.color, 0.85));
      ctx.beginPath();
      ctx.arc(28, 0, 3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(def.color, 0.95);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(2, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#12202f';
      ctx.fill();
    }
    ctx.restore();
    for (let i = 0; i < MAX_LEVEL; i++) {
      fillRound(ctx, -13 + i * 9, 17, 6, 3, 1.5, i < level ? def.color : '#223047');
    }
    if (selected) {
      ctx.save();
      ctx.strokeStyle = rgba(def.color, 0.8);
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 5]);
      ctx.lineDashOffset = -game.time * 12;
      ctx.beginPath();
      ctx.arc(0, 0, 25 + Math.sin(game.time * 4) * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

function drawEnemies(ctx, game) {
  for (const enemy of game.enemies) {
    const def = ENEMIES[enemy.type];
    const bob = Math.sin(game.time * 7 + enemy.id * 1.7) * 1.5;
    const y = enemy.y + bob;
    ctx.save();
    ctx.translate(enemy.x, y);
    ctx.shadowColor = rgba(def.color, 0.7);
    ctx.shadowBlur = 10;
    if (enemy.type === 'runner') {
      ctx.beginPath();
      ctx.moveTo(-13, 0);
      ctx.lineTo(8, -8);
      ctx.lineTo(5, 0);
      ctx.lineTo(8, 8);
      ctx.closePath();
      ctx.fillStyle = '#2a1219';
      ctx.fill();
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-2, 0, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();
    } else if (enemy.type === 'swarmer') {
      ctx.rotate(game.time * 3 + enemy.id);
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 8);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fillStyle = rgba(def.color, 0.9);
      ctx.fill();
      ctx.strokeStyle = rgba(COLORS.white, 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (enemy.type === 'brute') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        const px = Math.cos(angle) * 17;
        const py = Math.sin(angle) * 17;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#2a1018';
      ctx.fill();
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = rgba(def.color, 0.75);
      ctx.fill();
    } else {
      fillRound(ctx, -10, -11, 20, 22, 4, '#161f2e');
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-6, 0, 10, Math.PI * 0.55, Math.PI * 1.45);
      ctx.strokeStyle = rgba(COLORS.white, 0.75);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, -5);
      ctx.lineTo(4, 0);
      ctx.lineTo(-2, 5);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
    const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
    if (ratio < 0.999) {
      const barW = enemy.type === 'brute' ? 34 : 26;
      const barY = y - (enemy.type === 'brute' ? 27 : 22);
      fillRound(ctx, enemy.x - barW / 2, barY, barW, 4, 2, 'rgba(6, 10, 16, 0.85)');
      fillRound(ctx, enemy.x - barW / 2, barY, barW * ratio, 4, 2, ratio > 0.5 ? COLORS.green : ratio > 0.25 ? COLORS.amber : COLORS.red);
    }
    if (enemy.armor > 0) {
      for (let i = 0; i < enemy.armor; i++) {
        fillRound(ctx, enemy.x - 8 + i * 6, y - 33, 4, 4, 1, rgba(COLORS.steel, 0.9));
      }
    }
  }
}

function drawShots(ctx, game) {
  for (const shot of game.shots) {
    ctx.save();
    ctx.shadowColor = rgba(shot.color, 0.85);
    ctx.shadowBlur = 12;
    if (shot.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(shot.trail[0].x, shot.trail[0].y);
      for (let i = 1; i < shot.trail.length; i++) ctx.lineTo(shot.trail[i].x, shot.trail[i].y);
      ctx.lineTo(shot.x, shot.y);
      ctx.strokeStyle = rgba(shot.color, 0.4);
      ctx.lineWidth = shot.kind === 'rail' ? 4 : 2;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    if (shot.kind === 'rail') {
      const angle = Math.atan2(shot.ty - shot.y, shot.tx - shot.x);
      ctx.beginPath();
      ctx.moveTo(shot.x - Math.cos(angle) * 12, shot.y - Math.sin(angle) * 12);
      ctx.lineTo(shot.x, shot.y);
      ctx.strokeStyle = rgba(shot.color, 0.95);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.white;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.white;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 5.4, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(shot.color, 0.8);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawEffects(ctx, game) {
  for (const effect of game.effects) {
    const age = 1 - effect.life / effect.maxLife;
    const fade = clamp(effect.life / effect.maxLife, 0, 1);
    if (effect.kind === 'spark') {
      ctx.save();
      ctx.strokeStyle = rgba(effect.color, fade);
      ctx.lineWidth = effect.size * fade;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.x - effect.vx * 0.018, effect.y - effect.vy * 0.018);
      ctx.stroke();
      ctx.restore();
    } else if (effect.kind === 'ring') {
      const radius = effect.r0 + (effect.r1 - effect.r0) * age;
      ctx.save();
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(effect.color, fade * 0.9);
      ctx.lineWidth = 1 + 3 * fade;
      ctx.stroke();
      ctx.restore();
    } else if (effect.kind === 'bolt') {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < effect.points.length; i++) {
        const point = effect.points[i];
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.strokeStyle = rgba(effect.color, 0.35 * fade);
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = rgba(COLORS.white, 0.9 * fade);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      for (let i = 1; i < effect.points.length; i++) {
        const point = effect.points[i];
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.4 * fade + 0.6, 0, Math.PI * 2);
        ctx.fillStyle = rgba(effect.color, 0.9 * fade);
        ctx.fill();
      }
      ctx.restore();
    } else if (effect.kind === 'float') {
      ctx.save();
      ctx.font = font(11, 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(effect.color, fade);
      ctx.fillText(effect.text, effect.x, effect.y);
      ctx.restore();
    }
  }
}

function drawHud(ctx, game) {
  const layout = hudLayout();
  const panel = layout.panel;
  const panelGradient = ctx.createLinearGradient(0, panel.y, 0, panel.y + panel.h);
  panelGradient.addColorStop(0, '#111a29');
  panelGradient.addColorStop(1, '#0b121d');
  fillRound(ctx, panel.x, panel.y, panel.w, panel.h, 12, panelGradient);
  strokeRound(ctx, panel.x, panel.y, panel.w, panel.h, 12, COLORS.panelLine, 1);

  ctx.save();
  ctx.strokeStyle = 'rgba(36, 52, 80, 0.75)';
  ctx.lineWidth = 1;
  for (const x of [170, 264, 350, 446]) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, panel.y + 9);
    ctx.lineTo(x + 0.5, panel.y + panel.h - 9);
    ctx.stroke();
  }
  ctx.restore();

  // Core integrity.
  const ratio = clamp(game.hp / CORE_HP, 0, 1);
  const barColor = ratio > 0.5 ? COLORS.cyan : ratio > 0.25 ? COLORS.orange : COLORS.red;
  label(ctx, 'CORE INTEGRITY', layout.core.x, 596, 8.5, COLORS.textDim, 700);
  label(ctx, `${game.hp} / ${CORE_HP}`, layout.core.x + layout.core.w, 596, 12, barColor, 800, 'right');
  fillRound(ctx, layout.core.x, 604, layout.core.w, 10, 5, '#080d15');
  if (ratio > 0) {
    const hpGradient = ctx.createLinearGradient(layout.core.x, 0, layout.core.x + layout.core.w, 0);
    hpGradient.addColorStop(0, barColor);
    hpGradient.addColorStop(1, rgba(barColor, 0.65));
    fillRound(ctx, layout.core.x, 604, layout.core.w * ratio, 10, 5, hpGradient);
  }
  strokeRound(ctx, layout.core.x, 604, layout.core.w, 10, 5, 'rgba(36, 52, 80, 0.9)', 1);
  label(ctx, 'THREAT LEVEL', layout.core.x, 624, 8, COLORS.textFaint, 600);
  const threat = game.wave === 0 ? 'STANDBY' : game.wave >= TOTAL_WAVES ? 'FINAL' : game.wave >= 8 ? 'SEVERE' : game.wave >= 4 ? 'ELEVATED' : 'LOW';
  label(ctx, threat, layout.core.x + layout.core.w, 624, 8.5, rgba(barColor, 0.9), 700, 'right');

  // Credits.
  label(ctx, 'CREDITS', layout.credits.x, 596, 8.5, COLORS.textDim, 700);
  label(ctx, String(game.credits), layout.credits.x, 619, 19, COLORS.green, 800);
  label(ctx, 'c', layout.credits.x + String(game.credits).length * 11 + 6, 621, 10, rgba(COLORS.green, 0.7), 700);

  // Wave counter.
  label(ctx, 'WAVE', layout.wave.x, 596, 8.5, COLORS.textDim, 700);
  label(ctx, `${String(game.wave).padStart(2, '0')} / ${TOTAL_WAVES}`, layout.wave.x, 619, 16, COLORS.purple, 800);

  // Kill / leak counters.
  label(ctx, 'KILLS', layout.stats.x, 598, 9, COLORS.textDim, 700);
  label(ctx, String(game.kills), layout.stats.x + layout.stats.w, 598, 11, COLORS.text, 800, 'right');
  label(ctx, 'LEAKS', layout.stats.x, 620, 9, COLORS.textDim, 700);
  label(ctx, String(game.leaks), layout.stats.x + layout.stats.w, 620, 11, game.leaks > 0 ? COLORS.red : COLORS.text, 800, 'right');

  // Mute toggle.
  const mute = layout.mute;
  fillRound(ctx, mute.x, mute.y, mute.w, mute.h, 6, game.mute ? 'rgba(255, 93, 115, 0.14)' : 'rgba(55, 230, 162, 0.10)');
  strokeRound(ctx, mute.x, mute.y, mute.w, mute.h, 6, game.mute ? rgba(COLORS.red, 0.7) : rgba(COLORS.green, 0.45), 1);
  label(ctx, 'M', mute.x + mute.w / 2, mute.y + mute.h / 2 + 0.5, 11, game.mute ? COLORS.red : COLORS.green, 800, 'center');
  if (game.mute) {
    ctx.save();
    ctx.strokeStyle = rgba(COLORS.red, 0.9);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(mute.x + 5, mute.y + mute.h - 5);
    ctx.lineTo(mute.x + mute.w - 5, mute.y + 5);
    ctx.stroke();
    ctx.restore();
  }

  // Tower build chips.
  const selectedTower = towerById(game, game.selectedTower);
  for (const chip of layout.chips) {
    const def = TOWERS[chip.key];
    const active = game.selectedBuild === chip.key;
    const affordable = game.credits >= def.cost;
    const border = active ? rgba(def.color, 0.95) : affordable ? '#2a3a55' : '#1a2536';
    fillRound(ctx, chip.x, chip.y, chip.w, chip.h, 7, active ? rgba(def.color, 0.16) : '#0c1420');
    strokeRound(ctx, chip.x, chip.y, chip.w, chip.h, 7, border, active ? 1.6 : 1);
    const index = TOWER_ORDER.indexOf(chip.key) + 1;
    fillRound(ctx, chip.x + 5, chip.y + 5, 16, 16, 4, active ? rgba(def.color, 0.9) : '#1b2637');
    label(ctx, String(index), chip.x + 13, chip.y + 13.5, 9.5, active ? '#08121a' : COLORS.textDim, 800, 'center');
    label(ctx, def.name, chip.x + 26, chip.y + 13.5, 9.5, active ? COLORS.white : affordable ? COLORS.text : COLORS.textFaint, 700);
    label(ctx, String(def.cost), chip.x + chip.w - 6, chip.y + 13.5, 9.5, affordable ? COLORS.green : COLORS.red, 800, 'right');
  }

  // Action buttons.
  const selectedDef = selectedTower !== null ? TOWERS[selectedTower.type] : null;
  drawButton(ctx, layout.upgrade, selectedTower !== null && selectedTower.level < MAX_LEVEL ? `UPGRADE ${upgradeCost(selectedDef, selectedTower.level)}` : 'UPGRADE', selectedTower !== null && selectedTower.level < MAX_LEVEL, COLORS.cyan);
  drawButton(ctx, layout.sell, selectedTower !== null ? `SELL ${sellValue(selectedTower)}` : 'SELL', selectedTower !== null, COLORS.orange);
  drawButton(ctx, layout.next, 'NEXT WAVE', game.phase === 'wavebreak', COLORS.green);
}

function drawButton(ctx, rect, text, enabled, color) {
  fillRound(ctx, rect.x, rect.y, rect.w, rect.h, 5, enabled ? rgba(color, 0.13) : '#0b111b');
  strokeRound(ctx, rect.x, rect.y, rect.w, rect.h, 5, enabled ? rgba(color, 0.6) : '#1b2536', 1);
  label(ctx, text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5, 8.5, enabled ? color : COLORS.textFaint, 800, 'center');
}

function drawMessage(ctx, game) {
  if (game.messageTimer <= 0 || game.message === '') return;
  if (game.phase === 'title' || game.phase === 'over' || game.phase === 'victory') return;
  const fade = clamp(game.messageTimer / 0.4, 0, 1);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.font = font(11, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(game.message).width + 34;
  const x = WIDTH / 2 - width / 2;
  fillRound(ctx, x, 14, width, 28, 14, 'rgba(10, 16, 26, 0.94)');
  strokeRound(ctx, x, 14, width, 28, 14, rgba(COLORS.cyan, 0.45), 1);
  ctx.fillStyle = COLORS.cyan;
  ctx.fillText(game.message, WIDTH / 2, 28.5);
  ctx.restore();
}

function panelBox(ctx, x, y, w, h, accent) {
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, 'rgba(18, 27, 43, 0.98)');
  gradient.addColorStop(1, 'rgba(10, 15, 24, 0.98)');
  fillRound(ctx, x, y, w, h, 16, gradient);
  strokeRound(ctx, x, y, w, h, 16, rgba(accent, 0.55), 1.4);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + 18, y + 1.5);
  ctx.lineTo(x + w - 18, y + 1.5);
  ctx.strokeStyle = rgba(accent, 0.7);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawOverlay(ctx, game) {
  if (game.phase === 'title') drawTitle(ctx, game);
  else if (game.phase === 'wavebreak') drawWaveBreak(ctx, game);
  else if (game.phase === 'over') drawGameOver(ctx, game);
  else if (game.phase === 'victory') drawVictory(ctx, game);
}

function drawTitle(ctx, game) {
  ctx.fillStyle = 'rgba(6, 9, 15, 0.8)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  panelBox(ctx, 112, 92, 544, 464, COLORS.cyan);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleGradient = ctx.createLinearGradient(240, 160, 530, 225);
  titleGradient.addColorStop(0, COLORS.cyan);
  titleGradient.addColorStop(0.55, '#9ec6ff');
  titleGradient.addColorStop(1, COLORS.purple);
  ctx.font = font(64, 800);
  ctx.shadowColor = rgba(COLORS.cyan, 0.55);
  ctx.shadowBlur = 26;
  ctx.fillStyle = titleGradient;
  spacedText(ctx, 'VOLTGRID', WIDTH / 2, 190, 3);
  ctx.shadowBlur = 0;
  ctx.font = font(12, 700);
  ctx.fillStyle = COLORS.textDim;
  spacedText(ctx, 'TOWER DEFENSE // GRID 12 x 9', WIDTH / 2, 236, 2.4);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(36, 52, 80, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(196, 262.5);
  ctx.lineTo(572, 262.5);
  ctx.stroke();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(13, 500);
  ctx.fillStyle = COLORS.text;
  const rules = [
    'Hostile code enters from the right and runs for the CORE.',
    'Build towers on the grid and hold all 12 waves.',
    '1 PULSE 40c   ·   2 ARC 75c   ·   3 RAIL 120c',
    'Click a cell to build  ·  Click a tower to inspect',
    'U upgrade  ·  S sell  ·  N next wave  ·  M sound',
  ];
  for (let i = 0; i < rules.length; i++) ctx.fillText(rules[i], WIDTH / 2, 298 + i * 27);
  ctx.save();
  ctx.strokeStyle = 'rgba(36, 52, 80, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(196, 432.5);
  ctx.lineTo(572, 432.5);
  ctx.stroke();
  ctx.restore();
  const blink = 0.5 + 0.5 * Math.sin(game.time * 3.2);
  ctx.font = font(16, 800);
  ctx.fillStyle = rgba(COLORS.cyan, 0.45 + blink * 0.55);
  spacedText(ctx, 'PRESS ENTER TO DEPLOY', WIDTH / 2, 468, 2.6);
  ctx.font = font(10, 600);
  ctx.fillStyle = COLORS.textFaint;
  spacedText(ctx, `START 90 CREDITS  ·  CORE ${CORE_HP} HP  ·  ${TOTAL_WAVES} WAVES`, WIDTH / 2, 520, 1.4);
}

function drawWaveBreak(ctx, game) {
  const summary = game.waveSummary;
  if (summary === null) return;
  ctx.fillStyle = 'rgba(6, 9, 15, 0.62)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  panelBox(ctx, 204, 168, 360, 288, COLORS.green);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(10, 800);
  ctx.fillStyle = COLORS.green;
  spacedText(ctx, 'WAVE CLEARED', WIDTH / 2, 204, 3);
  ctx.font = font(38, 800);
  ctx.fillStyle = COLORS.white;
  ctx.fillText(`WAVE ${String(summary.wave).padStart(2, '0')}`, WIDTH / 2, 248);
  ctx.restore();
  const rows = [
    ['KILLS', String(summary.kills)],
    ['LEAKS', String(summary.leaks)],
    ['WAVE BONUS', `+${summary.bonus} c`],
    ['CREDITS', `${summary.credits} c`],
  ];
  for (let i = 0; i < rows.length; i++) {
    const y = 292 + i * 24;
    label(ctx, rows[i][0], 244, y, 10, COLORS.textDim, 700);
    label(ctx, rows[i][1], 524, y, 12, i === 1 && summary.leaks > 0 ? COLORS.red : COLORS.text, 800, 'right');
  }
  const nextWave = summary.wave + 1;
  const blink = 0.5 + 0.5 * Math.sin(game.time * 3.4);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(11, 800);
  ctx.fillStyle = rgba(COLORS.cyan, 0.45 + blink * 0.55);
  spacedText(ctx, `PRESS N OR ENTER — WAVE ${String(nextWave).padStart(2, '0')}`, WIDTH / 2, 424, 1.6);
  ctx.restore();
}

function statRows(ctx, rows, startY, step, leftX, rightX) {
  for (let i = 0; i < rows.length; i++) {
    const y = startY + i * step;
    label(ctx, rows[i][0], leftX, y, 10, COLORS.textDim, 700);
    label(ctx, rows[i][1], rightX, y, 12, COLORS.text, 800, 'right');
  }
}

function drawGameOver(ctx, game) {
  ctx.fillStyle = 'rgba(6, 9, 15, 0.84)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  panelBox(ctx, 174, 132, 420, 384, COLORS.red);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(10, 800);
  ctx.fillStyle = COLORS.red;
  spacedText(ctx, 'SIGNAL LOST', WIDTH / 2, 172, 3.4);
  ctx.font = font(46, 800);
  ctx.shadowColor = rgba(COLORS.red, 0.5);
  ctx.shadowBlur = 24;
  ctx.fillStyle = COLORS.red;
  spacedText(ctx, 'CORE DOWN', WIDTH / 2, 230, 1.5);
  ctx.shadowBlur = 0;
  ctx.font = font(13, 500);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(game.overReason, WIDTH / 2, 272);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(36, 52, 80, 0.9)';
  ctx.beginPath();
  ctx.moveTo(226, 300.5);
  ctx.lineTo(542, 300.5);
  ctx.stroke();
  ctx.restore();
  statRows(ctx, [
    ['WAVES REACHED', `${game.wave} / ${TOTAL_WAVES}`],
    ['KILLS', String(game.kills)],
    ['LEAKS', String(game.leaks)],
    ['CREDITS LEFT', String(game.credits)],
  ], 334, 28, 230, 538);
  const blink = 0.5 + 0.5 * Math.sin(game.time * 3.2);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(13, 800);
  ctx.fillStyle = rgba(COLORS.cyan, 0.45 + blink * 0.55);
  spacedText(ctx, 'PRESS ENTER TO REBUILD', WIDTH / 2, 472, 2);
  ctx.restore();
}

function drawVictory(ctx, game) {
  ctx.fillStyle = 'rgba(6, 9, 15, 0.82)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  panelBox(ctx, 174, 124, 420, 400, COLORS.green);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(10, 800);
  ctx.fillStyle = COLORS.green;
  spacedText(ctx, 'GRID INTEGRITY STABLE', WIDTH / 2, 164, 3);
  ctx.font = font(44, 800);
  ctx.shadowColor = rgba(COLORS.green, 0.55);
  ctx.shadowBlur = 24;
  ctx.fillStyle = COLORS.green;
  spacedText(ctx, 'GRID SECURED', WIDTH / 2, 220, 1.6);
  ctx.shadowBlur = 0;
  ctx.font = font(12, 600);
  ctx.fillStyle = rgba(COLORS.green, 0.75);
  spacedText(ctx, `ALL ${TOTAL_WAVES} WAVES REPELLED`, WIDTH / 2, 260, 2);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(36, 52, 80, 0.9)';
  ctx.beginPath();
  ctx.moveTo(226, 290.5);
  ctx.lineTo(542, 290.5);
  ctx.stroke();
  ctx.restore();
  statRows(ctx, [
    ['WAVES CLEARED', `${TOTAL_WAVES} / ${TOTAL_WAVES}`],
    ['KILLS', String(game.kills)],
    ['LEAKS', String(game.leaks)],
    ['CREDITS EARNED', String(game.creditsEarned)],
  ], 324, 28, 230, 538);
  const blink = 0.5 + 0.5 * Math.sin(game.time * 3.2);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(13, 800);
  ctx.fillStyle = rgba(COLORS.cyan, 0.45 + blink * 0.55);
  spacedText(ctx, 'PRESS ENTER TO PLAY AGAIN', WIDTH / 2, 482, 2);
  ctx.restore();
}
