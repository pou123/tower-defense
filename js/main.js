// ==============================================================
// MAIN.JS — Game init, loop, state machine
// ── All tunable values live in CONFIG ──────────────────────────
// ==============================================================

const CONFIG = {
  // ── Player ──────────────────────────────────────────────────
  HP_BASE: 100,

  // ── Tower ──────────────────────────────────────────────────
  TOWER_DMG_MULTIPLIER:  0.75,   // Tower takes this fraction of damage (vs 1.0 for player)
  TOWER_ENERGY_MAX:      50,
  TOWER_ENERGY_DRAIN:    1,      // energy lost per second when player is NOT in radius
  TOWER_ENERGY_CHARGE:   1,      // energy gained per second when player IS in radius
  TOWER_RECHARGE_RADIUS: 70,     // distance at which player recharges tower
  TOWER_WEAPON_SLOTS:    4,

  // ── Arena ───────────────────────────────────────────────────
  ARENA_SCALE: 2,                // arena = ARENA_SCALE * screen size

  // ── XP ──────────────────────────────────────────────────────
  XP_BASE_THRESHOLD:  10,
  XP_THRESHOLD_STEP:  10,

  // ── Waves ───────────────────────────────────────────────────
  WAVE_DOWNTIME_SECONDS:    5,
  LEVEL_UP_CHOICES:         3,
  ENEMY_UPGRADE_CHOICES:    3,

  // ── Enemy spawning ──────────────────────────────────────────
  ENEMY_SPAWN_MARGIN:       80,   // pixels off arena edge for initial spawn margin
  ENEMY_MIN_SPAWN_DIST:     300,  // minimum spawn distance from tower center

  // ── Weapons ─────────────────────────────────────────────────
  GUN_FIRE_RATE:     3,
  GUN_DAMAGE:        10,
  GUN_BULLET_SPEED:  660,
  GUN_BASE_RANGE:    320,

  SHOTGUN_FIRE_RATE:     1,
  SHOTGUN_DAMAGE:        9,
  SHOTGUN_PELLETS:       5,
  SHOTGUN_SPREAD:        0.32,
  SHOTGUN_BULLET_SPEED:  540,
  SHOTGUN_RANGE:         210,

  RIFLE_FIRE_RATE:     0.8,
  RIFLE_DAMAGE:        38,
  RIFLE_BULLET_SPEED:  930,
  RIFLE_RANGE:         520,

  SNIPER_FIRE_RATE:     0.28,
  SNIPER_DAMAGE:        85,
  SNIPER_BULLET_SPEED: 1400,
  SNIPER_RANGE:         820,

  MORTAR_FIRE_RATE:        0.4,
  MORTAR_DAMAGE:           55,
  MORTAR_RANGE:            420,
  MORTAR_EXPLOSION_RADIUS: 72,

  MISSILE_FIRE_RATE:        0.65,
  MISSILE_DAMAGE:           42,
  MISSILE_RANGE:            460,
  MISSILE_EXPLOSION_RADIUS: 62,
  MISSILE_SPEED:            320,
  MISSILE_TURN_SPEED:       3.0,

  FLAMETHROWER_FIRE_RATE:     22,
  FLAMETHROWER_DAMAGE:        4,
  FLAMETHROWER_RANGE:         155,
  FLAMETHROWER_CONE:          0.5,
  FLAMETHROWER_BURN_DAMAGE:   3,
  FLAMETHROWER_BURN_DURATION: 2,

  TESLA_FIRE_RATE:   0.8,
  TESLA_DAMAGE:      22,
  TESLA_RANGE:       260,
  TESLA_CHAIN_RANGE: 130,
  TESLA_CHAINS:      3,

  LASER_DAMAGE_PER_SECOND: 32,
  LASER_RANGE:             290,
  LASER_ROTATION_SPEED:    1.6,
  LASER_WIDTH:             4,

  PULSE_FIRE_RATE:     0.6,
  PULSE_DAMAGE:        18,
  PULSE_RADIUS:        180,

  DRONE_COUNT:         2,
  DRONE_HP:            40,
  DRONE_DAMAGE:        12,
  DRONE_FIRE_RATE:     1.2,
  DRONE_ORBIT_RADIUS:  70,
  DRONE_BULLET_SPEED:  340,
  DRONE_RANGE:         220,
  DRONE_RESPAWN_TIME:  6,

  // ── Phantom Afterimage ──────────────────────────────────────
  PHANTOM_DURATION:    3.0,    // seconds the decoy lasts

  // ── Static Tower ────────────────────────────────────────────
  STATIC_TOWER_THRESHOLD: 5.0, // seconds to stand still before buff activates
  STATIC_TOWER_FIRERATE_BONUS: 0.30,
  STATIC_TOWER_DMG_BONUS:      0.30,

  // ── Hermit's Shell ──────────────────────────────────────────
  HERMITS_SHELL_REGEN: 1.0,    // HP per second per level

  // ── Home Soil ────────────────────────────────────────────────
  HOME_SOIL_BONUS:     0.15,   // damage mult per level

  // ── Extra Eye ───────────────────────────────────────────────
  EXTRA_EYE_EFFECTIVENESS: 0.5,

  // ── Wave modifiers ──────────────────────────────────────────
  WAVE_MODIFIER_CHOICES:  1,   // how many wave modifiers player picks per wave
  ENDLESS_TIDE_KILL_TARGET_MULT: 2.5, // kills required = normal wave count * this
};

// ══════════════════════════════════════════════════════════════
// GAME OBJECT — central runtime state
// ══════════════════════════════════════════════════════════════
const Game = {
  state: 'loading', // loading | playing | level_up | slot_pick | enemy_upgrade | downtime | game_over

  canvas: null,
  ctx:    null,

  // ── Loaded data ──
  playerData:   null,
  enemyDefs:    [],
  argumentDefs: [],

  // ── Entities ──
  player:      null,
  tower:       null,
  enemies:     [],
  projectiles: [],
  xpOrbs:      [],
  hpOrbs:      [],

  // ── Stats (computed by UpgradeSystem.recomputeStats) ──
  stats: {},

  // ── Progress ──
  wave:           1,
  hp:             CONFIG.HP_BASE,
  xp:             0,
  xpThreshold:    CONFIG.XP_BASE_THRESHOLD,
  level:          1,
  totalDifficulty: 0,
  acquiredArgs:   {},  // { argId: level }

  // ── Timing ──
  lastTime:         0,
  downtimeRemaining: 0,
  pendingLevelUps:  0,
  arenaW: 0,
  arenaH: 0,

  // ── Pending upgrade state ──
  _pendingWeaponUpgradeDef: null,

  // ─────────────────────────────────────────────────────────────
  async init() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx    = this.canvas.getContext('2d');

    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());

    Input.init();
    UI.init();

    // Load all data files
    try {
      const [playerRes, enemyRes, argRes] = await Promise.all([
        fetch('data/player.json'),
        fetch('data/enemies.json'),
        fetch('data/arguments.json'),
      ]);
      this.playerData   = await playerRes.json();
      const enemyData   = await enemyRes.json();
      this.enemyDefs    = enemyData.enemies;
      const argData     = await argRes.json();
      this.argumentDefs = argData.arguments;
    } catch (e) {
      console.error('Failed to load data files. Make sure you are running a local server!', e);
      document.body.innerHTML = `<div style="color:#ff4444;font-family:monospace;padding:40px;font-size:18px;">
        ⚠ Could not load game data.<br><br>
        Run a local server to play:<br>
        <code style="color:#00ffaa">npx serve .</code><br>or<br>
        <code style="color:#00ffaa">python -m http.server 8080</code><br><br>
        Then open <code style="color:#00ffaa">http://localhost:8080</code>
      </div>`;
      return;
    }

    this._startNewGame();
    requestAnimationFrame(t => this._loop(t));
  },

  _resizeCanvas() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.arenaW = window.innerWidth  * CONFIG.ARENA_SCALE;
    this.arenaH = window.innerHeight * CONFIG.ARENA_SCALE;
    Camera.init(this.arenaW, this.arenaH, window.innerWidth, window.innerHeight);
  },

  _startNewGame() {
    this.wave     = 1;
    this.hp       = CONFIG.HP_BASE;
    this.xp       = 0;
    this.xpThreshold  = CONFIG.XP_BASE_THRESHOLD;
    this.level    = 1;
    this.totalDifficulty = 0;
    this.acquiredArgs    = {};
    this.pendingLevelUps = 0;
    this.waveKills  = 0;
    this.decoys     = [];
    this.enemies    = [];
    this.projectiles = [];
    this.xpOrbs    = [];
    this.hpOrbs    = [];
    this.waveModState = {};

    UpgradeSystem.recomputeStats();

    this.tower  = new Tower(this.arenaW / 2, this.arenaH / 2);
    this.player = new Player(
      this.arenaW / 2 + 100,
      this.arenaH / 2 + 100,
      this.playerData
    );

    // Add the starter gun
    this.tower.addWeapon(WeaponFactory.create('gun'));

    WaveManager.init();
    WaveModifiers.init();

    // First wave: add some grunts to get started
    WaveManager.applyEnemyUpgrade({
      type: 'add_enemy', enemyId: 'grunt', difficulty: 1
    });

    Camera.follow(this.player.x, this.player.y);
    UI.hideAll();
    this.state = 'playing';
    WaveManager.spawnWave();
  },

  restart() {
    UI.hideAll();
    this._startNewGame();
  },

  // ─────────────────────────────────────────────────────────────
  // MAIN LOOP
  // ─────────────────────────────────────────────────────────────
  _loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // cap at 50ms
    this.lastTime = timestamp;

    // Always update gameplay (player/enemies/projectiles) even during downtime
    if (this.state !== 'game_over') {
      this._updatePlaying(dt);
    }

    // Separate downtime timer (UI only)
    if (this.state === 'downtime') {
      this._updateDowntime(dt);
    }

    this._render();
    UI.updateHUD();
    Input.clearJustPressed();

    requestAnimationFrame(t => this._loop(t));
  },

  // ─────────────────────────────────────────────────────────────
  // PLAYING UPDATE
  // ─────────────────────────────────────────────────────────────
  _updatePlaying(dt) {
    // Player
    this.player.update(dt, this.arenaW, this.arenaH, this.enemies);

    // Camera
    Camera.follow(this.player.x, this.player.y);

    // Tower
    this.tower.update(dt, this.player, this.enemies);

    // Wave modifier effects
    WaveModifiers.update(dt);

    // ── Hermit's Shell regen ──
    if (this.stats.hermitsShellRegen > 0 && this.player.isInTowerRadius()) {
      this.heal(this.stats.hermitsShellRegen * dt);
    }

    // ── Static Tower buff tracking ──
    if (this.stats.hasStaticTower) {
      const inHalf = Utils.dist(
        this.player.x, this.player.y,
        this.tower.x,  this.tower.y
      ) <= this.stats.towerRechargeRadius * 0.5;

      if (inHalf && !this.player.dashing) {
        this.stats.staticTowerTimer = (this.stats.staticTowerTimer || 0) + dt;
        if (this.stats.staticTowerTimer >= CONFIG.STATIC_TOWER_THRESHOLD) {
          this.stats.staticTowerActive = true;
        }
      } else {
        this.stats.staticTowerTimer  = 0;
        this.stats.staticTowerActive = false;
      }
    }

    // ── XP Magnet Core — pull orbs toward tower when player is inside radius ──
    if (this.stats.hasXpMagnetCore && this.player.isInTowerRadius()) {
      for (const orb of this.xpOrbs) {
        if (!orb.magnetized) {
          const d = Utils.dist(orb.x, orb.y, this.tower.x, this.tower.y);
          if (d < this.stats.towerRechargeRadius * 2) {
            orb.magnetized = true;
          }
        }
      }
    }

    // ── Extra Eye: fire secondary weapons around player ──
    if (this.stats.hasExtraEye && this.tower) {
      this._updateExtraEye(dt);
    }

    // ── Draw decoys ──
    if (!this.decoys) this.decoys = [];
    for (const d of this.decoys) d.update(dt);
    this.decoys = this.decoys.filter(d => !d.dead);

    // Enemies
    for (const e of this.enemies) {
      if (!e.dead) {
        e.update(dt, this.player, this.tower, (typeId, x, y) => {
          WaveManager.spawnEnemy(typeId, x, y);
        });
      }
    }

    // Projectiles & particles
    for (const p of this.projectiles) p.update(dt);

    // Bullet collision (continuous): find first enemy intersected along the segment.
    for (const p of this.projectiles) {
      if (p.dead || !(p instanceof Projectile)) continue;
      let bestT = 1;
      let bestEnemy = null;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const t = Utils.segmentCircleClosestT(p.prevX, p.prevY, p.x, p.y, e.x, e.y, e.radius);
        if (t !== null && t < bestT) {
          bestT = t;
          bestEnemy = e;
        }
      }
      if (bestEnemy) {
        p.onHitEnemy(bestEnemy);
      }
    }

    Particles.update(dt);

    // Check projectile-explosive-tip triggers (rifle)
    for (const p of this.projectiles) {
      if (p._explosiveTip && p.dead && !p._exploded) {
        p._exploded = true;
        for (const e of this.enemies) {
          if (!e.dead && Utils.dist(p.x, p.y, e.x, e.y) <= p._explosionRadius + e.radius) {
            e.takeDamage(p.damage * 0.4);
          }
        }
        Particles.explosion(p.x, p.y, '#88ff44', p._explosionRadius);
      }
    }

    // Shotgun knockback
    for (const p of this.projectiles) {
      if (p._knockback && p.dead && !p._knockbackApplied) {
        p._knockbackApplied = true;
      }
    }

    // Afterburn trails (simple: mark enemies hit by afterburn bullets)
    for (const p of this.projectiles) {
      if (p.afterburn && !p.dead) {
        for (const e of this.enemies) {
          if (!e.dead && Utils.circleCollide(p.x, p.y, p.radius, e.x, e.y, e.radius)) {
            e.applyBurn(3, 2);
          }
        }
      }
    }

    // Cleanup dead projectiles
    this.projectiles = this.projectiles.filter(p => !p.dead);

    // XP orbs
    for (const orb of this.xpOrbs) orb.update(dt, this.player);
    this.xpOrbs = this.xpOrbs.filter(o => !o.dead);

    // HP orbs
    for (const orb of this.hpOrbs) orb.update(dt, this.player);
    this.hpOrbs = this.hpOrbs.filter(o => !o.dead);

    // Cleanup dead enemies
    this.enemies = this.enemies.filter(e => !e.dead);

    // ── Check pending level-ups ──
    if (this.pendingLevelUps > 0) {
      this.pendingLevelUps--;
      this._showLevelUpPicker();
      return;
    }

    // ── Check wave complete ──
    if (WaveModifiers.isWaveComplete() && this.state === 'playing') {
      this._onWaveComplete();
    }
  },

  // Extra Eye: mirror tower weapons centered on player at reduced effectiveness
  _extraEyeTimer: 0,
  _updateExtraEye(dt) {
    // Simple implementation: each tower weapon type fires a mirrored version
    // centered on the player, but only if player is within tower range
    const inRange = Utils.dist(
      this.player.x, this.player.y,
      this.tower.x,  this.tower.y
    ) <= this.stats.towerRangeMult * CONFIG.GUN_BASE_RANGE * 2;
    if (!inRange) return;
    // Handled per-weapon in weapon update — we pass an extra center via stats
    this.stats._extraEyeCenter = { x: this.player.x, y: this.player.y };
  },

  // ─────────────────────────────────────────────────────────────
  // WAVE COMPLETE
  // ─────────────────────────────────────────────────────────────
  _onWaveComplete() {
    this.state = 'enemy_upgrade';
    const options = WaveManager.generateEnemyUpgradeOptions();
    if (options.length === 0) {
      // No eligible enemy types to upgrade; continue.
      if (this.wave % 6 === 0) this._showWaveModifierPicker();
      else this._startDowntime();
      return;
    }
    UI.showEnemyUpgradePicker(options, (opt) => {
      WaveManager.applyEnemyUpgrade(opt);
      // Wave modifiers only appear every 6 waves and replace the previous one.
      if (this.wave % 6 === 0) {
        this._showWaveModifierPicker();
      } else {
        this._startDowntime();
      }
    });
  },

  _showWaveModifierPicker() {
    const options = WaveModifiers.generateOptions();
    if (options.length === 0) {
      this._startDowntime();
      return;
    }
    this.state = 'wave_modifier';
    UI.showWaveModifierPicker(options, (opt) => {
      WaveModifiers.setModifier(opt);
      this._startDowntime();
    });
  },

  _startDowntime() {
    this.state = 'downtime';
    this.downtimeRemaining = CONFIG.WAVE_DOWNTIME_SECONDS;
    UI.showDowntime(this.downtimeRemaining);
  },

  _updateDowntime(dt) {
    this.downtimeRemaining -= dt;
    UI.updateDowntime(this.downtimeRemaining);
    if (this.downtimeRemaining <= 0) {
      UI.hideDowntime();
      this.wave++;
      this.waveKills = 0;
      WaveManager.spawnWave();
      this.state = 'playing';
    }
  },

  // ─────────────────────────────────────────────────────────────
  // LEVEL UP PICKER
  // ─────────────────────────────────────────────────────────────
  _showLevelUpPicker() {
    this.state = 'level_up';
    const options = UpgradeSystem.pickOptions(CONFIG.LEVEL_UP_CHOICES);

    if (options.length === 0) {
      // No options available (shouldn't happen normally)
      this.state = 'playing';
      return;
    }

    UI.showUpgradePicker(options, (def) => {
      this._onUpgradePicked(def);
    });
  },

  _onUpgradePicked(def) {
    if (def.category === 'weapon_upgrade') {
      const compatSlots = UpgradeSystem.getCompatibleSlots(def.id);
      if (compatSlots.length === 1) {
        // Auto-apply if only one valid slot
        UpgradeSystem.applyWeaponUpgrade(def.id, compatSlots[0].index);
        this._finishLevelUp();
      } else if (compatSlots.length > 1) {
        // Show slot picker
        this._pendingWeaponUpgradeDef = def;
        this.state = 'slot_pick';
        UI.showSlotPicker(def, compatSlots, (slotIdx) => {
          UpgradeSystem.applyWeaponUpgrade(def.id, slotIdx);
          this._pendingWeaponUpgradeDef = null;
          this._finishLevelUp();
        });
      }
    } else {
      UpgradeSystem.applyArgument(def.id);
      this._finishLevelUp();
    }
  },

  _finishLevelUp() {
    // Check for more pending level-ups
    if (this.pendingLevelUps > 0) {
      this.pendingLevelUps--;
      this._showLevelUpPicker();
    } else {
      this.state = 'playing';
    }
  },

  // ─────────────────────────────────────────────────────────────
  // DAMAGE / HEAL
  // ─────────────────────────────────────────────────────────────
  takeDamage(amount) {
    if (this.hp <= 0) return;

    // Iron Will check
    if (this.stats.hasIronWill && !this.stats.ironWillUsed && this.hp - amount <= 0) {
      this.hp = 1;
      this.stats.ironWillUsed = true;
      return;
    }

    this.hp = Math.max(0, this.hp - amount);

    // Emergency Dash: reset dash cooldown on any damage
    if (this.stats.hasEmergencyDash && this.player) {
      this.player.dashCoolTimer = 0;
    }

    if (this.hp <= 0) this._gameOver();
  },

  heal(amount) {
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
  },

  addXP(amount) {
    this.xp += amount;
    XPSystem.onXPAdded();
  },

  // ─────────────────────────────────────────────────────────────
  // GAME OVER
  // ─────────────────────────────────────────────────────────────
  _gameOver() {
    this.state = 'game_over';
    UI.showGameOver();
  },

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  _render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;

    // ── Clear ──
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#3b372d';
    ctx.fillRect(0, 0, W, H);

    // ── Camera transform ──
    Camera.apply(ctx);

    // ── Arena background ──
    ctx.fillStyle = '#3f3a2f';
    ctx.fillRect(0, 0, this.arenaW, this.arenaH);

    // Hex grid pattern
    Utils.drawHexGrid(ctx, Camera.x, Camera.y, W, H, this.arenaW, this.arenaH);

    // Arena border
    ctx.strokeStyle = 'rgba(0, 200, 100, 0.2)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, this.arenaW, this.arenaH);

    // ── XP orbs ──
    for (const orb of this.xpOrbs) orb.draw(ctx);

    // ── HP orbs ──
    for (const orb of this.hpOrbs) orb.draw(ctx);

    // ── Particles ──
    Particles.draw(ctx);

    // ── Tower ──
    if (this.tower) this.tower.draw(ctx);

    // ── Projectiles (non-laser, non-tesla drawn here) ──
    for (const p of this.projectiles) {
      if (p instanceof TeslaArc) p.draw(ctx);
      else if (!(p instanceof FlameParticle)) p.draw(ctx);
    }

    // ── Flame particles (drawn last among projectiles for blending) ──
    for (const p of this.projectiles) {
      if (p instanceof FlameParticle) p.draw(ctx);
    }

    // ── Enemies ──
    for (const e of this.enemies) e.draw(ctx);

    // ── Decoys (phantom afterimage) ──
    if (this.decoys) {
      for (const d of this.decoys) d.draw(ctx);
    }

    // ── Wave modifier FX (toxic pools, etc.) ──
    WaveModifiers.draw(ctx);

    // ── Player ──
    if (this.player) this.player.draw(ctx);

    // ── Restore camera ──
    Camera.restore(ctx);

    // ── Dead flash overlay ──
    if (this.hp > 0) {
      const hpPct = this.hp / this.stats.maxHp;
      if (hpPct < 0.25) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
        ctx.fillStyle = `rgba(255, 0, 0, ${0.08 * pulse})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }
};

// ── Boot ────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => Game.init());
