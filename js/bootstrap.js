'use strict';

/* Runtime source assembler.
 * The repository stores the two large source modules as readable UTF-8 parts.
 * This loader joins them in manifest order, verifies SHA-256 when Web Crypto is
 * available, then evaluates core before the browser runtime.
 */
(async function bootstrapMetalStrike(root) {
  const MANIFEST_URL = 'js/source-manifest.json';

  function setBootState(value) {
    if (typeof document !== 'undefined' && document.body) document.body.dataset.rpgBoot = value;
  }

  function report(error) {
    console.error('[SUPER QWEN RPG 2] bootstrap failed', error);
    setBootState('error');
    if (typeof document === 'undefined') return;
    const cvs = document.getElementById('game');
    if (cvs) {
      const ctx = cvs.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0b101d'; ctx.fillRect(0, 0, cvs.width, cvs.height);
        ctx.fillStyle = '#e52521'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
        ctx.fillText('BOOT FAILED', cvs.width / 2, cvs.height / 2 - 40);
        ctx.fillStyle = '#dfe6f5'; ctx.font = '11px monospace';
        ctx.fillText(String(error.message || error).substring(0, 60), cvs.width / 2, cvs.height / 2);
        ctx.fillStyle = '#fbd000'; ctx.font = '12px monospace';
        ctx.fillText('정적 웹 서버로 실행하세요: npx http-server -p 8080 -c-1', cvs.width / 2, cvs.height / 2 + 40);
        ctx.textAlign = 'left';
      }
    }
    const feature = document.querySelector('.title-feature');
    if (feature) feature.textContent = '게임 소스를 불러오지 못했습니다. 정적 웹 서버로 실행했는지 확인하십시오.';
  }

  function byteLength(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).byteLength;
    if (typeof Blob !== 'undefined') return new Blob([text]).size;
    return unescape(encodeURIComponent(text)).length;
  }

  async function digest(text) {
    if (!root.crypto || !root.crypto.subtle || typeof TextEncoder === 'undefined') return null;
    const bytes = new TextEncoder().encode(text);
    const hash = await root.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function getText(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(url + ' 요청 실패: HTTP ' + response.status);
    return response.text();
  }

  async function assemble(entry) {
    const chunks = [];
    for (const path of entry.parts) chunks.push(await getText(path));
    const source = chunks.join('');
    const bytes = byteLength(source);
    if (bytes !== entry.bytes) throw new Error('소스 길이 불일치: ' + bytes + ' / ' + entry.bytes);
    const actual = await digest(source);
    if (actual && actual !== entry.sha256) throw new Error('소스 SHA-256 불일치');
    return source;
  }

  try {
    setBootState('loading');
    const manifest = JSON.parse(await getText(MANIFEST_URL));
    const coreSource = await assemble(manifest['ms-core.js']);
    (0, eval)(coreSource + '\n//# sourceURL=ms-core.js');
    if (!root.MS) throw new Error('MS 도메인 모듈 초기화 실패');

    const gameSource = await assemble(manifest['ms-game.js']);
    (0, eval)(gameSource + '\n//# sourceURL=ms-game.js');
    if (!root.MetalStrike) throw new Error('Metal Strike 런타임 초기화 실패');
    setBootState('ready');
  } catch (error) {
    report(error);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
