// Canvas rendering: HUD, grid, core, towers, enemies, shots and every screen.
// Pure read over the World: nothing here mutates game state.

import { CANVAS, COLORS, CORE, ENEMIES, GRID, TOWERS, UPGRADE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_BETWEEN = 'between';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGrid(ctx) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  for (let c = 0; c <= GRID.cols; c += 1) {
    ctx.beginPath();
    ctx.moveTo(c * GRID.cell + 0.5, 0);
    ctx.lineTo(c * GRID.cell + 0.5, GRID.height);
    ctx.stroke();
  }
  for (let r = 0; r <= GRID.rows; r += 1) {
    ctx.beginPath();
    ctx.moveTo(0, r * GRID.cell + 0.5);
    ctx.lineTo(GRID.width, r * GRID.cell + 0.5);
    ctx.stroke();
  }
  // Core lane glow
  ctx.fillStyle = COLORS.path;
  ctx.fillRect(0, (CORE.y - 0.5) * GRID.cell, GRID.width, GRID.cell);
  ctx.fillStyle = COLORS.coreRing;
  ctx.fillRect(0, (CORE.y - 0.5) * GRID.cell, GRID.width, GRID.cell);
}

function drawCore(ctx, world) {
  const cx = (CORE.x + 0.5) * GRID.cell;
  const cy = (CORE.y + 0.5) * GRID.cell;
  const pulse = 1 + 0.05 * Math.sin(world.time * 4);
  const r = 22 * pulse;
  ctx.save();
  ctx.shadowColor = COLORS.core;
  ctx.shadowBlur = 18;
  ctx.fillStyle = COLORS.core;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx - r / 2, cy - r);
  ctx.lineTo(cx + r / 2, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx + r / 2, cy + r);
  ctx.lineTo(cx - r / 2, cy + r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#06251a';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(world.coreHp), cx, cy + 1);
}

function drawTowers(ctx, world, hover) {
  for (const tower of world.towers.values()) {
    const spec = TOWERS[tower.kind];
    const x = tower.col * GRID.cell;
    const y = tower.row * GRID.cell;
    ctx.fillStyle = '#101623';
    roundRect(ctx, x + 6, y + 6, GRID.cell - 12, GRID.cell - 12, 8);
    ctx.fill();
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = 2;
    roundRect(ctx, x + 6, y + 6, GRID.cell - 12, GRID.cell - 12, 8);
    ctx.stroke();
    // Barrel pointing at nothing in particular; idle spin
    const cx = x + GRID.cell / 2;
    const cy = y + GRID.cell / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(world.time * 0.4 + tower.col);
    ctx.fillStyle = spec.color;
    ctx.fillRect(-4, -GRID.cell / 2 + 10, 8, 14);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = spec.color;
    ctx.fill();
    ctx.fillStyle = '#0b0e14';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(tower.level), cx, cy + 1);
    // Range ring on hover
    if (hover && hover.col === tower.col && hover.row === tower.row) {
      const stats = world.towerStats(tower);
      ctx.beginPath();
      ctx.arc(cx, cy, stats.range * GRID.cell, 0, Math.PI * 2);
      ctx.strokeStyle = `${spec.color}55`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

function drawEnemies(ctx, world) {
  for (const e of world.enemies) {
    const spec = e.spec || ENEMIES[e.kind];
    ctx.beginPath();
    ctx.arc(e.x, e.y, spec.radius, 0, Math.PI * 2);
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : spec.color;
    ctx.fill();
    if (spec.armor) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, spec.radius + 4, -Math.PI / 2, Math.PI / 2);
      ctx.strokeStyle = '#cfe8dd';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // HP bar
    const w = spec.radius * 2.4;
    ctx.fillStyle = '#00000088';
    ctx.fillRect(e.x - w / 2, e.y - spec.radius - 10, w, 4);
    ctx.fillStyle = '#37e6a2';
    ctx.fillRect(e.x - w / 2, e.y - spec.radius - 10, (w * Math.max(0, e.hp)) / e.maxHp, 4);
  }
}

function drawShots(ctx, world) {
  for (const s of world.shots) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
  }
  ctx.lineWidth = 2.5;
  for (const z of world.zaps) {
    ctx.beginPath();
    for (let i = 0; i < z.points.length; i += 1) {
      const p = z.points[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = '#e6d9ff';
    ctx.stroke();
  }
}

function drawFloaters(ctx, world) {
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const f of world.floaters) {
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx, world, buildKind) {
  ctx.fillStyle = COLORS.hud;
  ctx.fillRect(0, GRID.height, CANVAS.width, CANVAS.height - GRID.height);
  const y = GRID.height + 22;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = COLORS.text;
  ctx.fillText(`♥ ${world.coreHp}`, 16, y);
  ctx.fillStyle = '#ffd94f';
  ctx.fillText(`⌬ ${world.credits}`, 92, y);
  ctx.fillStyle = COLORS.dim;
  ctx.font = '13px system-ui, sans-serif';
  const waveLabel = world.waveActive
    ? `Wave ${world.wave}/${world.waveTotal}`
    : `Wave ${world.wave}/${world.waveTotal} — press N or click NEXT WAVE`;
  ctx.fillText(waveLabel, 190, y);
  ctx.textAlign = 'right';
  ctx.fillText(`Kills ${world.kills}  Leaks ${world.leaks}`, CANVAS.width - 16, y);

  // Build bar: one chip per tower kind
  const kinds = Object.keys(TOWERS);
  let x = 16;
  const chipY = GRID.height + 44;
  for (const kind of kinds) {
    const spec = TOWERS[kind];
    const active = buildKind === kind;
    const afford = world.credits >= spec.cost;
    ctx.fillStyle = active ? `${spec.color}33` : '#141a28';
    roundRect(ctx, x, chipY, 118, 24, 6);
    ctx.fill();
    ctx.strokeStyle = active ? spec.color : '#232c40';
    ctx.lineWidth = active ? 2 : 1;
    roundRect(ctx, x, chipY, 118, 24, 6);
    ctx.stroke();
    ctx.fillStyle = afford ? spec.color : '#5b6880';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${spec.name} ⌬${spec.cost}`, x + 8, chipY + 13);
    ctx.fillText('1·2·3', x + 92, chipY + 13);
    x += 126;
  }
  const selected = buildKind ? TOWERS[buildKind] : null;
  if (selected) {
    ctx.fillStyle = COLORS.dim;
    ctx.textAlign = 'right';
    ctx.fillText(selected.desc, CANVAS.width - 16, chipY + 13);
  }
}

function drawPlacementPreview(ctx, world, hover, buildKind) {
  if (!buildKind || !hover) return;
  const spec = TOWERS[buildKind];
  const ok = world.canPlace(hover.col, hover.row) && world.credits >= spec.cost;
  const x = hover.col * GRID.cell;
  const y = hover.row * GRID.cell;
  ctx.fillStyle = ok ? `${spec.color}30` : '#ff5d5d22';
  roundRect(ctx, x + 4, y + 4, GRID.cell - 8, GRID.cell - 8, 8);
  ctx.fill();
  ctx.strokeStyle = ok ? spec.color : '#ff5d5d';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  roundRect(ctx, x + 4, y + 4, GRID.cell - 8, GRID.cell - 8, 8);
  ctx.stroke();
  ctx.setLineDash([]);
}

function centerPanel(ctx, lines, accent = '#37e6a2') {
  ctx.fillStyle = '#0b0e14dd';
  ctx.fillRect(0, 0, CANVAS.width, GRID.height);
  const boxW = 560;
  const boxH = 46 + lines.length * 34;
  const bx = (CANVAS.width - boxW) / 2;
  const by = (GRID.height - boxH) / 2;
  ctx.fillStyle = '#101623f0';
  roundRect(ctx, bx, by, boxW, boxH, 14);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  roundRect(ctx, bx, by, boxW, boxH, 14);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.font = line.big ? 'bold 26px system-ui, sans-serif' : '15px system-ui, sans-serif';
    ctx.fillStyle = line.big ? accent : line.color || COLORS.text;
    ctx.fillText(line.text, CANVAS.width / 2, by + 34 + i * 34);
  });
}

export function screenOf(world) {
  if (world.state === 'title') return SCREEN_TITLE;
  if (world.state === 'over') return SCREEN_OVER;
  if (world.state === 'victory') return SCREEN_VICTORY;
  if (world.state === 'between') return SCREEN_BETWEEN;
  return SCREEN_PLAY;
}

export function draw(ctx, world, ui = {}) {
  const { hover = null, buildKind = null, screen = screenOf(world) } = ui;
  ctx.save();
  if (world.shake > 0) {
    ctx.translate((Math.random() - 0.5) * 6 * world.shake, (Math.random() - 0.5) * 6 * world.shake);
  }
  drawGrid(ctx);
  drawCore(ctx, world);
  drawTowers(ctx, world, hover);
  drawEnemies(ctx, world);
  drawShots(ctx, world);
  drawFloaters(ctx, world);
  ctx.restore();
  drawHud(ctx, world, buildKind);
  drawPlacementPreview(ctx, world, hover, buildKind);

  if (screen === SCREEN_TITLE) {
    centerPanel(ctx, [
      { text: 'VOLTGRID', big: true },
      { text: 'Grid defense: place towers, stop the swarm, guard the core.' },
      { text: 'Click a chip (or 1·2·3), click a cell to build. U to upgrade, S to sell.' },
      { text: 'N starts the next wave. 12 waves. Survive them all.', color: COLORS.dim },
      { text: 'Click anywhere or press ENTER to begin', color: '#ffd94f' },
    ]);
  } else if (screen === SCREEN_BETWEEN) {
    centerPanel(ctx, [
      { text: `Wave ${world.wave} cleared`, big: true },
      { text: `Credits ⌬${world.credits} · Core ♥${world.coreHp}` },
      { text: 'Build, upgrade, then press N for the next wave', color: '#ffd94f' },
    ], '#4fd1ff');
  } else if (screen === SCREEN_OVER) {
    centerPanel(ctx, [
      { text: 'CORE DOWN', big: true },
      { text: world.overReason },
      { text: `Waves survived ${world.wave - 1} · Kills ${world.kills}` },
      { text: 'Press ENTER to restart', color: '#ffd94f' },
    ], '#ff5d5d');
  } else if (screen === SCREEN_VICTORY) {
    centerPanel(ctx, [
      { text: 'GRID SECURED', big: true },
      { text: 'All 12 waves stopped. The core stands.' },
      { text: `Kills ${world.kills} · Leaks ${world.leaks} · Core ♥${world.coreHp}` },
      { text: 'Press ENTER to play again', color: '#ffd94f' },
    ]);
  }
}
