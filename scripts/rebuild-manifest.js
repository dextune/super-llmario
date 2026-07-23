'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'js', 'source-manifest.json');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function rebuild() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  for (const [entryName, entry] of Object.entries(manifest)) {
    const chunks = entry.parts.map(relativePath => {
      const absolutePath = path.resolve(ROOT, relativePath);
      return fs.readFileSync(absolutePath, 'utf8');
    });
    const source = chunks.join('');
    const bytes = Buffer.byteLength(source, 'utf8');
    const digest = sha256(source);

    console.log(`${entryName}: ${entry.bytes} -> ${bytes} bytes`);
    console.log(`  sha256: ${entry.sha256} -> ${digest}`);

    entry.bytes = bytes;
    entry.sha256 = digest;
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`\nUpdated ${path.relative(ROOT, MANIFEST_PATH)}`);
}

rebuild();