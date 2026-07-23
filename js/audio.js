'use strict';

/* WebAudio 칩튠 — 효과음 + BGM 루프 (외부 파일 없음) */
const AudioSys = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false;
  let musicTimer = null, mNext = 0, mStep = 0, musicTheme = 0;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
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

  function noise(o) {
    if (!ctx) return;
    const t = o.t || 0.2, v = o.v || 0.3, at = o.at || 0, f = o.f || 1000;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = f;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + at;
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + t);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + t + 0.03);
  }

  const SFX = {
    jump() { tone({ f: 250, f2: 680, t: 0.18, v: 0.16 }); },
    coin() { tone({ f: 988, t: 0.06, v: 0.14 }); tone({ f: 1319, t: 0.32, v: 0.14, at: 0.06 }); },
    stomp() { tone({ type: 'sawtooth', f: 320, f2: 70, t: 0.12, v: 0.2 }); noise({ t: 0.08, v: 0.15 }); },
    bump() { tone({ f: 140, t: 0.07, v: 0.2 }); },
    break() { noise({ t: 0.22, v: 0.3, f: 900 }); tone({ type: 'triangle', f: 220, f2: 60, t: 0.18, v: 0.18 }); },
    powerup() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone({ f, t: 0.09, v: 0.13, at: i * 0.05 })); },
    powerdown() { [784, 659, 523, 392, 330].forEach((f, i) => tone({ f, t: 0.1, v: 0.13, at: i * 0.06 })); },
    die() { [494, 440, 392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f, t: 0.16, v: 0.18, at: 0.15 + i * 0.11 })); },
    flag() { [392, 523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone({ f, t: 0.12, v: 0.13, at: i * 0.06 })); },
    oneup() { [660, 784, 1319, 988, 1175, 1568].forEach((f, i) => tone({ f, t: 0.1, v: 0.13, at: i * 0.07 })); },
    hurry() { [880, 0, 880, 0, 880].forEach((f, i) => f && tone({ f, t: 0.09, v: 0.16, at: i * 0.12 })); },
    mush() { [262, 330, 392, 523].forEach((f, i) => tone({ f, t: 0.08, v: 0.13, at: i * 0.045 })); },
    // RPG 신규
    hit() { tone({ type: 'square', f: 520, f2: 200, t: 0.07, v: 0.16 }); noise({ t: 0.05, v: 0.1, f: 2200 }); },
    crithit() { tone({ type: 'sawtooth', f: 760, f2: 120, t: 0.12, v: 0.2 }); noise({ t: 0.1, v: 0.16, f: 3000 }); },
    hurt() { tone({ type: 'sawtooth', f: 200, f2: 90, t: 0.16, v: 0.18 }); noise({ t: 0.1, v: 0.12, f: 600 }); },
    enemydie() { tone({ type: 'square', f: 180, f2: 50, t: 0.18, v: 0.14 }); noise({ t: 0.14, v: 0.14, f: 800 }); },
    levelup() { [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone({ f, t: 0.12, v: 0.15, at: i * 0.07 })); },
    itemdrop() { [784, 988, 1319].forEach((f, i) => tone({ type: 'triangle', f, t: 0.08, v: 0.12, at: i * 0.05 })); },
    itempick() { [988, 1319, 1568, 2093].forEach((f, i) => tone({ f, t: 0.07, v: 0.12, at: i * 0.04 })); },
    gold() { tone({ f: 1319, t: 0.05, v: 0.1 }); tone({ f: 1760, t: 0.09, v: 0.1, at: 0.05 }); },
    potion() { tone({ type: 'sine', f: 660, f2: 1320, t: 0.2, v: 0.16 }); },
    fireball() { tone({ type: 'sawtooth', f: 320, f2: 900, t: 0.18, v: 0.14 }); noise({ t: 0.16, v: 0.1, f: 1500 }); },
    explode() { noise({ t: 0.22, v: 0.26, f: 700 }); tone({ type: 'triangle', f: 200, f2: 50, t: 0.2, v: 0.18 }); },
    bosshit() { tone({ type: 'sawtooth', f: 90, f2: 50, t: 0.2, v: 0.22 }); noise({ t: 0.16, v: 0.18, f: 500 }); },
    enrage() { [110, 110, 0, 110].forEach((f, i) => f && tone({ type: 'sawtooth', f, f2: f * 1.5, t: 0.25, v: 0.2, at: i * 0.16 })); },
    equip() { tone({ f: 880, t: 0.05, v: 0.12 }); tone({ f: 1175, t: 0.08, v: 0.12, at: 0.05 }); },
    bosswarn() { [440, 0, 440, 0, 880].forEach((f, i) => f && tone({ type: 'sawtooth', f, t: 0.18, v: 0.18, at: i * 0.22 })); },
    // 콤보 / 원소 / 강타
    slash1() { noise({ t: 0.09, v: 0.12, f: 4000 }); tone({ type: 'square', f: 900, f2: 1400, t: 0.06, v: 0.08 }); },
    slash2() { noise({ t: 0.1, v: 0.13, f: 5000 }); tone({ type: 'square', f: 1100, f2: 1700, t: 0.07, v: 0.08 }); },
    slash3() { noise({ t: 0.13, v: 0.16, f: 6000 }); tone({ type: 'sawtooth', f: 600, f2: 1800, t: 0.1, v: 0.1 }); },
    combo() { [784, 988, 1175].forEach((f, i) => tone({ f, t: 0.06, v: 0.1, at: i * 0.04 })); },
    heavy() { noise({ t: 0.28, v: 0.3, f: 500 }); tone({ type: 'sawtooth', f: 120, f2: 40, t: 0.22, v: 0.22 }); tone({ type: 'triangle', f: 80, f2: 30, t: 0.3, v: 0.18, at: 0.02 }); },
    shockwave() { noise({ t: 0.3, v: 0.22, f: 700 }); tone({ type: 'sine', f: 140, f2: 50, t: 0.35, v: 0.18 }); },
    ice() { tone({ type: 'sine', f: 1400, f2: 2400, t: 0.18, v: 0.12 }); tone({ type: 'triangle', f: 1800, f2: 900, t: 0.16, v: 0.08, at: 0.05 }); },
    bolt() { tone({ type: 'sawtooth', f: 2000, f2: 600, t: 0.05, v: 0.14 }); noise({ t: 0.06, v: 0.12, f: 8000 }); tone({ type: 'square', f: 1600, f2: 400, t: 0.08, v: 0.1, at: 0.02 }); },
    freeze() { [1568, 1319, 988].forEach((f, i) => tone({ type: 'sine', f, t: 0.12, v: 0.12, at: i * 0.06 })); noise({ t: 0.2, v: 0.08, f: 3000, at: 0.05 }); },
    burn() { noise({ t: 0.1, v: 0.08, f: 1500 }); tone({ type: 'sawtooth', f: 220, f2: 120, t: 0.08, v: 0.07 }); },
    shock() { tone({ type: 'square', f: 1800, f2: 300, t: 0.07, v: 0.12 }); noise({ t: 0.05, v: 0.1, f: 9000 }); },
  };

  // 테마별 BGM — 8분음표 멜로디 + 베이스
  const THEMES = [
    { // 0: overworld C-Am-F-G
      mel: [76, 79, 81, 79, 76, 72, 74, 76, 79, 81, 83, 81, 79, 76, 74, 72, 72, 76, 79, 81, 84, 81, 79, 76, 74, 77, 81, 79, 76, 74, 72, 72],
      bass: [48, 43, 48, 43, 45, 40, 45, 40, 41, 45, 41, 36, 43, 38, 43, 38],
    },
    { // 1: underground minor
      mel: [57, 60, 61, 60, 57, 55, 53, 52, 55, 57, 60, 61, 64, 61, 60, 57, 53, 55, 57, 60, 61, 64, 66, 65, 64, 61, 57, 55, 53, 52, 50, 52],
      bass: [33, 40, 33, 40, 38, 45, 38, 45, 36, 43, 36, 43, 41, 48, 41, 48],
    },
    { // 2: boss / tension
      mel: [64, 65, 64, 62, 60, 59, 60, 62, 64, 65, 67, 69, 67, 65, 64, 62, 60, 62, 64, 65, 67, 72, 71, 69, 67, 65, 64, 62, 60, 59, 60, 62],
      bass: [40, 40, 41, 41, 42, 42, 43, 43, 44, 44, 45, 45, 46, 46, 47, 47],
    },
  ];
  const EIGHTH = 60 / 176;

  function sched() {
    if (!ctx) return;
    const th = THEMES[musicTheme] || THEMES[0];
    while (mNext < ctx.currentTime + 0.15) {
      const at = Math.max(0, mNext - ctx.currentTime);
      const mel = th.mel[mStep % th.mel.length];
      if (mel) tone({ f: F(mel), t: EIGHTH * 0.9, v: 0.05, at });
      if (mStep % 2 === 0) tone({ type: 'triangle', f: F(th.bass[(mStep >> 1) % th.bass.length]), t: EIGHTH * 1.8, v: 0.1, at });
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
