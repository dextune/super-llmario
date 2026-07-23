'use strict';

(function (root) {
  root.MetalStrikeCombatRuntime = String.raw`
  /* ===== RPG OVERDRIVE COMBAT LAYER ===== */
  function createCombatState() {
    return {
      combo: 0, comboT: 0, peakCombo: 0, multiplier: 1,
      fury: 0, overdriveT: 0, style: 'D', lastStyle: 'D',
      hitPulse: 0, executionCount: 0, stageXp: 0,
    };
  }

  function loadOverdriveProfile() {
    var fallback = { level: 1, xp: 0, nextXp: 140, damage: 1, fireRate: 1, crit: 0.06, maxHpBonus: 0, melee: 1 };
    try {
      if (typeof localStorage === 'undefined') return fallback;
      var raw = localStorage.getItem(OVERDRIVE_SAVE_KEY);
      if (!raw) return fallback;
      var data = JSON.parse(raw);
      fallback.level = Math.max(1, Math.min(50, Number(data.level) || 1));
      fallback.xp = Math.max(0, Number(data.xp) || 0);
      fallback.nextXp = Math.max(140, Number(data.nextXp) || 140);
      fallback.damage = Math.max(1, Number(data.damage) || 1);
      fallback.fireRate = Math.max(0.7, Math.min(1, Number(data.fireRate) || 1));
      fallback.crit = Math.max(0.06, Math.min(0.35, Number(data.crit) || 0.06));
      fallback.maxHpBonus = Math.max(0, Math.min(200, Number(data.maxHpBonus) || 0));
      fallback.melee = Math.max(1, Number(data.melee) || 1);
    } catch (error) {}
    return fallback;
  }

  function saveOverdriveProfile() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(OVERDRIVE_SAVE_KEY, JSON.stringify(profile));
    } catch (error) {}
  }

  function resetCombatState() {
    combat = createCombatState();
    if (world) {
      world.hitStop = 0; world.slowMo = 0; world.kickX = 0; world.kickY = 0;
    }
  }

  function styleFromCombo(combo) {
    if (combo >= 45) return 'S';
    if (combo >= 28) return 'A';
    if (combo >= 16) return 'B';
    if (combo >= 7) return 'C';
    return 'D';
  }

  function updateCombatState(dt) {
    if (combat.comboT > 0) combat.comboT -= dt;
    else if (combat.combo > 0) {
      combat.combo = Math.max(0, combat.combo - Math.max(1, Math.ceil(dt * 12)));
      if (combat.combo === 0) combat.multiplier = 1;
    }
    if (combat.overdriveT > 0) {
      combat.overdriveT -= dt;
      if (combat.overdriveT <= 0) {
        combat.overdriveT = 0;
        toast('OVERDRIVE 종료', '#8fa6c8');
      }
    }
    combat.style = styleFromCombo(combat.combo);
    combat.multiplier = 1 + Math.min(3, Math.floor(combat.combo / 8) * 0.25);
    if (combat.style !== combat.lastStyle) {
      combat.lastStyle = combat.style;
      if (combat.style !== 'D') {
        ImpactAudio.play('rank');
        toast('STYLE RANK ' + combat.style + ' · x' + combat.multiplier.toFixed(2), combat.style === 'S' ? '#ffd76a' : '#74e79a');
      }
    }
    if (combat.hitPulse > 0) combat.hitPulse -= dt;
  }

  function resolveCombatHit(target, baseDamage, hitY, boss) {
    var weakpointLine = target.y + target.h * (boss ? 0.3 : 0.38);
    var weakpoint = typeof hitY === 'number' && hitY <= weakpointLine;
    var critChance = profile.crit + Math.min(0.12, combat.combo * 0.0025) + (combat.overdriveT > 0 ? 0.12 : 0);
    var critical = weakpoint || Math.random() < critChance;
    var eliteGuard = target.elite ? 0.92 : 1;
    var damage = baseDamage * profile.damage * eliteGuard * (combat.overdriveT > 0 ? 1.38 : 1) * (critical ? (weakpoint ? 1.85 : 1.55) : 1);
    return { damage: damage, critical: critical, weakpoint: weakpoint, boss: boss };
  }

  function registerCombatHit(target, result, killed, boss) {
    if (!world || !player) return;
    combat.combo += killed ? (target.elite ? 5 : 3) : 1;
    combat.comboT = killed ? 2.3 : 1.65;
    combat.peakCombo = Math.max(combat.peakCombo, combat.combo);
    combat.fury = Math.min(100, combat.fury + (result.critical ? 7 : 3) + (killed ? (target.elite ? 18 : 9) : 0));
    combat.hitPulse = result.critical ? 0.18 : 0.1;

    var ix = centerX(target), iy = centerY(target);
    var impactColor = result.weakpoint ? '#fff08a' : result.critical ? '#ff9a5c' : '#ffffff';
    addFloat(ix, target.y - 10, (result.critical ? 'CRIT ' : '') + Math.ceil(result.damage), impactColor, result.critical ? 16 : 11);
    world.effects.push({ type: 'impact', x: ix, y: iy, r: result.critical ? 34 : 20, life: result.critical ? 0.18 : 0.11, maxLife: result.critical ? 0.18 : 0.11, color: impactColor, spin: Math.random() * Math.PI });
    addSpark(ix, iy, impactColor);
    world.hitStop = Math.max(world.hitStop || 0, killed ? (boss ? 0.095 : 0.07) : result.critical ? 0.055 : 0.022);
    world.slowMo = Math.max(world.slowMo || 0, killed && (target.elite || boss) ? 0.12 : 0);
    world.kickX = (Math.random() - 0.5) * (result.critical ? 10 : 4);
    world.kickY = (Math.random() - 0.5) * (result.critical ? 7 : 3);
    world.shake = Math.max(world.shake, killed ? 7 : result.critical ? 4.5 : 2);
    ImpactAudio.play(killed ? (target.elite || boss ? 'eliteKill' : 'kill') : result.critical ? 'crit' : 'impact');

    if (killed) {
      var xp = boss ? 120 : target.elite ? 42 : 10;
      gainOverdriveXp(xp);
      if (target.elite) {
        toast('ELITE BREAK · +' + xp + ' XP', '#ff79d1');
        combat.executionCount++;
      }
    }
  }

  function gainOverdriveXp(amount) {
    profile.xp += amount;
    combat.stageXp += amount;
    while (profile.xp >= profile.nextXp && profile.level < 50) {
      profile.xp -= profile.nextXp;
      profile.level++;
      profile.nextXp = Math.floor(profile.nextXp * 1.22 + 35);
      profile.damage = Math.min(2.15, profile.damage + 0.045);
      profile.crit = Math.min(0.35, profile.crit + (profile.level % 2 === 0 ? 0.008 : 0.004));
      profile.maxHpBonus = Math.min(200, profile.maxHpBonus + 5);
      if (profile.level % 3 === 0) profile.fireRate = Math.max(0.7, profile.fireRate - 0.015);
      profile.melee += 0.06;
      if (player) {
        player.maxHp = MS.MAX_HP + profile.maxHpBonus;
        player.hp = Math.min(player.maxHp, player.hp + 30);
      }
      screenFlash('#74e79a', 0.35);
      world.effects.push({ type: 'shockwave', x: centerX(player), y: centerY(player), r: 120, life: 0.7, maxLife: 0.7, color: '#74e79a' });
      toast('LEVEL UP ' + profile.level + ' · 화력/체력/치명타 상승', '#74e79a');
      ImpactAudio.play('level');
    }
    saveOverdriveProfile();
  }

  function tryActivateOverdrive() {
    if (!world || !player || player.dead) return;
    if (combat.fury < 100) {
      toast('OVERDRIVE ' + Math.floor(combat.fury) + '% · 전투로 게이지 충전', '#8fa6c8');
      ImpactAudio.play('deny');
      return;
    }
    combat.fury = 0;
    combat.overdriveT = 7;
    combat.comboT = Math.max(combat.comboT, 3);
    screenFlash('#5cdbff', 0.3);
    world.shake = Math.max(world.shake, 8);
    world.effects.push({ type: 'shockwave', x: centerX(player), y: centerY(player), r: 160, life: 0.8, maxLife: 0.8, color: '#5cdbff' });
    toast('OVERDRIVE · 화력 138% · 연사 162% · 치명타 상승', '#5cdbff');
    ImpactAudio.play('overdrive');
  }

  function tryMelee() {
    if (!world || !player || player.dead || player.meleeCd > 0) return;
    player.meleeCd = combat.overdriveT > 0 ? 0.19 : 0.34;
    var range = combat.overdriveT > 0 ? 82 : 62;
    var blade = { x: player.face > 0 ? player.x + player.w - 4 : player.x - range + 4, y: player.y - 2, w: range, h: player.h + 10 };
    var hitCount = 0;
    for (var i = 0; i < world.enemies.length; i++) {
      var enemy = world.enemies[i];
      if (enemy.dead || !overlap(blade, enemy)) continue;
      var execute = enemy.hp / enemy.maxHp <= 0.22 && !enemy.def.miniboss;
      damageEnemy(enemy, execute ? enemy.hp + 1 : 38 * profile.melee, player.face, enemy.y + enemy.h * 0.25);
      hitCount++;
      if (execute) {
        combat.fury = Math.min(100, combat.fury + 20);
        combat.executionCount++;
        addFloat(centerX(enemy), enemy.y - 24, 'EXECUTION', '#ff79d1', 15);
      }
    }
    if (world.boss && !world.boss.dead && overlap(blade, world.boss)) {
      damageBoss(world.boss, 34 * profile.melee, world.boss.y + world.boss.h * 0.25);
      hitCount++;
    }
    var slashX = player.x + player.w / 2 + player.face * 36;
    var slashY = player.y + player.h * 0.45;
    world.effects.push({ type: 'slash', x: slashX, y: slashY, r: 45, life: 0.16, maxLife: 0.16, color: hitCount ? '#fff08a' : '#c9d5ec', width: hitCount ? 9 : 5, a0: player.face > 0 ? -0.9 : Math.PI - 0.9, a1: player.face > 0 ? 0.9 : Math.PI + 0.9 });
    player.vx += player.face * (hitCount ? 85 : 35);
    world.kickX = -player.face * (hitCount ? 7 : 2);
    ImpactAudio.play(hitCount ? 'bladeHit' : 'blade');
  }

  function applyEliteMutation(enemy) {
    if (!world || enemy.def.miniboss || enemy.def.role === 'turret') return;
    var chance = 0.055 + (world.stageId || 0) * 0.018 + Math.min(0.04, profile.level * 0.002);
    if (world.rng.random() >= chance) return;
    enemy.elite = true;
    enemy.affix = world.rng.pick(['BERSERK', 'ARMORED', 'RAPID', 'VAMP']);
    enemy.maxHp = Math.floor(enemy.maxHp * (enemy.affix === 'ARMORED' ? 2.15 : 1.65));
    enemy.hp = enemy.maxHp;
    enemy.score = Math.floor(enemy.def.score * 2.4);
    if (enemy.affix === 'BERSERK') { enemy.def = Object.assign({}, enemy.def, { speed: enemy.def.speed * 1.25, damage: enemy.def.damage * 1.35 }); }
    if (enemy.affix === 'RAPID') { enemy.def = Object.assign({}, enemy.def, { attackCd: enemy.def.attackCd * 0.62 }); }
  }

  function drawWarzoneDecor() {
    if (!world) return;
    var th = world.stage.theme;
    var cam = world.cameraX;
    g.save();
    g.globalAlpha = 0.34;
    g.fillStyle = '#07101a';
    for (var i = 0; i < 16; i++) {
      var bx = (i * 190 - cam * 0.72) % 3200;
      if (bx < -180) bx += 3200;
      var bh = 70 + (i * 47) % 170;
      g.fillRect(bx, GROUND_Y - bh, 85 + (i % 3) * 30, bh);
      for (var wy = GROUND_Y - bh + 18; wy < GROUND_Y - 12; wy += 24) {
        g.fillStyle = (i + Math.floor(world.elapsed * 2)) % 5 === 0 ? 'rgba(255,150,60,.35)' : 'rgba(80,120,150,.16)';
        g.fillRect(bx + 14, wy, 8, 10);
        g.fillRect(bx + 38, wy, 8, 10);
      }
      g.fillStyle = '#07101a';
    }
    g.globalAlpha = 0.18;
    g.strokeStyle = th.accent;
    g.lineWidth = 2;
    var sweep = (Math.sin(world.elapsed * 0.7) * 0.5 + 0.5) * VIEW_W;
    g.beginPath(); g.moveTo(VIEW_W - 80, 80); g.lineTo(sweep - 120, GROUND_Y); g.lineTo(sweep + 120, GROUND_Y); g.closePath(); g.stroke();
    g.globalAlpha = 0.42;
    for (var d = 0; d < 12; d++) {
      var dx = (d * 137 - cam * 0.9) % (VIEW_W + 200);
      if (dx < -100) dx += VIEW_W + 200;
      g.fillStyle = d % 3 === 0 ? '#ff8c42' : '#56677d';
      g.fillRect(dx, GROUND_Y - 7 - (d % 4) * 3, 8 + (d % 3) * 5, 3);
    }
    g.restore();
  }

  function drawEliteAura(enemy, fx, fy, fw, fh) {
    var pulse = 0.45 + Math.sin(world.elapsed * 8 + enemy.id) * 0.2;
    var color = enemy.affix === 'ARMORED' ? '#79a8ff' : enemy.affix === 'RAPID' ? '#ffe066' : enemy.affix === 'VAMP' ? '#ff79d1' : '#ff6a4a';
    g.save();
    g.globalAlpha = pulse;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.strokeRect(fx - 4, fy - 5, fw + 8, fh + 9);
    g.fillStyle = color;
    g.font = '6px "Press Start 2P", monospace';
    g.textAlign = 'center';
    g.fillText(enemy.affix || 'ELITE', fx + fw / 2, fy - 9);
    g.textAlign = 'left';
    g.restore();
  }

  function drawCombatOverlay() {
    if (!world || !player) return;
    g.save();
    var comboAlpha = combat.combo > 0 ? Math.min(1, 0.45 + combat.comboT) : 0;
    if (comboAlpha > 0) {
      g.globalAlpha = comboAlpha;
      g.textAlign = 'right';
      g.font = (18 + Math.min(22, combat.combo * 0.35)) + 'px "Press Start 2P", monospace';
      g.fillStyle = combat.style === 'S' ? '#ffd76a' : combat.style === 'A' ? '#ff79d1' : '#ffffff';
      g.shadowColor = g.fillStyle; g.shadowBlur = 12;
      g.fillText(combat.combo + ' HIT', VIEW_W - 24, 82);
      g.shadowBlur = 0;
      g.font = '9px "Press Start 2P", monospace';
      g.fillStyle = '#8fa6c8';
      g.fillText('STYLE ' + combat.style + '  x' + combat.multiplier.toFixed(2), VIEW_W - 24, 104);
      g.textAlign = 'left';
    }

    var gaugeX = 12, gaugeY = VIEW_H - 28, gaugeW = 260, gaugeH = 12;
    g.fillStyle = 'rgba(5,9,18,.82)'; g.fillRect(gaugeX - 2, gaugeY - 2, gaugeW + 4, gaugeH + 4);
    var furyRatio = combat.overdriveT > 0 ? combat.overdriveT / 7 : combat.fury / 100;
    var furyGrad = g.createLinearGradient(gaugeX, 0, gaugeX + gaugeW, 0);
    furyGrad.addColorStop(0, '#4a78ff'); furyGrad.addColorStop(0.55, '#5cdbff'); furyGrad.addColorStop(1, '#ffffff');
    g.fillStyle = furyGrad; g.fillRect(gaugeX, gaugeY, gaugeW * clamp(furyRatio, 0, 1), gaugeH);
    g.strokeStyle = combat.fury >= 100 || combat.overdriveT > 0 ? '#ffffff' : '#40506c'; g.strokeRect(gaugeX - 2, gaugeY - 2, gaugeW + 4, gaugeH + 4);
    g.font = '7px "Press Start 2P", monospace'; g.fillStyle = '#ffffff';
    g.fillText(combat.overdriveT > 0 ? 'OVERDRIVE ' + combat.overdriveT.toFixed(1) + 's' : 'OVERDRIVE [E] ' + Math.floor(combat.fury) + '%', gaugeX + 6, gaugeY + 10);

    g.textAlign = 'right';
    g.fillStyle = '#c9d5ec';
    g.fillText('LV.' + profile.level + '  XP ' + profile.xp + '/' + profile.nextXp, VIEW_W - 14, VIEW_H - 18);
    g.textAlign = 'left';

    if (combat.overdriveT > 0) {
      var pulse = 0.05 + Math.sin(world.elapsed * 18) * 0.025;
      g.fillStyle = 'rgba(92,219,255,' + pulse + ')'; g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.globalAlpha = 0.14;
      g.strokeStyle = '#5cdbff';
      for (var s = 0; s < 12; s++) {
        var sy = (s * 67 + world.elapsed * 360) % VIEW_H;
        g.beginPath(); g.moveTo(0, sy); g.lineTo(VIEW_W, sy - 80); g.stroke();
      }
      g.globalAlpha = 1;
    }

    if (player.hp / player.maxHp < 0.28) {
      var danger = 0.08 + Math.sin(world.elapsed * 7) * 0.04;
      var vg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.2, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.72);
      vg.addColorStop(0, 'rgba(255,0,0,0)'); vg.addColorStop(1, 'rgba(255,20,20,' + danger + ')');
      g.fillStyle = vg; g.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    var vignette = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.24, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.78);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.34)');
    g.fillStyle = vignette; g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.restore();
  }
`;
})(typeof globalThis !== 'undefined' ? globalThis : this);
