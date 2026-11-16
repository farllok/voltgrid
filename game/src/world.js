// VOLTGRID — the simulation. Pure state and fixed-step logic, no DOM, no audio.
// Everything is deterministic: the same seed and the same action sequence replay the same match.

import {
  COLS,
  ROWS,
  TILE,
  FIELD_W,
  LANE_ROW,
  LANE_Y,
  CORE_X,
  CORE_Y,
  CORE_HP,
  START_CREDITS,
  TOTAL_WAVES,
  WAVE_HP_GROWTH,
  WAVE_REWARD_GROWTH,
  MAX_LEVEL,
  TOWERS,
  ENEMIES,
  WAVES,
  COLORS,
  cellCenter,
  towerStats,
  upgradeCost,
  sellValue,
} from './config.js';
import { mulberry32 } from './random.js';

const SPAWN_X = FIELD_W - TILE / 2; // centre of the far right lane cell
const MESSAGE_TIME = 2.2;
const SHOT_LIFE = 3.5;

/** A brand new game, sitting on the title screen. */
export function createGame(seed = 1) {
  const numeric = Number.isFinite(Number(seed)) ? Math.floor(Number(seed)) : 1;
  const clean = numeric >>> 0;
  return {
    seed: clean,
    rng: mulberry32(clean),
    phase: 'title',
    time: 0,
    credits: START_CREDITS,
    hp: CORE_HP,
    wave: 0,
    waveQueue: [],
    waveClock: 0,
    waveKills: 0,
    waveLeaks: 0,
    kills: 0,
    leaks: 0,
    towers: [],
    enemies: [],
    shots: [],
    effects: [],
    nextTowerId: 1,
    nextEnemyId: 1,
    selectedBuild: 'pulse',
    selectedTower: null,
    hover: null,
    mute: false,
    message: '',
    messageTimer: 0,
    waveSummary: null,
    overReason: '',
    events: [],
    creditsEarned: 0,
    creditsSpent: 0,
  };
}

/** Restart the same game object in place, keeping its seed. */
export function resetGame(game) {
  Object.assign(game, createGame(game.seed));
}
/** Short transient line shown above the field. */
export function notify(game, text) {
  game.message = text;
  game.messageTimer = MESSAGE_TIME;
}

function emit(game, name) {
  game.events.push(name);
}

function addSparkBurst(game, x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const angle = game.rng() * Math.PI * 2;
    const velocity = speed * (0.35 + game.rng() * 0.65);
    const life = 0.28 + game.rng() * 0.3;
    game.effects.push({
      kind: 'spark',
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      gravity: 110,
      life,
      maxLife: life,
      size: 1.6 + game.rng() * 2.2,
      color,
    });
  }
}

function addRing(game, x, y, from, to, color, life) {
  game.effects.push({ kind: 'ring', x, y, r0: from, r1: to, life, maxLife: life, color });
}

/** A short bright bloom at the point of a hit. */
function addFlash(game, x, y, color, size) {
  game.effects.push({ kind: 'flash', x, y, r: size, life: 0.16, maxLife: 0.16, color });
}

/** Whirling shards left behind by a dying enemy. */
function addDebris(game, x, y, color, count, power) {
  for (let i = 0; i < count; i++) {
    const angle = game.rng() * Math.PI * 2;
    const speed = (40 + game.rng() * 120) * power;
    const life = 0.45 + game.rng() * 0.5;
    game.effects.push({
      kind: 'debris',
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 34,
      gravity: 190,
      life,
      maxLife: life,
      size: 2 + game.rng() * 3.4,
      rot: game.rng() * Math.PI * 2,
      spin: (game.rng() - 0.5) * 10,
      color,
    });
  }
}

function addFloat(game, x, y, text, color) {
  game.effects.push({ kind: 'float', x, y, text, color, life: 0.9, maxLife: 0.9 });
}

function pushBolt(game, points, color) {
  game.effects.push({ kind: 'bolt', points, life: 0.26, maxLife: 0.26, color });
}

/** Start a fresh run: reset, then launch wave 1. */
export function startGame(game) {
  resetGame(game);
  game.phase = 'wavebreak';
  startNextWave(game);
}

/** Launch the next wave if one is waiting, and return whether it did. */
export function startNextWave(game) {
  if (game.phase !== 'wavebreak') {
    if (game.phase === 'playing') notify(game, 'WAVE ALREADY RUNNING');
    else notify(game, 'PRESS ENTER TO DEPLOY');
    return false;
  }
  if (game.wave >= TOTAL_WAVES) return false;
  const index = game.wave;
  game.wave = index + 1;
  game.phase = 'playing';
  game.waveQueue = [];
  game.waveClock = 0;
  game.waveKills = 0;
  game.waveLeaks = 0;
  game.waveSummary = null;
  const definition = WAVES[index];
  let order = 0;
  for (const group of definition.groups) {
    for (let i = 0; i < group.count; i++) {
      game.waveQueue.push({ type: group.type, t: group.at + i * group.gap, order: order++ });
    }
  }
  game.waveQueue.sort((a, b) => a.t - b.t || a.order - b.order);
  notify(game, `WAVE ${String(game.wave).padStart(2, '0')} INCOMING`);
  emit(game, 'waveStart');
  return true;
}

/**
 * Put one enemy on the lane. Waves call it with a type only; screenshot scenes pass
 * `{ x, y, hpScale }` so a demo frame can stage a dense, already-engaged crowd.
 */
export function spawnEnemy(game, type, options = {}) {
  const def = ENEMIES[type];
  if (def === undefined) return null;
  const scale = Math.pow(WAVE_HP_GROWTH, game.wave - 1);
  const hp = Math.max(1, Math.round(def.hp * scale * (Number.isFinite(options.hpScale) ? options.hpScale : 1)));
  const reward = Math.max(1, Math.round(def.reward * Math.pow(WAVE_REWARD_GROWTH, game.wave - 1)));
  const enemy = {
    id: game.nextEnemyId++,
    type,
    x: Number.isFinite(options.x) ? options.x : SPAWN_X,
    y: Number.isFinite(options.y) ? options.y : LANE_Y,
    hp,
    maxHp: hp,
    speed: def.speed,
    armor: def.armor,
    reward,
    leak: def.leak,
    t: 0,
    flash: 0,
    dead: false,
    leaked: false,
    scored: false,
  };
  game.enemies.push(enemy);
  return enemy;
}

export function towerAt(game, col, row) {
  for (const tower of game.towers) {
    if (tower.col === col && tower.row === row) return tower;
  }
  return null;
}

export function towerById(game, id) {
  for (const tower of game.towers) {
    if (tower.id === id) return tower;
  }
  return null;
}

export function enemyById(game, id) {
  for (const enemy of game.enemies) {
    if (enemy.id === id) return enemy;
  }
  return null;
}

/** Why a tower may or may not be placed on a cell. `code` is used by the autopilot and renderer. */
export function buildCheck(game, typeKey, col, row) {
  const def = TOWERS[typeKey];
  if (def === undefined) return { ok: false, code: 'unknown', reason: 'UNKNOWN TOWER' };
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return { ok: false, code: 'out', reason: 'OUTSIDE THE GRID' };
  if (row === LANE_ROW) return { ok: false, code: 'lane', reason: 'THE LANE IS NOT BUILDABLE' };
  if (game.phase !== 'playing' && game.phase !== 'wavebreak') return { ok: false, code: 'phase', reason: 'GRID OFFLINE' };
  if (towerAt(game, col, row) !== null) return { ok: false, code: 'occupied', reason: 'CELL OCCUPIED' };
  if (game.credits < def.cost) return { ok: false, code: 'credits', reason: `NEED ${def.cost} CREDITS` };
  return { ok: true, code: 'ok', reason: '' };
}

/** Place a tower, paying its cost. Returns whether it was built. */
export function tryBuild(game, typeKey, col, row) {
  const check = buildCheck(game, typeKey, col, row);
  if (!check.ok) {
    notify(game, check.reason);
    emit(game, 'deny');
    return false;
  }
  const def = TOWERS[typeKey];
  const centre = cellCenter(col, row);
  const tower = {
    id: game.nextTowerId++,
    type: typeKey,
    col,
    row,
    x: centre.x,
    y: centre.y,
    level: 1,
    cd: 0,
    aim: -Math.PI / 2,
    invested: def.cost,
  };
  game.towers.push(tower);
  game.credits -= def.cost;
  game.creditsSpent += def.cost;
  game.selectedTower = tower.id;
  addRing(game, tower.x, tower.y, 6, 40, def.color, 0.42);
  addSparkBurst(game, tower.x, tower.y, def.color, 10, 120);
  emit(game, 'build');
  notify(game, `${def.name} ONLINE`);
  return true;
}

export function selectBuild(game, typeKey) {
  if (TOWERS[typeKey] === undefined) return false;
  game.selectedBuild = typeKey;
  game.selectedTower = null;
  const def = TOWERS[typeKey];
  notify(game, `BUILD ${def.name} — ${def.cost} CREDITS`);
  return true;
}

/** A click on the field: pick an existing tower, or build on an empty cell. */
export function clickCell(game, col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  const existing = towerAt(game, col, row);
  if (existing !== null) {
    game.selectedTower = existing.id;
    const def = TOWERS[existing.type];
    notify(game, `${def.name} MK ${existing.level} — U UPGRADE / S SELL`);
    return;
  }
  game.selectedTower = null;
  tryBuild(game, game.selectedBuild, col, row);
}

/** Raise one tower by a level. */
export function upgradeTower(game, tower) {
  if (tower === null || tower === undefined) return false;
  if (tower.level >= MAX_LEVEL) {
    notify(game, 'ALREADY AT MAX LEVEL');
    emit(game, 'deny');
    return false;
  }
  const def = TOWERS[tower.type];
  const cost = upgradeCost(def, tower.level);
  if (game.credits < cost) {
    notify(game, `NEED ${cost} CREDITS`);
    emit(game, 'deny');
    return false;
  }
  game.credits -= cost;
  game.creditsSpent += cost;
  tower.invested += cost;
  tower.level += 1;
  addRing(game, tower.x, tower.y, 8, 48, def.color, 0.5);
  addSparkBurst(game, tower.x, tower.y, def.color, 14, 150);
  emit(game, 'upgrade');
  notify(game, `${def.name} -> MK ${tower.level}`);
  return true;
}

/** Remove one tower for 70% of what was invested. */
export function sellTower(game, tower) {
  if (tower === null || tower === undefined) return false;
  const refund = sellValue(tower);
  const def = TOWERS[tower.type];
  game.towers = game.towers.filter((item) => item.id !== tower.id);
  if (game.selectedTower === tower.id) game.selectedTower = null;
  game.credits += refund;
  addRing(game, tower.x, tower.y, 10, 44, COLORS.green, 0.4);
  emit(game, 'sell');
  notify(game, `${def.name} SOLD +${refund}`);
  return true;
}

export function upgradeSelected(game) {
  const tower = towerById(game, game.selectedTower);
  if (tower === null) {
    notify(game, 'SELECT A TOWER FIRST');
    emit(game, 'deny');
    return false;
  }
  return upgradeTower(game, tower);
}

export function sellSelected(game) {
  const tower = towerById(game, game.selectedTower);
  if (tower === null) {
    notify(game, 'SELECT A TOWER FIRST');
    emit(game, 'deny');
    return false;
  }
  return sellTower(game, tower);
}

function damageEnemy(game, enemy, amount) {
  if (enemy.dead) return;
  const dealt = Math.max(1, amount - enemy.armor);
  enemy.hp -= dealt;
  enemy.flash = 1;
  if (enemy.hp <= 0) enemy.dead = true;
}

function findTarget(game, tower, range) {
  let best = null;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const dx = enemy.x - tower.x;
    const dy = enemy.y - tower.y;
    if (dx * dx + dy * dy > range * range) continue;
    if (best === null || enemy.x < best.x) best = enemy;
  }
  return best;
}

function nearestOther(game, source, range, visited) {
  let best = null;
  let bestDistance = range * range;
  for (const enemy of game.enemies) {
    if (enemy.dead || visited.has(enemy.id)) continue;
    const dx = enemy.x - source.x;
    const dy = enemy.y - source.y;
    const distance = dx * dx + dy * dy;
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

function fireProjectile(game, tower, stats, target) {
  const def = TOWERS[tower.type];
  const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
  const muzzleX = tower.x + Math.cos(angle) * 16;
  const muzzleY = tower.y + Math.sin(angle) * 16;
  game.shots.push({
    kind: def.projectile,
    x: muzzleX,
    y: muzzleY,
    tx: target.x,
    ty: target.y,
    targetId: target.id,
    speed: def.speed,
    damage: stats.damage,
    color: def.color,
    life: SHOT_LIFE,
    trail: [],
  });
  addSparkBurst(game, muzzleX, muzzleY, def.color, 4, 90);
  emit(game, tower.type === 'rail' ? 'shoot:rail' : 'shoot:pulse');
}

/** A zig-zag path between the given anchors, so a chain lightning bolt reads as electricity. */
function jaggedPath(points, rng) {
  if (points.length < 2) return points;
  const out = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const steps = Math.max(2, Math.min(7, Math.round(length / 24)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const offset = (rng() - 0.5) * Math.min(20, 4 + length * 0.14);
      out.push({ x: a.x + dx * t - (dy / length) * offset, y: a.y + dy * t + (dx / length) * offset });
    }
    out.push(b);
  }
  return out;
}

function fireChain(game, tower, stats, target) {
  const def = TOWERS[tower.type];
  const points = [{ x: tower.x, y: tower.y }];
  const visited = new Set();
  let current = target;
  let amount = stats.damage;
  for (let jump = 0; jump < def.chain; jump++) {
    if (current === null) break;
    points.push({ x: current.x, y: current.y });
    damageEnemy(game, current, amount);
    visited.add(current.id);
    amount *= def.chainFalloff;
    current = nearestOther(game, current, def.chainRange, visited);
  }
  pushBolt(game, jaggedPath(points, game.rng), def.color);
  // Crackling sparks at every link of the chain, not just the first target.
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    addFlash(game, point.x, point.y, def.color, i === 1 ? 18 : 13);
    addSparkBurst(game, point.x, point.y, def.color, i === 1 ? 7 : 4, i === 1 ? 150 : 110);
  }
  emit(game, 'shoot:arc');
}

function updateWave(game, dt) {
  game.waveClock += dt;
  while (game.waveQueue.length > 0 && game.waveQueue[0].t <= game.waveClock) {
    const spawn = game.waveQueue.shift();
    spawnEnemy(game, spawn.type);
  }
}

function updateEnemies(game, dt) {
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    enemy.t += dt;
    if (enemy.flash > 0) enemy.flash = Math.max(0, enemy.flash - dt * 6);
    enemy.x -= enemy.speed * dt;
    if (enemy.x <= CORE_X + 10) {
      enemy.dead = true;
      enemy.leaked = true;
      game.leaks += 1;
      game.waveLeaks += 1;
      game.hp = Math.max(0, game.hp - enemy.leak);
      addRing(game, CORE_X, CORE_Y, 12, 58, COLORS.red, 0.5);
      addSparkBurst(game, CORE_X, CORE_Y, COLORS.red, 10, 170);
      emit(game, 'leak');
      if (game.hp <= 0) {
        destroyCore(game);
        return;
      }
    }
  }
}

function updateTowers(game, dt) {
  for (const tower of game.towers) {
    const def = TOWERS[tower.type];
    const stats = towerStats(def, tower.level);
    if (tower.cd > 0) {
      tower.cd -= dt;
      if (tower.cd > 0) continue;
    }
    const target = findTarget(game, tower, stats.range);
    if (target === null) {
      tower.cd = 0;
      continue;
    }
    tower.aim = Math.atan2(target.y - tower.y, target.x - tower.x);
    if (tower.type === 'arc') fireChain(game, tower, stats, target);
    else fireProjectile(game, tower, stats, target);
    tower.cd = stats.interval;
  }
}

function updateShots(game, dt) {
  const alive = [];
  for (const shot of game.shots) {
    shot.life -= dt;
    if (shot.life <= 0) continue;
    const target = enemyById(game, shot.targetId);
    if (target !== null && !target.dead) {
      shot.tx = target.x;
      shot.ty = target.y;
    }
    const dx = shot.tx - shot.x;
    const dy = shot.ty - shot.y;
    const distance = Math.hypot(dx, dy);
    const step = shot.speed * dt;
    shot.trail.push({ x: shot.x, y: shot.y });
    if (shot.trail.length > 10) shot.trail.shift();
    if (distance <= step + 7) {
      if (target !== null && !target.dead) {
        damageEnemy(game, target, shot.damage);
        addFlash(game, shot.tx, shot.ty, shot.color, shot.kind === 'rail' ? 26 : 14);
        addSparkBurst(game, shot.tx, shot.ty, shot.color, shot.kind === 'rail' ? 12 : 6, shot.kind === 'rail' ? 190 : 130);
        if (shot.kind === 'rail') addRing(game, shot.tx, shot.ty, 2, 24, shot.color, 0.26);
        emit(game, 'impact');
      } else {
        addSparkBurst(game, shot.tx, shot.ty, shot.color, 3, 60);
      }
      continue;
    }
    const inv = 1 / Math.max(0.0001, distance);
    shot.x += dx * inv * step;
    shot.y += dy * inv * step;
    alive.push(shot);
  }
  game.shots = alive;
}

function cleanupEnemies(game) {
  if (game.enemies.length === 0) return;
  const alive = [];
  for (const enemy of game.enemies) {
    if (!enemy.dead) {
      alive.push(enemy);
      continue;
    }
    if (enemy.leaked || enemy.scored) continue;
    enemy.scored = true;
    const def = ENEMIES[enemy.type];
    game.kills += 1;
    game.waveKills += 1;
    game.credits += enemy.reward;
    game.creditsEarned += enemy.reward;
    const heavy = enemy.type === 'brute';
    addFlash(game, enemy.x, enemy.y, def.color, heavy ? 30 : 17);
    addDebris(game, enemy.x, enemy.y, def.color, heavy ? 14 : enemy.type === 'shield' ? 10 : 7, heavy ? 1.25 : 1);
    addRing(game, enemy.x, enemy.y, 3, heavy ? 34 : 26, def.color, 0.34);
    addSparkBurst(game, enemy.x, enemy.y, def.color, heavy ? 14 : 10, heavy ? 190 : 160);
    addFloat(game, enemy.x, enemy.y - 14, `+${enemy.reward}`, COLORS.green);
    emit(game, 'explosion');
  }
  game.enemies = alive;
}

function updateEffects(game, dt) {
  if (game.effects.length === 0) return;
  const alive = [];
  for (const effect of game.effects) {
    effect.life -= dt;
    if (effect.life <= 0) continue;
    if (effect.kind === 'spark') {
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
      effect.vy += effect.gravity * dt;
      effect.vx *= 0.97;
    } else if (effect.kind === 'debris') {
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
      effect.vy += effect.gravity * dt;
      effect.vx *= 0.985;
      effect.rot += effect.spin * dt;
    } else if (effect.kind === 'float') {
      effect.y -= 26 * dt;
    }
    alive.push(effect);
  }
  game.effects = alive;
}

function finishWave(game) {
  const definition = WAVES[game.wave - 1];
  game.credits += definition.bonus;
  game.creditsEarned += definition.bonus;
  game.waveSummary = {
    wave: game.wave,
    bonus: definition.bonus,
    kills: game.waveKills,
    leaks: game.waveLeaks,
    credits: game.credits,
  };
  if (game.wave >= TOTAL_WAVES) {
    game.phase = 'victory';
    game.selectedTower = null;
    game.waveQueue = [];
    addRing(game, CORE_X, CORE_Y, 10, 120, COLORS.green, 1.1);
    addFlash(game, CORE_X, CORE_Y, COLORS.green, 46);
    addSparkBurst(game, CORE_X, CORE_Y, COLORS.green, 24, 220);
    emit(game, 'victory');
  } else {
    game.phase = 'wavebreak';
    emit(game, 'waveClear');
    notify(game, `WAVE ${String(game.wave).padStart(2, '0')} CLEARED  +${definition.bonus}`);
  }
}

function checkWaveEnd(game) {
  if (game.phase !== 'playing') return;
  if (game.waveQueue.length > 0) return;
  if (game.enemies.length > 0) return;
  if (game.shots.length > 0) return;
  finishWave(game);
}

function destroyCore(game) {
  game.hp = 0;
  game.phase = 'over';
  game.selectedTower = null;
  game.waveQueue = [];
  game.overReason = `The core fell on wave ${game.wave} of ${TOTAL_WAVES}.`;
  addRing(game, CORE_X, CORE_Y, 12, 150, COLORS.red, 1.2);
  addRing(game, CORE_X, CORE_Y, 8, 90, COLORS.orange, 0.9);
  addFlash(game, CORE_X, CORE_Y, COLORS.orange, 52);
  addDebris(game, CORE_X, CORE_Y, COLORS.red, 18, 1.5);
  addDebris(game, CORE_X, CORE_Y, COLORS.orange, 10, 1.2);
  addSparkBurst(game, CORE_X, CORE_Y, COLORS.red, 30, 250);
  addSparkBurst(game, CORE_X, CORE_Y, COLORS.orange, 18, 180);
  emit(game, 'defeat');
}

/** Advance the whole simulation by one fixed step. */
export function updateWorld(game, dt) {
  game.time += dt;
  if (game.messageTimer > 0) {
    game.messageTimer -= dt;
    if (game.messageTimer <= 0) {
      game.messageTimer = 0;
      game.message = '';
    }
  }
  updateEffects(game, dt);
  if (game.phase === 'title' || game.phase === 'over' || game.phase === 'victory') return;
  if (game.phase === 'wavebreak') return;
  updateWave(game, dt);
  updateEnemies(game, dt);
  if (game.phase !== 'playing') return;
  updateTowers(game, dt);
  updateShots(game, dt);
  cleanupEnemies(game);
  if (game.phase === 'playing') checkWaveEnd(game);
}
