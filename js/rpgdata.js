'use strict';

/* RPG 시스템 데이터 — 능력치 / 아이템 / 적 / 전리품 생성 (디아블로 스타일) */
const RPG = (() => {
  // ===== 기본 능력치 =====
  const BASE = { str: 10, dex: 10, vit: 10, enr: 10 };
  const STAT_NAMES = { str: '힘', dex: '민첩', vit: '활력', enr: '에너지' };
  const STAT_ORDER = ['str', 'dex', 'vit', 'enr'];

  // 다음 레벨까지 필요 경험치
  function xpForLevel(lv) { return Math.floor(45 * Math.pow(lv, 1.55)) + 25; }
  function maxHp(lv, vit) { return Math.floor(28 + lv * 12 + (vit - BASE.vit) * 8); }
  function maxMp(lv, enr) { return Math.floor(10 + lv * 4 + (enr - BASE.enr) * 4); }

  // 레벨업당 지급 능력치 포인트
  const STAT_PER_LEVEL = 5;
  const HP_PER_LEVEL = 12, MP_PER_LEVEL = 4;

  // ===== 적 종류 =====
  // - spr: 스프라이트 프레임 prefix (예: 'goomba' -> 'goomba1'/'goomba2').
  //        일부 항목(예: skeleton='skel')은 base name과 다르므로 호환을 위해 그대로 유지.
  // - color: 렌더링 색상 (game.js ENEMY_COLOR와 1:1 대응)
  const ENEMIES = {
    goomba:   { name:'굼바',      hp:22,  dmg:[2,5],   xp:9,   gold:[3,12],   speed:1.0, sight:300, fly:false, spr:'goomba', size:[34,30], color:'#a05a1c' },
    koopa:    { name:'쿠파',       hp:40,  dmg:[4,9],   xp:17,  gold:[6,20],   speed:1.1, sight:340, fly:false, spr:'koopa',  size:[34,40], color:'#3fa34d' },
    bat:      { name:'박쥐',       hp:16,  dmg:[1,4],   xp:8,   gold:[2,11],   speed:1.9, sight:380, fly:true,  spr:'bat',    size:[32,24], color:'#26243a' },
    skeleton: { name:'해골',       hp:48,  dmg:[6,13],  xp:26,  gold:[10,32],  speed:0.95,sight:360, fly:false, spr:'skel',   size:[32,42], color:'#e8e4cf' },
    demon:    { name:'악마',       hp:68,  dmg:[9,18],  xp:42,  gold:[16,46],  speed:1.3, sight:400, fly:false, spr:'demon',  size:[40,44], color:'#d6221c' },
    ice:      { name:'설인',       hp:85,  dmg:[11,21], xp:55,  gold:[22,58],  speed:0.85,sight:320, fly:false, spr:'ice',    size:[42,46], color:'#a8dbff' },
    boss:     { name:'쿠파 대왕',  hp:640, dmg:[18,38], xp:480, gold:[320,640],speed:0.7, sight:99999,fly:false, spr:'boss', size:[68,68], boss:true, color:'#7a1410' },
  };

  // ===== 아이템 슬롯 =====
  const SLOTS = ['weapon', 'armor', 'helm', 'shield', 'boots', 'gloves', 'belt', 'amulet', 'ring'];
  const SLOT_NAMES = {
    weapon: '무기', armor: '갑옷', helm: '투구', shield: '방패',
    boots: '신발', gloves: '장갑', belt: '허리띠', amulet: '목걸이', ring: '반지',
  };

  // ===== 아이템 베이스 =====
  const BASES = {
    weapon: [
      { name:'단검',      ilvl:1,  dmg:[1,4],   req:0 },
      { name:'검',        ilvl:3,  dmg:[3,9],   req:12 },
      { name:'도끼',      ilvl:5,  dmg:[5,13],  req:20 },
      { name:'전투도끼',   ilvl:8,  dmg:[8,20],  req:32 },
      { name:'대검',      ilvl:12, dmg:[13,30], req:46 },
      { name:'전쟁망치',   ilvl:16, dmg:[19,44], req:62 },
      { name:'룬검',      ilvl:21, dmg:[28,62], req:80 },
      { name:'신성검',    ilvl:26, dmg:[40,86], req:100 },
      { name:'심판의검',   ilvl:30, dmg:[55,115], req:120 },
      { name:'퓨린검',     ilvl:34, dmg:[72,150], req:145 },
    ],
    armor: [
      { name:'가죽갑옷',   ilvl:1,  armor:6,  req:0 },
      { name:'사슬갑옷',   ilvl:4,  armor:14, req:15 },
      { name:'반판갑옷',   ilvl:8,  armor:24, req:34 },
      { name:'풀플레이트', ilvl:13, armor:38, req:55 },
      { name:'용비늘갑옷', ilvl:19, armor:58, req:80 },
      { name:'신성갑옷',   ilvl:25, armor:82, req:110 },
    ],
    helm: [
      { name:'가죽모자',   ilvl:1,  armor:3,  req:0 },
      { name:'철투구',     ilvl:5,  armor:8,  req:18 },
      { name:'풀헬름',     ilvl:10, armor:14, req:34 },
      { name:'그레이트헬름', ilvl:16, armor:22, req:52 },
      { name:'용왕관',     ilvl:22, armor:32, req:75 },
    ],
    shield: [
      { name:'버클러',    ilvl:1,  armor:2,  req:0 },
      { name:'라운드실드', ilvl:5,  armor:6,  req:16 },
      { name:'카이트실드', ilvl:10, armor:11, req:30 },
      { name:'타워실드',   ilvl:16, armor:18, req:50 },
      { name:'신성방패',   ilvl:22, armor:28, req:72 },
    ],
    boots: [
      { name:'가죽부츠',   ilvl:1,  armor:2,  req:0 },
      { name:'체인부츠',   ilvl:5,  armor:5,  req:14 },
      { name:'플레이트부츠',ilvl:10, armor:9,  req:30 },
      { name:'용비늘부츠', ilvl:16, armor:15, req:48 },
      { name:'신성부츠',   ilvl:22, armor:22, req:70 },
    ],
    gloves: [
      { name:'가죽장갑',   ilvl:1,  armor:2,  req:0 },
      { name:'체인장갑',   ilvl:5,  armor:5,  req:14 },
      { name:'플레이트장갑',ilvl:10, armor:9,  req:30 },
      { name:'용비늘장갑', ilvl:16, armor:15, req:48 },
      { name:'신성장갑',   ilvl:22, armor:22, req:70 },
    ],
    belt: [
      { name:'가죽띠',     ilvl:1,  armor:2,  req:0 },
      { name:'사슬띠',     ilvl:5,  armor:5,  req:14 },
      { name:'플레이트띠', ilvl:10, armor:9,  req:30 },
      { name:'용비늘띠',   ilvl:16, armor:15, req:48 },
      { name:'신성띠',     ilvl:22, armor:22, req:70 },
    ],
    amulet: [
      { name:'목걸이',     ilvl:3,  req:0 },
      { name:'은 목걸이',  ilvl:9,  req:0 },
      { name:'백금 목걸이',ilvl:16, req:0 },
      { name:'룬 목걸이',  ilvl:23, req:0 },
    ],
    ring: [
      { name:'구리반지',   ilvl:2,  req:0 },
      { name:'은반지',     ilvl:8,  req:0 },
      { name:'금반지',     ilvl:15, req:0 },
      { name:'룬반지',     ilvl:22, req:0 },
    ],
  };

  // ===== 접두 / 접미사 =====
  const PREFIX = [
    { name:'힘의',      stat:'str',    base:2,  per:1.0, cap:99 },
    { name:'민첩의',     stat:'dex',    base:2,  per:1.0, cap:99 },
    { name:'활력의',     stat:'vit',    base:2,  per:1.0, cap:99 },
    { name:'비전의',     stat:'enr',    base:2,  per:1.0, cap:99 },
    { name:'잔혹한',     stat:'dmgPct', base:10, per:3.0, cap:70 },
    { name:'굳건한',     stat:'armor',  base:4,  per:2.0, cap:99 },
    { name:'거인의',     stat:'maxHp',  base:10, per:5.0, cap:99 },
    { name:'치명적인',    stat:'crit',   base:2,  per:0.5, cap:15 },
    { name:'빠른',       stat:'moveSpd',base:2,  per:0.5, cap:22 },
    { name:'화염의',     stat:'fireDmg',base:1,  per:0.9, cap:45 },
    { name:'번개의',     stat:'lightDmg',base:1, per:0.9, cap:45 },
    { name:'작열의',     stat:'procFire',  base:2, per:0.3, cap:14 },
    { name:'빙결의',     stat:'procFrost', base:2, per:0.3, cap:14 },
  ];
  const SUFFIX = [
    { name:'of 힘',       stat:'str',     base:3,  per:1.0, cap:99 },
    { name:'of 민첩',     stat:'dex',     base:3,  per:1.0, cap:99 },
    { name:'of 활력',     stat:'vit',     base:3,  per:1.0, cap:99 },
    { name:'of 고래',     stat:'maxHp',   base:12, per:6.0, cap:99 },
    { name:'of 마나',     stat:'maxMp',   base:6,  per:3.0, cap:99 },
    { name:'of 흡혈',     stat:'leech',   base:1,  per:0.3, cap:12 },
    { name:'of 서리',     stat:'coldDmg', base:1,  per:0.8, cap:40 },
    { name:'of 속도',     stat:'moveSpd', base:2,  per:0.5, cap:22 },
    { name:'of 치명',     stat:'crit',    base:2,  per:0.6, cap:18 },
    { name:'of 광전',     stat:'dmgPct',  base:6,  per:2.0, cap:60 },
    { name:'of 화염',     stat:'fireDmg', base:1,  per:0.9, cap:45 },
    { name:'of 번개',     stat:'lightDmg',base:1, per:0.9, cap:45 },
    { name:'of 뇌우',     stat:'procChain',base:2, per:0.3, cap:12 },
  ];

  // ===== 희귀도 =====
  const RARITY = {
    normal: { name:'보통',   color:'#cfd6e6', pre:0, suf:0, weight:48 },
    magic:  { name:'마법',   color:'#6f9bff', pre:1, suf:1, weight:30 },
    rare:   { name:'희귀',   color:'#ffe066', pre:2, suf:1, weight:15 },
    epic:   { name:'에픽',   color:'#c06bff', pre:3, suf:2, weight:6 },
    unique: { name:'유니크', color:'#ff9b3a', pre:0, suf:0, weight:1 },
  };
  const RAR_KEYS = Object.keys(RARITY);

  function rollRarity() {
    let tot = 0; for (const k of RAR_KEYS) tot += RARITY[k].weight;
    let r = Math.random() * tot;
    for (const k of RAR_KEYS) { r -= RARITY[k].weight; if (r <= 0) return k; }
    return 'normal';
  }

  // ===== 유니크 아이템 =====
  const UNIQUES = [
    { name:'엑스칼리버', slot:'weapon', dmg:[25,60], str:15, dmgPct:25, crit:12, ilvl:20 },
    { name:'불멸의갑옷', slot:'armor',   armor:55, maxHp:100, vit:15, ilvl:20 },
    { name:'현자의왕관', slot:'helm',    armor:20, enr:25, maxMp:80, ilvl:18 },
    { name:'스톰실드',   slot:'shield',  armor:30, dex:18, crit:8, ilvl:16 },
    { name:'바람의장화', slot:'boots',   armor:12, moveSpd:20, dex:12, ilvl:14 },
    { name:'피의건틀릿', slot:'gloves',  armor:14, str:14, leech:5, ilvl:15 },
    { name:'타이탄벨트', slot:'belt',    armor:16, maxHp:70, str:10, ilvl:16 },
    { name:'아케인아뮬렛',slot:'amulet', enr:20, maxMp:100, dmgPct:15, ilvl:18 },
    { name:'룬반지',     slot:'ring',    crit:10, dex:15, moveSpd:8, ilvl:17 },
    // 원소 / 프로크 유니크
    { name:'라바블레이드', slot:'weapon', dmg:[30,70], fireDmg:[18,40], procFire:10, str:10, ilvl:22 },
    { name:'프로스트바이트', slot:'weapon', dmg:[28,66], coldDmg:[20,46], procFrost:12, dex:14, ilvl:22 },
    { name:'스톰브링거',  slot:'weapon', dmg:[26,64], lightDmg:[16,42], procChain:12, crit:10, ilvl:24 },
    { name:'태양의투구',   slot:'helm',   armor:24, fireDmg:[10,24], maxHp:60, str:10, ilvl:20 },
    { name:'심장의아뮬렛', slot:'amulet', leech:8, maxHp:80, str:14, crit:6, ilvl:20 },
    { name:'회오리반지',   slot:'ring',   procChain:8, dex:16, moveSpd:6, crit:6, ilvl:19 },
  ];

  // ===== 포션 =====
  const POTIONS = {
    hp: [
      { name:'체력 물약',    ilvl:1 },
      { name:'큰 체력 물약', ilvl:6 },
      { name:'영웅의 물약',  ilvl:14 },
      { name:'신성한 물약',  ilvl:22 },
    ],
    mp: [
      { name:'마나 물약',    ilvl:2 },
      { name:'큰 마나 물약', ilvl:8 },
      { name:'영웅의 마나 물약', ilvl:16 },
      { name:'신성한 마나 물약', ilvl:24 },
    ],
  };

  function rollPotion(mlvl, kind) {
    const k = kind || (Math.random() < 0.7 ? 'hp' : 'mp');
    const arr = POTIONS[k];
    const pool = arr.filter(p => p.ilvl <= mlvl + 3);
    const p = (pool.length ? pool[pool.length - 1] : arr[0]);
    return { kind: k, name: p.name, ilvl: p.ilvl, consumable: true, qty: 1, rarity: 'normal' };
  }

  // ===== 포션 heal 단일 출처 =====
  // game.js의 기존 potionHeal() 공식과 동등 (hp: 45+lv*12, mp: 40+lv*10).
  // 외부에서 RPG.potionHeal(kind, level)로 사용. game.js는 수정하지 않음.
  function potionHeal(kind, level) {
    return kind === 'mp' ? 40 + level * 10 : 45 + level * 12;
  }

  // ===== 유틸 =====
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function affixVal(af, mlvl) {
    const v = Math.max(1, af.base + Math.floor(mlvl * af.per));
    return Math.min(v, af.cap);
  }

  function blankItem(slot, base, mlvl) {
    return {
      slot, baseName: base.name, ilvl: Math.max(base.ilvl, mlvl),
      dmg: base.dmg ? [base.dmg[0], base.dmg[1]] : null,
      armor: base.armor || 0,
      req: base.req || 0,
      rarity: 'normal', affixes: [],
      str: 0, dex: 0, vit: 0, enr: 0,
      maxHp: 0, maxMp: 0, dmgPct: 0, crit: 0, leech: 0, moveSpd: 0,
      coldDmg: [0, 0], fireDmg: [0, 0], lightDmg: [0, 0],
      procFire: 0, procFrost: 0, procChain: 0,
    };
  }

  const ARRAY_STATS = new Set(['coldDmg', 'fireDmg', 'lightDmg']);
  function addAffix(item, pool, mlvl, used) {
    const avail = pool.filter(a => !used.has(a.name));
    if (!avail.length) return;
    const af = pick(avail);
    used.add(af.name);
    const v = affixVal(af, mlvl);
    if (ARRAY_STATS.has(af.stat)) { item[af.stat][0] += v; item[af.stat][1] += v * 2; }
    else { item[af.stat] += v; }
    item.affixes.push({ name: af.name, stat: af.stat, val: v });
  }

  function labelOf(it) {
    if (it.rarity === 'unique' || it.unique) return it.name || it.baseName;
    let pre = [], suf = [];
    for (const a of it.affixes) {
      if (a.name.startsWith('of ')) suf.push(a.name.slice(3));
      else pre.push(a.name);
    }
    let s = it.baseName;
    if (pre.length) s = pre[0] + ' ' + s;
    if (suf.length) s = s + ' of ' + suf[0];
    return s;
  }

  function finalize(it) {
    it.label = labelOf(it);
    it.color = RARITY[it.rarity].color;
    // dmgPct는 전투시 합산 적용 — 베이스에 접지 않음
  }

  function makeItem(slot, base, rarity, mlvl) {
    const it = blankItem(slot, base, mlvl);
    it.rarity = rarity;
    const rc = RARITY[rarity];
    const used = new Set();
    for (let i = 0; i < rc.pre; i++) addAffix(it, PREFIX, mlvl, used);
    used.clear();
    for (let i = 0; i < rc.suf; i++) addAffix(it, SUFFIX, mlvl, used);
    finalize(it);
    return it;
  }

  function makeUnique(u, mlvl) {
    const it = blankItem(u.slot, { name: u.name, ilvl: u.ilvl || 20, dmg: u.dmg, armor: u.armor, req: 0 }, u.ilvl || 20);
    it.rarity = 'unique'; it.unique = true;
    it.dmg = u.dmg ? [u.dmg[0], u.dmg[1]] : null;
    it.armor = u.armor || 0;
    for (const k of ['str','dex','vit','enr','maxHp','maxMp','dmgPct','crit','leech','moveSpd','procFire','procFrost','procChain']) {
      if (u[k]) it[k] = u[k];
    }
    for (const k of ['coldDmg','fireDmg','lightDmg']) { if (u[k]) it[k] = [u[k][0], u[k][1]]; }
    it.name = u.name;
    finalize(it);
    return it;
  }

  function rollItem(mlvl, opts) {
    opts = opts || {};
    if (opts.forceSlot) {
      const pool = BASES[opts.forceSlot].filter(b => b.ilvl <= mlvl + 5);
      const base = pool.length ? pool[pool.length - 1] : BASES[opts.forceSlot][0];
      let rarity = opts.rarity || rollRarity();
      if (rarity === 'unique') return makeUnique(pick(UNIQUES), mlvl);
      return makeItem(opts.forceSlot, base, rarity, mlvl);
    }
    // 유니크 굴림 (강제 희귀도가 아닐 때만)
    const uChance = 0.008 + mlvl * 0.0006;
    if (!opts.rarity && Math.random() < uChance) return makeUnique(pick(UNIQUES), mlvl);
    const slot = pick(SLOTS);
    const pool = BASES[slot].filter(b => b.ilvl <= mlvl + 5);
    const base = pool.length ? pool[pool.length - 1] : BASES[slot][0];
    let rarity = opts.rarity || rollRarity();
    if (rarity === 'unique') return makeUnique(pick(UNIQUES), mlvl);
    return makeItem(slot, base, rarity, mlvl);
  }

  // 적 사망시 전리품
  function rollDrop(enemy, mlvl) {
    const drops = { gold: 0, items: [], potions: [] };
    drops.gold = randInt(enemy.gold[0], enemy.gold[1]) + Math.floor(mlvl * 1.6);
    if (Math.random() < 0.24) drops.potions.push(rollPotion(mlvl));
    const itemChance = enemy.boss ? 1 : 0.32;
    if (Math.random() < itemChance) drops.items.push(rollItem(mlvl));
    if (enemy.boss) {
      for (let i = 0; i < 3; i++) drops.items.push(rollItem(mlvl, { rarity: i === 0 ? 'epic' : (i === 1 ? 'rare' : rollRarity()) }));
    }
    return drops;
  }

  // ===== 플레이어 능력치 합산 =====
  function newCharacter() {
    return {
      level: 1, xp: 0, gold: 0,
      statPts: 0,
      alloc: { str: 0, dex: 0, vit: 0, enr: 0 },
      equipped: {},
      backpack: [],
      pots: { hp: 2, mp: 1 }, // 시작 포션
      deaths: 0,
    };
    // 장비는 game.js에서 시작 무기/갑옷 부여
  }

  function makeStarter(mlvl) {
    const dagger = makeItem('weapon', BASES.weapon[0], 'normal', 1);
    const leather = makeItem('armor', BASES.armor[0], 'normal', 1);
    return { dagger, leather };
  }

  // ===== 스킬 / 주문 =====
  const SKILLS = {
    heavy: { name: '강타', cd: 38 },
    spells: [
      { id: 'fire',  name: '화염구',  cost: 12, cd: 24, color: '#ff8a3a' },
      { id: 'ice',   name: '빙결창',  cost: 10, cd: 20, color: '#6fd8ff' },
      { id: 'bolt',  name: '연쇄번개', cost: 16, cd: 32, color: '#ffe066' },
    ],
  };

  return {
    BASE, STAT_NAMES, STAT_ORDER, SLOTS, SLOT_NAMES, BASES, PREFIX, SUFFIX, RARITY, RAR_KEYS,
    ENEMIES, UNIQUES, POTIONS, SKILLS,
    xpForLevel, maxHp, maxMp,
    STAT_PER_LEVEL, HP_PER_LEVEL, MP_PER_LEVEL,
    randInt, pick, rollRarity, rollItem, makeItem, makeUnique, rollPotion, potionHeal, rollDrop,
    newCharacter, makeStarter, affixVal, labelOf,
  };
})();
