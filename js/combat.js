'use strict';

/* 순수 전투 수학 — Phase 1-4
 *
 * game.js의 damageRoll / applyStatus / colorOf를 HS 클로저 의존에서
 * 분리해 stats와 rng를 인자로 받는 순수 함수로 추출한 모듈.
 * 동작과 수치는 game.js (2026-07-23 기준)와 정확히 일치한다.
 *
 * - ELEM_COLOR / 상태이상 지속·틱 같은 매직 넘버는 BALANCE.STATUS를
 *   단일 출처로 사용 (game.js의 180/120/50/24/8/0.35 등을 인용).
 * - rng는 결정적 테스트를 위해 주입 가능 (생략 시 RPG.randInt + Math.random).
 * - rng 형태: { randInt(min, max): int, random(): [0,1) }
 * - 풀·이펙트·드롭·오디오·DOM 의존 함수는 옮기지 않는다.
 *
 * 외부 의존: 전역 BALANCE (BALANCE.STATUS). 결정적 RNG는 호출자가 주입.
 */
const GameCombat = (() => {
  const STATUS = BALANCE.STATUS;

  // 원소 색상 (game.js — ELEM_COLOR)
  const ELEM_COLOR = Object.freeze({
    fire:  '#ff8a3a',
    cold:  '#6fd8ff',
    light: '#ffe066',
  });

  // ----- colorOf -------------------------------------------------------------
  // game.js 원본: if (crit) return '#ffd23e'; return ELEM_COLOR[el] || '#ffffff';
  function colorOf(el, crit) {
    if (crit) return '#ffd23e';
    return ELEM_COLOR[el] || '#ffffff';
  }

  // ----- damageRoll ----------------------------------------------------------
  // game.js 원본과 RNG 소비 순서까지 동일:
  //   randInt(min,max) → random() → randInt(fire) → randInt(cold) → randInt(light)
  // 시드-동일성을 깨면 안 되므로 호출 순서를 바꾸지 않는다.
  function damageRoll(stats, mult, rng) {
    const ri = (rng && rng.randInt) || RPG.randInt;
    const r  = (rng && rng.random)  || Math.random;

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
    if (light >= fire && light >= cold && light > 0)      el = 'light';
    else if (fire >= cold && fire > 0)                    el = 'fire';
    else if (cold > 0)                                    el = 'cold';

    return { dmg, crit, element: el };
  }

  // ----- applyStatus ---------------------------------------------------------
  // game.js 원본과 시맨틱 동일. burn/chill/frozen/shock는 BALANCE.STATUS에서.
  function applyStatus(enemy, element, stats, rng) {
    const r = (rng && rng.random) || Math.random;
    if (element === 'fire') {
      enemy.burn = STATUS.burn.dur;
      enemy.burnDmg = Math.max(
        enemy.burnDmg,
        Math.floor(stats.fireDmg[1] * STATUS.burn.dmgMul) + STATUS.burn.dmgFloor
      );
    } else if (element === 'cold') {
      enemy.chill = STATUS.chill.dur;
      if (r() < STATUS.chill.freezeChance) enemy.frozen = STATUS.frozen.dur;
    } else if (element === 'light') {
      if (enemy.shock < STATUS.shock.minDur) enemy.shock = STATUS.shock.baseDur;
    }
  }

  return { damageRoll, applyStatus, colorOf, ELEM_COLOR };
})();