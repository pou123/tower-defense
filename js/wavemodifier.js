// ==============================================================
// WAVEMODIFIER.JS — Wave modifier generation, application, rendering
// ==============================================================

const WaveModifiers = {
  // All modifier definitions
  definitions: [
    {
      id: 'dense_swarm',
      name: 'Dense Swarm',
      desc: 'Enemy count +60%',
      drawback: 'Enemy HP −30%',
      color: '#ff6644',
      apply(enemies) {
        // spawn 60% more of each type  (handled in spawnWave)
        Game.waveModState.spawnCountMult = (Game.waveModState.spawnCountMult || 1) + 0.6;
        Game.waveModState.hpMult         = (Game.waveModState.hpMult || 1) * 0.7;
      }
    },
    {
      id: 'juggernauts',
      name: 'Juggernauts',
      desc: 'Enemy count −70%, HP +400%',
      drawback: 'Enemy speed −40%',
      color: '#cc4422',
      apply() {
        Game.waveModState.spawnCountMult = (Game.waveModState.spawnCountMult || 1) * 0.3;
        Game.waveModState.hpMult         = (Game.waveModState.hpMult || 1) * 5.0;
        Game.waveModState.speedMult      = (Game.waveModState.speedMult || 1) * 0.6;
      }
    },
    {
      id: 'frenzy',
      name: 'Frenzy',
      desc: 'Enemy speed +50%',
      drawback: 'Enemy HP −20%',
      color: '#ffaa00',
      apply() {
        Game.waveModState.speedMult = (Game.waveModState.speedMult || 1) * 1.5;
        Game.waveModState.hpMult    = (Game.waveModState.hpMult || 1) * 0.8;
      }
    },
    {
      id: 'reinforced',
      name: 'Reinforced',
      desc: 'Enemies take 25% less damage',
      drawback: 'Enemy speed −10%',
      color: '#8888ff',
      apply() {
        Game.waveModState.dmgResist = (Game.waveModState.dmgResist || 0) + 0.25;
        Game.waveModState.speedMult = (Game.waveModState.speedMult || 1) * 0.9;
      }
    },
    {
      id: 'berserk',
      name: 'Berserk',
      desc: 'Enemy contact damage +100%',
      drawback: 'Enemy HP −25%',
      color: '#ff2244',
      apply() {
        Game.waveModState.damageMult = (Game.waveModState.damageMult || 1) * 2.0;
        Game.waveModState.hpMult     = (Game.waveModState.hpMult || 1) * 0.75;
      }
    },
    {
      id: 'endless_tide',
      name: 'Endless Tide',
      desc: 'Enemies spawn continuously until kill target reached',
      drawback: 'Enemy speed −20%',
      color: '#44aaff',
      apply() {
        Game.waveModState.endlessTide  = true;
        Game.waveModState.speedMult    = (Game.waveModState.speedMult || 1) * 0.8;
        // Kill target: normal wave size * multiplier
        const base = Object.values(WaveManager.composition)
          .reduce((a, b) => a + b, 0) || 10;
        Game.waveModState.endlessTideKillTarget =
          Math.ceil(base * CONFIG.ENDLESS_TIDE_KILL_TARGET_MULT);
        Game.waveModState.endlessTideKills  = 0;
        Game.waveModState.endlessTideSpawnTimer = 0;
      }
    },
    {
      id: 'storm_front',
      name: 'Storm Front',
      desc: 'Random lightning strikes hit random enemies',
      drawback: 'Enemy HP −15%',
      color: '#aaaaff',
      apply() {
        Game.waveModState.stormFront   = true;
        Game.waveModState.stormTimer   = 0;
        Game.waveModState.hpMult       = (Game.waveModState.hpMult || 1) * 0.85;
      }
    },
    {
      id: 'toxic_battlefield',
      name: 'Toxic Battlefield',
      desc: 'Enemies leave damage pools on death',
      drawback: 'Enemy speed −20%',
      color: '#44ff88',
      apply() {
        Game.waveModState.toxicBattlefield = true;
        Game.waveModState.speedMult        = (Game.waveModState.speedMult || 1) * 0.8;
      }
    },
    {
      id: 'elite_arrival',
      name: 'Elite Arrival',
      desc: '2 elite enemies with massive HP and damage appear',
      drawback: 'All other enemies −30% speed',
      color: '#ffdd00',
      apply() {
        Game.waveModState.eliteArrival = true;
        Game.waveModState.speedMult    = (Game.waveModState.speedMult || 1) * 0.7;
      }
    }
  ],

  // Active modifiers for current wave
  active: [],

  init() {
    this.active = [];
    Game.waveModState = this._freshState();
  },

  _freshState() {
    return {
      spawnCountMult: 1, hpMult: 1, speedMult: 1,
      damageMult: 1, dmgResist: 0,
      endlessTide: false, endlessTideKillTarget: 0,
      endlessTideKills: 0, endlessTideSpawnTimer: 0,
      stormFront: false, stormTimer: 0,
      toxicBattlefield: false,
      eliteArrival: false,
      toxicPools: []
    };
  },

  resetForWave() {
    // Clears any active modifier (used when starting a fresh game)
    this.active = [];
    Game.waveModState = this._freshState();
  },

  // Set the current active modifier (replaces any previous modifier)
  setModifier(def) {
    this.active = [def];
    Game.waveModState = this._freshState();
    def.apply();
  },

  // Generate pick options (no duplicates of what's in active)
  generateOptions() {
    const available = this.definitions.filter(
      d => !this.active.some(a => a.id === d.id)
    );
    return Utils.pickN(available, CONFIG.WAVE_MODIFIER_CHOICES);
  },

  applyModifier(def) {
    this.active.push(def);
    def.apply();
  },

  // Called each frame during playing state
  update(dt) {
    const ms = Game.waveModState;

    // Storm Front: lightning every 2–3s
    if (ms.stormFront && Game.enemies.length > 0) {
      ms.stormTimer -= dt;
      if (ms.stormTimer <= 0) {
        ms.stormTimer = Utils.randFloat(1.5, 3.0);
        const target = Utils.randFrom(Game.enemies.filter(e => !e.dead));
        if (target) {
          target.takeDamage(target.maxHp * 0.12);
          Particles.explosion(target.x, target.y, '#aaaaff', 30);
        }
      }
    }

    // Toxic pools: damage players/enemies in pool
    if (ms.toxicBattlefield && ms.toxicPools) {
      for (const pool of ms.toxicPools) {
        pool.life -= dt;
        for (const e of Game.enemies) {
          if (!e.dead && Utils.dist(pool.x, pool.y, e.x, e.y) < pool.radius) {
            e.takeDamage(8 * dt);
          }
        }
      }
      ms.toxicPools = ms.toxicPools.filter(p => p.life > 0);
    }

    // Endless tide: spawn enemies while alive count is low
    if (ms.endlessTide) {
      ms.endlessTideKills = Game.waveKills || 0;
      if (ms.endlessTideKills < ms.endlessTideKillTarget) {
        ms.endlessTideSpawnTimer -= dt;
        if (ms.endlessTideSpawnTimer <= 0 && Game.enemies.filter(e=>!e.dead).length < 20) {
          ms.endlessTideSpawnTimer = 1.5;
          const types = Object.keys(WaveManager.composition);
          if (types.length > 0) {
            const typeId = Utils.randFrom(types);
            const pos = WaveManager._randomSpawnPos();
            WaveManager.spawnEnemy(typeId, pos.x, pos.y);
          }
        }
      }
    }
  },

  // Called when an enemy dies during a modified wave
  onEnemyDeath(enemy) {
    const ms = Game.waveModState;

    if (ms.toxicBattlefield) {
      ms.toxicPools.push({
        x: enemy.x, y: enemy.y,
        radius: enemy.radius * 2.5 + 20,
        life: 5.0
      });
    }

    if (ms.endlessTide) {
      Game.waveKills = (Game.waveKills || 0) + 1;
    }
  },

  // Is the wave actually complete given modifiers?
  isWaveComplete() {
    const ms = Game.waveModState;
    if (ms.endlessTide) {
      return (Game.waveKills || 0) >= ms.endlessTideKillTarget &&
             Game.enemies.every(e => e.dead);
    }
    return WaveManager.isWaveComplete();
  },

  // Draw toxic pools and storm effects
  draw(ctx) {
    const ms = Game.waveModState;
    if (ms.toxicBattlefield && ms.toxicPools) {
      for (const pool of ms.toxicPools) {
        const alpha = (pool.life / 5.0) * 0.4;
        ctx.beginPath();
        ctx.arc(pool.x, pool.y, pool.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(50, 255, 100, ${alpha})`;
        ctx.fill();
      }
    }
  }
};
