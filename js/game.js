'use strict';

/* 슈퍼 마리오 RPG — 조립 계층 (game.js)
 *
 * ctx(컨텍스트) 객체가 모든 가변 월드 상태를 담고, 엔진·전투·렌더·UI 모듈이
 * ctx를 통해 상태를 읽고 쓴다. game.js는 모듈 조립·입력·플로우·초기화만 담당.
 *
 * 모듈 의존: BALANCE, GameUtil, GameFlow, GameCombat, GameEngine, GameRender, GameUI,
 *            RPG, SpriteData, LevelData, AudioSys
 */
(() => {
  const { PHYS, COMBO, CAPS, STATUS } = BALANCE;
  const { clamp, overlap, compact } = GameUtil;
  const { STATE } = GameFlow;
  const { ELEM_COLOR, colorOf } = GameCombat;
  const TILE = PHYS.TILE, ROWS = LevelData.ROWS, VIEW_W = PHYS.VIEW_W, VIEW_H = ROWS * TILE;
  const STEP = PHYS.STEP_MS;
  const { GRAV, MAXFALL, JUMPV, WALK, RUN, ACC, AIRACC, FRIC } = PHYS;
  const SOLID = new Set(CAPS.SOLID);
  const INV_CAP = CAPS.INV_CAP;
  const MAX_PARTICLES = CAPS.MAX_PARTICLES;
  const MAX_EFFECTS = CAPS.MAX_EFFECTS;
  const MAX_FLOATS = CAPS.MAX_FLOATS;

  const cvs = document.getElementById('game');
  const ctx2d = cvs.getContext('2d');
  ctx2d.imageSmoothingEnabled = false;

  const $ = id => document.getElementById(id);
  const overlays = { title: $('ov-title'), pause: $('ov-pause'), over: $('ov-over'), clear: $('ov-clear'), win: $('ov-win'), inv: $('ov-inv') };
  const showOverlay = name => { for (const k in overlays) overlays[k].classList.toggle('show', k === name); };

  const pad = n => String(n).padStart(6, '0');

  // ---- 풀
  const partPool = [], effectPool = [], floatPool = [];
  function acquirePart() { const p = partPool.pop() || {}; p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.g = 0; p.life = 0; p.max = 0; p.color = '#ffffff'; p.sz = 3; p.brick = false; return p; }
  function acquireFloat() { const f = floatPool.pop() || {}; f.x = 0; f.y = 0; f.vy = -0.9; f.txt = ''; f.color = '#ffffff'; f.size = 10; f.t = 0; return f; }
  function acquireEffect() { const e = effectPool.pop() || {}; e.type = ''; e.x = 0; e.y = 0; e.r = 0; e.maxR = 0; e.color = '#ffffff'; e.x1 = 0; e.y1 = 0; e.x2 = 0; e.y2 = 0; e.stage = 0; e.face = 1; e.element = null; e.life = 0; e.maxLife = 0; return e; }
  function release(pool, value) { if (pool.length < CAPS.MAX_PART_POOL) pool.push(value); }

  // ---- 하늘 그래디언트 캐시
  const skyGradientCache = new Map();
  function getSkyGradient(th) {
    const key = th.sky[0] + '|' + th.sky[1];
    let g = skyGradientCache.get(key);
    if (!g) { g = ctx2d.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]); skyGradientCache.set(key, g); }
    return g;
  }

  // ---- ctx (모든 가변 월드 상태의 단일 출처)
  const ctx = {
    // 월드
    state: STATE.TITLE, step: 0, acc: 0, last: performance.now(),
    levelIdx: 0,
    grid: null, mushSet: null, coinEnts: null, enemies: null, items: null,
    parts: null, floats: null, groundDrops: null, chests: null, projectiles: null, effects: null,
    player: null,
    camX: 0, camLock: 0, shakeT: 0, shakeMag: 0, deathT: 0,
    flagPhase: null, flagT: 0, flagY: 0,
    levelBoss: null, bossEnraged: false,
    clouds: [],
    bounceAnims: new Map(),
    input: { left: false, right: false, run: false, jump: false },
    jumpBuf: 0,
    SPELLS: RPG.SKILLS.spells,
    activeSpell: 0,
    comboFlashT: 0, comboFlashTxt: '',
    hero: null, HS: null,
    // 상수
    TILE, ROWS, VIEW_W, VIEW_H, SOLID, GRAV, MAXFALL, JUMPV, WALK, RUN, ACC, AIRACC, FRIC, STEP,
    COMBO_DUR: COMBO.DUR, COMBO_MULT: COMBO.MULT, COMBO_WINDOW: COMBO.WINDOW, COMBO_CD: COMBO.CD,
    INV_CAP, MAX_PARTICLES, MAX_EFFECTS, MAX_FLOATS,
    // 풀
    partPool, effectPool, floatPool,
    acquirePart, acquireFloat, acquireEffect, release,
    damageRollResult: { dmg: 0, crit: false, element: null },
    // 함수 레퍼런스
    clamp, overlap, compact,
    $, pad, showOverlay, buildInv: null, recompute: null, loadLevel: null,
    def: null,
    LevelData, RPG,
  };

  const def = () => LevelData.def(ctx.levelIdx);
  ctx.def = def;

  // ===== 능력치 계산 =====
  function computeStats() {
    const gear = { str: 0, dex: 0, vit: 0, enr: 0, maxHp: 0, maxMp: 0, armor: 0, dmgPct: 0, crit: 0, leech: 0, moveSpd: 0, coldDmg: [0, 0], fireDmg: [0, 0], lightDmg: [0, 0], procFire: 0, procFrost: 0, procChain: 0 };
    for (const slot in ctx.hero.equipped) { const it = ctx.hero.equipped[slot]; if (!it) continue;
      for (const k of ['str', 'dex', 'vit', 'enr', 'maxHp', 'maxMp', 'armor', 'dmgPct', 'crit', 'leech', 'moveSpd', 'procFire', 'procFrost', 'procChain']) gear[k] += it[k] || 0;
      for (const k of ['coldDmg', 'fireDmg', 'lightDmg']) { gear[k][0] += it[k][0]; gear[k][1] += it[k][1]; }
    }
    const str = RPG.BASE.str + ctx.hero.alloc.str + gear.str;
    const dex = RPG.BASE.dex + ctx.hero.alloc.dex + gear.dex;
    const vit = RPG.BASE.vit + ctx.hero.alloc.vit + gear.vit;
    const enr = RPG.BASE.enr + ctx.hero.alloc.enr + gear.enr;
    const maxHp = RPG.maxHp(ctx.hero.level, vit) + gear.maxHp;
    const maxMp = RPG.maxMp(ctx.hero.level, enr) + gear.maxMp;
    const w = ctx.hero.equipped.weapon;
    const weaponDmg = w ? w.dmg : [1, 2];
    return { str, dex, vit, enr, maxHp, maxMp, armor: gear.armor, dmgPct: gear.dmgPct, crit: Math.min(75, 5 + dex * 0.25 + gear.crit), leech: gear.leech, moveSpd: gear.moveSpd, coldDmg: gear.coldDmg, fireDmg: gear.fireDmg, lightDmg: gear.lightDmg, procFire: gear.procFire, procFrost: gear.procFrost, procChain: gear.procChain, weaponDmg, gear };
  }

  function recompute() {
    const prevMaxHp = ctx.HS ? ctx.HS.maxHp : 0, prevMaxMp = ctx.HS ? ctx.HS.maxMp : 0;
    ctx.HS = computeStats();
    if (ctx.player) { if (ctx.player.hp > ctx.HS.maxHp) ctx.player.hp = ctx.HS.maxHp; if (ctx.player.mp > ctx.HS.maxMp) ctx.player.mp = ctx.HS.maxMp; }
    buildInv();
  }
  ctx.recompute = recompute;

  function potionHeal(kind) { return RPG.potionHeal(kind, ctx.hero.level); }

  // ===== 레벨 로드 =====
  function makeEnemy(c, type) {
    const d = RPG.ENEMIES[type];
    const mlvl = def().mlvl;
    const scale = 1 + mlvl * 0.18;
    return { type, def: d, x: c * TILE, y: d.fly ? 4 * TILE : 11 * TILE - d.size[1], w: d.size[0], h: d.size[1], vx: 0, vy: 0, hp: Math.floor(d.hp * scale), maxhp: Math.floor(d.hp * scale), dmg: [Math.floor(d.dmg[0] * scale), Math.floor(d.dmg[1] * scale)], xp: Math.floor(d.xp * (1 + mlvl * 0.12)), gold: d.gold, speed: d.speed, sight: d.sight, fly: d.fly, boss: !!d.boss, spr: d.spr, face: -1, onGround: false, active: false, animT: 0, dead: false, remove: false, hitFlash: 0, atkCD: 0, kb: 0, hover: Math.random() * 6, aggro: false, burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  }

  function loadLevel(i) {
    ctx.levelIdx = i;
    const d = def(), built = d.make();
    ctx.grid = Array.from({ length: ROWS }, () => Array(LevelData.W).fill(0));
    ctx.mushSet = new Set(); ctx.coinEnts = []; ctx.enemies = []; ctx.items = []; ctx.parts = []; ctx.floats = [];
    ctx.groundDrops = []; ctx.chests = []; ctx.projectiles = []; ctx.effects = [];
    ctx.bounceAnims.clear(); ctx.levelBoss = null; ctx.bossEnraged = false;
    ctx.comboFlashT = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < LevelData.W; c++) {
      const ch = built.G[r][c];
      if (ch === 'X') ctx.grid[r][c] = 1;
      else if (ch === 'B') ctx.grid[r][c] = 2;
      else if (ch === '?') ctx.grid[r][c] = 3;
      else if (ch === 'M') { ctx.grid[r][c] = 3; ctx.mushSet.add(c + ',' + r); }
      else if (ch === '(') ctx.grid[r][c] = 5;
      else if (ch === ')') ctx.grid[r][c] = 6;
      else if (ch === '[') ctx.grid[r][c] = 7;
      else if (ch === ']') ctx.grid[r][c] = 8;
      else if (ch === 'o') ctx.coinEnts.push({ x: c * TILE + 9, y: r * TILE + 5, w: 30, h: 38, ph: Math.random() * 6, dead: false });
    }
    for (const en of built.enemies) { const e = makeEnemy(en.c, en.type); if (e.boss) ctx.levelBoss = e; ctx.enemies.push(e); }
    for (const ch of built.chests) { ctx.chests.push({ x: ch.c * TILE + 8, y: 11 * TILE - 30, w: 32, h: 30, opened: false, rarity: ch.rarity, bob: 0 }); }
    ctx.player = { x: d.spawn * TILE, y: 11 * TILE - 44, w: 30, h: 44, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, inv: 0, landT: 0, prevBottom: 0, hp: ctx.HS ? ctx.HS.maxHp : 30, mp: ctx.HS ? ctx.HS.maxMp : 20, atkCD: 0, attackT: 0, attackStage: 0, attackHits: new Set(), heavyCD: 0, heavyT: 0, spellCD: 0, hitCD: 0, levelMsg: 0, comboCount: 0, comboTimer: 0 };
    if (ctx.HS) { ctx.player.hp = ctx.HS.maxHp; ctx.player.mp = ctx.HS.maxMp; }
    ctx.camX = 0; ctx.camLock = 0;
    ctx.flagPhase = null; ctx.flagT = 0; ctx.flagY = 2 * TILE + 6;
    ctx.clouds = [];
    for (let n = 0; n < 14; n++) ctx.clouds.push({ x: n * 380 + (n * 97) % 140, y: 46 + (n * 53) % 110, s: 0.8 + ((n * 37) % 50) / 100 });
  }
  ctx.loadLevel = loadLevel;

  // ===== 전투 (일부만 game.js에 남음 — 콤보/주문/강타/포션) =====
  const COMBO_WINDOW = COMBO.WINDOW, COMBO_MULT = COMBO.MULT, COMBO_DUR = COMBO.DUR, COMBO_CD = COMBO.CD;

  function comboHitbox(stage) { return GameEngine.comboHitbox(ctx, stage); }

  function tryAttack() {
    if (ctx.player.atkCD > 0) return;
    const stage = (ctx.player.comboTimer > 0 ? ctx.player.comboCount : 0) % 3;
    ctx.player.comboCount = (ctx.player.comboTimer > 0 ? ctx.player.comboCount : 0) + 1;
    ctx.player.comboTimer = COMBO_WINDOW;
    ctx.player.attackStage = stage;
    ctx.player.attackT = COMBO_DUR[stage];
    ctx.player.atkCD = COMBO_CD[stage];
    ctx.player.attackHits = new Set();
    AudioSys.sfx(['slash1', 'slash2', 'slash3'][stage]);
    ctx.comboFlashTxt = '콤보 ' + (stage + 1);
    if (stage === 2) { ctx.comboFlashTxt = '콤보 마무리!'; AudioSys.sfx('combo'); }
    ctx.comboFlashT = 26;
    const hb = comboHitbox(stage);
    for (const e of ctx.enemies) { if (!e.dead && overlap(hb, e) && !ctx.player.attackHits.has(e)) { ctx.player.attackHits.add(e); GameEngine.dealDamage(ctx, e, COMBO_MULT[stage], { dir: ctx.player.face }); if (stage === 2) e.kb = ctx.player.face * 7; } }
    for (const c of ctx.chests) { if (!c.opened && overlap(hb, c)) GameEngine.openChest(ctx, c); }
    const el = GameEngine.damageRoll(ctx, 0).element;
    ctx.player.attackElement = el;
    const f = ctx.player.face, ax = f > 0 ? ctx.player.x + ctx.player.w + 6 : ctx.player.x - 6, ay = ctx.player.y + ctx.player.h / 2;
    GameEngine.pushEffect(ctx, 'slash', { x: ax, y: ay, stage, face: f, element: el, life: 10, maxLife: 10 });
  }

  function doShockwave(x, y, radius) {
    GameEngine.pushEffect(ctx, 'shock', { x, y, r: 8, maxR: radius, life: 24, maxLife: 24, color: '#ffffff' });
    AudioSys.sfx('shockwave'); ctx.shakeT = 16; ctx.shakeMag = 7;
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const dd = Math.hypot(e.x + e.w / 2 - x, e.y + e.h / 2 - y);
      if (dd < radius) {
        const r = GameEngine.damageRoll(ctx, 1.35);
        GameEngine.applyDamage(ctx, e, r.dmg, r.crit, { dir: Math.sign((e.x + e.w / 2) - x) || 1, proc: false, status: false });
        e.kb = Math.sign((e.x + e.w / 2) - x) * 6;
        if (Math.random() < 0.6) e.shock = Math.max(e.shock, 36);
      }
    }
  }

  function tryHeavy() {
    if (ctx.player.heavyCD > 0) return;
    ctx.player.heavyCD = RPG.SKILLS.heavy.cd; ctx.player.heavyT = 20;
    AudioSys.sfx('heavy');
    const sx = ctx.player.x + ctx.player.w / 2 + ctx.player.face * 26, sy = ctx.player.y + ctx.player.h - 6;
    doShockwave(sx, sy, 74);
    const hb = { x: ctx.player.face > 0 ? ctx.player.x + ctx.player.w : ctx.player.x - 64, y: ctx.player.y - 22, w: 64, h: ctx.player.h + 32 };
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      if (overlap(hb, e)) { const r = GameEngine.damageRoll(ctx, 1.6); GameEngine.applyDamage(ctx, e, r.dmg, r.crit, { dir: ctx.player.face, proc: false, status: false }); e.kb = ctx.player.face * 8; if (Math.random() < 0.5) e.shock = 40; }
    }
    GameEngine.burst(ctx, sx, sy, 20, '#ffd23e');
    GameEngine.dust(ctx, ctx.player.x + ctx.player.w / 2, ctx.player.y + ctx.player.h, 8);
  }

  function selectSpell(i) { ctx.activeSpell = i; ctx.comboFlashTxt = '주문: ' + ctx.SPELLS[i].name; ctx.comboFlashT = 30; }

  function castFire() {
    const r = GameEngine.damageRoll(ctx, 1.0);
    ctx.projectiles.push({ kind: 'fire', x: ctx.player.x + ctx.player.w / 2, y: ctx.player.y + ctx.player.h / 2 - 4, vx: ctx.player.face * 9, vy: 0, r: 10, dmg: r.dmg, crit: r.crit, element: 'fire', life: 90, hit: new Set() });
    AudioSys.sfx('fireball');
    GameEngine.burst(ctx, ctx.player.x + ctx.player.w / 2 + ctx.player.face * 14, ctx.player.y + ctx.player.h / 2, 6, '#ff8a3a');
  }
  function castIce() {
    const r = GameEngine.damageRoll(ctx, 0.85);
    ctx.projectiles.push({ kind: 'ice', x: ctx.player.x + ctx.player.w / 2, y: ctx.player.y + ctx.player.h / 2 - 4, vx: ctx.player.face * 12, vy: 0, r: 7, dmg: r.dmg, crit: r.crit, element: 'cold', life: 70, hit: new Set(), pierce: 4 });
    AudioSys.sfx('ice');
  }
  function castBolt() {
    const sx = ctx.player.x + ctx.player.w / 2, sy = ctx.player.y + ctx.player.h / 2 - 4;
    const cand = ctx.enemies.filter(e => !e.dead && Math.hypot(e.x + e.w / 2 - sx, e.y + e.h / 2 - sy) < 340);
    if (!cand.length) { AudioSys.sfx('bolt'); GameEngine.pushEffect(ctx, 'flash', { x: sx + ctx.player.face * 36, y: sy, r: 12, maxR: 12, life: 8, maxLife: 8, color: '#ffe066' }); return; }
    cand.sort((a, b) => Math.hypot(a.x + a.w / 2 - sx, a.y + a.h / 2 - sy) - Math.hypot(b.x + b.w / 2 - sx, b.y + b.h / 2 - sy));
    const t = cand[0], ex = t.x + t.w / 2, ey = t.y + t.h / 2;
    GameEngine.pushEffect(ctx, 'bolt', { x1: sx, y1: sy, x2: ex, y2: ey, life: 14, maxLife: 14, color: '#ffe066' });
    const r = GameEngine.damageRoll(ctx, 1.0);
    GameEngine.applyDamage(ctx, t, r.dmg, r.crit, { element: 'light', proc: false, status: true, dir: Math.sign(ex - sx) || 1 });
    GameEngine.burst(ctx, ex, ey, 12, '#ffe066');
    GameEngine.chainLightning(ctx, ex, ey, t);
  }

  const CAST_MAP = { fire: castFire, ice: castIce, bolt: castBolt };
  function tryCast() {
    const sp = ctx.SPELLS[ctx.activeSpell];
    if (ctx.player.spellCD > 0 || ctx.player.mp < sp.cost) return;
    ctx.player.mp -= sp.cost; ctx.player.spellCD = sp.cd;
    CAST_MAP[sp.id]();
  }

  function usePotion(kind) {
    if (kind === 'hp') {
      if (ctx.hero.pots.hp <= 0) return;
      ctx.hero.pots.hp--;
      const h = potionHeal('hp');
      ctx.player.hp = Math.min(ctx.HS.maxHp, ctx.player.hp + h);
      GameEngine.addFloat(ctx, ctx.player.x, ctx.player.y - 20, '+' + h + ' HP', '#5dff7a');
      AudioSys.sfx('potion'); GameEngine.sparkle(ctx, ctx.player.x + ctx.player.w / 2, ctx.player.y + 10);
    } else {
      if (ctx.hero.pots.mp <= 0) return;
      ctx.hero.pots.mp--;
      const h = potionHeal('mp');
      ctx.player.mp = Math.min(ctx.HS.maxMp, ctx.player.mp + h);
      GameEngine.addFloat(ctx, ctx.player.x, ctx.player.y - 20, '+' + h + ' MP', '#6fb6ff');
      AudioSys.sfx('potion');
    }
    buildInv();
  }

  // ===== 플로우 =====
  function startGame() {
    ctx.hero = RPG.newCharacter();
    const st = RPG.makeStarter(1);
    ctx.hero.equipped.weapon = st.dagger; ctx.hero.equipped.armor = st.leather;
    recompute();
    ctx.levelIdx = 0;
    loadLevel(0);
    ctx.state = STATE.PLAYING; showOverlay(null);
    AudioSys.musicStart(def().bgm);
    buildInv();
  }

  function toTitle() { loadLevel(0); ctx.state = STATE.TITLE; showOverlay('title'); AudioSys.musicStop(); }

  function confirm() {
    AudioSys.ensure();
    if (ctx.state === STATE.TITLE) startGame();
    else if (ctx.state === STATE.CLEAR) {
      showOverlay(null);
      if (ctx.levelIdx + 1 < LevelData.COUNT) { loadLevel(ctx.levelIdx + 1); ctx.state = STATE.PLAYING; AudioSys.musicStart(def().bgm); }
      else { ctx.state = STATE.WIN; $('win-score').textContent = pad(ctx.hero.gold); showOverlay('win'); AudioSys.musicStop(); }
    } else if (ctx.state === STATE.WIN) toTitle();
    else if (ctx.state === STATE.PAUSED) togglePause();
  }

  function togglePause() {
    if (ctx.state === STATE.PLAYING) { ctx.state = STATE.PAUSED; showOverlay('pause'); AudioSys.musicStop(); }
    else if (ctx.state === STATE.PAUSED) { ctx.state = STATE.PLAYING; showOverlay(null); AudioSys.musicStart(def().bgm); }
  }
  function toggleMute() { AudioSys.ensure(); const m = AudioSys.toggle(); $('btn-sound').textContent = m ? 'SOUND OFF' : 'SOUND ON'; }
  function toggleInv() {
    if (ctx.state === STATE.PLAYING) { ctx.state = STATE.INV; showOverlay('inv'); buildInv(); AudioSys.musicStop(); }
    else if (ctx.state === STATE.INV) { ctx.state = STATE.PLAYING; showOverlay(null); AudioSys.musicStart(def().bgm); }
  }

  // ===== 틱 (GameEngine 위임) =====
  function tick() { GameEngine.tick(ctx); }

  // ===== 렌더 =====
  function render() {
    GameRender.render({
      ctx: ctx2d, cvs, VIEW_W, VIEW_H, TILE, ROWS, camX: ctx.camX, step: ctx.step, state: ctx.state,
      player: ctx.player, enemies: ctx.enemies, parts: ctx.parts, floats: ctx.floats, effects: ctx.effects,
      projectiles: ctx.projectiles, items: ctx.items, groundDrops: ctx.groundDrops, chests: ctx.chests,
      coinEnts: ctx.coinEnts, clouds: ctx.clouds, grid: ctx.grid, bounceAnims: ctx.bounceAnims,
      flagPhase: ctx.flagPhase, flagY: ctx.flagY,
      shakeT: ctx.shakeT, shakeMag: ctx.shakeMag, bossEnraged: ctx.bossEnraged,
      comboFlashT: ctx.comboFlashT, comboFlashTxt: ctx.comboFlashTxt,
      hero: ctx.hero, HS: ctx.HS, SPELLS: ctx.SPELLS, activeSpell: ctx.activeSpell,
      COMBO_DUR: ctx.COMBO_DUR, ELEM_COLOR, clamp, getSkyGradient, def,
      RPG, SpriteData, LevelData,
    });
  }

  // ===== 인벤토리 UI =====
  function buildInv() {
    if (!ctx.hero || ctx.state !== STATE.INV) return;
    GameUI.buildInv(ctx.hero, ctx.HS, ctx.state, { eq: $('inv-equipped'), sp: $('inv-stats'), bp: $('inv-backpack'), pots: $('inv-pots'), tip: $('inv-tip') }, { equipFromBackpack, unequip, allocStat, usePotion });
  }
  ctx.buildInv = buildInv;

  function gearStrExcept(slot) { let s = 0; for (const k in ctx.hero.equipped) { if (k !== slot && ctx.hero.equipped[k]) s += ctx.hero.equipped[k].str || 0; } return s; }
  function canEquip(it) { return RPG.BASE.str + ctx.hero.alloc.str + gearStrExcept(it.slot) + (it.str || 0) >= it.req; }

  function equipFromBackpack(idx) {
    const it = ctx.hero.backpack[idx]; if (!it) return;
    if (!canEquip(it)) { tipFlash('힘이 부족하여 착용할 수 없습니다'); return; }
    const cur = ctx.hero.equipped[it.slot]; ctx.hero.backpack.splice(idx, 1); if (cur) ctx.hero.backpack.push(cur);
    ctx.hero.equipped[it.slot] = it; AudioSys.sfx('equip'); recompute();
  }
  function unequip(slot) {
    const it = ctx.hero.equipped[slot]; if (!it) return;
    if (ctx.hero.backpack.length >= INV_CAP) { tipFlash('인벤토리가 가득 찼습니다'); return; }
    ctx.hero.backpack.push(it); ctx.hero.equipped[slot] = null; AudioSys.sfx('equip'); recompute();
  }
  function allocStat(stat) { if (ctx.hero.statPts <= 0) return; ctx.hero.alloc[stat]++; ctx.hero.statPts--; recompute(); buildInv(); }

  let tipTimer = 0;
  function tipFlash(msg) { $('inv-tip').textContent = msg; $('inv-tip').classList.add('show'); tipTimer = 120; }

  // ---- 루프
  function frame(now) {
    requestAnimationFrame(frame);
    ctx.acc += now - ctx.last; ctx.last = now;
    if (ctx.acc > 200) ctx.acc = 200;
    while (ctx.acc >= STEP) { tick(); ctx.acc -= STEP; }
    if (ctx.state === STATE.INV && tipTimer > 0) { tipTimer--; if (tipTimer === 0) $('inv-tip').classList.remove('show'); }
    render();
  }

  // ---- 입력
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ShiftLeft: 'run', ShiftRight: 'run' };
  const JUMPCODES = new Set(['Space', 'ArrowUp', 'KeyW']);

  addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    AudioSys.ensure();
    if (ctx.state === STATE.INV) { if (e.code === 'KeyI' || e.code === 'Tab' || e.code === 'Escape') toggleInv(); return; }
    if (KEYMAP[e.code]) ctx.input[KEYMAP[e.code]] = true;
    if (JUMPCODES.has(e.code)) { if (ctx.state === STATE.PLAYING) { if (!e.repeat) ctx.jumpBuf = 8; ctx.input.jump = true; } else if (!e.repeat) confirm(); }
    if (e.code === 'KeyJ' && !e.repeat && ctx.state === STATE.PLAYING) tryAttack();
    if (e.code === 'KeyK' && !e.repeat && ctx.state === STATE.PLAYING) tryHeavy();
    if (e.code === 'KeyL' && !e.repeat && ctx.state === STATE.PLAYING) tryCast();
    if ((e.code === 'Digit1' || e.code === 'Numpad1') && !e.repeat) selectSpell(0);
    if ((e.code === 'Digit2' || e.code === 'Numpad2') && !e.repeat) selectSpell(1);
    if ((e.code === 'Digit3' || e.code === 'Numpad3') && !e.repeat) selectSpell(2);
    if (e.code === 'KeyQ' && !e.repeat && ctx.state === STATE.PLAYING) usePotion('hp');
    if (e.code === 'Enter' && !e.repeat) confirm();
    if (e.code === 'KeyI' && !e.repeat && (ctx.state === STATE.PLAYING || ctx.state === STATE.INV)) toggleInv();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyM' && !e.repeat) toggleMute();
  });
  addEventListener('keyup', e => { if (KEYMAP[e.code]) ctx.input[KEYMAP[e.code]] = false; if (JUMPCODES.has(e.code)) ctx.input.jump = false; });

  cvs.addEventListener('contextmenu', e => e.preventDefault());
  cvs.addEventListener('pointerdown', e => {
    AudioSys.ensure();
    if (ctx.state !== STATE.PLAYING) { if (ctx.state !== STATE.INV && ctx.state !== STATE.PAUSED && ctx.state !== STATE.DYING && ctx.state !== STATE.FLAG) confirm(); return; }
    if (e.button === 0) tryAttack(); else if (e.button === 2) tryCast();
  });

  for (const k in overlays) { if (k === 'inv') continue; overlays[k].addEventListener('pointerdown', () => { AudioSys.ensure(); confirm(); }); }
  $('ov-inv').addEventListener('pointerdown', e => { if (e.target.id === 'ov-inv') toggleInv(); });

  function bindTouch(id, down, up) {
    const el = $(id); if (!el) return;
    el.addEventListener('pointerdown', e => { e.preventDefault(); AudioSys.ensure(); down(); });
    el.addEventListener('pointerup', e => { e.preventDefault(); up && up(); });
    el.addEventListener('pointercancel', () => up && up());
    el.addEventListener('pointerleave', () => up && up());
  }
  bindTouch('tb-left', () => ctx.input.left = true, () => ctx.input.left = false);
  bindTouch('tb-right', () => ctx.input.right = true, () => ctx.input.right = false);
  bindTouch('tb-run', () => ctx.input.run = true, () => ctx.input.run = false);
  bindTouch('tb-jump', () => { if (ctx.state === STATE.PLAYING) { ctx.input.jump = true; ctx.jumpBuf = 8; } else if (ctx.state !== STATE.INV) confirm(); }, () => ctx.input.jump = false);
  bindTouch('tb-atk', () => { if (ctx.state === STATE.PLAYING) tryAttack(); });
  bindTouch('tb-spell', () => { if (ctx.state === STATE.PLAYING) tryCast(); });
  bindTouch('tb-heavy', () => { if (ctx.state === STATE.PLAYING) tryHeavy(); });
  bindTouch('tb-pot', () => { if (ctx.state === STATE.PLAYING) usePotion('hp'); });

  $('btn-sound').addEventListener('click', e => { toggleMute(); e.currentTarget.blur(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && ctx.state === STATE.PLAYING) togglePause(); });
  if (document.fonts && document.fonts.load) document.fonts.load('12px "Press Start 2P"');

  // 더미 히어로(타이틀 화면 렌더용) + 첫 레벨
  ctx.hero = RPG.newCharacter();
  const st = RPG.makeStarter(1);
  ctx.hero.equipped.weapon = st.dagger; ctx.hero.equipped.armor = st.leather;
  recompute();
  loadLevel(0);
  showOverlay('title');
  requestAnimationFrame(frame);
})();