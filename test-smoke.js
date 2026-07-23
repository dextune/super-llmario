'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

/* Headless Node smoke test — 외부 의존 없음.
 *
 *  - vm 컨텍스트에 DOM / canvas 2d / AudioContext / performance /
 *    requestAnimationFrame / timers를 충분히 스텁한다.
 *  - index.html의 실제 스크립트 순서대로
 *    rpgdata → levels → sprites → audio → util → balance → combat → flow → game을 로드한다.
 *  - RAF 콜백을 수동 구동하여 최소 2,400 tick 상당을 실행한다.
 *  - Enter, 이동/점프, J/K/L, Q/I/P/M, 1/2/3 입력과 대응 keyup을 발생시키고
 *    canvas draw 호출, 예외 없음, RAF 지속, 오버레이/DOM 갱신의
 *    기본 불변조건을 검증한다.
 *  - game.js 내부 상태는 비공개 — 관찰 가능한 동작만 검증한다.
 */

// ============================================================================
// Node built-in 캡처 (vm 외부에서 유지)
// ============================================================================
const nodeSetTimeout = setTimeout;
const nodeClearTimeout = clearTimeout;
const nodeSetInterval = setInterval;
const nodeClearInterval = clearInterval;

// ============================================================================
// 테스트 러너 (최소)
// ============================================================================
let failed = 0;
let passed = 0;
const check = (cond, msg) => {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL:', msg); }
};
const group = (name, fn) => { console.log(`\n[${name}]`); fn(); };

// ============================================================================
// canvas 2d context — draw 호출 카운터
// ============================================================================
const drawCounters = Object.create(null);
let totalDrawCalls = 0;
const DRAW_METHODS = [
  'fillRect', 'clearRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'strokeText', 'drawImage',
];
for (const m of DRAW_METHODS) drawCounters[m] = 0;

function createCanvasContext() {
  return {
    fillStyle: '#000', strokeStyle: '#000',
    lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', miterLimit: 10,
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    globalAlpha: 1, imageSmoothingEnabled: true,
    fillRect: () => { totalDrawCalls++; drawCounters.fillRect++; },
    clearRect: () => { totalDrawCalls++; drawCounters.clearRect++; },
    strokeRect: () => { totalDrawCalls++; drawCounters.strokeRect++; },
    fill: () => { totalDrawCalls++; drawCounters.fill++; },
    stroke: () => { totalDrawCalls++; drawCounters.stroke++; },
    fillText: () => { totalDrawCalls++; drawCounters.fillText++; },
    strokeText: () => { totalDrawCalls++; drawCounters.stroke++; },
    drawImage: () => { totalDrawCalls++; drawCounters.drawImage++; },
    beginPath: () => {}, closePath: () => {},
    moveTo: () => {}, lineTo: () => {},
    arc: () => {}, ellipse: () => {}, rect: () => {},
    save: () => {}, restore: () => {},
    translate: () => {}, scale: () => {}, rotate: () => {},
    clip: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    measureText: () => ({ width: 0 }),
  };
}

function createCanvasElement() {
  const c2d = createCanvasContext();
  return {
    width: 0, height: 0,
    getContext: (t) => (t === '2d' ? c2d : null),
    addEventListener: () => {},
    removeEventListener: () => {},
    style: {},
    dataset: {},
  };
}

// ============================================================================
// DOM element 스텁 (classList / innerHTML / textContent 추적)
// ============================================================================
function makeClassList(onChange) {
  const classes = new Set();
  const has = (c) => classes.has(c);
  return {
    add(c) { if (!has(c)) { classes.add(c); onChange && onChange(c, true); } },
    remove(c) { if (has(c)) { classes.delete(c); onChange && onChange(c, false); } },
    toggle(c, force) {
      const want = force === true ? true : (force === false ? false : !has(c));
      if (want && !has(c)) { classes.add(c); onChange && onChange(c, true); }
      else if (!want && has(c)) { classes.delete(c); onChange && onChange(c, false); }
    },
    contains: has,
  };
}

const innerHTMLSets = Object.create(null);
const textContentSets = Object.create(null);
const classSetCounts = Object.create(null);
const elementsById = new Map();

function createElement(id) {
  const onClassChange = (cls, present) => {
    const key = id + '|' + cls;
    classSetCounts[key] = (classSetCounts[key] || 0) + 1;
  };
  let _innerHTML = '';
  let _textContent = '';
  const el = {
    id,
    classList: makeClassList(onClassChange),
    style: {},
    dataset: {},
    title: '',
    value: '',
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    insertBefore: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getAttribute: () => null,
    setAttribute: () => {},
    hasAttribute: () => false,
    removeAttribute: () => {},
    dispatchEvent: () => true,
    focus: () => {}, blur: () => {},
    getContext: () => null,
    width: 0, height: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return _innerHTML; },
    set(v) { _innerHTML = v; innerHTMLSets[id] = (innerHTMLSets[id] || 0) + 1; },
    configurable: true, enumerable: true,
  });
  Object.defineProperty(el, 'textContent', {
    get() { return _textContent; },
    set(v) { _textContent = v; textContentSets[id] = (textContentSets[id] || 0) + 1; },
    configurable: true, enumerable: true,
  });
  return el;
}

function getOrCreateElement(id) {
  if (!elementsById.has(id)) elementsById.set(id, createElement(id));
  return elementsById.get(id);
}

// ============================================================================
// 이벤트 리스너 캡처
// ============================================================================
const keydownListeners = [];
const keyupListeners = [];

function addGlobalListener(type, fn) {
  if (type === 'keydown') keydownListeners.push(fn);
  else if (type === 'keyup') keyupListeners.push(fn);
}

function sendKey(code, type = 'keydown', opts = {}) {
  const event = {
    code, repeat: !!opts.repeat,
    preventDefault: () => {}, stopPropagation: () => {},
    target: null, currentTarget: null,
  };
  const listeners = type === 'keydown' ? keydownListeners : keyupListeners;
  for (const listener of listeners) {
    try { listener(event); }
    catch (e) {
      console.error('  EXCEPTION in', type, 'listener for', code + ':', e.message);
      console.error(e.stack);
      throw e;
    }
  }
}

// ============================================================================
// AudioContext 스텁 (WebAudio 메서드 체인 노옵)
// ============================================================================
class StubParam {
  constructor() { this.value = 1; this.setValueAtTime = () => {}; this.exponentialRampToValueAtTime = () => {}; this.linearRampToValueAtTime = () => {}; this.cancelScheduledValues = () => {}; }
}
class StubNode {
  constructor(type) {
    this.type = type || '';
    this.frequency = new StubParam();
    this.gain = new StubParam();
    this.Q = new StubParam();
    this.connect = () => this;
    this.disconnect = () => {};
    this.start = () => {};
    this.stop = () => {};
    this.buffer = null;
  }
}
class StubAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = new StubNode('destination');
  }
  resume() {}
  suspend() {}
  close() { return Promise.resolve(); }
  createOscillator() { return new StubNode('osc'); }
  createGain() { return new StubNode('gain'); }
  createBufferSource() { return new StubNode('source'); }
  createBiquadFilter() { return new StubNode('filter'); }
  createBuffer() { return { sampleRate: 44100, length: 0, numberOfChannels: 1, duration: 0, getChannelData: () => new Float32Array(0) }; }
  decodeAudioData() { return Promise.resolve({ getChannelData: () => new Float32Array(0) }); }
}

// ============================================================================
// Performance / RAF / timers
// ============================================================================
let perfNow = 0;
const performanceStub = { now: () => perfNow };

const rafCallbacks = [];
let rafIdCounter = 0;
function requestAnimationFrame(cb) { rafCallbacks.push(cb); return ++rafIdCounter; }
function cancelAnimationFrame() {}

// setInterval만 스텁 (audio.js의 BGM 스케줄러는 본질적이지 않음 — 노이즈 방지).
// setTimeout은 game/audio 어디서도 호출되지 않으므로 Node 내장 사용.
let timerIdCounter = 0;
function setIntervalStub(fn, ms) { return ++timerIdCounter; }
function clearIntervalStub(id) { /* no-op */ }

// ============================================================================
// document 스텁
// ============================================================================
const documentStub = {
  getElementById: getOrCreateElement,
  createElement: (tag) => {
    if (typeof tag === 'string' && tag.toLowerCase() === 'canvas') return createCanvasElement();
    return createElement(tag || 'div');
  },
  addEventListener: addGlobalListener,
  removeEventListener: () => {},
  hidden: false,
  fonts: { load: () => Promise.resolve([]) },
  body: getOrCreateElement('body'),
  documentElement: getOrCreateElement('html'),
};

// ============================================================================
// vm 컨텍스트 빌드
// ============================================================================
const sandbox = {
  Math, Object, Array, JSON, Set, Map, Promise,
  Date, Error, TypeError, RangeError, ReferenceError, SyntaxError,
  Number, String, Boolean, Symbol, RegExp, Infinity, NaN, undefined,
  Float32Array, Uint8Array, Int8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, ArrayBuffer,
  console,

  performance: performanceStub,
  document: documentStub,
  requestAnimationFrame,
  cancelAnimationFrame,
  setTimeout: nodeSetTimeout,
  clearTimeout: nodeClearTimeout,
  setInterval: setIntervalStub,
  clearInterval: clearIntervalStub,

  AudioContext: StubAudioContext,
  webkitAudioContext: StubAudioContext,

  addEventListener: addGlobalListener,
  removeEventListener: () => {},
  dispatchEvent: () => true,
  hidden: false,
  fonts: { load: () => Promise.resolve([]) },
  isSecureContext: true,
};
const ctx = vm.createContext(sandbox);
sandbox.window = sandbox;  // window는 글로벌 자체

// 사전 등록할 DOM 요소 (index.html의 id 목록)
// 'game'은 canvas (getContext('2d') 필요), 나머지는 일반 div.
elementsById.set('game', createCanvasElement());
for (const id of [
  'ov-title', 'ov-pause', 'ov-over', 'ov-clear', 'ov-win', 'ov-inv',
  'btn-sound', 'over-score', 'clear-bonus', 'clear-score', 'win-score',
  'inv-equipped', 'inv-stats', 'inv-pots', 'inv-backpack', 'inv-tip', 'inv-cap',
]) {
  getOrCreateElement(id);
}

// ============================================================================
// 스크립트 로드 (HTML의 <script> 순서)
// ============================================================================
const scriptOrder = [
  'rpgdata.js', 'levels.js', 'sprites.js', 'audio.js',
  'util.js', 'balance.js', 'combat.js', 'flow.js', 'render.js', 'ui.js', 'engine.js', 'game.js',
];
const sources = scriptOrder.map(n => fs.readFileSync(path.join(__dirname, 'js', n), 'utf8'));
const combined = sources.join('\n;\n');

let loadError = null;
try {
  vm.runInContext(combined, ctx, { filename: 'game-stack.js' });
} catch (e) {
  loadError = e;
}

// ============================================================================
// 헬퍼
// ============================================================================
function isOverlayShown(id) { return elementsById.get(id).classList.contains('show'); }

const STEP_MS = 1000 / 60;
let frameCount = 0;
const exceptions = [];

function driveFrame() {
  if (rafCallbacks.length === 0) {
    exceptions.push(new Error('RAF 큐 고갈 @ frame ' + frameCount));
    return false;
  }
  const cb = rafCallbacks.shift();
  try { cb(perfNow); }
  catch (e) {
    exceptions.push(e);
    console.error('  EXCEPTION in frame', frameCount, ':', e.message);
    console.error(e.stack);
    return false;
  }
  perfNow += STEP_MS;
  frameCount++;
  return true;
}

function driveFrames(n) { for (let i = 0; i < n; i++) if (!driveFrame()) break; }

function keyDown(code, opts) { sendKey(code, 'keydown', opts || {}); }
function keyUp(code) { sendKey(code, 'keyup'); }

// ============================================================================
// 검증
// ============================================================================

group('initialization', () => {
  check(loadError === null, '스크립트 로드 무예외');
  check(rafCallbacks.length === 1, 'RAF 큐 1개 (IIFE 부트스트랩)');
  check(isOverlayShown('ov-title'), '초기: ov-title 표시');
  check(!isOverlayShown('ov-pause'), '초기: ov-pause 숨김');
  check(!isOverlayShown('ov-inv'), '초기: ov-inv 숨김');
});

group('input: Enter → 게임 시작', () => {
  keyDown('Enter');
  driveFrames(5);
  check(!isOverlayShown('ov-title'), 'Enter 후 ov-title 숨김');
});

group('input: move / jump (playing)', () => {
  keyDown('ArrowRight');
  driveFrames(30);
  keyUp('ArrowRight');
  keyDown('Space');
  driveFrames(8);
  keyUp('Space');
  driveFrames(20);
});

group('input: J (콤보 공격)', () => {
  keyDown('KeyJ'); driveFrames(5);
  keyDown('KeyJ'); driveFrames(8);
  keyDown('KeyJ'); driveFrames(15);
});

group('input: K (강타)', () => {
  keyDown('KeyK'); driveFrames(20);
  driveFrames(25);  // 쿨다운
  keyDown('KeyK'); driveFrames(20);
});

group('input: L + 1/2/3 (주문 시전/선택)', () => {
  for (const d of ['Digit1', 'Digit2', 'Digit3']) { keyDown(d); driveFrames(2); }
  keyDown('Digit1'); driveFrames(2); keyDown('KeyL'); driveFrames(15);
  keyDown('Digit2'); driveFrames(2); keyDown('KeyL'); driveFrames(15);
  keyDown('Digit3'); driveFrames(2); keyDown('KeyL'); driveFrames(15);
});

group('input: Q (HP 물약 사용)', () => {
  keyDown('KeyQ'); driveFrames(10);
});

group('input: I (인벤토리 토글) → DOM 갱신 검증', () => {
  keyDown('KeyI');
  driveFrames(10);
  check(isOverlayShown('ov-inv'), 'ov-inv 표시');
  check((innerHTMLSets['inv-equipped'] || 0) > 0, 'inv-equipped.innerHTML 갱신');
  check((innerHTMLSets['inv-stats'] || 0) > 0, 'inv-stats.innerHTML 갱신');
  check((innerHTMLSets['inv-backpack'] || 0) > 0, 'inv-backpack.innerHTML 갱신');
  check((innerHTMLSets['inv-pots'] || 0) > 0, 'inv-pots.innerHTML 갱신');

  keyDown('KeyI');
  driveFrames(5);
  check(!isOverlayShown('ov-inv'), 'ov-inv 숨김');
});

group('input: P (일시정지 토글)', () => {
  keyDown('KeyP');
  driveFrames(5);
  check(isOverlayShown('ov-pause'), 'ov-pause 표시');
  keyDown('KeyP');
  driveFrames(5);
  check(!isOverlayShown('ov-pause'), 'ov-pause 숨김');
});

group('input: M (사운드 토글)', () => {
  const before = getOrCreateElement('btn-sound').textContent;
  keyDown('KeyM');
  driveFrames(5);
  const after = getOrCreateElement('btn-sound').textContent;
  check(before !== after, `사운드 버튼 텍스트 토글 ("${before}" → "${after}")`);
});

group('extended drive (≥ 2400 ticks)', () => {
  // 추가 상호작용: 이동/점프/공격/주문 혼합
  for (let i = 0; i < 5; i++) {
    keyDown('ArrowRight'); keyDown('Space');
    driveFrames(5);
    keyUp('Space');
    driveFrames(5);
    keyUp('ArrowRight');
    keyDown('KeyJ'); driveFrames(3);
    keyDown('KeyK'); driveFrames(8);
    keyDown('KeyL'); driveFrames(5);
  }
  for (let i = 0; i < 10; i++) {
    keyDown('ArrowRight'); driveFrames(3);
    keyDown('KeyJ'); driveFrames(3);
    keyUp('ArrowRight');
    keyDown('ArrowLeft'); driveFrames(2); keyUp('ArrowLeft');
  }
  // 총 프레임이 2400 이상이 되도록 추가 구동
  const remaining = Math.max(0, 2400 - frameCount + 100);
  driveFrames(remaining);

  check(frameCount >= 2400, `프레임 ≥ 2400 (실제 ${frameCount})`);
  check(exceptions.length === 0, '구간 내 예외 없음');
});

group('invariants', () => {
  check(totalDrawCalls > 1000, `canvas draw 호출 > 1000 (실제 ${totalDrawCalls})`);
  check(drawCounters.fillRect > 100, `fillRect > 100 (실제 ${drawCounters.fillRect})`);
  check(drawCounters.drawImage > 10, `drawImage > 10 (실제 ${drawCounters.drawImage})`);
  check(drawCounters.fillText > 50, `fillText > 50 (실제 ${drawCounters.fillText})`);
  check(rafCallbacks.length > 0, 'RAF 콜백 큐 활성 (게임 루프 진행 중)');
  check(exceptions.length === 0, '전체 구간 예외 없음');
  // 진단 출력 (검증 외 추가 정보)
  console.log(`    [진단] frame=${frameCount} ticks≈${frameCount} draw=${totalDrawCalls}`);
  console.log(`    [진단] fillRect=${drawCounters.fillRect} drawImage=${drawCounters.drawImage} fillText=${drawCounters.fillText}`);
  console.log(`    [진단] inv-equipped innerHTML 갱신=${innerHTMLSets['inv-equipped'] || 0} inv-stats=${innerHTMLSets['inv-stats'] || 0}`);
});

// ============================================================================
// 결과
// ============================================================================
console.log(`\n총 ${passed}개 통과, ${failed}개 실패`);
if (failed) {
  console.error('SMOKE 회귀 테스트 실패');
  process.exit(1);
}
console.log('ALL SMOKE CHECKS PASSED');
