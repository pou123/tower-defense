// ==============================================================
// TOWER.JS — Tower entity: energy, weapons, rendering
// ==============================================================

class Tower {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    // Make turret larger so player can stand inside
    this.radius = 42;

    this.energy       = CONFIG.TOWER_ENERGY_MAX;
    this.weapons      = []; // Array of Weapon instances (null = empty slot)

    this.pulseTimer   = 0;
    this.hitFlash     = 0;

    // Emergency protocol state
    this.emergencyActive = false;
    this.emergencyTimer  = 0;

    // Bulwark pulse
    this.bulwarkPulse = 0;

    // For rendering range
    this._showRange   = false;
    this._rangeTimer  = 0;
  }

  addWeapon(weaponInstance) {
    if (this.weapons.length < Game.stats.towerWeaponSlots) {
      weaponInstance.slotIndex = this.weapons.length;
      this.weapons.push(weaponInstance);
      return true;
    }
    return false;
  }

  getWeaponSlots() {
    return this.weapons;
  }

  getWeaponsByType(type) {
    return this.weapons.filter(w => w && w.type === type);
  }

  getWeaponBySlot(idx) {
    return this.weapons[idx] || null;
  }

  update(dt, player, enemies) {
    this.pulseTimer += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.bulwarkPulse > 0) this.bulwarkPulse -= dt;

    // ── Energy management ──
    const inRadius = player.isInTowerRadius();
    const drainRate   = Game.stats.energyDrainRate
      * (Game.stats.overclock ? 1.5 : 1)
      * (1 - Math.min(0.8, Game.stats.stabilizerBonus || 0));
    const chargeRate  = Game.stats.energyChargeRate;
    const solarRate   = Game.stats.hasSolarPanels ? Game.stats.solarPanelRate : 0;

    if (inRadius) {
      this.energy = Math.min(Game.stats.towerEnergyMax,
        this.energy + chargeRate * dt + solarRate * dt);
    } else {
      this.energy = Math.max(0,
        this.energy - drainRate * dt + solarRate * dt);
    }

    // ── Emergency protocol ──
    const hpPct = Game.hp / Game.stats.maxHp;
    if (Game.stats.hasEmergencyProtocol && hpPct <= 0.25 && !this.emergencyActive &&
        !Game.stats.emergencyUsed) {
      this.emergencyActive   = true;
      this.emergencyTimer    = 5;
      Game.stats.emergencyUsed = true;
    }
    if (this.emergencyActive) {
      this.emergencyTimer -= dt;
      if (this.emergencyTimer <= 0) this.emergencyActive = false;
    }

    const weaponsActive = this.energy > 0 || this.emergencyActive;

    // ── Bulwark slow field ──
    if (Game.stats.bulwarkLevel > 0) {
      this.bulwarkPulse += dt;
      const slowRadius = 80 + Game.stats.bulwarkLevel * 40;
      const slowFactor = 0.35 - Game.stats.bulwarkLevel * 0.05;
      for (const e of enemies) {
        if (!e.dead && Utils.dist(this.x, this.y, e.x, e.y) <= slowRadius + e.radius) {
          e.applySlow(slowFactor, 0.1);
        }
      }
    }

    // ── Fire weapons ──
    for (const w of this.weapons) {
      if (!w) continue;
      if (!weaponsActive) continue;
      w.update(dt, this, enemies);
    }
  }

  takeDamage(rawDamage) {
    // Tower takes 75% base, further reduced by anchor
    const reduction = Game.stats.towerDmgReduction + Game.stats.anchorBonus;
    const dmg = rawDamage * Math.max(0.1, 1 - reduction);
    Game.takeDamage(dmg);
    this.hitFlash = 0.12;
  }

  draw(ctx) {
    const px = this.pulseTimer;

    // ── Bulwark ring ──
    if (Game.stats.bulwarkLevel > 0) {
      const slowRadius = 80 + Game.stats.bulwarkLevel * 40;
      const alpha = 0.05 + 0.05 * Math.sin(this.bulwarkPulse * 2);
      ctx.beginPath();
      ctx.arc(this.x, this.y, slowRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100,200,255,${alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(100,200,255,0.3)`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // ── Recharge radius (thicker)
    ctx.beginPath();
    ctx.arc(this.x, this.y, Game.stats.towerRechargeRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 200, 100, 0.16)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // ── Outer glow ──
    const energyPct = this.energy / Game.stats.towerEnergyMax;
    const glowAlpha = 0.3 + 0.2 * Math.sin(px * 2) + energyPct * 0.3;
    const glowColor = this.hitFlash > 0 ? '#ff4444' :
                      this.emergencyActive ? '#ff8800' :
                      energyPct > 0.5 ? '#00ffaa' : '#ffaa00';

    // Outer glow simplified (solid fill)
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 30, 0, Math.PI * 2);
    ctx.fillStyle = glowColor;
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Weapon range visualization ──
    for (const w of this.weapons) {
      if (!w) continue;
      const range = w._effectiveRange();
      ctx.beginPath();
      ctx.arc(this.x, this.y, range, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ── Hexagonal body ──
    const sides = 6;
    const bodyColor = this.hitFlash > 0 ? '#ff6666' : '#1a2a3a';
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI / sides) * (2 * i + 1);
      const px2 = this.x + this.radius * Math.cos(angle);
      const py2 = this.y + this.radius * Math.sin(angle);
      i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
    }
    ctx.closePath();
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Inner energy ring ──
    const startAngle = -Math.PI / 2;
    const endAngle   = startAngle + energyPct * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius - 6, startAngle, endAngle);
    ctx.strokeStyle = energyPct > 0.25 ? '#00ffaa' : '#ff4444';
    ctx.lineWidth = 3;
    ctx.stroke();

    // ── Emergency indicator ──
    if (this.emergencyActive) {
      const flash = Math.sin(Date.now() / 100) > 0;
      if (flash) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // ── Weapon slot indicators ──
    const slotCount = Game.stats.towerWeaponSlots;
    for (let i = 0; i < slotCount; i++) {
      const a = (Math.PI * 2 / slotCount) * i - Math.PI / 2;
      const sx = this.x + Math.cos(a) * (this.radius - 4);
      const sy = this.y + Math.sin(a) * (this.radius - 4);
      const weapon = this.weapons[i];
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = weapon ? '#00ffaa' : '#334455';
      ctx.fill();
    }

    // ── Laser weapons draw their own beams ──
    for (const w of this.weapons) {
      if (w && w.type === 'laser') w.draw(ctx, this);
      if (w && w.type === 'pulse') w.draw(ctx, this);
      if (w && w.type === 'drones') w.draw(ctx);
    }
  }
}
