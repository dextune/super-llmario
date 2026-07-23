'use strict';

/* 게임 상태 머신 — Phase 1-5
 *
 * game.js에 분산되어 있던 state 문자열 비교와 그 전이 규칙을 단일 출처로
 * 모은 순수 모듈. (state, event) → nextState 매핑만 수행하며 외부 의존이 없다.
 *
 * === 노출 API ===
 *   STATE        : 9개 상태 상수 (title/playing/paused/inv/dying/flag/clear/win/over)
 *   EVENT        : 전이를 유발하는 이벤트 상수
 *   transition(s,e)     : 순수 함수. (s,e) → nextState. 불명확한 전이는 s 그대로.
 *   canTransition(s,e)  : (s,e) 전이가 명세되어 있으면 true
 *   pairs()             : 명세된 (state, event) 쌍의 배열 (검증/디버그용)
 *   isState(v)          : v가 STATE 값 중 하나면 true
 *   isEvent(v)          : v가 EVENT 값 중 하나면 true
 *
 * 외부 의존 없음. 브라우저 전역 GameFlow로 노출 (IIFE 스타일).
 *
 * === 전이 명세 근거 (game.js 현재 코드, 2026-07-23 시점) ===
 *
 * title:
 *   - confirm() → startGame() → playing                [KEY Enter, jump-key(non-repeat), overlay click]
 *
 * playing:
 *   - KeyP / Escape → togglePause() → paused
 *   - document.hidden && visibilitychange → togglePause() → paused
 *   - KeyI → toggleInv() → inv
 *   - player.hp <= 0 → die() → dying
 *   - 깃발 도달 (boss dead) → startFlag() → flag
 *
 * paused:
 *   - KeyP / Escape → togglePause() → playing
 *   - Enter / jump-key(non-repeat) / overlay click → confirm() → togglePause() → playing
 *
 * inv:
 *   - KeyI / Tab / Escape → toggleInv() → playing      [inv 분기 early-return 외 모든 키 차단]
 *
 * dying:
 *   - deathT > 25 && player.y > VIEW_H + 120 → respawn → playing
 *
 * flag:
 *   - flagPhase === 'done' && flagT > 30 → clear
 *
 * clear:
 *   - confirm() + 다음 레벨 존재 → playing            [nextLevel]
 *   - confirm() + 마지막 레벨 → win                   [finishGame]
 *
 * win:
 *   - confirm() → toTitle() → title
 *
 * over:
 *   - 정의된 전이 없음. 오버레이 DOM 요소만 존재하며 트리거가 없음.
 *
 * === 불명확 전이 정책 ===
 * 명세되지 않은 (state, event) 조합은 현재 상태를 그대로 반환한다.
 * 예: dying + pause → dying, flag + toggleInv → flag, over + (any) → over.
 * 잘못된 state/event 값도 입력 state를 그대로 반환한다 (방어적 동작).
 */

const GameFlow = (() => {
  // ----- 상태 -----
  const STATE = Object.freeze({
    TITLE:   'title',
    PLAYING: 'playing',
    PAUSED:  'paused',
    INV:     'inv',
    DYING:   'dying',
    FLAG:    'flag',
    CLEAR:   'clear',
    WIN:     'win',
    OVER:    'over',
  });

  // ----- 이벤트 -----
  const EVENT = Object.freeze({
    CONFIRM:      'confirm',        // Enter / jump-key(non-playing) / overlay click
    PAUSE:        'pause',          // KeyP / Escape (togglePause)
    TOGGLE_INV:   'toggleInv',      // KeyI / inv 내 Tab·Escape
    PLAYER_DIED:  'playerDied',     // player.hp <= 0 (die())
    RESPAWN:      'respawn',        // dying 애니메이션 종료 후 자동
    REACH_FLAG:   'reachFlag',      // 깃발 도달 + 보스 dead
    FLAG_DONE:    'flagDone',       // 깃발 시퀀스 종료
    NEXT_LEVEL:   'nextLevel',      // clear + 다음 레벨 존재
    FINISH_GAME:  'finishGame',     // clear + 마지막 레벨
    PAUSE_HIDDEN: 'pauseHidden',    // document.hidden (visibilitychange)
  });

  const ALL_STATES = new Set(Object.values(STATE));
  const ALL_EVENTS = new Set(Object.values(EVENT));

  // ----- 검증된 전이 명세 (game.js에서 현재 확인 가능한 것만) -----
  // 키는 "state|event" 형태. 값은 다음 상태.
  const T = Object.freeze({
    [`${STATE.TITLE}|${EVENT.CONFIRM}`]:        STATE.PLAYING,

    [`${STATE.PLAYING}|${EVENT.PAUSE}`]:         STATE.PAUSED,
    [`${STATE.PLAYING}|${EVENT.PAUSE_HIDDEN}`]:  STATE.PAUSED,
    [`${STATE.PLAYING}|${EVENT.TOGGLE_INV}`]:    STATE.INV,
    [`${STATE.PLAYING}|${EVENT.PLAYER_DIED}`]:   STATE.DYING,
    [`${STATE.PLAYING}|${EVENT.REACH_FLAG}`]:    STATE.FLAG,

    [`${STATE.PAUSED}|${EVENT.CONFIRM}`]:        STATE.PLAYING,
    [`${STATE.PAUSED}|${EVENT.PAUSE}`]:         STATE.PLAYING,

    [`${STATE.INV}|${EVENT.TOGGLE_INV}`]:        STATE.PLAYING,

    [`${STATE.DYING}|${EVENT.RESPAWN}`]:         STATE.PLAYING,

    [`${STATE.FLAG}|${EVENT.FLAG_DONE}`]:        STATE.CLEAR,

    [`${STATE.CLEAR}|${EVENT.NEXT_LEVEL}`]:      STATE.PLAYING,
    [`${STATE.CLEAR}|${EVENT.FINISH_GAME}`]:     STATE.WIN,

    [`${STATE.WIN}|${EVENT.CONFIRM}`]:           STATE.TITLE,
  });

  function transition(state, event) {
    if (!ALL_STATES.has(state) || !ALL_EVENTS.has(event)) return state;
    return T[state + '|' + event] || state;
  }

  function canTransition(state, event) {
    if (!ALL_STATES.has(state) || !ALL_EVENTS.has(event)) return false;
    return Object.prototype.hasOwnProperty.call(T, state + '|' + event);
  }

  function pairs() {
    return Object.keys(T);
  }

  function isState(v) { return ALL_STATES.has(v); }
  function isEvent(v) { return ALL_EVENTS.has(v); }

  return {
    STATE, EVENT,
    transition, canTransition, pairs,
    isState, isEvent,
  };
})();