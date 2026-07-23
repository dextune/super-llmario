'use strict';

/* 렌더 모듈 — Phase 1-3 (render.js 추출)
 *
 * game.js에 470줄 이상 분산되어 있던 모든 draw* 함수를 단일 렌더 모듈로
 * 분리. 각 함수는 게임 상태가 담긴 G(context) 객체를 첫 인자로 받으며,
 * 외부 모듈(RPG, SpriteData, LevelData)과 canvas API에만 의존한다.
 *
 * G(context) 필수 필드:
 *   ctx, cvs, VIEW_W, VIEW_H, TILE, ROWS, camX, step, state
 *   player, enemies, parts, floats, effects, projectiles, items, groundDrops
 *   chests, coinEnts, clouds, grid, bounceAnims
 *   flagPhase, flagY, shakeT, shakeMag, bossEnraged
 *   hero, HS, comboFlashT, comboFlashTxt, SPELLS, activeSpell
 *   COMBO_DUR, ELEM_COLOR, def, getSkyGradient, clamp
 *   RPG, SpriteData, LevelData
 *
 * 외부 의존: RPG, SpriteData, LevelData, ELEM_COLOR(전역 상수 참조만)
 * 브라우저 전역 GameRender로 노출.
 */

const GameRender = (() => {

  // ===== 기본 도형 =====
  function drawBar(G, x, y, w, h, pct, fg, bg) {
    const { ctx } = G;
    ctx.fillStyle = bg || 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fg; ctx.fillRect(x, y, Math.max(0, w * pct), h);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  }

  function drawJagged(G, x1, y1, x2, y2) {
    const { ctx } = G;
    ctx.beginPath(); ctx.moveTo(x1, y1);
    const n = 6;
    for (let i = 1; i < n; i++) { const t = i / n; const mx = (x2 - x1) * t + x1, my = (y2 - y1) * t + y1; ctx.lineTo(mx + (Math.random() * 8 - 4), my + (Math.random() * 8 - 4)); }
    ctx.lineTo(x2, y2); ctx.stroke();
  }

  function drawCoinShape(G, x, y, ph, s) {
    const { ctx } = G;
    const rx = Math.max(2.5, Math.abs(Math.cos(ph)) * 13 * s);
    ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.ellipse(x, y, rx + 2, 16 * s + 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.ellipse(x, y, rx, 16 * s, 0, 0, Math.PI * 2); ctx.fill();
    if (rx > 6) { ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.ellipse(x - rx * 0.3, y - 5 * s, rx * 0.25, 5 * s, 0, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawItemGlyph(G, it, x, y, r) {
    const { ctx } = G;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = it.color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (it.slot === 'weapon') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + r * 0.5); ctx.lineTo(x + r * 0.5, y - r * 0.5); ctx.stroke(); }
    else if (it.slot === 'ring' || it.slot === 'amulet') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.fillStyle = '#ffffff'; ctx.fillRect(x - r * 0.4, y - r * 0.3, r * 0.8, r * 0.6); }
  }

  // ===== 배경 =====
  function drawSun(G) {
    const { ctx, VIEW_W, camX } = G;
    const x = VIEW_W - 150 - camX * 0.03, y = 140;
    const g = ctx.createRadialGradient(x, y, 10, x, y, 90);
    g.addColorStop(0, 'rgba(255,215,106,0.55)'); g.addColorStop(1, 'rgba(255,215,106,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 90, y - 90, 180, 180);
    ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill();
  }

  function drawClouds(G) {
    const { ctx, LevelData, TILE, VIEW_W, camX, step, clouds } = G;
    const th = G.def().theme;
    const span = LevelData.W * TILE * 0.35 + VIEW_W + 400;
    ctx.fillStyle = th.cloud;
    for (const c of clouds) {
      let sx = c.x - camX * 0.35 + step * 0.06;
      sx = ((sx % span) + span) % span - 200;
      const s = c.s, y = c.y;
      ctx.globalAlpha = 0.92;
      ctx.beginPath(); ctx.arc(sx, y, 24 * s, 0, Math.PI * 2); ctx.arc(sx - 26 * s, y + 8 * s, 17 * s, 0, Math.PI * 2); ctx.arc(sx + 27 * s, y + 7 * s, 19 * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawHills(G) {
    const { ctx, TILE, VIEW_W, camX, LevelData } = G;
    const th = G.def().theme;
    const baseY = 11 * TILE + 4;
    const span = LevelData.W * TILE * 0.55 + VIEW_W + 600;
    for (let i = 0; i < 12; i++) {
      let x = i * 460 - camX * 0.55;
      x = ((x % span) + span) % span - 300;
      const big = i % 2 === 0, r = big ? 130 : 78;
      ctx.fillStyle = big ? th.hill : th.hillDark;
      ctx.beginPath(); ctx.arc(x, baseY, r, Math.PI, 0); ctx.fill();
    }
  }

  function drawBushes(G) {
    const { ctx, TILE, VIEW_W, camX, LevelData } = G;
    const th = G.def().theme;
    const baseY = 11 * TILE;
    for (let c = 9; c < LevelData.W; c += 22) {
      const x = c * TILE;
      if (x + 150 < camX || x - 60 > camX + VIEW_W) continue;
      ctx.fillStyle = th.bush;
      ctx.beginPath(); ctx.arc(x, baseY - 12, 17, Math.PI, 0); ctx.arc(x + 26, baseY - 18, 22, Math.PI, 0); ctx.arc(x + 54, baseY - 12, 17, Math.PI, 0); ctx.fill();
      ctx.fillStyle = th.bushDark; ctx.fillRect(x - 17, baseY - 12, 88, 12);
    }
  }

  // ===== 구조물 =====
  function drawCastle(G) {
    const { ctx, TILE, VIEW_W, camX } = G;
    const d = G.def(), cx = d.castle * TILE, topY = 6 * TILE, w = 5 * TILE, h = 5 * TILE;
    if (cx + w < camX - 48 || cx > camX + VIEW_W + 48) return;
    const brick = '#b0622f', dark = '#6e3a17', lite = '#d98a52';
    ctx.fillStyle = brick; ctx.fillRect(cx, topY + TILE, w, h - TILE); ctx.fillRect(cx + TILE, topY, w - 2 * TILE, TILE);
    for (let i = 0; i < 5; i++) ctx.fillRect(cx + i * TILE + 8, topY + TILE - 18, 26, 18);
    for (let i = 0; i < 3; i++) ctx.fillRect(cx + TILE + i * TILE + 8, topY - 18, 26, 18);
    ctx.fillStyle = dark;
    for (let ry = 0; ry < 4; ry++) { const yy = topY + TILE + ry * TILE + 22; ctx.fillRect(cx, yy, w, 3); for (let cxo = 0; cxo < 5; cxo++) ctx.fillRect(cx + cxo * TILE + ((ry % 2) ? 12 : 34), yy - 22, 3, 22); }
    ctx.fillStyle = '#1a0d05'; ctx.fillRect(cx + w / 2 - 34, topY + h - 92, 68, 92);
    ctx.beginPath(); ctx.arc(cx + w / 2, topY + h - 92, 34, Math.PI, 0); ctx.fill();
    ctx.fillStyle = lite; ctx.fillRect(cx, topY + TILE, w, 5);
  }

  function drawFlagPole(G) {
    const { ctx, TILE, VIEW_W, camX, flagY } = G;
    const d = G.def(), poleX = d.flag * TILE + TILE / 2;
    if (poleX + 60 < camX || poleX - 60 > camX + VIEW_W) return;
    ctx.fillStyle = '#9fb0a8'; ctx.fillRect(poleX - 3, 2 * TILE - 6, 6, 9 * TILE + 6);
    ctx.fillStyle = '#7c8a92'; ctx.fillRect(poleX - 16, 11 * TILE - 12, 32, 12);
    ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(poleX, 2 * TILE - 12, 8, 0, Math.PI * 2); ctx.fill();
    const fy = flagY;
    ctx.fillStyle = '#2fa839'; ctx.beginPath(); ctx.moveTo(poleX - 3, fy); ctx.lineTo(poleX - 40, fy + 15); ctx.lineTo(poleX - 3, fy + 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(poleX - 16, fy + 15, 5, 0, Math.PI * 2); ctx.fill();
  }

  // ===== 타일 =====
  function drawTile(G, id, x, y, c, r) {
    const { ctx, TILE } = G;
    const th = G.def().theme;
    if (id === 1) {
      ctx.fillStyle = th.ground; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#f3a15c'; ctx.fillRect(x, y, TILE, 6);
      ctx.fillStyle = '#8a4210'; ctx.fillRect(x, y + TILE - 4, TILE, 4);
      ctx.fillRect(x + ((c % 2) ? 14 : 32), y + 12, 3, 14); ctx.fillRect(x, y + 26, TILE, 3);
      ctx.fillRect(x + ((c % 2) ? 32 : 14), y + 30, 3, 14);
    } else if (id === 2) {
      ctx.fillStyle = '#c65d21'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#ef9c5a'; ctx.fillRect(x, y, TILE, 5);
      ctx.fillStyle = '#7c3512'; ctx.fillRect(x, y + TILE - 4, TILE, 4); ctx.fillRect(x, y + 22, TILE, 3); ctx.fillRect(x + 22, y, 3, 22); ctx.fillRect(x + 10, y + 25, 3, 23); ctx.fillRect(x + 34, y + 25, 3, 23);
    } else if (id === 3) {
      ctx.fillStyle = '#f8b800'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#a35600'; ctx.fillRect(x, y, TILE, 4); ctx.fillRect(x, y + TILE - 4, TILE, 4); ctx.fillRect(x, y, 4, TILE); ctx.fillRect(x + TILE - 4, y, 4, TILE);
      ctx.fillStyle = '#7c4a00'; [[7, 7], [TILE - 11, 7], [7, TILE - 11], [TILE - 11, TILE - 11]].forEach(p => ctx.fillRect(x + p[0], y + p[1], 4, 4));
      ctx.font = '22px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#7c4a00'; ctx.fillText('?', x + TILE / 2 + 2, y + TILE / 2 + 4);
      ctx.fillStyle = '#ffffff'; ctx.fillText('?', x + TILE / 2, y + TILE / 2 + 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else if (id === 4) {
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#5c3a18'; ctx.fillRect(x, y, TILE, 4); ctx.fillRect(x, y + TILE - 4, TILE, 4); ctx.fillRect(x, y, 4, TILE); ctx.fillRect(x + TILE - 4, y, 4, TILE);
      ctx.fillStyle = '#4a2e10'; [[7, 7], [TILE - 11, 7], [7, TILE - 11], [TILE - 11, TILE - 11]].forEach(p => ctx.fillRect(x + p[0], y + p[1], 4, 4));
    } else if (id === 5) {
      ctx.fillStyle = '#0b5215'; ctx.fillRect(x - 5, y, TILE * 2 + 10, TILE);
      ctx.fillStyle = '#2fa839'; ctx.fillRect(x - 1, y + 4, TILE * 2 + 2, TILE - 8);
      ctx.fillStyle = '#8ce08a'; ctx.fillRect(x + 6, y + 4, 12, TILE - 8);
      ctx.fillStyle = '#0d6b1c'; ctx.fillRect(x + TILE * 2 - 16, y + 4, 12, TILE - 8);
    } else if (id === 7) {
      ctx.fillStyle = '#0b5215'; ctx.fillRect(x + 2, y, TILE * 2 - 4, TILE);
      ctx.fillStyle = '#2fa839'; ctx.fillRect(x + 6, y, TILE * 2 - 12, TILE);
      ctx.fillStyle = '#8ce08a'; ctx.fillRect(x + 12, y, 12, TILE);
      ctx.fillStyle = '#0d6b1c'; ctx.fillRect(x + TILE * 2 - 22, y, 12, TILE);
    }
  }

  function drawTiles(G) {
    const { ctx, TILE, ROWS, VIEW_W, camX, grid, bounceAnims, LevelData } = G;
    const c0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const c1 = Math.min(LevelData.W - 1, c0 + 22);
    for (let r = 0; r < ROWS; r++) for (let c = c0; c <= c1; c++) {
      const id = grid[r][c]; if (!id) continue;
      const key = c + ',' + r; const bt = bounceAnims.get(key);
      const off = bt ? Math.sin((bt / 12) * Math.PI) * 10 : 0;
      drawTile(G, id, c * TILE, r * TILE - off, c, r);
    }
  }

  // ===== 코인, 상자, 아이템 =====
  function drawCoins(G) {
    const { TILE, VIEW_W, camX, coinEnts } = G;
    for (const cn of coinEnts) { if (cn.dead || cn.x + 40 < camX || cn.x > camX + VIEW_W + 40) continue; drawCoinShape(G, cn.x + 15, cn.y + 19, cn.ph, 1); }
  }

  function drawChests(G) {
    const { ctx, TILE, VIEW_W, camX, chests, RPG } = G;
    for (const c of chests) {
      if (c.x + 40 < camX || c.x > camX + VIEW_W + 40) continue;
      const yo = Math.sin(c.bob) * 2;
      if (c.opened) {
        ctx.fillStyle = '#5a3a18'; ctx.fillRect(c.x, c.y + yo, c.w, c.h);
        ctx.fillStyle = '#3a2410'; ctx.fillRect(c.x, c.y + yo, c.w, 8);
      } else {
        ctx.fillStyle = '#a06a2a'; ctx.fillRect(c.x, c.y + yo, c.w, c.h);
        ctx.fillStyle = '#d9a85a'; ctx.fillRect(c.x, c.y + yo, c.w, 6);
        ctx.fillStyle = '#6a4512'; ctx.fillRect(c.x, c.y + c.h - 6 + yo, c.w, 6);
        ctx.fillStyle = '#ffd23e'; ctx.fillRect(c.x + c.w / 2 - 3, c.y + c.h / 2 - 3 + yo, 6, 6);
        const rc = RPG.RARITY[c.rarity].color;
        ctx.globalAlpha = 0.35 + Math.sin(c.bob * 2) * 0.15;
        ctx.fillStyle = rc; ctx.beginPath(); ctx.arc(c.x + c.w / 2, c.y + c.h / 2 + yo, 22, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawItems(G) {
    const { ctx, TILE, VIEW_W, camX, items, SpriteData } = G;
    for (const it of items) {
      if (it.type === 'coinpop') drawCoinShape(G, it.x + 14, it.y + 16, it.ph, 1);
      else if (it.type === 'mush') {
        const spr = SpriteData.get('mush', false);
        ctx.save();
        if (it.emerge > 0) { ctx.beginPath(); ctx.rect(it.x - 20, 0, 90, it.r * TILE); ctx.clip(); }
        ctx.drawImage(spr, Math.round(it.x - 1), Math.round(it.y + it.h - spr.height));
        ctx.restore();
      }
    }
  }

  function drawGroundDrops(G) {
    const { ctx, VIEW_W, camX, groundDrops, RPG, step } = G;
    for (const d of groundDrops) {
      if (d.x + 30 < camX || d.x > camX + VIEW_W + 30) continue;
      const yo = Math.sin(d.bob) * 3;
      const it = d.item;
      const pulse = 0.5 + Math.sin(d.bob * 2) * 0.2;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = it.color;
      ctx.beginPath(); ctx.arc(d.x + 12, d.y + 12 + yo, 16, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      drawItemGlyph(G, it, d.x + 12, d.y + 12 + yo, 9);
      if (d.life < 600 && (step >> 2) & 1) { ctx.globalAlpha = 0.5; }
      ctx.font = '7px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000'; ctx.fillText(RPG.SLOT_NAMES[it.slot].slice(0, 1), d.x + 13, d.y + 13 + yo);
      ctx.fillStyle = it.color; ctx.fillText(RPG.SLOT_NAMES[it.slot].slice(0, 1), d.x + 12, d.y + 12 + yo);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    }
  }

  // ===== 투사체 =====
  function drawProjectiles(G) {
    const { ctx, projectiles } = G;
    for (const p of projectiles) {
      const col = p.kind === 'ice' ? '#6fd8ff' : '#ff8a3a';
      const colCore = p.kind === 'ice' ? '#e8fbff' : '#fff2b0';
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = 0.32 - i * 0.05;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x - p.vx * i * 0.5, p.y + (p.kind === 'ice' ? Math.sin(i) * 2 : 0), p.r * (1 - i * 0.1), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.r + 4);
      g.addColorStop(0, colCore); g.addColorStop(0.5, col); g.addColorStop(1, p.kind === 'ice' ? 'rgba(111,216,255,0)' : 'rgba(255,60,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); ctx.fill();
      if (p.kind === 'ice') { ctx.strokeStyle = '#bff0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.4, p.y - 4); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.4, p.y + 4); ctx.stroke(); }
    }
  }

  // ===== 적 =====
  function drawStatusBox(G, e) {
    const { ctx, step } = G;
    if (e.frozen > 0) {
      ctx.globalAlpha = 0.42; ctx.fillStyle = '#9fe8ff'; ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#e8fbff';
      for (let i = 0; i < 4; i++) ctx.fillRect(e.x + (i * 13 % e.w), e.y + (i * 17 % e.h), 3, 3);
      ctx.globalAlpha = 1;
      return;
    }
    if (e.chill > 0) { ctx.globalAlpha = 0.2; ctx.fillStyle = '#6fd8ff'; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.globalAlpha = 1; }
    if (e.shock > 0 && (step >> 1) & 1) { ctx.globalAlpha = 0.32; ctx.fillStyle = '#ffe066'; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.globalAlpha = 1; }
    if (e.burn > 0 && (step >> 2) & 1) { ctx.globalAlpha = 0.16; ctx.fillStyle = '#ff6020'; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.globalAlpha = 1; }
  }

  function drawHpBar(G, e) {
    const { ctx } = G;
    const bw = e.boss ? 120 : 30, bh = e.boss ? 7 : 4;
    const bx = e.x + e.w / 2 - bw / 2, by = e.y - (e.boss ? 14 : 8);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = '#3a0a0a'; ctx.fillRect(bx, by, bw, bh);
    const pct = Math.max(0, e.hp / e.maxhp);
    ctx.fillStyle = e.boss ? '#ff3030' : '#e52521';
    ctx.fillRect(bx, by, bw * pct, bh);
  }

  function drawBoss(G, e) {
    const { ctx, bossEnraged } = G;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const f = 1 + Math.sin(e.animT * 0.1) * 0.04;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(e.face < 0 ? -1 : 1, 1); ctx.scale(f, f);
    ctx.fillStyle = bossEnraged ? '#c01010' : '#7a1410';
    ctx.beginPath(); ctx.ellipse(0, 6, 30, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a0c08'; ctx.beginPath(); ctx.ellipse(0, 6, 30, 26, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = bossEnraged ? '#e02020' : '#9a1a14';
    ctx.beginPath(); ctx.arc(0, -18, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a0a06';
    ctx.beginPath(); ctx.moveTo(-16, -26); ctx.lineTo(-26, -42); ctx.lineTo(-10, -30); ctx.fill();
    ctx.beginPath(); ctx.moveTo(16, -26); ctx.lineTo(26, -42); ctx.lineTo(10, -30); ctx.fill();
    ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(-8, -20, 4, 0, Math.PI * 2); ctx.arc(8, -20, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-8, -20, 2, 0, Math.PI * 2); ctx.arc(8, -20, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a0a08'; ctx.fillRect(-10, -8, 20, 5);
    ctx.fillStyle = '#fff'; for (let i = -8; i <= 8; i += 4) ctx.fillRect(i, -8, 2, 5);
    ctx.fillStyle = bossEnraged ? '#c01010' : '#7a1410';
    ctx.beginPath(); ctx.ellipse(-34, 10, 8, 16, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(34, 10, 8, 16, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (e.hitFlash > 0) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#fff'; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.globalAlpha = 1; }
  }

  function drawEnemies(G) {
    const { ctx, VIEW_W, camX, enemies, SpriteData } = G;
    for (const e of enemies) {
      if (e.x + e.w < camX - 48 || e.x > camX + VIEW_W + 48) continue;
      if (e.spr === 'boss') { drawBoss(G, e); drawStatusBox(G, e); if (e.hp < e.maxhp || e.boss) drawHpBar(G, e); continue; }
      const prefix = e.spr || 'goomba';
      let spr;
      if (e.dead) spr = SpriteData.get(prefix + '1', e.vx > 0);
      else spr = SpriteData.get(prefix + (1 + Math.floor(e.animT / 12) % 2), e.vx > 0 || e.face > 0);
      let dy = e.y + e.h - spr.height;
      ctx.save();
      if (e.hitFlash > 0) { ctx.globalAlpha = 0.7; }
      ctx.drawImage(spr, Math.round(e.x - 1), Math.round(dy));
      ctx.globalAlpha = 1; ctx.restore();
      drawStatusBox(G, e);
      if (e.hp < e.maxhp || e.boss) drawHpBar(G, e);
    }
  }

  // ===== 슬래시 / 플레이어 =====
  function drawSlash(G, stage, prog, ax, ay, el) {
    const { ctx, ELEM_COLOR, player } = G;
    const col = ELEM_COLOR[el] || '#ffffff';
    ctx.save();
    ctx.translate(ax, ay);
    ctx.scale(player.face < 0 ? -1 : 1, 1);
    ctx.lineCap = 'round';
    if (stage === 0 || stage === 1) {
      const a0 = stage === 0 ? -1.0 : 1.1, a1 = stage === 0 ? 1.0 : -1.4;
      const a = a0 + (a1 - a0) * prog;
      for (let i = 0; i < 5; i++) {
        const aa = a - i * 0.16 * (stage === 0 ? 1 : -1);
        ctx.globalAlpha = (1 - prog) * 0.5 * (1 - i * 0.18);
        ctx.strokeStyle = col; ctx.lineWidth = 7 - i;
        ctx.beginPath(); ctx.arc(0, 0, 40, Math.min(a, aa), Math.max(a, aa)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 50, Math.sin(a) * 50); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); ctx.lineTo(Math.cos(a) * 52, Math.sin(a) * 52); ctx.stroke();
    } else {
      const len = 30 + Math.sin(prog * Math.PI) * 26;
      ctx.globalAlpha = 1 - prog * 0.25;
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(len - 8, 0); ctx.lineTo(len + 5, 0); ctx.stroke();
      ctx.globalAlpha = (1 - prog) * 0.6; ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 20 + prog * 32, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - prog) * 0.4; ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 14 + prog * 24, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    ctx.restore();
  }

  function drawPlayer(G) {
    const { ctx, state, player, step, SpriteData, COMBO_DUR, clamp, flagPhase } = G;
    if (flagPhase === 'done') return;
    if (player.inv > 0 && (step >> 2) & 1) return;
    let frame;
    if (state === 'dying') frame = 'idle';
    else if (player.attackT > 0) frame = ['atk1', 'atk2', 'atk3'][player.attackStage];
    else if (player.heavyT > 0) frame = 'atk1';
    else if (!player.onGround) frame = 'jump';
    else if (Math.abs(player.vx) > 0.4) frame = ['run1', 'run2', 'run3'][Math.floor(step / 6) % 3];
    else frame = 'idle';
    const spr = SpriteData.get('m_s_' + frame, player.face < 0);
    const sx = player.x + player.w / 2 - spr.width / 2;
    const sy = player.y + player.h - spr.height;
    ctx.save();
    if (player.landT > 0) { const k = player.landT / 8; ctx.translate(sx + spr.width / 2, player.y + player.h); ctx.scale(1 + 0.15 * k, 1 - 0.15 * k); ctx.translate(-(sx + spr.width / 2), -(player.y + player.h)); }
    if (player.heavyT > 12) { ctx.translate(sx + spr.width / 2, player.y + player.h); ctx.scale(1, 0.9); ctx.translate(-(sx + spr.width / 2), -(player.y + player.h)); }
    ctx.drawImage(spr, Math.round(sx), Math.round(sy));
    ctx.restore();
    if (player.attackT > 0) {
      const dur = COMBO_DUR[player.attackStage];
      const prog = clamp(1 - player.attackT / dur, 0, 1);
      const ax = player.face > 0 ? player.x + player.w - 2 : player.x + 2;
      const ay = player.y + player.h / 2 - 2;
      drawSlash(G, player.attackStage, prog, ax, ay, player.attackElement);
    }
  }

  // ===== 파티클 / 플로트 =====
  function drawParts(G) {
    const { ctx, parts } = G;
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      if (p.brick) ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.sz / 2 + 1, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats(G) {
    const { ctx, floats } = G;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 60);
      ctx.font = (f.size || 10) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(f.txt, f.x + 2, f.y + 2);
      ctx.fillStyle = f.color; ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ===== 이펙트 =====
  function drawEffects(G) {
    const { ctx, effects, ELEM_COLOR } = G;
    for (const e of effects) {
      const k = e.life / e.maxLife;
      if (e.type === 'shock') {
        ctx.globalAlpha = k * 0.6; ctx.strokeStyle = e.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = k * 0.3; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === 'flash') {
        ctx.globalAlpha = k * 0.75; ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.3 - k * 0.3), 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'bolt') {
        ctx.globalAlpha = k; ctx.strokeStyle = e.color; ctx.lineWidth = 3; drawJagged(G, e.x1, e.y1, e.x2, e.y2);
        ctx.globalAlpha = k * 0.4; ctx.lineWidth = 7; drawJagged(G, e.x1, e.y1, e.x2, e.y2);
      } else if (e.type === 'slash') {
        ctx.save(); ctx.translate(e.x, e.y); ctx.scale(e.face < 0 ? -1 : 1, 1);
        ctx.globalAlpha = k * 0.45; ctx.strokeStyle = ELEM_COLOR[e.element] || '#ffffff'; ctx.lineWidth = 5;
        if (e.stage < 2) { const a0 = e.stage === 0 ? -1.0 : 1.1, a1 = e.stage === 0 ? 1.0 : -1.4; ctx.beginPath(); ctx.arc(0, 0, 42, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(0, 0, 18 + (1 - k) * 26, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ===== HUD =====
  function drawHUD(G) {
    const { ctx, hero, HS, player, step, VIEW_W, RPG, SPELLS, activeSpell, comboFlashT, comboFlashTxt } = G;
    ctx.font = '10px "Press Start 2P", monospace'; ctx.textBaseline = 'top';
    const txt = (s, x, y, color) => { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = color || '#fff'; ctx.fillText(s, x, y); };

    txt('LV ' + hero.level, 20, 12, '#ffd23e');
    drawBar(G, 20, 26, 150, 12, player.hp / HS.maxHp, '#e52521');
    txt('HP ' + Math.ceil(player.hp) + '/' + HS.maxHp, 24, 27, '#fff');
    drawBar(G, 20, 42, 150, 10, player.mp / HS.maxMp, '#2f7bff');
    txt('MP ' + Math.ceil(player.mp) + '/' + HS.maxMp, 24, 43, '#fff');
    const xpNeed = RPG.xpForLevel(hero.level);
    drawBar(G, 20, 56, 150, 8, hero.xp / xpNeed, '#ffd23e');
    txt('XP ' + hero.xp + '/' + xpNeed, 24, 56, '#1a1a1a');

    drawCoinShape(G, 620, 20, step * 0.12, 0.5);
    txt('GOLD ' + hero.gold, 636, 14, '#ffd23e');

    txt('STR ' + HS.str + '  DEX ' + HS.dex, 470, 14, '#cfe0ff');
    const dmin = HS.weaponDmg[0] + Math.floor(HS.str * 0.8), dmax = HS.weaponDmg[1] + Math.floor(HS.str * 0.8);
    let dstr = 'DMG ' + dmin + '-' + dmax;
    if (HS.fireDmg[1]) dstr += '  화염' + (HS.fireDmg[0]) + '-' + (HS.fireDmg[1]);
    if (HS.coldDmg[1]) dstr += '  서리' + (HS.coldDmg[0]) + '-' + (HS.coldDmg[1]);
    if (HS.lightDmg[1]) dstr += '  번개' + (HS.lightDmg[0]) + '-' + (HS.lightDmg[1]);
    txt(dstr, 470, 28, '#ffb0b0');
    let l2 = 'ARMOR ' + HS.armor + '  CRIT ' + Math.round(HS.crit) + '%';
    if (HS.leech) l2 += '  흡혈' + HS.leech + '%';
    if (HS.procFire || HS.procFrost || HS.procChain) l2 += '  프로크!';
    txt(l2, 470, 42, '#cfe0ff');

    const sx = 760;
    for (let i = 0; i < SPELLS.length; i++) {
      const sp = SPELLS[i], sel = i === activeSpell;
      ctx.fillStyle = sel ? sp.color : 'rgba(20,28,48,0.7)';
      ctx.fillRect(sx + i * 66, 8, 60, 14);
      ctx.strokeStyle = sel ? '#fff' : '#3a4763'; ctx.lineWidth = sel ? 2 : 1; ctx.strokeRect(sx + i * 66, 8, 60, 14);
      ctx.font = '7px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = sel ? '#141a29' : sp.color; ctx.fillText((i + 1) + ' ' + sp.name, sx + i * 66 + 30, 16);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '10px "Press Start 2P", monospace';
    }
    txt('J 콤보  K 강타  L 주문  1/2/3 선택  Q HP물약 x' + hero.pots.hp, 760, 28, '#9fd0ff');
    txt('I 가방  사망 ' + hero.deaths, 760, 42, '#ff8080');

    txt(G.def().name, 20, 68, '#cfe0ff');
    if (comboFlashT > 0) {
      ctx.globalAlpha = Math.min(1, comboFlashT / 12);
      ctx.font = '14px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(comboFlashTxt, VIEW_W / 2 + 2, 78 + 2);
      ctx.fillStyle = '#ffd23e'; ctx.fillText(comboFlashTxt, VIEW_W / 2, 78);
      ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.font = '10px "Press Start 2P", monospace';
    }

    ctx.textBaseline = 'alphabetic';
  }

  // ===== 메인 렌더 =====
  function render(G) {
    const { ctx, VIEW_W, VIEW_H, camX, shakeT, shakeMag } = G;
    const th = G.def().theme;
    ctx.fillStyle = G.getSkyGradient(th);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (th.sun) drawSun(G);
    drawClouds(G); drawHills(G);
    ctx.save();
    let ox = -Math.round(camX), oy = 0;
    if (shakeT > 0) { G.shakeT--; const m = shakeMag || 3; ox += (Math.random() * 2 - 1) * m; oy = (Math.random() * 2 - 1) * m; }
    ctx.translate(ox, oy);
    drawBushes(G); drawCastle(G); drawFlagPole(G); drawTiles(G); drawCoins(G); drawChests(G); drawItems(G); drawGroundDrops(G); drawProjectiles(G); drawEffects(G); drawEnemies(G); drawPlayer(G); drawParts(G); drawFloats(G);
    ctx.restore();
    drawHUD(G);
  }

  return {
    render,
    // 개별 함수도 테스트/직접 사용을 위해 노출
    drawSun, drawClouds, drawHills, drawBushes, drawCastle, drawFlagPole,
    drawTiles, drawTile, drawCoinShape, drawCoins, drawChests, drawItems,
    drawGroundDrops, drawItemGlyph, drawProjectiles, drawStatusBox, drawEnemies,
    drawHpBar, drawBoss, drawSlash, drawPlayer, drawParts, drawFloats,
    drawJagged, drawEffects, drawBar, drawHUD,
  };
})();
