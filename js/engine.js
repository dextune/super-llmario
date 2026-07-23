'use strict';

/* 엔진 모듈 — Phase 1-3
 *
 * game.js의 물리/충돌/업데이트/루프 함수를 ctx(context) + act(actions) 패턴으로
 * 분리한 순수 엔진 모듈. ctx는 모든 가변 월드 상태를, act는 게임 특화 액션 콜백을
 * 담는다. 함수는 ctx를 직접 수정하며, 게임 로직(spawn/audio/combat)은 act를 통해
 * 호출한다.
 *
 * ctx 필수 필드:
 *   grid, mushSet, coinEnts, enemies, items, parts, floats, groundDrops, chests,
 *   projectiles, effects, clouds, bounceAnims
 *   player, hero, HS, camX, camLock, levelIdx, levelBoss, bossEnraged
 *   flagPhase, flagT, flagY, shakeT, shakeMag, deathT
 *   comboFlashT, comboFlashTxt, activeSpell, SPELLS
 *   input, jumpBuf, step, acc, last, state
 *   partPool, effectPool, floatPool
 *   TILE, ROWS, VIEW_W, VIEW_H, SOLID, GRAV, MAXFALL, JUMPV, WALK, RUN, ACC, AIRACC, FRIC, STEP
 *   COMBO_DUR, COMBO_MULT, COMBO_WINDOW, COMBO_CD, INV_CAP
 *   MAX_PARTICLES, MAX_EFFECTS, MAX_FLOATS
 *
 * act 필수 콜백:
 *   sfx, musicStop, musicStart,
 *   dust, sparkle, burst, burnParticle, shards, addFloat, pushEffect,
 *   acquirePart, acquireFloat, acquireEffect, release,
 *   dealDamage, applyDamage, damageRoll, hurtPlayer, killEnemy, hitParticles,
 *   applyStatus, rollProcs, chainLightning, doShockwave,
 *   collectCoin, collectMush, spawnMush, spawnCoinPop, spawnItemDrop, openChest,
 *   die, startFlag, gainXP, onBossDead,
 *   buildInv, showOverlay,
 *   comboHitbox, shatterIce, explodeFireball,
 *   def, recompute, potionHeal, eColor,
 *   overlap, compact, clamp,
 */

const GameEngine = (() => {

  // ===== 물리 =====
  function solid(ctx, c, r) {
    if (r < 0 || r >= ctx.ROWS || c < 0 || c >= ctx.LevelData.W) return false;
    return ctx.SOLID.has(ctx.grid[r][c]);
  }

  function physMove(ctx, e, isPlayer) {
    if (e.kb) { e.x += e.kb; e.kb *= 0.7; if (Math.abs(e.kb) < 0.3) e.kb = 0; }
    e.x += e.vx;
    let top = e.y + 2, bot = e.y + e.h - 2;
    if (e.vx > 0) {
      const c = Math.floor((e.x + e.w) / ctx.TILE);
      for (let r = Math.floor(top / ctx.TILE); r <= Math.floor(bot / ctx.TILE); r++) {
        if (solid(ctx, c, r)) { e.x = c * ctx.TILE - e.w - 0.01; if (isPlayer) e.vx = 0; else e.vx = -Math.abs(e.vx); break; }
      }
    } else if (e.vx < 0) {
      const c = Math.floor(e.x / ctx.TILE);
      for (let r = Math.floor(top / ctx.TILE); r <= Math.floor(bot / ctx.TILE); r++) {
        if (solid(ctx, c, r)) { e.x = (c + 1) * ctx.TILE + 0.01; if (isPlayer) e.vx = 0; else e.vx = Math.abs(e.vx); break; }
      }
    }
    if (!e.fly) {
      e.vy = Math.min(e.vy + ctx.GRAV, ctx.MAXFALL);
      e.y += e.vy;
      e.onGround = false;
      const l = e.x + 3, rr = e.x + e.w - 3;
      if (e.vy >= 0) {
        const r = Math.floor((e.y + e.h) / ctx.TILE);
        for (let c = Math.floor(l / ctx.TILE); c <= Math.floor(rr / ctx.TILE); c++) {
          if (solid(ctx, c, r)) { e.y = r * ctx.TILE - e.h - 0.01; e.vy = 0; e.onGround = true; break; }
        }
      } else {
        const r = Math.floor(e.y / ctx.TILE);
        let best = -1, bestD = 1e9;
        for (let c = Math.floor(l / ctx.TILE); c <= Math.floor(rr / ctx.TILE); c++) {
          if (solid(ctx, c, r)) { const dd = Math.abs(c * ctx.TILE + ctx.TILE / 2 - (e.x + e.w / 2)); if (dd < bestD) { bestD = dd; best = c; } }
        }
        if (best >= 0) { e.y = (r + 1) * ctx.TILE + 0.01; e.vy = 0; if (isPlayer) headHit(ctx, best, r); }
      }
    } else {
      e.y += e.vy;
    }
  }

  function headHit(ctx, c, r) {
    const t = ctx.grid[r][c];
    if (t === 3) {
      ctx.grid[r][c] = 4;
      ctx.bounceAnims.set(c + ',' + r, 12);
      const key = c + ',' + r;
      if (ctx.mushSet.has(key)) {
        ctx.mushSet.delete(key);
        spawnMush(ctx, c, r);
        AudioSys.sfx('mush');
      } else {
        spawnCoinPop(ctx, c, r);
        AudioSys.sfx('coin');
        const g = RPG.randInt(5, 15) + ctx.def().mlvl * 2;
        ctx.hero.gold += g; addFloat(ctx, c * ctx.TILE + 10, r * ctx.TILE - 8, '+' + g + 'G', '#ffd23e');
      }
      bumpKill(ctx, c, r);
    } else if (t === 2) {
      ctx.grid[r][c] = 0;
      shards(ctx, c, r);
      AudioSys.sfx('break');
      addFloat(ctx, c * ctx.TILE + 8, r * ctx.TILE - 6, '+10G', '#ffd23e'); ctx.hero.gold += 10;
      ctx.shakeT = 6;
      bumpKill(ctx, c, r);
    } else if (t === 1 || t === 4 || (t >= 5 && t <= 8)) {
      AudioSys.sfx('bump');
    }
  }

  function bumpKill(ctx, c, r) {
    for (const e of ctx.enemies) {
      if (!e.dead && Math.abs(e.y + e.h - r * ctx.TILE) < 8 && e.x + e.w > c * ctx.TILE && e.x < c * ctx.TILE + ctx.TILE) {
        dealDamage(ctx, e, 2.5, { dir: 0, leech: false });
      }
    }
  }

  // ===== 헬퍼 (ctx 기반) =====
  function spawnMush(ctx, c, r) {
    const h = 33;
    ctx.items.push({ type: 'mush', c, r, w: 34, h, x: c * ctx.TILE + 7, startY: r * ctx.TILE - 2, endY: r * ctx.TILE - h, y: r * ctx.TILE - 2, emerge: 32, vx: 0, vy: 0, dead: false });
  }
  function spawnCoinPop(ctx, c, r) {
    ctx.items.push({ type: 'coinpop', x: c * ctx.TILE + 10, y: r * ctx.TILE - 34, vy: -10, t: 0, ph: 0 });
  }

  function addFloat(ctx, x, y, txt, color, size) {
    if (ctx.floats.length >= ctx.MAX_FLOATS) return;
    const f = ctx.acquireFloat();
    f.x = x; f.y = y;
    f.txt = txt;
    f.color = color || '#ffffff';
    f.size = size || 10;
    f.t = 0; f.vy = -0.9;
    ctx.floats.push(f);
  }

  function shards(ctx, c, r) {
    const x = c * ctx.TILE + ctx.TILE / 2, y = r * ctx.TILE + ctx.TILE / 2;
    const offsets = [[-2.4, -8], [2.4, -8], [-3.2, -11], [3.2, -11]];
    for (let i = 0; i < offsets.length; i++) {
      if (ctx.parts.length >= ctx.MAX_PARTICLES) break;
      const p = ctx.acquirePart();
      const ox = offsets[i][0], oy = offsets[i][1];
      p.x = x + ox * 3; p.y = y + 6;
      p.vx = ox; p.vy = oy;
      p.g = 0.5;
      p.life = 60; p.max = 60;
      p.color = '#c65d21'; p.sz = 11;
      p.brick = true;
      ctx.parts.push(p);
    }
  }

  // ===== 플레이어 업데이트 =====
  function updatePlayer(ctx) {
    ctx.player.prevBottom = ctx.player.y + ctx.player.h;
    const moveBonus = 1 + ctx.HS.moveSpd / 100;
    const dir = (ctx.input.right ? 1 : 0) - (ctx.input.left ? 1 : 0);
    const max = (ctx.input.run ? ctx.RUN : ctx.WALK) * moveBonus;
    let skid = false;
    if (dir !== 0) {
      ctx.player.face = dir;
      if (ctx.player.onGround && Math.sign(ctx.player.vx) !== dir && Math.abs(ctx.player.vx) > 2.2) { skid = true; ctx.player.vx += dir * ctx.ACC * 2; }
      else { ctx.player.vx += dir * (ctx.player.onGround ? ctx.ACC : ctx.AIRACC); if (Math.abs(ctx.player.vx) > max && Math.sign(ctx.player.vx) === dir) ctx.player.vx = dir * max; }
    } else if (ctx.player.onGround) {
      if (Math.abs(ctx.player.vx) <= ctx.FRIC) ctx.player.vx = 0; else ctx.player.vx -= Math.sign(ctx.player.vx) * ctx.FRIC;
    }
    if (skid && ctx.step % 4 === 0) dust(ctx, ctx.player.x + ctx.player.w / 2, ctx.player.y + ctx.player.h, 2);

    if (ctx.jumpBuf > 0) ctx.jumpBuf--;
    if (ctx.player.onGround) ctx.player.coyote = 7; else if (ctx.player.coyote > 0) ctx.player.coyote--;
    if (ctx.jumpBuf > 0 && ctx.player.coyote > 0) {
      ctx.player.vy = ctx.JUMPV; ctx.player.coyote = 0; ctx.jumpBuf = 0; ctx.player.onGround = false;
      AudioSys.sfx('jump'); dust(ctx, ctx.player.x + ctx.player.w / 2, ctx.player.y + ctx.player.h, 4);
    }
    if (!ctx.input.jump && ctx.player.vy < -5) ctx.player.vy += ctx.GRAV * 2.2;

    const wasAir = !ctx.player.onGround, fallV = ctx.player.vy;
    physMove(ctx, ctx.player, true);
    if (ctx.player.onGround && wasAir && fallV > 9) { ctx.player.landT = 8; dust(ctx, ctx.player.x + ctx.player.w / 2, ctx.player.y + ctx.player.h, 6); }
    if (ctx.player.landT > 0) ctx.player.landT--;
    if (ctx.player.inv > 0) ctx.player.inv--;
    if (ctx.player.hitCD > 0) ctx.player.hitCD--;
    if (ctx.player.atkCD > 0) ctx.player.atkCD--;
    if (ctx.player.attackT > 0) ctx.player.attackT--;
    if (ctx.player.heavyCD > 0) ctx.player.heavyCD--;
    if (ctx.player.heavyT > 0) ctx.player.heavyT--;
    if (ctx.player.spellCD > 0) ctx.player.spellCD--;
    if (ctx.player.comboTimer > 0) { ctx.player.comboTimer--; if (ctx.player.comboTimer === 0) ctx.player.comboCount = 0; }
    if (ctx.player.levelMsg > 0) ctx.player.levelMsg--;
    if (ctx.player.hp <= 0 && ctx.state === GameFlow.STATE.PLAYING) { die(ctx); return; }

    if (ctx.player.x < ctx.camX) { ctx.player.x = ctx.camX; if (ctx.player.vx < 0) ctx.player.vx = 0; }
    if (ctx.player.x > ctx.LevelData.W * ctx.TILE - ctx.player.w) ctx.player.x = ctx.LevelData.W * ctx.TILE - ctx.player.w;
    if (ctx.player.y > ctx.VIEW_H + 60) { hurtPlayer(ctx, 9999); return; }

    // HP/MP 리젠 (느림)
    if (ctx.step % 30 === 0) {
      ctx.player.hp = Math.min(ctx.HS.maxHp, ctx.player.hp + 1);
      if (ctx.step % 60 === 0) ctx.player.mp = Math.min(ctx.HS.maxMp, ctx.player.mp + 1);
    }

    // 슬래시 지속중 재히트 (콤보 단계 히트박스)
    if (ctx.player.attackT > 6) {
      const hb = comboHitbox(ctx, ctx.player.attackStage);
      for (const e of ctx.enemies) {
        if (!e.dead && ctx.overlap(hb, e) && !ctx.player.attackHits.has(e)) { ctx.player.attackHits.add(e); dealDamage(ctx, e, ctx.COMBO_MULT[ctx.player.attackStage] * 0.5, { dir: ctx.player.face }); }
      }
    }

    // 코인/아이템 습득
    for (const cn of ctx.coinEnts) {
      if (!cn.dead && ctx.overlap(ctx.player, cn)) { cn.dead = true; AudioSys.sfx('coin'); collectCoin(ctx, cn.x, cn.y); }
    }
    for (const it of ctx.items) {
      if (it.type === 'mush' && it.emerge <= 0 && !it.dead && ctx.overlap(ctx.player, it)) { it.dead = true; collectMush(ctx); }
    }
    for (const d of ctx.groundDrops) {
      if (!d.picked && ctx.overlap(ctx.player, { x: d.x, y: d.y, w: 24, h: 24 })) {
        if (ctx.hero.backpack.length < ctx.INV_CAP) {
          ctx.hero.backpack.push(d.item); d.picked = true; AudioSys.sfx('itempick');
          addFloat(ctx, ctx.player.x, ctx.player.y - 24, d.item.label, d.item.color);
          ctx.buildInv();
        } else {
          addFloat(ctx, ctx.player.x, ctx.player.y - 24, '인벤토리 가득', '#ff5040');
        }
      }
    }
    ctx.compact(ctx.groundDrops, d => !d.picked && d.life > 0);

    // 상자 접촉 열기
    for (const c of ctx.chests) {
      if (!c.opened && ctx.overlap(ctx.player, c)) openChest(ctx, c);
    }

    // 깃발
    const poleX = ctx.def().flag * ctx.TILE + ctx.TILE / 2;
    if (!ctx.flagPhase && ctx.player.x + ctx.player.w >= poleX - 4 && (!ctx.levelBoss || ctx.levelBoss.dead)) startFlag(ctx);
  }

  // ===== 적 업데이트 =====
  function updateEnemies(ctx) {
    const STATUS = BALANCE.STATUS;
    for (const e of ctx.enemies) {
      if (e.dead) { e.vy = Math.min(e.vy + ctx.GRAV, ctx.MAXFALL); e.y += e.vy; continue; }
      if (e.hitFlash > 0) e.hitFlash--;
      if (e.atkCD > 0) e.atkCD--;
      // 상태이상 틱: STATUS.ORDER 기반 순회 감소 + burn 도트
      for (const st of STATUS.ORDER) {
        if (e[st.key] > 0) {
          e[st.key]--;
          if (st.key === 'burn' && e.burn % STATUS.burn.tickEvery === 0) {
            e.hp -= e.burnDmg;
            burnParticle(ctx, e);
            addFloat(ctx, e.x + e.w / 2, e.y - 4, String(e.burnDmg), '#ff8a3a', 9);
            AudioSys.sfx('burn');
            if (e.hp <= 0) { killEnemy(ctx, e); continue; }
          }
        }
      }
      if (!e.active) { if (e.x < ctx.camX + ctx.VIEW_W + 96) e.active = true; else continue; }
      e.animT++;
      const pcx = ctx.player.x + ctx.player.w / 2, pcy = ctx.player.y + ctx.player.h / 2;
      const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
      const d = Math.abs(ecx - pcx);
      const see = d < e.sight && Math.abs(ecy - pcy) < 240;
      if (see) e.aggro = true;

      const slow = e.chill > 0 ? STATUS.chill.slow : 1;
      let moveType = null;
      for (const st of STATUS.ORDER) { if (st.move && e[st.key] > 0) { moveType = st.move; break; } }
      if (moveType === 'freeze') { e.vx = 0; e.vy = 0; }
      else if (moveType === 'stun') { e.vx = 0; if (!e.fly) physMove(ctx, e, false); }
      else if (e.fly) {
        e.hover += 0.1;
        const tx = pcx - ecx, ty = pcy - ecy;
        const m = Math.hypot(tx, ty) || 1;
        const sp = e.speed * 1.4 * slow;
        e.vx = (tx / m) * sp;
        e.vy = (ty / m) * sp + Math.sin(e.hover) * 0.6;
        e.face = e.vx < 0 ? -1 : 1;
        e.x += e.vx; e.y += e.vy;
      } else {
        if (e.aggro) {
          const dir = pcx > ecx ? 1 : -1;
          e.face = dir;
          e.vx = dir * e.speed * 1.5 * slow;
        } else {
          e.vx = e.face * e.speed * 0.6 * slow;
        }
        physMove(ctx, e, false);
        if (e.y > ctx.VIEW_H + 80) { e.remove = true; continue; }
      }

      // 접촉: 밟기 우선, 아니면 피해
      if (ctx.state === GameFlow.STATE.PLAYING && ctx.overlap(ctx.player, e)) {
        const stomp = ctx.player.vy > 0 && ctx.player.prevBottom <= e.y + 10;
        if (stomp) {
          dealDamage(ctx, e, 0.6, { dir: 0, leech: false });
          ctx.player.vy = ctx.input.jump ? -12.5 : -8.5;
          AudioSys.sfx('stomp');
        } else if (ctx.player.hitCD <= 0) {
          hurtPlayer(ctx, RPG.randInt(e.dmg[0], e.dmg[1]), e);
        }
      }
    }
    ctx.compact(ctx.enemies, e => !e.remove);
  }

  function updateItems(ctx) {
    for (const it of ctx.items) {
      if (it.type === 'coinpop') { it.vy += 0.55; it.y += it.vy; it.t++; it.ph += 0.3; if (it.t > 32) it.remove = true; }
      else if (it.type === 'mush') {
        if (it.emerge > 0) { it.emerge--; const p = 1 - it.emerge / 32; it.y = it.startY + (it.endY - it.startY) * p; }
        else { if (it.vx === 0) it.vx = 1.5; physMove(ctx, it, false); if (it.y > ctx.VIEW_H + 60) it.remove = true; }
      }
    }
    ctx.compact(ctx.items, it => !it.remove && !it.dead);
  }

  function updateProjectiles(ctx) {
    for (const p of ctx.projectiles) {
      p.life--; p.x += p.vx;
      const c = Math.floor((p.x) / ctx.TILE), r = Math.floor((p.y) / ctx.TILE);
      if (solid(ctx, c, r)) {
        if (p.kind === 'ice') shatterIce(ctx, p); else explodeFireball(ctx, p);
        p.life = 0; continue;
      }
      for (const e of ctx.enemies) {
        if (!e.dead && !p.hit.has(e) && ctx.overlap({ x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 }, e)) {
          if (p.kind === 'ice') {
            p.hit.add(e);
            applyDamage(ctx, e, p.dmg, p.crit, { element: 'cold', proc: false, status: true, dir: Math.sign(p.vx) || 1, leech: false });
            burst(ctx, e.x + e.w / 2, e.y + e.h / 2, 6, '#6fd8ff');
            if (--p.pierce <= 0) { shatterIce(ctx, p); p.life = 0; break; }
          } else {
            p.hit.add(e);
            applyDamage(ctx, e, p.dmg, p.crit, { element: 'fire', proc: false, status: true, dir: Math.sign(p.vx) || 1, leech: false });
            explodeFireball(ctx, p); p.life = 0; break;
          }
        }
      }
    }
    ctx.compact(ctx.projectiles, p => p.life > 0 && p.x > ctx.camX - 40 && p.x < ctx.camX + ctx.VIEW_W + 40);
  }

  function updateDrops(ctx) {
    for (const d of ctx.groundDrops) {
      d.life--; d.bob += 0.1;
      d.vy += ctx.GRAV * 0.8; d.y += d.vy; d.x += d.vx; d.vx *= 0.92;
      if (d.vy > 0) {
        const r = Math.floor((d.y + 24) / ctx.TILE);
        const c = Math.floor((d.x + 12) / ctx.TILE);
        if (solid(ctx, c, r)) { d.y = r * ctx.TILE - 24 - 0.01; d.vy = 0; }
      }
    }
  }

  function updateFx(ctx) {
    for (const p of ctx.parts) { p.vy += p.g; p.x += p.vx; p.y += p.vy; p.life--; }
    let w = 0;
    for (let i = 0; i < ctx.parts.length; i++) {
      if (ctx.parts[i].life > 0) ctx.parts[w++] = ctx.parts[i];
      else ctx.release(ctx.partPool, ctx.parts[i]);
    }
    ctx.parts.length = w;
    for (const f of ctx.floats) { f.y += f.vy; f.vy *= 0.96; f.t++; }
    let fw = 0;
    for (let i = 0; i < ctx.floats.length; i++) {
      if (ctx.floats[i].t < 60) ctx.floats[fw++] = ctx.floats[i];
      else ctx.release(ctx.floatPool, ctx.floats[i]);
    }
    ctx.floats.length = fw;
    for (const [k, t] of ctx.bounceAnims) { if (t <= 1) ctx.bounceAnims.delete(k); else ctx.bounceAnims.set(k, t - 1); }
    for (const cn of ctx.coinEnts) cn.ph += 0.12;
    for (const c of ctx.chests) c.bob += 0.08;
    for (const e of ctx.effects) {
      e.life--;
      if (e.type === 'shock') e.r += (e.maxR - e.r) * 0.22;
    }
    let ew = 0;
    for (let i = 0; i < ctx.effects.length; i++) {
      if (ctx.effects[i].life > 0) ctx.effects[ew++] = ctx.effects[i];
      else ctx.release(ctx.effectPool, ctx.effects[i]);
    }
    ctx.effects.length = ew;
    if (ctx.comboFlashT > 0) ctx.comboFlashT--;
    if (ctx.shakeMag > 0 && ctx.shakeT > 0) ctx.shakeMag *= 0.9;
  }

  // ===== 카메라 =====
  function updateCamera(ctx) {
    if (ctx.state === GameFlow.STATE.TITLE) { const max = ctx.LevelData.W * ctx.TILE - ctx.VIEW_W; ctx.camX = (Math.sin(ctx.step * 0.003) * 0.5 + 0.5) * max * 0.5; return; }
    ctx.camX = ctx.clamp(ctx.player.x + ctx.player.w / 2 - ctx.VIEW_W * 0.4, ctx.camLock, ctx.LevelData.W * ctx.TILE - ctx.VIEW_W);
    ctx.camLock = Math.max(ctx.camLock, ctx.camX);
    if (ctx.camX < 0) ctx.camX = 0;
  }

  // ===== 틱 (오케스트레이터) =====
  function tick(ctx) {
    ctx.step++;
    if (ctx.state === GameFlow.STATE.PLAYING) {
      updatePlayer(ctx);
      if (ctx.state === GameFlow.STATE.PLAYING) { updateEnemies(ctx); updateItems(ctx); updateProjectiles(ctx); updateDrops(ctx); }
      updateCamera(ctx);
    } else if (ctx.state === GameFlow.STATE.TITLE) { updateEnemies(ctx); updateCamera(ctx); }
    else if (ctx.state === GameFlow.STATE.DYING) {
      ctx.deathT++;
      if (ctx.deathT > 25) {
        ctx.player.vy = Math.min(ctx.player.vy + ctx.GRAV * 0.8, ctx.MAXFALL); ctx.player.y += ctx.player.vy;
        if (ctx.player.y > ctx.VIEW_H + 120) {
          ctx.recompute(); ctx.player.hp = ctx.HS.maxHp; ctx.player.mp = ctx.HS.maxMp;
          ctx.loadLevel(ctx.levelIdx); ctx.state = GameFlow.STATE.PLAYING; AudioSys.musicStart(ctx.def().bgm);
        }
      }
    } else if (ctx.state === GameFlow.STATE.FLAG) updateFlag(ctx);
    updateFx(ctx);
  }

  // ===== 깃발 시퀀스 =====
  function updateFlag(ctx) {
    ctx.flagT++;
    const baseY = 11 * ctx.TILE - ctx.player.h;
    if (ctx.flagPhase === 'slide') {
      ctx.player.y = Math.min(ctx.player.y + 3.2, baseY);
      ctx.flagY = Math.min(ctx.flagY + 3.2, 9 * ctx.TILE - 8);
      if (ctx.player.y >= baseY && ctx.flagY >= 9 * ctx.TILE - 8) { ctx.flagPhase = 'walk'; ctx.player.face = 1; }
    } else if (ctx.flagPhase === 'walk') {
      ctx.player.vx = ctx.WALK * 0.9; physMove(ctx, ctx.player, true);
      const doorX = ctx.def().castle * ctx.TILE + ctx.TILE * 2.5 - ctx.player.w / 2;
      if (ctx.player.x >= doorX) { ctx.flagPhase = 'done'; ctx.flagT = 0; }
    } else if (ctx.flagT > 30) {
      const reward = 200 + ctx.def().mlvl * 120;
      ctx.hero.gold += reward;
      ctx.$('clear-bonus').textContent = reward;
      ctx.$('clear-score').textContent = ctx.pad(ctx.hero.gold);
      ctx.state = GameFlow.STATE.CLEAR; ctx.showOverlay('clear');
      ctx.buildInv();
    }
  }

  // ===== 게임 액션 (ctx를 통해 상태 접근) =====
  function dust(ctx, x, y, n) {
    for (let i = 0; i < n; i++) {
      if (ctx.parts.length >= ctx.MAX_PARTICLES) break;
      const p = ctx.acquirePart();
      p.x = x + (Math.random() * 16 - 8);
      p.y = y - Math.random() * 6;
      p.vx = Math.random() * 2 - 1;
      p.vy = -Math.random() * 1.6;
      p.g = 0.06;
      p.life = 22; p.max = 22;
      p.color = '#e8e8e8'; p.sz = 4;
      ctx.parts.push(p);
    }
  }

  function sparkle(ctx, x, y) {
    for (let i = 0; i < 9; i++) {
      if (ctx.parts.length >= ctx.MAX_PARTICLES) break;
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.6;
      const p = ctx.acquirePart();
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 1;
      p.g = 0.12;
      p.life = 28; p.max = 28;
      p.color = i % 2 ? '#ffd23e' : '#ffffff'; p.sz = 3;
      ctx.parts.push(p);
    }
  }

  function burst(ctx, x, y, n, color) {
    for (let i = 0; i < n; i++) {
      if (ctx.parts.length >= ctx.MAX_PARTICLES) break;
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
      const p = ctx.acquirePart();
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 2;
      p.g = 0.18;
      p.life = 34; p.max = 34;
      p.color = color; p.sz = 4;
      ctx.parts.push(p);
    }
  }

  function burnParticle(ctx, e) {
    if (ctx.parts.length >= ctx.MAX_PARTICLES) return;
    const p = ctx.acquirePart();
    p.x = e.x + e.w / 2 + (Math.random() * e.w - e.w / 2);
    p.y = e.y + Math.random() * e.h;
    p.vx = (Math.random() * 1 - 0.5);
    p.vy = -1 - Math.random();
    p.g = -0.04;
    p.life = 18; p.max = 18;
    p.color = Math.random() < 0.5 ? '#ff8a3a' : '#ffd23e';
    p.sz = 3;
    ctx.parts.push(p);
  }

  function collectCoin(ctx, x, y) {
    const g = RPG.randInt(3, 8) + ctx.def().mlvl;
    ctx.hero.gold += g;
    addFloat(ctx, x, y, '+' + g + 'G', '#ffd23e');
    sparkle(ctx, x + 10, y + 16);
  }

  function collectMush(ctx) {
    AudioSys.sfx('powerup');
    const heal = Math.floor(ctx.HS.maxHp * 0.35);
    ctx.player.hp = Math.min(ctx.HS.maxHp, ctx.player.hp + heal);
    addFloat(ctx, ctx.player.x, ctx.player.y - 18, '+' + heal + ' HP', '#5dff7a');
  }

  function comboHitbox(ctx, stage) {
    const f = ctx.player.face, y = ctx.player.y - 6, h = ctx.player.h + 12;
    if (stage === 0) return { x: f > 0 ? ctx.player.x + ctx.player.w - 6 : ctx.player.x - 54, y, w: 60, h };
    if (stage === 1) return { x: f > 0 ? ctx.player.x + ctx.player.w - 8 : ctx.player.x - 52, y: y - 12, w: 56, h: h + 18 };
    return { x: f > 0 ? ctx.player.x + ctx.player.w : ctx.player.x - 66, y: y + 6, w: 66, h: h - 10 };
  }

  function hurtPlayer(ctx, dmg, src) {
    if (ctx.player.inv > 0 || ctx.player.hitCD > 0 || ctx.state !== GameFlow.STATE.PLAYING) return;
    const d = Math.max(1, dmg - Math.floor(ctx.HS.armor * 0.5));
    ctx.player.hp -= d;
    ctx.player.hitCD = 55;
    ctx.player.inv = 55;
    addFloat(ctx, ctx.player.x + ctx.player.w / 2, ctx.player.y - 4, String(d), '#ff5040', 12);
    AudioSys.sfx('hurt');
    ctx.shakeT = 7;
    if (src) { ctx.player.vx = (ctx.player.x < src.x + src.w / 2 ? -1 : 1) * 3; ctx.player.vy = -5; }
    if (ctx.player.hp <= 0) die(ctx);
  }

  function die(ctx) {
    ctx.state = GameFlow.STATE.DYING; ctx.deathT = 0;
    ctx.hero.deaths++;
    const lost = Math.floor(ctx.hero.gold * 0.15);
    ctx.hero.gold -= lost;
    AudioSys.musicStop(); AudioSys.sfx('die');
    ctx.player.vx = 0;
  }

  function gainXP(ctx, n) {
    ctx.hero.xp += n;
    addFloat(ctx, ctx.player.x, ctx.player.y - 30, '+' + n + ' XP', '#b7c7ff');
    while (ctx.hero.xp >= RPG.xpForLevel(ctx.hero.level)) {
      ctx.hero.xp -= RPG.xpForLevel(ctx.hero.level);
      ctx.hero.level++;
      ctx.hero.statPts += RPG.STAT_PER_LEVEL;
      ctx.recompute();
      ctx.player.hp = ctx.HS.maxHp; ctx.player.mp = ctx.HS.maxMp;
      AudioSys.sfx('levelup');
      sparkle(ctx, ctx.player.x + ctx.player.w / 2, ctx.player.y + ctx.player.h / 2);
      addFloat(ctx, ctx.player.x, ctx.player.y - 40, 'LEVEL UP!', '#ffd23e', 14);
      ctx.player.levelMsg = 90;
    }
    ctx.buildInv();
  }

  function startFlag(ctx) {
    ctx.flagPhase = 'slide'; ctx.flagT = 0; ctx.state = GameFlow.STATE.FLAG;
    AudioSys.musicStop(); AudioSys.sfx('flag');
    ctx.player.vx = 0; ctx.player.vy = 0;
    ctx.player.x = ctx.def().flag * ctx.TILE + ctx.TILE / 2 - ctx.player.w - 5;
  }

  function dealDamage(ctx, e, mult, opts) {
    if (e.dead) return;
    const r = damageRoll(ctx, mult, ctx.damageRollResult);
    const element = r.element;
    const dmg = r.dmg;
    const crit = r.crit;
    applyDamage(ctx, e, dmg, crit, Object.assign({ element }, opts));
  }

  function damageRoll(ctx, mult, result) {
    const rolled = GameCombat.damageRoll(ctx.HS, mult);
    result = result || rolled;
    result.dmg = rolled.dmg; result.crit = rolled.crit; result.element = rolled.element;
    return result;
  }

  function applyDamage(ctx, e, dmg, crit, opts) {
    if (e.dead || dmg <= 0) return;
    opts = opts || {};
    e.hp -= dmg;
    e.hitFlash = 6;
    e.kb = (opts.dir !== undefined ? opts.dir : ctx.player.face) * 3.5;
    e.aggro = true;
    if (e.boss && !ctx.bossEnraged && e.hp < e.maxhp * 0.5) {
      ctx.bossEnraged = true; e.speed = e.def.speed * 1.5; AudioSys.sfx('enrage');
      addFloat(ctx, e.x, e.y - 14, '분노!', '#ff4040');
    }
    if (opts.leech !== false && ctx.HS.leech > 0) {
      const heal = Math.floor(dmg * ctx.HS.leech / 100);
      if (heal) ctx.player.hp = Math.min(ctx.HS.maxHp, ctx.player.hp + heal);
    }
    const el = opts.element || null;
    addFloat(ctx, e.x + e.w / 2, e.y - 4, String(dmg), GameCombat.colorOf(el, crit), crit ? 16 : 11);
    hitParticles(ctx, e, el, crit);
    AudioSys.sfx(crit ? 'crithit' : 'hit');
    if (opts.status !== false) GameCombat.applyStatus(e, el, ctx.HS);
    if (opts.proc !== false) rollProcs(ctx, e);
    if (e.hp <= 0) killEnemy(ctx, e);
  }

  function hitParticles(ctx, e, el, crit) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const col = GameCombat.ELEM_COLOR[el] || (crit ? '#ffd23e' : '#ffffff');
    burst(ctx, cx, cy, crit ? 14 : 9, col);
    pushEffect(ctx, 'flash', { x: cx, y: cy, r: 12, maxR: 12, life: 6, maxLife: 6, color: col });
  }

  function pushEffect(ctx, type, opts) {
    if (ctx.effects.length >= ctx.MAX_EFFECTS) return;
    const e = ctx.acquireEffect();
    e.type = type;
    e.x = opts.x || 0; e.y = opts.y || 0;
    e.r = opts.r || 0; e.maxR = opts.maxR != null ? opts.maxR : (opts.r || 0);
    e.color = opts.color || '#ffffff';
    e.x1 = opts.x1 || 0; e.y1 = opts.y1 || 0;
    e.x2 = opts.x2 || 0; e.y2 = opts.y2 || 0;
    e.stage = opts.stage || 0; e.face = opts.face || 1; e.element = opts.element || null;
    e.life = opts.life; e.maxLife = opts.maxLife;
    ctx.effects.push(e);
  }

  function rollProcs(ctx, e) {
    if (e.dead) return;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    if (ctx.HS.procFire && Math.random() * 100 < ctx.HS.procFire) {
      pushEffect(ctx, 'flash', { x: cx, y: cy, r: 16, maxR: 16, life: 10, maxLife: 10, color: '#ff8a3a' });
      burst(ctx, cx, cy, 8, '#ff8a3a'); AudioSys.sfx('burn');
      const r = damageRoll(ctx, 0.5);
      applyDamage(ctx, e, r.dmg, r.crit, { element: 'fire', proc: false, status: true, dir: ctx.player.face });
    }
    if (ctx.HS.procFrost && Math.random() * 100 < ctx.HS.procFrost) {
      burst(ctx, cx, cy, 8, '#6fd8ff'); AudioSys.sfx('ice'); GameCombat.applyStatus(e, 'cold', ctx.HS);
    }
    if (ctx.HS.procChain && Math.random() * 100 < ctx.HS.procChain) chainLightning(ctx, cx, cy, e);
  }

  function chainLightning(ctx, x, y, srcE) {
    AudioSys.sfx('bolt');
    let cx = x, cy = y, cnt = 0;
    const cand = ctx.enemies.filter(e => !e.dead && e !== srcE && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < 230);
    cand.sort((a, b) => Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) - Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy));
    for (const e of cand) {
      if (cnt >= 4) break;
      const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
      pushEffect(ctx, 'bolt', { x1: cx, y1: cy, x2: ex, y2: ey, life: 14, maxLife: 14, color: '#ffe066' });
      const r = damageRoll(ctx, 0.7);
      applyDamage(ctx, e, r.dmg, r.crit, { element: 'light', proc: false, status: true, dir: Math.sign(ex - cx) || 1 });
      burst(ctx, ex, ey, 8, '#ffe066');
      cx = ex; cy = ey; cnt++;
    }
  }

  function killEnemy(ctx, e) {
    e.dead = true; e.remove = true;
    burst(ctx, e.x + e.w / 2, e.y + e.h / 2, e.boss ? 40 : 14, eColor(ctx, e));
    gainXP(ctx, e.xp);
    const drop = RPG.rollDrop(e.def, ctx.def().mlvl);
    ctx.hero.gold += drop.gold;
    addFloat(ctx, e.x + e.w / 2, e.y - 18, '+' + drop.gold + 'G', '#ffd23e');
    for (const it of drop.items) spawnItemDrop(ctx, e.x + e.w / 2, e.y, it);
    for (const p of drop.potions) {
      if (p.kind === 'hp') ctx.hero.pots.hp++; else ctx.hero.pots.mp++;
      addFloat(ctx, e.x, e.y - 32, p.name + ' 획득', '#9fe0ff');
    }
    AudioSys.sfx('enemydie');
    ctx.buildInv();
    if (e.boss) onBossDead(ctx);
  }

  function spawnItemDrop(ctx, x, y, item) {
    ctx.groundDrops.push({ x: x - 12, y: y - 20, vx: (Math.random() * 2 - 1) * 3, vy: -7, item, life: 3600, bob: Math.random() * 6, picked: false });
  }

  function onBossDead(ctx) {
    ctx.shakeT = 16;
    addFloat(ctx, ctx.levelBoss.x, ctx.levelBoss.y - 20, '보스 처치!', '#ffd23e');
    AudioSys.sfx('flag');
    ctx.buildInv();
  }

  function openChest(ctx, c) {
    c.opened = true;
    AudioSys.sfx('itemdrop');
    const mlvl = ctx.def().mlvl;
    const n = c.rarity === 'epic' ? 3 : (c.rarity === 'rare' ? 2 : 1);
    for (let i = 0; i < n; i++) {
      spawnItemDrop(ctx, c.x + 16, c.y, RPG.rollItem(mlvl, { rarity: i === 0 ? c.rarity : undefined }));
    }
    const g = RPG.randInt(40, 120) + mlvl * 10;
    ctx.hero.gold += g;
    addFloat(ctx, c.x, c.y - 10, '+' + g + 'G', '#ffd23e');
    sparkle(ctx, c.x + 16, c.y);
    ctx.buildInv();
  }

  function eColor(ctx, e) {
    return e.def.color || '#aaa';
  }

  function shatterIce(ctx, p) {
    burst(ctx, p.x, p.y, 14, '#6fd8ff');
    pushEffect(ctx, 'flash', { x: p.x, y: p.y, r: 14, maxR: 14, life: 8, maxLife: 8, color: '#bff0ff' });
    AudioSys.sfx('freeze');
  }

  function explodeFireball(ctx, p) {
    burst(ctx, p.x, p.y, 20, '#ff8a3a');
    pushEffect(ctx, 'shock', { x: p.x, y: p.y, r: 8, maxR: 66, life: 16, maxLife: 16, color: '#ff8a3a' });
    AudioSys.sfx('explode'); ctx.shakeT = 6; ctx.shakeMag = 4;
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const dd = Math.hypot(e.x + e.w / 2 - p.x, e.y + e.h / 2 - p.y);
      if (dd < 70 && !p.hit.has(e)) {
        p.hit.add(e);
        const r = damageRoll(ctx, 0.6);
        applyDamage(ctx, e, r.dmg, r.crit, { element: 'fire', proc: false, status: true, dir: Math.sign((e.x + e.w / 2) - p.x) || 1 });
      }
    }
  }

  return {
    solid, physMove, headHit, bumpKill,
    updatePlayer, updateEnemies, updateItems, updateProjectiles, updateDrops, updateFx, updateCamera,
    tick, updateFlag,
    dust, sparkle, burst, burnParticle, shards, addFloat, pushEffect,
    collectCoin, collectMush, comboHitbox, hurtPlayer, die, gainXP, startFlag,
    dealDamage, damageRoll, applyDamage, hitParticles, rollProcs, chainLightning,
    killEnemy, spawnItemDrop, onBossDead, openChest, eColor,
    shatterIce, explodeFireball,
  };
})();