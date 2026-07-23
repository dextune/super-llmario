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
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * .4, ctx.sampleRate);
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
  function noise(t, v, cutoff, delay) {
    if (!ctx || muted || !noiseBuf) return;
    var at = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = cutoff || 1200;
    g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(.0001, at + t);
    s.connect(f); f.connect(g); g.connect(master); s.start(at); s.stop(at + t + .03);
  }
  function play(name) {
    ensure(); if (!ctx || muted) return;
    if (name === 'shoot' || name === 'mg') { tone(name === 'mg' ? 650 + Math.random() * 90 : 780, 230, .04, .045); noise(.025, .025, 4800); }
    else if (name === 'shotgun') { noise(.14, .15, 1500); tone(190, 48, .12, .09, 'sawtooth'); }
    else if (name === 'rocket') { tone(90, 420, .22, .06, 'sawtooth'); noise(.16, .05, 700); }
    else if (name === 'explode') { noise(.28, .15, 700); tone(120, 28, .28, .11, 'sawtooth'); }
    else if (name === 'impact') { tone(520, 135, .045, .05); noise(.035, .035, 3600); }
    else if (name === 'crit') { noise(.09, .1, 6200); tone(1040, 180, .1, .09, 'sawtooth'); }
    else if (name === 'kill') { tone(240, 62, .12, .07); noise(.1, .07, 1100); }
    else if (name === 'eliteKill') { noise(.24, .16, 900); tone(160, 32, .28, .13, 'sawtooth'); }
    else if (name === 'blade' || name === 'bladeHit') { noise(name === 'bladeHit' ? .12 : .08, name === 'bladeHit' ? .11 : .06, 5000); tone(850, name === 'bladeHit' ? 90 : 1700, .09, .07, 'sawtooth'); }
    else if (name === 'rank' || name === 'level') [660, 990, 1320].forEach(function (f, i) { tone(f, f, .1, .05, 'square', i * .055); });
    else if (name === 'overdrive') [220, 330, 440, 660, 880, 1320].forEach(function (f, i) { tone(f, f * 1.25, .16, .05, i % 2 ? 'square' : 'sawtooth', i * .055); });
    else if (name === 'deny') tone(180, 110, .12, .04);
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
