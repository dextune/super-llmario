# 구현 가이드 — 코드 레벨 설계

> 이 문서는 4가지 미친 기능의 **정확한 코드 변경 사항**을 정의한다.

---

## 파일 구조

```
js/
├── core.parts/
│   ├── 01.part    ← 무기/상수 (FUSED_WEAPONS, VEHICLES 추가)
│   ├── 02.part    ← 적/보스/스테이지 (SURVIVAL_WAVES 추가)
│   └── 03.part    ← 점수/세이브 (survival 기록 추가)
├── game.parts/
│   ├── 01.part    ← 입력/상태 (Q/C/W 키, STATE 확장)
│   ├── 02.part    ← 플레이어/투사체 (vehicle/weapon2/chrono/bulletTime)
│   ├── 03.part    ← 적/보스/스테이지 (survival/vehicle pickup/killEnemy 수정)
│   ├── 04.part    ← 렌더링 (vehicle/bulletTime/합성 이펙트)
│   └── 05.part    ← HUD/UI (survival HUD/vehicle 타이머/타이틀 메뉴)
├── overdrive.js       ← 패치 (fusion/vehicle/chrono/survival)
├── overdrive-runtime.js ← RPG 런타임 (합성 로직/크로노/업적 확장)
├── sprites.js         ← 스프라이트 (vehicle/합성 이펙트)
├── audio.js           ← 사운드 (전용 SFX)
└── overdrive-audio.js ← 임팩트 사운드 (전용 SFX)
```

---

## Feature 1: 웨이브 서바이벌

### 1-1. `core.parts/02.part` — SURVIVAL_WAVES 추가

```javascript
var SURVIVAL_WAVES = [
  // W1-3: 튜토리얼
  { enemies: [{type:'grunt',count:6},{type:'rifleman',count:2}], hpMult: 1.0 },
  { enemies: [{type:'grunt',count:8},{type:'rifleman',count:3}], hpMult: 1.0 },
  { enemies: [{type:'grunt',count:8},{type:'rifleman',count:4},{type:'shield',count:1}], hpMult: 1.05 },
  // W4-9: 중급
  { enemies: [{type:'grunt',count:8},{type:'rifleman',count:4},{type:'shield',count:2}], hpMult: 1.1 },
  { enemies: [{type:'grunt',count:10},{type:'rifleman',count:4},{type:'bazooka',count:1}], hpMult: 1.15 },
  // ... (25웨이브 전체 정의)
  // W10: 미니보스
  { enemies: [{type:'tank',count:1},{type:'grunt',count:6}], hpMult: 1.4, miniboss: true },
  // W25: 보스
  { enemies: [{type:'grunt',count:8}], hpMult: 2.2, boss: true },
];
```

### 1-2. `game.parts/03.part` — startSurvival / updateSurvival

```javascript
function startSurvival() {
  world = {
    stage: MS.STAGES[0], stageId: 0,
    width: 1600, // arena 고정
    rng: MS.makeRng('survival:' + Date.now()),
    cameraX: 0, shake: 0, elapsed: 0,
    enemies: [], bullets: [], rockets: [], flames: [], grenades: [],
    particles: [], effects: [], floats: [], pickups: [], barrels: [],
    kills: 0, prisoners: 0, prisonerTotal: 0,
    score: 0, spawnIdx: 0, eventIdx: 0,
    bossSpawned: false, bossKilled: false,
    boss: null, bossWarn: 0, hitFlag: false, finished: false,
    survival: true, wave: 0, waveEnemiesLeft: 0, waveBreak: 3,
    survivalScore: 0,
  };
  player = createPlayer();
  state = STATE.PLAY;
  stateT = 0;
  Audio.musicStart(2);
  toast('SURVIVAL MODE', '#ff5e5e');
}

function updateSurvival(dt) {
  if (!world.survival || world.finished) return;

  // 브레이크 카운트다운
  if (world.waveBreak > 0) {
    world.waveBreak -= dt;
    if (world.waveBreak <= 0) startNextWave();
    return;
  }

  // 웨이브 클리어 체크
  if (world.waveEnemiesLeft <= 0 && world.enemies.every(e => e.dead)) {
    waveClear();
  }
}

function startNextWave() {
  world.wave++;
  var waveIdx = (world.wave - 1) % 25;
  var loopMult = 1 + Math.floor((world.wave - 1) / 25) * 0.5;
  var waveDef = MS.SURVIVAL_WAVES[waveIdx];

  toast('WAVE ' + world.wave, '#ff5e5e');
  Audio.sfx('bosswarn');

  // 적 스폰
  var total = 0;
  for (var i = 0; i < waveDef.enemies.length; i++) {
    var eg = waveDef.enemies[i];
    for (var j = 0; j < eg.count; j++) {
      var sx = 100 + Math.random() * (world.width - 200);
      var e = spawnEnemy(eg.type, sx);
      if (e) {
        e.hp = Math.floor(e.hp * waveDef.hpMult * loopMult);
        e.maxHp = e.hp;
        e.aggro = true;
        world.enemies.push(e);
        total++;
      }
    }
  }

  // 보스/미니보스
  if (waveDef.boss) {
    spawnBoss(waveIdx % 5);
    total++;
  } else if (waveDef.miniboss) {
    // tank/chopper 스폰
  }

  world.waveEnemiesLeft = total;
}

function waveClear() {
  var bonus = world.wave * 200;
  world.survivalScore += bonus;
  world.score += bonus;
  toast('WAVE ' + world.wave + ' CLEAR! +' + bonus, '#74e79a');
  Audio.sfx('levelup');

  // 보급품 투하
  world.pickups.push({ x: world.width * 0.3, y: -20, w: 16, h: 16, type: 'health', amount: 40, vy: 0, life: 15, bob: 0 });
  world.pickups.push({ x: world.width * 0.5, y: -40, w: 16, h: 16, type: 'grenade', count: 5, vy: 0, life: 15, bob: 0 });
  var rw = MS.randomWeaponDrop(world.rng);
  world.pickups.push({ x: world.width * 0.7, y: -60, w: 24, h: 20, weapon: rw, vy: 0, life: 15, bob: 0 });

  world.waveBreak = 5;
}
```

### 1-3. `game.parts/03.part` — killEnemy 수정

```javascript
// killEnemy 내부에 추가:
if (world.survival) {
  world.waveEnemiesLeft = Math.max(0, world.waveEnemiesLeft - 1);
}
```

### 1-4. `game.parts/01.part` — 입력

```javascript
// STATE에 추가:
SURVIVAL_OVER: 'survival_over'

// onKeyDown TITLE 섹션에 추가:
if (c === 'KeyW') { startSurvival(); e.preventDefault(); return; }
```

### 1-5. `game.parts/05.part` — 타이틀 + HUD

```javascript
// drawTitle에 추가:
g.fillStyle = '#5cdbff';
g.fillText('[W] SURVIVAL — 무한 웨이브', VIEW_W / 2, 450);

// drawSurvivalHUD (drawHUD 내부에서 world.survival 체크):
if (world.survival) {
  g.font = '24px "Press Start 2P", monospace';
  g.fillStyle = '#ff5e5e'; g.textAlign = 'center';
  g.fillText('WAVE ' + world.wave, VIEW_W / 2, 80);
  g.font = '10px "Press Start 2P", monospace';
  g.fillStyle = '#c9d5ec';
  g.fillText('남은 적: ' + world.waveEnemiesLeft, VIEW_W / 2, 100);
  g.textAlign = 'left';
}
```

---

## Feature 2: 무기 합성

### 2-1. `core.parts/01.part` — FUSED_WEAPONS

```javascript
var FUSED_WEAPONS = {
  plasma_storm: {
    id: 'plasma_storm', name: '플라즈마 스톰', letter: 'Ω', color: '#ff44ff',
    kind: 'beam', fireRate: 0.04, damage: 35, speed: 1600, spread: 0,
    ammo: 40, pellets: 1, life: 0.5, shake: 1, casing: false,
    piercing: true, sfx: 'laser', desc: 'HMG+Laser 합성',
  },
  thunder_crash: {
    id: 'thunder_crash', name: '썬더 크래시', letter: 'Ω', color: '#44ffff',
    kind: 'explosive', fireRate: 0.6, damage: 90, speed: 500, spread: 0,
    ammo: 15, pellets: 1, life: 2.0, shake: 4, casing: false,
    radius: 90, chainRange: 160, maxChain: 4, sfx: 'rocket', desc: 'Rocket+Arc 합성',
  },
  gatling_rail: {
    id: 'gatling_rail', name: '개틀링 레일', letter: 'Ω', color: '#ffaa00',
    kind: 'beam', fireRate: 0.15, damage: 50, speed: 2000, spread: 0.03,
    ammo: 30, pellets: 1, life: 0.6, shake: 2, casing: false,
    piercing: true, sfx: 'laser', desc: 'Railgun+HMG 합성',
  },
  fusion_blaster: {
    id: 'fusion_blaster', name: '퓨전 블래스터', letter: 'Ω', color: '#ffffff',
    kind: 'explosive', fireRate: 0.12, damage: 45, speed: 800, spread: 0,
    ammo: 35, pellets: 1, life: 1.0, shake: 2, casing: false,
    radius: 50, sfx: 'rocket', desc: '기타 합성',
  },
};

var FUSION_RECIPES = {
  'hmg+laser': 'plasma_storm',
  'laser+hmg': 'plasma_storm',
  'rocket+arc': 'thunder_crash',
  'arc+rocket': 'thunder_crash',
  'railgun+hmg': 'gatling_rail',
  'hmg+railgun': 'gatling_rail',
};
```

### 2-2. `game.parts/02.part` — player 확장

```javascript
// createPlayer에 추가:
weapon2: null, weaponAmmo2: 0,

// tryFire에 추가 (vehicle/fusion 체크):
if (player.vehicle) { fireVehicle(); return; }
var wpn = MS.FUSED_WEAPONS[player.weapon] || MS.WEAPONS[player.weapon];
```

### 2-3. `overdrive.js` — Q키 스왑 + 합성 패치

```javascript
// Q키 입력:
source = replaceOnce(source,
  "      if (c === 'KeyK') grenadePressed = true;\n",
  "      if (c === 'KeyK') grenadePressed = true;\n      if (c === 'KeyQ') swapWeapon();\n",
  'weapon swap key');

// overdrive-runtime.js에 swapWeapon / tryFusion 함수 추가
```

### 2-4. `overdrive-runtime.js` — 합성 로직

```javascript
function swapWeapon() {
  if (!player || player.dead) return;
  if (player.weapon2 && getWeaponLevel(player.weapon) >= 3 && getWeaponLevel(player.weapon2) >= 3) {
    tryFusion();
    return;
  }
  var tmpW = player.weapon, tmpA = player.weaponAmmo;
  player.weapon = player.weapon2 || 'pistol';
  player.weaponAmmo = player.weapon2 ? player.weaponAmmo2 : Infinity;
  player.weapon2 = tmpW === 'pistol' ? null : tmpW;
  player.weaponAmmo2 = tmpA === Infinity ? 0 : tmpA;
  toast('무기 전환: ' + (MS.WEAPONS[player.weapon] || MS.FUSED_WEAPONS[player.weapon]).name, '#5cdbff');
}

function tryFusion() {
  var key = player.weapon + '+' + player.weapon2;
  var recipe = MS.FUSION_RECIPES[key];
  var fusedId = recipe || 'fusion_blaster';
  var fused = MS.FUSED_WEAPONS[fusedId];

  player.weapon = fusedId;
  player.weaponAmmo = Math.floor(fused.ammo * (profile.level >= 40 ? 1.5 : 1));
  player.weapon2 = null;
  player.weaponAmmo2 = 0;

  // 합성 연출
  screenFlash('#ffffff', 0.5);
  world.effects.push({ type: 'shockwave', x: centerX(player), y: centerY(player), r: 200, life: 1.0, maxLife: 1.0, color: fused.color });
  toast('⚡ FUSION! ' + fused.name + ' ⚡', fused.color);
  Audio.sfx('levelup');

  // 업적
  unlockAchievement('fusion_first');
  if (!profile.fusionsFound) profile.fusionsFound = {};
  profile.fusionsFound[fusedId] = true;
  if (Object.keys(profile.fusionsFound).length >= 4) unlockAchievement('fusion_all');
  saveOverdriveProfile();
}
```

---

## Feature 3: 탈것 탈취

### 3-1. `core.parts/01.part` — VEHICLES

```javascript
var VEHICLES = {
  tank: { duration: 30, speed: 120, cannonDmg: 40, cannonRate: 0.5, crushDmg: 50, hp: 200 },
  jetpack: { duration: 15, flySpeed: 250, fireDmg: 12, fireRate: 0.08 },
};
```

### 3-2. `game.parts/03.part` — killEnemy 수정

```javascript
// killEnemy 내부, miniboss 처치 시:
if (e.def.miniboss && e._meleeKill && Math.random() < 0.3) {
  var vType = e.def.id === 'tank' ? 'tank' : 'jetpack';
  world.pickups.push({ x: e.x, y: e.y, w: 24, h: 24, type: 'vehicle', vehicle: vType, vy: -100, life: 15, bob: 0 });
  toast('탈것 드롭!', '#74e79a');
}
```

### 3-3. `game.parts/02.part` — vehicle 물리

```javascript
// updatePlayer 내부:
if (player.vehicle) {
  player.vehicle.timer -= dt;
  if (player.vehicle.timer <= 0) {
    // 이젝트
    explodeAt(centerX(player), centerY(player), 60, '#ff8c42');
    player.invuln = 2.0;
    player.vehicle = null;
    toast('탈것 파괴! 이젝트!', '#ff5e5e');
    return;
  }

  if (player.vehicle.type === 'tank') {
    // 전차: 느린 이동, 점프 불가, 접촉 피해
    var speed = MS.VEHICLES.tank.speed;
    if (input.left) { player.vx = -speed; player.face = -1; }
    else if (input.right) { player.vx = speed; player.face = 1; }
    else player.vx *= 0.8;
    // 접촉 피해
    for (var i = 0; i < world.enemies.length; i++) {
      var e = world.enemies[i];
      if (!e.dead && overlap(player, e)) {
        damageEnemy(e, MS.VEHICLES.tank.crushDmg, player.face);
      }
    }
  } else if (player.vehicle.type === 'jetpack') {
    // 제트팩: SPACE = 상승
    if (input.jump) player.vy = -MS.VEHICLES.jetpack.flySpeed;
    else player.vy += GRAVITY * 0.3 * dt;
    var speed = MS.VEHICLES.jetpack.flySpeed;
    if (input.left) { player.vx = -speed; player.face = -1; }
    else if (input.right) { player.vx = speed; player.face = 1; }
    else player.vx *= 0.9;
  }
  return; // 일반 이동 스킵
}
```

### 3-4. `game.parts/02.part` — vehicle 발사

```javascript
function fireVehicle() {
  var v = player.vehicle;
  if (!v) return;
  var mx = muzzleX(), my = muzzleY();

  if (v.type === 'tank') {
    if (player.fireCd > 0) return;
    player.fireCd = MS.VEHICLES.tank.cannonRate;
    // 주포
    spawnRocket(mx, my, player.face * 500, 0, { damage: MS.VEHICLES.tank.cannonDmg, radius: 60, life: 2.0 });
    // MG 스프레이
    for (var i = 0; i < 3; i++) {
      spawnBullet(mx, my, player.face * (600 + i * 100), (i - 1) * 40, 8, true, '#ffaa44');
    }
    Audio.sfx('heavy');
  } else if (v.type === 'jetpack') {
    if (player.fireCd > 0) return;
    player.fireCd = MS.VEHICLES.jetpack.fireRate;
    spawnBullet(mx, my, player.face * 800, 0, MS.VEHICLES.jetpack.fireDmg, true, '#5cdbff');
    Audio.sfx('mg');
  }
}
```

---

## Feature 4: 크로노 브레이크

### 4-1. `game.parts/02.part` — 스냅샷 버퍼

```javascript
// updatePlayer 마지막에:
if (world && !world.chronoBuf) world.chronoBuf = [];
world.chronoBuf.push({
  x: player.x, y: player.y, hp: player.hp,
  vx: player.vx, vy: player.vy,
  weapon: player.weapon, ammo: player.weaponAmmo
});
if (world.chronoBuf.length > 180) world.chronoBuf.shift();
```

### 4-2. `game.parts/02.part` — killPlayer 수정

```javascript
function killPlayer() {
  // 크로노 리와인드 체크
  if (world && !world.chronoUsed && world.chronoBuf && world.chronoBuf.length > 60) {
    var snap = world.chronoBuf[world.chronoBuf.length - 60];
    player.x = snap.x; player.y = snap.y; player.hp = Math.max(30, snap.hp);
    player.vx = snap.vx; player.vy = snap.vy;
    player.weapon = snap.weapon; player.weaponAmmo = snap.ammo;
    player.dead = false;
    player.invuln = 2.5;
    world.chronoUsed = true;
    screenFlash('#4488ff', 0.5);
    toast('⏰ CHRONO BREAK!', '#4488ff');
    Audio.sfx('shockwave');
    world.effects.push({ type: 'shockwave', x: centerX(player), y: centerY(player), r: 150, life: 0.8, maxLife: 0.8, color: '#4488ff' });
    unlockAchievement('chrono_use');
    return;
  }

  // 기존 사망 로직
  player.dead = true;
  player.lives--;
  // ...
}
```

### 4-3. `game.parts/02.part` — 불릿 타임

```javascript
// updateProjectiles 내부, 적 총알 이동:
var bulletSpeed = 1;
if (world.bulletTimeT > 0 && !b.fromPlayer) bulletSpeed = 0.2;
b.x += b.vx * dt * bulletSpeed;
b.y += b.vy * dt * bulletSpeed;

// updatePlay 내부:
if (world.bulletTimeT > 0) world.bulletTimeT -= dt;
```

### 4-4. `overdrive-runtime.js` — 불릿 타임 발동

```javascript
function tryBulletTime() {
  if (!world || !player || player.dead) return;
  if (combat.fury < 50) {
    toast('불릿 타임: fury 50 필요 (' + Math.floor(combat.fury) + '%)', '#8fa6c8');
    return;
  }
  if (world.bulletTimeT > 0) return;
  combat.fury -= 50;
  world.bulletTimeT = 3.0;
  toast('⏰ BULLET TIME!', '#4488ff');
  Audio.sfx('freeze');
}
```

### 4-5. `game.parts/01.part` — C키 입력

```javascript
// onKeyDown PLAY 섹션:
if (c === 'KeyC') bulletTimePressed = true;

// overdrive.js 패치로 bulletTimePressed → tryBulletTime() 연결
```

### 4-6. `game.parts/04.part` — 불릿 타임 비주얼

```javascript
// drawField 마지막에:
if (world.bulletTimeT > 0) {
  g.fillStyle = 'rgba(68, 136, 255, 0.08)';
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  // 시간 왜곡 링
  g.strokeStyle = 'rgba(68, 136, 255, 0.3)';
  g.lineWidth = 2;
  var sx = player.x - world.cameraX + player.w / 2;
  var sy = player.y + player.h / 2;
  g.beginPath();
  g.arc(sx, sy, 60 + Math.sin(world.elapsed * 8) * 10, 0, Math.PI * 2);
  g.stroke();
}
```

---

## 테스트 계획

### 자동 테스트 (`npm run check`)
1. 소스 무결성 (SHA-256)
2. 코어 테스트: 무기 6종 + 합성 4종, 적 10종, 보스 5종, 스테이지 5종
3. 스모크 테스트: 초기화, 입력, 프레임 렌더링
4. 오버드라이브 패치: 모든 앵커 존재 확인

### 수동 테스트 (브라우저)
| 시나리오 | 확인 사항 |
|----------|----------|
| 타이틀 [W] | 웨이브 서바이벌 시작, WAVE 1 표시 |
| W5 클리어 | 보급품 투하, 5초 브레이크 |
| W10 | 탱크 미니보스 등장 |
| HMG Lv3 + Laser Lv3 | Q+L → 플라즈마 스톰 합성 |
| 합성 무기 발사 | 보라색 관통 총알, trail |
| tank 근접 처치 | 30% 확률로 탈것 드롭 |
| 전차 탑승 | 30초 타이머, 주포/MG, 접촉 피해 |
| 제트팩 탑승 | SPACE 비행, 15초 타이머 |
| 사망 (크로노 미사용) | 1초 전 복원, "CHRONO BREAK!" |
| C키 (fury 50+) | 3초 불릿 타임, 적 총알 감속 |
| 보스 러시 [B] | 5보스 연속, 점수 배율 |

---

## 구현 순서 & 의존성

```
[1] 웨이브 서바이벌 (독립)
     ↓
[2] 무기 합성 (기존 무기 시스템 확장)
     ↓
[3] 탈것 탈취 (player 상태 확장)
     ↓
[4] 크로노 브레이크 (스냅샷 + killPlayer 수정)
     ↓
[5] 통합 테스트 + 매니페스트 재빌드
```

각 기능은 독립적으로 구현/테스트 가능하며,
모두 완료 후 `node scripts/rebuild-manifest.js && npm run check`로 최종 검증.