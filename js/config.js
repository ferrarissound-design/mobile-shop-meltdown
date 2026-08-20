// ============================================================
// ケータイショップへようこそ / 設定値
// ============================================================

export const CFG = {
  // --- 時間 ---
  SIM_STEP: 1 / 30,          // 固定シミュレーションステップ(秒)
  GAME_MIN_PER_SEC: 1,       // 実時間1秒 = ゲーム内1分

  // --- 進行フェーズ(秒) 序盤 / 中盤 / 後半 / 終盤 ---
  PHASE_TIMES: [120, 285, 460],
  GRACE_TIME: 70,            // 開店直後の猶予(トラブル・特殊案件を抑制)

  // --- 来店 ---
  SPAWN_FIRST: 5,            // 開店から最初の客まで(秒)
  SPAWN_BASE: 18.0,          // 初期の来店間隔(秒)
  SPAWN_MIN: 5.6,            // 最短の来店間隔(秒)
  SPAWN_RAMP: 380,           // この秒数ごとに間隔が縮む度合いの基準
  MAX_CUSTOMERS: 30,         // 同時存在する客の上限
  MAX_CHARACTERS: 40,        // 客+店員の上限

  // --- 受付 ---
  RECEPTION_TIME: [2.5, 5.5],

  // --- 待機 ---
  PATIENCE_BASE: [78, 158],  // 忍耐力(秒相当)
  ANGER_WAIT_RATE: 1.0,      // 待ち1秒あたりの怒り上昇の基準

  // --- 接客 ---
  SERVE_BEAT: [2.6, 4.4],    // 会話ビートの間隔(秒)
  BASE_SERVE_TIME: 2.4,      // 難易度1あたりの基礎接客時間(秒)
  LONG_SERVE: 26,            // これを超えると「長期接客」として連鎖に記録(秒)

  // --- 店員 ---
  START_STAFF: 3,
  STRESS_MELTDOWN: 100,
  BREAK_TIME: [10, 18],      // バックヤード休憩(秒)
  MELTDOWN_TIME: [16, 26],
  FATIGUE_RATE: 0.45,        // 接客中の疲労上昇(毎秒)
  STRESS_RECOVER: 3.2,       // 休憩中のストレス回復(毎秒)

  // --- 店員ストレス段階 --------------------------------------
  // 低(0) / 中(1) / 高(2) / 限界(3) の境界値
  STRESS_TIER: [40, 68, 90],
  TIER_SPEED: [1.0, 0.84, 0.58, 0.34],   // 接客の進行速度倍率
  TIER_MISTAKE: [1.0, 1.35, 2.0, 2.7],   // ミス率倍率
  TIER_SATISFY: [1.0, 0.93, 0.78, 0.6],  // 客の満足度倍率
  TIER_TALK: [0.0, 0.35, 0.7, 1.0],      // 疲れたセリフの出やすさ

  // --- クレーム対応 -------------------------------------------
  CLAIM_TIME: [11, 17],      // クレーム対応で店員が拘束される時間(秒)
  CLAIM_STRESS: 15,          // 対応した店員のストレス

  // --- 客同士の影響 -------------------------------------------
  SOCIAL: {
    radius: 3.4,             // 「近く」と見なす距離(m)
    shoutAnger: 8,           // 近くで怒鳴られた客の怒り上昇
    leaveAnger: 6.5,         // 他の客が怒って帰るのを見た
    envyAnger: 5,            // 楽しそうな接客を見て不満
    claimAnger: 5.5,         // 目の前でクレームが起きた
    entryPenalty: 0.052,     // 行列1人あたり、来店時の忍耐低下率
    entryMin: 0.45,          // 忍耐が減る下限倍率
    calmBonus: 0.55,         // 空いているときの怒り上昇倍率
    flowBonus: 0.68,         // 流れが良いときの怒り上昇倍率
    crowdPenalty: 0.05,      // 行列1人あたりの怒り上昇加算
  },

  // --- 平穏度 ---
  PEACE_MAX: 100,
  PEACE_DRAIN: {
    longWait: 0.17,          // 限界寸前の客1人につき毎秒
    complaint: 2.4,
    angryLeave: 3.6,
    highStress: 0.15,        // 高ストレス店員1人につき毎秒
    mistake: 2.0,
    conflict: 3.8,
    special: 1.8,
    meltdown: 3.0,
    turnedAway: 0.9,         // 受付制限で帰した客
  },
  PEACE_GAIN_HAPPY: 1.6,     // 満足して帰った客
  // フェーズごとの平穏度減少倍率(序盤ほど優しい)
  PEACE_PHASE_MUL: [0.5, 0.72, 0.94, 1.15],

  // --- 応援スタッフ ---
  SUPPORT_DURATION: 110,
  SUPPORT_COOLDOWN: 220,

  // --- 店長介入 ---
  MANAGER_DURATION: 46,
  MANAGER_COOLDOWN: 170,
  MANAGER_STRESS_MUL: 0.3,   // 介入中のストレス上昇倍率
  MANAGER_CALM: 2.2,         // 介入中の追加ストレス回復(毎秒)
  MANAGER_CLAIM_MUL: 2.0,    // クレーム対応の速度倍率

  // --- 受付制限 ---
  GATE_DURATION: 38,
  GATE_COOLDOWN: 145,

  // --- 特殊イベント ---
  SPECIAL_FIRST: 108,        // 最初の特殊イベントまで(秒)
  SPECIAL_INTERVAL: [72, 128],

  // --- 演出 ---
  RARE_CHANCE: 0.075,        // 特殊案件の発生率(序盤は更に抑制)
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
  // --- 危険な兆候 ---
  wait: '⌛',        // 待ちが長くなってきた
  limit: '🤬',       // 限界寸前
  strain: '😖',      // 高ストレス
  silent: '😶',      // 無言になった
  panic: '😱',       // パニック
  claim: '🗣️',      // クレーム対応中
  flee: '🏃',        // バックヤードへ逃げる
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

// 店内の空気(平穏度に応じた照明・空の色)
export const ATMOS = {
  skyCalm: 0x9fb6c9,
  skyBad: 0x6a5560,
  hemiCalm: 0xffffff,
  hemiBad: 0xffd9c8,
  groundCalm: 0x9c907f,
  groundBad: 0x6b4a4a,
};
