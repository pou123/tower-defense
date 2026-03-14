// ==============================================================
// XP.JS — XP orbs, collection, leveling
// ==============================================================

class XPOrb {
  constructor(x, y, baseValue) {
    this.x = x;
    this.y = y;
    this.baseValue = baseValue;
    this.radius = 6;
    this.dead   = false;
    this.bobTimer = Math.random() * Math.PI * 2;
    this.magnetized = false; // pulled toward player
    this.magnetSpeed = 180;
  }

  getXPValue() {
    // XP scaling based on player level vs total difficulty
    const lvl  = Game.level;
    const diff = Game.totalDifficulty;
    let scale = 1;

    if (diff > lvl) {
      // Difficulty higher: more XP (reward risk)
      scale = 1 + (diff - lvl) * 0.12;
    } else if (lvl > diff) {
      // Player level higher: less XP (punishment for easy mode)
      scale = Math.max(0.15, 1 - (lvl - diff) * 0.15);
    }

    return Math.max(0.1, this.baseValue * scale * Game.stats.xpMultiplier);
  }

  update(dt, player) {
    this.bobTimer += dt * 2.5;

    const d = Utils.dist(this.x, this.y, player.x, player.y);
    const pickupR = Game.stats.xpRadius;

    // Magnetize if inside collection radius
    if (d <= pickupR + this.radius) {
      this.magnetized = true;
    }

    if (this.magnetized) {
      if (d <= 4) {
        // Collected
        const xpGain = this.getXPValue();
        Game.addXP(xpGain);

        // Blood Converter: tiny HP heal per orb
        if (Game.stats.hasBloodConverter) Game.heal(0.5);

        // Momentum Harvest: brief speed boost
        if (Game.stats.hasMomentumHarvest && Game.player) {
          Game.player._momentumTimer = 1.5;
        }

        this.dead = true;
        return;
      }
      // Pull toward player
      const nx = (player.x - this.x) / d;
      const ny = (player.y - this.y) / d;
      this.x += nx * this.magnetSpeed * dt;
      this.y += ny * this.magnetSpeed * dt;
    }
  }

  draw(ctx) {
    const bob = Math.sin(this.bobTimer) * 3;
    const py  = this.y + bob;

    // Glow
    const g = ctx.createRadialGradient(this.x, py, 0, this.x, py, this.radius + 8);
    g.addColorStop(0, 'rgba(180, 80, 255, 0.7)');
    g.addColorStop(1, 'rgba(180, 80, 255, 0)');
    ctx.beginPath();
    ctx.arc(this.x, py, this.radius + 8, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // Orb
    ctx.beginPath();
    ctx.arc(this.x, py, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#bf5fff';
    ctx.fill();
    ctx.strokeStyle = '#e0aaff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner sparkle
    ctx.beginPath();
    ctx.arc(this.x - 2, py - 2, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  }
}

// ── XP / Level system (attached to Game namespace in main.js) ─
const XPSystem = {
  // Called when XP is collected
  onXPAdded() {
    // Loop in case multiple level-ups happen
    while (Game.xp >= Game.xpThreshold) {
      Game.xp -= Game.xpThreshold;
      Game.level++;
      Game.xpThreshold = CONFIG.XP_BASE_THRESHOLD + (Game.level - 1) * CONFIG.XP_THRESHOLD_STEP;
      Game.pendingLevelUps++;
    }
  }
};
