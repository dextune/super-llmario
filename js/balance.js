'use strict';

/* 밸런스 단일 출처 — Phase 1-2
 *
 * game.js에 산재해 있던 매직 넘버를 한 곳으로 모아, 수치 튜닝이
 * 데이터 변경만으로 가능하도록 한다. 모든 값은 game.js (2026-07-23 기준)
 * 의 동작과 정확히 일치한다.
 *
 * 외부 의존 없음. 브라우저 전역 BALANCE로 노출.
 */
const BALANCE = (() => {
  // ===== 물리 =====
  // (game.js IIFE 헤더 — TILE / ROWS / VIEW_W / VIEW_H / STEP / GRAV / ...)
  const PHYS = Object.freeze({
    TILE: 48,
    VIEW_W: 960,
    STEP_MS: 1000 / 60,
    GRAV: 0.55,
    MAXFALL: 13.5,
    JUMPV: -15,
    WALK: 4.1,
    RUN: 6.6,
    ACC: 0.42,
    AIRACC: 0.3,
    FRIC: 0.45,
  });

  // ===== 콤보 (3단계 일반공격) =====
  // (game.js — COMBO_WINDOW / COMBO_MULT / COMBO_DUR / COMBO_CD)
  const COMBO = Object.freeze({
    WINDOW: 42,
    MULT: Object.freeze([1.0, 1.15, 1.5]),
    DUR: Object.freeze([12, 12, 16]),
    CD: Object.freeze([14, 14, 24]),
  });

  // ===== 상태이상 =====
  // (game.js — applyStatus / chainLightning / tryHeavy / updateEnemies)
  const STATUS = Object.freeze({
    burn: Object.freeze({
      dur: 180,             // e.burn = 180
      tickEvery: 30,        // e.burn % 30 === 0
      dmgMul: 0.25,         // HS.fireDmg[1] * 0.25
      dmgFloor: 2,          // + 2
    }),
    chill: Object.freeze({
      dur: 120,             // e.chill = 120
      slow: 0.4,            // e.chill > 0 ? 0.4 : 1
      freezeChance: 0.35,   // Math.random() < 0.35
    }),
    frozen: Object.freeze({
      dur: 50,              // e.frozen = 50
    }),
    shock: Object.freeze({
      baseDur: 24,          // e.shock = 24
      minDur: 8,            // if (e.shock < 8) e.shock = 24
    }),
    shockChain: Object.freeze({
      dur: 36,              // shockwave/chain 부여 감전
      procChance: 0.6,      // Math.random() < 0.6
    }),
    shockHeavy: Object.freeze({
      dur: 40,              // 강타 부여 감전
      procChance: 0.5,      // Math.random() < 0.5
    }),
    burnParticle: Object.freeze({
      every: 30,            // e.burn % 30 === 0
    }),
    // 처리 순서 및 메타데이터 (updateEnemies 순회용)
    ORDER: Object.freeze([
      { key: 'burn',  tick: true,  tickEvery: 30, move: null },
      { key: 'chill', tick: false, move: 'slow' },
      { key: 'frozen',tick: false, move: 'freeze' },
      { key: 'shock', tick: false, move: 'stun' },
    ]),
  });

  // ===== 주문 (시전/투사체/체인) =====
  // (game.js — castFire / castIce / castBolt / chainLightning / tryHeavy / applyDamage / bumpKill)
  const SPELL = Object.freeze({
    fire: Object.freeze({
      mult: 1.0,            // damageRoll(1.0)
      vx: 9,                // player.face * 9
      r: 10,                // 반경
      life: 90,             // life: 90
    }),
    ice: Object.freeze({
      mult: 0.85,           // damageRoll(0.85)
      vx: 12,               // player.face * 12
      r: 7,
      life: 70,
      pierce: 4,            // --p.pierce <= 0
    }),
    bolt: Object.freeze({
      mult: 1.0,            // damageRoll(1.0)
      range: 340,           // hypot(...) < 340
    }),
    chain: Object.freeze({
      mult: 0.7,            // damageRoll(0.7)
      range: 230,           // hypot(...) < 230
      maxHops: 4,           // if (cnt >= 4) break
      elemMult: Object.freeze({ fire: 0.5 }), // rollProcs fire proc
    }),
    heavy: Object.freeze({
      mult: 1.6,            // damageRoll(1.6)
      range: 74,            // doShockwave(sx, sy, 74)
      kb: 8,                // e.kb = player.face * 8
      hitboxW: 64,
      hitboxHOffset: 32,    // player.h + 32
      animT: 20,            // player.heavyT = 20
      burstCount: 20,       // burst(sx, sy, 20, '#ffd23e')
      dustCount: 8,         // dust(... 8)
    }),
    shockwave: Object.freeze({
      mult: 1.35,           // damageRoll(1.35)
      kb: 6,                // e.kb = ... * 6
    }),
    stomp: Object.freeze({
      mult: 0.6,            // dealDamage(e, 0.6, ...)
      bounceV: -8.5,        // 기본
      bounceVJump: -12.5,   // input.jump 점프 보너스
      stompWindow: 10,      // player.prevBottom <= e.y + 10
    }),
    bumpKill: Object.freeze({
      mult: 2.5,            // 블록 두드려 처치
      alignTol: 8,          // Math.abs(e.y + e.h - r * TILE) < 8
    }),
  });

  // ===== 범위 (스킬/이펙트 시전 반경) =====
  // (game.js — chainLightning / castBolt / tryHeavy / explodeFireball / rollProcs)
  const RANGE = Object.freeze({
    chain: 230,
    bolt: 340,
    shockwave: 74,          // heavy shockwave
    fireballAoe: 70,        // explodeFireball dd < 70
    fireballShock: 66,      // pushEffect('shock', maxR: 66)
    fireballBurst: 20,      // burst(p.x, p.y, 20, '#ff8a3a')
    enemySightY: 240,       // Math.abs(ecy - pcy) < 240
    chainBurst: 8,          // burst(ex, ey, 8, '#ffe066')
    critBurst: 14,          // hitParticles crit
    normBurst: 9,
    procFireBurst: 8,
    procFrostBurst: 8,
    hitFlashR: 16,
    hitFlashRcrit: 12,
  });

  // ===== 상한 / 풀 / 컬렉션 =====
  // (game.js — MAX_PARTICLES / MAX_EFFECTS / MAX_FLOATS / INV_CAP / SOLID)
  const CAPS = Object.freeze({
    MAX_PARTICLES: 800,
    MAX_EFFECTS: 64,
    MAX_FLOATS: 32,
    INV_CAP: 24,
    MAX_PART_POOL: 512,     // freePart 가드
    SOLID: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]),
  });

  return Object.freeze({ PHYS, COMBO, STATUS, SPELL, RANGE, CAPS });
})();