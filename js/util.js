'use strict';

/* 공통 헬퍼 모듈 — Phase 1-1
 *
 * 게임 전반에서 반복되는 단순 연산을 한곳에 모아둔 순수 함수 모음.
 *   clamp   : 값을 [a, b] 범위로 제한
 *   overlap : 두 AABB의 충돌 여부
 *   cx / cy : 엔티티 중심점 (가로/세로)
 *   distTo  : 엔티티 중심에서 (x, y) 까지의 거리
 *   compact : 배열을 인플레이스 컴팩션 (새 배열 할당 없음)
 *
 * 외부 의존 없음. 브라우저 전역 GameUtil로 노출.
 */
const GameUtil = (() => {
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function overlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function cx(e) {
    return e.x + e.w / 2;
  }

  function cy(e) {
    return e.y + e.h / 2;
  }

  function distTo(e, x, y) {
    const dx = cx(e) - x;
    const dy = cy(e) - y;
    return Math.hypot(dx, dy);
  }

  function compact(arr, keep) {
    let w = 0;
    for (let i = 0; i < arr.length; i++) if (keep(arr[i])) arr[w++] = arr[i];
    arr.length = w;
    return arr;
  }

  return { clamp, overlap, cx, cy, distTo, compact };
})();