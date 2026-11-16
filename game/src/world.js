// The game world: state, waves, enemies, towers, projectiles and the step
// simulation. Rendering reads this; input writes to it; nothing else.

import {
  CORE, ENEMIES, GRID, SPAWN, START_CREDITS, STEP, TOWERS, UPGRADE, WAVES, wavePool,
} from './config.js';
import { makeRandom } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_WAVE_DONE = 1;
export const EVENT_OVER = 2;
export const EVENT_VICTORY = 4;

const TOTAL_WAVES = 12;

export class World {
  constructor(seed = 1) {
    this.reset(seed);
  }

  reset(seed = this.seed ?? 1) {
    this.seed = seed >>> 0;
    this.random = makeRandom(this.seed);
    this.time = 0;
    this.credits = START_CREDITS;
    this.coreHp = CORE.hp;
    this.wave = 0; // completed waves
    this.waveActive = false;
    this.waveTotal = TOTAL_WAVES;
    this.enemies = [];
    this.towers = new Map(); // "col,row" -> tower
    this.shots = [];
    this.zaps = []; // arc chain visuals, {points, life}
    this.floaters = []; // floating text, {x, y, text, life, color}
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnInterval = WAVES.startInterval;
    this.events = EVENT_NONE;
    this.kills = 0;
    this.leaks = 0;
    this.shake = 0;
    this.state = 'title'; // title | playing | between | over | victory
    this.overReason = '';
  }

  key(col, row) { return `${col},${row}`; }

  towerAt(col, row) { return this.towers.get(this.key(col, row)) || null; }

  canPlace(col, row) {
    if (col < 0 || row < 0 || col >= GRID.cols || row >= GRID.rows) return false;
    if (col === CORE.x && row === CORE.y) return false;
    return !this.towers.has(this.key(col, row));
  }

  placeTower(kind, col, row) {
    const spec = TOWERS[kind];
    if (!spec || !this.canPlace(col, row)) return false;
    if (this.credits < spec.cost) return false;
    this.credits -= spec.cost;
    this.towers.set(this.key(col, row), {
      kind, col, row, level: 1, cooldown: 0,
      x: col * GRID.cell + GRID.cell / 2,
      y: row * GRID.cell + GRID.cell / 2,
      invested: spec.cost,
      kills: 0,
    });
    return true;
  }

  upgradeCost(tower) {
    const spec = TOWERS[tower.kind];
    return Math.round(spec.cost * UPGRADE.costFactor * tower.level);
  }

  upgradeTower(tower) {
    if (!tower || tower.level >= UPGRADE.maxLevel) return false;
    const cost = this.upgradeCost(tower);
    if (this.credits < cost) return false;
    this.credits -= cost;
    tower.invested += cost;
    tower.level += 1;
    return true;
  }

  sellTower(tower) {
    if (!tower) return false;
    const refund = Math.floor(tower.invested * 0.7);
    this.credits += refund;
    this.towers.delete(this.key(tower.col, tower.row));
    return refund;
  }

  towerStats(tower) {
    const spec = TOWERS[tower.kind];
    const dmg = spec.damage * Math.pow(UPGRADE.damageMult, tower.level - 1);
    const range = spec.range * Math.pow(UPGRADE.rangeMult, tower.level - 1);
    return { spec, damage: dmg, range, cooldown: spec.cooldown };
  }

  /** Begin the next wave: fill the spawn queue from the wave's pool. */
  startWave() {
    if (this.waveActive || this.state === 'over' || this.state === 'victory') return false;
    this.wave += 1;
    const n = Math.round(WAVES.baseCount + WAVES.countGrowth * (this.wave - 1));
    const pool = wavePool(this.wave);
    this.spawnQueue = [];
    for (let i = 0; i < n; i += 1) {
      // Later waves lean on the heavier kinds: pick from the pool's tail more often.
      const pick = pool[Math.floor(this.random() * this.random() * pool.length)];
      this.spawnQueue.push(pick);
    }
    // A wave ends with one extra brute every 4th wave as a mini-boss.
    if (this.wave % 4 === 0) this.spawnQueue.push('brute');
    this.spawnInterval = WAVES.startInterval * Math.pow(WAVES.intervalShrink, this.wave - 1);
    this.spawnTimer = 0.4;
    this.waveActive = true;
    this.state = 'playing';
    return true;
  }

  spawnEnemy(kind) {
    const spec = ENEMIES[kind];
    const hp = Math.round(spec.hp * Math.pow(WAVES.hpGrowth, this.wave - 1));
    this.enemies.push({
      kind, spec,
      hp, maxHp: hp,
      speed: spec.speed * Math.pow(WAVES.speedGrowth, this.wave - 1),
      x: (SPAWN.x + 1.2 + this.random() * 0.8) * GRID.cell,
      y: (SPAWN.y + 0.5 + (this.random() - 0.5) * 0.5) * GRID.cell,
      slow: 0,
      hitFlash: 0,
    });
  }

  damageEnemy(enemy, amount, tower) {
    const armor = enemy.spec.armor || 0;
    const dealt = Math.max(1, amount - armor);
    enemy.hp -= dealt;
    enemy.hitFlash = 0.12;
    if (enemy.hp <= 0) {
      const bounty = Math.round(enemy.spec.bounty * Math.pow(WAVES.bountyGrowth, this.wave - 1));
      this.credits += bounty;
      this.kills += 1;
      if (tower) tower.kills += 1;
      this.floaters.push({ x: enemy.x, y: enemy.y - 14, text: `+${bounty}`, life: 0.8, color: '#ffd94f' });
      enemy.dead = true;
    }
  }

  /** Advance the simulation by dt (fixed STEP in play, any dt for scenes). */
  step(dt, autopilotDir = null) {
    this.events = EVENT_NONE;
    if (this.state !== 'playing') return this.events;
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);

    // Spawning
    if (this.waveActive && this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy(this.spawnQueue.shift());
        this.spawnTimer = this.spawnInterval;
      }
    }

    // Enemies march left toward the core
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.slow = Math.max(0, e.slow - dt);
      const v = e.speed * (e.slow > 0 ? 0.55 : 1) * GRID.cell;
      e.x -= v * dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      const coreX = (CORE.x + 0.5) * GRID.cell;
      if (e.x <= coreX + 18) {
        e.dead = true;
        this.coreHp -= 1;
        this.leaks += 1;
        this.shake = 1;
        this.floaters.push({ x: e.x, y: e.y - 20, text: '-1 ♥', life: 0.9, color: '#ff5d5d' });
        if (this.coreHp <= 0) {
          this.coreHp = 0;
          this.state = 'over';
          this.overReason = `The core fell on wave ${this.wave}`;
          this.events |= EVENT_OVER;
          return this.events;
        }
      }
    }

    // Towers acquire and fire
    for (const tower of this.towers.values()) {
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      const { spec, damage, range, cooldown } = this.towerStats(tower);
      const rangePx = range * GRID.cell;
      const targets = this.enemies.filter((e) => !e.dead
        && (e.x - tower.x) ** 2 + (e.y - tower.y) ** 2 <= rangePx ** 2);
      if (targets.length === 0) continue;
      targets.sort((a, b) => a.x - b.x); // closest to the core first
      const primary = targets[0];
      tower.cooldown = cooldown;
      this.fire(tower, spec, damage, primary, targets);
    }

    // Projectiles
    for (const s of this.shots) {
      s.life -= dt;
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const dist = Math.hypot(dx, dy);
      const travel = s.speed * dt;
      if (dist <= travel || s.life <= 0) {
        s.done = true;
        if (s.target && !s.target.dead) this.damageEnemy(s.target, s.damage, s.tower);
      } else {
        s.x += (dx / dist) * travel;
        s.y += (dy / dist) * travel;
        if (s.target && !s.target.dead) { s.tx = s.target.x; s.ty = s.target.y; }
      }
    }
    this.shots = this.shots.filter((s) => !s.done);

    for (const z of this.zaps) z.life -= dt;
    this.zaps = this.zaps.filter((z) => z.life > 0);

    for (const f of this.floaters) { f.life -= dt; f.y -= 26 * dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);

    // Remove dead enemies
    this.enemies = this.enemies.filter((e) => !e.dead);

    // Wave completion
    if (this.waveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      this.events |= EVENT_WAVE_DONE;
      const bonus = 12 + this.wave * 6;
      this.credits += bonus;
      this.floaters.push({
        x: GRID.width / 2, y: GRID.height / 2 - 60,
        text: `Wave ${this.wave} cleared  +${bonus}`, life: 2.2, color: '#37e6a2',
      });
      if (this.wave >= this.waveTotal) {
        this.state = 'victory';
        this.events |= EVENT_VICTORY;
      } else {
        this.state = 'between';
      }
    }
    return this.events;
  }

  fire(tower, spec, damage, primary, targets) {
    if (spec.chain) {
      // Arc: instant chain lightning across up to `chain` targets.
      const chained = targets.slice(0, spec.chain);
      const points = [{ x: tower.x, y: tower.y }];
      let dmg = damage;
      for (const t of chained) {
        points.push({ x: t.x, y: t.y });
        this.damageEnemy(t, dmg, tower);
        dmg *= 0.7;
      }
      this.zaps.push({ points, life: 0.14 });
    } else {
      this.shots.push({
        x: tower.x, y: tower.y, tx: primary.x, ty: primary.y,
        target: primary, damage, tower, life: 1.2,
        speed: spec.name === 'Rail' ? 900 : 520,
        kind: tower.kind, color: spec.color,
      });
    }
  }
}
