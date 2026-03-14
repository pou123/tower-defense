// ==============================================================
// UI.JS — HUD rendering and overlay management
// ==============================================================

const UI = {
  // DOM element cache
  els: {},

  init() {
    this.els = {
      hud:                document.getElementById('hud'),
      hpFill:             document.getElementById('hp-fill'),
      hpText:             document.getElementById('hp-text'),
      energyFill:         document.getElementById('energy-fill'),
      energyText:         document.getElementById('energy-text'),
      xpFill:             document.getElementById('xp-fill'),
      xpText:             document.getElementById('xp-text'),
      waveNum:            document.getElementById('wave-num'),
      levelNum:           document.getElementById('level-num'),
      dashIndicator:      document.getElementById('dash-indicator'),

      upgradeOverlay:     document.getElementById('upgrade-overlay'),
      upgradeTitle:       document.getElementById('upgrade-title'),
      upgradeCards:       document.getElementById('upgrade-cards'),

      weaponSlotPicker:   document.getElementById('slot-picker'),
      slotPickerTitle:    document.getElementById('slot-picker-title'),
      slotPickerCards:    document.getElementById('slot-picker-cards'),

      enemyUpgradeOverlay: document.getElementById('enemy-upgrade-overlay'),
      enemyUpgradeCards:   document.getElementById('enemy-upgrade-cards'),

      waveModOverlay:      document.getElementById('wave-mod-overlay'),
      waveModCards:        document.getElementById('wave-mod-cards'),

      downtimeOverlay:    document.getElementById('downtime-overlay'),
      downtimeTimer:      document.getElementById('downtime-count'),

      gameOverOverlay:    document.getElementById('game-over-overlay'),
      gameOverWave:       document.getElementById('game-over-wave'),
      gameOverLevel:      document.getElementById('game-over-level'),
      restartBtn:         document.getElementById('restart-btn'),
    };

    this.els.restartBtn.addEventListener('click', () => {
      if (typeof Game !== 'undefined') Game.restart();
    });
  },

  updateHUD() {
    const g = Game;
    const hpPct     = Utils.clamp(g.hp / g.stats.maxHp, 0, 1) * 100;
    const energyPct = Utils.clamp(g.tower.energy / g.stats.towerEnergyMax, 0, 1) * 100;
    const xpPct     = Utils.clamp(g.xp / g.xpThreshold, 0, 1) * 100;
    const dashPct   = g.player
      ? Utils.clamp(1 - g.player.dashCoolTimer / g.stats.dashCooldown, 0, 1) * 100
      : 100;

    this.els.hpFill.style.width     = hpPct + '%';
    this.els.hpText.textContent     = `HP  ${Math.ceil(g.hp)} / ${g.stats.maxHp}`;
    this.els.energyFill.style.width = energyPct + '%';
    this.els.energyText.textContent = `PWR ${Math.floor(g.tower.energy)} / ${g.stats.towerEnergyMax}`;
    this.els.xpFill.style.width     = xpPct + '%';
    this.els.xpText.textContent     = `XP  ${Math.floor(g.xp)} / ${g.xpThreshold}  LVL ${g.level}`;
    this.els.waveNum.textContent    = `WAVE ${g.wave}`;
    this.els.dashIndicator.style.width = dashPct + '%';
    this.els.hpFill.style.background =
      hpPct > 50 ? '#00ff88' : hpPct > 25 ? '#ffaa00' : '#ff3333';

    // Color energy bar
    this.els.energyFill.style.background =
      energyPct > 50 ? '#00aaff' : energyPct > 20 ? '#ffaa00' : '#ff4400';

    // ── Weapon slots panel ──
    this._updateWeaponSlots();

    // ── Active modifier badges ──
    this._updateModifierBadges();

    // ── Endless tide kill bar ──
    const ms = g.waveModState || {};
    const endlessBar  = document.getElementById('endless-tide-bar');
    const endlessFill = document.getElementById('endless-fill');
    const endlessText = document.getElementById('endless-text');
    if (endlessBar) {
      if (ms.endlessTide) {
        endlessBar.classList.add('visible');
        const kills  = ms.endlessTideKills  || 0;
        const target = ms.endlessTideKillTarget || 1;
        endlessFill.style.width = Utils.clamp(kills / target, 0, 1) * 100 + '%';
        endlessText.textContent = `KILLS ${kills} / ${target}`;
      } else {
        endlessBar.classList.remove('visible');
      }
    }
  },

  _updateModifierBadges() {
    const el = document.getElementById('active-modifiers');
    if (!el) return;
    const mods = (typeof WaveModifiers !== 'undefined') ? WaveModifiers.active : [];
    el.innerHTML = mods.map(m =>
      `<span class="modifier-badge" style="color:${m.color};border-color:${m.color}40">${m.name}</span>`
    ).join('');
  },

  _weaponIconMap: {
    gun: '🔫', shotgun: '⦿', rifle: '━', sniper: '✕',
    mortar: '◉', missile: '▲', flamethrower: '🔥',
    tesla: '⚡', laser: '◍', pulse: '◎', drones: '⬡'
  },

  _updateWeaponSlots() {
    const panel = document.getElementById('weapon-slots');
    if (!panel || !Game.tower) return;
    const weapons = Game.tower.weapons;
    const slots   = Game.stats.towerWeaponSlots || 4;
    panel.innerHTML = '';
    for (let i = 0; i < slots; i++) {
      const w   = weapons[i];
      const div = document.createElement('div');
      div.className = `weapon-slot ${w ? 'filled' : 'empty'}`;
      if (w) {
        div.innerHTML = `
          <span class="ws-icon">${this._weaponIconMap[w.type] || '?'}</span>
          <span class="ws-name">${w.type.toUpperCase()}</span>
        `;
      } else {
        div.innerHTML = `<span class="ws-icon" style="opacity:.3">○</span>`;
      }
      panel.appendChild(div);
    }
  },

  // ── Upgrade overlay (level-up picks) ──────────────────────────
  showUpgradePicker(options, onPick) {
    this.els.upgradeTitle.textContent = `LEVEL ${Game.level} — Choose an Upgrade`;
    this.els.upgradeCards.innerHTML = '';

    for (const def of options) {
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      const categoryLabel = def.category === 'weapon' ? 'WEAPON'
                          : def.category === 'weapon_upgrade' ? 'WEAPON MOD'
                          : 'UPGRADE';
      const currentLvl = Game.acquiredArgs[def.id] || 0;
      const lvlLabel = def.maxLevel === 1 ? '' : def.maxLevel === 999
        ? ` <span class="level-badge">LVL ${currentLvl + 1}</span>`
        : ` <span class="level-badge">${currentLvl + 1} / ${def.maxLevel}</span>`;

      card.innerHTML = `
        <div class="card-category">${categoryLabel}</div>
        <div class="card-icon">${def.icon || '?'}</div>
        <div class="card-name">${def.name}${lvlLabel}</div>
        <div class="card-desc">${def.description}</div>
      `;
      card.addEventListener('click', () => {
        onPick(def);
        this.hideUpgradePicker();
      });
      this.els.upgradeCards.appendChild(card);
    }

    this.els.upgradeOverlay.classList.remove('hidden');
  },

  hideUpgradePicker() {
    this.els.upgradeOverlay.classList.add('hidden');
  },

  // ── Weapon slot picker (for weapon upgrades) ─────────────────
  showSlotPicker(argDef, compatSlots, onPick) {
    this.els.slotPickerTitle.textContent = `Apply "${argDef.name}" to which weapon?`;
    this.els.slotPickerCards.innerHTML = '';

    const weaponNames = {
      gun: 'Gun', shotgun: 'Shotgun', rifle: 'Rifle', sniper: 'Sniper',
      mortar: 'Mortar', missile: 'Missile', flamethrower: 'Flamethrower',
      tesla: 'Tesla Coil', laser: 'Laser'
    };

    for (const slot of compatSlots) {
      const card = document.createElement('div');
      card.className = 'upgrade-card slot-card';
      card.innerHTML = `
        <div class="card-category">SLOT ${slot.index + 1}</div>
        <div class="card-name">${weaponNames[slot.type] || slot.type}</div>
        <div class="card-desc">Apply to this weapon slot</div>
      `;
      card.addEventListener('click', () => {
        onPick(slot.index);
        this.hideSlotPicker();
      });
      this.els.slotPickerCards.appendChild(card);
    }

    this.els.weaponSlotPicker.classList.remove('hidden');
  },

  hideSlotPicker() {
    this.els.weaponSlotPicker.classList.add('hidden');
  },

  // ── Enemy upgrade overlay (end of wave) ───────────────────────
  showEnemyUpgradePicker(options, onPick) {
    this.els.enemyUpgradeCards.innerHTML = '';

    const diffColors = ['', '#44ff88', '#ffaa00', '#ff4444'];
    const diffLabels = ['', '★', '★★', '★★★'];

    for (const opt of options) {
      const card = document.createElement('div');
      card.className = 'upgrade-card enemy-card';
      card.style.setProperty('--enemy-color', opt.color);
      card.style.setProperty('--enemy-glow', opt.glowColor);
      card.innerHTML = `
        <div class="card-category" style="color:${diffColors[opt.difficulty]}">
          DIFFICULTY ${diffLabels[opt.difficulty]}
        </div>
        <div class="card-name">${opt.label}</div>
        <div class="card-desc">${opt.desc}</div>
        <div class="card-diff-bar">
          ${Array.from({length: opt.difficulty}, () =>
            `<span class="diff-pip" style="background:${diffColors[opt.difficulty]}"></span>`
          ).join('')}
        </div>
      `;
      card.addEventListener('click', () => {
        onPick(opt);
        this.hideEnemyUpgradePicker();
      });
      this.els.enemyUpgradeCards.appendChild(card);
    }

    this.els.enemyUpgradeOverlay.classList.remove('hidden');
  },

  hideEnemyUpgradePicker() {
    this.els.enemyUpgradeOverlay.classList.add('hidden');
  },

  // ── Wave modifier picker ───────────────────────────────────
  showWaveModifierPicker(options, onPick) {
    this.els.waveModCards.innerHTML = '';

    for (const opt of options) {
      const card = document.createElement('div');
      card.className = 'upgrade-card wave-mod-card';
      card.style.setProperty('--mod-color', opt.color);
      card.innerHTML = `
        <div class="card-category" style="color:${opt.color}">WAVE MODIFIER</div>
        <div class="card-name" style="color:${opt.color}">${opt.name}</div>
        <div class="card-desc">${opt.desc}</div>
        <div class="card-drawback">Drawback: ${opt.drawback}</div>
      `;
      card.addEventListener('click', () => {
        onPick(opt);
        this.hideWaveModifierPicker();
      });
      this.els.waveModCards.appendChild(card);
    }

    this.els.waveModOverlay.classList.remove('hidden');
  },

  hideWaveModifierPicker() {
    this.els.waveModOverlay.classList.add('hidden');
  },

  // ── Downtime overlay ──────────────────────────────────────────
  showDowntime(seconds) {
    this.els.downtimeTimer.textContent = Math.ceil(seconds);
    this.els.downtimeOverlay.classList.remove('hidden');
  },

  updateDowntime(seconds) {
    this.els.downtimeTimer.textContent = Math.ceil(seconds);
  },

  hideDowntime() {
    this.els.downtimeOverlay.classList.add('hidden');
  },

  // ── Game over ─────────────────────────────────────────────────
  showGameOver() {
    this.els.gameOverWave.textContent  = `Survived ${Game.wave - 1} wave${Game.wave > 2 ? 's' : ''}`;
    this.els.gameOverLevel.textContent = `Reached level ${Game.level}`;
    this.els.gameOverOverlay.classList.remove('hidden');
  },

  hideGameOver() {
    this.els.gameOverOverlay.classList.add('hidden');
  },

  hideAll() {
    this.els.upgradeOverlay.classList.add('hidden');
    this.els.weaponSlotPicker.classList.add('hidden');
    this.els.enemyUpgradeOverlay.classList.add('hidden');
    this.els.waveModOverlay.classList.add('hidden');
    this.els.downtimeOverlay.classList.add('hidden');
    this.els.gameOverOverlay.classList.add('hidden');
  }
};
