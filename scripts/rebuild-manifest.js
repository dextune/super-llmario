'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'js', 'source-manifest.json');

const ENTRY_DIRS = {
  'ms-core.js': 'js/core.parts',
  'ms-game.js': 'js/game.parts',
};

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function discoverParts(dir) {
  const absoluteDir = path.resolve(ROOT, dir);
  return fs.readdirSync(absoluteDir)
    .filter(f => f.endsWith('.part'))
    .sort()
    .map(f => path.join(dir, f).replace(/\\/g, '/'));
}

function rebuild() {
  const manifest = {};

  for (const [entryName, dir] of Object.entries(ENTRY_DIRS)) {
    const parts = discoverParts(dir);
    const chunks = parts.map(relativePath => {
      const absolutePath = path.resolve(ROOT, relativePath);
      return fs.readFileSync(absolutePath, 'utf8');
    });
    const source = chunks.join('').replace(/\r\n/g, '\n');
    const bytes = Buffer.byteLength(source, 'utf8');
    const digest = sha256(source);

    console.log(`${entryName}: ${parts.length} parts, ${bytes} bytes`);
    console.log(`  sha256: ${digest}`);

    manifest[entryName] = {
      parts,
      bytes,
      sha256: digest,
      part_count: parts.length,
    };
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`\nUpdated ${path.relative(ROOT, MANIFEST_PATH)}`);
}

rebuild();
