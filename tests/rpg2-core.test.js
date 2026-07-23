'use strict';

const assert = require('assert/strict');
const vm = require('vm');
const { assembleEntry, verifyAll } = require('../scripts/assemble-sources');

function loadCore() {
  const { source } = assembleEntry('ms-core.js');
  const sandbox = { module: { exports: {} }, exports: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(source, { filename: 'ms-core.js' }).runInContext(sandbox);
  return sandbox.module.exports;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function run() {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
      passed++;
      console.log('PASS', name);
    } catch (error) {
      console.error('FAIL', name);
      throw error;
    }
  }
  console.log(`CORE_TESTS_PASS ${passed}/${tests.length}`);
}

const MS = loadCore();

test('source manifest integrity and JavaScript compilation', () => {
  const verified = verifyAll();
  assert.ok(verified['ms-core.js']);
  assert.ok(verified['ms-game.js']);
  assert.ok(verified['ms-core.js'].bytes > 0);
  assert.ok(verified['ms-game.js'].bytes > 0);
});

test('six weapons with distinct stats are defined', () => {
  assert.equal(MS.WEAPON_KEYS.length, 6);
  for (const key of MS.WEAPON_KEYS) {
    const w = MS.WEAPONS[key];
    assert.ok(w.name, key + ' has name');
    assert.ok(w.letter, key + ' has letter');
    assert.ok(w.fireRate > 0, key + ' has fireRate');
    assert.ok(w.damage > 0, key + ' has damage');
    assert.ok(w.kind, key + ' has kind');
  }
  assert.equal(MS.WEAPONS.pistol.ammo, Infinity);
  assert.ok(MS.WEAPONS.hmg.ammo > 0 && MS.WEAPONS.hmg.ammo !== Infinity);
  assert.ok(MS.WEAPONS.shotgun.pellets > 1);
  assert.ok(MS.WEAPONS.rocket.radius > 0);
  assert.equal(MS.WEAPONS.laser.piercing, true);
});

test('five stages with distinct themes and spawns', () => {
  assert.equal(MS.STAGES.length, 5);
  for (const stage of MS.STAGES) {
    assert.ok(stage.name, 'stage has name');
    assert.ok(stage.subtitle, 'stage has subtitle');
    assert.ok(stage.width > 1000, 'stage has width');
    assert.ok(stage.timeLimit > 60, 'stage has timeLimit');
    assert.ok(stage.theme, 'stage has theme');
    assert.ok(stage.theme.sky, 'stage theme has sky color');
    assert.ok(stage.theme.ground, 'stage theme has ground color');
    assert.ok(stage.spawns.length > 0, 'stage has spawns');
    assert.ok(stage.prisoners > 0, 'stage has prisoners');
  }
  const themes = new Set(MS.STAGES.map(s => s.theme.sky));
  assert.ok(themes.size >= 4, 'stages have distinct themes');
});

test('enemy types with distinct roles', () => {
  const types = Object.keys(MS.ENEMY_TYPES);
  assert.ok(types.length >= 7, 'at least 7 enemy types');
  for (const type of types) {
    const e = MS.ENEMY_TYPES[type];
    assert.ok(e.role, type + ' has role');
    assert.ok(e.hp > 0, type + ' has hp');
    assert.ok(e.damage > 0, type + ' has damage');
    assert.ok(e.score > 0, type + ' has score');
  }
  assert.ok(MS.ENEMY_TYPES.grunt.role === 'walker');
  assert.ok(MS.ENEMY_TYPES.turret.speed === 0, 'turret is stationary');
  assert.ok(MS.ENEMY_TYPES.tank.miniboss === true, 'tank is miniboss');
  assert.ok(MS.ENEMY_TYPES.chopper.flying === true, 'chopper is flying');
});

test('five bosses with multi-phase patterns', () => {
  assert.equal(MS.BOSSES.length, 5);
  for (const boss of MS.BOSSES) {
    assert.ok(boss.name, 'boss has name');
    assert.ok(boss.hp > 200, 'boss has substantial hp');
    assert.ok(boss.phases.length >= 2, 'boss has at least 2 phases');
    assert.ok(boss.score > 0, 'boss has score');
    for (const phase of boss.phases) {
      assert.ok(phase.pattern.length > 0, 'phase has patterns');
    }
  }
  assert.equal(MS.BOSSES[0].stage, 0);
  assert.equal(MS.BOSSES[4].stage, 4);
});

test('score calculation rewards kills, prisoners, and time', () => {
  const highScore = MS.calcStageScore({
    kills: 30, prisoners: 8, timeRemaining: 120, noHit: true, grenadesLeft: 5,
  });
  const lowScore = MS.calcStageScore({
    kills: 5, prisoners: 0, timeRemaining: 0, noHit: false, grenadesLeft: 0,
  });
  assert.ok(highScore > lowScore * 5, 'good play scores much higher');
  assert.ok(highScore > 15000, 'excellent run exceeds 15000');
});

test('score grades are ordered correctly', () => {
  assert.equal(MS.scoreGrade(50000), 'S');
  assert.equal(MS.scoreGrade(30000), 'A');
  assert.equal(MS.scoreGrade(20000), 'B');
  assert.equal(MS.scoreGrade(10000), 'C');
  assert.equal(MS.scoreGrade(1000), 'D');
});

test('save system creates and validates saves', () => {
  const save = MS.createSave();
  assert.equal(save.unlockedStages, 1);
  assert.equal(save.totalKills, 0);
  assert.equal(Object.keys(save.highScores).length, 0);
  assert.equal(Object.keys(save.bestGrade).length, 0);

  const bad = MS.validateSave({ unlockedStages: 999, totalKills: -5 });
  assert.equal(bad.unlockedStages, MS.TOTAL_STAGES);
  assert.equal(bad.totalKills, 0);
});

test('recording stage results unlocks stages and tracks best scores', () => {
  const save = MS.createSave();
  MS.unlockNextStage(save, 0);
  assert.equal(save.unlockedStages, 2);
  assert.ok(MS.stageUnlocked(save, 1), 'stage 1 unlocked');

  MS.recordStageResult(save, 0, 25000, 'A', 20, 6);
  assert.equal(save.highScores['0'], 25000);
  assert.equal(save.bestGrade['0'], 'A');
  assert.equal(save.totalKills, 20);
  assert.equal(save.totalPrisoners, 6);

  MS.recordStageResult(save, 0, 15000, 'B', 10, 3);
  assert.equal(save.highScores['0'], 25000, 'keeps best score');
  assert.equal(save.bestGrade['0'], 'A', 'keeps best grade');
});

test('random weapon drop returns valid weapon', () => {
  const rng = MS.makeRng(42);
  for (let i = 0; i < 20; i++) {
    const w = MS.randomWeaponDrop(rng);
    assert.ok(MS.WEAPONS[w], 'drop is a valid weapon');
    assert.notEqual(w, 'pistol', 'never drops pistol');
  }
});

test('formatScore adds thousands separators', () => {
  assert.equal(MS.formatScore(1234567), '1,234,567');
  assert.equal(MS.formatScore(0), '0');
});

run();
