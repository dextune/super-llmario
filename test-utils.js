'use strict';

/* GameUtil (js/util.js) 단위 테스트 — node test-utils.js
 *
 * • 외부 의존 없음 (vm + fs + path)
 * • Phase 1-1 추출 헬퍼의 시맨틱 보존을 검증한다:
 *   - clamp: 범위 한정 (game.js 원본 시맨틱과 동일)
 *   - overlap: AABB 충돌 (game.js 원본 시맨틱과 동일)
 *   - cx / cy: 엔티티 중심 (game.js에 산재하던 e.x+e.w/2 식의 단일 출처)
 *   - distTo: 엔티티 중심 → 점 거리 (Math.hypot 패턴 단일 출처)
 *   - compact: 인플레이스 컴팩션 (60fps 루프의 filter 재할당 회피)
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
const close = (a, b, msg) => check(Math.abs(a - b) < 1e-9, `${msg} (got ${a}, expected ${b})`);
const group = (name, fn) => { console.log(`\n[${name}]`); fn(); };

// ============================================================================
// vm 로드
// ============================================================================
const ctx = vm.createContext({ Math, Object, Array, JSON });
const src = fs.readFileSync(path.join(__dirname, 'js', 'util.js'), 'utf8');
const GameUtil = vm.runInContext(src + '\n;GameUtil;', ctx, { filename: 'js/util.js' });

if (!GameUtil || typeof GameUtil !== 'object') {
  console.error('FAIL: GameUtil 모듈을 로드하지 못했습니다.');
  process.exit(1);
}

// ============================================================================
// 1. 노출 인터페이스
// ============================================================================
group('interface', () => {
  for (const k of ['clamp', 'overlap', 'cx', 'cy', 'distTo', 'compact']) {
    check(typeof GameUtil[k] === 'function', `GameUtil.${k} 함수 노출`);
  }
  eq(Object.keys(GameUtil).length, 6, 'GameUtil 키 6개');
});

// ============================================================================
// 2. clamp — Math.max(a, Math.min(b, v))
// ============================================================================
group('clamp', () => {
  eq(GameUtil.clamp(5, 0, 10), 5, '범위 안 값 유지');
  eq(GameUtil.clamp(-3, 0, 10), 0, 'min 미만이 min으로');
  eq(GameUtil.clamp(15, 0, 10), 10, 'max 초과가 max로');
  eq(GameUtil.clamp(0, 0, 10), 0, 'min 경계값');
  eq(GameUtil.clamp(10, 0, 10), 10, 'max 경계값');
  eq(GameUtil.clamp(-100, -50, 50), -50, '음수 범위');
  // a == b 인 경우
  eq(GameUtil.clamp(7, 5, 5), 5, 'a == b 일 때 항상 b');
  eq(GameUtil.clamp(3, 5, 5), 5, 'a == b 일 때 작은 값도 b');
  // swap된 인자 (a > b)는 원본 Math.max/Math.min 시맨틱 그대로 노출됨 — 변경하지 않는다
  eq(GameUtil.clamp(5, 10, 0), 10, 'swap 인자는 원본 시맨틱 유지 (문서화)');
});

// ============================================================================
// 3. overlap — AABB 충돌
// ============================================================================
group('overlap', () => {
  const A = { x: 0, y: 0, w: 10, h: 10 };
  const B = { x: 5, y: 5, w: 10, h: 10 };
  const C = { x: 20, y: 20, w: 5, h: 5 };
  const D = { x: 10, y: 0, w: 10, h: 10 }; // x축 정확히 접점 (a.x+a.w === b.x)
  const Dp = { x: 9.99, y: 0, w: 10, h: 10 }; // 0.01만 겹침
  const E = { x: -5, y: -5, w: 5, h: 5 };
  const Y = { x: 0, y: 10, w: 10, h: 10 }; // y축 정확히 접점

  check(GameUtil.overlap(A, B), '부분 겹침');
  check(GameUtil.overlap(A, A), '자기 자신');
  check(!GameUtil.overlap(A, D), 'x축 정확 접점은 비충돌 (game.js 원본 시맨틱 strict >)');
  check(GameUtil.overlap(A, Dp), 'x축 0.01 겹침은 충돌');
  check(!GameUtil.overlap(A, Y), 'y축 정확 접점도 비충돌');
  check(!GameUtil.overlap(A, C), '완전 분리');
  check(!GameUtil.overlap(A, E), 'A의 좌상단 밖 음수 좌표');

  // 비대칭 호출도 동일한 결과 (symmetric)
  check(GameUtil.overlap(B, A) === GameUtil.overlap(A, B), '대칭 호출 동일 결과');

  // 큰 A와 작은 C — 작은 쪽이 큰 쪽 안에 있을 때
  const BIG = { x: 0, y: 0, w: 100, h: 100 };
  const SMALL = { x: 30, y: 30, w: 5, h: 5 };
  check(GameUtil.overlap(BIG, SMALL), '포함 관계');

  // 좌우로만 분리
  const RIGHT = { x: 11, y: 0, w: 5, h: 10 };
  check(!GameUtil.overlap(A, RIGHT), '오른쪽 완전 분리');

  // 위아래로만 분리
  const DOWN = { x: 0, y: 11, w: 10, h: 5 };
  check(!GameUtil.overlap(A, DOWN), '아래 완전 분리');
});

// ============================================================================
// 4. cx / cy — 엔티티 중심점
// ============================================================================
group('cx / cy', () => {
  const e = { x: 100, y: 200, w: 40, h: 60 };
  eq(GameUtil.cx(e), 120, 'cx(100, 40) = 120');
  eq(GameUtil.cy(e), 230, 'cy(200, 60) = 230');

  // 짝수/홀수 모두 정확
  const odd = { x: 10, y: 10, w: 11, h: 13 };
  eq(GameUtil.cx(odd), 15.5, 'cx 홀수폭');
  eq(GameUtil.cy(odd), 16.5, 'cy 홀수높이');

  // 0폭/0고 — 0 반환
  const zero = { x: 5, y: 5, w: 0, h: 0 };
  eq(GameUtil.cx(zero), 5, 'cx(0폭) = x');
  eq(GameUtil.cy(zero), 5, 'cy(0고) = y');

  // 음수 좌표 (적/플레이어 영역 클램프 후 정상 사용 케이스)
  const neg = { x: -10, y: -20, w: 20, h: 30 };
  eq(GameUtil.cx(neg), 0, 'cx 음수 좌표 정상');
  eq(GameUtil.cy(neg), -5, 'cy 음수 좌표 정상');
});

// ============================================================================
// 5. distTo — 엔티티 중심에서 점까지의 거리
// ============================================================================
group('distTo', () => {
  const e = { x: 0, y: 0, w: 10, h: 10 }; // 중심 (5, 5)
  eq(GameUtil.distTo(e, 5, 5), 0, '자기 중심까지 거리 0');
  eq(GameUtil.distTo(e, 5, 0), 5, '수직 거리 5');
  eq(GameUtil.distTo(e, 15, 5), 10, '수평 거리 10');

  // (3,4,5) 삼각 — 정확히 5
  eq(GameUtil.distTo(e, 5, 0), 5, '3-4-5 (수직)');
  const e2 = { x: 0, y: 0, w: 4, h: 4 }; // 중심 (2, 2)
  close(GameUtil.distTo(e2, 5, 6), 5, '3-4-5 (대각)');

  // 대칭: e→P = e←P
  const P = { x: 50, y: 80, w: 0, h: 0 }; // 중심 == (50, 80)
  const Q = { x: 200, y: 200, w: 0, h: 0 };
  eq(GameUtil.distTo(P, 200, 200), GameUtil.distTo(Q, 50, 80), '거리 대칭');

  // chainLightning에서 자주 등장하는 패턴 — hypot 결과와 정확히 일치
  const e3 = { x: 100, y: 100, w: 30, h: 40 }; // 중심 (115, 120)
  const expected = Math.hypot(115 - 200, 120 - 300);
  close(GameUtil.distTo(e3, 200, 300), expected, 'hypot 동치');
});

// ============================================================================
// 6. compact — 인플레이스 컴팩션
// ============================================================================
group('compact', () => {
  // (a) 기본 제거 — keep = true 만 남김
  const a = [1, 2, 3, 4, 5];
  const r = GameUtil.compact(a, v => v % 2 === 1);
  eq(a.length, 3, '홀수만 남고 길이 3');
  eq(a[0], 1, 'a[0]=1');
  eq(a[1], 3, 'a[1]=3');
  eq(a[2], 5, 'a[2]=5');
  eq(r, a, '반환값은 같은 배열');

  // (b) 모두 제거
  const b = [1, 2, 3];
  GameUtil.compact(b, () => false);
  eq(b.length, 0, '모두 제거');

  // (c) 모두 유지
  const c = [1, 2, 3];
  GameUtil.compact(c, () => true);
  eq(c.length, 3, '모두 유지');

  // (d) 빈 배열
  const empty = [];
  GameUtil.compact(empty, () => false);
  eq(empty.length, 0, '빈 배열 안전');

  // (e) 인플레이스 검증: 원래 배열 참조를 유지하고 새 배열을 만들지 않음
  const ref = [10, 20, 30];
  const beforeRef = ref;
  GameUtil.compact(ref, v => v !== 20);
  eq(ref, beforeRef, '같은 배열 참조 유지');
  eq(ref.length, 2, '길이 2');
  eq(ref[0], 10, '인플레이스 유지 [10]');
  eq(ref[1], 30, '인플레이스 유지 [30]');

  // (f) 객체 배열 (enemies/items에서 사용되는 패턴)
  const enemies = [
    { id: 1, remove: true },
    { id: 2, remove: false },
    { id: 3, remove: true },
    { id: 4, remove: false },
  ];
  GameUtil.compact(enemies, e => !e.remove);
  eq(enemies.length, 2, 'enemies keep=2');
  eq(enemies[0].id, 2, 'enemies[0]=2');
  eq(enemies[1].id, 4, 'enemies[1]=4');

  // (g) 큰 입력에서도 작동
  const big = new Array(1000);
  for (let i = 0; i < 1000; i++) big[i] = i;
  GameUtil.compact(big, v => v >= 500);
  eq(big.length, 500, '큰 배열 길이');
  eq(big[0], 500, '큰 배열 첫 원소');
  eq(big[499], 999, '큰 배열 마지막 원소');
});

// ============================================================================
// 결과
// ============================================================================
console.log(`\n총 ${passed}개 통과, ${failed}개 실패`);
if (failed) {
  console.error('GameUtil 회귀 테스트 실패');
  process.exit(1);
}
console.log('ALL UTIL CHECKS PASSED');