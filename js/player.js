// ==============================================================
// PLAYER.JS — Player entity: movement, dash, collision, render
// ==============================================================

class Player {
  constructor(x, y, data) {
    this.x = x;
    this.y = y;

    // ── Base stats (from player.json) ──
    this.speed         = data.baseSpeed;
    this.radius        = data.baseRadius;
    this.dashDistMult  = data.dashDistanceMultiplier;
    this.dashDuration  = data.dashDuration;
    this.dashCooldown  = data.dashCooldown;
    this.xpRadius      = data.xpPickupRadius;
    this.dashDamage    = data.dashDamage;

    // ── Runtime state ──
    this.velX = 0;
    this.velY = 0;
    this.lastDirX = 0;
    this.lastDirY = -1; // default: facing up

    this.dashing        = false;
    this.dashTimer      = 0;
    this.dashCoolTimer  = 0;
    this.dashVelX       = 0;
    this.dashVelY       = 0;
    this.invulnerable   = false;

    // Slipstream trail positions [{ x, y, life }]
    this.dashTrails = [];

    // Visual pulse
    this.pulseTimer = 0;
  }

  update(dt, arenaW, arenaH, enemies) {
    this.pulseTimer += dt;

    // ── Dash cooldown timer ──
    if (this.dashCoolTimer > 0) this.dashCoolTimer -= dt;

    // ── Handle dash ──
    if (this.dashing) {
      this.dashTimer -= dt;

      // Leave slipstream trail if upgrade is active
      if (Game.stats.hasSlipstream) {
        this.dashTrails.push({ x: this.x, y: this.y, life: 1.5 });
      }

      this.x += this.dashVelX * dt;
      this.y += this.dashVelY * dt;
      this.invulnerable = true;

      // Voltaic: damage enemies during dash
      if (Game.stats.hasVoltaic) {
        for (const e of enemies) {
          if (!e.dead && Utils.circleCollide(this.x, this.y, this.radius, e.x, e.y, e.radius)) {
            if (!e._voltaicHit) {
              e.takeDamage(Game.stats.dashDamage);
              e._voltaicHit = true;
            }
          } else {
            e._voltaicHit = false;
          }
        }
      }

      if (this.dashTimer <= 0) {
        this.dashing = false;
        this.invulnerable = false;
        this.dashCoolTimer = Game.stats.dashCooldown;
      }
    } else {
      // ── Normal movement ──
      const dir = Input.getMovementDir();

      // Momentum Harvest speed boost
      if (this._momentumTimer > 0) {
        this._momentumTimer -= dt;
      }
      const momentumMult = (this._momentumTimer > 0) ? 1.35 : 1;

      this.velX = dir.x * Game.stats.playerSpeed * momentumMult;
      this.velY = dir.y * Game.stats.playerSpeed * momentumMult;

      if (dir.x !== 0 || dir.y !== 0) {
        this.lastDirX = dir.x;
        this.lastDirY = dir.y;
      }

      this.x += this.velX * dt;
      this.y += this.velY * dt;

      // ── Trigger dash ──
      if (Input.wasJustPressed('Space') && this.dashCoolTimer <= 0) {
        this._startDash();
      }
    }

    // ── Clamp to arena ──
    this.x = Utils.clamp(this.x, this.radius, arenaW - this.radius);
    this.y = Utils.clamp(this.y, this.radius, arenaH - this.radius);

    // ── Age slipstream trails ──
    for (const t of this.dashTrails) t.life -= dt;
    this.dashTrails = this.dashTrails.filter(t => t.life > 0);
  }

  _startDash() {
    const len = Math.sqrt(this.lastDirX ** 2 + this.lastDirY ** 2);
    const nx = len > 0 ? this.lastDirX / len : 0;
    const ny = len > 0 ? this.lastDirY / len : -1;

    const dist = this.radius * 2 * Game.stats.dashDistMult;
    const dur  = Game.stats.dashDuration;

    this.dashVelX = (nx * dist) / dur;
    this.dashVelY = (ny * dist) / dur;
    this.dashTimer = dur;
    this.dashing   = true;

    // Phantom Afterimage: spawn decoy at current position
    if (Game.stats.hasPhantomAfterimage) {
      if (!Game.decoys) Game.decoys = [];
      Game.decoys.push(new PhantomDecoy(this.x, this.y));
    }

    // Kinetic Rebound: knock nearby enemies away
    if (Game.stats.hasKineticRebound) {
      const knockRange = this.radius * 4;
      for (const e of Game.enemies) {
        if (!e.dead && Utils.dist(this.x, this.y, e.x, e.y) <= knockRange + e.radius) {
          const angle = Utils.angle(this.x, this.y, e.x, e.y);
          e.x += Math.cos(angle) * 80;
          e.y += Math.sin(angle) * 80;
        }
      }
    }

    // Clear voltaic flags
    if (Game.stats.hasVoltaic) {
      for (const e of Game.enemies) e._voltaicHit = false;
    }
  }

  draw(ctx) {
    const towerAngle = Utils.angle(this.x, this.y, Game.tower.x, Game.tower.y);
    const pulse = 0.5 + 0.5 * Math.sin(this.pulseTimer * 4);

    // ── Slipstream trails ──
    for (const t of this.dashTrails) {
      const alpha = t.life / 1.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, this.radius * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 200, 255, ${alpha * 0.3})`;
      ctx.fill();
    }

    // ── Simple glow / outline (no gradients)
    const glowR = this.dashing ? this.radius * 2.2 : this.radius + 14;
    const glowColor = this.invulnerable ? '#00ffff' : '#00c8ff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2);
    ctx.fillStyle = glowColor;
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Body circle ──
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.dashing ? '#ffffff' : '#c8eeff';
    ctx.fill();
    ctx.strokeStyle = '#00c8ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Direction triangle toward tower ──
    const tr = this.radius + 9;
    const tx = this.x + Math.cos(towerAngle) * tr;
    const ty = this.y + Math.sin(towerAngle) * tr;
    const left  = towerAngle + Math.PI * 0.75;
    const right = towerAngle - Math.PI * 0.75;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(this.x + Math.cos(left)  * (this.radius * 0.55),
               this.y + Math.sin(left)  * (this.radius * 0.55));
    ctx.lineTo(this.x + Math.cos(right) * (this.radius * 0.55),
               this.y + Math.sin(right) * (this.radius * 0.55));
    ctx.closePath();
    ctx.fillStyle = '#00c8ff';
    ctx.fill();

    // ── Dash cooldown arc around player ──
    if (this.dashCoolTimer > 0 && !this.dashing) {
      const frac = this.dashCoolTimer / Game.stats.dashCooldown;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (!this.dashing) {
      // Ready indicator
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,200,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ── XP collection radius (faint) ──
    ctx.beginPath();
    ctx.arc(this.x, this.y, Game.stats.xpRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180,100,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  isInTowerRadius() {
    return Utils.dist(this.x, this.y, Game.tower.x, Game.tower.y) <= Game.stats.towerRechargeRadius;
  }
}
