'use strict';

/* METAL STRIKE: RPG OVERDRIVE
 * The base runtime is assembled and integrity-checked first. This module then
 * applies validated source transforms so combat systems can stay isolated from
 * the generated source archive while still sharing its private runtime state.
 */
(function initMetalStrikeOverdrive(root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MetalStrikeOverdrive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildOverdrive(root) {
  'use strict';

  var PATCH_MARKER = 'METAL_STRIKE_OVERDRIVE_PATCHED';

  function replaceOnce(source, needle, replacement, label) {
    var index = source.indexOf(needle);
    if (index < 0) throw new Error('[OVERDRIVE] patch anchor missing: ' + label);
    return source.slice(0, index) + replacement + source.slice(index + needle.length);
  }

  function patch(source) {
    if (typeof source !== 'string' || source.length < 1000) throw new Error('[OVERDRIVE] invalid game source');
    if (source.indexOf(PATCH_MARKER) >= 0) return source;

    source = replaceOnce(source,
      "  var toastColor = '#ffffff';\n",
      "  var toastColor = '#ffffff';\n  var " + PATCH_MARKER + " = true;\n  var OVERDRIVE_SAVE_KEY = 'metal-strike-overdrive-v1';\n  var profile = loadOverdriveProfile();\n  var combat = createCombatState();\n  var ImpactAudio = root.MetalStrikeImpactAudio || { ensure: function () {}, play: function () {} };\n",
      'global combat state');

    source = replaceOnce(source,
      "  var pausePressed = false;\n",
      "  var pausePressed = false;\n  var meleePressed = false;\n  var overdrivePressed = false;\n",
      'action input state');

    source = replaceOnce(source,
      "    Audio.ensure();\n    var c = e.code;\n",
      "    Audio.ensure();\n    ImpactAudio.ensure();\n    var c = e.code;\n",
      'audio activation');

    source = replaceOnce(source,
      "      if (c === 'KeyK') grenadePressed = true;\n",
      "      if (c === 'KeyK') grenadePressed = true;\n      if (c === 'KeyL') meleePressed = true;\n      if (c === 'KeyE') overdrivePressed = true;\n",
      'new combat keys');

    source = replaceOnce(source,
      "hp: MS.MAX_HP, maxHp: MS.MAX_HP, face: 1, onGround: true,",
      "hp: MS.MAX_HP + profile.maxHpBonus, maxHp: MS.MAX_HP + profile.maxHpBonus, face: 1, onGround: true,",
      'profile max hp');

    source = replaceOnce(source,
      "respawnT: 0, hurtT: 0, aimUp: false,",
      "respawnT: 0, hurtT: 0, aimUp: false, meleeCd: 0, recoilT: 0,",
      'player combat timers');

    source = replaceOnce(source,
      "    if (player.fireCd > 0) player.fireCd -= dt;\n",
      "    if (player.fireCd > 0) player.fireCd -= dt;\n    if (player.meleeCd > 0) player.meleeCd -= dt;\n    if (player.recoilT > 0) player.recoilT -= dt;\n",
      'player timer update');

    source = replaceOnce(source,
      "    if (e.attackCd > 0) e.attackCd -= dt;\n",
      "    if (e.attackCd > 0) e.attackCd -= dt;\n    if (e.elite && e.affix === 'VAMP' && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.012 * dt);\n",
      'elite vamp regeneration');

    source = replaceOnce(source,
      "    if (input.fire && player.fireCd <= 0) tryFire();\n    if (grenadePressed) { tryGrenade(); grenadePressed = false; }\n",
      "    if (input.fire && player.fireCd <= 0) tryFire();\n    if (grenadePressed) { tryGrenade(); grenadePressed = false; }\n    if (meleePressed) { tryMelee(); meleePressed = false; }\n    if (overdrivePressed) { tryActivateOverdrive(); overdrivePressed = false; }\n",
      'combat action dispatch');

    source = replaceOnce(source,
      "    player.fireCd = wpn.fireRate;\n",
      "    player.fireCd = wpn.fireRate * profile.fireRate * (combat.overdriveT > 0 ? 0.62 : 1);\n    player.recoilT = Math.max(player.recoilT, 0.05 + (wpn.shake || 0) * 0.012);\n",
      'weapon cadence');

    source = replaceOnce(source,
      "  function damageEnemy(e, dmg, dir) {\n    if (e.dead) return;\n",
      "  function damageEnemy(e, dmg, dir, hitY) {\n    if (e.dead) return;\n",
      'enemy damage signature');

    source = replaceOnce(source,
      "    e.hp -= dmg;\n    e.hitFlash = 0.08;\n    e.aggro = true;\n    if (dir) { e.vx += dir * 30; }\n    if (e.hp <= 0) killEnemy(e);\n",
      "    var resolved = resolveCombatHit(e, dmg, hitY, false);\n    e.hp -= resolved.damage;\n    e.hitFlash = resolved.critical ? 0.14 : 0.09;\n    e.aggro = true;\n    if (dir) { e.vx += dir * (resolved.critical ? 120 : 46); }\n    var killed = e.hp <= 0;\n    registerCombatHit(e, resolved, killed, false);\n    if (killed) killEnemy(e);\n",
      'enemy impact resolution');

    source = replaceOnce(source,
      "damageEnemy(e, b.dmg, b.vx > 0 ? 1 : -1);",
      "damageEnemy(e, b.dmg, b.vx > 0 ? 1 : -1, centerY(b));",
      'projectile weakpoint');

    source = replaceOnce(source,
      "damageBoss(world.boss, b.dmg);",
      "damageBoss(world.boss, b.dmg, centerY(b));",
      'boss projectile weakpoint');

    source = replaceOnce(source,
      "  function damageBoss(b, dmg) {\n    if (b.dead) return;\n    b.hp -= dmg;\n    b.hitFlash = 0.08;\n",
      "  function damageBoss(b, dmg, hitY) {\n    if (b.dead) return;\n    var resolved = resolveCombatHit(b, dmg, hitY, true);\n    b.hp -= resolved.damage;\n    b.hitFlash = resolved.critical ? 0.13 : 0.08;\n    registerCombatHit(b, resolved, b.hp <= 0, true);\n",
      'boss impact resolution');

    source = replaceOnce(source,
      "    if (def.flying) { e.y = 150 + Math.random() * 200; e.vy = 0; }\n",
      "    applyEliteMutation(e);\n    if (def.flying) { e.y = 150 + Math.random() * 200; e.vy = 0; }\n",
      'elite enemy mutation');

    source = replaceOnce(source,
      "    world.score += e.def.score;\n    addFloat(centerX(e), e.y - 8, '+' + e.def.score, '#ffe066', 12);\n",
      "    var killReward = Math.floor((e.score || e.def.score) * combat.multiplier);\n    world.score += killReward;\n    addFloat(centerX(e), e.y - 8, '+' + killReward, e.elite ? '#ff79d1' : '#ffe066', e.elite ? 15 : 12);\n",
      'style-scaled kill reward');

    source = replaceOnce(source,
      "    player = createPlayer();\n    state = STATE.PLAY;\n",
      "    player = createPlayer();\n    resetCombatState();\n    state = STATE.PLAY;\n",
      'stage combat reset');

    source = replaceOnce(source,
      "    world.elapsed += dt;\n    updatePlayer(dt);\n",
      "    world.elapsed += dt;\n    updateCombatState(dt);\n    updatePlayer(dt);\n",
      'combat state update');

    source = replaceOnce(source,
      "    drawBackground();\n    drawTerrain();\n",
      "    drawBackground();\n    drawWarzoneDecor();\n    drawTerrain();\n",
      'warzone backdrop');

    source = replaceOnce(source,
      "    var sx = player.x - world.cameraX;\n    var sy = player.y;\n",
      "    var sx = player.x - world.cameraX - player.face * (player.recoilT || 0) * 95;\n    var sy = player.y;\n    g.save(); g.globalAlpha = 0.28; g.fillStyle = '#000'; g.beginPath(); g.ellipse(sx + player.w / 2, sy + player.h + 3, player.w * 0.72, 5, 0, 0, Math.PI * 2); g.fill(); g.restore();\n",
      'player recoil and shadow');

    source = replaceOnce(source,
      "      var fx = sx + e.w / 2 - frame.width / 2;\n      var fy = e.y + e.h - frame.height;\n",
      "      var fx = sx + e.w / 2 - frame.width / 2;\n      var fy = e.y + e.h - frame.height;\n      if (e.elite && !e.dead) drawEliteAura(e, fx, fy, frame.width, frame.height);\n",
      'elite aura render');

    source = replaceOnce(source,
      "      } else if (e.type === 'flash') {\n        g.fillStyle = e.color;\n        g.beginPath(); g.arc(sx, e.y, e.r * k, 0, Math.PI * 2); g.fill();\n      }\n",
      "      } else if (e.type === 'flash') {\n        g.fillStyle = e.color;\n        g.beginPath(); g.arc(sx, e.y, e.r * k, 0, Math.PI * 2); g.fill();\n      } else if (e.type === 'impact') {\n        g.strokeStyle = e.color; g.lineWidth = Math.max(1, 7 * k);\n        g.beginPath(); g.arc(sx, e.y, e.r * (1.25 - k * 0.55), 0, Math.PI * 2); g.stroke();\n        for (var ray = 0; ray < 8; ray++) {\n          var ra = ray / 8 * Math.PI * 2 + e.spin;\n          g.beginPath();\n          g.moveTo(sx + Math.cos(ra) * e.r * 0.25, e.y + Math.sin(ra) * e.r * 0.25);\n          g.lineTo(sx + Math.cos(ra) * e.r * (1.2 - k * 0.2), e.y + Math.sin(ra) * e.r * (1.2 - k * 0.2));\n          g.stroke();\n        }\n      } else if (e.type === 'slash') {\n        g.strokeStyle = e.color; g.lineWidth = Math.max(2, e.width * k);\n        g.beginPath(); g.arc(sx, e.y, e.r, e.a0, e.a1); g.stroke();\n      }\n",
      'impact effect rendering');

    source = replaceOnce(source,
      "    if (state === STATE.PLAY) updatePlay(dt);\n",
      "    var simDt = dt;\n    if (world && state === STATE.PLAY && world.hitStop > 0) { world.hitStop -= dt; simDt = 0; }\n    if (world && state === STATE.PLAY && world.slowMo > 0) { world.slowMo -= dt; simDt *= 0.45; }\n    if (state === STATE.PLAY) updatePlay(simDt);\n",
      'hit stop simulation');

    source = replaceOnce(source,
      "    if (world && world.shake > 0 && state === STATE.PLAY) {\n      g.translate((Math.random() - 0.5) * world.shake, (Math.random() - 0.5) * world.shake);\n    }\n",
      "    if (world && state === STATE.PLAY && (world.shake > 0 || world.kickX || world.kickY)) {\n      g.translate((Math.random() - 0.5) * world.shake + (world.kickX || 0), (Math.random() - 0.5) * world.shake + (world.kickY || 0));\n    }\n",
      'camera kick');

    source = replaceOnce(source,
      "    else if (state === STATE.PLAY) { drawField(); drawHUD(); drawFlash(); }\n",
      "    else if (state === STATE.PLAY) { drawField(); drawHUD(); drawCombatOverlay(); drawFlash(); }\n",
      'combat overlay');

    source = replaceOnce(source,
      "    if (world.shake > 0) world.shake -= dt * 20;\n",
      "    if (world.shake > 0) world.shake -= dt * 20;\n    if (world.kickX) world.kickX *= Math.pow(0.0008, dt);\n    if (world.kickY) world.kickY *= Math.pow(0.0008, dt);\n",
      'camera kick decay');

    source = replaceOnce(source,
      "RUN & GUN · 5 OPERATIONS",
      "RUN & GUN · RPG OVERDRIVE · 5 OPERATIONS",
      'title RPG subtitle');

    source = replaceOnce(source,
      "A/D 이동 · SPACE 점프 · J 사격 · K 수류탄 · S 앉기",
      "A/D 이동 · SPACE 점프 · J 사격 · K 수류탄 · L 근접",
      'title controls row one');

    source = replaceOnce(source,
      "SHIFT 달리기 · ↑ 올려쏘기",
      "SHIFT 달리기 · ↑ 올려쏘기 · E OVERDRIVE",
      'title controls row two');

    source = replaceOnce(source,
      "  document.addEventListener('keydown', onKeyDown);\n",
      "  var meleeBtn = $('tb-melee');\n  if (meleeBtn) {\n    var meleePress = function () { Audio.ensure(); ImpactAudio.ensure(); meleePressed = true; };\n    meleeBtn.addEventListener('touchstart', function (e) { e.preventDefault(); meleePress(); });\n    meleeBtn.addEventListener('mousedown', function (e) { e.preventDefault(); meleePress(); });\n  }\n  var overdriveBtn = $('tb-overdrive');\n  if (overdriveBtn) {\n    var overdrivePress = function () { Audio.ensure(); ImpactAudio.ensure(); overdrivePressed = true; };\n    overdriveBtn.addEventListener('touchstart', function (e) { e.preventDefault(); overdrivePress(); });\n    overdriveBtn.addEventListener('mousedown', function (e) { e.preventDefault(); overdrivePress(); });\n  }\n\n  document.addEventListener('keydown', onKeyDown);\n",
      'touch combat actions');

    source = replaceOnce(source,
      "  /* ===== 세이브 ===== */\n",
      (root.MetalStrikeCombatRuntime || '') + "\n  /* ===== 세이브 ===== */\n",
      'combat runtime injection');

    return source;
  }

  return { patch: patch, marker: PATCH_MARKER };
});
