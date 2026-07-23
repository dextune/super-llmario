'use strict';

/* 인벤토리 UI 모듈 — Phase 1-3 (ui.js 추출)
 *
 * game.js의 DOM 기반 인벤토리/툴팁/능력치 표시 로직을 분리.
 * 순수 DOM 빌더 함수들 + buildInv(상태, 콜백) 진입점.
 *
 * buildInv는 hero, HS, state, DOM refs, RPG 상수, 그리고
 * 액션 콜백(equipFromBackpack, unequip, allocStat, usePotion)을
 * 인자로 받아 완전한 인벤토리 UI를 렌더링한다.
 *
 * 외부 의존: RPG (SLOT_NAMES, RARITY, BASE, STAT_ORDER, STAT_NAMES, SLOTS, xpForLevel, STAT_PER_LEVEL)
 * 브라우저 전역 GameUI로 노출.
 */

const GameUI = (() => {
  const SLOT_GLYPH = { weapon: '⚔', armor: '🛡', helm: '⛑', shield: '▣', boots: '🥾', gloves: '✋', belt: '━', amulet: '◉', ring: '◯' };

  function slotGlyph(slot) {
    return SLOT_GLYPH[slot] || '·';
  }

  function shortLabel(it) {
    return it.label.length > 9 ? it.label.slice(0, 8) + '…' : it.label;
  }

  function stripHtml(s) {
    const d = document.createElement('div'); d.innerHTML = s; return d.textContent;
  }

  function itemTip(it) {
    if (!it) return '(비어있음)';
    let s = '<b style="color:' + it.color + '">' + it.label + '</b><br>';
    s += '<span class="t-dim">' + RPG.SLOT_NAMES[it.slot] + ' · ' + RPG.RARITY[it.rarity].name + ' · ilvl ' + it.ilvl + '</span><br>';
    if (it.dmg) s += '<span class="t-red">피해 ' + it.dmg[0] + '-' + it.dmg[1] + '</span><br>';
    if (it.armor) s += '<span class="t-blue">방어 ' + it.armor + '</span><br>';
    if (it.req) s += '<span class="t-dim">요구 힘 ' + it.req + '</span><br>';
    const lines = [];
    if (it.str) lines.push('힘 +' + it.str);
    if (it.dex) lines.push('민첩 +' + it.dex);
    if (it.vit) lines.push('활력 +' + it.vit);
    if (it.enr) lines.push('에너지 +' + it.enr);
    if (it.maxHp) lines.push('최대생명 +' + it.maxHp);
    if (it.maxMp) lines.push('최대마나 +' + it.maxMp);
    if (it.dmgPct) lines.push('피해 +' + it.dmgPct + '%');
    if (it.crit) lines.push('치명타 확률 +' + it.crit + '%');
    if (it.leech) lines.push('생명흡수 +' + it.leech + '%');
    if (it.moveSpd) lines.push('이동속도 +' + it.moveSpd + '%');
    if (it.coldDmg && (it.coldDmg[0] || it.coldDmg[1])) lines.push('서리 피해 +' + it.coldDmg[0] + '-' + it.coldDmg[1]);
    if (it.fireDmg && (it.fireDmg[0] || it.fireDmg[1])) lines.push('화염 피해 +' + it.fireDmg[0] + '-' + it.fireDmg[1]);
    if (it.lightDmg && (it.lightDmg[0] || it.lightDmg[1])) lines.push('번개 피해 +' + it.lightDmg[0] + '-' + it.lightDmg[1]);
    if (it.procFire) lines.push('타격시 화염 시전 +' + it.procFire + '%');
    if (it.procFrost) lines.push('타격시 빙결 시전 +' + it.procFrost + '%');
    if (it.procChain) lines.push('타격시 연쇄번개 시전 +' + it.procChain + '%');
    for (const l of lines) s += '<span class="t-affix">' + l + '</span><br>';
    return s;
  }

  function affixLine(a) {
    const map = { str: '힘', dex: '민첩', vit: '활력', enr: '에너지', maxHp: '최대생명', maxMp: '최대마나', dmgPct: '피해 %', crit: '치명타', leech: '생명흡수', moveSpd: '이동속도', armor: '방어', coldDmg: '서리', fireDmg: '화염', lightDmg: '번개', procFire: '화염시전', procFrost: '빙결시전', procChain: '연쇄번개' };
    return (a.name.includes('of') ? a.name + ' ' : '') + '+' + a.val + ' ' + (map[a.stat] || a.stat);
  }

  // buildInv(hero, HS, state, dom, callbacks)
  //   dom: { eq, sp, bp, pots, tip } — DOM 요소 참조
  //   callbacks: { equipFromBackpack, unequip, allocStat, usePotion }
  function buildInv(hero, HS, state, dom, callbacks) {
    const { eq, sp, bp, pots, tip } = dom;
    const INV_CAP = RPG.INV_CAP || 24;
    if (!hero || state !== 'inv') return;

    // 장비 슬롯
    eq.innerHTML = '';
    for (const slot of RPG.SLOTS) {
      const it = hero.equipped[slot];
      const cell = document.createElement('div');
      cell.className = 'cell' + (it ? '' : ' empty');
      cell.dataset.slot = slot;
      if (it) { cell.style.borderColor = it.color; cell.innerHTML = '<span class="slot-glyph">' + slotGlyph(slot) + '</span><span class="cell-label" style="color:' + it.color + '">' + shortLabel(it) + '</span>'; }
      else cell.innerHTML = '<span class="slot-glyph">' + slotGlyph(slot) + '</span><span class="cell-label t-dim">' + RPG.SLOT_NAMES[slot] + '</span>';
      cell.title = it ? stripHtml(itemTip(it)) : RPG.SLOT_NAMES[slot];
      cell.addEventListener('click', () => { if (it) callbacks.unequip(slot); });
      eq.appendChild(cell);
    }

    // 능력치 + 분배
    let sh = '<div class="stat-line"><span>레벨</span><b>' + hero.level + '</b></div>';
    sh += '<div class="stat-line"><span>경험치</span><b>' + hero.xp + '/' + RPG.xpForLevel(hero.level) + '</b></div>';
    sh += '<div class="stat-line"><span>골드</span><b>' + hero.gold + 'G</b></div>';
    sh += '<div class="stat-line"><span>남은 포인트</span><b>' + hero.statPts + '</b></div>';
    sh += '<div class="stat-hr"></div>';
    for (const st of RPG.STAT_ORDER) {
      const val = HS ? (RPG.BASE[st] + hero.alloc[st] + HS.gear[st]) : (RPG.BASE[st] + hero.alloc[st]);
      sh += '<div class="stat-line"><span>' + RPG.STAT_NAMES[st] + '</span><b>' + val + (HS && HS.gear[st] ? ' <i class="t-affix">(+' + HS.gear[st] + ')</i>' : '') + '</b>';
      if (hero.statPts > 0) sh += '<button class="stat-up" data-stat="' + st + '">+</button>';
      sh += '</div>';
    }
    sh += '<div class="stat-hr"></div>';
    if (HS) {
      sh += '<div class="stat-line"><span>최대생명</span><b>' + HS.maxHp + '</b></div>';
      sh += '<div class="stat-line"><span>최대마나</span><b>' + HS.maxMp + '</b></div>';
      sh += '<div class="stat-line"><span>방어</span><b>' + HS.armor + '</b></div>';
      const dmin = HS.weaponDmg[0] + Math.floor(HS.str * 0.8), dmax = HS.weaponDmg[1] + Math.floor(HS.str * 0.8);
      sh += '<div class="stat-line"><span>피해</span><b>' + dmin + '-' + dmax + '</b></div>';
      sh += '<div class="stat-line"><span>치명타</span><b>' + Math.round(HS.crit) + '%</b></div>';
      if (HS.leech) sh += '<div class="stat-line"><span>생명흡수</span><b>' + HS.leech + '%</b></div>';
      if (HS.dmgPct) sh += '<div class="stat-line"><span>피해 보너스</span><b>+' + HS.dmgPct + '%</b></div>';
      if (HS.moveSpd) sh += '<div class="stat-line"><span>이동속도</span><b>+' + HS.moveSpd + '%</b></div>';
    }
    sp.innerHTML = sh;
    sp.querySelectorAll('.stat-up').forEach(b => b.addEventListener('click', () => callbacks.allocStat(b.dataset.stat)));

    // 백팩
    bp.innerHTML = '';
    for (let i = 0; i < INV_CAP; i++) {
      const it = hero.backpack[i];
      const cell = document.createElement('div');
      cell.className = 'cell' + (it ? '' : ' empty');
      if (it) { cell.style.borderColor = it.color; cell.innerHTML = '<span class="cell-label" style="color:' + it.color + '">' + shortLabel(it) + '</span>'; }
      cell.addEventListener('click', () => { if (it) callbacks.equipFromBackpack(i); });
      cell.addEventListener('mouseenter', () => { if (it) tip.innerHTML = itemTip(it); });
      bp.appendChild(cell);
    }

    // 포션
    pots.innerHTML =
      '<div class="pot-row"><span class="pot-hp">HP 물약</span><b>x' + hero.pots.hp + '</b><button data-p="hp">사용(Q)</button></div>' +
      '<div class="pot-row"><span class="pot-mp">MP 물약</span><b>x' + hero.pots.mp + '</b><button data-p="mp">사용</button></div>';
    pots.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { callbacks.usePotion(b.dataset.p); }));
  }

  return { buildInv, itemTip, affixLine, slotGlyph, shortLabel, stripHtml, SLOT_GLYPH };
})();
