'use strict';

/* BALANCE (js/balance.js) 검증 — node test-balance.js
 *
 * • 외부 의존 없음 (vm + fs + path)
 * • game.js (2026-07-23 기준)의 매직 넘버와 정확히 일치하는지 확인한다.
 *   이 테스트는 "동작 변경 없이 수치만 옮긴다"는 Phase 1-2의
 *   불변 조건을 강제한다 — 값이 어긋나면 Phase 0 검증(스모크)에서
 *   회귀가 발생할 수 있다.
 *
 * 검증 대상 카테고리: 물리 / 콤보 / 상태 / 주문 / 범위 / 상한
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
const deep = (a, b, msg) => check(JSON.stringify(a) === JSON.stringify(b),
  `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
const group = (name, fn) => { console.log(`\n[${name}]`); fn(); };

// ============================================================================
// vm 로드
// ============================================================================
const ctx = vm.createContext({ Math, Object, Array, JSON });
const src = fs.readFileSync(path.join(__dirname, 'js', 'balance.js'), 'utf8');
const BALANCE = vm.runInContext(src + '\n;BALANCE;', ctx, { filename: 'js/balance.js' });

if (!BALANCE || typeof BALANCE !== 'object') {
  console.error('FAIL: BALANCE 모듈을 로드하지 못했습니다.');
  process.exit(1);
}

// ============================================================================
// 0. 최상위 인터페이스
// ============================================================================
group('top-level', () => {
  for (const k of ['PHYS', 'COMBO', 'STATUS', 'SPELL', 'RANGE', 'CAPS']) {
    check(typeof BALANCE[k] === 'object' && BALANCE[k] !== null, `BALANCE.${k} 객체`);
  }
});

// ============================================================================
// 1. PHYS — 물리 상수 (game.js IIFE 헤더)
// ============================================================================
group('PHYS', () => {
  // 원본: const TILE = 48, ROWS = LevelData.ROWS, VIEW_W = 960, VIEW_H = ROWS * TILE;
  eq(BALANCE.PHYS.TILE, 48, 'TILE');
  eq(BALANCE.PHYS.VIEW_W, 960, 'VIEW_W');

  // STEP = 1000 / 60
  close(BALANCE.PHYS.STEP_MS, 1000 / 60, 'STEP_MS (1000/60)');

  // 원본: const GRAV = 0.55, MAXFALL = 13.5, JUMPV = -15, WALK = 4.1, RUN = 6.6,
  //       ACC = 0.42, AIRACC = 0.3, FRIC = 0.45;
  eq(BALANCE.PHYS.GRAV, 0.55, 'GRAV');
  eq(BALANCE.PHYS.MAXFALL, 13.5, 'MAXFALL');
  eq(BALANCE.PHYS.JUMPV, -15, 'JUMPV');
  eq(BALANCE.PHYS.WALK, 4.1, 'WALK');
  eq(BALANCE.PHYS.RUN, 6.6, 'RUN');
  eq(BALANCE.PHYS.ACC, 0.42, 'ACC');
  eq(BALANCE.PHYS.AIRACC, 0.3, 'AIRACC');
  eq(BALANCE.PHYS.FRIC, 0.45, 'FRIC');
});

function close(a, b, msg) {
  check(Math.abs(a - b) < 1e-9, `${msg} (got ${a}, expected ${b})`);
}

// ============================================================================
// 2. COMBO — 일반공격 3단계 (game.js 528행)
// ============================================================================
group('COMBO', () => {
  // 원본: const COMBO_WINDOW = 42; const COMBO_MULT = [1.0, 1.15, 1.5];
  //       const COMBO_DUR = [12, 12, 16]; const COMBO_CD = [14, 14, 24];
  eq(BALANCE.COMBO.WINDOW, 42, 'WINDOW');
  deep(BALANCE.COMBO.MULT, [1.0, 1.15, 1.5], 'MULT');
  deep(BALANCE.COMBO.DUR, [12, 12, 16], 'DUR');
  deep(BALANCE.COMBO.CD, [14, 14, 24], 'CD');

  // 콤보 단계 수는 모두 3개로 일치
  eq(BALANCE.COMBO.MULT.length, 3, 'MULT.length');
  eq(BALANCE.COMBO.DUR.length, 3, 'DUR.length');
  eq(BALANCE.COMBO.CD.length, 3, 'CD.length');

  // 단계 비감소: 콤보 마무리(2)는 항상 가장 큰 값
  check(BALANCE.COMBO.MULT[2] >= BALANCE.COMBO.MULT[1], 'MULT 단조');
  check(BALANCE.COMBO.MULT[1] >= BALANCE.COMBO.MULT[0], 'MULT[1]>=MULT[0]');
  check(BALANCE.COMBO.CD[2] >= BALANCE.COMBO.CD[0], '마무리 단계 CD >= 0단계');
});

// ============================================================================
// 3. STATUS — 상태이상 (game.js applyStatus / chainLightning / tryHeavy)
// ============================================================================
group('STATUS', () => {
  // applyStatus:
  //   if (el === 'fire')  { e.burn = 180; ... }
  //   else if (el === 'cold')  { e.chill = 120; if (Math.random() < 0.35) e.frozen = 50; }
  //   else if (el === 'light') { if (e.shock < 8) e.shock = 24; }
  eq(BALANCE.STATUS.burn.dur, 180, 'burn.dur = 180');
  eq(BALANCE.STATUS.chill.dur, 120, 'chill.dur = 120');
  eq(BALANCE.STATUS.chill.freezeChance, 0.35, 'chill.freezeChance = 0.35');
  eq(BALANCE.STATUS.chill.slow, 0.4, 'chill.slow = 0.4 (느려짐 배율)');
  eq(BALANCE.STATUS.frozen.dur, 50, 'frozen.dur = 50');
  eq(BALANCE.STATUS.shock.baseDur, 24, 'shock.baseDur = 24');
  eq(BALANCE.STATUS.shock.minDur, 8, 'shock.minDur = 8 (덮어쓰기 임계값)');

  // 화상 틱 — burnParticle: e.burn % 30 === 0
  eq(BALANCE.STATUS.burn.tickEvery, 30, 'burn.tickEvery = 30');
  eq(BALANCE.STATUS.burnParticle.every, 30, 'burnParticle.every = 30');

  // 화상 데미지 공식: floor(fireDmg[1] * 0.25) + 2
  eq(BALANCE.STATUS.burn.dmgMul, 0.25, 'burn.dmgMul');
  eq(BALANCE.STATUS.burn.dmgFloor, 2, 'burn.dmgFloor');

  // chainLightning 부여 감전: e.shock = Math.max(e.shock, 36), proc 0.6
  eq(BALANCE.STATUS.shockChain.dur, 36, 'shockChain.dur = 36');
  eq(BALANCE.STATUS.shockChain.procChance, 0.6, 'shockChain.procChance = 0.6');

  // tryHeavy 부여 감전: e.shock = 40, proc 0.5
  eq(BALANCE.STATUS.shockHeavy.dur, 40, 'shockHeavy.dur = 40');
  eq(BALANCE.STATUS.shockHeavy.procChance, 0.5, 'shockHeavy.procChance = 0.5');

  // 상태이상 카테고리 6종 모두 노출
  for (const k of ['burn', 'chill', 'frozen', 'shock', 'shockChain', 'shockHeavy']) {
    check(typeof BALANCE.STATUS[k] === 'object', `STATUS.${k} 객체`);
  }
});

// ============================================================================
// 4. SPELL — 주문/스킬 (castFire / castIce / castBolt / chainLightning /
//            tryHeavy / doShockwave / bumpKill / applyDamage(스톰프))
// ============================================================================
group('SPELL.fire', () => {
  // castFire: projectiles.push({ kind:'fire', ..., vx:player.face*9, vy:0, r:10, dmg:r.dmg, ...
  //                              element:'fire', life:90, hit:new Set() });
  // damageRoll(1.0)
  eq(BALANCE.SPELL.fire.mult, 1.0, 'fire.mult');
  eq(BALANCE.SPELL.fire.vx, 9, 'fire.vx');
  eq(BALANCE.SPELL.fire.r, 10, 'fire.r');
  eq(BALANCE.SPELL.fire.life, 90, 'fire.life');
});

group('SPELL.ice', () => {
  // castIce: vx:12, r:7, life:70, pierce:4, damageRoll(0.85)
  eq(BALANCE.SPELL.ice.mult, 0.85, 'ice.mult');
  eq(BALANCE.SPELL.ice.vx, 12, 'ice.vx');
  eq(BALANCE.SPELL.ice.r, 7, 'ice.r');
  eq(BALANCE.SPELL.ice.life, 70, 'ice.life');
  eq(BALANCE.SPELL.ice.pierce, 4, 'ice.pierce');
});

group('SPELL.bolt', () => {
  // castBolt: enemies.filter(e => !e.dead && Math.hypot(...) < 340);
  //   damageRoll(1.0)
  eq(BALANCE.SPELL.bolt.mult, 1.0, 'bolt.mult');
  eq(BALANCE.SPELL.bolt.range, 340, 'bolt.range');
});

group('SPELL.chain', () => {
  // chainLightning: hypot(...) < 230, if (cnt >= 4) break, damageRoll(0.7)
  eq(BALANCE.SPELL.chain.mult, 0.7, 'chain.mult');
  eq(BALANCE.SPELL.chain.range, 230, 'chain.range');
  eq(BALANCE.SPELL.chain.maxHops, 4, 'chain.maxHops');
  // rollProcs fire: damageRoll(0.5)
  eq(BALANCE.SPELL.chain.elemMult.fire, 0.5, 'chain fire proc mult');
});

group('SPELL.heavy', () => {
  // tryHeavy: doShockwave(sx, sy, 74); damageRoll(1.6); e.kb = player.face * 8
  //   heavyT = 20; burst 20; dust 8
  //   hb = { x:..., w:64, y:player.y-22, h:player.h+32 }
  eq(BALANCE.SPELL.heavy.mult, 1.6, 'heavy.mult');
  eq(BALANCE.SPELL.heavy.range, 74, 'heavy.range (= shockwave)');
  eq(BALANCE.SPELL.heavy.kb, 8, 'heavy.kb');
  eq(BALANCE.SPELL.heavy.hitboxW, 64, 'heavy.hitboxW');
  eq(BALANCE.SPELL.heavy.hitboxHOffset, 32, 'heavy.hitboxHOffset');
  eq(BALANCE.SPELL.heavy.animT, 20, 'heavy.animT');
  eq(BALANCE.SPELL.heavy.burstCount, 20, 'heavy.burstCount');
  eq(BALANCE.SPELL.heavy.dustCount, 8, 'heavy.dustCount');
});

group('SPELL.shockwave', () => {
  // doShockwave: damageRoll(1.35); e.kb = ... * 6
  eq(BALANCE.SPELL.shockwave.mult, 1.35, 'shockwave.mult');
  eq(BALANCE.SPELL.shockwave.kb, 6, 'shockwave.kb');
});

group('SPELL.stomp', () => {
  // updateEnemies: dealDamage(e, 0.6, { dir:0, leech:false });
  //   player.vy = input.jump ? -12.5 : -8.5;
  //   player.prevBottom <= e.y + 10
  eq(BALANCE.SPELL.stomp.mult, 0.6, 'stomp.mult');
  eq(BALANCE.SPELL.stomp.bounceV, -8.5, 'stomp.bounceV');
  eq(BALANCE.SPELL.stomp.bounceVJump, -12.5, 'stomp.bounceVJump');
  eq(BALANCE.SPELL.stomp.stompWindow, 10, 'stomp.stompWindow');
});

group('SPELL.bumpKill', () => {
  // bumpKill: dealDamage(e, 2.5, ...); Math.abs(e.y+e.h - r*TILE) < 8
  eq(BALANCE.SPELL.bumpKill.mult, 2.5, 'bumpKill.mult');
  eq(BALANCE.SPELL.bumpKill.alignTol, 8, 'bumpKill.alignTol');
});

// ============================================================================
// 5. RANGE — 시전/이펙트 반경
// ============================================================================
group('RANGE', () => {
  eq(BALANCE.RANGE.chain, 230, 'chain = 230');
  eq(BALANCE.RANGE.bolt, 340, 'bolt = 340');
  eq(BALANCE.RANGE.shockwave, 74, 'shockwave (heavy) = 74');
  // explodeFireball: dd < 70, maxR: 66 (visual)
  eq(BALANCE.RANGE.fireballAoe, 70, 'fireballAoe = 70');
  eq(BALANCE.RANGE.fireballShock, 66, 'fireballShock visual = 66');
  eq(BALANCE.RANGE.fireballBurst, 20, 'fireballBurst count = 20');
  // updateEnemies sight: Math.abs(ecy - pcy) < 240
  eq(BALANCE.RANGE.enemySightY, 240, 'enemySightY = 240');
  // chainLightning burst count: burst(ex, ey, 8, ...)
  eq(BALANCE.RANGE.chainBurst, 8, 'chainBurst');
  // hitParticles: crit ? 14 : 9
  eq(BALANCE.RANGE.critBurst, 14, 'critBurst');
  eq(BALANCE.RANGE.normBurst, 9, 'normBurst');
  // rollProcs burst
  eq(BALANCE.RANGE.procFireBurst, 8, 'procFireBurst');
  eq(BALANCE.RANGE.procFrostBurst, 8, 'procFrostBurst');
});

// ============================================================================
// 6. CAPS — 상한/풀/타일 식별
// ============================================================================
group('CAPS', () => {
  // const MAX_PARTICLES = 800; const MAX_EFFECTS = 64; const MAX_FLOATS = 32;
  eq(BALANCE.CAPS.MAX_PARTICLES, 800, 'MAX_PARTICLES');
  eq(BALANCE.CAPS.MAX_EFFECTS, 64, 'MAX_EFFECTS');
  eq(BALANCE.CAPS.MAX_FLOATS, 32, 'MAX_FLOATS');
  // const INV_CAP = 24
  eq(BALANCE.CAPS.INV_CAP, 24, 'INV_CAP');
  // const SOLID = new Set([1,2,3,4,5,6,7,8])
  deep(BALANCE.CAPS.SOLID, [1, 2, 3, 4, 5, 6, 7, 8], 'SOLID');
  // 풀 가드 (freePart: if (partPool.length < 512) partPool.push(p);)
  eq(BALANCE.CAPS.MAX_PART_POOL, 512, 'MAX_PART_POOL');

  // SOLID는 1..8의 모든 값을 포함
  for (let i = 1; i <= 8; i++) {
    check(BALANCE.CAPS.SOLID.includes(i), `SOLID contains ${i}`);
  }
  // SOLID에 0/9 등 잘못된 값은 없음
  check(!BALANCE.CAPS.SOLID.includes(0), 'SOLID는 0 미포함');
  check(!BALANCE.CAPS.SOLID.includes(9), 'SOLID는 9 미포함');
});

// ============================================================================
// 7. 값 동결 — 외부 변조 방지 (Object.freeze 검증)
// ============================================================================
group('frozen', () => {
  check(Object.isFrozen(BALANCE), 'BALANCE 동결');
  check(Object.isFrozen(BALANCE.PHYS), 'PHYS 동결');
  check(Object.isFrozen(BALANCE.COMBO), 'COMBO 동결');
  check(Object.isFrozen(BALANCE.STATUS), 'STATUS 동결');
  check(Object.isFrozen(BALANCE.SPELL), 'SPELL 동결');
  check(Object.isFrozen(BALANCE.RANGE), 'RANGE 동결');
  check(Object.isFrozen(BALANCE.CAPS), 'CAPS 동결');
  check(Object.isFrozen(BALANCE.COMBO.MULT), 'COMBO.MULT 동결');
  check(Object.isFrozen(BALANCE.COMBO.DUR), 'COMBO.DUR 동결');
  check(Object.isFrozen(BALANCE.COMBO.CD), 'COMBO.CD 동결');
  check(Object.isFrozen(BALANCE.CAPS.SOLID), 'CAPS.SOLID 동결');

  // 변조 시도 실패 확인 (strict mode에서 TypeError)
  let thrown = false;
  try { BALANCE.PHYS.TILE = 999; } catch (_) { thrown = true; }
  check(thrown || BALANCE.PHYS.TILE === 48, 'PHYS.TILE 변조 차단');
});

// ============================================================================
// 결과
// ============================================================================
console.log(`\n총 ${passed}개 통과, ${failed}개 실패`);
if (failed) {
  console.error('BALANCE 회귀 테스트 실패');
  process.exit(1);
}
console.log('ALL BALANCE CHECKS PASSED');