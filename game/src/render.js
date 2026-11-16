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
const TAU = Math.PI * 2;

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

/** A regular polygon path centred on the origin. */
function polygonPath(ctx, radius, sides, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (TAU / sides) * i;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** A soft radial bloom, used for glows. */
function radialGlow(ctx, x, y, radius, color, alpha) {
  if (radius <= 0 || alpha <= 0) return;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.45, rgba(color, alpha * 0.42));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
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

/** m:ss clock for the summary screens. */
function clock(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** Where the HUD blocks live. Shared by drawing and click hit-testing. */
export function hudLayout() {
  const panelY = FIELD_H + 4;
  return {
    panel: { x: 6, y: panelY, w: WIDTH - 12, h: HEIGHT - panelY - 6 },
    core: { x: 20, y: 584, w: 150, h: 54 },
    credits: { x: 186, y: 584, w: 104, h: 54 },
    wave: { x: 304, y: 584, w: 104, h: 54 },
    stats: { x: 420, y: 584, w: 88, h: 54 },
    mute: { x: 516, y: 585, w: 24, h: 22 },
    chips: TOWER_ORDER.map((key, index) => ({ key, x: 548 + index * 72, y: 583, w: 68, h: 26 })),
    upgrade: { x: 548, y: 612, w: 84, h: 18 },
    sell: { x: 637, y: 612, w: 55, h: 18 },
    next: { x: 697, y: 612, w: 63, h: 18 },
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
  drawBackdrop(ctx, game);
  drawGrid(ctx, game);
  drawLane(ctx, game);
  drawCore(ctx, game);
  drawHover(ctx, game);
  drawSelectedRange(ctx, game);
  drawTowers(ctx, game);
  drawEnemies(ctx, game);
  drawShots(ctx, game);
  drawEffects(ctx, game);
  drawFieldVignette(ctx);
  drawHud(ctx, game);
  drawMessage(ctx, game);
  drawOverlay(ctx, game);
  ctx.restore();
}

function drawBackdrop(ctx, game) {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, '#0a0d13');
  gradient.addColorStop(0.55, '#0b0e14');
  gradient.addColorStop(1, '#080b11');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const time = game !== undefined ? game.time : 0;
  // Ambient light pools: the core breathes cyan, the entry side leaks violet.
  const breathe = 0.09 + Math.sin(time * 1.6) * 0.018;
  const coreGlow = ctx.createRadialGradient(CORE_X, CORE_Y, 6, CORE_X, CORE_Y, 330);
  coreGlow.addColorStop(0, `rgba(79, 209, 255, ${breathe})`);
  coreGlow.addColorStop(0.5, 'rgba(79, 209, 255, 0.03)');
  coreGlow.addColorStop(1, 'rgba(79, 209, 255, 0)');
  ctx.fillStyle = coreGlow;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  const entryGlow = ctx.createRadialGradient(FIELD_W - 20, 110, 8, FIELD_W - 20, 110, 300);
  entryGlow.addColorStop(0, 'rgba(179, 137, 255, 0.07)');
  entryGlow.addColorStop(1, 'rgba(179, 137, 255, 0)');
  ctx.fillStyle = entryGlow;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  const floorGlow = ctx.createRadialGradient(FIELD_W * 0.35, FIELD_H * 0.92, 10, FIELD_W * 0.35, FIELD_H * 0.92, 320);
  floorGlow.addColorStop(0, 'rgba(55, 230, 162, 0.035)');
  floorGlow.addColorStop(1, 'rgba(55, 230, 162, 0)');
  ctx.fillStyle = floorGlow;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawGrid(ctx, game) {
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
  // Intersection pins give the grid a little more machinery.
  ctx.fillStyle = 'rgba(64, 92, 132, 0.22)';
  for (let col = 1; col < COLS; col++) {
    for (let row = 1; row < ROWS; row++) {
      ctx.fillRect(col * TILE - 1, row * TILE - 1, 2, 2);
    }
  }
  ctx.strokeStyle = '#16202f';
  ctx.strokeRect(0.5, 0.5, FIELD_W - 1, FIELD_H - 1);
  // Corner brackets.
  ctx.save();
  ctx.strokeStyle = rgba(COLORS.cyan, 0.22);
  ctx.lineWidth = 1.6;
  const marks = [
    [10, 10, 1, 1],
    [FIELD_W - 10, 10, -1, 1],
    [10, FIELD_H - 10, 1, -1],
    [FIELD_W - 10, FIELD_H - 10, -1, -1],
  ];
  for (const [x, y, sx, sy] of marks) {
    ctx.beginPath();
    ctx.moveTo(x, y + 16 * sy);
    ctx.lineTo(x, y);
    ctx.lineTo(x + 16 * sx, y);
    ctx.stroke();
  }
  ctx.restore();
  void game;
}

function drawLane(ctx, game) {
  const top = LANE_ROW * TILE;
  const time = game !== undefined ? game.time : 0;
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
  // Scrolling chevrons: the lane reads as a live data conduit.
  ctx.save();
  ctx.strokeStyle = rgba(COLORS.cyan, 0.18);
  ctx.lineWidth = 2;
  const drift = (time * 44) % 96;
  for (let x = FIELD_W - 34 - drift; x > 56; x -= 96) {
    ctx.beginPath();
    ctx.moveTo(x + 7, LANE_Y - 9);
    ctx.lineTo(x - 5, LANE_Y);
    ctx.lineTo(x + 7, LANE_Y + 9);
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
  // Entry gate.
  const portal = 0.55 + Math.sin(time * 2.2) * 0.2;
  radialGlow(ctx, FIELD_W - 14, LANE_Y, 54, COLORS.purple, 0.16 * portal);
  ctx.save();
  ctx.strokeStyle = rgba(COLORS.purple, 0.5 * portal + 0.15);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(FIELD_W - 6, LANE_Y, 26, Math.PI * 0.55, Math.PI * 1.45);
  ctx.stroke();
  ctx.restore();
  ctx.font = font(9, 700);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.textFaint;
  ctx.fillText('ENTRY', FIELD_W - 12, top + 14);
}

function drawCore(ctx, game) {
  const ratio = clamp(game.hp / CORE_HP, 0, 1);
  const tint = ratio > 0.5 ? COLORS.cyan : ratio > 0.25 ? COLORS.orange : COLORS.red;
  const time = game.time;
  const pulse = 1 + Math.sin(time * 3.2) * 0.05;
  const breath = 0.5 + Math.sin(time * 2.1) * 0.5;
  radialGlow(ctx, CORE_X, CORE_Y, 92 + breath * 14, tint, 0.2);
  ctx.save();
  ctx.translate(CORE_X, CORE_Y);
  // Two counter-rotating containment rings.
  ctx.save();
  ctx.rotate(time * 0.35);
  ctx.strokeStyle = rgba(tint, 0.22);
  ctx.lineWidth = 1.2;
  ctx.setLineDash([9, 15]);
  ctx.beginPath();
  ctx.arc(0, 0, 31, 0, TAU);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.rotate(-time * 0.55);
  ctx.strokeStyle = rgba(tint, 0.34);
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const angle = (TAU / 4) * i;
    ctx.beginPath();
    ctx.arc(0, 0, 27, angle, angle + 0.44);
    ctx.stroke();
  }
  ctx.restore();
  ctx.shadowColor = rgba(tint, 0.9);
  ctx.shadowBlur = 28;
  ctx.strokeStyle = rgba(tint, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 25 * pulse, 0, TAU);
  ctx.stroke();
  ctx.shadowBlur = 16;
  polygonPath(ctx, 18 * pulse, 8, -Math.PI / 8);
  ctx.fillStyle = '#0b2030';
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(0, 0, 9 + Math.sin(time * 4.4) * 1.1, 0, TAU);
  ctx.fillStyle = rgba(tint, 0.9);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 3.8, 0, TAU);
  ctx.fillStyle = COLORS.white;
  ctx.fill();
  // Integrity arc.
  ctx.beginPath();
  ctx.arc(0, 0, 22 * pulse, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
  ctx.strokeStyle = tint;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.shadowColor = rgba(tint, 0.8);
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineCap = 'butt';
  if (ratio < 0.55) {
    ctx.strokeStyle = rgba(COLORS.red, 0.85);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-11, -9);
    ctx.lineTo(-2, -2);
    ctx.lineTo(-7, 6);
    ctx.moveTo(4, -11);
    ctx.lineTo(9, -3);
    ctx.lineTo(3, 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.font = font(9, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(tint, 0.85);
  ctx.fillText('CORE', CORE_X, LANE_Y + 44);
  void game;
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
  ctx.arc(tower.x, tower.y, stats.range, 0, TAU);
  ctx.fillStyle = rgba(def.color, 0.055);
  ctx.fill();
  ctx.setLineDash([7, 7]);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(def.color, 0.55);
  ctx.stroke();
  ctx.restore();
  void game;
}

function drawSelectedRange(ctx, game) {
  const tower = towerById(game, game.selectedTower);
  if (tower !== null) drawRangeCircle(ctx, game, tower);
}

/** The turret artwork of one tower type, pointing along +x. Shared with the title cards. */
function drawTowerGlyph(ctx, type, def) {
  if (type === 'pulse') {
    fillRound(ctx, 0, -3.5, 20, 7, 3.5, rgba(def.color, 0.9));
    fillRound(ctx, 2, -1.6, 16, 3.2, 1.6, rgba(COLORS.white, 0.35));
    ctx.beginPath();
    ctx.arc(3, 0, 5, 0, TAU);
    ctx.fillStyle = '#0c1522';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3, 0, 2.6, 0, TAU);
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(20, 0, 2.4, 0, TAU);
    ctx.fillStyle = COLORS.white;
    ctx.fill();
  } else if (type === 'arc') {
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
    ctx.arc(17, 0, 3.4, 0, TAU);
    ctx.fillStyle = rgba(def.color, 0.95);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3, 0, 4.4, 0, TAU);
    ctx.fillStyle = rgba(COLORS.white, 0.85);
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.white, 0.65);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(5, -1);
    ctx.lineTo(10, 1);
    ctx.lineTo(8, -3);
    ctx.lineTo(13, 2);
    ctx.stroke();
  } else {
    fillRound(ctx, 0, -4, 27, 8, 3, '#2a1c0b');
    fillRound(ctx, 2, -2.4, 24, 4.8, 2.4, rgba(def.color, 0.85));
    fillRound(ctx, 4, -1, 14, 2, 1, rgba(COLORS.white, 0.4));
    ctx.beginPath();
    ctx.arc(28, 0, 3.2, 0, TAU);
    ctx.fillStyle = rgba(def.color, 0.95);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2, 0, 5, 0, TAU);
    ctx.fillStyle = '#12202f';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2, 0, 2.2, 0, TAU);
    ctx.fillStyle = rgba(def.color, 0.7);
    ctx.fill();
  }
}

function drawTowers(ctx, game) {
  for (const tower of game.towers) {
    const def = TOWERS[tower.type];
    const selected = game.selectedTower === tower.id;
    const level = tower.level;
    const stats = towerStats(def, level);
    const muzzle = tower.cd / stats.interval;
    ctx.save();
    ctx.translate(tower.x, tower.y);
    // Base bloom and plate.
    radialGlow(ctx, 0, 0, 40, def.color, selected ? 0.22 : 0.13);
    ctx.shadowColor = rgba(def.color, selected ? 0.85 : 0.45);
    ctx.shadowBlur = selected ? 22 : 12;
    fillRound(ctx, -22, -22, 44, 44, 11, '#0b1320');
    strokeRound(ctx, -22, -22, 44, 44, 11, rgba(def.color, selected ? 0.95 : 0.5), selected ? 2 : 1.4);
    ctx.shadowBlur = 0;
    // Corner bolts.
    ctx.fillStyle = rgba(def.color, 0.5);
    for (const [bx, by] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) {
      ctx.beginPath();
      ctx.arc(bx, by, 1.3, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    ctx.rotate(tower.aim);
    drawTowerGlyph(ctx, tower.type, def);
    // Muzzle flash for a shot fired in the last moments.
    if (muzzle > 0.74) {
      const heat = (muzzle - 0.74) / 0.26;
      ctx.shadowColor = rgba(def.color, 0.95);
      ctx.shadowBlur = 16 * heat;
      ctx.beginPath();
      ctx.arc(tower.type === 'rail' ? 29 : tower.type === 'arc' ? 18 : 21, 0, 2.2 + heat * 3.2, 0, TAU);
      ctx.fillStyle = rgba(COLORS.white, 0.85 * heat);
      ctx.fill();
    }
    ctx.restore();
    // Level pips.
    for (let i = 0; i < MAX_LEVEL; i++) {
      fillRound(ctx, -13 + i * 9, 18, 6, 3, 1.5, i < level ? def.color : '#223047');
    }
    if (level > 1) {
      ctx.save();
      ctx.rotate(-game.time * 0.9);
      ctx.strokeStyle = rgba(def.color, 0.28);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    if (selected) {
      ctx.save();
      ctx.strokeStyle = rgba(def.color, 0.8);
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 5]);
      ctx.lineDashOffset = -game.time * 12;
      ctx.beginPath();
      ctx.arc(0, 0, 28 + Math.sin(game.time * 4) * 1.2, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

/** The outline of one enemy, with its idle animation applied in local space. */
function enemyBody(ctx, enemy, def, time) {
  const size = def.size;
  const phase = time * 6.5 + enemy.id * 1.7;
  if (enemy.type === 'runner') {
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.lineTo(size * 0.72, -size * 0.66);
    ctx.lineTo(size * 0.32, 0);
    ctx.lineTo(size * 0.72, size * 0.66);
    ctx.closePath();
  } else if (enemy.type === 'swarmer') {
    ctx.save();
    ctx.rotate(time * 2.6 + enemy.id);
    const scale = 1 + Math.sin(phase * 1.4) * 0.1;
    ctx.beginPath();
    const arms = 8;
    for (let i = 0; i < arms; i++) {
      const angle = (TAU / arms) * i;
      const radius = (i % 2 === 0 ? size * 1.3 : size * 0.48) * scale;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.restore();
  } else if (enemy.type === 'brute') {
    ctx.save();
    ctx.rotate(Math.sin(time * 0.8 + enemy.id) * 0.14);
    polygonPath(ctx, size, 6, time * 0.5 + Math.PI / 6);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.82, 0, TAU);
  }
}

function drawEnemyBody(ctx, enemy, def, game) {
  const size = def.size;
  const time = game.time;
  const color = def.color;
  const flash = clamp(enemy.flash, 0, 1);
  const isSwarmer = enemy.type === 'swarmer';
  ctx.save();
  ctx.shadowColor = rgba(color, 0.75);
  ctx.shadowBlur = enemy.type === 'brute' ? 18 : 11;
  enemyBody(ctx, enemy, def, time);
  if (isSwarmer) {
    ctx.fillStyle = rgba(color, 0.85);
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.white, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (enemy.type === 'brute') {
    ctx.fillStyle = '#2a1018';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, TAU);
    ctx.fillStyle = rgba(color, 0.75);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.2, 0, TAU);
    ctx.fillStyle = rgba(COLORS.white, 0.75);
    ctx.fill();
  } else if (enemy.type === 'shield') {
    ctx.fillStyle = '#161f2e';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-size * 0.18, 0, size * 0.26, 0, TAU);
    ctx.fillStyle = rgba(color, 0.8);
    ctx.fill();
  } else {
    ctx.fillStyle = '#2a1219';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-size * 0.18, 0, 2.4, 0, TAU);
    ctx.fillStyle = rgba(COLORS.white, 0.9);
    ctx.fill();
  }
  if (flash > 0.01) {
    enemyBody(ctx, enemy, def, time);
    ctx.fillStyle = rgba(COLORS.white, 0.55 * flash + 0.18 * flash);
    ctx.fill();
  }
  ctx.restore();
}

function drawShieldArc(ctx, enemy, def, game) {
  const size = def.size;
  const pulse = 0.5 + Math.sin(game.time * 5 + enemy.id) * 0.5;
  ctx.save();
  ctx.shadowColor = rgba(COLORS.white, 0.7);
  ctx.shadowBlur = 8 + pulse * 8;
  ctx.strokeStyle = rgba(COLORS.white, 0.55 + pulse * 0.3);
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.02, Math.PI * 0.52, Math.PI * 1.48);
  ctx.stroke();
  ctx.strokeStyle = rgba(def.color, 0.7);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.16, Math.PI * 0.6, Math.PI * 1.4);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.restore();
}

function drawEnemyBar(ctx, enemy, y, heavy) {
  const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
  if (!heavy && ratio > 0.999) return;
  const width = heavy ? 48 : 28;
  const height = heavy ? 5 : 3.5;
  const barY = y - (heavy ? 40 : 25);
  const barColor = ratio > 0.5 ? COLORS.green : ratio > 0.25 ? COLORS.amber : COLORS.red;
  ctx.save();
  fillRound(ctx, enemy.x - width / 2 - 1.5, barY - 1.5, width + 3, height + 3, (height + 3) / 2, 'rgba(4, 8, 14, 0.9)');
  if (ratio > 0) {
    fillRound(ctx, enemy.x - width / 2, barY, width * ratio, height, height / 2, barColor);
  }
  if (heavy) {
    ctx.strokeStyle = 'rgba(4, 8, 14, 0.7)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const tick = enemy.x - width / 2 + (width / 4) * i;
      ctx.beginPath();
      ctx.moveTo(tick, barY);
      ctx.lineTo(tick, barY + height);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawEnemies(ctx, game) {
  for (const enemy of game.enemies) {
    const def = ENEMIES[enemy.type];
    const heavy = enemy.type === 'brute';
    const bob = Math.sin(game.time * (heavy ? 4 : 7) + enemy.id * 1.7) * (heavy ? 1.1 : 1.7);
    const y = enemy.y + bob;
    // Ground shadow.
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(enemy.x, enemy.y + def.size * 0.92, def.size * 0.95, def.size * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // Motion streaks behind runners.
    if (enemy.type === 'runner') {
      ctx.save();
      ctx.strokeStyle = rgba(def.color, 0.3);
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 2; i++) {
        const offset = def.size + 6 + i * 6 + Math.sin(game.time * 9 + enemy.id + i) * 2;
        ctx.beginPath();
        ctx.moveTo(enemy.x + offset, y - 3 + i * 5);
        ctx.lineTo(enemy.x + offset + 11, y - 3 + i * 5);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(enemy.x, y);
    drawEnemyBody(ctx, enemy, def, game);
    if (enemy.type === 'shield') drawShieldArc(ctx, enemy, def, game);
    ctx.restore();
    drawEnemyBar(ctx, enemy, y, heavy);
    if (enemy.armor > 0) {
      for (let i = 0; i < enemy.armor; i++) {
        fillRound(ctx, enemy.x - 8 + i * 6, y - 34, 4, 4, 1, rgba(COLORS.steel, 0.9));
      }
    }
  }
}

function drawShotTrail(ctx, shot) {
  const points = shot.trail.concat([{ x: shot.x, y: shot.y }]);
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 1; i < points.length; i++) {
    const t = i / (points.length - 1);
    ctx.strokeStyle = rgba(shot.color, 0.05 + t * t * 0.55);
    ctx.lineWidth = (shot.kind === 'rail' ? 8 : 4.6) * t;
    ctx.beginPath();
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShots(ctx, game) {
  for (const shot of game.shots) {
    if (shot.trail.length > 1) drawShotTrail(ctx, shot);
    ctx.save();
    ctx.shadowColor = rgba(shot.color, 0.9);
    ctx.shadowBlur = shot.kind === 'rail' ? 20 : 14;
    if (shot.kind === 'rail') {
      const angle = Math.atan2(shot.ty - shot.y, shot.tx - shot.x);
      ctx.translate(shot.x, shot.y);
      ctx.rotate(angle);
      const streak = ctx.createLinearGradient(-40, 0, 8, 0);
      streak.addColorStop(0, rgba(shot.color, 0));
      streak.addColorStop(0.7, rgba(shot.color, 0.85));
      streak.addColorStop(1, rgba(COLORS.white, 0.95));
      ctx.strokeStyle = streak;
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();
      ctx.strokeStyle = rgba(COLORS.white, 0.95);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(0, 0, 2.8, 0, TAU);
      ctx.fillStyle = COLORS.white;
      ctx.fill();
    } else {
      radialGlow(ctx, shot.x, shot.y, 15, shot.color, 0.5);
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 3.4, 0, TAU);
      ctx.fillStyle = COLORS.white;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 5.8, 0, TAU);
      ctx.strokeStyle = rgba(shot.color, 0.85);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = rgba(COLORS.white, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(shot.x - 7, shot.y);
      ctx.lineTo(shot.x + 7, shot.y);
      ctx.moveTo(shot.x, shot.y - 7);
      ctx.lineTo(shot.x, shot.y + 7);
      ctx.stroke();
    }
    ctx.restore();
  }
  void game;
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
      ctx.lineTo(effect.x - effect.vx * 0.02, effect.y - effect.vy * 0.02);
      ctx.stroke();
      ctx.strokeStyle = rgba(COLORS.white, fade * 0.7);
      ctx.lineWidth = Math.max(0.6, effect.size * fade * 0.35);
      ctx.stroke();
      ctx.restore();
    } else if (effect.kind === 'debris') {
      ctx.save();
      ctx.translate(effect.x, effect.y);
      ctx.rotate(effect.rot);
      ctx.globalAlpha = fade;
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.moveTo(effect.size, 0);
      ctx.lineTo(-effect.size * 0.7, effect.size * 0.7);
      ctx.lineTo(-effect.size * 0.7, -effect.size * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    } else if (effect.kind === 'flash') {
      const radius = effect.r * (0.45 + age * 0.85);
      radialGlow(ctx, effect.x, effect.y, radius, effect.color, 0.7 * fade);
      ctx.save();
      ctx.globalAlpha = fade * 0.9;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.r * 0.28 * (1 - age * 0.4), 0, TAU);
      ctx.fillStyle = COLORS.white;
      ctx.fill();
      ctx.restore();
    } else if (effect.kind === 'ring') {
      const radius = effect.r0 + (effect.r1 - effect.r0) * age;
      ctx.save();
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, TAU);
      ctx.strokeStyle = rgba(effect.color, fade * 0.9);
      ctx.lineWidth = 1 + 3.4 * fade;
      ctx.shadowColor = rgba(effect.color, 0.8 * fade);
      ctx.shadowBlur = 10 * fade;
      ctx.stroke();
      ctx.restore();
    } else if (effect.kind === 'bolt') {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = rgba(effect.color, 0.9);
      ctx.shadowBlur = 16 * fade;
      ctx.beginPath();
      for (let i = 0; i < effect.points.length; i++) {
        const point = effect.points[i];
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.strokeStyle = rgba(effect.color, 0.42 * fade);
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = rgba(effect.color, 0.95 * fade);
      ctx.lineWidth = 3.2;
      ctx.stroke();
      ctx.strokeStyle = rgba(COLORS.white, 0.95 * fade);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.shadowBlur = 0;
      for (let i = 1; i < effect.points.length; i++) {
        const point = effect.points[i];
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2.4 * fade + 0.6, 0, TAU);
        ctx.fillStyle = rgba(effect.color, 0.85 * fade);
        ctx.fill();
      }
      ctx.restore();
    } else if (effect.kind === 'float') {
      ctx.save();
      ctx.font = font(13, 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba('#05080e', 0.8 * fade);
      ctx.strokeText(effect.text, effect.x, effect.y);
      ctx.fillStyle = rgba(effect.color, fade);
      ctx.shadowColor = rgba(effect.color, 0.7 * fade);
      ctx.shadowBlur = 8;
      ctx.fillText(effect.text, effect.x, effect.y);
      ctx.restore();
    }
  }
  void game;
}

function drawFieldVignette(ctx) {
  const gradient = ctx.createRadialGradient(FIELD_W / 2, FIELD_H / 2, 190, FIELD_W / 2, FIELD_H / 2, 520);
  gradient.addColorStop(0, 'rgba(3, 6, 10, 0)');
  gradient.addColorStop(0.7, 'rgba(3, 6, 10, 0.18)');
  gradient.addColorStop(1, 'rgba(3, 6, 10, 0.5)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawHud(ctx, game) {
  const layout = hudLayout();
  const panel = layout.panel;
  const panelGradient = ctx.createLinearGradient(0, panel.y, 0, panel.y + panel.h);
  panelGradient.addColorStop(0, '#121c2c');
  panelGradient.addColorStop(1, '#0a111c');
  fillRound(ctx, panel.x, panel.y, panel.w, panel.h, 12, panelGradient);
  strokeRound(ctx, panel.x, panel.y, panel.w, panel.h, 12, COLORS.panelLine, 1);
  ctx.save();
  const accent = ctx.createLinearGradient(panel.x, 0, panel.x + panel.w, 0);
  accent.addColorStop(0, rgba(COLORS.cyan, 0.5));
  accent.addColorStop(0.4, rgba(COLORS.purple, 0.35));
  accent.addColorStop(1, rgba(COLORS.green, 0.45));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(panel.x + 14, panel.y + 1);
  ctx.lineTo(panel.x + panel.w - 14, panel.y + 1);
  ctx.stroke();
  ctx.restore();
  // Section dividers.
  ctx.save();
  ctx.strokeStyle = 'rgba(38, 54, 82, 0.7)';
  ctx.lineWidth = 1;
  for (const x of [178, 300, 414, 512]) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, panel.y + 10);
    ctx.lineTo(x + 0.5, panel.y + panel.h - 10);
    ctx.stroke();
  }
  ctx.restore();

  // Core integrity — the biggest number in the HUD.
  const ratio = clamp(game.hp / CORE_HP, 0, 1);
  const barColor = ratio > 0.5 ? COLORS.cyan : ratio > 0.25 ? COLORS.orange : COLORS.red;
  label(ctx, 'CORE INTEGRITY', layout.core.x, 590, 8.5, COLORS.textDim, 700);
  ctx.font = font(24, 800);
  const hpWidth = ctx.measureText(String(game.hp)).width;
  label(ctx, String(game.hp), layout.core.x, 607, 24, barColor, 800);
  label(ctx, `/${CORE_HP}`, layout.core.x + hpWidth + 4, 610, 11, COLORS.textDim, 700);
  fillRound(ctx, layout.core.x, 618, layout.core.w, 8, 4, '#070c14');
  if (ratio > 0) {
    const hpGradient = ctx.createLinearGradient(layout.core.x, 0, layout.core.x + layout.core.w, 0);
    hpGradient.addColorStop(0, barColor);
    hpGradient.addColorStop(1, rgba(barColor, 0.6));
    fillRound(ctx, layout.core.x, 618, layout.core.w * ratio, 8, 4, hpGradient);
  }
  strokeRound(ctx, layout.core.x, 618, layout.core.w, 8, 4, 'rgba(38, 54, 82, 0.9)', 1);
  const threat = game.wave === 0 ? 'STANDBY' : game.wave >= TOTAL_WAVES ? 'FINAL WAVE' : game.wave >= 8 ? 'THREAT: SEVERE' : game.wave >= 4 ? 'THREAT: ELEVATED' : 'THREAT: LOW';
  label(ctx, threat, layout.core.x, 632, 7.5, rgba(barColor, 0.9), 700);

  // Credits.
  label(ctx, 'CREDITS', layout.credits.x, 590, 8.5, COLORS.textDim, 700);
  ctx.font = font(24, 800);
  const creditsText = String(game.credits);
  const creditsWidth = ctx.measureText(creditsText).width;
  label(ctx, creditsText, layout.credits.x, 607, 24, COLORS.green, 800);
  label(ctx, 'c', layout.credits.x + creditsWidth + 3, 611, 11, rgba(COLORS.green, 0.7), 800);

  // Wave counter with a progress ladder.
  label(ctx, 'WAVE', layout.wave.x, 590, 8.5, COLORS.textDim, 700);
  ctx.font = font(24, 800);
  const waveText = String(game.wave).padStart(2, '0');
  const waveWidth = ctx.measureText(waveText).width;
  label(ctx, waveText, layout.wave.x, 607, 24, COLORS.purple, 800);
  label(ctx, `/ ${TOTAL_WAVES}`, layout.wave.x + waveWidth + 4, 610, 11, COLORS.textDim, 700);
  for (let i = 0; i < TOTAL_WAVES; i++) {
    const px = layout.wave.x + i * 8;
    const done = i < game.wave;
    const current = i === game.wave - 1;
    fillRound(ctx, px, 621, 6, 5, 2, current ? COLORS.white : done ? COLORS.purple : '#1b2536');
  }

  // Kills and leaks.
  label(ctx, 'KILLS', layout.stats.x, 592, 8, COLORS.textDim, 700);
  label(ctx, String(game.kills), layout.stats.x + layout.stats.w - 4, 592, 13, COLORS.text, 800, 'right');
  label(ctx, 'LEAKS', layout.stats.x, 612, 8, COLORS.textDim, 700);
  label(ctx, String(game.leaks), layout.stats.x + layout.stats.w - 4, 612, 13, game.leaks > 0 ? COLORS.red : COLORS.text, 800, 'right');

  // Mute toggle.
  const mute = layout.mute;
  fillRound(ctx, mute.x, mute.y, mute.w, mute.h, 5, game.mute ? 'rgba(255, 93, 115, 0.14)' : 'rgba(55, 230, 162, 0.10)');
  strokeRound(ctx, mute.x, mute.y, mute.w, mute.h, 5, game.mute ? rgba(COLORS.red, 0.7) : rgba(COLORS.green, 0.45), 1);
  label(ctx, 'M', mute.x + mute.w / 2, mute.y + mute.h / 2 + 0.5, 10, game.mute ? COLORS.red : COLORS.green, 800, 'center');
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
    fillRound(ctx, chip.x + 4, chip.y + 5, 15, 15, 4, active ? rgba(def.color, 0.9) : '#1b2637');
    label(ctx, String(index), chip.x + 11.5, chip.y + 12.8, 9, active ? '#08121a' : COLORS.textDim, 800, 'center');
    label(ctx, def.name, chip.x + 23, chip.y + 9.5, 8.5, active ? COLORS.white : affordable ? COLORS.text : COLORS.textFaint, 700);
    label(ctx, `${def.cost}c`, chip.x + 23, chip.y + 20, 8, affordable ? COLORS.green : COLORS.red, 700);
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
  label(ctx, text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5, 8.2, enabled ? color : COLORS.textFaint, 800, 'center');
}

function drawMessage(ctx, game) {
  if (game.messageTimer <= 0 || game.message === '') return;
  if (game.phase === 'title' || game.phase === 'over' || game.phase === 'victory') return;
  const fade = clamp(game.messageTimer / 0.4, 0, 1);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.font = font(12, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(game.message).width + 40;
  const x = WIDTH / 2 - width / 2;
  fillRound(ctx, x, 14, width, 30, 15, 'rgba(10, 16, 26, 0.94)');
  strokeRound(ctx, x, 14, width, 30, 15, rgba(COLORS.cyan, 0.45), 1);
  ctx.fillStyle = COLORS.cyan;
  ctx.shadowColor = rgba(COLORS.cyan, 0.6);
  ctx.shadowBlur = 10;
  ctx.fillText(game.message, WIDTH / 2, 29.5);
  ctx.restore();
}

/** The framed panel every overlay screen sits in, with corner brackets and a glow. */
function panelBox(ctx, x, y, w, h, accent) {
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, 'rgba(19, 28, 45, 0.99)');
  gradient.addColorStop(0.55, 'rgba(13, 20, 32, 0.99)');
  gradient.addColorStop(1, 'rgba(9, 14, 23, 0.99)');
  ctx.save();
  ctx.shadowColor = rgba(accent, 0.28);
  ctx.shadowBlur = 40;
  fillRound(ctx, x, y, w, h, 18, gradient);
  ctx.restore();
  strokeRound(ctx, x, y, w, h, 18, rgba(accent, 0.55), 1.4);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + 22, y + 1.5);
  ctx.lineTo(x + w - 22, y + 1.5);
  ctx.strokeStyle = rgba(accent, 0.8);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Corner brackets.
  ctx.strokeStyle = rgba(accent, 0.85);
  ctx.lineWidth = 2;
  const corners = [[x + 10, y + 18, 1, -1], [x + w - 10, y + 18, -1, -1], [x + 10, y + h - 18, 1, 1], [x + w - 10, y + h - 18, -1, 1]];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + 10 * sy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + 10 * sx, cy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOverlay(ctx, game) {
  if (game.phase === 'title') drawTitle(ctx, game);
  else if (game.phase === 'wavebreak') drawWaveBreak(ctx, game);
  else if (game.phase === 'over') drawGameOver(ctx, game);
  else if (game.phase === 'victory') drawVictory(ctx, game);
}

/** A small framed tower icon used on the title screen. */
function drawTowerCard(ctx, key, x, y, w, h) {
  const def = TOWERS[key];
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, 'rgba(20, 30, 47, 0.95)');
  gradient.addColorStop(1, 'rgba(11, 17, 27, 0.95)');
  fillRound(ctx, x, y, w, h, 10, gradient);
  strokeRound(ctx, x, y, w, h, 10, rgba(def.color, 0.4), 1.1);
  radialGlow(ctx, x + 30, y + h / 2, 30, def.color, 0.2);
  ctx.save();
  ctx.translate(x + 31, y + h / 2 + 6);
  ctx.rotate(-Math.PI / 2);
  ctx.scale(0.86, 0.86);
  ctx.shadowColor = rgba(def.color, 0.7);
  ctx.shadowBlur = 12;
  drawTowerGlyph(ctx, key, def);
  ctx.restore();
  label(ctx, def.name, x + 58, y + 22, 13, COLORS.white, 800);
  label(ctx, `${def.cost} CREDITS`, x + 58, y + 39, 10, COLORS.green, 700);
  label(ctx, `DMG ${def.damage} · RNG ${def.range}`, x + 58, y + 54, 8, COLORS.textDim, 600);
  ctx.fillStyle = rgba(def.color, 0.9);
  ctx.fillRect(x + 58, y + h - 8, 18, 2);
}

function drawTitle(ctx, game) {
  ctx.fillStyle = 'rgba(5, 8, 14, 0.82)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Decorative scanlines over the field.
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = 'rgba(38, 54, 82, 0.5)';
  ctx.lineWidth = 1;
  for (let y = 40; y < FIELD_H; y += 26) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(FIELD_W, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
  radialGlow(ctx, WIDTH / 2, 300, 300, COLORS.cyan, 0.1);
  panelBox(ctx, 104, 44, 560, 524, COLORS.cyan);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(10, 700);
  ctx.fillStyle = rgba(COLORS.cyan, 0.75);
  spacedText(ctx, '//  GRID DEFENSE SYSTEM  //  SECTOR 07', WIDTH / 2, 84, 2.2);
  const titleGradient = ctx.createLinearGradient(220, 120, 548, 180);
  titleGradient.addColorStop(0, COLORS.cyan);
  titleGradient.addColorStop(0.55, '#a9ccff');
  titleGradient.addColorStop(1, COLORS.purple);
  ctx.font = font(68, 800);
  ctx.shadowColor = rgba(COLORS.cyan, 0.6);
  ctx.shadowBlur = 30;
  ctx.fillStyle = titleGradient;
  spacedText(ctx, 'VOLTGRID', WIDTH / 2, 148, 3.4);
  ctx.shadowBlur = 0;
  ctx.font = font(12, 700);
  ctx.fillStyle = COLORS.textDim;
  spacedText(ctx, 'TOWER DEFENSE  //  GRID 12 × 9', WIDTH / 2, 192, 2.6);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(38, 54, 82, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(150, 214.5);
  ctx.lineTo(618, 214.5);
  ctx.stroke();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(13, 500);
  ctx.fillStyle = COLORS.text;
  ctx.fillText('Hostile code surges in from the right and runs for the CORE.', WIDTH / 2, 240);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText('Build towers, upgrade them, and hold all twelve waves.', WIDTH / 2, 264);
  // The three tower types, as cards.
  drawTowerCard(ctx, 'pulse', 136, 290, 156, 68);
  drawTowerCard(ctx, 'arc', 304, 290, 156, 68);
  drawTowerCard(ctx, 'rail', 472, 290, 156, 68);
  ctx.save();
  ctx.strokeStyle = 'rgba(38, 54, 82, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(150, 380.5);
  ctx.lineTo(618, 380.5);
  ctx.stroke();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(11, 600);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText('1 2 3 pick a tower  ·  click a cell to build  ·  click a tower to inspect', WIDTH / 2, 404);
  ctx.fillText('U upgrade  ·  S sell  ·  N next wave  ·  M sound  ·  ENTER start', WIDTH / 2, 426);
  const blink = 0.5 + 0.5 * Math.sin(game.time * 3.2);
  const ctaW = 316;
  const ctaX = WIDTH / 2 - ctaW / 2;
  fillRound(ctx, ctaX, 452, ctaW, 42, 21, rgba(COLORS.cyan, 0.08 + blink * 0.06));
  strokeRound(ctx, ctaX, 452, ctaW, 42, 21, rgba(COLORS.cyan, 0.35 + blink * 0.4), 1.4);
  ctx.font = font(17, 800);
  ctx.fillStyle = rgba(COLORS.cyan, 0.55 + blink * 0.45);
  ctx.shadowColor = rgba(COLORS.cyan, 0.5);
  ctx.shadowBlur = 14;
  spacedText(ctx, 'PRESS ENTER TO DEPLOY', WIDTH / 2, 474, 2.4);
  ctx.shadowBlur = 0;
  ctx.font = font(10, 600);
  ctx.fillStyle = COLORS.textFaint;
  spacedText(ctx, `START 90 CREDITS  ·  CORE ${CORE_HP} HP  ·  ${TOTAL_WAVES} WAVES TO HOLD`, WIDTH / 2, 526, 1.4);
}

function drawWaveBreak(ctx, game) {
  const summary = game.waveSummary;
  if (summary === null) return;
  ctx.fillStyle = 'rgba(5, 8, 14, 0.66)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  panelBox(ctx, 196, 158, 376, 300, COLORS.green);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(10, 800);
  ctx.fillStyle = COLORS.green;
  spacedText(ctx, 'WAVE CLEARED', WIDTH / 2, 196, 3.4);
  ctx.font = font(42, 800);
  ctx.fillStyle = COLORS.white;
  ctx.shadowColor = rgba(COLORS.green, 0.35);
  ctx.shadowBlur = 18;
  ctx.fillText(`WAVE ${String(summary.wave).padStart(2, '0')}`, WIDTH / 2, 240);
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(38, 54, 82, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(232, 268.5);
  ctx.lineTo(536, 268.5);
  ctx.stroke();
  ctx.restore();
  const rows = [
    ['KILLS', String(summary.kills), summary.kills > 0 ? COLORS.text : COLORS.textDim],
    ['LEAKS', String(summary.leaks), summary.leaks > 0 ? COLORS.red : COLORS.text],
    ['WAVE BONUS', `+${summary.bonus} c`, COLORS.green],
    ['CREDITS', `${summary.credits} c`, COLORS.text],
  ];
  for (let i = 0; i < rows.length; i++) {
    const y = 292 + i * 22;
    label(ctx, rows[i][0], 244, y, 10, COLORS.textDim, 700);
    label(ctx, rows[i][1], 526, y, 13, rows[i][2], 800, 'right');
  }
  const nextWave = summary.wave + 1;
  const blink = 0.5 + 0.5 * Math.sin(game.time * 3.4);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(11.5, 800);
  ctx.fillStyle = rgba(COLORS.cyan, 0.45 + blink * 0.55);
  spacedText(ctx, `PRESS N OR ENTER — WAVE ${String(nextWave).padStart(2, '0')}`, WIDTH / 2, 424, 1.5);
  ctx.restore();
}

/** A large label/value summary table used by the two end screens. */
function drawStatTable(ctx, rows, startY, step, leftX, rightX) {
  ctx.save();
  for (let i = 0; i < rows.length; i++) {
    const y = startY + i * step;
    if (i > 0) {
      ctx.strokeStyle = 'rgba(38, 54, 82, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftX, y - step / 2);
      ctx.lineTo(rightX, y - step / 2);
      ctx.stroke();
    }
    label(ctx, rows[i][0], leftX, y, 9.5, COLORS.textDim, 700);
    label(ctx, rows[i][1], rightX, y, 19, rows[i][2] ?? COLORS.text, 800, 'right');
  }
  ctx.restore();
}

function drawRankBadge(ctx, x, y, rank, color, caption) {
  ctx.save();
  radialGlow(ctx, x, y, 42, color, 0.3);
  ctx.beginPath();
  ctx.arc(x, y, 27, 0, TAU);
  ctx.fillStyle = '#0a1019';
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.9);
  ctx.lineWidth = 2;
  ctx.shadowColor = rgba(color, 0.7);
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(7.5, 800);
  ctx.fillStyle = rgba(color, 0.75);
  ctx.fillText(caption, x, y - 10);
  ctx.font = font(20, 800);
  ctx.fillStyle = color;
  ctx.fillText(rank, x, y + 6);
  ctx.restore();
}

function drawGameOver(ctx, game) {
  ctx.fillStyle = 'rgba(5, 8, 13, 0.85)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  radialGlow(ctx, WIDTH / 2, 300, 300, COLORS.red, 0.08);
  panelBox(ctx, 130, 100, 508, 448, COLORS.red);
  drawRankBadge(ctx, 600, 154, String(game.wave), COLORS.red, 'WAVE');
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(10, 800);
  ctx.fillStyle = COLORS.red;
  spacedText(ctx, 'SIGNAL LOST', WIDTH / 2, 138, 3.6);
  ctx.font = font(52, 800);
  ctx.shadowColor = rgba(COLORS.red, 0.5);
  ctx.shadowBlur = 26;
  ctx.fillStyle = COLORS.red;
  spacedText(ctx, 'CORE DOWN', WIDTH / 2, 192, 1.6);
  ctx.shadowBlur = 0;
  ctx.font = font(13, 500);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(game.overReason === '' ? `The core fell on wave ${game.wave} of ${TOTAL_WAVES}.` : game.overReason, WIDTH / 2, 232);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(38, 54, 82, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(180, 258.5);
  ctx.lineTo(588, 258.5);
  ctx.stroke();
  ctx.restore();
  drawStatTable(ctx, [
    ['WAVES REACHED', `${game.wave} / ${TOTAL_WAVES}`],
    ['KILLS', String(game.kills)],
    ['LEAKS', String(game.leaks), game.leaks > 0 ? COLORS.red : COLORS.text],
    ['CREDITS LEFT', String(game.credits), COLORS.green],
    ['TIME SURVIVED', clock(game.time)],
  ], 288, 32, 184, 584);
  const blink = 0.5 + 0.5 * Math.sin(game.time * 3.2);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(13, 800);
  ctx.fillStyle = rgba(COLORS.cyan, 0.45 + blink * 0.55);
  spacedText(ctx, 'PRESS ENTER TO REBUILD', WIDTH / 2, 504, 2.2);
  ctx.restore();
}

function drawVictory(ctx, game) {
  ctx.fillStyle = 'rgba(5, 9, 13, 0.84)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  radialGlow(ctx, WIDTH / 2, 300, 320, COLORS.green, 0.1);
  const breathe = 0.5 + Math.sin(game.time * 2) * 0.5;
  radialGlow(ctx, CORE_X, CORE_Y, 160 + breathe * 40, COLORS.green, 0.12);
  panelBox(ctx, 130, 92, 508, 470, COLORS.green);
  const rank = game.leaks === 0 ? 'S' : game.leaks <= 2 ? 'A' : game.leaks <= 5 ? 'B' : 'C';
  drawRankBadge(ctx, 602, 150, rank, COLORS.green, 'RANK');
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(10, 800);
  ctx.fillStyle = COLORS.green;
  spacedText(ctx, 'GRID INTEGRITY STABLE', WIDTH / 2, 130, 3.6);
  const titleGradient = ctx.createLinearGradient(220, 155, 548, 210);
  titleGradient.addColorStop(0, COLORS.green);
  titleGradient.addColorStop(0.6, '#9dffd8');
  titleGradient.addColorStop(1, COLORS.cyan);
  ctx.font = font(48, 800);
  ctx.shadowColor = rgba(COLORS.green, 0.6);
  ctx.shadowBlur = 30;
  ctx.fillStyle = titleGradient;
  spacedText(ctx, 'GRID SECURED', WIDTH / 2, 188, 1.6);
  ctx.shadowBlur = 0;
  ctx.font = font(12, 700);
  ctx.fillStyle = rgba(COLORS.green, 0.8);
  spacedText(ctx, `ALL ${TOTAL_WAVES} WAVES REPELLED  ·  CORE ONLINE`, WIDTH / 2, 224, 1.8);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(38, 54, 82, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(180, 250.5);
  ctx.lineTo(588, 250.5);
  ctx.stroke();
  ctx.restore();
  drawStatTable(ctx, [
    ['WAVES CLEARED', `${TOTAL_WAVES} / ${TOTAL_WAVES}`],
    ['KILLS', String(game.kills)],
    ['LEAKS', String(game.leaks), game.leaks > 0 ? COLORS.amber : COLORS.green],
    ['CREDITS EARNED', String(game.creditsEarned), COLORS.green],
    ['RUN TIME', clock(game.time)],
  ], 282, 32, 184, 584);
  const blink = 0.5 + 0.5 * Math.sin(game.time * 3.2);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(13, 800);
  ctx.fillStyle = rgba(COLORS.cyan, 0.45 + blink * 0.55);
  spacedText(ctx, 'PRESS ENTER TO PLAY AGAIN', WIDTH / 2, 500, 2.2);
  ctx.restore();
}
