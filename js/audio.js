'use strict';

/* WebAudio 칩튠 — 효과음 + BGM 루프 (외부 파일 없음)
 * v2: 리버브/딜레이 버스, 화음 레이어, 퍼커션, 아르페지오 추가 */
const AudioSys = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false;
  let musicTimer = null, mNext = 0, mStep = 0, musicTheme = 0;
  let reverbNode = null, delayNode = null, delayFb = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;

      // 리버브 (convolver + generated impulse)
      reverbNode = ctx.createConvolver();
      const irLen = ctx.sampleRate * 1.2;
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.8);
        }
      }
      reverbNode.buffer = ir;
      const revGain = ctx.createGain();
      revGain.gain.value = 0.18;
      reverbNode.connect(revGain);
      revGain.connect(ctx.destination);

      // 딜레이 (echo)
      delayNode = ctx.createDelay(0.5);
      delayNode.delayTime.value = 0.22;
      delayFb = ctx.createGain();
      delayFb.gain.value = 0.25;
      const delayOut = ctx.createGain();
      delayOut.gain.value = 0.12;
      delayNode.connect(delayFb);
      delayFb.connect(delayNode);
      delayNode.connect(delayOut);
      delayOut.connect(ctx.destination);

      master.connect(ctx.destination);
      master.connect(reverbNode);
      master.connect(delayNode);

      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  const F = m => 440 * Math.pow(2, (m - 69) / 12);

  function tone(o) {
    if (!ctx) return;
    const type = o.type || 'square', f = o.f, f2 = o.f2 || null;
    const t = o.t || 0.1, v = o.v || 0.2, at = o.at || 0;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    const t0 = ctx.currentTime + at;
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + t);
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + t);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + t + 0.03);
  }

  // 화음: 기본음 + 3도/5도/옥타브 레이어
  function chord(o) {
    if (!ctx) return;
    const f = o.f, t = o.t || 0.15, v = o.v || 0.1, at = o.at || 0;
    const type = o.type || 'square';
    const intervals = o.intervals || [1, 1.25, 1.5, 2]; // root, major 3rd, 5th, octave
    for (let i = 0; i < intervals.length; i++) {
      tone({ type, f: f * intervals[i], t: t * (1 - i * 0.08), v: v * (1 - i * 0.15), at: at + i * 0.008 });
    }
  }

  function noise(o) {
    if (!ctx) return;
    const t = o.t || 0.2, v = o.v || 0.3, at = o.at || 0, f = o.f || 1000;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = o.hp ? 'highpass' : 'lowpass';
    flt.frequency.value = f;
    if (o.q) flt.Q.value = o.q;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + at;
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + t);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + t + 0.03);
  }

  // 퍼커션: 킥/스네어/하이햇
  function kick(at, v) {
    tone({ type: 'sine', f: 150, f2: 35, t: 0.12, v: v || 0.16, at: at || 0 });
  }
  function snare(at, v) {
    noise({ t: 0.08, v: (v || 0.1), f: 3000, at: at || 0 });
    tone({ type: 'triangle', f: 180, f2: 80, t: 0.06, v: (v || 0.1) * 0.5, at: at || 0 });
  }
  function hihat(at, v) {
    noise({ t: 0.03, v: (v || 0.05), f: 9000, hp: true, at: at || 0 });
  }

  const SFX = {
    jump() {
      tone({ f: 250, f2: 680, t: 0.18, v: 0.14 });
      tone({ type: 'sine', f: 500, f2: 1360, t: 0.12, v: 0.05, at: 0.02 });
    },
    coin() {
      tone({ f: 988, t: 0.06, v: 0.12 });
      tone({ f: 1319, t: 0.32, v: 0.12, at: 0.06 });
      tone({ type: 'sine', f: 1976, t: 0.2, v: 0.04, at: 0.06 });
    },
    stomp() {
      tone({ type: 'sawtooth', f: 320, f2: 70, t: 0.12, v: 0.18 });
      noise({ t: 0.08, v: 0.12 });
      kick(0, 0.1);
    },
    bump() { tone({ f: 140, t: 0.07, v: 0.18 }); tone({ type: 'sine', f: 70, t: 0.05, v: 0.1 }); },
    break() {
      noise({ t: 0.22, v: 0.25, f: 900 });
      tone({ type: 'triangle', f: 220, f2: 60, t: 0.18, v: 0.15 });
      noise({ t: 0.1, v: 0.1, f: 4000, hp: true, at: 0.02 });
    },
    powerup() {
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
        tone({ f, t: 0.09, v: 0.11, at: i * 0.05 });
        tone({ type: 'sine', f: f * 2, t: 0.06, v: 0.03, at: i * 0.05 });
      });
    },
    powerdown() {
      [784, 659, 523, 392, 330].forEach((f, i) => tone({ f, t: 0.1, v: 0.11, at: i * 0.06 }));
    },
    die() {
      [494, 440, 392, 330, 262, 196].forEach((f, i) => {
        tone({ type: 'triangle', f, t: 0.16, v: 0.15, at: 0.15 + i * 0.11 });
        tone({ type: 'sine', f: f * 0.5, t: 0.2, v: 0.06, at: 0.15 + i * 0.11 });
      });
    },
    flag() {
      [392, 523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => {
        tone({ f, t: 0.12, v: 0.11, at: i * 0.06 });
        if (i % 2 === 0) tone({ type: 'sine', f: f * 1.5, t: 0.08, v: 0.03, at: i * 0.06 });
      });
    },
    oneup() {
      [660, 784, 1319, 988, 1175, 1568].forEach((f, i) => {
        tone({ f, t: 0.1, v: 0.11, at: i * 0.07 });
        tone({ type: 'sine', f: f * 2, t: 0.06, v: 0.03, at: i * 0.07 });
      });
    },
    hurry() { [880, 0, 880, 0, 880].forEach((f, i) => f && tone({ f, t: 0.09, v: 0.14, at: i * 0.12 })); },
    mush() {
      [262, 330, 392, 523].forEach((f, i) => tone({ f, t: 0.08, v: 0.11, at: i * 0.045 }));
      tone({ type: 'sine', f: 1046, t: 0.15, v: 0.04, at: 0.18 });
    },
    // RPG / Metal Strike
    hit() {
      tone({ type: 'square', f: 520, f2: 200, t: 0.07, v: 0.14 });
      noise({ t: 0.05, v: 0.08, f: 2200 });
      tone({ type: 'sine', f: 1040, f2: 400, t: 0.04, v: 0.04 });
    },
    crithit() {
      tone({ type: 'sawtooth', f: 760, f2: 120, t: 0.12, v: 0.18 });
      noise({ t: 0.1, v: 0.14, f: 3000 });
      chord({ f: 760, t: 0.1, v: 0.06, intervals: [1, 1.5, 2] });
    },
    hurt() {
      tone({ type: 'sawtooth', f: 200, f2: 90, t: 0.16, v: 0.16 });
      noise({ t: 0.1, v: 0.1, f: 600 });
      tone({ type: 'sine', f: 100, f2: 45, t: 0.2, v: 0.08 });
    },
    enemydie() {
      tone({ type: 'square', f: 180, f2: 50, t: 0.18, v: 0.12 });
      noise({ t: 0.14, v: 0.12, f: 800 });
      tone({ type: 'sine', f: 360, f2: 100, t: 0.12, v: 0.04 });
    },
    levelup() {
      [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => {
        tone({ f, t: 0.12, v: 0.13, at: i * 0.07 });
        tone({ type: 'sine', f: f * 2, t: 0.08, v: 0.03, at: i * 0.07 });
      });
      chord({ f: 523, t: 0.4, v: 0.05, at: 0.5, intervals: [1, 1.25, 1.5, 2] });
    },
    itemdrop() {
      [784, 988, 1319].forEach((f, i) => tone({ type: 'triangle', f, t: 0.08, v: 0.1, at: i * 0.05 }));
      tone({ type: 'sine', f: 2637, t: 0.12, v: 0.03, at: 0.15 });
    },
    itempick() {
      [988, 1319, 1568, 2093].forEach((f, i) => {
        tone({ f, t: 0.07, v: 0.1, at: i * 0.04 });
        tone({ type: 'sine', f: f * 1.5, t: 0.05, v: 0.03, at: i * 0.04 });
      });
    },
    gold() {
      tone({ f: 1319, t: 0.05, v: 0.08 });
      tone({ f: 1760, t: 0.09, v: 0.08, at: 0.05 });
      tone({ type: 'sine', f: 3520, t: 0.06, v: 0.02, at: 0.05 });
    },
    potion() {
      tone({ type: 'sine', f: 660, f2: 1320, t: 0.2, v: 0.14 });
      tone({ type: 'sine', f: 990, f2: 1980, t: 0.15, v: 0.05, at: 0.05 });
    },
    fireball() {
      tone({ type: 'sawtooth', f: 320, f2: 900, t: 0.18, v: 0.12 });
      noise({ t: 0.16, v: 0.08, f: 1500 });
      tone({ type: 'sine', f: 640, f2: 1800, t: 0.1, v: 0.04, at: 0.02 });
    },
    explode() {
      noise({ t: 0.28, v: 0.24, f: 700 });
      tone({ type: 'triangle', f: 200, f2: 50, t: 0.2, v: 0.16 });
      tone({ type: 'sine', f: 80, f2: 25, t: 0.35, v: 0.12 });
      noise({ t: 0.15, v: 0.08, f: 3000, hp: true, at: 0.05 });
    },
    bosshit() {
      tone({ type: 'sawtooth', f: 90, f2: 50, t: 0.2, v: 0.2 });
      noise({ t: 0.16, v: 0.16, f: 500 });
      tone({ type: 'sine', f: 45, f2: 25, t: 0.3, v: 0.1 });
    },
    enrage() {
      [110, 110, 0, 110].forEach((f, i) => f && tone({ type: 'sawtooth', f, f2: f * 1.5, t: 0.25, v: 0.18, at: i * 0.16 }));
      chord({ f: 110, t: 0.5, v: 0.06, at: 0.64, type: 'sawtooth', intervals: [1, 1.2, 1.5] });
    },
    equip() {
      tone({ f: 880, t: 0.05, v: 0.1 });
      tone({ f: 1175, t: 0.08, v: 0.1, at: 0.05 });
      tone({ type: 'sine', f: 1760, t: 0.06, v: 0.03, at: 0.05 });
    },
    bosswarn() {
      [440, 0, 440, 0, 880].forEach((f, i) => f && tone({ type: 'sawtooth', f, t: 0.18, v: 0.16, at: i * 0.22 }));
      chord({ f: 440, t: 0.4, v: 0.05, at: 0.88, type: 'sawtooth', intervals: [1, 1.5, 2] });
    },
    // 콤보 / 원소 / 강타
    slash1() {
      noise({ t: 0.09, v: 0.1, f: 4000 });
      tone({ type: 'square', f: 900, f2: 1400, t: 0.06, v: 0.07 });
      noise({ t: 0.04, v: 0.04, f: 8000, hp: true });
    },
    slash2() {
      noise({ t: 0.1, v: 0.11, f: 5000 });
      tone({ type: 'square', f: 1100, f2: 1700, t: 0.07, v: 0.07 });
      noise({ t: 0.05, v: 0.04, f: 9000, hp: true });
    },
    slash3() {
      noise({ t: 0.13, v: 0.14, f: 6000 });
      tone({ type: 'sawtooth', f: 600, f2: 1800, t: 0.1, v: 0.09 });
      chord({ f: 600, t: 0.08, v: 0.04, intervals: [1, 1.5, 2] });
    },
    combo() {
      [784, 988, 1175].forEach((f, i) => {
        tone({ f, t: 0.06, v: 0.08, at: i * 0.04 });
        tone({ type: 'sine', f: f * 2, t: 0.04, v: 0.02, at: i * 0.04 });
      });
    },
    heavy() {
      noise({ t: 0.28, v: 0.26, f: 500 });
      tone({ type: 'sawtooth', f: 120, f2: 40, t: 0.22, v: 0.2 });
      tone({ type: 'triangle', f: 80, f2: 30, t: 0.3, v: 0.16, at: 0.02 });
      tone({ type: 'sine', f: 50, f2: 20, t: 0.4, v: 0.1 });
      kick(0, 0.12);
    },
    shockwave() {
      noise({ t: 0.3, v: 0.2, f: 700 });
      tone({ type: 'sine', f: 140, f2: 50, t: 0.35, v: 0.16 });
      tone({ type: 'sine', f: 70, f2: 25, t: 0.45, v: 0.08, at: 0.05 });
    },
    ice() {
      tone({ type: 'sine', f: 1400, f2: 2400, t: 0.18, v: 0.1 });
      tone({ type: 'triangle', f: 1800, f2: 900, t: 0.16, v: 0.06, at: 0.05 });
      tone({ type: 'sine', f: 2800, f2: 4800, t: 0.1, v: 0.03, at: 0.08 });
    },
    bolt() {
      tone({ type: 'sawtooth', f: 2000, f2: 600, t: 0.05, v: 0.12 });
      noise({ t: 0.06, v: 0.1, f: 8000 });
      tone({ type: 'square', f: 1600, f2: 400, t: 0.08, v: 0.08, at: 0.02 });
      noise({ t: 0.03, v: 0.05, f: 12000, hp: true, at: 0.01 });
    },
    freeze() {
      [1568, 1319, 988].forEach((f, i) => tone({ type: 'sine', f, t: 0.12, v: 0.1, at: i * 0.06 }));
      noise({ t: 0.2, v: 0.06, f: 3000, at: 0.05 });
      tone({ type: 'sine', f: 3136, t: 0.15, v: 0.03, at: 0.12 });
    },
    burn() {
      noise({ t: 0.1, v: 0.06, f: 1500 });
      tone({ type: 'sawtooth', f: 220, f2: 120, t: 0.08, v: 0.05 });
    },
    shock() {
      tone({ type: 'square', f: 1800, f2: 300, t: 0.07, v: 0.1 });
      noise({ t: 0.05, v: 0.08, f: 9000 });
      tone({ type: 'sine', f: 3600, f2: 600, t: 0.04, v: 0.03 });
    },
    // Metal Strike 무기
    shoot() {
      tone({ type: 'square', f: 720, f2: 280, t: 0.05, v: 0.09 });
      noise({ t: 0.03, v: 0.05, f: 3000 });
      tone({ type: 'sine', f: 1440, f2: 560, t: 0.03, v: 0.02 });
    },
    mg() {
      tone({ type: 'square', f: 600 + Math.random() * 80, f2: 240, t: 0.035, v: 0.06 });
      noise({ t: 0.02, v: 0.03, f: 4000 });
    },
    shotgun() {
      noise({ t: 0.14, v: 0.24, f: 1200 });
      tone({ type: 'sawtooth', f: 180, f2: 60, t: 0.1, v: 0.14 });
      tone({ type: 'sine', f: 90, f2: 30, t: 0.15, v: 0.08 });
    },
    rocket() {
      tone({ type: 'sawtooth', f: 120, f2: 380, t: 0.25, v: 0.12 });
      noise({ t: 0.2, v: 0.06, f: 600 });
      tone({ type: 'sine', f: 60, f2: 190, t: 0.3, v: 0.06, at: 0.02 });
    },
    flame() {
      noise({ t: 0.06, v: 0.05, f: 800 });
      tone({ type: 'sawtooth', f: 140, f2: 80, t: 0.05, v: 0.03 });
    },
    laser() {
      tone({ type: 'sine', f: 1800, f2: 600, t: 0.06, v: 0.09 });
      tone({ type: 'square', f: 1200, f2: 400, t: 0.04, v: 0.05, at: 0.01 });
      tone({ type: 'sine', f: 3600, f2: 1200, t: 0.04, v: 0.02, at: 0.01 });
    },
    arc() {
      tone({ type: 'sawtooth', f: 2400, f2: 400, t: 0.08, v: 0.1 });
      noise({ t: 0.06, v: 0.08, f: 8000, hp: true });
      tone({ type: 'square', f: 1800, f2: 300, t: 0.06, v: 0.06, at: 0.02 });
      tone({ type: 'sine', f: 4800, f2: 800, t: 0.04, v: 0.03, at: 0.03 });
      noise({ t: 0.04, v: 0.04, f: 12000, hp: true, at: 0.04 });
    },
    menu() {
      tone({ f: 880, t: 0.04, v: 0.07 });
      tone({ f: 1320, t: 0.06, v: 0.07, at: 0.04 });
      tone({ type: 'sine', f: 1760, t: 0.04, v: 0.02, at: 0.04 });
    },
    dash() {
      tone({ type: 'sine', f: 400, f2: 1200, t: 0.1, v: 0.08 });
      noise({ t: 0.06, v: 0.05, f: 6000, hp: true });
      tone({ type: 'sine', f: 800, f2: 2400, t: 0.06, v: 0.03, at: 0.03 });
    },
  };

  // 테마별 BGM — 멜로디 + 베이스 + 아르페지오 + 퍼커션
  const THEMES = [
    { // 0: overworld C-Am-F-G (bright, heroic)
      mel: [76, 79, 81, 79, 76, 72, 74, 76, 79, 81, 83, 81, 79, 76, 74, 72, 72, 76, 79, 81, 84, 81, 79, 76, 74, 77, 81, 79, 76, 74, 72, 72],
      bass: [48, 43, 48, 43, 45, 40, 45, 40, 41, 45, 41, 36, 43, 38, 43, 38],
      arp: [60, 64, 67, 72, 64, 67, 72, 76, 60, 64, 67, 72, 62, 65, 69, 74],
      chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    },
    { // 1: underground minor (dark, tense)
      mel: [57, 60, 61, 60, 57, 55, 53, 52, 55, 57, 60, 61, 64, 61, 60, 57, 53, 55, 57, 60, 61, 64, 66, 65, 64, 61, 57, 55, 53, 52, 50, 52],
      bass: [33, 40, 33, 40, 38, 45, 38, 45, 36, 43, 36, 43, 41, 48, 41, 48],
      arp: [45, 48, 52, 57, 48, 52, 57, 60, 43, 47, 50, 55, 41, 45, 48, 53],
      chords: [[45, 48, 52], [43, 47, 50], [41, 45, 48], [40, 43, 47]],
    },
    { // 2: boss / tension (chromatic, aggressive)
      mel: [64, 65, 64, 62, 60, 59, 60, 62, 64, 65, 67, 69, 67, 65, 64, 62, 60, 62, 64, 65, 67, 72, 71, 69, 67, 65, 64, 62, 60, 59, 60, 62],
      bass: [40, 40, 41, 41, 42, 42, 43, 43, 44, 44, 45, 45, 46, 46, 47, 47],
      arp: [52, 55, 58, 64, 53, 56, 60, 65, 54, 57, 62, 66, 55, 59, 62, 67],
      chords: [[52, 55, 58], [53, 56, 60], [54, 57, 62], [55, 59, 62]],
    },
  ];
  const EIGHTH = 60 / 176;

  function sched() {
    if (!ctx) return;
    const th = THEMES[musicTheme] || THEMES[0];
    while (mNext < ctx.currentTime + 0.15) {
      const at = Math.max(0, mNext - ctx.currentTime);
      const mel = th.mel[mStep % th.mel.length];
      // 멜로디 (square + sine 옥타브 레이어)
      if (mel) {
        tone({ f: F(mel), t: EIGHTH * 0.9, v: 0.045, at });
        tone({ type: 'sine', f: F(mel + 12), t: EIGHTH * 0.6, v: 0.012, at });
      }
      // 베이스 (triangle)
      if (mStep % 2 === 0) {
        tone({ type: 'triangle', f: F(th.bass[(mStep >> 1) % th.bass.length]), t: EIGHTH * 1.8, v: 0.09, at });
      }
      // 아르페지오 (16분음표, sine)
      if (th.arp) {
        const arpNote = th.arp[mStep % th.arp.length];
        tone({ type: 'sine', f: F(arpNote + 12), t: EIGHTH * 0.35, v: 0.018, at });
        tone({ type: 'sine', f: F(arpNote + 19), t: EIGHTH * 0.25, v: 0.008, at: at + EIGHTH * 0.5 });
      }
      // 코드 패드 (4마디마다)
      if (th.chords && mStep % 8 === 0) {
        const ch = th.chords[(mStep >> 3) % th.chords.length];
        for (let ci = 0; ci < ch.length; ci++) {
          tone({ type: 'triangle', f: F(ch[ci]), t: EIGHTH * 7, v: 0.015, at });
        }
      }
      // 퍼커션
      if (mStep % 4 === 0) kick(at, 0.06);
      if (mStep % 4 === 2) snare(at, 0.04);
      if (mStep % 2 === 0) hihat(at, 0.02);
      if (mStep % 2 === 1) hihat(at, 0.012);

      mNext += EIGHTH;
      mStep++;
    }
  }

  function musicStart(theme) {
    ensure();
    if (!ctx) return;
    if (theme !== undefined) musicTheme = theme;
    if (musicTimer) return;
    mNext = ctx.currentTime + 0.06;
    musicTimer = setInterval(sched, 25);
  }

  function musicStop() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function musicThemeSet(t) { musicTheme = t; }

  function toggle() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  return {
    ensure,
    sfx(n) { if (ctx && SFX[n]) SFX[n](); },
    musicStart, musicStop, musicThemeSet,
    toggle,
    get muted() { return muted; },
  };
})();