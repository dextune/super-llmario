'use strict';

/* 레벨 데이터 — 6개 스테이지, 타일 그리드 + 타입별 적 + 상자.
   문자표: X 지면, B 벽돌, ? 질문(코인/아이템), M 질문(버섯), ( ) [ ] 파이프,
           o 코인, C 상자 */
const LevelData = (() => {
  const ROWS = 13;
  const W = 212;

  function build(fn) {
    const G = Array.from({ length: ROWS }, () => Array(W).fill(' '));
    const enemies = [];
    const chests = [];
    const api = {
      set(c, r, ch) { if (c >= 0 && c < W && r >= 0 && r < ROWS) G[r][c] = ch; },
      ground(c0, c1) { for (let c = c0; c <= c1; c++) { this.set(c, 11, 'X'); this.set(c, 12, 'X'); } },
      row(c0, c1, r, ch) { for (let c = c0; c <= c1; c++) this.set(c, r, ch); },
      pipe(c, h) {
        const top = 11 - h;
        this.set(c, top, '('); this.set(c + 1, top, ')');
        for (let r = top + 1; r <= 10; r++) { this.set(c, r, '['); this.set(c + 1, r, ']'); }
      },
      stairUp(c, h) { for (let i = 0; i < h; i++) for (let r = 10; r >= 10 - i; r--) this.set(c + i, r, 'X'); },
      stairDown(c, h) { for (let i = 0; i < h; i++) for (let r = 10; r >= 10 - (h - 1 - i); r--) this.set(c + i, r, 'X'); },
      coins(c0, c1, r) { this.row(c0, c1, r, 'o'); },
      enemy(c, type) { enemies.push({ c, type: type || 'goomba' }); },
      goomba(c) { enemies.push({ c, type: 'goomba' }); },
      bat(c) { enemies.push({ c, type: 'bat' }); },
      chest(c, rarity) { chests.push({ c, rarity: rarity || 'rare' }); },
    };
    fn(api);
    return { G, enemies, chests };
  }

  const defs = [
    // 1. 초원 — 오버월드 (쉬움)
    {
      name: 'WORLD 1-1 · 초원', mlvl: 1, speed: 1.0, flag: 180, castle: 186, spawn: 3, time: 320, bgm: 0,
      theme: { sky: ['#4f8cff', '#a8d9ff'], hill: '#2f9e44', hillDark: '#1e7a30', bush: '#41bd55', bushDark: '#2c9440', cloud: '#ffffff', sun: false, ground: '#cf6a1f' },
      make: () => build(a => {
        a.ground(0, 68); a.ground(72, 86); a.ground(91, 117); a.ground(122, 211);
        a.set(16, 7, '?'); a.set(17, 7, 'B'); a.set(18, 7, 'M'); a.set(19, 7, 'B'); a.set(20, 7, '?');
        a.coins(33, 35, 6);
        a.pipe(28, 2); a.pipe(38, 3); a.pipe(46, 4); a.pipe(57, 4);
        a.enemy(22, 'goomba'); a.enemy(40, 'goomba'); a.enemy(51, 'goomba'); a.enemy(52.6, 'goomba');
        a.enemy(80, 'goomba'); a.enemy(82.5, 'koopa');
        a.row(94, 97, 7, 'B'); a.set(95, 7, '?'); a.coins(100, 103, 2);
        a.enemy(104, 'goomba'); a.enemy(105.6, 'koopa');
        a.stairUp(110, 8); a.stairDown(122, 8);
        a.set(136, 7, '?'); a.set(137, 7, 'B'); a.set(138, 7, '?');
        a.coins(146, 149, 6);
        a.pipe(156, 2); a.enemy(150, 'goomba'); a.enemy(151.6, 'koopa');
        a.chest(160, 'magic');
        a.stairUp(166, 8);
      }),
    },
    // 2. 석양 — 황혼 들판
    {
      name: 'WORLD 1-2 · 황혼', mlvl: 2, speed: 1.15, flag: 182, castle: 188, spawn: 3, time: 320, bgm: 0,
      theme: { sky: ['#5a2a6b', '#ff9d5c'], hill: '#1d6134', hillDark: '#124724', bush: '#2c8a41', bushDark: '#1e6b30', cloud: '#ffd9b0', sun: true, ground: '#a85a1e' },
      make: () => build(a => {
        a.ground(0, 49); a.ground(53, 59); a.ground(68, 89); a.ground(94, 105); a.ground(110, 211);
        a.enemy(16, 'goomba'); a.enemy(17.6, 'koopa'); a.enemy(19.2, 'bat');
        a.row(24, 27, 7, 'B'); a.set(26, 7, '?'); a.coins(24, 27, 6);
        a.pipe(32, 3); a.pipe(40, 4); a.enemy(36, 'koopa');
        a.bat(55); a.bat(61); a.bat(65);
        a.row(61, 62, 8, 'B'); a.row(64, 65, 6, 'B'); a.coins(64, 65, 5);
        a.set(76, 7, '?'); a.set(77, 7, 'M'); a.set(78, 7, '?');
        a.enemy(72, 'koopa'); a.enemy(73.6, 'bat'); a.enemy(82, 'goomba'); a.enemy(83.6, 'koopa'); a.enemy(85.2, 'bat');
        a.enemy(96, 'koopa');
        a.stairUp(100, 6); a.stairDown(110, 6);
        a.set(120, 6, 'o'); a.set(121, 5, 'o'); a.set(122, 4, 'o'); a.set(123, 4, 'o'); a.set(124, 4, 'o'); a.set(125, 5, 'o'); a.set(126, 6, 'o');
        a.row(132, 137, 7, 'B'); a.set(134, 7, '?'); a.enemy(135, 'bat'); a.coins(142, 144, 6);
        a.set(148, 7, '?'); a.pipe(152, 4); a.enemy(158, 'koopa'); a.enemy(159.6, 'bat');
        a.chest(164, 'rare'); a.stairUp(166, 8);
      }),
    },
    // 3. 지하 동굴
    {
      name: 'WORLD 2-1 · 지하동굴', mlvl: 4, speed: 1.2, flag: 184, castle: 190, spawn: 3, time: 340, bgm: 1,
      theme: { sky: ['#1a1426', '#3a2a1a'], hill: '#2a2030', hillDark: '#1a1020', bush: '#332840', bushDark: '#221830', cloud: '#3a3040', sun: false, ground: '#5a3a2a' },
      make: () => build(a => {
        a.ground(0, 40); a.ground(44, 70); a.ground(74, 110); a.ground(114, 150); a.ground(154, 211);
        a.enemy(14, 'bat'); a.enemy(16, 'skeleton'); a.enemy(18.4, 'bat');
        a.row(22, 25, 6, 'B'); a.set(23, 6, '?'); a.coins(22, 25, 5);
        a.pipe(30, 3); a.enemy(34, 'skeleton'); a.bat(38);
        a.bat(46); a.bat(50); a.bat(54); a.bat(58);
        a.row(60, 64, 7, 'B'); a.set(62, 7, 'M'); a.coins(60, 64, 6);
        a.enemy(76, 'skeleton'); a.enemy(78, 'bat'); a.enemy(80, 'skeleton');
        a.stairUp(86, 5); a.stairDown(94, 5);
        a.set(100, 6, '?'); a.set(101, 6, '?'); a.coins(102, 106, 5);
        a.enemy(116, 'skeleton'); a.enemy(118, 'skeleton'); a.enemy(120, 'bat');
        a.row(124, 130, 7, 'B'); a.set(127, 7, '?');
        a.chest(138, 'rare');
        a.enemy(156, 'skeleton'); a.enemy(158, 'bat'); a.enemy(160, 'skeleton');
        a.pipe(166, 4); a.pipe(176, 3);
        a.coins(170, 174, 6); a.enemy(172, 'bat');
        a.stairUp(186, 8);
      }),
    },
    // 4. 설원
    {
      name: 'WORLD 2-2 · 설원', mlvl: 6, speed: 1.25, flag: 184, castle: 190, spawn: 3, time: 340, bgm: 1,
      theme: { sky: ['#9ec5e8', '#e8f4ff'], hill: '#cfe4f5', hillDark: '#9fc0d8', bush: '#bcd9ee', bushDark: '#9cc0d8', cloud: '#ffffff', sun: true, ground: '#cfe0ee' },
      make: () => build(a => {
        a.ground(0, 52); a.ground(56, 64); a.ground(70, 96); a.ground(100, 132); a.ground(136, 160); a.ground(164, 211);
        a.enemy(14, 'ice'); a.enemy(16, 'bat'); a.enemy(20, 'skeleton');
        a.row(24, 28, 7, 'B'); a.set(26, 7, '?'); a.coins(24, 28, 5);
        a.pipe(32, 3); a.enemy(36, 'ice');
        a.bat(57); a.bat(60); a.bat(63);
        a.row(60, 61, 8, 'B'); a.row(63, 64, 6, 'B'); a.coins(63, 64, 5);
        a.enemy(72, 'ice'); a.enemy(74, 'skeleton'); a.enemy(78, 'bat'); a.enemy(82, 'ice'); a.enemy(86, 'bat'); a.enemy(90, 'skeleton');
        a.set(98, 6, '?'); a.set(99, 6, 'M');
        a.stairUp(104, 6); a.stairDown(112, 6);
        a.coins(116, 122, 6);
        a.enemy(104, 'ice'); a.enemy(124, 'skeleton'); a.enemy(126, 'bat');
        a.row(138, 146, 7, 'B'); a.set(142, 7, '?'); a.coins(138, 146, 6);
        a.enemy(140, 'ice'); a.enemy(144, 'skeleton');
        a.chest(150, 'epic'); a.pipe(154, 4);
        a.enemy(166, 'ice'); a.enemy(168, 'ice'); a.enemy(172, 'skeleton'); a.enemy(174, 'bat');
        a.row(178, 184, 6, 'B'); a.set(181, 6, '?'); a.coins(178, 184, 6);
        a.stairUp(190, 8);
      }),
    },
    // 5. 용암 지옥
    {
      name: 'WORLD 3-1 · 용암지옥', mlvl: 9, speed: 1.35, flag: 184, castle: 190, spawn: 3, time: 340, bgm: 1,
      theme: { sky: ['#2a0a0a', '#ff5a1a'], hill: '#5a1010', hillDark: '#3a0808', bush: '#7a1a10', bushDark: '#5a1008', cloud: '#ff8030', sun: true, ground: '#3a1208' },
      make: () => build(a => {
        a.ground(0, 44); a.ground(48, 58); a.ground(62, 78); a.ground(82, 104); a.ground(108, 132); a.ground(136, 160); a.ground(164, 211);
        a.enemy(12, 'demon'); a.enemy(14, 'skeleton'); a.enemy(18, 'demon'); a.bat(22);
        a.row(26, 30, 6, 'B'); a.set(28, 6, '?'); a.coins(26, 30, 5);
        a.pipe(34, 3); a.enemy(38, 'demon');
        a.bat(49); a.bat(52); a.bat(55);
        a.row(50, 51, 8, 'B'); a.row(54, 55, 6, 'B');
        a.enemy(64, 'demon'); a.enemy(66, 'demon'); a.enemy(70, 'skeleton'); a.enemy(74, 'bat');
        a.set(80, 5, '?'); a.set(81, 5, 'M'); a.set(82, 5, '?');
        a.stairUp(88, 5); a.stairDown(96, 5);
        a.enemy(92, 'demon'); a.enemy(110, 'demon'); a.enemy(112, 'demon'); a.enemy(114, 'skeleton'); a.bat(118); a.bat(122);
        a.row(108, 116, 7, 'B'); a.set(112, 7, '?'); a.coins(108, 116, 6);
        a.row(120, 128, 6, 'B'); a.set(124, 6, '?'); a.coins(120, 128, 6);
        a.enemy(138, 'demon'); a.enemy(140, 'demon'); a.enemy(144, 'skeleton'); a.enemy(146, 'bat');
        a.chest(150, 'epic'); a.pipe(154, 4);
        a.enemy(166, 'demon'); a.enemy(168, 'demon'); a.enemy(172, 'demon'); a.enemy(174, 'skeleton'); a.bat(178); a.bat(182);
        a.row(170, 180, 7, 'B'); a.set(175, 7, '?');
        a.stairUp(188, 8);
      }),
    },
    // 6. 마왕성 — 보스
    {
      name: 'WORLD 3-2 · 마왕성', mlvl: 12, speed: 1.4, flag: 188, castle: 194, spawn: 3, time: 400, bgm: 2,
      theme: { sky: ['#0a0a12', '#2a1a3a'], hill: '#1a1226', hillDark: '#100a18', bush: '#241a30', bushDark: '#180f24', cloud: '#2a2038', sun: false, ground: '#2a1a2a' },
      make: () => build(a => {
        a.ground(0, 60); a.ground(64, 96); a.ground(100, 140); a.ground(144, 170); a.ground(174, 211);
        a.enemy(10, 'skeleton'); a.enemy(12, 'demon'); a.enemy(16, 'skeleton'); a.bat(20); a.bat(24);
        a.row(28, 34, 7, 'B'); a.set(31, 7, '?'); a.coins(28, 34, 6);
        a.pipe(38, 3); a.enemy(42, 'demon'); a.enemy(44, 'skeleton');
        a.bat(66); a.bat(70); a.bat(74); a.bat(78); a.bat(82); a.bat(86); a.bat(90);
        a.row(64, 72, 6, 'B'); a.coins(64, 72, 6); a.set(68, 6, 'M'); a.set(70, 6, '?');
        a.enemy(102, 'demon'); a.enemy(104, 'demon'); a.enemy(106, 'skeleton'); a.enemy(108, 'skeleton');
        a.bat(112); a.bat(116); a.bat(120); a.bat(124); a.bat(128); a.bat(132);
        a.row(100, 110, 7, 'B'); a.set(105, 7, '?'); a.coins(100, 110, 6);
        a.row(114, 126, 6, 'B'); a.coins(114, 126, 6); a.set(120, 6, '?');
        a.enemy(146, 'demon'); a.enemy(148, 'demon'); a.enemy(150, 'skeleton'); a.bat(154); a.bat(158); a.bat(162);
        a.chest(166, 'epic'); a.chest(168, 'epic');
        // 보스 — 깃발 직전
        a.enemy(176, 'boss');
        a.stairUp(190, 8);
      }),
    },
  ];

  return { ROWS, W, COUNT: defs.length, def: i => defs[i] };
})();
