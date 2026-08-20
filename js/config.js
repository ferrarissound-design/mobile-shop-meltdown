// ============================================================
// ケータイショップへようこそ / 設定値
// ============================================================

export const CFG = {
  // --- 時間 ---
  SIM_STEP: 1 / 30,          // 固定シミュレーションステップ(秒)
  GAME_MIN_PER_SEC: 1,       // 実時間1秒 = ゲーム内1分

  // --- 来店 ---
  SPAWN_FIRST: 4,            // 開店から最初の客まで(秒)
  SPAWN_BASE: 16.0,          // 初期の来店間隔(秒)
  SPAWN_MIN: 5.0,            // 最短の来店間隔(秒)
  SPAWN_RAMP: 290,           // この秒数ごとに間隔が縮む度合いの基準
  MAX_CUSTOMERS: 30,         // 同時存在する客の上限
  MAX_CHARACTERS: 40,        // 客+店員の上限

  // --- 受付 ---
  RECEPTION_TIME: [2.5, 5.5],

  // --- 待機 ---
  PATIENCE_BASE: [70, 150],  // 忍耐力(秒相当)
  ANGER_WAIT_RATE: 1.0,      // 待ち1秒あたりの怒り上昇の基準

  // --- 接客 ---
  SERVE_BEAT: [2.6, 4.4],    // 会話ビートの間隔(秒)
  BASE_SERVE_TIME: 2.4,      // 難易度1あたりの基礎接客時間(秒)

  // --- 店員 ---
  START_STAFF: 3,
  STRESS_MELTDOWN: 100,
  BREAK_TIME: [10, 18],      // バックヤード休憩(秒)
  MELTDOWN_TIME: [16, 26],
  FATIGUE_RATE: 0.45,        // 接客中の疲労上昇(毎秒)
  STRESS_RECOVER: 3.2,       // 休憩中のストレス回復(毎秒)

  // --- 平穏度 ---
  PEACE_MAX: 100,
  PEACE_DRAIN: {
    longWait: 0.22,           // 限界寸前の客1人につき毎秒
    complaint: 2.6,
    angryLeave: 4.5,
    highStress: 0.16,        // 高ストレス店員1人につき毎秒
    mistake: 2.0,
    conflict: 4.0,
    special: 2.2,
    meltdown: 3.5,
  },
  PEACE_GAIN_HAPPY: 1.5,     // 満足して帰った客

  // --- 応援スタッフ ---
  SUPPORT_DURATION: 110,
  SUPPORT_COOLDOWN: 220,

  // --- 演出 ---
  RARE_CHANCE: 0.07,         // 特殊案件の発生率
  LOG_MAX: 60,
};

// 感情アイコン
export const MOOD = {
  happy: '😊',
  normal: '😐',
  confused: '😓',
  angry: '😡',
  rage: '💢',
  tired: '😵',
  broken: '💀',
  talk: '💬',
  sleep: '💤',
  special: '⚠️',
};

// 色パレット(可愛いローポリ風)
export const PALETTE = {
  floor: 0xf3ece2,
  floorAlt: 0xe7dccd,
  wall: 0xfdf7ef,
  wallBack: 0xf0e6da,
  accent: 0x4fb3a5,
  accent2: 0xf3a73f,
  desk: 0xd9b382,
  deskTop: 0xf1ddbe,
  chair: 0x8fb8d6,
  chairSeat: 0xbcd6e8,
  stand: 0xcfd6dd,
  carpet: 0xdfeee9,
  skin: [0xf6d5b8, 0xecc3a0, 0xd9a878, 0xc08e63, 0xf9e2cd],
  hair: [0x2b2320, 0x3d2f27, 0x1b1b1f, 0x5a4033, 0x8a6a4a, 0x999999, 0xd8b26a],
  staffUniform: 0x2f6fb5,
  staffUniform2: 0x27538a,
  customerTops: [
    0xe8746b, 0xf2b44c, 0x76c08a, 0x6fa8dc, 0xb98fd0, 0xe6a3b8,
    0x60c4c0, 0xd9d2c5, 0x8d8fa8, 0xf0966d, 0x9ec46a, 0xc4707f,
  ],
  customerPants: [0x3d4453, 0x5a6272, 0x7a6a5c, 0x2f3b46, 0x8a7f9b, 0x4a5d52],
};
