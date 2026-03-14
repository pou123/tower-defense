// ==============================================================
// WEAPON.JS — All tower weapons and their projectiles
// ==============================================================

// ─── Base Projectile ──────────────────────────────────────────
class Projectile {
  constructor(x, y, angle, speed, damage, range, color) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage  = damage;
    this.maxRange = range;
    this.traveled = 0;
    this.dead = false;
    this.color = color;
    this.radius = 4;
    this.sourceAngle = angle;
    // Upgrades
    this.pierce         = false;
    this.hitEnemies     = new Set();
    this.hasPointOfImpact = false;
    this.incendiary     = false;
    this.cryo           = false;
    this.afterburn      = false;
    this.armorPiercing  = false;
    this.ricochet       = false;
    this.ricocheted     = false;
    // For ricochet wall bounce
    this.arenaW = 0; this.arenaH = 0;
  }

  update(dt) {
    const step = Utils.dist(0, 0, this.vx, this.vy) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.traveled += step;

    // Arena bounds ricochet
    if (this.ricochet && !this.ricocheted) {
      if (this.x < 0 || this.x > this.arenaW) { this.vx *= -1; this.ricocheted = true; }
      if (this.y < 0 || this.y > this.arenaH) { this.vy *= -1; this.ricocheted = true; }
    }

    if (this.traveled >= this.maxRange) this.dead = true;
  }

  getActualDamage() {
    let dmg = this.damage;
    if (this.hasPointOfImpact) {
      const t = Utils.clamp(this.traveled / this.maxRange, 0, 1);
      dmg *= 1.0 + t; // 1x at 0, 2x at max
    }
    return dmg;
  }

  onHitEnemy(enemy) {
    if (this.hitEnemies.has(enemy)) return false;
    this.hitEnemies.add(enemy);
    const dmg = this.getActualDamage();
    if (this.armorPiercing) {
      enemy.hp -= Math.max(1, dmg * 0.75 + enemy.hp * 0.25);
    } else {
      enemy.takeDamage(dmg);
    }
    if (this.incendiary) enemy.applyBurn(5, 3);
    if (this.cryo)       enemy.applySlow(0.4, 1.5);
    if (!this.pierce) this.dead = true;
    return true;
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

// ─── Mortar Shell ─────────────────────────────────────────────
class MortarShell {
  constructor(sx, sy, tx, ty, damage, explosionRadius, color) {
    this.x = sx; this.y = sy;
    this.sx = sx; this.sy = sy;
    this.tx = tx; this.ty = ty;
    this.damage = damage;
    this.explosionRadius = explosionRadius;
    this.color = color;
    this.dead = false;
    this.progress = 0;
    this.speed = 1.2; // progress per second
    this.radius = 6;
    this.cryo = false; this.armorPiercing = false; this.chainReaction = false;
    // Afterburn trail
    this.trail = [];
  }

  update(dt) {
    this.progress += this.speed * dt;
    this.trail.push({ x: this.x, y: this.y, life: 0.4 });
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter(t => t.life > 0);
    if (this.progress >= 1) {
      this.x = this.tx; this.y = this.ty;
      this.dead = true;
      this._explode();
      return;
    }
    const t = this.progress;
    this.x = Utils.lerp(this.sx, this.tx, t);
    this.y = Utils.lerp(this.sy, this.ty, t) - Math.sin(t * Math.PI) * 80;
  }

  _explode() {
    for (const e of Game.enemies) {
      if (!e.dead && Utils.dist(this.x, this.y, e.x, e.y) <= this.explosionRadius + e.radius) {
        const dmg = this.armorPiercing
          ? Math.max(1, this.damage * 0.75 + e.hp * 0.25)
          : this.damage;
        e.takeDamage(dmg);
        if (this.cryo) e.applySlow(0.4, 1.5);
      }
    }
    // Chain reaction
    if (this.chainReaction && Math.random() < 0.3) {
      const mini = new MortarShell(this.x, this.y, this.x, this.y, this.damage * 0.4, this.explosionRadius * 0.5, this.color);
      mini.progress = 0.99;
      Game.projectiles.push(mini);
    }
    Particles.explosion(this.x, this.y, this.color, this.explosionRadius);
  }

  draw(ctx) {
    for (const t of this.trail) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,160,50,${t.life / 0.4 * 0.5})`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    // Explosion radius preview (faint)
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.explosionRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,160,50,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ─── Missile ──────────────────────────────────────────────────
class Missile {
  constructor(x, y, target, damage, explosionRadius, speed, turnSpeed, color) {
    this.x = x; this.y = y;
    this.target = target;
    this.damage = damage;
    this.explosionRadius = explosionRadius;
    this.speed = speed;
    this.turnSpeed = turnSpeed;
    this.color = color;
    this.angle = 0;
    this.dead = false;
    this.radius = 5;
    this.life = 6; // max seconds
    this.trail = [];
    this.cryo = false; this.armorPiercing = false; this.seeking = 0;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    this.trail.push({ x: this.x, y: this.y, life: 0.3 });
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter(t => t.life > 0);

    // Find live target or closest enemy
    let tgt = this.target;
    if (!tgt || tgt.dead) {
      tgt = null;
      let best = Infinity;
      for (const e of Game.enemies) {
        if (!e.dead) {
          const d = Utils.dist(this.x, this.y, e.x, e.y);
          if (d < best) { best = d; tgt = e; }
        }
      }
    }

    if (tgt && !tgt.dead) {
      const desired = Utils.angle(this.x, this.y, tgt.x, tgt.y);
      const ts = (this.turnSpeed + this.seeking * 1.5) * dt;
      this.angle = Utils.rotateToward(this.angle, desired, ts);
    }

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    // Hit check
    for (const e of Game.enemies) {
      if (!e.dead && Utils.circleCollide(this.x, this.y, this.radius, e.x, e.y, e.radius)) {
        this._explode();
        this.dead = true;
        return;
      }
    }
  }

  _explode() {
    for (const e of Game.enemies) {
      if (!e.dead && Utils.dist(this.x, this.y, e.x, e.y) <= this.explosionRadius + e.radius) {
        const dmg = this.armorPiercing
          ? Math.max(1, this.damage * 0.75 + e.hp * 0.25)
          : this.damage;
        e.takeDamage(dmg);
        if (this.cryo) e.applySlow(0.4, 1.5);
      }
    }
    Particles.explosion(this.x, this.y, this.color, this.explosionRadius);
  }

  draw(ctx) {
    for (const t of this.trail) {
      const a = t.life / 0.3;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,120,0,${a * 0.6})`;
      ctx.fill();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-6, 5); ctx.lineTo(-4, 0); ctx.lineTo(-6, -5);
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
  }
}

// ─── Flame Particle ───────────────────────────────────────────
class FlameParticle {
  constructor(x, y, angle, speed, damage, range, burnDmg, burnDur) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.burnDmg = burnDmg;
    this.burnDur = burnDur;
    this.maxRange = range;
    this.traveled = 0;
    this.dead = false;
    this.radius = 5;
    this.hitEnemies = new Set();
    this.life = range / speed;
    this.maxLife = this.life;
    this.armorPiercing = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.traveled += Utils.dist(0, 0, this.vx, this.vy) * dt;
    if (this.traveled >= this.maxRange) this.dead = true;

    for (const e of Game.enemies) {
      if (!e.dead && !this.hitEnemies.has(e.id) &&
          Utils.circleCollide(this.x, this.y, this.radius, e.x, e.y, e.radius)) {
        this.hitEnemies.add(e.id);
        e.takeDamage(this.damage);
        e.applyBurn(this.burnDmg, this.burnDur);
      }
    }
  }

  draw(ctx) {
    const t = this.life / this.maxLife;
    const r = Utils.lerp(2, 8, t);
    const alpha = t * 0.9;
    const col = t > 0.5 ? `rgba(255,200,50,${alpha})` : `rgba(255,80,10,${alpha})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  }
}

// ─── Tesla Arc (visual only, damage is immediate) ────────────
class TeslaArc {
  constructor(points, color) {
    this.points = points;
    this.color = color;
    this.life = 0.18;
    this.maxLife = 0.18;
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    if (this.points.length < 2) return;
    const alpha = (this.life / this.maxLife);
    ctx.save();
    ctx.strokeStyle = `rgba(180,100,255,${alpha})`;
    ctx.lineWidth = 2 + alpha * 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#bf5fff';
    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      const jitter = (1 - alpha) * 12;
      const mx = this.points[i].x + Utils.randFloat(-jitter, jitter);
      const my = this.points[i].y + Utils.randFloat(-jitter, jitter);
      ctx.lineTo(mx, my);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// ─── Particle System (simple) ─────────────────────────────────
const Particles = {
  list: [],

  pulseRing(x, y, radius) {
    this.list.push({
      x, y, r: 0, vx: 0, vy: 0,
      life: 0.45, maxLife: 0.45,
      color: '#ffc832', dead: false,
      _ring: true, _ringR: 0, _ringMax: radius
    });
  },

  explosion(x, y, color, radius) {
    const count = Math.floor(radius * 0.6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Utils.randFloat(30, radius * 2.5);
      this.list.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Utils.randFloat(0.3, 0.7),
        maxLife: 0.7,
        r: Utils.randFloat(2, 5),
        color,
        dead: false
      });
    }
  },

  update(dt) {
    for (const p of this.list) {
      if (p._ring) {
        p._ringR = (1 - p.life / p.maxLife) * p._ringMax;
        p.life -= dt;
        if (p.life <= 0) p.dead = true;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) p.dead = true;
    }
    this.list = this.list.filter(p => !p.dead);
  },

  draw(ctx) {
    for (const p of this.list) {
      const alpha = p.life / p.maxLife;
      if (p._ring) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p._ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,200,50,${alpha * 0.7})`;
        ctx.lineWidth = 3 + alpha * 4;
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(alpha * 200).toString(16).padStart(2,'0');
      ctx.fill();
    }
  }
};

// ══════════════════════════════════════════════════════════════
// BASE WEAPON CLASS
// ══════════════════════════════════════════════════════════════
class Weapon {
  constructor(type, config) {
    this.type     = type;
    this.config   = config;
    this.fireCooldown = 0;
    this.active   = true;
    // Per-slot upgrades: { upgradeId: level }
    this.upgrades = {};
    this.slotIndex = 0;
  }

  hasUpgrade(id) { return (this.upgrades[id] || 0) > 0; }
  upgradeLevel(id) { return this.upgrades[id] || 0; }

  addUpgrade(id) {
    this.upgrades[id] = (this.upgrades[id] || 0) + 1;
  }

  update(dt, tower, enemies) {
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
  }

  findTarget(tower, enemies, range) {
    let nearest = null, bestDist = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Utils.dist(tower.x, tower.y, e.x, e.y);
      if (d <= range + e.radius && d < bestDist) {
        bestDist = d; nearest = e;
      }
    }
    return nearest;
  }

  findFurthestInRange(tower, enemies, range) {
    let furthest = null, bestDist = 0;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Utils.dist(tower.x, tower.y, e.x, e.y);
      if (d <= range + e.radius && d > bestDist) {
        bestDist = d; furthest = e;
      }
    }
    return furthest;
  }

  // Build projectile flags from this weapon's upgrades + global mods
  _applyProjUpgrades(proj, globalDmgMult) {
    proj.damage *= globalDmgMult;
    if (this.hasUpgrade('point_of_impact'))  proj.hasPointOfImpact = true;
    if (this.hasUpgrade('incendiary_rounds')) proj.incendiary = true;
    if (this.hasUpgrade('cryo_rounds'))       proj.cryo = true;
    if (this.hasUpgrade('afterburn'))         proj.afterburn = true;
    if (this.hasUpgrade('armor_piercing'))    proj.armorPiercing = true;
    if (this.hasUpgrade('ricochet'))          { proj.ricochet = true; proj.arenaW = Game.arenaW; proj.arenaH = Game.arenaH; }
    return proj;
  }

  _effectiveFireRate()  {
    const staticBonus = (Game.stats.staticTowerActive ? CONFIG.STATIC_TOWER_FIRERATE_BONUS : 0);
    return this.config.fireRate * (Game.stats.overclock ? 1.25 : 1) * (1 + staticBonus);
  }
  _effectiveDamage()    {
    let mult = Game.stats.towerDmgMult;
    // Home Soil: bonus when player is inside tower radius
    if (Game.stats.homeSoilBonus > 0 && Game.player && Game.player.isInTowerRadius()) {
      mult += Game.stats.homeSoilBonus;
    }
    // Static Tower active buff
    if (Game.stats.staticTowerActive) {
      mult += CONFIG.STATIC_TOWER_DMG_BONUS;
    }
    return this.config.damage * mult;
  }
  _effectiveRange()     { return this.config.range     * Game.stats.towerRangeMult; }
  _overchargeBonus()    {
    if (!Game.stats.hasOvercharge) return 1;
    const full = Game.tower.energy >= Game.stats.towerEnergyMax;
    return full ? 1 + 0.2 * Game.stats.overchargeLevels : 1;
  }
}

// ══════════════════════════════════════════════════════════════
// GUN WEAPON
// ══════════════════════════════════════════════════════════════
class GunWeapon extends Weapon {
  constructor() {
    super('gun', {
      fireRate:    CONFIG.GUN_FIRE_RATE,
      damage:      CONFIG.GUN_DAMAGE,
      range:       CONFIG.GUN_BASE_RANGE,
      bulletSpeed: CONFIG.GUN_BULLET_SPEED
    });
    this.burstMode   = false;
    this.burstCount  = 0;
    this.burstTimer  = 0;
  }

  update(dt, tower, enemies) {
    super.update(dt, tower, enemies);

    // Drum magazine burst mode
    if (this.hasUpgrade('drum_magazine') && !this.burstMode) {
      if (this.fireCooldown <= 0) {
        const tgt = this.findTarget(tower, enemies, this._effectiveRange());
        if (tgt) {
          this.burstMode = true;
          this.burstCount = 5;
          this.burstTimer = 0;
        }
      }
      return;
    }

    if (this.burstMode) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0 && this.burstCount > 0) {
        const tgt = this.findTarget(tower, enemies, this._effectiveRange());
        if (tgt) this._fireAt(tower, tgt);
        this.burstCount--;
        this.burstTimer = 0.08;
        if (this.burstCount <= 0) {
          this.burstMode = false;
          this.fireCooldown = (1 / this._effectiveFireRate()) * 5;
        }
      }
      return;
    }

    if (this.fireCooldown <= 0) {
      const tgt = this.findTarget(tower, enemies, this._effectiveRange());
      if (tgt) {
        this._fireAt(tower, tgt);
        this.fireCooldown = 1 / this._effectiveFireRate();
      }
    }
  }

  _fireAt(tower, target) {
    const angle = Utils.angle(tower.x, tower.y, target.x, target.y);
    const dmg   = this._effectiveDamage() * this._overchargeBonus();
    const proj  = new Projectile(tower.x, tower.y, angle,
      this.config.bulletSpeed, dmg, this._effectiveRange(), '#ffe566');
    this._applyProjUpgrades(proj, 1);
    proj.radius = 4;
    Game.projectiles.push(proj);
  }
}

// ══════════════════════════════════════════════════════════════
// SHOTGUN WEAPON
// ══════════════════════════════════════════════════════════════
class ShotgunWeapon extends Weapon {
  constructor() {
    super('shotgun', {
      fireRate:    CONFIG.SHOTGUN_FIRE_RATE,
      damage:      CONFIG.SHOTGUN_DAMAGE,
      range:       CONFIG.SHOTGUN_RANGE,
      bulletSpeed: CONFIG.SHOTGUN_BULLET_SPEED,
      pellets:     CONFIG.SHOTGUN_PELLETS,
      spread:      CONFIG.SHOTGUN_SPREAD
    });
  }

  update(dt, tower, enemies) {
    super.update(dt, tower, enemies);
    if (this.fireCooldown <= 0) {
      const tgt = this.findTarget(tower, enemies, this._effectiveRange());
      if (tgt) {
        this._fireAt(tower, tgt);
        this.fireCooldown = 1 / this._effectiveFireRate();
      }
    }
  }

  _fireAt(tower, target) {
    const baseAngle = Utils.angle(tower.x, tower.y, target.x, target.y);
    const spreadLvl = this.upgradeLevel('spread');
    const pellets   = this.config.pellets + spreadLvl * 2;
    const spread    = this.config.spread  + spreadLvl * 0.12;
    const dmgMult   = 1 + spreadLvl * 0.15;
    const dmg = this._effectiveDamage() * dmgMult * this._overchargeBonus();
    const knockback = this.upgradeLevel('overpressure') * 80;

    for (let i = 0; i < pellets; i++) {
      const angle = baseAngle + Utils.randFloat(-spread, spread);
      const proj  = new Projectile(tower.x, tower.y, angle,
        this.config.bulletSpeed, dmg, this._effectiveRange(), '#ff9944');
      this._applyProjUpgrades(proj, 1);
      proj.radius = 5;
      proj._knockback = knockback;
      Game.projectiles.push(proj);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// RIFLE WEAPON
// ══════════════════════════════════════════════════════════════
class RifleWeapon extends Weapon {
  constructor() {
    super('rifle', {
      fireRate:    CONFIG.RIFLE_FIRE_RATE,
      damage:      CONFIG.RIFLE_DAMAGE,
      range:       CONFIG.RIFLE_RANGE,
      bulletSpeed: CONFIG.RIFLE_BULLET_SPEED
    });
  }

  update(dt, tower, enemies) {
    super.update(dt, tower, enemies);
    if (this.fireCooldown <= 0) {
      const tgt = this.findTarget(tower, enemies, this._effectiveRange());
      if (tgt) {
        this._fireAt(tower, tgt);
        this.fireCooldown = 1 / this._effectiveFireRate();
      }
    }
  }

  _fireAt(tower, target) {
    const angle = Utils.angle(tower.x, tower.y, target.x, target.y);
    const dmg   = this._effectiveDamage() * this._overchargeBonus();
    const proj  = new Projectile(tower.x, tower.y, angle,
      this.config.bulletSpeed, dmg, this._effectiveRange(), '#66ffaa');
    this._applyProjUpgrades(proj, 1);
    proj.radius = 5;

    if (this.hasUpgrade('explosive_tip')) {
      proj._explosiveTip = true;
      proj._explosionRadius = 40;
    }
    Game.projectiles.push(proj);
  }
}

// ══════════════════════════════════════════════════════════════
// SNIPER WEAPON
// ══════════════════════════════════════════════════════════════
class SniperWeapon extends Weapon {
  constructor() {
    super('sniper', {
      fireRate:    CONFIG.SNIPER_FIRE_RATE,
      damage:      CONFIG.SNIPER_DAMAGE,
      range:       CONFIG.SNIPER_RANGE,
      bulletSpeed: CONFIG.SNIPER_BULLET_SPEED
    });
  }

  update(dt, tower, enemies) {
    super.update(dt, tower, enemies);
    if (this.fireCooldown <= 0) {
      const tgt = this.findFurthestInRange(tower, enemies, this._effectiveRange());
      if (tgt) {
        this._fireAt(tower, tgt);
        this.fireCooldown = 1 / this._effectiveFireRate();
      }
    }
  }

  _fireAt(tower, target) {
    const angle = Utils.angle(tower.x, tower.y, target.x, target.y);
    const dmg   = this._effectiveDamage() * this._overchargeBonus();
    const proj  = new Projectile(tower.x, tower.y, angle,
      this.config.bulletSpeed, dmg, this._effectiveRange(), '#ffffff');
    this._applyProjUpgrades(proj, 1);
    proj.pierce = true;
    proj.radius = 3;
    Game.projectiles.push(proj);
  }
}

// ══════════════════════════════════════════════════════════════
// MORTAR WEAPON
// ══════════════════════════════════════════════════════════════
class MortarWeapon extends Weapon {
  constructor() {
    super('mortar', {
      fireRate:        CONFIG.MORTAR_FIRE_RATE,
      damage:          CONFIG.MORTAR_DAMAGE,
      range:           CONFIG.MORTAR_RANGE,
      explosionRadius: CONFIG.MORTAR_EXPLOSION_RADIUS
    });
  }

  update(dt, tower, enemies) {
    super.update(dt, tower, enemies);
    if (this.fireCooldown <= 0) {
      const target = this._findClusterCenter(enemies, this._effectiveRange());
      if (target) {
        this._fireAt(tower, target);
        this.fireCooldown = 1 / this._effectiveFireRate();
      }
    }
  }

  _findClusterCenter(enemies, range) {
    const inRange = enemies.filter(e => !e.dead &&
      Utils.dist(Game.tower.x, Game.tower.y, e.x, e.y) <= range + e.radius);
    if (inRange.length === 0) return null;
    // Target the enemy with most neighbors
    let best = null, bestCount = 0;
    for (const e of inRange) {
      const count = inRange.filter(o => o !== e && Utils.dist(e.x, e.y, o.x, o.y) < 80).length;
      if (count >= bestCount) { bestCount = count; best = e; }
    }
    return best;
  }

  _fireAt(tower, target) {
    const dmg   = this._effectiveDamage() * this._overchargeBonus();
    const shell = new MortarShell(tower.x, tower.y, target.x, target.y,
      dmg, this.config.explosionRadius, '#ffa040');
    if (this.hasUpgrade('cryo_rounds'))    shell.cryo = true;
    if (this.hasUpgrade('armor_piercing')) shell.armorPiercing = true;
    if (this.hasUpgrade('chain_reaction')) shell.chainReaction = true;
    Game.projectiles.push(shell);
  }
}

// ══════════════════════════════════════════════════════════════
// MISSILE LAUNCHER WEAPON
// ══════════════════════════════════════════════════════════════
class MissileLauncherWeapon extends Weapon {
  constructor() {
    super('missile', {
      fireRate:        CONFIG.MISSILE_FIRE_RATE,
      damage:          CONFIG.MISSILE_DAMAGE,
      range:           CONFIG.MISSILE_RANGE,
      explosionRadius: CONFIG.MISSILE_EXPLOSION_RADIUS,
      speed:           CONFIG.MISSILE_SPEED,
      turnSpeed:       CONFIG.MISSILE_TURN_SPEED
    });
  }

  update(dt, tower, enemies) {
    super.update(dt, tower, enemies);
    if (this.fireCooldown <= 0) {
      const tgt = this.findTarget(tower, enemies, this._effectiveRange());
      if (tgt) {
        this._fireAt(tower, tgt);
        this.fireCooldown = 1 / this._effectiveFireRate();
      }
    }
  }

  _fireAt(tower, target) {
    const dmg    = this._effectiveDamage() * this._overchargeBonus();
    const offset = Utils.randFloat(0, Math.PI * 2);
    const missile = new Missile(
      tower.x + Math.cos(offset) * 20,
      tower.y + Math.sin(offset) * 20,
      target, dmg, this.config.explosionRadius,
      this.config.speed, this.config.turnSpeed, '#ff6040'
    );
    missile.angle = Utils.angle(tower.x, tower.y, target.x, target.y);
    missile.seeking = this.upgradeLevel('seeking');
    if (this.hasUpgrade('cryo_rounds'))    missile.cryo = true;
    if (this.hasUpgrade('armor_piercing')) missile.armorPiercing = true;
    Game.projectiles.push(missile);
  }
}

// ══════════════════════════════════════════════════════════════
// FLAMETHROWER WEAPON
// ══════════════════════════════════════════════════════════════
class FlamethrowerWeapon extends Weapon {
  constructor() {
    super('flamethrower', {
      fireRate:     CONFIG.FLAMETHROWER_FIRE_RATE,
      damage:       CONFIG.FLAMETHROWER_DAMAGE,
      range:        CONFIG.FLAMETHROWER_RANGE,
      cone:         CONFIG.FLAMETHROWER_CONE,
      burnDamage:   CONFIG.FLAMETHROWER_BURN_DAMAGE,
      burnDuration: CONFIG.FLAMETHROWER_BURN_DURATION
    });
  }

  update(dt, tower, enemies) {
    super.update(dt, tower, enemies);
    if (this.fireCooldown <= 0) {
      const tgt = this.findTarget(tower, enemies, this._effectiveRange());
      if (tgt) {
        this._fireParticles(tower, tgt);
        this.fireCooldown = 1 / this._effectiveFireRate();
      }
    }
  }

  _fireParticles(tower, target) {
    const baseAngle = Utils.angle(tower.x, tower.y, target.x, target.y);
    const lvl    = this.upgradeLevel('fuel_pressure');
    const range  = this._effectiveRange() * (1 + lvl * 0.2);
    const cone   = this.config.cone * (1 + lvl * 0.2);
    const count  = 3;

    for (let i = 0; i < count; i++) {
      const angle = baseAngle + Utils.randFloat(-cone, cone);
      const speed = Utils.randFloat(range * 1.5, range * 2.5);
      const p = new FlameParticle(tower.x, tower.y, angle, speed,
        this.config.damage * Game.stats.towerDmgMult * this._overchargeBonus(),
        range, this.config.burnDamage, this.config.burnDuration);
      if (this.hasUpgrade('armor_piercing')) p.armorPiercing = true;
      Game.projectiles.push(p);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// TESLA COIL WEAPON
// ══════════════════════════════════════════════════════════════
class TeslaCoilWeapon extends Weapon {
  constructor() {
    super('tesla', {
      fireRate:   CONFIG.TESLA_FIRE_RATE,
      damage:     CONFIG.TESLA_DAMAGE,
      range:      CONFIG.TESLA_RANGE,
      chainRange: CONFIG.TESLA_CHAIN_RANGE,
      chains:     CONFIG.TESLA_CHAINS
    });
    this.chargeTimer = 0;
    this.charging    = false;
  }

  update(dt, tower, enemies) {
    super.update(dt, tower, enemies);
    if (this.fireCooldown <= 0) {
      const tgt = this.findTarget(tower, enemies, this._effectiveRange());
      if (tgt) {
        this._fire(tower, enemies);
        this.fireCooldown = 1 / this._effectiveFireRate();
      }
    }
  }

  _fire(tower, enemies) {
    const dmg = this._effectiveDamage() * this._overchargeBonus();
    const armorPiercing = this.hasUpgrade('armor_piercing');
    const cryo = this.hasUpgrade('cryo_rounds');

    const inRange = enemies.filter(e => !e.dead &&
      Utils.dist(tower.x, tower.y, e.x, e.y) <= this._effectiveRange() + e.radius);
    if (inRange.length === 0) return;

    // Sort by distance
    inRange.sort((a, b) =>
      Utils.dist(tower.x, tower.y, a.x, a.y) - Utils.dist(tower.x, tower.y, b.x, b.y));

    const chain = [{ x: tower.x, y: tower.y }];
    const hit = new Set();
    let last = { x: tower.x, y: tower.y };
    let chainCount = this.config.chains;

    for (const e of inRange) {
      if (chainCount <= 0) break;
      if (hit.has(e)) continue;
      const d = Utils.dist(last.x, last.y, e.x, e.y);
      const isFirst = chain.length === 1;
      if (isFirst || d <= this.config.chainRange) {
        const doDmg = isFirst ? dmg : dmg * 0.65;
        if (armorPiercing) {
          e.hp -= Math.max(1, doDmg * 0.75 + e.hp * 0.25);
          if (e.hp <= 0) e.die();
        } else {
          e.takeDamage(doDmg);
        }
        if (cryo) e.applySlow(0.4, 1.5);
        hit.add(e);
        chain.push({ x: e.x, y: e.y });
        last = { x: e.x, y: e.y };
        chainCount--;
      }
    }

    if (chain.length > 1) {
      Game.projectiles.push(new TeslaArc(chain, '#bf5fff'));
    }
  }
}

// ══════════════════════════════════════════════════════════════
// LASER WEAPON
// ══════════════════════════════════════════════════════════════
class LaserWeapon extends Weapon {
  constructor() {
    super('laser', {
      damage:        CONFIG.LASER_DAMAGE_PER_SECOND,
      range:         CONFIG.LASER_RANGE,
      rotationSpeed: CONFIG.LASER_ROTATION_SPEED,
      width:         CONFIG.LASER_WIDTH,
      fireRate:      1  // continuous
    });
    this.angle = 0;
    this.active = true;
  }

  update(dt, tower, enemies) {
    const range = this._effectiveRange();
    const hasEnemy = enemies.some(e => !e.dead &&
      Utils.dist(tower.x, tower.y, e.x, e.y) <= range + e.radius);

    if (!hasEnemy) return;

    const widthBonus = this.upgradeLevel('wide_beam') * 4;
    const halfW = (this.config.width + widthBonus) / 2;
    const rotSpeed = this.config.rotationSpeed;
    this.angle += rotSpeed * dt;

    const ex = tower.x + Math.cos(this.angle) * range;
    const ey = tower.y + Math.sin(this.angle) * range;

    const dmg = this.config.damage * dt * Game.stats.towerDmgMult * this._overchargeBonus();
    const armorPiercing = this.hasUpgrade('armor_piercing');
    const cryo = this.hasUpgrade('cryo_rounds');

    for (const e of enemies) {
      if (e.dead) continue;
      const distToBeam = Utils.pointToSegmentDist(e.x, e.y, tower.x, tower.y, ex, ey);
      if (distToBeam < halfW + e.radius) {
        if (armorPiercing) {
          e.hp -= Math.max(0.01, dmg * 0.75 + e.hp * 0.25 * dt);
          if (e.hp <= 0) e.die();
        } else {
          e.takeDamage(dmg);
        }
        if (cryo) e.applySlow(0.4, 0.1); // continuous reapply
      }
    }
  }

  draw(ctx, tower) {
    const range = this._effectiveRange();
    const hasEnemy = Game.enemies.some(e => !e.dead &&
      Utils.dist(tower.x, tower.y, e.x, e.y) <= range + e.radius);
    if (!hasEnemy) return;

    const widthBonus = this.upgradeLevel('wide_beam') * 4;
    const lineW = this.config.width + widthBonus;
    const ex = tower.x + Math.cos(this.angle) * range;
    const ey = tower.y + Math.sin(this.angle) * range;

    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#00ffff';
    ctx.beginPath();
    ctx.moveTo(tower.x, tower.y);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = lineW;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════════
// PULSE EMITTER WEAPON
// ══════════════════════════════════════════════════════════════
class PulseEmitterWeapon extends Weapon {
  constructor() {
    super('pulse', {
      fireRate: CONFIG.PULSE_FIRE_RATE,
      damage:   CONFIG.PULSE_DAMAGE,
      range:    CONFIG.PULSE_RADIUS,
      fireRate: CONFIG.PULSE_FIRE_RATE
    });
    this.pulseAnim = 0; // for visual ring
  }

  update(dt, tower, enemies) {
    super.update(dt, tower, enemies);
    if (this.pulseAnim > 0) this.pulseAnim -= dt * 3;

    if (this.fireCooldown <= 0) {
      const range = this._effectiveRange();
      const inRange = enemies.filter(e =>
        !e.dead && Utils.dist(tower.x, tower.y, e.x, e.y) <= range + e.radius
      );
      if (inRange.length > 0) {
        this._fire(tower, inRange, range);
        this.fireCooldown = 1 / this._effectiveFireRate();
        this.pulseAnim = 1;
      }
    }
  }

  _fire(tower, inRange, range) {
    const dmg = this._effectiveDamage() * this._overchargeBonus();
    const applyFracture = this.hasUpgrade('fracture_payload');
    const applyStorm    = this.hasUpgrade('storm_rounds');
    const armorPiercing = this.hasUpgrade('armor_piercing');
    const cryo          = this.hasUpgrade('cryo_rounds');

    for (const e of inRange) {
      const falloff = 1 - (Utils.dist(tower.x, tower.y, e.x, e.y) / range) * 0.4;
      let d = dmg * falloff;
      if (armorPiercing) {
        e.hp -= Math.max(1, d * 0.75 + e.hp * 0.25);
        if (e.hp <= 0) { this._onKill(e, applyFracture); continue; }
      } else {
        const wasDead = e.hp <= 0;
        e.takeDamage(d);
        if (!wasDead && e.hp <= 0 && applyFracture) { this._onKill(e, true); continue; }
      }
      if (cryo) e.applySlow(0.4, 1.5);
    }
    Particles.pulseRing(tower.x, tower.y, range);
  }

  _onKill(enemy, fracture) {
    if (fracture) this._doFracture(enemy);
  }

  _doFracture(enemy) {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i;
      const proj  = new Projectile(enemy.x, enemy.y, angle, 260,
        this._effectiveDamage() * 0.35, 90, '#ffdd44');
      proj.radius = 3;
      Game.projectiles.push(proj);
    }
  }

  draw(ctx, tower) {
    if (this.pulseAnim <= 0) return;
    const range = this._effectiveRange();
    const t     = 1 - this.pulseAnim;
    const r     = range * t;
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 200, 50, ${this.pulseAnim * 0.6})`;
    ctx.lineWidth = 3 + this.pulseAnim * 4;
    ctx.stroke();
  }
}

// ══════════════════════════════════════════════════════════════
// DRONE  (single autonomous unit)
// ══════════════════════════════════════════════════════════════
class Drone {
  constructor(orbitCenter, orbitAngle, index) {
    this.orbitAngle  = orbitAngle;
    this.orbitRadius = CONFIG.DRONE_ORBIT_RADIUS;
    this.index       = index;
    this.x = orbitCenter.x; this.y = orbitCenter.y;
    this.maxHp   = CONFIG.DRONE_HP;
    this.hp      = this.maxHp;
    this.damage  = CONFIG.DRONE_DAMAGE;
    this.fireRate = CONFIG.DRONE_FIRE_RATE;
    this.fireTimer = Math.random() / this.fireRate;
    this.range   = CONFIG.DRONE_RANGE;
    this.speed   = CONFIG.DRONE_BULLET_SPEED;
    this.dead    = false;
    this.orbitSpeed = 1.4;
  }

  update(dt, center, enemies) {
    // Orbit the center point
    this.orbitAngle += this.orbitSpeed * dt;
    this.x = center.x + Math.cos(this.orbitAngle) * this.orbitRadius;
    this.y = center.y + Math.sin(this.orbitAngle) * this.orbitRadius;

    // Fire at nearest enemy in range
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      const tgt = this._findTarget(enemies);
      if (tgt) {
        this._fire(tgt);
        this.fireTimer = 1 / this.fireRate;
      }
    }

    // Block enemy contact if drone_guard: take damage instead of player
    if (Game.stats.hasDroneGuard) {
      for (const e of enemies) {
        if (!e.dead && Utils.circleCollide(this.x, this.y, 8, e.x, e.y, e.radius)) {
          if (!e._droneHit) {
            this.hp -= e.damage * 0.5;
            e._droneHit = true;
            if (this.hp <= 0) { this.dead = true; return; }
          }
        } else { e._droneHit = false; }
      }
    }
  }

  _findTarget(enemies) {
    let best = null, bestD = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Utils.dist(this.x, this.y, e.x, e.y);
      if (d <= this.range + e.radius && d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  _fire(target) {
    const angle = Utils.angle(this.x, this.y, target.x, target.y);
    const proj  = new Projectile(this.x, this.y, angle, this.speed,
      this.damage, this.range, '#aaffee');
    proj.radius = 3;
    proj._isDroneBullet = true;
    Game.projectiles.push(proj);
  }

  draw(ctx) {
    // Body
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.orbitAngle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fillStyle = '#aaffee';
    ctx.fill();
    ctx.restore();

    // HP bar
    if (this.hp < this.maxHp) {
      const bw = 18, bx = this.x - bw/2, by = this.y - 13;
      ctx.fillStyle = '#331111'; ctx.fillRect(bx, by, bw, 3);
      ctx.fillStyle = '#00ffaa'; ctx.fillRect(bx, by, bw * (this.hp/this.maxHp), 3);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// DEFENSE DRONES WEAPON
// ══════════════════════════════════════════════════════════════
class DefenseDronesWeapon extends Weapon {
  constructor() {
    super('drones', { fireRate: 1, damage: CONFIG.DRONE_DAMAGE, range: CONFIG.DRONE_RANGE });
    this.drones       = [];
    this.maxDrones    = CONFIG.DRONE_COUNT;
    this.respawnTimers = [];
    this._spawnInitialDrones(Game.tower);
  }

  _spawnInitialDrones(tower) {
    const center = this._getCenter();
    for (let i = 0; i < this.maxDrones; i++) {
      const angle = (Math.PI * 2 / this.maxDrones) * i;
      this.drones.push(new Drone(center, angle, i));
    }
  }

  _getCenter() {
    if (Game.stats.hasDroneGuard && Game.player) return Game.player;
    return Game.tower;
  }

  update(dt, tower, enemies) {
    // Apply stat upgrades from Game.stats
    const maxD   = this.maxDrones + (Game.stats.droneExtraCount || 0);
    const droneHp  = CONFIG.DRONE_HP    + (Game.stats.droneExtraHp || 0);
    const droneDmg = CONFIG.DRONE_DAMAGE * (1 + (Game.stats.droneDmgMult || 0));
    const droneSpd = CONFIG.DRONE_FIRE_RATE * (1 + (Game.stats.droneFireRateMult || 0));
    const respawnBase = CONFIG.DRONE_RESPAWN_TIME * (1 - (Game.stats.droneRespawnMult || 0));

    // Update respawn timers
    for (let i = this.respawnTimers.length - 1; i >= 0; i--) {
      this.respawnTimers[i] -= dt;
      if (this.respawnTimers[i] <= 0) {
        this.respawnTimers.splice(i, 1);
        const center = this._getCenter();
        const angle  = Math.random() * Math.PI * 2;
        const d = new Drone(center, angle, this.drones.length);
        d.maxHp = droneHp; d.hp = droneHp;
        d.damage = droneDmg; d.fireRate = droneSpd;
        this.drones.push(d);
      }
    }

    const center = this._getCenter();

    // Update existing drones
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const d = this.drones[i];
      d.damage = droneDmg;
      d.fireRate = droneSpd;
      d.update(dt, center, enemies);

      if (d.dead) {
        this.drones.splice(i, 1);
        Particles.explosion(d.x, d.y, '#aaffee', 30);
        this.respawnTimers.push(Math.max(1, respawnBase));
      }
    }

    // Spawn more drones if max increased via upgrades
    while (this.drones.length + this.respawnTimers.length < maxD) {
      this.respawnTimers.push(2);
    }
  }

  draw(ctx) {
    // Orbit path (faint ring)
    const center = this._getCenter();
    ctx.beginPath();
    ctx.arc(center.x, center.y, CONFIG.DRONE_ORBIT_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(170, 255, 238, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (const d of this.drones) d.draw(ctx);
  }
}

// ══════════════════════════════════════════════════════════════
// PHANTOM AFTERIMAGE (decoy entity — not a weapon but lives here)
// ══════════════════════════════════════════════════════════════
class PhantomDecoy {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.life    = CONFIG.PHANTOM_DURATION;
    this.maxLife = CONFIG.PHANTOM_DURATION;
    this.radius  = Game.playerData.baseRadius;
    this.dead    = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    const alpha = (this.life / this.maxLife) * 0.55;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#00c8ff';
    ctx.fill();
    // Flicker border
    if (Math.sin(Date.now() / 80) > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

const WeaponFactory = {
  create(type) {
    switch (type) {
      case 'gun':          return new GunWeapon();
      case 'shotgun':      return new ShotgunWeapon();
      case 'rifle':        return new RifleWeapon();
      case 'sniper':       return new SniperWeapon();
      case 'mortar':       return new MortarWeapon();
      case 'missile':      return new MissileLauncherWeapon();
      case 'flamethrower': return new FlamethrowerWeapon();
      case 'tesla':        return new TeslaCoilWeapon();
      case 'laser':        return new LaserWeapon();
      case 'pulse':        return new PulseEmitterWeapon();
      case 'drones':       return new DefenseDronesWeapon();
      default: console.warn(`Unknown weapon type: ${type}`); return null;
    }
  }
};
