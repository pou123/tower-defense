// ==============================================================
// ENEMY.JS — Enemy entity + AI behaviors
// ==============================================================

let _enemyIdCounter = 0;

class Enemy {
  constructor(x, y, def, waveBuffs) {
    this.id     = _enemyIdCounter++;
    this.x      = x;
    this.y      = y;
    this.def    = def;       // original JSON definition (read-only reference)
    this.type   = def.id;

    // Apply wave-level buffs
    const buf = waveBuffs[def.id] || { hpMult: 1, speedMult: 1, damageMult: 1 };
    this.maxHp  = def.hp    * buf.hpMult;
    this.hp     = this.maxHp;
    this.speed  = def.speed * buf.speedMult;
    this.damage = def.damage * buf.damageMult;
    this.radius = def.radius;
    this.color  = def.color;
    this.glowColor = def.glowColor || def.color;
    this.xpValue = def.xpValue;
    this.ai     = def.ai;
    this.contactDmgCooldown    = def.contactDamageCooldown || 0.8;
    this.contactDmgTimer       = 0;

    // AI-specific state
    this.summonType     = def.summonType || null;
    this.summonInterval = def.summonInterval || 5;
    this.summonTimer    = def.summonInterval || 5;
    this.summonCount    = def.summonCount || 1;
    this.summonStayDist = def.summonStayDistance || 250;

    this.dead       = false;
    this.dying      = false;
    this.dyingTimer = 0;

    // Velocity for predictive targeting
    this.vx = 0;
    this.vy = 0;

    // Status effects
    this.burnDmgPerSec  = 0;
    this.burnTimer      = 0;
    this.slowFactor     = 1;   // multiplier (1 = normal, 0.4 = 60% slower)
    this.slowTimer      = 0;

    // Voltaic dash tracking
    this._voltaicHit    = false;

    this.hitFlash = 0;
  }

  update(dt, player, tower, spawnCallback) {
    if (this.dying) {
      this.dyingTimer -= dt;
      if (this.dyingTimer <= 0) this.dead = true;
      return;
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt);

    // ── Status effects ──
    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      this.hp -= this.burnDmgPerSec * dt;
      if (this.hp <= 0) { this.die(); return; }
      if (this.burnTimer <= 0) { this.burnDmgPerSec = 0; }
    }

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 1;
    }

    const effectiveSpeed = this.speed * this.slowFactor;

    // ── AI behavior ──
    const prevX = this.x;
    const prevY = this.y;

    switch (this.ai) {
      case 'direct':   this._aiDirect(dt, player, tower, effectiveSpeed); break;
      case 'summoner': this._aiSummoner(dt, player, tower, effectiveSpeed, spawnCallback); break;
      default:         this._aiDirect(dt, player, tower, effectiveSpeed);
    }

    // Track velocity for lead targeting
    if (dt > 0) {
      this.vx = (this.x - prevX) / dt;
      this.vy = (this.y - prevY) / dt;
    }

    // ── Clamp to arena ──
    this.x = Utils.clamp(this.x, this.radius, Game.arenaW - this.radius);
    this.y = Utils.clamp(this.y, this.radius, Game.arenaH - this.radius);
  }

  // Pick between real player and any active decoys — target closest
  _pickTarget(player) {
    const decoys = Game.decoys || [];
    if (decoys.length === 0) return player;
    let best = player;
    let bestD = Utils.dist(this.x, this.y, player.x, player.y);
    for (const d of decoys) {
      const dd = Utils.dist(this.x, this.y, d.x, d.y);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }

  // ── Direct AI: run straight at player ──────────────────────
  _aiDirect(dt, player, tower, speed) {
    // Check if a decoy is closer and should be targeted
    const target = this._pickTarget(player);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) {
      this.x += (dx / dist) * speed * dt;
      this.y += (dy / dist) * speed * dt;
    }
    this._checkContactDamage(dt, player, tower);
  }

  // ── Summoner AI: approach, maintain distance, summon ───────
  _aiSummoner(dt, player, tower, speed, spawnCallback) {
    const target = this._pickTarget(player);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > this.summonStayDist + 30) {
      // Approach
      this.x += (dx / dist) * speed * dt;
      this.y += (dy / dist) * speed * dt;
    } else if (dist < this.summonStayDist - 30) {
      // Back off
      this.x -= (dx / dist) * speed * dt * 0.5;
      this.y -= (dy / dist) * speed * dt * 0.5;
    }
    // else: stay in sweet spot

    // Summon
    this.summonTimer -= dt;
    if (this.summonTimer <= 0) {
      this.summonTimer = this.summonInterval;
      for (let i = 0; i < this.summonCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const sx = this.x + Math.cos(angle) * (this.radius + 20);
        const sy = this.y + Math.sin(angle) * (this.radius + 20);
        spawnCallback(this.summonType, sx, sy);
      }
    }

    this._checkContactDamage(dt, player, tower);
  }

  _checkContactDamage(dt, player, tower) {
    this.contactDmgTimer = Math.max(0, this.contactDmgTimer - dt);

    // Hit player
    if (!player.invulnerable &&
        this.contactDmgTimer <= 0 &&
        Utils.circleCollide(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
      Game.takeDamage(this.damage);
      this.contactDmgTimer = this.contactDmgCooldown;
    }

    // Hit tower
    if (this.contactDmgTimer <= 0 &&
        Utils.circleCollide(this.x, this.y, this.radius, tower.x, tower.y, tower.radius)) {
      tower.takeDamage(this.damage);
      this.contactDmgTimer = this.contactDmgCooldown;
    }
  }

  takeDamage(amount) {
    if (this.dying || this.dead) return;
    const resist = this._dmgResist || 0;
    this.hp -= amount * (1 - resist);
    this.hitFlash = 0.1;
    if (this.hp <= 0) this.die();
  }

  applyBurn(dmgPerSec, duration) {
    // Stack duration, take highest dmg
    this.burnDmgPerSec = Math.max(this.burnDmgPerSec, dmgPerSec);
    this.burnTimer     = Math.max(this.burnTimer, duration);
  }

  applySlow(factor, duration) {
    // Lower factor = more slow, take the worse slow
    this.slowFactor = Math.min(this.slowFactor, factor);
    this.slowTimer  = Math.max(this.slowTimer, duration);
  }

  die() {
    if (this.dying || this.dead) return;
    this.dying      = true;
    this.dyingTimer = 0.25;
    this.hp         = 0;

    // Notify wave modifier system (toxic pools, endless tide kills, etc.)
    if (typeof WaveModifiers !== 'undefined') WaveModifiers.onEnemyDeath(this);

    // Spawn XP orb
    Game.xpOrbs.push(new XPOrb(this.x, this.y, this.xpValue));

    // Scavenger: chance for HP orb
    if (Game.stats.hasScavenger && Math.random() < 0.20) {
      Game.hpOrbs.push(new HPOrb(this.x, this.y, 5));
    }

    Particles.explosion(this.x, this.y, this.glowColor, this.radius * 3);
  }

  draw(ctx) {
    if (!Camera.isVisible(this.x, this.y, this.radius)) return;

    const alpha = this.dying ? this.dyingTimer / 0.25 : 1;
    ctx.globalAlpha = alpha;

    // Burn overlay
    if (this.burnTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 100, 10, 0.3)`;
      ctx.fill();
    }

    // Slow overlay
    if (this.slowTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100, 200, 255, 0.25)`;
      ctx.fill();
    }

    // Glow (solid, no gradient)
    const glowAlpha = this.hitFlash > 0 ? 0.9 : 0.4;
    const gColor = this.hitFlash > 0 ? '#ffffff' : this.glowColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 12, 0, Math.PI * 2);
    ctx.fillStyle = gColor;
    ctx.globalAlpha = glowAlpha * 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Body
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : this.color;
    ctx.fill();
    ctx.strokeStyle = this.glowColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Special marker for summoner
    if (this.ai === 'summoner') {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i;
        const px = this.x + Math.cos(a) * (this.radius * 0.5);
        const py = this.y + Math.sin(a) * (this.radius * 0.5);
        ctx.moveTo(px, py);
        ctx.arc(px, py, 2, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    // HP bar
    if (this.hp < this.maxHp) {
      const bw = this.radius * 2 + 4;
      const bx = this.x - bw / 2;
      const by = this.y - this.radius - 8;
      ctx.fillStyle = '#331111';
      ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), 4);
    }

    ctx.globalAlpha = 1;
  }
}

// ── HP Orb (from Scavenger) ───────────────────────────────────
class HPOrb {
  constructor(x, y, amount) {
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.radius = 8;
    this.dead   = false;
    this.bobTimer = Math.random() * Math.PI * 2;
  }

  update(dt, player) {
    this.bobTimer += dt * 3;
    const d = Utils.dist(this.x, this.y, player.x, player.y);
    if (d <= Game.stats.xpRadius + this.radius) {
      Game.heal(this.amount);
      this.dead = true;
    }
  }

  draw(ctx) {
    const bob = Math.sin(this.bobTimer) * 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6688';
    ctx.fill();
    ctx.strokeStyle = '#ffaacc';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('+', this.x, this.y + bob + 3);
  }
}
