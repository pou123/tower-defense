// ==============================================================
// UPGRADES.JS — Argument registry, effect application, pool
// ==============================================================

const UpgradeSystem = {

  // ── Effect registry: what each argument does when applied ────
  effects: {

    fanatic(game, level) {
      game.stats.xpMultiplier *= 1.5;
    },
    collector(game, level) {
      game.stats.xpRadius *= 3;
    },
    farsight(game, level) {
      game.stats.towerRangeMult += 0.15;
    },
    heavy_bullets(game, level) {
      game.stats.towerDmgMult += 0.20;
    },
    massive(game, level) {
      game.stats.maxHp += 25;
      game.hp = Math.min(game.hp + 25, game.stats.maxHp);
    },
    energized(game, level) {
      game.stats.towerEnergyMax += 20;
    },
    solar_panels(game, level) {
      game.stats.hasSolarPanels = true;
    },
    swift(game, level) {
      game.stats.playerSpeed *= 1.15;
    },
    scavenger(game, level) {
      game.stats.hasScavenger = true;
    },
    iron_will(game, level) {
      game.stats.hasIronWill = true;
    },
    anchor(game, level) {
      game.stats.anchorBonus += 0.05;
    },
    slipstream(game, level) {
      game.stats.hasSlipstream = true;
    },
    voltaic(game, level) {
      game.stats.hasVoltaic = true;
      game.stats.dashDamage = (game.playerData.dashDamage || 20) * 1;
    },
    overclock(game, level) {
      game.stats.overclock = true;
    },
    ghost_step(game, level) {
      game.stats.dashCooldown = 1.0;
      game.stats.dashDuration = game.playerData.dashDuration * 1.5;
    },
    emergency_protocol(game, level) {
      game.stats.hasEmergencyProtocol = true;
    },
    overcharge(game, level) {
      game.stats.hasOvercharge = true;
      game.stats.overchargeLevels += 1;
    },
    bulwark(game, level) {
      game.stats.bulwarkLevel += 1;
    },
    emergency_dash(game) {
      game.stats.hasEmergencyDash = true;
    },
    kinetic_rebound(game) {
      game.stats.hasKineticRebound = true;
    },
    momentum_harvest(game) {
      game.stats.hasMomentumHarvest = true;
    },
    blood_converter(game) {
      game.stats.hasBloodConverter = true;
    },
    hermits_shell(game, level) {
      game.stats.hermitsShellRegen += CONFIG.HERMITS_SHELL_REGEN;
    },
    home_soil(game, level) {
      game.stats.homeSoilBonus += CONFIG.HOME_SOIL_BONUS;
    },
    static_tower(game) {
      game.stats.hasStaticTower = true;
    },
    phantom_afterimage(game) {
      game.stats.hasPhantomAfterimage = true;
    },
    xp_magnet_core(game) {
      game.stats.hasXpMagnetCore = true;
    },
    stabilizer_core(game, level) {
      game.stats.stabilizerBonus += 0.15;
    },
    extra_eye(game) {
      game.stats.hasExtraEye = true;
    },
    drone_swarm(game)         { game.stats.droneExtraCount = (game.stats.droneExtraCount||0)+1; },
    drone_reinforcement(game) { game.stats.droneExtraHp    = (game.stats.droneExtraHp||0)+20; },
    drone_arsenal(game)       { game.stats.droneDmgMult    = (game.stats.droneDmgMult||0)+0.25; },
    drone_overclock(game)     { game.stats.droneFireRateMult=(game.stats.droneFireRateMult||0)+0.20; },
    drone_guard(game)         { game.stats.hasDroneGuard   = true; },
    drone_efficiency(game)    { game.stats.droneRespawnMult=(game.stats.droneRespawnMult||0)+0.25; },

    // Weapons: just add a weapon to the tower
    weapon_gun(game)          { game.tower.addWeapon(WeaponFactory.create('gun')); },
    weapon_shotgun(game)      { game.tower.addWeapon(WeaponFactory.create('shotgun')); },
    weapon_rifle(game)        { game.tower.addWeapon(WeaponFactory.create('rifle')); },
    weapon_sniper(game)       { game.tower.addWeapon(WeaponFactory.create('sniper')); },
    weapon_mortar(game)       { game.tower.addWeapon(WeaponFactory.create('mortar')); },
    weapon_missile(game)      { game.tower.addWeapon(WeaponFactory.create('missile')); },
    weapon_flamethrower(game) { game.tower.addWeapon(WeaponFactory.create('flamethrower')); },
    weapon_tesla(game)        { game.tower.addWeapon(WeaponFactory.create('tesla')); },
    weapon_laser(game)        { game.tower.addWeapon(WeaponFactory.create('laser')); },

    // Weapon-specific upgrades are applied after slot selection
    // (handled separately via applyWeaponUpgrade)
  },

  // ── Recompute all stats from scratch (base + acquired levels) ──
  // Called on init and after each pick to keep stats consistent
  recomputeStats() {
    const g = Game;
    const pd = g.playerData;

    // Reset to base
    g.stats = {
      // Player
      playerSpeed:     pd.baseSpeed,
      dashDistMult:    pd.dashDistanceMultiplier,
      dashDuration:    pd.dashDuration,
      dashCooldown:    pd.dashCooldown,
      xpRadius:        pd.xpPickupRadius,
      dashDamage:      pd.dashDamage || 20,

      // Tower
      maxHp:              CONFIG.HP_BASE,
      towerDmgReduction:  CONFIG.TOWER_DMG_MULTIPLIER,
      towerRangeMult:     1,
      towerDmgMult:       1,
      towerWeaponSlots:   CONFIG.TOWER_WEAPON_SLOTS,
      towerRechargeRadius: CONFIG.TOWER_RECHARGE_RADIUS,
      towerEnergyMax:     CONFIG.TOWER_ENERGY_MAX,
      energyDrainRate:    CONFIG.TOWER_ENERGY_DRAIN,
      energyChargeRate:   CONFIG.TOWER_ENERGY_CHARGE,
      solarPanelRate:     0.25,

      // XP
      xpMultiplier: 1,

      // Flags & counters
      overclock:           false,
      hasSlipstream:       false,
      hasVoltaic:          false,
      hasScavenger:        false,
      hasIronWill:         false,
      ironWillUsed:        false,
      hasSolarPanels:      false,
      hasEmergencyProtocol: false,
      emergencyUsed:        false,
      hasOvercharge:       false,
      overchargeLevels:    0,
      bulwarkLevel:        0,
      anchorBonus:         0,

      // New augments
      hasEmergencyDash:    false,
      hasKineticRebound:   false,
      hasMomentumHarvest:  false,
      hasBloodConverter:   false,
      hermitsShellRegen:   0,
      homeSoilBonus:       0,
      hasStaticTower:      false,
      staticTowerTimer:    0,
      staticTowerActive:   false,
      hasPhantomAfterimage: false,
      hasXpMagnetCore:     false,
      stabilizerBonus:     0,
      hasExtraEye:         false,

      // Drones
      droneExtraCount:     0,
      droneExtraHp:        0,
      droneDmgMult:        0,
      droneFireRateMult:   0,
      hasDroneGuard:       false,
      droneRespawnMult:    0,
    };

    // Re-apply all acquired general/weapon-tree arguments
    for (const [argId, level] of Object.entries(g.acquiredArgs)) {
      const def = g.argumentDefs.find(a => a.id === argId);
      if (!def) continue;
      if (def.category === 'weapon_upgrade') continue; // handled per-weapon
      if (def.category === 'weapon') continue;         // weapons already in tower
      const fn = this.effects[argId];
      if (fn) {
        for (let i = 0; i < level; i++) fn(g, i + 1);
      }
    }

    // Clamp HP to new max
    g.hp = Math.min(g.hp, g.stats.maxHp);
  },

  // ── Build the pick pool for a level-up ───────────────────────
  buildLevelUpPool() {
    const pool = [];
    const defs = Game.argumentDefs;

    for (const def of defs) {
      if (this._isAvailable(def)) {
        pool.push(def);
      }
    }
    return pool;
  },

  _isAvailable(def) {
    const acquired = Game.acquiredArgs[def.id] || 0;

    // Already maxed (finite max)?
    if (def.maxLevel !== 999 && acquired >= def.maxLevel) return false;

    // Weapon slots full: don't offer more weapons if all slots taken
    if (def.category === 'weapon') {
      if (Game.tower.weapons.length >= Game.stats.towerWeaponSlots) return false;
    }

    // Check prerequisites
    for (const prereq of (def.prerequisites || [])) {
      // prereq is a weapon_* id; check if at least one of that weapon type in tower
      const prereqDef = Game.argumentDefs.find(a => a.id === prereq);
      if (!prereqDef) continue;
      if (prereqDef.category === 'weapon') {
        const type = prereqDef.weaponType;
        if (!Game.tower.weapons.some(w => w && w.type === type)) return false;
      } else {
        if (!(Game.acquiredArgs[prereq] > 0)) return false;
      }
    }

    // Weapon upgrades: must have at least one compatible weapon in the tower
    if (def.category === 'weapon_upgrade') {
      const compatWeapons = (def.appliesToWeapons || []);
      const hasCompat = Game.tower.weapons.some(w => w && compatWeapons.includes(w.type));
      if (!hasCompat) return false;

      // Check per-slot max (each slot can only have this upgrade once)
      // Count how many compatible slots still don't have this upgrade
      const slotsWithoutUpgrade = Game.tower.weapons.filter(
        w => w && compatWeapons.includes(w.type) && !w.hasUpgrade(def.id)
      ).length;
      if (slotsWithoutUpgrade === 0) return false;
    }

    return true;
  },

  // Apply a general/weapon-tree argument pick
  applyArgument(argId) {
    const def = Game.argumentDefs.find(a => a.id === argId);
    if (!def) return;

    if (def.category === 'weapon') {
      // Add weapon to tower; record acquisition
      const fn = this.effects[argId];
      if (fn) fn(Game);
      Game.acquiredArgs[argId] = (Game.acquiredArgs[argId] || 0) + 1;

    } else if (def.category === 'weapon_upgrade') {
      // Handled via applyWeaponUpgrade after slot selection
      // This path shouldn't be hit directly

    } else {
      // General upgrade: record and recompute
      Game.acquiredArgs[argId] = (Game.acquiredArgs[argId] || 0) + 1;
      this.recomputeStats();
    }
  },

  // Apply a weapon-specific upgrade to a specific weapon slot
  applyWeaponUpgrade(argId, weaponSlotIndex) {
    const weapon = Game.tower.getWeaponBySlot(weaponSlotIndex);
    if (!weapon) return;
    weapon.addUpgrade(argId);
    // Record in acquiredArgs per-slot tracking for duplicate filtering
    const key = `${argId}__slot${weaponSlotIndex}`;
    Game.acquiredArgs[key] = 1;
  },

  // Get compatible weapon slots for a weapon upgrade
  getCompatibleSlots(argId) {
    const def = Game.argumentDefs.find(a => a.id === argId);
    if (!def || !def.appliesToWeapons) return [];
    return Game.tower.weapons
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => w && def.appliesToWeapons.includes(w.type) && !w.hasUpgrade(argId))
      .map(({ w, i }) => ({ index: i, type: w.type, weapon: w }));
  },

  // Pick N random options from the pool (deduplicated)
  pickOptions(count) {
    const pool = this.buildLevelUpPool();
    return Utils.pickN(pool, count);
  }
};
