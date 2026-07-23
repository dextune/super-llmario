'use strict';

/* 레벨 데이터 무결성 검증 — node test-levels.js */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'js', 'levels.js'), 'utf8');
const ctx = vm.createContext({});
const LevelData = vm.runInContext(src + '\n;LevelData;', ctx);

const FLY = new Set(['bat']);
const SOLID_CHARS = new Set(['X', 'B', '?', 'M', '(', ')', '[', ']']);
let failed = 0;
const check = (cond, msg) => { if (!cond) { failed++; console.error('  FAIL:', msg); } };

for (let i = 0; i < LevelData.COUNT; i++) {
  const d = LevelData.def(i);
  const b = d.make();
  const G = b.G;
  console.log(`LEVEL ${i + 1} (${d.name})  mlvl=${d.mlvl}`);

  check(G.length === LevelData.ROWS, `rows=${G.length}`);
  G.forEach((row, r) => check(row.length === LevelData.W, `row ${r} length ${row.length}`));

  check(typeof d.mlvl === 'number' && d.mlvl >= 1, `bad mlvl`);
  check(typeof d.bgm === 'number', `bad bgm`);
  check(d.theme && d.theme.sky && d.theme.ground, `missing theme`);

  // 깃발 기둥 주변(2~10행)은 비어 있어야 함
  for (let r = 0; r <= 10; r++) check(!SOLID_CHARS.has(G[r][d.flag]), `flag col blocked at r${r}: ${G[r][d.flag]}`);

  // 성/스폰 아래 지면 존재
  for (let c = d.castle; c < d.castle + 5; c++) check(G[11][c] === 'X', `castle ground missing c${c}`);
  check(G[11][d.spawn] === 'X', 'spawn ground missing');

  // 파이프 좌우 쌍 일치
  const cnt = {};
  for (const row of G) for (const ch of row) cnt[ch] = (cnt[ch] || 0) + 1;
  check((cnt['('] || 0) === (cnt[')'] || 0), 'pipe cap pair mismatch');
  check((cnt['['] || 0) === (cnt[']'] || 0), 'pipe body pair mismatch');

  // 버섯 블록 1개
  check((cnt['M'] || 0) === 1, `mushroom blocks = ${cnt['M'] || 0} (expected 1)`);

  // 적
  check(b.enemies.length >= 6, `not enough enemies: ${b.enemies.length}`);
  for (const en of b.enemies) {
    const c = en.c, type = en.type;
    check(c > 5 && c < LevelData.W - 10, `enemy out of range: ${c}`);
    if (!FLY.has(type)) check(G[11][Math.floor(c)] === 'X', `ground enemy ${type} at ${c} has no ground below`);
  }

  // 보스: 마지막 스테이지에 보스 1마리
  if (i === LevelData.COUNT - 1) {
    const bosses = b.enemies.filter(e => e.type === 'boss');
    check(bosses.length === 1, `expected 1 boss on last stage, got ${bosses.length}`);
  }

  // 상자: 지면 위
  for (const c of b.chests) {
    check(c.c > 5 && c.c < LevelData.W - 10, `chest out of range: ${c.c}`);
    check(G[11][c.c] === 'X', `chest at ${c.c} has no ground below`);
    check(['magic', 'rare', 'epic', 'unique'].includes(c.rarity), `chest bad rarity ${c.rarity}`);
  }

  console.log(`  tiles: ${JSON.stringify(cnt)}`);
  console.log(`  enemies: ${b.enemies.length}  chests: ${b.chests.length}`);
}

if (failed) { console.error(`\n${failed} check(s) FAILED`); process.exit(1); }
console.log('\nALL LEVEL CHECKS PASSED');
