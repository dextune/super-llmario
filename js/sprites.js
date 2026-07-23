'use strict';

/* Metal Strike pixel-art sprite renderer.
 * String-based pixel arrays with palette colors, rendered to offscreen canvas
 * at 3× scale. Player uses composed head+body+legs for animation variety.
 * v2: 16-wide high-detail sprites with shading, equipment, and animation.
 */
var SpriteData = (function () {
  var SCALE = 3;

  var BASE_PAL = {
    G: '#4a5a2a', g: '#2a3a1a',  // military green / dark
    H: '#7a9a5a',                // olive highlight
    S: '#e8c8a0', P: '#c8a878',  // skin / skin shadow
    K: '#1a1a1a',                // black
    W: '#ffffff',                // white
    B: '#5a4a3a', b: '#3a2a1a',  // brown leather / dark
    R: '#cc3a2a', r: '#8a1a1a',  // red / dark red
    O: '#d8a030',                // gold
    A: '#6a6a6a', a: '#3a3a3a',  // gunmetal / dark
    T: '#8a6a4a', t: '#5a4a2a',  // tan (rebel) / dark
    C: '#4a8a3a', c: '#2a5a1a',  // camo / dark camo
    D: '#cc5a1a',                // flame orange
    E: '#8a2a6a', e: '#5a1a4a',  // purple / dark
    M: '#5a7a8a', m: '#3a5a6a',  // steel blue / dark
    N: '#7a8a9a', n: '#4a5a6a',  // light steel / dark
    Y: '#e8d838',                // yellow
    L: '#a0b8c8',                // light blue-grey
  };

  function pad(rows, w) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      while (r.length < w) r += '.';
      out.push(r.length > w ? r.slice(0, w) : r);
    }
    return out;
  }

  function render(rows, palette, sc) {
    var scale = sc || SCALE;
    rows = pad(rows, rows[0].length);
    var h = rows.length, w = rows[0].length;
    var cv = document.createElement('canvas');
    cv.width = w * scale; cv.height = h * scale;
    var c = cv.getContext('2d');
    var pal = palette || BASE_PAL;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var col = pal[rows[y][x]];
        if (col) { c.fillStyle = col; c.fillRect(x * scale, y * scale, scale, scale); }
      }
    }
    return cv;
  }

  function flipOf(cv) {
    var f = document.createElement('canvas');
    f.width = cv.width; f.height = cv.height;
    var c = f.getContext('2d');
    c.translate(cv.width, 0); c.scale(-1, 1);
    c.drawImage(cv, 0, 0);
    return f;
  }

  /* ========== PLAYER — 16 wide, high detail ========== */
  var P_HEAD = [
    '....gGGGGGGg....',
    '...GGGGGGGGGG...',
    '..GGRRRRRRRRGG..',
    '..HSSSSSSSSSSH..',
    '..RWKSSSSSSKWR..',
    '..PSSSSmmSSSSP..',
    '...RSSSSSSSR....',
  ];
  var P_HEAD_HURT = [
    '....gGGGGGGg....',
    '...GGGGGGGGGG...',
    '..GGRRRRRRRRGG..',
    '..HSSSSSSSSSSH..',
    '..RXKXSSSSKXSR..',
    '..PSSSSmmSSSSP..',
    '...RSSSSSSSR....',
  ];

  var P_BODY = [
    '...gGGGGGGGGg...',
    '..HGGNGGGGNGGH..',
    '.GGGGBBBBGGGGAA.',
    'GGCGGSSGGGGGAa..',
    'GGGGBBBBBGGGGGGG',
    'GGOGGBBBBGGGGGGG',
    '...gGGGGGGGGg...',
  ];
  var P_BODY_SHOOT = [
    '...gGGGGGGGGgAA.',
    '..HGGNGGGGNGGAa.',
    '.GGGGBBBBGGGAAa.',
    'GGCGGSSGGGGAa...',
    'GGGGBBBBBGGGGGGG',
    'GGOGGBBBBGGGGGGG',
    '...gGGGGGGGGg...',
  ];
  var P_BODY_CROUCH = [
    '...gGGGGGGGGgAA.',
    '..GGGGBBBBGAa...',
    '.GGCGGSSGGAa....',
    'GGOGGBBBBGGGGGGG',
    '...gGGGGGGGGg...',
  ];

  var P_LEGS_IDLE = [
    '...gGGGGGGGGg...',
    '...GGG....GGG...',
    '..NBBB....BBBN..',
    '..bBBb....bBBb..',
    '.bb..b....b..bb.',
  ];
  var P_LEGS_RUN1 = [
    '...gGGGGGGGGg...',
    '...GGGGG..GGG...',
    '..NBBBB...BBBN..',
    'BBBb.......bBBb.',
    'bb..........bb..',
  ];
  var P_LEGS_RUN2 = [
    '...gGGGGGGGGg...',
    '...GGGGGGGGGG...',
    '..NBBBBBBBBBBN..',
    '..BBBBBBBBBBBB..',
    '.bb..........bb.',
  ];
  var P_LEGS_RUN3 = [
    '...gGGGGGGGGg...',
    '...GGG..GGGGG...',
    '..NBBB...BBBBN..',
    '.BBb.......bBBB.',
    '..bb..........bb',
  ];
  var P_LEGS_RUN4 = [
    '...gGGGGGGGGg...',
    '....GGGGGGGGG...',
    '..NBBBBBBBBBBN..',
    '..bBBb....bBBb..',
    '.bb..b....b..bb.',
  ];
  var P_LEGS_JUMP = [
    '...gGGGGGGGGg...',
    '...GGGG..GGGG...',
    '..NBBB....BBBN..',
    '..BBB......BBB..',
    '..bb........bb..',
  ];
  var P_LEGS_CROUCH = [
    '...gGGGGGGGGg...',
    '..NBBBBBBBBBBN..',
    '.bBBBBBBBBBBBBb.',
  ];

  var P_DEAD = [
    '................',
    '....RR......RR..',
    '...RSSR....RSSR.',
    '..RSSSSR..RSSSSR',
    '...RSSSSSSSSSSR.',
    '....RSSSSSSSR...',
    '...gGGGGGGGGg...',
    '..HGGNGGGGNGGH..',
    '.GGGGBBBBGGGGAA.',
    'GGCGGSSGGGGGAa..',
    '.bBBB....BBBb...',
    '.bB........bB...',
  ];

  /* ========== REBEL GRUNT — 16 wide ========== */
  var REBEL_HEAD = [
    '....tTTTTTTt....',
    '...TTTTTTTTTT...',
    '..TTSSSSSSTTT...',
    '..TSKKSSSSKKST..',
    '..TSSSSSSSSSST..',
    '..TPSSSSSSSSTP..',
    '...TSSSSSSST....',
  ];
  var REBEL_BODY = [
    '...tTTTTTTTTt...',
    '..TTTTTTTTTTTT..',
    '.TTTTKKKKTTTTTT.',
    'TTTSSSSTTTTTTTT.',
    'TTTTTBBBTTTTTTT.',
    '..tTTTTTTTTTt...',
  ];
  var REBEL_LEGS_I = [
    '...tTTTTTTTTt...',
    '...TTT....TTT...',
    '...ttt....ttt...',
    '..tttt....tttt..',
    '.tt..t....t..tt.',
  ];
  var REBEL_LEGS_W1 = [
    '...tTTTTTTTTt...',
    '...TTTTT..TTT...',
    '...tttt...ttt...',
    'tttt.......ttt..',
    'tt..........tt..',
  ];
  var REBEL_LEGS_W2 = [
    '...tTTTTTTTTt...',
    '...TTTTTTTTTT...',
    '...tttttttttt...',
    '..tttttttttttt..',
    '.tt..........tt.',
  ];
  var REBEL_DEAD = [
    '................',
    '....TT......TT..',
    '...TSSR....TSSR.',
    '..TSSSSR..TSSSSR',
    '...TSSSSSSSSSR..',
    '....TSSSSSSSR...',
    '...tTTTTTTTTt...',
    '..TTTTTTTTTTTT..',
    '.TTTTKKKKTTTTTT.',
    'tttt....tttt....',
    'tt........tt....',
  ];

  /* ========== RIFLEMAN ========== */
  var RIFLE_BODY = [
    '...tTTTTTTTTtAA.',
    '..TTTTTTTTTTAa..',
    '.TTTTKKKKTTAAa..',
    'TTTSSSSTTTTAa...',
    'TTTTTBBBTTTTTTT.',
    '..tTTTTTTTTTt...',
  ];

  /* ========== SHIELD SOLDIER ========== */
  var SHIELD_BODY = [
    '..AAATTTTTTTTAA.',
    '.AAAATTTTTTTTAAA',
    'AAAATTKKKKTTAAAA',
    'AAAATTSSSSTTAAAA',
    '.AA.TTTBBTTTAAA.',
    '....tTTTTTTTTt..',
  ];

  /* ========== BAZOOKA SOLDIER ========== */
  var BAZOOKA_BODY = [
    '...tTTTTTTTAAAA.',
    '..TTTTTTTTTAAAa.',
    '.TTTTKKKKAAAa...',
    'TTTSSSSAa.......',
    'TTTTTBBBTTTTTTT.',
    '..tTTTTTTTTTt...',
  ];

  /* ========== GRENADIER ========== */
  var GREN_BODY = [
    '...tTTTTTTTTOO..',
    '..TTTTTTTTTTOO..',
    '.TTTTKKKKTTTTTT.',
    'TTTSSSSTTTTTTTT.',
    'TTTTTBBBTTTTTTT.',
    '..tTTTTTTTTTt...',
  ];

  /* ========== SNIPER ========== */
  var SNIPER_BODY = [
    '...tTTTTTTTTtAA.',
    '..TTTTTTTTTTAa..',
    '.TTTTKKKKTTTAa..',
    'TTTSSSSTTTTAa...',
    'TTTTTBBBTTTTTTT.',
    '..tTTTTTTTTTt...',
  ];

  /* ========== DRONE — 12×8 ========== */
  var DRONE1 = [
    '............',
    '..NNNNNNNN..',
    '.NNWWKKWWNN.',
    'NNNNKKKKNNNN',
    '.NNNNNNNNNN.',
    '..aa....aa..',
    '...a....a...',
    '............',
  ];
  var DRONE2 = [
    '............',
    '..NNNNNNNN..',
    '.NNWWKKWWNN.',
    'NNNNKKKKNNNN',
    '.NNNNNNNNNN.',
    '..aa....aa..',
    '....a..a....',
    '............',
  ];

  /* ========== TURRET — 16×12 ========== */
  var TURRET1 = [
    '................',
    '.........AAAA...',
    '........AAAAA...',
    '...NNNNNNAAaA...',
    '..NNNNNNNNNaA...',
    '.NNWWWWWWWWNNNN.',
    '.NNKKKKKKKKNNNN.',
    'NNNNNNNNNNNNNNNN',
    '.nnnnnnnnnnnnnn.',
    '..nnnnnnnnnnnn..',
    '...nnnnnnnnnn...',
    '................',
  ];
  var TURRET2 = [
    '................',
    '.......AAAA.....',
    '......AAAAA.....',
    '...NNNNNAAaA....',
    '..NNNNNNNaA.....',
    '.NNNNNNNNAa.....',
    '.NNWWWWWWWWNNNN.',
    '.NNKKKKKKKKNNNN.',
    'NNNNNNNNNNNNNNNN',
    '.nnnnnnnnnnnnnn.',
    '..nnnnnnnnnnnn..',
    '...nnnnnnnnnn...',
  ];

  /* ========== TANK — 30×16 ========== */
  var TANK_BODY = [
    '..............................',
    '.........CCCCCC...............',
    '........CCCCCCCC..............',
    '.......CCCKKKKCCC.............',
    '......CCCCWWWWCCCC............',
    '.....CCCCCKKKKCCCCAAAAAAAAAAAA',
    '....CCCCCCCCCCCCCCCCAAAAAAAAAA',
    '...CCCCCCCCCCCCCCCCCAAAAAAAA..',
    '..CCCCCCCCCCCCCCCCCCCCAAAAAA..',
    '.nnnnnnnnnnnnnnnnnnnnnnnnnnn..',
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnnn.',
    'KKKK..KKKK..KKKK..KKKK..KKKK.',
    'aaaa..aaaa..aaaa..aaaa..aaaa.',
    '..............................',
    '..............................',
    '..............................',
  ];
  var TANK_TURRET1 = [
    '..............................',
    '..............................',
    '.............AAA..............',
    '............AAaA..............',
    '...........CCCCCCC............',
    '..........CCCKKKCCC...........',
    '.........CCCCWWWCCCC..........',
    '........CCCCCKKKCCCCC.........',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
  ];

  /* ========== HELICOPTER — 24×14 ========== */
  var CHOPPER1 = [
    '........................',
    '....MMMM................',
    '...MMMMMM...............',
    '..MMWKWKWMM.............',
    '.MMMMKKKKKMMMMAAAA......',
    'MMMMWWWWWWMMMMAAAA......',
    'MMMMKKKKKMMMMAAaA.......',
    '.MMMMMMMMMMMMMAa........',
    '..nnnnnnnnnnnn..........',
    '....MM..MM..............',
    '....nn..nn..............',
    '........................',
    '........................',
    '........................',
  ];
  var CHOPPER2 = [
    '........................',
    '..M....M................',
    '..MM..MM................',
    '..MMWKWKWMM.............',
    '.MMMMKKKKKMMMMAAAA......',
    'MMMMWWWWWWMMMMAAAA......',
    'MMMMKKKKKMMMMAAaA.......',
    '.MMMMMMMMMMMMMAa........',
    '..nnnnnnnnnnnn..........',
    '....nn..nn..............',
    '....MM..MM..............',
    '........................',
    '........................',
    '........................',
  ];

  /* ========== WEAPON CRATE — 14×12 ========== */
  function crateSprite(letter) {
    return [
      '..OOOOOOOO....',
      '.OOOOOOOOOO...',
      'OO' + letter + 'OOOOOO' + letter + 'OOAA..',
      'OOOOOOOOOOAA..',
      'OOOO' + letter + 'OOOOOO' + letter + 'Aa..',
      'OOOOOOOOOOAa..',
      'OO' + letter + 'OOOOOO' + letter + 'OOAA..',
      '.OOOOOOOOOO...',
      '..OOOOOOOO....',
      '...aaaaaa.....',
      '..aA..Aa......',
      '..............',
    ];
  }

  /* ========== POW (Prisoner) — 14×16 ========== */
  var POW_TIED = [
    '..............',
    '....SSSSSS....',
    '...SKKSSKKS...',
    '...SSSSSSSS...',
    '....SSSSSS....',
    '...OOOOOOOO...',
    '..OOOOOOOOOO..',
    '.OOOOOOOOOOOO.',
    'OOOOOOOOOOOOOO',
    '.OOOOOOOOOOOO.',
    '..OO......OO..',
    '..BB......BB..',
    '.bBb....bBb...',
    '.bb......bb...',
    '..............',
    '..............',
  ];
  var POW_FREE = [
    '..............',
    '....SSSSSS....',
    '...SKKSSKKS...',
    '...SSSSSSSS...',
    '....SSSSSS....',
    '...OOOOOOOO...',
    '..OOOOOOOOOO..',
    '.OOOYOOOOOOOO.',
    'OOOOOOYOOOOOOO',
    '.OOOOOOOOOOOO.',
    '..OO......OO..',
    '..BB......BB..',
    '.bBb....bBb...',
    '.bb......bb...',
    '..............',
    '..............',
  ];

  /* ========== GRENADE — 10×10 ========== */
  var GRENADE = [
    '...AA.....',
    '...aa.....',
    '..OOOO....',
    '.OOOOOO...',
    '.OOgOOgO..',
    'OgOOgOOOO.',
    'OOOOOOOOO.',
    '.OOOOOOO..',
    '..OOOOO...',
    '..........',
  ];

  /* ========== BUILD ALL ========== */
  var built = {}, flipped = {};

  function buildAll() {
    // Player frames — compose head + body + legs
    var bodies = { idle: P_BODY, shoot: P_BODY_SHOOT };
    var legs = {
      idle: P_LEGS_IDLE, run1: P_LEGS_RUN1, run2: P_LEGS_RUN2,
      run3: P_LEGS_RUN3, run4: P_LEGS_RUN4, jump: P_LEGS_JUMP,
    };
    for (var bk in bodies) {
      for (var lk in legs) {
        built['player_' + bk + '_' + lk] = render(P_HEAD.concat(bodies[bk], legs[lk]));
      }
    }
    built.player_crouch = render(P_HEAD.concat(P_BODY_CROUCH, P_LEGS_CROUCH));
    built.player_hurt = render(P_HEAD_HURT.concat(P_BODY, P_LEGS_IDLE));
    built.player_dead = render(P_DEAD);

    // Enemy sprites
    built.rebel_idle = render(REBEL_HEAD.concat(REBEL_BODY, REBEL_LEGS_I));
    built.rebel_walk1 = render(REBEL_HEAD.concat(REBEL_BODY, REBEL_LEGS_W1));
    built.rebel_walk2 = render(REBEL_HEAD.concat(REBEL_BODY, REBEL_LEGS_W2));
    built.rebel_dead = render(REBEL_DEAD);

    built.rifle_idle = render(REBEL_HEAD.concat(RIFLE_BODY, REBEL_LEGS_I));
    built.rifle_shoot = render(REBEL_HEAD.concat(RIFLE_BODY, REBEL_LEGS_I));

    built.shield_idle = render(REBEL_HEAD.concat(SHIELD_BODY, REBEL_LEGS_I));
    built.shield_walk = render(REBEL_HEAD.concat(SHIELD_BODY, REBEL_LEGS_W1));

    built.bazooka_idle = render(REBEL_HEAD.concat(BAZOOKA_BODY, REBEL_LEGS_I));
    built.bazooka_aim = render(REBEL_HEAD.concat(BAZOOKA_BODY, REBEL_LEGS_W2));

    built.grenadier_idle = render(REBEL_HEAD.concat(GREN_BODY, REBEL_LEGS_I));
    built.grenadier_throw = render(REBEL_HEAD.concat(GREN_BODY, REBEL_LEGS_W1));

    built.sniper_idle = render(REBEL_HEAD.concat(SNIPER_BODY, REBEL_LEGS_I));
    built.sniper_shoot = render(REBEL_HEAD.concat(SNIPER_BODY, REBEL_LEGS_W2));

    built.drone1 = render(DRONE1);
    built.drone2 = render(DRONE2);

    built.turret1 = render(TURRET1);
    built.turret2 = render(TURRET2);

    built.tank_body = render(TANK_BODY);
    built.tank_turret = render(TANK_TURRET1);

    built.chopper1 = render(CHOPPER1);
    built.chopper2 = render(CHOPPER2);

    // Props
    built.crate_hmg = render(crateSprite('H'));
    built.crate_rocket = render(crateSprite('R'));
    built.crate_arc = render(crateSprite('A'));
    built.crate_laser = render(crateSprite('L'));
    built.crate_railgun = render(crateSprite('G'));
    built.crate_default = render(crateSprite('?'));

    built.pow_tied = render(POW_TIED);
    built.pow_free = render(POW_FREE);

    built.grenade = render(GRENADE);
  }

  buildAll();

  var ENEMY_FRAMES = {
    grunt: { idle: 'rebel_idle', walk1: 'rebel_walk1', walk2: 'rebel_walk2', dead: 'rebel_dead' },
    rifleman: { idle: 'rifle_idle', shoot: 'rifle_shoot', dead: 'rebel_dead' },
    shield: { idle: 'shield_idle', walk: 'shield_walk', dead: 'rebel_dead' },
    bazooka: { idle: 'bazooka_idle', aim: 'bazooka_aim', dead: 'rebel_dead' },
    grenadier: { idle: 'grenadier_idle', throw: 'grenadier_throw', dead: 'rebel_dead' },
    sniper: { idle: 'sniper_idle', shoot: 'sniper_shoot', dead: 'rebel_dead' },
    drone: { idle: 'drone1', fly: 'drone2' },
    turret: { idle: 'turret1', fire: 'turret2' },
    tank: { idle: 'tank_body', turret: 'tank_turret' },
    chopper: { idle: 'chopper1', rotor: 'chopper2' },
  };

  var CRATE_MAP = {
    hmg: 'crate_hmg', rocket: 'crate_rocket',
    arc: 'crate_arc', laser: 'crate_laser', railgun: 'crate_railgun',
  };

  function getFlip(name) {
    if (!flipped[name]) flipped[name] = flipOf(built[name]);
    return flipped[name];
  }

  return {
    get: function (name, flip) { return flip ? getFlip(name) : built[name]; },
    has: function (name) { return !!built[name]; },

    playerFrame: function (pose, flip) {
      var key = pose;
      if (!built[key]) key = 'player_idle_idle';
      return flip ? getFlip(key) : built[key];
    },

    enemyFrame: function (type, frame, flip) {
      var map = ENEMY_FRAMES[type] || ENEMY_FRAMES.grunt;
      var name = map[frame] || map.idle || 'rebel_idle';
      if (!built[name]) name = 'rebel_idle';
      return flip ? getFlip(name) : built[name];
    },

    crateFor: function (weaponId) {
      return built[CRATE_MAP[weaponId]] || built.crate_default;
    },

    ENEMY_FRAMES: ENEMY_FRAMES,
    SCALE: SCALE,
  };
})();