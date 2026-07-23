'use strict';
(function (root) {
  var ctx, master, comp, noiseBuf, muted = false;
  function ensure() {
    if (typeof window === 'undefined') return;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 8; comp.attack.value = .002; comp.release.value = .12;
      master.gain.value = .22; master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * .5, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  function tone(f, f2, t, v, type, delay) {
    if (!ctx || muted) return;
    var at = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(Math.max(20, f), at);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), at + t);
    g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(.0001, at + t);
    o.connect(g); g.connect(master); o.start(at); o.stop(at + t + .03);
  }
  // 화음 레이어
  function harm(f, t, v, type, delay) {
    tone(f, f, t, v, type, delay);
    tone(f * 1.5, f * 1.5, t * .8, v * .4, type || 'sine', (delay || 0) + .005);
    tone(f * 2, f * 2, t * .6, v * .2, 'sine', (delay || 0) + .01);
  }
  function noise(t, v, cutoff, delay, hp) {
    if (!ctx || muted || !noiseBuf) return;
    var at = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = cutoff || 1200;
    g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(.0001, at + t);
    s.connect(f); f.connect(g); g.connect(master); s.start(at); s.stop(at + t + .03);
  }
  function play(name) {
    ensure(); if (!ctx || muted) return;
    if (name === 'shoot' || name === 'mg') {
      tone(name === 'mg' ? 650 + Math.random() * 90 : 780, 230, .04, .04);
      noise(.025, .02, 4800);
      tone(name === 'mg' ? 1300 : 1560, 460, .025, .012, 'sine');
    }
    else if (name === 'shotgun') {
      noise(.14, .13, 1500); tone(190, 48, .12, .08, 'sawtooth');
      tone(95, 24, .18, .05, 'sine'); noise(.06, .04, 5000, .02, true);
    }
    else if (name === 'rocket') {
      tone(90, 420, .22, .05, 'sawtooth'); noise(.16, .04, 700);
      tone(45, 210, .3, .03, 'sine', .02);
    }
    else if (name === 'explode') {
      noise(.28, .13, 700); tone(120, 28, .28, .1, 'sawtooth');
      tone(60, 14, .4, .06, 'sine'); noise(.12, .04, 3500, .04, true);
    }
    else if (name === 'impact') {
      tone(520, 135, .045, .045); noise(.035, .03, 3600);
      tone(1040, 270, .03, .015, 'sine');
    }
    else if (name === 'crit') {
      noise(.09, .09, 6200); tone(1040, 180, .1, .08, 'sawtooth');
      harm(1040, .08, .03, 'square'); noise(.04, .03, 10000, .01, true);
    }
    else if (name === 'kill') {
      tone(240, 62, .12, .06); noise(.1, .06, 1100);
      tone(480, 124, .08, .02, 'sine'); tone(120, 31, .16, .03, 'sine');
    }
    else if (name === 'eliteKill') {
      noise(.24, .14, 900); tone(160, 32, .28, .11, 'sawtooth');
      harm(320, .2, .04, 'square'); tone(80, 16, .35, .06, 'sine');
      noise(.1, .05, 5000, .05, true);
    }
    else if (name === 'blade' || name === 'bladeHit') {
      var hit = name === 'bladeHit';
      noise(hit ? .12 : .08, hit ? .1 : .05, 5000);
      tone(850, hit ? 90 : 1700, .09, .06, 'sawtooth');
      if (hit) { harm(425, .07, .025, 'square'); tone(212, 45, .12, .03, 'sine'); }
      else { tone(1700, 3400, .05, .02, 'sine'); }
    }
    else if (name === 'rank' || name === 'level') {
      [660, 990, 1320].forEach(function (f, i) {
        tone(f, f, .1, .045, 'square', i * .055);
        tone(f * 2, f * 2, .06, .012, 'sine', i * .055);
      });
      if (name === 'level') { tone(1980, 1980, .2, .02, 'sine', .18); tone(2640, 2640, .15, .01, 'sine', .22); }
    }
    else if (name === 'overdrive') {
      [220, 330, 440, 660, 880, 1320].forEach(function (f, i) {
        tone(f, f * 1.25, .16, .045, i % 2 ? 'square' : 'sawtooth', i * .055);
        tone(f * 2, f * 2.5, .1, .012, 'sine', i * .055);
      });
      tone(1760, 2200, .3, .02, 'sine', .35);
    }
    else if (name === 'deny') {
      tone(180, 110, .12, .035);
      tone(90, 55, .15, .02, 'sine');
    }
  }
  var fx = { ensure: ensure, play: play, setMuted: function (v) { muted = !!v; if (master) master.gain.value = muted ? 0 : .22; } };
  root.MetalStrikeImpactAudio = fx;
  var audio = typeof AudioSys !== 'undefined' ? AudioSys : root.AudioSys;
  if (audio && !audio.__overdriveWrapped) {
    var e = audio.ensure, s = audio.sfx, t = audio.toggle;
    audio.ensure = function () { e.call(audio); ensure(); };
    audio.sfx = function (name) { s.call(audio, name); play(name); };
    audio.toggle = function () { var v = t.call(audio); fx.setMuted(v); return v; };
    audio.__overdriveWrapped = true;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);