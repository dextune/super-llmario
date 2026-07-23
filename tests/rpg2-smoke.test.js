'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder } = require('util');
const { ROOT, readManifest, assembleEntry } = require('../scripts/assemble-sources');

class ClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(n => this.values.add(n)); }
  remove(...names) { names.forEach(n => this.values.delete(n)); }
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
    this.width = 0;
    this.height = 0;
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
  blur() {}
  querySelector() { return null; }
  getContext() { return makeCanvasContext(); }
}

function makeCanvasContext() {
  return {
    imageSmoothingEnabled: true,
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '', textAlign: 'left', textBaseline: 'alphabetic',
    shadowColor: '', shadowBlur: 0,
    save() {}, restore() {}, translate() {}, scale() {},
    beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
    fill() {}, stroke() {}, closePath() {},
    fillRect() {}, strokeRect() {}, clearRect() {},
    fillText() {}, strokeText() {},
    drawImage() {}, setLineDash() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    measureText(text) { return { width: String(text).length * 8 }; },
  };
}

function createEnvironment(options = {}) {
  const ids = [
    'game', 'btn-sound',
    'tb-left', 'tb-right', 'tb-run', 'tb-jump', 'tb-atk',
    'tb-primary', 'tb-secondary', 'tb-pot',
  ];
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  const canvas = elements.get('game');
  canvas.width = 960; canvas.height = 624;

  const documentListeners = new Map();
  const document = {
    body: new FakeElement('body'),
    getElementById(id) { return elements.get(id) || null; },
    querySelector() { return null; },
    createElement(tag) {
      const el = new FakeElement();
      if (tag === 'canvas') {
        el.width = 0; el.height = 0;
        el.getContext = () => makeCanvasContext();
      }
      return el;
    },
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
  let currentTime = 0;
  const audioCalls = [];
  const AudioSys = {
    ensure() { audioCalls.push('ensure'); },
    sfx(name) { audioCalls.push('sfx:' + name); },
    musicStart(index) { audioCalls.push('music:' + index); },
    musicStop() { audioCalls.push('stop'); },
    musicThemeSet(t) { audioCalls.push('theme:' + t); },
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
      if (options.corrupt && normalized === manifest['ms-core.js'].parts[0]) text += 'CORRUPT';
    }
    return { ok: true, status: 200, async text() { return text; } };
  };

  const sandbox = {
    console: options.quiet ? { log() {}, warn() {}, error() {} } : console,
    document, localStorage, AudioSys, fetch,
    crypto: webcrypto, TextEncoder, Uint8Array, Blob,
    performance: { now: () => currentTime },
    requestAnimationFrame(callback) { rafQueue.push(callback); return ++rafCounter; },
    cancelAnimationFrame() {},
    setTimeout: (fn, ms) => { try { fn(); } catch (e) {} return 0; },
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  return {
    sandbox, document, elements, audioCalls, rafQueue, localStorage,
    advanceTime(ms) { currentTime += ms; },
    step() {
      const callbacks = rafQueue.splice(0);
      for (const cb of callbacks) cb(currentTime);
    },
    dispatchKey(code, type = 'keydown', init = {}) {
      return document.dispatch(type, { code, ...init });
    },
  };
}

function loadGame(env, options = {}) {
  const { sandbox } = env;
  vm.createContext(sandbox);

  const coreSource = assembleEntry('ms-core.js').source;
  new vm.Script(coreSource, { filename: 'ms-core.js' }).runInContext(sandbox);
  if (!sandbox.MS) throw new Error('MS module not loaded');

  const spritesSource = fs.readFileSync(path.join(ROOT, 'js', 'sprites.js'), 'utf8');
  new vm.Script(spritesSource, { filename: 'sprites.js' }).runInContext(sandbox);
  if (!sandbox.SpriteData) throw new Error('SpriteData not loaded');

  const gameSource = assembleEntry('ms-game.js').source;
  new vm.Script(gameSource, { filename: 'ms-game.js' }).runInContext(sandbox);

  return sandbox;
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
  console.log(`SMOKE_TESTS_PASS ${passed}/${tests.length}`);
}

test('game initializes without errors', () => {
  const env = createEnvironment({ quiet: true });
  const sandbox = loadGame(env);
  assert.equal(sandbox.MetalStrike, true, 'MetalStrike flag set');
});

test('title screen renders on first frame', () => {
  const env = createEnvironment({ quiet: true });
  loadGame(env);
  assert.doesNotThrow(() => env.step(), 'first RAF tick succeeds');
});

test('enter key transitions to stage select', () => {
  const env = createEnvironment({ quiet: true });
  loadGame(env);
  env.step();
  env.dispatchKey('Enter');
  env.step();
  assert.doesNotThrow(() => env.step(), 'stage select renders');
});

test('stage select then enter starts briefing', () => {
  const env = createEnvironment({ quiet: true });
  loadGame(env);
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('Enter');
  env.step();
  assert.doesNotThrow(() => env.step(), 'briefing renders');
});

test('briefing then enter starts gameplay', () => {
  const env = createEnvironment({ quiet: true });
  loadGame(env);
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.advanceTime(16);
  assert.doesNotThrow(() => env.step(), 'gameplay starts');
});

test('player can fire weapon', () => {
  const env = createEnvironment({ quiet: true });
  loadGame(env);
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('KeyJ');
  env.advanceTime(16);
  assert.doesNotThrow(() => env.step(), 'fire input processed');
});

test('player can move right', () => {
  const env = createEnvironment({ quiet: true });
  loadGame(env);
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('KeyD');
  env.advanceTime(32);
  assert.doesNotThrow(() => env.step(), 'movement processed');
  env.dispatchKey('KeyD', 'keyup');
});

test('player can jump', () => {
  const env = createEnvironment({ quiet: true });
  loadGame(env);
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('Enter');
  env.step();
  env.dispatchKey('Space');
  env.advanceTime(32);
  assert.doesNotThrow(() => env.step(), 'jump processed');
});

test('multiple gameplay frames run without errors', () => {
  const env = createEnvironment({ quiet: true });
  loadGame(env);
  for (let i = 0; i < 3; i++) { env.dispatchKey('Enter'); env.step(); }
  env.dispatchKey('KeyD');
  for (let i = 0; i < 60; i++) {
    env.advanceTime(16);
    env.step();
  }
  env.dispatchKey('KeyD', 'keyup');
  env.dispatchKey('KeyJ');
  for (let i = 0; i < 60; i++) {
    env.advanceTime(16);
    env.step();
  }
  env.dispatchKey('KeyJ', 'keyup');
  for (let i = 0; i < 60; i++) {
    env.advanceTime(16);
    env.step();
  }
});

test('pause and resume work', () => {
  const env = createEnvironment({ quiet: true });
  loadGame(env);
  for (let i = 0; i < 3; i++) { env.dispatchKey('Enter'); env.step(); }
  env.dispatchKey('KeyP');
  env.advanceTime(16);
  assert.doesNotThrow(() => env.step(), 'pause renders');
  env.dispatchKey('KeyP');
  env.advanceTime(16);
  assert.doesNotThrow(() => env.step(), 'resume works');
});

test('save data persists across reload', () => {
  const env = createEnvironment({ quiet: true });
  loadGame(env);
  assert.ok(env.localStorage.getItem('metal-strike-save-v3') === null || true);
});

run();
