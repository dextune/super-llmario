'use strict';

/* 픽셀 스프라이트 — 문자 맵을 3배 확대 캔버스로 프리렌더 */
const SpriteData = (() => {
  const PAL = {
    R: '#e52521', // 빨강 (모자/상의)
    S: '#ffd3a1', // 피부
    H: '#6b3410', // 머리카락
    D: '#2f5cf5', // 멜빵 바지
    Y: '#ffd23e', // 단추
    O: '#8a4210', // 신발
    K: '#1a1a1a', // 검정
    G: '#a05a1c', // 굼바 몸통
    F: '#4a2607', // 굼바 발
    W: '#ffffff', // 흰자위/버섯
    // 신규 색
    P: '#3fa34d', // 쿠파 초록
    Q: '#1f6b2a', // 쿠파 어두움
    B: '#26243a', // 박쥐 어두움
    T: '#e8e4cf', // 뼈
    U: '#8f8975', // 뼈 그림자
    E: '#d6221c', // 악마 빨강
    e: '#7a1410', // 악마 어두움
    C: '#a8dbff', // 설인 얼음
    c: '#5aa0d8', // 설인 어두움
  };

  const SMALL_HEAD = [
    '....RRRRR...',
    '...RRRRRRRRR',
    '...HHHSSKS..',
    '..HSHSSSKSSS',
    '..HSHHSSSSKK',
    '..HHSSSSSKK.',
    '....SSSSSS..',
  ];
  const SMALL_TORSO = [
    '...RRRRRR...',
    '..RRRRRRRR..',
    '.SSRRDDRRSS.',
    '.SSRDDDDRSS.',
    '.SSDDDDDDSS.',
  ];
  const SMALL_LEGS = {
    idle: ['..DDDDDDDD..', '..DDYDDYDD..', '..OOO..OOO..', '.OOOO..OOOO.'],
    run1: ['..DDDDDDDD..', '..DDYDDYDD..', '.OOO....OOO.', '.OO......OO.'],
    run2: ['..DDDDDDDD..', '..DDYDDYDD..', '...OOOOOO...', '...OOOOOO...'],
    run3: ['..DDDDDDDD..', '..DDYDDYDD..', '..OOO..OOO..', '..OO...OOO..'],
    jump: ['..DDDDDDDD..', '..DDYDDYDD..', '.OOO...OOO..', '.OO.....OOO.'],
    // 콤보 3단 — 횡베기 / 올려베기 / 찌르기(런지)
    atk1: ['..DDDDDDDD..', '..DDYDDYDD..', '.OOO....OOO.', 'OO........OO'],
    atk2: ['..DDDDDDDD..', '..DDYDDYDD..', '..OOO..OOO..', '.OO...OOOO..'],
    atk3: ['..DDDDDDDD..', '..DDYDDYDD..', 'OOOO......OO', 'OO..........'],
  };

  const BIG_TORSO = [
    '...RRRRRR...',
    '..RRRRRRRR..',
    '.RRRRRRRRRR.',
    '.SSRRRRRRSS.',
    '.SSSRRRRSSS.',
    '.SSDDDDDDSS.',
    '..DDDDDDDD..',
    '..DDYDDYDD..',
    '..DDDDDDDD..',
    '..DDDDDDDD..',
    '..DDDDDDDD..',
  ];
  const BIG_LEGS = {
    idle: ['..DDD..DDD..', '..DDD..DDD..', '..OOO..OOO..', '.OOOO..OOOO.'],
    run1: ['..DDD..DDD..', '.DDD....DDD.', '.OOO....OOO.', '.OO......OO.'],
    run2: ['..DDDDDDDD..', '..DDDDDDDD..', '...OOOOOO...', '...OOOOOO...'],
    run3: ['..DDD..DDD..', '..DDD.DDD...', '..OOO..OOO..', '..OO...OOO..'],
    jump: ['..DDD..DDD..', '.DDD...DDD..', '.OOO...OOO..', '.OO.....OOO.'],
    atk:  ['..DDD..DDD..', '.DDD....DDD.', '.OOO....OOO.', 'OO........OO'],
  };

  const GOOMBA_TOP = [
    '....GGGG....',
    '..GGGGGGGG..',
    '.GGGGGGGGGG.',
    '.GWWKGGKWWG.',
    'GGWWKGGKWWGG',
    'GGGGGGGGGGGG',
    '.GGGGGGGGGG.',
    '..GGGGGGGG..',
  ];

  // 쿠파 (거북) — 초록
  const KOOPA_TOP = [
    '....PPPP....',
    '..PPPPPPPP..',
    '.PPPPPPPPPP.',
    'PPWWPPPPWWPP',
    'PPKKPPPPKKPP',
    'PPPPPPPPPPPP',
    '.QQQQQQQQQQ.',
    '..QQQQQQQQ..',
  ];
  const KOOPA_LEG1 = ['.QQ....QQ.', '.QQQ..QQQ.', 'QQ......QQ'];
  const KOOPA_LEG2 = ['..QQ..QQ..', '.QQ.QQ.QQ.', 'QQQ....QQQ'];

  // 박쥐
  const BAT1 = [
    '............',
    '..B......B..',
    '.BBB....BBB.',
    'BBBBBBBBBBBB',
    'BWBBKKKKBBWB',
    'BBBBBBBBBBBB',
    '.BBBBBBBBBB.',
    '..B......B..',
  ];
  const BAT2 = [
    '............',
    '............',
    'BB........BB',
    'BBBBBBBBBBBB',
    'BWBBKKKKBBWB',
    'BBBBBBBBBBBB',
    '.BBBBBBBBBB.',
    'BBB......BBB',
  ];

  // 해골
  const SKEL_TOP = [
    '....TTTT....',
    '...TTTTTT...',
    '..TUKTTKUT..',
    '..TKKTTKKT..',
    '...TTTTTT...',
    '....TTTT....',
  ];
  const SKEL_BODY = [
    '..TTTTTTTT..',
    '.TUTUTUTUTU.',
    '.TUTUTUTUTU.',
    '..TUTUTUTU..',
    '..T..TT..T..',
    '..T..TT..T..',
  ];
  const SKEL_LEG1 = ['..TT..TT..', '.TTT..TTT.', 'TT......TT'];
  const SKEL_LEG2 = ['...T..T...', '..TT..TT..', '.TT....TT.'];

  // 악마
  const DEMON_TOP = [
    'EE........EE',
    'EEE......EEE',
    '.EEEEEEEEEE.',
    '.EKKEEEEKEE.',
    '.EEEEWWEEEE.',
    '.EEEEEEEEEE.',
    '..EEEEEEEE..',
  ];
  const DEMON_LEG1 = ['E..EEEE..E', 'EE.EEEE.EE', 'EE......EE'];
  const DEMON_LEG2 = ['.EEEEEEEE.', '..EEEEEE..', '.EE....EE.'];

  // 설인
  const ICE_TOP = [
    '....CCCC....',
    '..CCCCCCCC..',
    '.CCCCCCCCCC.',
    'CCWWCCCCWWCC',
    'CCWWCCCCWWCC',
    'CCCCCCCCCCCC',
    '.CCCCCCCCCC.',
    '..CCCCCCCC..',
  ];
  const ICE_LEG1 = ['CC..CCCC..CC', 'CC..CCCC..CC', 'CCC....CCC'];
  const ICE_LEG2 = ['..CCCCCCCC..', '.CC.CCCC.CC.', 'CC......CC'];

  const FRAMES = {};
  for (const k in SMALL_LEGS) FRAMES['m_s_' + k] = SMALL_HEAD.concat(SMALL_TORSO, SMALL_LEGS[k]);
  for (const k in BIG_LEGS) FRAMES['m_b_' + k] = SMALL_HEAD.concat(BIG_TORSO, BIG_LEGS[k]);

  FRAMES.goomba1 = GOOMBA_TOP.concat(['.FF......FF.', 'FFF......FFF']);
  FRAMES.goomba2 = GOOMBA_TOP.concat(['..FF....FF..', '..FFF..FFF..']);
  FRAMES.goomba_sq = [
    '..GGGGGGGG..',
    'GWWKGGGGKWWG',
    'GGGGGGGGGGGG',
    '.FFFFFFFFFF.',
  ];

  FRAMES.koopa1 = KOOPA_TOP.concat(KOOPA_LEG1);
  FRAMES.koopa2 = KOOPA_TOP.concat(KOOPA_LEG2);

  FRAMES.bat1 = BAT1;
  FRAMES.bat2 = BAT2;

  FRAMES.skel1 = SKEL_TOP.concat(SKEL_BODY, SKEL_LEG1);
  FRAMES.skel2 = SKEL_TOP.concat(SKEL_BODY, SKEL_LEG2);

  FRAMES.demon1 = DEMON_TOP.concat(DEMON_LEG1);
  FRAMES.demon2 = DEMON_TOP.concat(DEMON_LEG2);

  FRAMES.ice1 = ICE_TOP.concat(ICE_LEG1);
  FRAMES.ice2 = ICE_TOP.concat(ICE_LEG2);

  FRAMES.mush = [
    '....RRRR....',
    '..RRWWWWRR..',
    '.RRWWWWWWRR.',
    'RRWWRRRRWWRR',
    'RWWRRRRRRWWR',
    'RRRRRRRRRRRR',
    '..WWWWWWWW..',
    '.WWWKWWKWWW.',
    '.WWWKWWKWWW.',
    '.WWWWWWWWWW.',
    '..WWWWWWWW..',
  ];

  function render(rows) {
    const h = rows.length, w = rows[0].length;
    const cv = document.createElement('canvas');
    cv.width = w * 3; cv.height = h * 3;
    const c = cv.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = PAL[row[x]];
        if (col) { c.fillStyle = col; c.fillRect(x * 3, y * 3, 3, 3); }
      }
    });
    return cv;
  }

  const built = {}, flipped = {};
  for (const k in FRAMES) built[k] = render(FRAMES[k]);

  function flipOf(cv) {
    const f = document.createElement('canvas');
    f.width = cv.width; f.height = cv.height;
    const c = f.getContext('2d');
    c.translate(cv.width, 0); c.scale(-1, 1);
    c.drawImage(cv, 0, 0);
    return f;
  }

  return {
    get(name, flip) {
      if (!flip) return built[name];
      if (!flipped[name]) flipped[name] = flipOf(built[name]);
      return flipped[name];
    },
    has(name) { return !!built[name]; },
  };
})();
