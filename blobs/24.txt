'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder } = require('util');
const { ROOT, readManifest } = require('../scripts/assemble-sources');

class ClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    if (force === undefined) force = !this.values.has(name);
    if (force) this.values.add(name); else this.values.delete(name);
    return force;
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(id) {
    this.id = id || '';
    this.dataset = {};
    this.classList = new ClassList();
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.innerHTML = '';
    this.listeners = new Map();
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, init = {}) {
    const event = Object.assign({ type, target: this, currentTarget: this, button: 0, repeat: false, code: '', preventDefault() {}, stopPropagation() {} }, init);
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
  closest(selector) {
    if (selector === '[data-action]' && this.dataset.action) return this;
    return null;
  }
  blur() {}
}

function makeCanvasContext() {
  const calls = [];
  const context = {
    calls,
    imageSmoothingEnabled: true,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: 'left', textBaseline: 'alphabetic',
    save() { calls.push('save'); }, restore() { calls.push('restore'); },
    translate() { calls.push('translate'); }, beginPath() { calls.push('beginPath'); },
    moveTo() { calls.push('moveTo'); }, lineTo() { calls.push('lineTo'); },
    arc() { calls.push('arc'); }, ellipse() { calls.push('ellipse'); },
    fill() { calls.push('fill'); }, stroke() { calls.push('stroke'); },
    fillRect() { calls.push('fillRect'); }, strokeRect() { calls.push('strokeRect'); },
    fillText() { calls.push('fillText'); }, setLineDash() { calls.push('setLineDash'); },
    measureText(text) { return { width: String(text).length * 8 }; },
    createLinearGradient() {
      calls.push('createLinearGradient');
      return { addColorStop() { calls.push('addColorStop'); } };
    },
  };
  return context;
}

function createEnvironment(options = {}) {
  const ids = [
    'game', 'ability-summary', 'btn-continue', 'btn-shop-refresh', 'btn-sound', 'class-list',
    'clear-rewards', 'clear-stars', 'clear-title', 'forge-detail', 'forge-items', 'forge-wallet',
    'hub-quest-badge', 'hub-summary', 'hub-win', 'inventory-bag', 'inventory-cap',
    'inventory-detail', 'inventory-equipped', 'inventory-summary', 'ov-class', 'ov-clear',
    'ov-forge', 'ov-hub', 'ov-inventory', 'ov-over', 'ov-pause', 'ov-quests', 'ov-shop',
    'ov-skills', 'ov-title', 'ov-win', 'over-reason', 'over-score', 'quest-list', 'shop-list',
    'shop-wallet', 'skill-class', 'skill-points', 'skill-tree', 'stage-list',
    'tb-left', 'tb-right', 'tb-run', 'tb-jump', 'tb-atk', 'tb-primary', 'tb-secondary', 'tb-pot',
  ];
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  const canvasContext = makeCanvasContext();
  const canvas = elements.get('game');
  canvas.width = 960; canvas.height = 624;
  canvas.getContext = () => canvasContext;

  const documentListeners = new Map();
  const titleFeature = new FakeElement('title-feature');
  const document = {
    body: new FakeElement('body'),
    getElementById(id) { return elements.get(id) || null; },
    querySelector(selector) { return selector === '.title-feature' ? titleFeature : null; },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    dispatch(type, init = {}) {
      const target = init.target || new FakeElement('event-target');
      const event = Object.assign({ type, target, currentTarget: document, button: 0, repeat: false, code: '', preventDefault() {}, stopPropagation() {} }, init);
      for (const listener of documentListeners.get(type) || []) listener(event);
      return event;
    },
  };

  const storage = new Map();
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(String(key), String(value)); },
    removeItem(key) { storage.delete(key); },
    clear() { storage.clear(); },
    get length() { return storage.size; },
  };

  const rafQueue = [];
  let rafCounter = 0;
  const audioCalls = [];
  const AudioSys = {
    ensure() { audioCalls.push('ensure'); },
    sfx(name) { audioCalls.push('sfx:' + name); },
    musicStart(index) { audioCalls.push('music:' + index); },
    musicStop() { audioCalls.push('stop'); },
    toggle() { audioCalls.push('toggle'); return false; },
  };

  const manifest = readManifest();
  const fetch = async url => {
    const normalized = String(url).replace(/^\.\//, '');
    let text;
    if (normalized === 'js/source-manifest.json') text = JSON.stringify(manifest);
    else {
      const filePath = path.resolve(ROOT, normalized);
      if (!filePath.startsWith(ROOT + path.sep) || !fs.existsSync(filePath)) return { ok: false, status: 404, async text() { return ''; } };
      text = fs.readFileSync(filePath, 'utf8');
      if (options.corrupt && normalized === manifest['rpg2-core.js'].parts[0]) text += 'CORRUPT';
    }
    return { ok: true, status: 200, async text() { return text; } };
  };

  const quietConsole = options.quiet
    ? { log() {}, warn() {}, error() {} }
    : console;
  const sandbox = {
    console: quietConsole,
    document,
    localStorage,
    AudioSys,
    fetch,
    crypto: webcrypto,
    TextEncoder,
    Uint8Array,
    Blob,
    performance: { now: () => 0 },
    requestAnimationFrame(callback) { rafQueue.push(callback); return ++rafCounter; },
    cancelAnimationFrame() {},
    setTimeout, clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return { sandbox, document, elements, canvasContext, localStorage, storage, rafQueue, audioCalls, titleFeature };
}

async function boot(options) {
  const env = createEnvironment(options);
  const bootstrap = fs.readFileSync(path.join(ROOT, 'js', 'bootstrap.js'), 'utf8');
  const result = new vm.Script(bootstrap, { filename: 'bootstrap.js' }).runInContext(env.sandbox);
  if (result && typeof result.then === 'function') await result;
  // The async bootstrap may schedule one final promise continuation after eval.
  await new Promise(resolve => setImmediate(resolve));
  return env;
}

async function main() {
  const corrupted = await boot({ corrupt: true, quiet: true });
  assert.equal(corrupted.document.body.dataset.rpgBoot, 'error');
  assert.match(corrupted.titleFeature.textContent, /불러오지 못했습니다/);
  assert.equal(corrupted.sandbox.SuperLLMarioRPG2, undefined);
  console.log('PASS bootstrap rejects corrupted source parts');

  const env = await boot();
  const { sandbox, document, canvasContext, rafQueue, audioCalls, storage } = env;
  assert.equal(document.body.dataset.rpgBoot, 'ready');
  assert.ok(sandbox.RPG2);
  assert.ok(sandbox.SuperLLMarioRPG2);
  console.log('PASS browser bootstrap assembles and verifies sources');

  const api = sandbox.SuperLLMarioRPG2;
  assert.equal(api.state, api.STATE.TITLE);
  assert.ok(rafQueue.length >= 1);
  const firstFrame = rafQueue.shift();
  firstFrame(16.67);
  assert.ok(rafQueue.length >= 1);
  assert.ok(canvasContext.calls.length > 20);
  console.log('PASS RAF loop and canvas rendering start');

  api.startNew('vanguard');
  assert.equal(api.state, api.STATE.HUB);
  assert.equal(api.profile.classId, 'vanguard');
  assert.ok(storage.size >= 1);
  console.log('PASS new character enters hub and autosaves');

  assert.equal(api.startStage(0), true);
  assert.equal(api.state, api.STATE.FIELD);
  assert.ok(api.world.enemies.length >= 10);
  const mpBefore = api.player.mp;
  api.basicAttack();
  api.primarySkill();
  api.secondarySkill();
  api.tick(0.016);
  api.render();
  assert.ok(api.player.mp < mpBefore);
  assert.ok(canvasContext.calls.length > 100);
  assert.ok(audioCalls.some(value => value.startsWith('sfx:')));
  console.log('PASS field combat, class skills, audio, and render execute');

  api.openInventory(api.STATE.FIELD);
  assert.equal(api.state, api.STATE.INVENTORY);
  document.dispatch('keydown', { code: 'Escape' });
  assert.equal(api.state, api.STATE.FIELD);
  console.log('PASS field inventory pauses and resumes the same run');

  function forceComplete(stageIndex) {
    if (!api.world || api.world.stageIndex !== stageIndex) {
      assert.equal(api.startStage(stageIndex), true, `stage ${stageIndex} should be unlocked`);
    }
    const world = api.world;
    const player = api.player;
    world.objectiveDone = true;
    world.gateOpen = true;
    if (stageIndex === sandbox.RPG2.STAGES.length - 1) world.bossKilled = true;
    player.x = world.gate.x;
    player.y = 520 - player.h;
    player.vx = 0;
    player.vy = 0;
    api.tick(0.016);
  }

  forceComplete(0);
  assert.equal(api.state, api.STATE.CLEAR);
  for (let i = 1; i < sandbox.RPG2.STAGES.length; i++) {
    api.enterHub();
    assert.equal(api.profile.unlockedStage >= i, true);
    assert.equal(api.startStage(i), true);
    forceComplete(i);
    if (i < sandbox.RPG2.STAGES.length - 1) assert.equal(api.state, api.STATE.CLEAR);
  }
  assert.equal(api.state, api.STATE.WIN);
  assert.equal(api.profile.won, true);
  assert.equal(api.profile.clearedStages.length, 6);
  console.log('PASS all six stages progress through campaign victory');

  assert.equal(api.saveProfile(true), true);
  const restored = api.loadProfile();
  assert.ok(restored);
  assert.equal(restored.won, true);
  assert.equal(restored.classId, 'vanguard');
  assert.equal(restored.clearedStages.length, 6);
  console.log('PASS localStorage save and load preserve campaign completion');

  const snapshot = api.snapshot();
  assert.equal(snapshot.state, api.STATE.WIN);
  assert.equal(snapshot.profile.won, true);
  assert.ok(audioCalls.length > 5);
  console.log('SMOKE_TESTS_PASS 8/8');
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
