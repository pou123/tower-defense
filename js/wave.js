// ==============================================================
// WAVE.JS — Wave spawning, enemy upgrade generation
// ==============================================================

const WaveManager = {
  // Accumulated wave composition: { enemyId: count }
  composition: {},

  // Accumulated enemy buffs: { enemyId: { hpMult, speedMult, damageMult } }
  buffs: {},

  // Total difficulty (sum of all picked upgrade difficulty levels)
  totalDifficulty: 0,

  init() {
    this.composition = {};
    this.buffs = {};
    this.totalDifficulty = 0;
  },

  // Ensure buff entry exists for enemy type
  _ensureBuff(enemyId) {
    if (!this.buffs[enemyId]) {
      this.buffs[enemyId] = { hpMult: 1, speedMult: 1, damageMult: 1 };
    }
  },

  // Apply picked enemy upgrade and add its difficulty to total
  applyEnemyUpgrade(upgrade) {
    this.totalDifficulty += upgrade.difficulty;
    Game.totalDifficulty = this.totalDifficulty;

    switch (upgrade.type) {
      case 'add_enemy': {
        const def = Game.enemyDefs.find(e => e.id === upgrade.enemyId);
        if (!def) break;
        const count = def.amountPerDifficultyLevel * upgrade.difficulty;
        this.composition[upgrade.enemyId] = (this.composition[upgrade.enemyId] || 0) + count;
        break;
      }
      case 'buff_hp': {
        this._ensureBuff(upgrade.enemyId);
        this.buffs[upgrade.enemyId].hpMult += 0.20 * upgrade.difficulty;
        break;
      }
      case 'buff_speed': {
        this._ensureBuff(upgrade.enemyId);
        this.buffs[upgrade.enemyId].speedMult += 0.10 * upgrade.difficulty;
        break;
      }
      case 'buff_damage': {
        this._ensureBuff(upgrade.enemyId);
        this.buffs[upgrade.enemyId].damageMult += 0.15 * upgrade.difficulty;
        break;
      }
    }
  },

  // Spawn the current wave
  spawnWave() {
    Game.enemies = [];

    const ms = Game.waveModState || {};
    const countMult  = ms.spawnCountMult  || 1;
    const hpMult     = ms.hpMult          || 1;
    const speedMult  = ms.speedMult       || 1;
    const damageMult = ms.damageMult      || 1;
    const dmgResist  = ms.dmgResist       || 0;

    const spawnList = [];
    for (const [enemyId, count] of Object.entries(this.composition)) {
      const finalCount = Math.round(count * countMult);
      for (let i = 0; i < finalCount; i++) spawnList.push(enemyId);
    }

    const shuffled = Utils.shuffle(spawnList);
    for (const enemyId of shuffled) {
      const pos = this._randomSpawnPos();
      const e   = this.spawnEnemy(enemyId, pos.x, pos.y);
      if (e) {
        e.maxHp     *= hpMult;
        e.hp         = e.maxHp;
        e.speed     *= speedMult;
        e.damage    *= damageMult;
        e._dmgResist = dmgResist;
      }
    }

    // Elite Arrival: spawn 2 buffed elites
    if (ms.eliteArrival) {
      const heaviest = [...Game.enemyDefs].sort((a, b) => b.hp - a.hp)[0];
      for (let i = 0; i < 2; i++) {
        const pos = this._randomSpawnPos();
        const e   = this.spawnEnemy(heaviest.id, pos.x, pos.y);
        if (e) {
          e.maxHp  *= 8;   e.hp     = e.maxHp;
          e.damage *= 3;   e.speed  *= 0.7;
          e.radius *= 1.5; e.color   = '#ffdd00';
          e.glowColor = '#ffffaa';
        }
      }
    }
  },

  // Spawn a single enemy by ID at position (used by summoners too)
  spawnEnemy(enemyId, x, y) {
    const def = Game.enemyDefs.find(e => e.id === enemyId);
    if (!def) { console.warn(`No enemy definition for: ${enemyId}`); return; }
    const e = new Enemy(x, y, def, this.buffs);
    Game.enemies.push(e);
    return e;
  },

  _randomSpawnPos() {
    const margin = CONFIG.ENEMY_SPAWN_MARGIN;
    // Pick a random edge (0=top,1=right,2=bottom,3=left) or random off-screen pos
    // We want it far from tower center AND off-screen (or at arena edge)
    let attempts = 0, x, y;
    do {
      const side = Utils.randInt(0, 3);
      switch (side) {
        case 0: x = Utils.randFloat(0, Game.arenaW);  y = -margin; break;
        case 1: x = Game.arenaW + margin;              y = Utils.randFloat(0, Game.arenaH); break;
        case 2: x = Utils.randFloat(0, Game.arenaW);  y = Game.arenaH + margin; break;
        case 3: x = -margin;                           y = Utils.randFloat(0, Game.arenaH); break;
      }
      // Clamp to inside arena, at edges
      x = Utils.clamp(x, 0, Game.arenaW);
      y = Utils.clamp(y, 0, Game.arenaH);
      attempts++;
    } while (
      Utils.dist(x, y, Game.tower.x, Game.tower.y) < CONFIG.ENEMY_MIN_SPAWN_DIST &&
      attempts < 20
    );
    return { x, y };
  },

  isWaveComplete() {
    if (Object.keys(this.composition).length === 0) return false;
    return Game.enemies.every(e => e.dead);
  },

  // Generate 3 random enemy upgrade options for the end-of-wave picker
  generateEnemyUpgradeOptions() {
    const defs = Game.enemyDefs.filter(d => this.composition[d.id] > 0);
    const types = ['add_enemy', 'buff_hp', 'buff_speed', 'buff_damage'];
    const options = [];

    // Ensure we have at least 3 distinct options
    let attempts = 0;
    while (options.length < CONFIG.ENEMY_UPGRADE_CHOICES && attempts < 40) {
      attempts++;
      const difficulty = Utils.randInt(1, 3);
      const upgradeType = Utils.randFrom(types);
      const def = Utils.randFrom(defs);

      const key = `${upgradeType}_${def.id}_${difficulty}`;
      if (options.some(o => o.key === key)) continue;

      let label = '';
      let desc  = '';
      switch (upgradeType) {
        case 'add_enemy': {
          const count = def.amountPerDifficultyLevel * difficulty;
          label = `+${count} ${def.name}${count > 1 ? 's' : ''}`;
          desc  = `Adds ${count} ${def.name}(s) to every future wave`;
          break;
        }
        case 'buff_hp':
          label = `${def.name} +${(20 * difficulty)}% HP`;
          desc  = `All ${def.name}s gain ${20 * difficulty}% more health`;
          break;
        case 'buff_speed':
          label = `${def.name} +${(10 * difficulty)}% Speed`;
          desc  = `All ${def.name}s move ${10 * difficulty}% faster`;
          break;
        case 'buff_damage':
          label = `${def.name} +${(15 * difficulty)}% Damage`;
          desc  = `All ${def.name}s deal ${15 * difficulty}% more damage`;
          break;
      }

      options.push({
        key,
        type: upgradeType,
        enemyId: def.id,
        difficulty,
        label,
        desc,
        color: def.color,
        glowColor: def.glowColor || def.color
      });
    }

    return options;
  }
};
