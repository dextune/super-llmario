'use strict';

/* RPG 데이터/생성기 무결성 검증 — node test-rpgdata.js
 *
 * • 외부 의존성 없음 (vm + fs + path)
 * • RNG 분포 검증 같은 flaky 테스트는 회피
 * • ENEMIES / SLOTS / RARITY의 구조, 베이스 아이템·유니크 일관성,
 *   starter / rollItem / rollPotion / 수치 함수(xpForLevel, maxHp, maxMp, affixVal)의
 *   결정적 불변조건만 검사한다.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// ============================================================================
// 테스트 러너 (최소)
// ============================================================================
let failed = 0;
let passed = 0;
const check = (cond, msg) => {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL:', msg); }
};
const eq = (a, b, msg) => check(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
const group = (name, fn) => { console.log(`\n[${name}]`); fn(); };

// ============================================================================
// vm 컨텍스트 구성: rpgdata.js 로드 + 향후 공용 모듈 가져오기 인프라
// ============================================================================
function loadModule(relPath) {
  const src = fs.readFileSync(path.join(__dirname, relPath), 'utf8');
  // 스크립트 마지막 표현식(IIFE 반환값)을 노출하도록 강제
  const wrapped = src + '\n;RPG;\n';
  return vm.runInContext(wrapped, ctx, { filename: relPath });
}

// rpgdata.js의 `const RPG = (() => { ... return obj; })();` 가 마직막 표현식이므로
// vm 스크립트 결과 = RPG 객체. 단, const 선언은 스크립트 스코프에 격리되므로
// 같은 스크립트 내에서 `RPG;` 평가가 가능하도록 동일 컨텍스트에서 실행.
const ctx = vm.createContext({ console, Math, Object, Set, Array, JSON });
const RPG = loadModule('js/rpgdata.js');

if (!RPG || typeof RPG !== 'object') {
  console.error('FAIL: RPG 모듈을 로드하지 못했습니다.');
  process.exit(1);
}

// ============================================================================
// 1. ENEMIES — 정의 일관성
// ============================================================================
group('ENEMIES', () => {
  const REQUIRED_KEYS = ['hp', 'dmg', 'xp', 'gold', 'speed', 'sight', 'fly', 'spr', 'size'];
  const TYPES = ['goomba', 'koopa', 'bat', 'skeleton', 'demon', 'ice', 'boss'];

  for (const t of TYPES) {
    check(RPG.ENEMIES[t], `ENEMIES.${t} 누락`);
  }

  for (const [name, e] of Object.entries(RPG.ENEMIES)) {
    for (const k of REQUIRED_KEYS) {
      check(k in e, `ENEMIES.${name}: ${k} 필드 없음`);
    }
    check(Number.isFinite(e.hp) && e.hp > 0, `ENEMIES.${name}.hp 양수`);
    check(Array.isArray(e.dmg) && e.dmg.length === 2 && e.dmg[0] <= e.dmg[1], `ENEMIES.${name}.dmg 범위`);
    check(Number.isFinite(e.xp) && e.xp > 0, `ENEMIES.${name}.xp 양수`);
    check(Array.isArray(e.gold) && e.gold.length === 2 && e.gold[0] <= e.gold[1], `ENEMIES.${name}.gold 범위`);
    check(e.speed > 0, `ENEMIES.${name}.speed 양수`);
    check(e.sight > 0, `ENEMIES.${name}.sight 양수`);
    check(Array.isArray(e.size) && e.size.length === 2 && e.size[0] > 0 && e.size[1] > 0, `ENEMIES.${name}.size`);
    check(typeof e.fly === 'boolean', `ENEMIES.${name}.fly boolean`);
    check(typeof e.spr === 'string' && e.spr.length > 0, `ENEMIES.${name}.spr 문자열`);
  }

  // 비행 적은 dmg[0] 가독을 위해 적어도 hp >= 1 유지
  const bat = RPG.ENEMIES.bat;
  check(bat.fly === true, 'bat.fly = true');
  check(!RPG.ENEMIES.goomba.fly, 'goomba.fly = false');

  // 보스 식별
  check(RPG.ENEMIES.boss.boss === true, 'ENEMIES.boss.boss = true');
  for (const [n, e] of Object.entries(RPG.ENEMIES)) {
    if (n !== 'boss') check(!e.boss, `일반 적 ${n}에 boss 플래그 잘못 설정`);
  }

  // color 필드 — game.js ENEMY_COLOR와 1:1 동일해야 함 (호환)
  const EXPECTED_COLOR = {
    goomba: '#a05a1c', koopa: '#3fa34d', bat: '#26243a',
    skeleton: '#e8e4cf', demon: '#d6221c', ice: '#a8dbff', boss: '#7a1410',
  };
  for (const [name, hex] of Object.entries(EXPECTED_COLOR)) {
    eq(RPG.ENEMIES[name].color, hex, `ENEMIES.${name}.color`);
  }
  for (const [name, e] of Object.entries(RPG.ENEMIES)) {
    check(typeof e.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(e.color), `ENEMIES.${name}.color 헥스`);
  }

  // spr 필드 — 기존 의미 유지 (스프라이트 프레임 prefix).
  // - goomba/koopa/bat/demon/ice/boss: base name과 동일
  // - skeleton: 'skel' (스프라이트 prefix는 base name과 다름, 의도된 호환)
  // - boss: 'boss' (별도 drawBoss 경로)
  const EXPECTED_SPR = {
    goomba: 'goomba', koopa: 'koopa', bat: 'bat',
    skeleton: 'skel', demon: 'demon', ice: 'ice', boss: 'boss',
  };
  for (const [name, pref] of Object.entries(EXPECTED_SPR)) {
    eq(RPG.ENEMIES[name].spr, pref, `ENEMIES.${name}.spr prefix`);
  }

  // 적 레벨 진행 — 지상 적은 단조 증가 (보스/bat 비행 제외)
  const groundOrder = ['goomba', 'koopa', 'skeleton', 'demon', 'ice'];
  for (let i = 1; i < groundOrder.length; i++) {
    const a = RPG.ENEMIES[groundOrder[i - 1]];
    const b = RPG.ENEMIES[groundOrder[i]];
    check(b.hp > a.hp, `지상 hp 진행 (${groundOrder[i-1]} -> ${groundOrder[i]})`);
    check(b.xp >= a.xp, `지상 xp 진행 (${groundOrder[i-1]} -> ${groundOrder[i]})`);
  }
  // bat는 약한 비행 적 — 자주 보여줄 수 있도록 의도적으로 약함
  check(RPG.ENEMIES.bat.hp < RPG.ENEMIES.koopa.hp, 'bat은 koopa보다 약함 (설계 불변)');
  check(RPG.ENEMIES.bat.speed > RPG.ENEMIES.koopa.speed, 'bat은 koopa보다 빠름 (설계 불변)');
});

// ============================================================================
// 2. SLOTS — 슬롯/베이스/표시 일관성
// ============================================================================
group('SLOTS', () => {
  const EXPECTED = ['weapon', 'armor', 'helm', 'shield', 'boots', 'gloves', 'belt', 'amulet', 'ring'];
  eq(RPG.SLOTS.length, EXPECTED.length, 'SLOTS 개수');
  for (const s of EXPECTED) {
    check(RPG.SLOTS.includes(s), `SLOTS에 ${s} 포함`);
    check(RPG.SLOT_NAMES[s], `SLOT_NAMES에 ${s} 등록`);
    check(RPG.BASES[s], `BASES에 ${s} 등록`);
    check(Array.isArray(RPG.BASES[s]) && RPG.BASES[s].length > 0, `BASES.${s} 비공배열`);
  }

  // 각 베이스 안의 모든 엔트리는 ilvl 오름차순, req 단조 비감소
  for (const [slot, arr] of Object.entries(RPG.BASES)) {
    for (let i = 1; i < arr.length; i++) {
      check(arr[i].ilvl > arr[i - 1].ilvl, `${slot}[${i}].ilvl 오름차순`);
      check(arr[i].req >= arr[i - 1].req, `${slot}[${i}].req 단조`);
      check(typeof arr[i].name === 'string' && arr[i].name.length > 0, `${slot}[${i}].name`);
    }
    // 무기/방어구는 dmg 또는 armor 필드 존재
    for (const b of arr) {
      if (slot === 'weapon') check(Array.isArray(b.dmg) && b.dmg.length === 2, `${slot}/${b.name} dmg`);
      else if (slot !== 'amulet' && slot !== 'ring') check(Number.isFinite(b.armor), `${slot}/${b.name} armor`);
    }
  }
});

// ============================================================================
// 3. RARITY — 희귀도 일관성
// ============================================================================
group('RARITY', () => {
  const EXPECTED = ['normal', 'magic', 'rare', 'epic', 'unique'];
  for (const k of EXPECTED) check(RPG.RARITY[k], `RARITY.${k} 누락`);
  eq(RPG.RAR_KEYS.length, EXPECTED.length, 'RAR_KEYS 개수');

  let totalWeight = 0;
  for (const [k, r] of Object.entries(RPG.RARITY)) {
    check(typeof r.name === 'string' && r.name.length > 0, `RARITY.${k}.name`);
    check(typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color), `RARITY.${k}.color 헥스`);
    check(Number.isFinite(r.weight) && r.weight > 0, `RARITY.${k}.weight 양수`);
    check(Number.isFinite(r.pre) && r.pre >= 0, `RARITY.${k}.pre >= 0`);
    check(Number.isFinite(r.suf) && r.suf >= 0, `RARITY.${k}.suf >= 0`);
    totalWeight += r.weight;
  }
  check(totalWeight > 0, 'RARITY 전체 가중치 합 양수');

  // unique는 접사 구성 없음 (라벨은 원본 이름)
  eq(RPG.RARITY.unique.pre, 0, 'unique.pre');
  eq(RPG.RARITY.unique.suf, 0, 'unique.suf');

  // 희귀도가 올라가면 일반적으로 pre+suf도 늘거나 같음 (unique 제외)
  const order = ['normal', 'magic', 'rare', 'epic'];
  for (let i = 1; i < order.length; i++) {
    const a = RPG.RARITY[order[i - 1]];
    const b = RPG.RARITY[order[i]];
    check(b.pre + b.suf >= a.pre + a.suf, `${order[i]}의 접사 수가 ${order[i-1]} 이상`);
  }
});

// ============================================================================
// 4. UNIQUES — 값 일관성
// ============================================================================
group('UNIQUES', () => {
  const used = new Set();
  for (const u of RPG.UNIQUES) {
    check(typeof u.name === 'string' && u.name.length > 0, `unique.name`);
    check(!used.has(u.name), `unique.name 중복: ${u.name}`);
    used.add(u.name);
    check(RPG.SLOTS.includes(u.slot), `unique.${u.name}.slot 유효`);
    check(Number.isFinite(u.ilvl) && u.ilvl > 0, `unique.${u.name}.ilvl`);
    // 무기면 dmg 필요, 방어구면 armor 필요
    if (u.slot === 'weapon') check(Array.isArray(u.dmg) && u.dmg.length === 2, `unique.${u.name} dmg`);
    else if (['amulet', 'ring'].indexOf(u.slot) < 0) check(Number.isFinite(u.armor), `unique.${u.name} armor`);
  }

  // 원소 dmg 범위는 [a,b] a <= b
  for (const u of RPG.UNIQUES) {
    for (const k of ['coldDmg', 'fireDmg', 'lightDmg']) {
      if (u[k]) check(u[k][0] <= u[k][1], `unique.${u.name}.${k} 범위`);
    }
  }
});

// ============================================================================
// 5. POTIONS — 포션 데이터
// ============================================================================
group('POTIONS', () => {
  for (const k of ['hp', 'mp']) {
    check(Array.isArray(RPG.POTIONS[k]) && RPG.POTIONS[k].length > 0, `POTIONS.${k} 비공배열`);
    for (let i = 1; i < RPG.POTIONS[k].length; i++) {
      check(RPG.POTIONS[k][i].ilvl > RPG.POTIONS[k][i - 1].ilvl, `POTIONS.${k} ilvl 오름차순`);
    }
  }
});

// ============================================================================
// 6. makeStarter — 시작 장비
// ============================================================================
group('makeStarter', () => {
  const s = RPG.makeStarter(1);
  check(s && s.dagger && s.leather, 'starter 구성');
  eq(s.dagger.slot, 'weapon', 'starter.dagger.slot');
  eq(s.dagger.rarity, 'normal', 'starter.dagger.rarity');
  eq(s.dagger.ilvl, 1, 'starter.dagger.ilvl');
  check(Array.isArray(s.dagger.dmg) && s.dagger.dmg.length === 2, 'starter.dagger.dmg');
  check(s.dagger.dmg[0] >= 1 && s.dagger.dmg[1] >= s.dagger.dmg[0], 'starter.dagger.dmg 범위');

  eq(s.leather.slot, 'armor', 'starter.leather.slot');
  eq(s.leather.rarity, 'normal', 'starter.leather.rarity');
  check(s.leather.armor >= 1, 'starter.leather.armor > 0');
  check(s.leather.label && s.leather.label.length > 0, 'starter.leather.label');
});

// ============================================================================
// 7. rollItem — 결정적 불변조건 (rarity/slot 강제)
// ============================================================================
function isAffixArrayStats(stat) {
  return stat === 'coldDmg' || stat === 'fireDmg' || stat === 'lightDmg';
}

group('rollItem / makeItem', () => {
  // (a) 모든 슬롯 × 모든 강제 희귀도 조합에서 구조적 유효성
  for (const slot of RPG.SLOTS) {
    for (const rarity of ['normal', 'magic', 'rare', 'epic']) {
      const it = RPG.rollItem(8, { forceSlot: slot, rarity });
      check(it, `${slot}/${rarity} 생성`);
      eq(it.slot, slot, `${slot}/${rarity} slot`);
      eq(it.rarity, rarity, `${slot}/${rarity} rarity`);
      check(it.baseName && typeof it.baseName === 'string', `${slot}/${rarity} baseName`);
      check(it.ilvl >= 1, `${slot}/${rarity} ilvl >= 1`);
      check(it.label && typeof it.label === 'string' && it.label.length > 0, `${slot}/${rarity} label`);
      check(typeof it.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(it.color), `${slot}/${rarity} color`);

      const rc = RPG.RARITY[rarity];
      eq(it.affixes.length, rc.pre + rc.suf, `${slot}/${rarity} 접사 개수`);

      // 접사 검증: 같은 이름 중복 금지, 모든 접사의 stat은 item에 반영됨
      const seen = new Set();
      for (const af of it.affixes) {
        check(!seen.has(af.name), `${slot}/${rarity} 접사 중복 ${af.name}`);
        seen.add(af.name);
        check(Number.isFinite(af.val) && af.val >= 1, `${slot}/${rarity} 접사 val>=1`);
        if (isAffixArrayStats(af.stat)) {
          check(Array.isArray(it[af.stat]) && it[af.stat].length === 2, `${slot}/${rarity} ${af.stat} 배열`);
          check(it[af.stat][1] >= it[af.stat][0], `${slot}/${rarity} ${af.stat} 범위`);
        } else {
          check(Number.isFinite(it[af.stat]), `${slot}/${rarity} ${af.stat} 수치`);
        }
      }

      // 라벨 검증: normal이면 베이스 이름만, magic+면 접두/접미 포함
      if (rarity === 'normal') {
        eq(it.label, it.baseName, `${slot}/normal label`);
      } else {
        if (rc.pre > 0) check(it.label.includes(' ') || it.label.includes('of '), `${slot}/${rarity} label 접두/접미`);
      }
    }
  }

  // (b) 같은 슬롯/희귀도/아이템 레벨이라도 호출 간 라벨/ilvl 구조는 동일 베이스 풀에서 나옴
  for (let i = 0; i < 5; i++) {
    const a = RPG.rollItem(10, { forceSlot: 'weapon', rarity: 'rare' });
    const b = RPG.rollItem(10, { forceSlot: 'weapon', rarity: 'rare' });
    check(a.ilvl >= 10 && a.ilvl <= 15, 'weapon ilvl mlvl+5 이내');
    check(b.ilvl >= 10 && b.ilvl <= 15, 'weapon ilvl mlvl+5 이내');
    check(a.affixes.length === 3, 'rare 접사 3개'); // 2 prefix + 1 suffix
  }

  // (c) affixVal 단조성: mlvl이 올라가면 값이 단조 비감소 (cap 도달 전까지)
  for (const af of RPG.PREFIX.concat(RPG.SUFFIX)) {
    const v1 = RPG.affixVal(af, 1);
    const v5 = RPG.affixVal(af, 5);
    const v20 = RPG.affixVal(af, 20);
    check(v1 >= 1 && v1 <= af.cap, `affixVal(${af.name},1) 범위`);
    check(v5 >= v1, `affixVal(${af.name},5) >= affixVal(1)`);
    check(v20 >= v5, `affixVal(${af.name},20) >= affixVal(5)`);
    check(v20 <= af.cap, `affixVal(${af.name},20) <= cap`);
  }

  // (d) unique 강제
  for (let i = 0; i < 20; i++) {
    const u = RPG.rollItem(30, { rarity: 'unique' });
    check(u.rarity === 'unique', 'force unique -> rarity=unique');
    check(u.unique === true, 'unique 플래그');
    check(u.name && u.name.length > 0, 'unique.name');
    check(u.label === u.name, 'unique label = name');
    check(typeof u.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(u.color, 'unique.color'), 'unique.color 헥스');
  }
});

// ============================================================================
// 8. rollPotion — 결정적 불변조건
// ============================================================================
group('rollPotion', () => {
  // kind 명시: 동일 인자에서 구조 일관성 + kind 그대로 반환 (Phase 2-5)
  for (const kind of ['hp', 'mp']) {
    for (let lv = 1; lv <= 30; lv += 3) {
      const p = RPG.rollPotion(lv, kind);
      eq(p.kind, kind, `rollPotion(${lv}, ${kind}).kind`);
      check(p.consumable === true, 'rollPotion consumable');
      check(Number.isFinite(p.ilvl) && p.ilvl >= 1, 'rollPotion ilvl >= 1');
      check(p.name && p.name.length > 0, 'rollPotion name');
      check(p.qty === 1, 'rollPotion qty = 1');
      eq(p.rarity, 'normal', 'rollPotion rarity = normal');
    }
  }

  // mlvl이 매우 높아도 ilvl은 마이너가 되지 않음
  const hi = RPG.rollPotion(40, 'hp');
  check(hi.ilvl >= 1 && hi.ilvl <= 40, 'hi mlvl potion ilvl 범위');

  // kind 미지정 시 hp/mp 둘 중 하나 (랜덤)
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(RPG.rollPotion(5, undefined).kind);
  check(seen.has('hp') || seen.has('mp'), 'rollPotion 무작위 kind 도출');
  for (const k of seen) {
    check(k === 'hp' || k === 'mp', `무작위 kind 유효: ${k}`);
  }

  // 동일 pot 풀에서 선택된 항목의 heal/name/ilvl이 kind의 POTIONS와 일치
  const sample = RPG.rollPotion(25, 'mp');
  const pool = RPG.POTIONS.mp.filter(x => x.ilvl <= 25 + 3);
  const expected = pool.length ? pool[pool.length - 1] : RPG.POTIONS.mp[0];
  eq(sample.name, expected.name, 'rollPotion 선택된 이름');
  eq(sample.heal, expected.heal, 'rollPotion 선택된 heal');
  eq(sample.ilvl, expected.ilvl, 'rollPotion 선택된 ilvl');
});

// ============================================================================
// 8.1 potionHeal — game.js의 potionHeal()과 동등한 단일 출처 (Phase 2-4)
// ============================================================================
group('potionHeal', () => {
  // game.js 공식: hp = 45 + lv*12, mp = 40 + lv*10
  for (let lv = 1; lv <= 30; lv++) {
    eq(RPG.potionHeal('hp', lv), 45 + lv * 12, `potionHeal('hp', ${lv}) = 45+lv*12`);
    eq(RPG.potionHeal('mp', lv), 40 + lv * 10, `potionHeal('mp', ${lv}) = 40+lv*10`);
  }
  // 기본값은 hp (game.js 동작과 일치: kind === 'hp' 분기)
  eq(RPG.potionHeal(undefined, 1), 45 + 12, 'potionHeal 기본 = hp');
  eq(RPG.potionHeal('hp', 1), 57, 'potionHeal hp lv1');
  eq(RPG.potionHeal('mp', 1), 50, 'potionHeal mp lv1');
  // 양수성
  for (let lv = 1; lv <= 50; lv++) {
    check(RPG.potionHeal('hp', lv) > 0, 'potionHeal hp 양수');
    check(RPG.potionHeal('mp', lv) > 0, 'potionHeal mp 양수');
  }
});

// ============================================================================
// 9. 수치 함수 결정적 불변조건
// ============================================================================
group('xpForLevel / maxHp / maxMp', () => {
  check(RPG.xpForLevel(1) > 0, 'xpForLevel(1) > 0');
  for (let lv = 1; lv <= 50; lv++) {
    const a = RPG.xpForLevel(lv);
    const b = RPG.xpForLevel(lv + 1);
    check(a > 0 && b > 0, `xpForLevel(${lv}) 양수`);
    check(b > a, `xpForLevel 단조 lv${lv}->${lv+1}`);
  }

  // maxHp: 기본 활력 10, 레벨 1, 활력 10 => 28 + 1*12 + 0 = 40
  eq(RPG.maxHp(1, RPG.BASE.vit), 40, 'maxHp(1, base vit)');
  check(RPG.maxHp(10, 20) > RPG.maxHp(10, 10), 'maxHp 활력 증가');
  check(RPG.maxHp(20, 10) > RPG.maxHp(10, 10), 'maxHp 레벨 증가');

  // maxMp: 기본 에너지 10, 레벨 1 => 10 + 1*4 + 0 = 14
  eq(RPG.maxMp(1, RPG.BASE.enr), 14, 'maxMp(1, base enr)');
  check(RPG.maxMp(10, 20) > RPG.maxMp(10, 10), 'maxMp 에너지 증가');
  check(RPG.maxMp(20, 10) > RPG.maxMp(10, 10), 'maxMp 레벨 증가');

  // BASE 구조
  for (const k of ['str', 'dex', 'vit', 'enr']) {
    check(RPG.BASE[k] === 10, `BASE.${k} = 10`);
    check(RPG.STAT_NAMES[k], `STAT_NAMES.${k}`);
    check(RPG.STAT_ORDER.includes(k), `STAT_ORDER에 ${k}`);
  }
  eq(RPG.STAT_ORDER.length, 4, 'STAT_ORDER 4개');
  eq(RPG.STAT_PER_LEVEL, 5, 'STAT_PER_LEVEL = 5');
  eq(RPG.HP_PER_LEVEL, 12, 'HP_PER_LEVEL = 12');
  eq(RPG.MP_PER_LEVEL, 4, 'MP_PER_LEVEL = 4');
});

// ============================================================================
// 10. labelOf — 라벨링 불변조건
// ============================================================================
group('labelOf', () => {
  // normal: 베이스만
  const norm = RPG.rollItem(5, { forceSlot: 'weapon', rarity: 'normal' });
  eq(RPG.labelOf(norm), norm.baseName, 'normal label = baseName');

  // unique: 원본 이름
  const u = RPG.rollItem(20, { rarity: 'unique' });
  check(RPG.labelOf(u) === u.name, 'unique label = name');
});

// ============================================================================
// 11. SKILLS — 스킬 메타
// ============================================================================
group('SKILLS', () => {
  check(RPG.SKILLS.heavy && RPG.SKILLS.heavy.cd > 0, 'SKILLS.heavy');
  check(Array.isArray(RPG.SKILLS.spells) && RPG.SKILLS.spells.length > 0, 'SKILLS.spells');
  const seen = new Set();
  for (const s of RPG.SKILLS.spells) {
    check(s.id && !seen.has(s.id), `spell.id 중복 없음: ${s.id}`);
    seen.add(s.id);
    check(s.name && s.cost > 0 && s.cd > 0 && s.color, `spell ${s.id} 필드`);
  }
});

// ============================================================================
// 결과
// ============================================================================
console.log(`\n총 ${passed}개 통과, ${failed}개 실패`);
if (failed) {
  console.error('RPG 회귀 테스트 실패');
  process.exit(1);
}
console.log('ALL RPG DATA CHECKS PASSED');
