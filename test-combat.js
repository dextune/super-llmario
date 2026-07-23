'use strict';

/* GameCombat (js/combat.js) 단위 테스트 — node test-combat.js
 *
 * • 외부 의존 없음 (vm + fs + path).
 * • rpgdata.js → balance.js → combat.js 순서로 로드 (game.js의 HTML 스크립트 순서와 일치).
 * • 결정적 RNG를 주입하여 damageRoll / applyStatus / colorOf의 수치가
 *   game.js 원본과 정확히 일치함을 검증.
 * • game.js의 damageRoll은 원래 HS 클로저에 의존하므로, 테스트는
 *   stats를 명시적으로 주입하는 참조 구현과 combat.js 출력을 비교한다.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// ============================================================================
// 테스트 러너
// ============================================================================
let failed = 0;
let passed = 0;
const check = (cond, msg) => {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL:', msg); }
};
const eq = (a, b, msg) => check(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
const close = (a, b, msg) => check(Math.abs(a - b) < 1e-9, `${msg} (got ${a}, expected ${b})`);
const group = (name, fn) => { console.log(`\n[${name}]`); fn(); };

// ============================================================================
// vm 로드: rpgdata → balance → combat
// ============================================================================
const ctx = vm.createContext({ Math, Object, Array, JSON, console });

const rpgdataSrc  = fs.readFileSync(path.join(__dirname, 'js', 'rpgdata.js'),  'utf8');
const balanceSrc  = fs.readFileSync(path.join(__dirname, 'js', 'balance.js'),  'utf8');
const combatSrc   = fs.readFileSync(path.join(__dirname, 'js', 'combat.js'),   'utf8');

const combined =
  rpgdataSrc + '\n;\n' +
  balanceSrc + '\n;\n' +
  combatSrc  + '\n;\n' +
  '({ RPG: RPG, BALANCE: BALANCE, GameCombat: GameCombat });';

const mods = vm.runInContext(combined, ctx, { filename: 'combat-stack.js' });
const RPG = mods.RPG, BALANCE = mods.BALANCE, GameCombat = mods.GameCombat;

if (!GameCombat || typeof GameCombat !== 'object') {
  console.error('FAIL: GameCombat 모듈을 로드하지 못했습니다.');
  process.exit(1);
}
if (!BALANCE || !BALANCE.STATUS) {
  console.error('FAIL: BALANCE.STATUS를 로드하지 못했습니다.');
  process.exit(1);
}

// ============================================================================
// 결정적 RNG (Numerical Recipes LCG, 32-bit)
// ============================================================================
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  return {
    random: next,
    randInt: (a, b) => Math.floor(a + next() * (b - a + 1)),
  };
}

// 표준 입력 stats (HS의 combat-relevant 부분만)
function mkStats(overrides) {
  return Object.assign({
    weaponDmg: [1, 4],
    str: 10,
    dmgPct: 0,
    crit: 5,
    fireDmg:  [0, 0],
    coldDmg:  [0, 0],
    lightDmg: [0, 0],
  }, overrides || {});
}

// game.js 원본 동작의 1:1 모사 (RNG 호출 순서까지 동일)
function refDamageRoll(stats, mult, rng) {
  const ri = rng.randInt, r = rng.random;
  let mn = stats.weaponDmg[0] + Math.floor(stats.str * 0.8);
  let mx = stats.weaponDmg[1] + Math.floor(stats.str * 0.8);
  mn = Math.floor(mn * (1 + stats.dmgPct / 100));
  mx = Math.floor(mx * (1 + stats.dmgPct / 100));
  let dmg = ri(mn, mx);
  const crit = r() * 100 < stats.crit;
  if (crit) dmg = Math.floor(dmg * 1.8);
  const fire  = ri(stats.fireDmg[0],  stats.fireDmg[1]);
  const cold  = ri(stats.coldDmg[0],  stats.coldDmg[1]);
  const light = ri(stats.lightDmg[0], stats.lightDmg[1]);
  dmg += fire + cold + light;
  if (mult) dmg = Math.max(1, Math.floor(dmg * mult));
  let el = null;
  if (light >= fire && light >= cold && light > 0) el = 'light';
  else if (fire >= cold && fire > 0)               el = 'fire';
  else if (cold > 0)                               el = 'cold';
  return { dmg, crit, element: el };
}

function refApplyStatus(enemy, element, stats, rng) {
  const r = rng.random;
  if (element === 'fire') {
    enemy.burn = 180;
    enemy.burnDmg = Math.max(enemy.burnDmg, Math.floor(stats.fireDmg[1] * 0.25) + 2);
  } else if (element === 'cold') {
    enemy.chill = 120;
    if (r() < 0.35) enemy.frozen = 50;
  } else if (element === 'light') {
    if (enemy.shock < 8) enemy.shock = 24;
  }
}

// ============================================================================
// 1. 노출 인터페이스
// ============================================================================
group('interface', () => {
  for (const k of ['damageRoll', 'applyStatus', 'colorOf']) {
    check(typeof GameCombat[k] === 'function', `GameCombat.${k} 함수 노출`);
  }
  check(GameCombat.ELEM_COLOR && typeof GameCombat.ELEM_COLOR === 'object', 'ELEM_COLOR 객체 노출');
  eq(GameCombat.ELEM_COLOR.fire,  '#ff8a3a', 'ELEM_COLOR.fire');
  eq(GameCombat.ELEM_COLOR.cold,  '#6fd8ff', 'ELEM_COLOR.cold');
  eq(GameCombat.ELEM_COLOR.light, '#ffe066', 'ELEM_COLOR.light');
});

// ============================================================================
// 2. colorOf — 색상 해석
// ============================================================================
group('colorOf', () => {
  eq(GameCombat.colorOf('fire', true),  '#ffd23e', 'crit+fire → #ffd23e');
  eq(GameCombat.colorOf('cold', true),  '#ffd23e', 'crit+cold → #ffd23e');
  eq(GameCombat.colorOf('light', true), '#ffd23e', 'crit+light → #ffd23e');
  eq(GameCombat.colorOf('fire', false), '#ff8a3a', 'fire → #ff8a3a');
  eq(GameCombat.colorOf('cold', false), '#6fd8ff', 'cold → #6fd8ff');
  eq(GameCombat.colorOf('light', false),'#ffe066', 'light → #ffe066');
  eq(GameCombat.colorOf(null, false),       '#ffffff', 'null → #ffffff');
  eq(GameCombat.colorOf(undefined, false), '#ffffff', 'undefined → #ffffff');
  eq(GameCombat.colorOf('', false),        '#ffffff', '빈 문자열 → #ffffff');
  eq(GameCombat.colorOf('poison', false),  '#ffffff', 'unknown → #ffffff');
});

// ============================================================================
// 3. damageRoll — 기본 수치 (no crit, no element)
// ============================================================================
group('damageRoll: 기본 수치 (no element, no crit)', () => {
  // 무기 [10,10], str=10, dmgPct=0, crit=0 → min=max=10+floor(10*0.8)=18, no crit, no elem, mult=1.0
  const s = mkStats({ weaponDmg: [10, 10], str: 10, crit: 0 });
  const r = GameCombat.damageRoll(s, 1.0, makeRng(123));
  eq(r.dmg, 18, 'dmg = 10 + floor(10*0.8) = 18');
  eq(r.crit, false, 'crit=false');
  eq(r.element, null, 'element=null');
});

group('damageRoll: dmgPct 적용 (floor)', () => {
  // 무기 [10,10], str=0, dmgPct=50 → min=max=floor(10*1.5)=15
  const s = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0, dmgPct: 50 });
  const r = GameCombat.damageRoll(s, 1.0, makeRng(1));
  eq(r.dmg, 15, 'dmgPct 50% → floor(10*1.5) = 15');

  // dmgPct 100 → floor(10*2)=20
  const s2 = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0, dmgPct: 100 });
  const r2 = GameCombat.damageRoll(s2, 1.0, makeRng(1));
  eq(r2.dmg, 20, 'dmgPct 100% → floor(10*2) = 20');

  // dmgPct 33 (game.js의 dmgPct는 정수 %; 33 → *1.33)
  // floor(10 * 1.33) = floor(13.3) = 13
  const s3 = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0, dmgPct: 33 });
  const r3 = GameCombat.damageRoll(s3, 1.0, makeRng(1));
  eq(r3.dmg, 13, 'dmgPct 33% → floor(10*1.33) = 13');
});

group('damageRoll: crit 1.8x', () => {
  // 무기 [10,10], str=0, dmgPct=0, crit=100 → base=10, crit=true → floor(10*1.8)=18
  const s = mkStats({ weaponDmg: [10, 10], str: 0, dmgPct: 0, crit: 100 });
  const r = GameCombat.damageRoll(s, 1.0, makeRng(1));
  eq(r.dmg, 18, 'crit=100% → floor(10*1.8) = 18');
  eq(r.crit, true, 'crit=true');

  // crit=0 → false
  const r2 = GameCombat.damageRoll(mkStats({ weaponDmg: [10, 10], str: 0, dmgPct: 0, crit: 0 }), 1.0, makeRng(1));
  eq(r2.crit, false, 'crit=0% → false');
});

group('damageRoll: fire/cold/light 가산', () => {
  // 무기 [10,10], str=0, fire=[3,3], cold=[5,5], light=[2,2] → 10+3+5+2=20
  const s = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0,
    fireDmg: [3, 3], coldDmg: [5, 5], lightDmg: [2, 2] });
  const r = GameCombat.damageRoll(s, 1.0, makeRng(1));
  eq(r.dmg, 20, '10 + 3 + 5 + 2 = 20');

  // 무기 [5,5], fire=[10,10], cold=[10,10], light=[10,10] → 5+10+10+10=35
  const s2 = mkStats({ weaponDmg: [5, 5], str: 0, crit: 0,
    fireDmg: [10, 10], coldDmg: [10, 10], lightDmg: [10, 10] });
  const r2 = GameCombat.damageRoll(s2, 1.0, makeRng(1));
  eq(r2.dmg, 35, '5 + 10 + 10 + 10 = 35');
});

group('damageRoll: element 우선순위 (light > fire > cold > null)', () => {
  // light=10, fire=5, cold=5 → 'light'
  let s = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0,
    fireDmg: [5, 5], coldDmg: [5, 5], lightDmg: [10, 10] });
  eq(GameCombat.damageRoll(s, 1.0, makeRng(1)).element, 'light', 'light 우선');

  // fire=10, cold=5, light=5 → 'fire'
  s = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0,
    fireDmg: [10, 10], coldDmg: [5, 5], lightDmg: [5, 5] });
  eq(GameCombat.damageRoll(s, 1.0, makeRng(1)).element, 'fire', 'fire 우선');

  // cold=5, fire=3, light=2 → 'cold'
  s = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0,
    fireDmg: [3, 3], coldDmg: [5, 5], lightDmg: [2, 2] });
  eq(GameCombat.damageRoll(s, 1.0, makeRng(1)).element, 'cold', 'cold 우선 (light<cold)');

  // cold only → 'cold'
  s = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0,
    fireDmg: [0, 0], coldDmg: [5, 5], lightDmg: [0, 0] });
  eq(GameCombat.damageRoll(s, 1.0, makeRng(1)).element, 'cold', 'cold 단독');

  // fire only → 'fire'
  s = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0,
    fireDmg: [5, 5], coldDmg: [0, 0], lightDmg: [0, 0] });
  eq(GameCombat.damageRoll(s, 1.0, makeRng(1)).element, 'fire', 'fire 단독');

  // 모두 0 → null
  s = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0,
    fireDmg: [0, 0], coldDmg: [0, 0], lightDmg: [0, 0] });
  eq(GameCombat.damageRoll(s, 1.0, makeRng(1)).element, null, '전부 0 → null');

  // light=0, fire=5, cold=5 → light=0 조건으로 fire (light>=fire이지만 light>0 실패)
  s = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0,
    fireDmg: [5, 5], coldDmg: [5, 5], lightDmg: [0, 0] });
  eq(GameCombat.damageRoll(s, 1.0, makeRng(1)).element, 'fire', 'light=0 → fire 우선');

  // 동률 (light=fire=cold=5) → light (>= 우선)
  s = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0,
    fireDmg: [5, 5], coldDmg: [5, 5], lightDmg: [5, 5] });
  eq(GameCombat.damageRoll(s, 1.0, makeRng(1)).element, 'light', '동률 → light');
});

group('damageRoll: mult 적용 (floor + max 1)', () => {
  const s = mkStats({ weaponDmg: [2, 2], str: 0, crit: 0 });

  // mult=0.5: floor(2*0.5)=1 → max(1,1)=1
  eq(GameCombat.damageRoll(s, 0.5, makeRng(1)).dmg, 1, 'mult 0.5: max(1, 1) = 1');

  // mult=0 (falsy) → if (mult) 건너뜀 → 원본 dmg 유지 = 2
  // (game.js 원본 시맨틱 보존: 0을 명시적으로 적용하지 않음)
  eq(GameCombat.damageRoll(s, 0, makeRng(1)).dmg, 2, 'mult 0: if(mult) falsy → 원본 유지 = 2');

  // mult=2: floor(2*2)=4
  eq(GameCombat.damageRoll(s, 2, makeRng(1)).dmg, 4, 'mult 2: floor(2*2) = 4');

  // mult=undefined (falsy) → 적용 안 됨
  eq(GameCombat.damageRoll(s, undefined, makeRng(1)).dmg, 2, 'mult undefined → 미적용 = 2');

  // mult=null (falsy) → 적용 안 됨
  eq(GameCombat.damageRoll(s, null, makeRng(1)).dmg, 2, 'mult null → 미적용 = 2');
});

group('damageRoll: 음수/NaN 보호 없음 (원본과 동일 시맨틱)', () => {
  // 원본은 mult=0에서도 max(1, ...) 보장만 함. 음수 mult는 floor 후 음수가 됨.
  // 이 동작을 combat.js도 그대로 따른다 (수치 보존이 우선).
  const s = mkStats({ weaponDmg: [10, 10], str: 0, crit: 0 });
  const r = GameCombat.damageRoll(s, -1, makeRng(1));
  // floor(10 * -1) = -10 → max(1, -10) = 1
  eq(r.dmg, 1, 'mult=-1: max(1, floor(10*-1)) = max(1, -10) = 1');
});

// ============================================================================
// 4. damageRoll — game.js 원본과 결정적 동치 (다양한 케이스)
// ============================================================================
group('damageRoll ↔ refDamageRoll (결정적 동치)', () => {
  const cases = [
    { label: '기본',          stats: { weaponDmg: [1, 8],   str: 14, dmgPct: 0,  crit: 8 } },
    { label: 'dmgPct+fire',   stats: { weaponDmg: [3, 12],  str: 20, dmgPct: 25, crit: 12, fireDmg: [2, 6] } },
    { label: '3원소 혼합',     stats: { weaponDmg: [5, 15],  str: 25, dmgPct: 50, crit: 25, fireDmg: [3, 8],  coldDmg: [4, 9],  lightDmg: [1, 4] } },
    { label: '만렙형 (crit75)',stats: { weaponDmg: [10, 20], str: 50, dmgPct: 100, crit: 75 } },
    { label: '시작형',         stats: { weaponDmg: [1, 2],   str: 10, dmgPct: 0,  crit: 5 } },
  ];
  const mults = [undefined, 0.5, 0.7, 1.0, 1.35, 1.6, 2.5];

  let i = 0;
  for (const c of cases) {
    for (const m of mults) {
      const s = mkStats(c.stats);
      const rA = GameCombat.damageRoll(s, m, makeRng(100 + i));
      const rB = refDamageRoll(s, m, makeRng(100 + i));
      eq(rA.dmg, rB.dmg, `${c.label} mult=${m}: dmg 동일`);
      eq(rA.crit, rB.crit, `${c.label} mult=${m}: crit 동일`);
      eq(rA.element, rB.element, `${c.label} mult=${m}: element 동일`);
      i++;
    }
  }
});

group('damageRoll: 같은 시드 → 같은 결과', () => {
  const s = mkStats({ weaponDmg: [3, 14], str: 17, dmgPct: 12, crit: 10,
    fireDmg: [2, 5], coldDmg: [1, 3], lightDmg: [0, 4] });

  const r1 = GameCombat.damageRoll(s, 1.0, makeRng(7777));
  const r2 = GameCombat.damageRoll(s, 1.0, makeRng(7777));
  eq(r1.dmg, r2.dmg, '동일 seed → 동일 dmg');
  eq(r1.crit, r2.crit, '동일 seed → 동일 crit');
  eq(r1.element, r2.element, '동일 seed → 동일 element');
});

group('damageRoll: 순수성 (호출이 입력 객체 stats를 변경하지 않음)', () => {
  const s = mkStats({ weaponDmg: [5, 10], str: 15, dmgPct: 10, crit: 12, fireDmg: [2, 8] });
  const snap = JSON.stringify(s);
  GameCombat.damageRoll(s, 1.0, makeRng(1));
  GameCombat.damageRoll(s, 1.5, makeRng(2));
  GameCombat.damageRoll(s, 0.5, makeRng(3));
  eq(JSON.stringify(s), snap, 'stats 객체 변경 없음');
});

// ============================================================================
// 5. applyStatus — fire
// ============================================================================
group('applyStatus: fire → burn/burnDmg', () => {
  const e = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  const s = mkStats({ fireDmg: [0, 100] });
  GameCombat.applyStatus(e, 'fire', s, makeRng(1));
  eq(e.burn, BALANCE.STATUS.burn.dur, `burn = BALANCE.STATUS.burn.dur (=${BALANCE.STATUS.burn.dur})`);
  // burnDmg = max(0, floor(100*0.25) + 2) = max(0, 27) = 27
  const expected = Math.floor(100 * BALANCE.STATUS.burn.dmgMul) + BALANCE.STATUS.burn.dmgFloor;
  eq(e.burnDmg, expected, `burnDmg = max(이전, ${expected})`);
});

group('applyStatus: fire → burnDmg max 보존', () => {
  // 기존 burnDmg=50 > 새 계산=27 → 유지
  const e1 = { burn: 0, burnDmg: 50, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e1, 'fire', mkStats({ fireDmg: [0, 100] }), makeRng(1));
  eq(e1.burnDmg, 50, '기존 burnDmg > 새 계산 → 기존 유지');

  // 기존=10 < 새=27 → 갱신
  const e2 = { burn: 0, burnDmg: 10, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e2, 'fire', mkStats({ fireDmg: [0, 100] }), makeRng(1));
  eq(e2.burnDmg, 27, '새 계산 > 기존 → 갱신');

  // 동률 → 유지 (max는 ≥)
  const e3 = { burn: 0, burnDmg: 27, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e3, 'fire', mkStats({ fireDmg: [0, 100] }), makeRng(1));
  eq(e3.burnDmg, 27, '동률 → 기존 유지');
});

group('applyStatus: fire → floor(0) + floor = 2 (최소값)', () => {
  // fireDmg=[0,0] → floor(0*0.25) + 2 = 2
  const e = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e, 'fire', mkStats({ fireDmg: [0, 0] }), makeRng(1));
  eq(e.burnDmg, BALANCE.STATUS.burn.dmgFloor, `burnDmg = floor(0) + dmgFloor (=${BALANCE.STATUS.burn.dmgFloor})`);
});

// ============================================================================
// 6. applyStatus — cold
// ============================================================================
group('applyStatus: cold → chill + freeze 룰렛', () => {
  // rng.random() < freezeChance (=0.35) → frozen = STATUS.frozen.dur
  const e1 = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e1, 'cold', mkStats(), { random: () => 0.1, randInt: RPG.randInt });
  eq(e1.chill, BALANCE.STATUS.chill.dur, 'chill = BALANCE.STATUS.chill.dur');
  eq(e1.frozen, BALANCE.STATUS.frozen.dur, 'frozen 적용 (random < freezeChance)');

  // random >= freezeChance → frozen = 0 (초기값)
  const e2 = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e2, 'cold', mkStats(), { random: () => 0.9, randInt: RPG.randInt });
  eq(e2.chill, BALANCE.STATUS.chill.dur, 'chill 적용 (random 무관)');
  eq(e2.frozen, 0, 'frozen 미적용 (random >= freezeChance)');

  // 경계값: random == freezeChance → false (strict <)
  const e3 = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e3, 'cold', mkStats(),
    { random: () => BALANCE.STATUS.chill.freezeChance, randInt: RPG.randInt });
  eq(e3.frozen, 0, 'random == freezeChance → 미적용 (strict <)');
});

// ============================================================================
// 7. applyStatus — light
// ============================================================================
group('applyStatus: light → shock 규칙 (e.shock < minDur)', () => {
  // shock < 8 → shock = 24 (덮어쓰기)
  const e1 = { shock: 5 };
  GameCombat.applyStatus(e1, 'light', mkStats(), makeRng(1));
  eq(e1.shock, BALANCE.STATUS.shock.baseDur, 'shock < minDur → baseDur로 덮어쓰기');

  // shock = 0 → 동일
  const e2 = { shock: 0 };
  GameCombat.applyStatus(e2, 'light', mkStats(), makeRng(1));
  eq(e2.shock, BALANCE.STATUS.shock.baseDur, 'shock=0 → baseDur');

  // shock >= 8 → 변경 없음 (덮어쓰지 않음)
  const e3 = { shock: 20 };
  GameCombat.applyStatus(e3, 'light', mkStats(), makeRng(1));
  eq(e3.shock, 20, 'shock=20 → 변경 없음');

  // shock == minDur → 변경 없음 (strict <)
  const e4 = { shock: BALANCE.STATUS.shock.minDur };
  GameCombat.applyStatus(e4, 'light', mkStats(), makeRng(1));
  eq(e4.shock, BALANCE.STATUS.shock.minDur, `shock == minDur (=${BALANCE.STATUS.shock.minDur}) → 변경 없음`);
});

// ============================================================================
// 8. applyStatus — 알 수 없는 원소 / null
// ============================================================================
group('applyStatus: 알 수 없는 원소 → 변화 없음', () => {
  const e = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e, 'poison', mkStats(), makeRng(1));
  eq(e.burn, 0, 'poison: burn 0');
  eq(e.burnDmg, 0, 'poison: burnDmg 0');
  eq(e.chill, 0, 'poison: chill 0');
  eq(e.frozen, 0, 'poison: frozen 0');
  eq(e.shock, 0, 'poison: shock 0');

  const e2 = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e2, null, mkStats(), makeRng(1));
  eq(e2.shock, 0, 'null: 변화 없음');

  const e3 = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e3, undefined, mkStats(), makeRng(1));
  eq(e3.shock, 0, 'undefined: 변화 없음');
});

// ============================================================================
// 9. applyStatus ↔ refApplyStatus (결정적 동치)
// ============================================================================
group('applyStatus ↔ refApplyStatus (결정적 동치)', () => {
  // cold 경로: random() 결과에 따라 분기 — 동일 시드에서는 동일 결과여야 한다.
  const enemyA = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  const enemyB = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  const s = mkStats({ fireDmg: [0, 80] });

  // fire — rng 영향 없음 (random 미호출)
  GameCombat.applyStatus(enemyA, 'fire', s, makeRng(1));
  refApplyStatus(enemyB, 'fire', s, makeRng(1));
  for (const k of ['burn', 'burnDmg', 'chill', 'frozen', 'shock']) {
    eq(enemyA[k], enemyB[k], `fire: ${k} 동일`);
  }

  // cold — 같은 시드면 frozen도 일치 (둘 다 같은 random() 호출)
  const c1 = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  const c2 = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(c1, 'cold', s, makeRng(42));
  refApplyStatus(c2, 'cold', s, makeRng(42));
  for (const k of ['burn', 'burnDmg', 'chill', 'frozen', 'shock']) {
    eq(c1[k], c2[k], `cold: ${k} 동일`);
  }

  // light — rng 영향 없음
  const l1 = { shock: 5 };
  const l2 = { shock: 5 };
  GameCombat.applyStatus(l1, 'light', s, makeRng(7));
  refApplyStatus(l2, 'light', s, makeRng(7));
  eq(l1.shock, l2.shock, 'light: shock 동일');
});

// ============================================================================
// 10. BALANCE.STATUS 단일 출처 (수치 변경 시 자동 반영)
// ============================================================================
group('BALANCE.STATUS 단일 출처 검증', () => {
  const s = mkStats({ fireDmg: [0, 80] });
  const e = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e, 'fire', s, makeRng(1));
  // 80 * 0.25 = 20; floor = 20; + 2 = 22
  const expectedDmg = Math.floor(80 * BALANCE.STATUS.burn.dmgMul) + BALANCE.STATUS.burn.dmgFloor;
  eq(e.burnDmg, expectedDmg, 'burnDmg 계산식이 BALANCE.STATUS.burn 참조');
  eq(e.burn, BALANCE.STATUS.burn.dur, 'burn = BALANCE.STATUS.burn.dur');

  const e2 = { burn: 0, burnDmg: 0, chill: 0, frozen: 0, shock: 0 };
  GameCombat.applyStatus(e2, 'cold', s,
    { random: () => BALANCE.STATUS.chill.freezeChance - 0.01, randInt: RPG.randInt });
  eq(e2.chill, BALANCE.STATUS.chill.dur, 'chill = BALANCE.STATUS.chill.dur');
  eq(e2.frozen, BALANCE.STATUS.frozen.dur, 'frozen = BALANCE.STATUS.frozen.dur');

  const e3 = { shock: 0 };
  GameCombat.applyStatus(e3, 'light', s, makeRng(1));
  eq(e3.shock, BALANCE.STATUS.shock.baseDur, 'shock = BALANCE.STATUS.shock.baseDur');
});

// ============================================================================
// 결과
// ============================================================================
console.log(`\n총 ${passed}개 통과, ${failed}개 실패`);
if (failed) {
  console.error('GameCombat 회귀 테스트 실패');
  process.exit(1);
}
console.log('ALL COMBAT CHECKS PASSED');