'use strict';

const assert = require('assert');
const vm = require('vm');
const { assembleEntry } = require('../scripts/assemble-sources');
require('../js/overdrive-runtime');
require('../js/overdrive-audio');
const overdrive = require('../js/overdrive');

const assembled = assembleEntry('ms-game.js');
const patched = overdrive.patch(assembled.source);

assert.notStrictEqual(patched, assembled.source, 'Overdrive must transform the runtime source');
assert.ok(patched.includes(overdrive.marker), 'Patch marker must be present');
assert.ok(patched.includes('function tryMelee()'), 'Melee execution system must be injected');
assert.ok(patched.includes('function tryActivateOverdrive()'), 'Overdrive activation must be injected');
assert.ok(patched.includes('function drawCombatOverlay()'), 'Combat HUD must be injected');
assert.ok(patched.includes('function applyEliteMutation(enemy)'), 'Elite RPG enemy layer must be injected');
assert.strictEqual(overdrive.patch(patched), patched, 'Patch must be idempotent');
assert.doesNotThrow(() => new vm.Script(patched, { filename: 'ms-game-overdrive.js' }));

console.log('OVERDRIVE_OK', patched.length, 'chars');
