'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'js', 'source-manifest.json');

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function assembleEntry(entryName, manifest = readManifest()) {
  const entry = manifest[entryName];
  if (!entry) throw new Error(`manifest entry not found: ${entryName}`);
  if (!Array.isArray(entry.parts) || entry.parts.length === 0) throw new Error(`source parts missing: ${entryName}`);

  const chunks = entry.parts.map(relativePath => {
    const absolutePath = path.resolve(ROOT, relativePath);
    if (!absolutePath.startsWith(ROOT + path.sep)) throw new Error(`unsafe source path: ${relativePath}`);
    return fs.readFileSync(absolutePath, 'utf8');
  });
  const source = chunks.join('');
  const bytes = Buffer.byteLength(source, 'utf8');
  const digest = sha256(source);
  if (bytes !== entry.bytes) throw new Error(`${entryName} byte length mismatch: ${bytes} !== ${entry.bytes}`);
  if (digest !== entry.sha256) throw new Error(`${entryName} SHA-256 mismatch: ${digest} !== ${entry.sha256}`);
  return { source, bytes, sha256: digest, entry };
}

function compileSource(source, filename) {
  return new vm.Script(source, { filename, displayErrors: true });
}

function verifyAll() {
  const manifest = readManifest();
  const results = {};
  for (const entryName of Object.keys(manifest)) {
    const assembled = assembleEntry(entryName, manifest);
    compileSource(assembled.source, entryName);
    results[entryName] = assembled;
  }
  return results;
}

function writeDist(results) {
  const dist = path.join(ROOT, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  for (const [entryName, assembled] of Object.entries(results)) {
    const target = path.join(dist, entryName);
    fs.writeFileSync(target, assembled.source, 'utf8');
  }
  return dist;
}

function main(argv) {
  const checkOnly = argv.includes('--check');
  const results = verifyAll();
  for (const [name, result] of Object.entries(results)) {
    console.log(`SOURCE_OK ${name} ${result.bytes} bytes ${result.sha256}`);
  }
  if (!checkOnly) {
    const dist = writeDist(results);
    console.log(`ASSEMBLED ${path.relative(ROOT, dist)}`);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}

module.exports = { ROOT, readManifest, sha256, assembleEntry, compileSource, verifyAll, writeDist };
