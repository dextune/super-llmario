'use strict';

/* GameFlow (js/flow.js) 단위 테스트 — node test-flow.js
 *
 * Phase 1-5: 상태 머신 명시화 — 9개 상태와 검증된 전이 규칙을 순수 함수로.
 *
 * • 외부 의존 없음 (vm + fs + path)
 * • 검증 항목
 *   - 노출 API (STATE, EVENT, transition, canTransition, pairs, isState, isEvent)
 *   - 9개 상태 상수의 값/이름/타입/동결성/문자열 일치
 *   - 이벤트 상수의 distinct 값/동결성
 *   - 검증된 모든 전이의 정확성 (state × event)
 *   - 검증되지 않은 (state, event)에 대한 상태 유지 (불명확 전이)
 *   - 잘못된 입력에 대한 방어 (정의되지 않은 state/event → 입력 유지)
 *   - 결정성 (동일 입력 → 동일 출력)
 *   - 순수성 (반복 호출·pairs() 변동 없음)
 *   - 시나리오 워크 (실제 입력 시퀀스의 도달 가능 상태)
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
// vm 로드
// ============================================================================
const ctx = vm.createContext({ Math, Object, JSON });
const src = fs.readFileSync(path.join(__dirname, 'js', 'flow.js'), 'utf8');
const GameFlow = vm.runInContext(src + '\n;GameFlow;', ctx, { filename: 'js/flow.js' });

if (!GameFlow || typeof GameFlow !== 'object') {
  console.error('FAIL: GameFlow 모듈을 로드하지 못했습니다.');
  process.exit(1);
}

// (camelCase 이름 → EVENT 객체 키) 매핑 — toUpperCase()로 매핑 불가능한 이름 보존
const STATE_NAMES = ['title', 'playing', 'paused', 'inv', 'dying', 'flag', 'clear', 'win', 'over'];
const EVENT_NAMES = ['confirm', 'pause', 'toggleInv', 'playerDied', 'respawn', 'reachFlag', 'flagDone', 'nextLevel', 'finishGame', 'pauseHidden'];
const EVENT_KEY = {
  confirm: 'CONFIRM',
  pause: 'PAUSE',
  toggleInv: 'TOGGLE_INV',
  playerDied: 'PLAYER_DIED',
  respawn: 'RESPAWN',
  reachFlag: 'REACH_FLAG',
  flagDone: 'FLAG_DONE',
  nextLevel: 'NEXT_LEVEL',
  finishGame: 'FINISH_GAME',
  pauseHidden: 'PAUSE_HIDDEN',
};
const STATE_VALS = STATE_NAMES.map(s => GameFlow.STATE[s.toUpperCase()]);
const EVENT_VALS = EVENT_NAMES.map(e => GameFlow.EVENT[EVENT_KEY[e]]);

// ============================================================================
// 1. 노출 인터페이스
// ============================================================================
group('interface', () => {
  check(typeof GameFlow === 'object' && GameFlow !== null, 'GameFlow 객체 노출');
  for (const k of ['STATE', 'EVENT', 'transition', 'canTransition', 'pairs', 'isState', 'isEvent']) {
    check(k in GameFlow, `GameFlow.${k} 존재`);
  }
  check(typeof GameFlow.transition === 'function', 'transition 함수');
  check(typeof GameFlow.canTransition === 'function', 'canTransition 함수');
  check(typeof GameFlow.pairs === 'function', 'pairs 함수');
  check(typeof GameFlow.isState === 'function', 'isState 함수');
  check(typeof GameFlow.isEvent === 'function', 'isEvent 함수');
});

// ============================================================================
// 2. STATE 상수 — 정확히 9개, 정확한 값, 동결, distinct
// ============================================================================
group('STATE constants', () => {
  for (const name of STATE_NAMES) {
    const v = GameFlow.STATE[name.toUpperCase()];
    eq(v, name, `STATE.${name.toUpperCase()} === '${name}'`);
  }
  eq(Object.keys(GameFlow.STATE).length, STATE_NAMES.length, `STATE 키 ${STATE_NAMES.length}개`);
  eq(new Set(STATE_VALS).size, STATE_VALS.length, 'STATE 값 distinct');
  check(Object.isFrozen(GameFlow.STATE), 'STATE 동결');
  // game.js 실제 사용 문자열과 일치 (오타 방지)
  eq(GameFlow.STATE.TITLE, 'title', 'STATE.TITLE === game.js "title"');
  eq(GameFlow.STATE.PLAYING, 'playing', 'STATE.PLAYING === game.js "playing"');
  eq(GameFlow.STATE.PAUSED, 'paused', 'STATE.PAUSED === game.js "paused"');
  eq(GameFlow.STATE.INV, 'inv', 'STATE.INV === game.js "inv"');
  eq(GameFlow.STATE.DYING, 'dying', 'STATE.DYING === game.js "dying"');
  eq(GameFlow.STATE.FLAG, 'flag', 'STATE.FLAG === game.js "flag"');
  eq(GameFlow.STATE.CLEAR, 'clear', 'STATE.CLEAR === game.js "clear"');
  eq(GameFlow.STATE.WIN, 'win', 'STATE.WIN === game.js "win"');
  eq(GameFlow.STATE.OVER, 'over', 'STATE.OVER === game.js "over"');
});

// ============================================================================
// 3. EVENT 상수 — distinct, 동결
// ============================================================================
group('EVENT constants', () => {
  for (const name of EVENT_NAMES) {
    const v = GameFlow.EVENT[EVENT_KEY[name]];
    eq(typeof v, 'string', `EVENT.${name} 문자열`);
    check(v.length > 0, `EVENT.${name} 비어있지 않음`);
  }
  eq(Object.keys(GameFlow.EVENT).length, EVENT_NAMES.length, `EVENT 키 ${EVENT_NAMES.length}개`);
  eq(new Set(EVENT_VALS).size, EVENT_VALS.length, 'EVENT 값 distinct');
  check(Object.isFrozen(GameFlow.EVENT), 'EVENT 동결');
});

// ============================================================================
// 4. 검증된 전이 — game.js 현재 코드 매핑
// ============================================================================
group('verified transitions (game.js source)', () => {
  // ----- title -----
  eq(GameFlow.transition(GameFlow.STATE.TITLE, GameFlow.EVENT.CONFIRM),
     GameFlow.STATE.PLAYING, 'title + confirm → playing (startGame)');

  // ----- playing -----
  eq(GameFlow.transition(GameFlow.STATE.PLAYING, GameFlow.EVENT.PAUSE),
     GameFlow.STATE.PAUSED, 'playing + pause → paused (togglePause)');
  eq(GameFlow.transition(GameFlow.STATE.PLAYING, GameFlow.EVENT.PAUSE_HIDDEN),
     GameFlow.STATE.PAUSED, 'playing + pauseHidden → paused (visibilitychange)');
  eq(GameFlow.transition(GameFlow.STATE.PLAYING, GameFlow.EVENT.TOGGLE_INV),
     GameFlow.STATE.INV, 'playing + toggleInv → inv');
  eq(GameFlow.transition(GameFlow.STATE.PLAYING, GameFlow.EVENT.PLAYER_DIED),
     GameFlow.STATE.DYING, 'playing + playerDied → dying (die)');
  eq(GameFlow.transition(GameFlow.STATE.PLAYING, GameFlow.EVENT.REACH_FLAG),
     GameFlow.STATE.FLAG, 'playing + reachFlag → flag (startFlag)');

  // ----- paused -----
  eq(GameFlow.transition(GameFlow.STATE.PAUSED, GameFlow.EVENT.CONFIRM),
     GameFlow.STATE.PLAYING, 'paused + confirm → playing (confirm → togglePause)');
  eq(GameFlow.transition(GameFlow.STATE.PAUSED, GameFlow.EVENT.PAUSE),
     GameFlow.STATE.PLAYING, 'paused + pause → playing (togglePause)');

  // ----- inv -----
  eq(GameFlow.transition(GameFlow.STATE.INV, GameFlow.EVENT.TOGGLE_INV),
     GameFlow.STATE.PLAYING, 'inv + toggleInv → playing');

  // ----- dying -----
  eq(GameFlow.transition(GameFlow.STATE.DYING, GameFlow.EVENT.RESPAWN),
     GameFlow.STATE.PLAYING, 'dying + respawn → playing');

  // ----- flag -----
  eq(GameFlow.transition(GameFlow.STATE.FLAG, GameFlow.EVENT.FLAG_DONE),
     GameFlow.STATE.CLEAR, 'flag + flagDone → clear');

  // ----- clear -----
  eq(GameFlow.transition(GameFlow.STATE.CLEAR, GameFlow.EVENT.NEXT_LEVEL),
     GameFlow.STATE.PLAYING, 'clear + nextLevel → playing (다음 레벨)');
  eq(GameFlow.transition(GameFlow.STATE.CLEAR, GameFlow.EVENT.FINISH_GAME),
     GameFlow.STATE.WIN, 'clear + finishGame → win (마지막 레벨)');

  // ----- win -----
  eq(GameFlow.transition(GameFlow.STATE.WIN, GameFlow.EVENT.CONFIRM),
     GameFlow.STATE.TITLE, 'win + confirm → title (toTitle)');

  // ----- over -----
  // over에 대한 명세된 전이는 없음 — 불명확 전이 섹션에서 검증
});

// ============================================================================
// 5. canTransition ↔ transition 결과의 일관성
// ============================================================================
group('canTransition consistency', () => {
  for (const s of STATE_VALS) {
    for (const e of EVENT_VALS) {
      const next = GameFlow.transition(s, e);
      const defined = GameFlow.canTransition(s, e);
      // 정의됨 ↔ next !== s (현재 명세에는 자기 자신으로의 전이 없음)
      check(defined === (next !== s), `canTransition(${s}, ${e}) ↔ result(${s === next ? '유지' : next})`);
    }
  }
  // 잘못된 입력
  check(GameFlow.canTransition('bogus', GameFlow.EVENT.CONFIRM) === false, '잘못된 state → false');
  check(GameFlow.canTransition(GameFlow.STATE.PLAYING, 'bogus') === false, '잘못된 event → false');
  check(GameFlow.canTransition(null, GameFlow.EVENT.CONFIRM) === false, 'null state → false');
  check(GameFlow.canTransition(GameFlow.STATE.PLAYING, undefined) === false, 'undefined event → false');
});

// ============================================================================
// 6. 불명확 전이 = 상태 유지
// ============================================================================
group('unclear transitions maintain state', () => {
  let checkedCount = 0;
  let definedCount = 0;
  for (const s of STATE_VALS) {
    for (const e of EVENT_VALS) {
      if (GameFlow.canTransition(s, e)) { definedCount++; continue; }
      eq(GameFlow.transition(s, e), s, `${s} + ${e} (불명확) → ${s} (유지)`);
      checkedCount++;
    }
  }
  check(checkedCount > 0, `불명확 전이 검증됨 (${checkedCount}개)`);
  check(definedCount > 0, `명세된 전이 검증됨 (${definedCount}개)`);

  // 명세에 없는 이벤트 (예: 'unknown' 같은 미래 이벤트)
  for (const s of STATE_VALS) {
    eq(GameFlow.transition(s, 'unknownEvent'), s, `${s} + unknownEvent → ${s}`);
    eq(GameFlow.transition(s, ''), s, `${s} + 빈 문자열 → ${s}`);
  }
});

// ============================================================================
// 7. 잘못된 입력 방어 — 정의되지 않은 state/event → 입력 state 유지
// ============================================================================
group('invalid input defense', () => {
  const badInputs = ['', 'TITLE', 'Playing', 'unknown', null, undefined, 42, true, false, {}, [], Symbol('x')];

  for (const bad of badInputs) {
    for (const e of EVENT_VALS) {
      // 잘못된 state → 입력 그대로
      eq(GameFlow.transition(bad, e), bad, `잘못된 state(${JSON.stringify(bad)}) + ${e} → 입력 유지`);
    }
  }

  for (const bad of badInputs) {
    for (const s of STATE_VALS) {
      // 잘못된 event → 입력 state 그대로
      eq(GameFlow.transition(s, bad), s, `${s} + 잘못된 event(${JSON.stringify(bad)}) → ${s}`);
    }
  }

  // transition이 throw 하지 않음
  let threw = false;
  try {
    for (const bad of badInputs) {
      for (const bad2 of badInputs) GameFlow.transition(bad, bad2);
    }
  } catch (_) { threw = true; }
  check(!threw, 'transition: 잘못된 입력 조합에서도 throw 없음');
});

// ============================================================================
// 8. 결정성 + 순수성
// ============================================================================
group('determinism & purity', () => {
  for (const s of STATE_VALS) {
    for (const e of EVENT_VALS) {
      const first = GameFlow.transition(s, e);
      let allSame = true;
      for (let i = 0; i < 20; i++) {
        if (GameFlow.transition(s, e) !== first) { allSame = false; break; }
      }
      check(allSame, `결정성: ${s} + ${e} (20회)`);
    }
  }

  // pairs() 결과 변동 없음
  const p1 = GameFlow.pairs();
  const p2 = GameFlow.pairs();
  const p3 = GameFlow.pairs();
  eq(p1.length, p2.length, 'pairs() 길이 결정성');
  eq(p2.length, p3.length, 'pairs() 길이 결정성 (2)');
  eq(p1.join('|'), p2.join('|'), 'pairs() 내용 결정성');
  eq(p1.join('|'), p3.join('|'), 'pairs() 내용 결정성 (2)');
  check(p1.length > 0, 'pairs() 비어있지 않음');

  // STATE / EVENT 동결 — 변경 시도 무시 (strict mode에서 throw되지만, 동결 확인은 isFrozen으로 충분)
  check(Object.isFrozen(GameFlow.STATE), 'STATE 여전히 동결');
  check(Object.isFrozen(GameFlow.EVENT), 'EVENT 여전히 동결');
});

// ============================================================================
// 9. pairs() 무결성 — 각 항목이 "state|event" 형식 + 유효한 값
// ============================================================================
group('pairs() integrity', () => {
  const pairs = GameFlow.pairs();
  check(Array.isArray(pairs), 'pairs 배열 반환');
  for (const p of pairs) {
    check(typeof p === 'string', `pair 타입: ${JSON.stringify(p)}`);
    check(p.includes('|'), `pair 구분자 포함: ${p}`);
    const idx = p.indexOf('|');
    const s = p.slice(0, idx);
    const e = p.slice(idx + 1);
    check(GameFlow.isState(s), `pair state 유효 (${s})`);
    check(GameFlow.isEvent(e), `pair event 유효 (${e})`);
  }
  // 명세된 전이 수와 pairs() 길이 일치 (현재 14개)
  eq(pairs.length, 14, `pairs() 14개 (현재 명세된 전이 수)`);
});

// ============================================================================
// 10. isState / isEvent
// ============================================================================
group('isState / isEvent', () => {
  for (const s of STATE_VALS) check(GameFlow.isState(s) === true, `isState('${s}')`);
  for (const v of ['', 'TITLE', 'Playing', null, undefined, 42, true, {}, [], Symbol('x')]) {
    check(GameFlow.isState(v) === false, `isState 거짓: ${typeof v === 'symbol' ? String(v) : JSON.stringify(v)}`);
  }
  for (const e of EVENT_VALS) check(GameFlow.isEvent(e) === true, `isEvent('${e}')`);
  for (const v of ['', 'CONFIRM', 'Confirm', null, undefined, 42, true, {}, []]) {
    check(GameFlow.isEvent(v) === false, `isEvent 거짓: ${JSON.stringify(v)}`);
  }
});

// ============================================================================
// 11. 시나리오 워크 — 실제 입력 시퀀스의 도달 가능 상태
// ============================================================================
group('scenario walks', () => {
  // A: 타이틀 → 플레이 → 일시정지 ↔ 플레이 → 인벤토리 ↔ 플레이
  let s = GameFlow.STATE.TITLE;
  s = GameFlow.transition(s, GameFlow.EVENT.CONFIRM);
  eq(s, GameFlow.STATE.PLAYING, 'A1 title+confirm → playing');
  s = GameFlow.transition(s, GameFlow.EVENT.PAUSE);
  eq(s, GameFlow.STATE.PAUSED, 'A2 playing+pause → paused');
  s = GameFlow.transition(s, GameFlow.EVENT.PAUSE);
  eq(s, GameFlow.STATE.PLAYING, 'A3 paused+pause → playing');
  s = GameFlow.transition(s, GameFlow.EVENT.TOGGLE_INV);
  eq(s, GameFlow.STATE.INV, 'A4 playing+toggleInv → inv');
  s = GameFlow.transition(s, GameFlow.EVENT.TOGGLE_INV);
  eq(s, GameFlow.STATE.PLAYING, 'A5 inv+toggleInv → playing');

  // B: 죽음 → 부활
  s = GameFlow.transition(GameFlow.STATE.PLAYING, GameFlow.EVENT.PLAYER_DIED);
  eq(s, GameFlow.STATE.DYING, 'B1 playing+playerDied → dying');
  s = GameFlow.transition(s, GameFlow.EVENT.RESPAWN);
  eq(s, GameFlow.STATE.PLAYING, 'B2 dying+respawn → playing');

  // C: 깃발 → 클리어 → 다음 레벨
  s = GameFlow.transition(GameFlow.STATE.PLAYING, GameFlow.EVENT.REACH_FLAG);
  eq(s, GameFlow.STATE.FLAG, 'C1 playing+reachFlag → flag');
  s = GameFlow.transition(s, GameFlow.EVENT.FLAG_DONE);
  eq(s, GameFlow.STATE.CLEAR, 'C2 flag+flagDone → clear');
  s = GameFlow.transition(s, GameFlow.EVENT.NEXT_LEVEL);
  eq(s, GameFlow.STATE.PLAYING, 'C3 clear+nextLevel → playing');

  // D: 깃발 → 클리어 → 마지막 → 승리 → 타이틀
  s = GameFlow.transition(GameFlow.STATE.PLAYING, GameFlow.EVENT.REACH_FLAG);
  s = GameFlow.transition(s, GameFlow.EVENT.FLAG_DONE);
  s = GameFlow.transition(s, GameFlow.EVENT.FINISH_GAME);
  eq(s, GameFlow.STATE.WIN, 'D3 clear+finishGame → win');
  s = GameFlow.transition(s, GameFlow.EVENT.CONFIRM);
  eq(s, GameFlow.STATE.TITLE, 'D4 win+confirm → title');

  // E: 탭 비활성 → paused → 복귀
  s = GameFlow.transition(GameFlow.STATE.PLAYING, GameFlow.EVENT.PAUSE_HIDDEN);
  eq(s, GameFlow.STATE.PAUSED, 'E1 playing+pauseHidden → paused');
  s = GameFlow.transition(s, GameFlow.EVENT.CONFIRM);
  eq(s, GameFlow.STATE.PLAYING, 'E2 paused+confirm → playing');

  // F: dying 중 무관 이벤트 (pause / toggleInv / confirm) → dying 유지
  s = GameFlow.STATE.DYING;
  s = GameFlow.transition(s, GameFlow.EVENT.PAUSE);
  eq(s, GameFlow.STATE.DYING, 'F1 dying+pause → dying (유지)');
  s = GameFlow.transition(s, GameFlow.EVENT.TOGGLE_INV);
  eq(s, GameFlow.STATE.DYING, 'F2 dying+toggleInv → dying (유지)');
  s = GameFlow.transition(s, GameFlow.EVENT.CONFIRM);
  eq(s, GameFlow.STATE.DYING, 'F3 dying+confirm → dying (유지)');
  // respawn 외 이벤트는 dying 유지
  for (const e of ['pause', 'toggleInv', 'confirm', 'playerDied', 'reachFlag', 'flagDone', 'nextLevel', 'finishGame', 'pauseHidden']) {
    eq(GameFlow.transition(GameFlow.STATE.DYING, e), GameFlow.STATE.DYING, `F4 dying+${e} → dying`);
  }

  // G: flag 중 무관 이벤트 → flag 유지
  s = GameFlow.STATE.FLAG;
  for (const e of ['pause', 'toggleInv', 'confirm', 'playerDied', 'respawn', 'nextLevel', 'finishGame', 'pauseHidden']) {
    eq(GameFlow.transition(s, e), GameFlow.STATE.FLAG, `G flag+${e} → flag (유지)`);
  }

  // H: clear 중 다른 분기 이벤트 → clear 유지 (nextLevel/finishGame 외)
  s = GameFlow.STATE.CLEAR;
  for (const e of ['pause', 'toggleInv', 'confirm', 'playerDied', 'respawn', 'reachFlag', 'flagDone', 'pauseHidden']) {
    eq(GameFlow.transition(s, e), GameFlow.STATE.CLEAR, `H clear+${e} → clear (유지)`);
  }

  // I: paused 중 무관 이벤트 (toggleInv) → paused 유지
  s = GameFlow.STATE.PAUSED;
  s = GameFlow.transition(s, GameFlow.EVENT.TOGGLE_INV);
  eq(s, GameFlow.STATE.PAUSED, 'I paused+toggleInv → paused (유지, game.js early-return)');

  // J: over — 모든 이벤트 → over 유지 (트리거 없음)
  for (const e of EVENT_VALS) {
    eq(GameFlow.transition(GameFlow.STATE.OVER, e), GameFlow.STATE.OVER, `J over+${e} → over (유지)`);
  }

  // K: win 중 다른 이벤트 (pause/toggleInv 등) → win 유지
  s = GameFlow.STATE.WIN;
  for (const e of ['pause', 'toggleInv', 'playerDied', 'respawn', 'reachFlag', 'flagDone', 'nextLevel', 'finishGame', 'pauseHidden']) {
    eq(GameFlow.transition(s, e), GameFlow.STATE.WIN, `K win+${e} → win (유지)`);
  }
});

// ============================================================================
// 12. game.js 실제 코드와의 일치 — 모든 명세 전이의 source 인용 검증
// ============================================================================
group('all defined transitions are documented', () => {
  const pairs = GameFlow.pairs();
  // pairs()의 각 항목이 transition 결과와 일치
  for (const p of pairs) {
    const idx = p.indexOf('|');
    const s = p.slice(0, idx);
    const e = p.slice(idx + 1);
    const next = GameFlow.transition(s, e);
    check(STATE_VALS.includes(next), `pair ${p} → ${next} (유효 state)`);
  }
});

// ============================================================================
// 결과
// ============================================================================
console.log(`\n총 ${passed}개 통과, ${failed}개 실패`);
if (failed) {
  console.error('GameFlow 회귀 테스트 실패');
  process.exit(1);
}
console.log('ALL FLOW CHECKS PASSED');