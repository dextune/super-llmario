'use strict';

const assert = require('assert/strict');
const vm = require('vm');
const { assembleEntry, verifyAll } = require('../scripts/assemble-sources');

function loadCore() {
  const { source } = assembleEntry('rpg2-core.js');
  const sandbox = { module: { exports: {} }, exports: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(source, { filename: 'rpg2-core.js' }).runInContext(sandbox);
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

const RPG = loadCore();

test('source manifest integrity and JavaScript compilation', () => {
  const verified = verifyAll();
  assert.equal(verified['rpg2-core.js'].bytes, 43680);
  assert.equal(verified['rpg2-game.js'].bytes, 80205);
});

test('three distinct classes and six-stage campaign are defined', () => {
  assert.deepEqual(Object.keys(RPG.CLASS_DEFS), ['vanguard', 'arcanist', 'ranger']);
  assert.equal(RPG.STAGES.length, 6);
  for (const classId of Object.keys(RPG.CLASS_DEFS)) assert.equal(RPG.SKILL_TREES[classId].length, 6);
  assert.equal(new Set(RPG.STAGES.map(stage => stage.mechanic)).size, 6);
});

test('profile creation assigns starter equipment and class identity', () => {
  for (const classId of Object.keys(RPG.CLASS_DEFS)) {
    const profile = RPG.createProfile(classId, 1000);
    assert.equal(profile.classId, classId);
    assert.equal(profile.level, 1);
    assert.equal(profile.gold, 320);
    assert.equal(profile.inventory.length, 0);
    assert.equal(profile.equipment.weapon.slot, 'weapon');
    assert.match(profile.equipment.weapon.id, /^starter-/);
  }
});

test('derived stats preserve class roles', () => {
  const v = RPG.deriveStats(RPG.createProfile('vanguard', 1));
  const a = RPG.deriveStats(RPG.createProfile('arcanist', 2));
  const r = RPG.deriveStats(RPG.createProfile('ranger', 3));
  assert.ok(v.maxHp > r.maxHp && r.maxHp > a.maxHp);
  assert.ok(a.maxMp > r.maxMp && r.maxMp > v.maxMp);
  assert.ok(r.crit > a.crit && a.crit > v.crit);
});

test('experience awards levels, skill points, and stat points', () => {
  const profile = RPG.createProfile('vanguard', 10);
  const gain = RPG.xpForLevel(1) + RPG.xpForLevel(2) + 10;
  const levels = RPG.awardXP(profile, gain);
  assert.equal(levels, 2);
  assert.equal(profile.level, 3);
  assert.equal(profile.skillPoints, 4);
  assert.equal(profile.statPoints, 6);
  assert.equal(profile.xp, 10);
});

test('stat allocation consumes points and affects derived stats', () => {
  const profile = RPG.createProfile('vanguard', 11);
  profile.statPoints = 2;
  const before = RPG.deriveStats(profile);
  assert.equal(RPG.allocateStat(profile, 'vitality').ok, true);
  assert.equal(RPG.allocateStat(profile, 'might').ok, true);
  assert.equal(RPG.allocateStat(profile, 'focus').reason, 'no-points');
  const after = RPG.deriveStats(profile);
  assert.ok(after.maxHp > before.maxHp);
  assert.ok(after.attack > before.attack);
});

test('skill prerequisites and rank caps are enforced', () => {
  const profile = RPG.createProfile('vanguard', 12);
  profile.skillPoints = 20;
  assert.equal(RPG.canBuySkill(profile, 'v_slam').reason, 'prerequisite');
  assert.equal(RPG.buySkill(profile, 'v_power').ok, true);
  assert.equal(RPG.buySkill(profile, 'v_power').ok, true);
  assert.equal(RPG.canBuySkill(profile, 'v_slam').ok, true);
  assert.equal(RPG.buySkill(profile, 'v_slam').ok, true);
  for (let i = 0; i < 3; i++) RPG.buySkill(profile, 'v_power');
  assert.equal(profile.skills.v_power, 5);
  assert.equal(RPG.buySkill(profile, 'v_power').reason, 'max-rank');
  const stats = RPG.deriveStats(profile);
  assert.ok(stats.attackPct >= 30);
  assert.ok(stats.effects.primaryDamagePct >= 15);
});

test('seeded item generation is deterministic and schema-valid', () => {
  const a = RPG.createItem(8, RPG.makeRng(12345), { rarity: 'rare', slot: 'weapon' });
  const b = RPG.createItem(8, RPG.makeRng(12345), { rarity: 'rare', slot: 'weapon' });
  assert.deepEqual(a, b);
  assert.equal(a.slot, 'weapon');
  assert.equal(a.rarity, 'rare');
  assert.equal(a.affixes.length, 2);
  assert.ok(a.value > 0);
  assert.ok(RPG.itemScore(a, 'vanguard') > 0);
});

test('unique item generation changes combat behavior data', () => {
  const item = RPG.createItem(12, RPG.makeRng(998), { rarity: 'unique' });
  assert.equal(item.rarity, 'unique');
  assert.ok(RPG.SLOTS.includes(item.slot));
  assert.equal(typeof item.uniqueEffect, 'string');
  assert.ok(item.uniqueEffect.length > 4);
});

test('equip and unequip preserve inventory items', () => {
  const profile = RPG.createProfile('ranger', 13);
  const item = RPG.createItem(6, RPG.makeRng(44), { rarity: 'rare', slot: 'weapon' });
  profile.inventory.push(item);
  const starter = profile.equipment.weapon;
  const equipped = RPG.equipItem(profile, 0);
  assert.equal(equipped.ok, true);
  assert.equal(profile.equipment.weapon.id, item.id);
  assert.ok(profile.inventory.some(entry => entry.id === starter.id));
  const unequipped = RPG.unequipItem(profile, 'weapon');
  assert.equal(unequipped.ok, true);
  assert.equal(profile.equipment.weapon, null);
  assert.ok(profile.inventory.some(entry => entry.id === item.id));
});

test('selling and salvaging create different economic outputs', () => {
  const sellProfile = RPG.createProfile('vanguard', 14);
  const sellItem = RPG.createItem(7, RPG.makeRng(51), { rarity: 'rare' });
  sellProfile.inventory.push(sellItem);
  const goldBefore = sellProfile.gold;
  const sold = RPG.sellItem(sellProfile, 0);
  assert.equal(sold.ok, true);
  assert.equal(sellProfile.gold, goldBefore + sold.gold);

  const salvageProfile = RPG.createProfile('vanguard', 15);
  const salvageItem = RPG.createItem(7, RPG.makeRng(52), { rarity: 'epic' });
  salvageProfile.inventory.push(salvageItem);
  const materialBefore = salvageProfile.materials;
  const salvaged = RPG.salvageItem(salvageProfile, 0);
  assert.equal(salvaged.ok, true);
  assert.ok(salvageProfile.materials > materialBefore);
  assert.equal(salvaged.materials, RPG.salvageYield(salvageItem));
});

test('shop stock is deterministic and gear can only be purchased once', () => {
  const profile = RPG.createProfile('arcanist', 16);
  profile.gold = 100000;
  const first = RPG.getShopStock(profile);
  const second = RPG.getShopStock(profile);
  assert.deepEqual(first, second);
  assert.equal(first.length, 8);
  const gear = first[0];
  assert.equal(RPG.buyShopEntry(profile, gear).ok, true);
  assert.equal(RPG.buyShopEntry(profile, gear).reason, 'sold');
  const hpBefore = profile.potions.hp;
  assert.equal(RPG.buyShopEntry(profile, first[6]).ok, true);
  assert.equal(profile.potions.hp, hpBefore + 1);
  const refreshesBefore = profile.shopRefreshes;
  assert.equal(RPG.refreshShop(profile).ok, true);
  assert.equal(profile.shopRefreshes, refreshesBefore + 1);
});

test('upgrade consumes resources, scales stats, and stops at +7', () => {
  const profile = RPG.createProfile('vanguard', 17);
  profile.gold = 1000000;
  profile.materials = 10000;
  const item = RPG.createItem(8, RPG.makeRng(61), { rarity: 'rare', slot: 'weapon' });
  const attackBefore = item.stats.attack;
  for (let rank = 1; rank <= RPG.MAX_UPGRADE; rank++) {
    const result = RPG.upgradeItem(profile, item);
    assert.equal(result.ok, true);
    assert.equal(item.upgrade, rank);
  }
  assert.ok(item.stats.attack > attackBefore);
  assert.equal(RPG.upgradeItem(profile, item).reason, 'max-upgrade');
  assert.equal(profile.counters.upgrades, RPG.MAX_UPGRADE);
  assert.ok(profile.quests.forge.progress >= 3);
});

test('reroll replaces an eligible affix and deducts exact cost', () => {
  const profile = RPG.createProfile('arcanist', 18);
  profile.gold = 100000;
  profile.materials = 1000;
  const item = RPG.createItem(9, RPG.makeRng(71), { rarity: 'rare', slot: 'amulet' });
  const beforeGold = profile.gold;
  const beforeMaterials = profile.materials;
  const cost = RPG.rerollCost(item);
  const result = RPG.rerollItem(profile, item, RPG.makeRng(72));
  assert.equal(result.ok, true);
  assert.equal(profile.gold, beforeGold - cost.gold);
  assert.equal(profile.materials, beforeMaterials - cost.materials);
  assert.equal(item.affixes.length, 2);
  assert.ok(item.stats[result.affix.stat] !== undefined);
});

test('quest progress completes once and reward cannot be claimed twice', () => {
  const profile = RPG.createProfile('ranger', 19);
  RPG.recordQuestEvent(profile, 'kill', 20);
  assert.equal(profile.quests.first_blood.complete, true);
  const beforeGold = profile.gold;
  const first = RPG.claimQuest(profile, 'first_blood', RPG.makeRng(80));
  assert.equal(first.ok, true);
  assert.ok(profile.gold > beforeGold);
  assert.equal(RPG.claimQuest(profile, 'first_blood').reason, 'claimed');
});

test('stage completion awards stars, unlocks progression, and records best run', () => {
  const profile = RPG.createProfile('vanguard', 20);
  const result = RPG.completeStage(profile, 0, { elapsed: 100, deaths: 0, objective: true, kills: 9, chests: 2, elites: 1 }, RPG.makeRng(90));
  assert.equal(result.ok, true);
  assert.equal(result.stars, 3);
  assert.equal(profile.unlockedStage, 1);
  assert.ok(profile.clearedStages.includes(0));
  assert.equal(profile.stageBest.meadow.stars, 3);
  assert.equal(profile.counters.kills, 9);
  assert.ok(profile.inventory.length >= 1);
});

test('completing the final boss marks the campaign won', () => {
  const profile = RPG.createProfile('arcanist', 21);
  profile.unlockedStage = 5;
  const result = RPG.completeStage(profile, 5, { elapsed: 210, deaths: 0, objective: true, kills: 18, elites: 2, boss: true }, RPG.makeRng(91));
  assert.equal(result.ok, true);
  assert.equal(profile.won, true);
  assert.equal(profile.quests.king.complete, true);
});

test('death removes ten percent of current gold', () => {
  const profile = RPG.createProfile('ranger', 22);
  profile.gold = 1234;
  const lost = RPG.registerDeath(profile);
  assert.equal(lost, 123);
  assert.equal(profile.gold, 1111);
  assert.equal(profile.deaths, 1);
});

test('versioned save round-trip preserves campaign state', () => {
  const profile = RPG.createProfile('ranger', 23);
  profile.level = 8;
  profile.gold = 4321;
  profile.inventory.push(RPG.createItem(8, RPG.makeRng(101), { rarity: 'epic' }));
  profile.skills.r_precision = 3;
  const text = RPG.serializeProfile(profile, 9999);
  const parsed = RPG.parseProfile(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.savedAt, 9999);
  assert.equal(parsed.profile.classId, 'ranger');
  assert.equal(parsed.profile.level, 8);
  assert.equal(parsed.profile.gold, 4321);
  assert.equal(parsed.profile.inventory.length, 1);
  assert.equal(parsed.profile.skills.r_precision, 3);
});

test('invalid or incompatible save payloads are rejected', () => {
  assert.equal(RPG.parseProfile('{bad json').reason, 'parse');
  assert.equal(RPG.parseProfile(JSON.stringify({ version: 1, profile: {} })).reason, 'version');
  assert.equal(RPG.parseProfile({ version: 2, profile: { classId: 'missing' } }).reason, 'profile');
});

run();
