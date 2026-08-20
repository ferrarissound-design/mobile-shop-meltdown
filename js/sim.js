import { CFG, MOOD } from './config.js';
import {
  FAMILY_NAMES, GIVEN_NAMES, STAFF_TYPES, AGE_GROUPS, PURPOSES, TRAITS,
  STAFF_REPLIES, STAFF_STRAINED, SMALL_TALK, TROUBLES, RARE_CASES,
  ANGRY_LINES, LEAVE_LINES, HAPPY_LINES, BREAK_LINES, MELTDOWN_LINES,
  QUIT_LINES, CONFLICT_LINES,
  STAFF_TIRED, STAFF_SILENT, STAFF_PANIC, STAFF_LIMIT, CLAIM_LINES, REFUSE_LINES,
  ENVY_LINES, CROWD_LINES, CONTAGION_LINES, SPECIAL_EVENTS,
} from './data.js';
import { rand, randInt, pick, pickN, chance, pickWeighted, clamp } from './rng.js';
import { LAYOUT } from './shop.js';
import { findPath } from './nav.js';
import { Character, staffLook, customerLook } from './character.js';
import { Cascade } from './cascade.js';

const OPEN_HOUR = 10;

// ============================================================
// 店員
// ============================================================
class Staff {
  constructor(game, type, temp = false) {
    this.game = game;
    this.type = type;
    this.temp = temp;
    this.id = ++game._staffSeq;
    this.name = game.uniqueStaffName();
    this.fullName = this.name + ' ' + pick(GIVEN_NAMES);
    this.skill = clamp(type.skill * rand(0.9, 1.1), 0.2, 1.3);
    this.speedStat = clamp(type.speed * rand(0.9, 1.1), 0.3, 1.8);
    this.stress = temp ? 8 : rand(0, 12);
    this.fatigue = 0;
    this.mental = 100;
    this.sales = 0;
    this.served = 0;
    this.state = 'idle';
    this.timer = 0;
    this.counter = null;
    this.customer = null;
    this.idleTimer = rand(2, 8);
    this.meltdowns = 0;
    this.lifeTimer = temp ? CFG.SUPPORT_DURATION : Infinity;

    // --- ストレスによる行動 ---
    this.claimTimer = 0;      // クレーム対応の残り時間
    this.claimTarget = null;
    this.claims = 0;
    this.panicTimer = 0;      // パニック中(手が止まる)
    this.silentTimer = 0;     // 無言になっている
    this.refuse = 0;          // >0 の間は新しい客を取らない
    this.mismatches = 0;      // 力量に合わない案件を担当した回数
    this.causeId = null;      // 直近でこの人を追い込んだ出来事
    this.warned = false;      // 限界警告を出したか
    this.breakSeverity = 1;

    const look = staffLook(type.color);
    this.char = new Character(game.scene, look);
    this.char.root.userData.entity = this;
    this.char.kind = 'staff';
    const spot = pick(LAYOUT.idleSpots);
    this.char.setPos(spot.x + rand(-0.4, 0.4), spot.z + rand(-0.3, 0.3));
    this.anchor = { x: this.char.x, z: this.char.z };
    this.char.angle = Math.PI;
    this.char.setIcon(MOOD.normal);
  }

  get busy() {
    return this.state === 'serving' || this.state === 'toCounter' || this.state === 'wrapup'
      || this.state === 'claim' || this.state === 'toClaim';
  }
  get away() { return this.state === 'break' || this.state === 'toBreak' || this.state === 'meltdown' || this.state === 'gone'; }
  /** 新しい客を受けられるか */
  get available() { return this.state === 'idle' && this.refuse <= 0; }

  /** ストレス段階 0=低 1=中 2=高 3=限界 (タイプごとの耐久で閾値がずれる) */
  get tierIndex() {
    const r = this.type.resilience || 0;
    const [a, b, c] = CFG.STRESS_TIER;
    const s = this.stress;
    if (s >= c + r) return 3;
    if (s >= b + r) return 2;
    if (s >= a + r) return 1;
    return 0;
  }
  /** 接客の進行速度倍率(ストレスが高いほど遅い) */
  get speedMul() {
    let m = CFG.TIER_SPEED[this.tierIndex];
    if (this.panicTimer > 0) m *= 0.3;
    if (this.game.managerTimer > 0) m = Math.min(1, m + 0.2);
    return m;
  }
  get mistakeMul() {
    return CFG.TIER_MISTAKE[this.tierIndex] * (this.panicTimer > 0 ? 1.9 : 1);
  }
  get satisfyMul() { return CFG.TIER_SATISFY[this.tierIndex]; }

  moodIcon() {
    if (this.state === 'meltdown') return MOOD.broken;
    if (this.state === 'claim' || this.state === 'toClaim') return MOOD.claim;
    if (this.state === 'toBreak') return MOOD.flee;
    if (this.panicTimer > 0) return MOOD.panic;
    const t = this.tierIndex;
    if (t >= 3) return MOOD.tired;
    if (t === 2) return this.silentTimer > 0 ? MOOD.silent : MOOD.strain;
    if (t === 1) return MOOD.confused;
    return this.stress < 20 ? MOOD.happy : MOOD.normal;
  }

  addStress(v, causeId = null) {
    if (v > 0) {
      if (this.game.managerTimer > 0) v *= CFG.MANAGER_STRESS_MUL;
      if (causeId) this.causeId = causeId;
    }
    const before = this.tierIndex;
    this.stress = clamp(this.stress + v, 0, 100);
    if (v > 0) {
      const after = this.tierIndex;
      if (after > before) this.game.onStressTier(this, after);
    }
    if (this.stress >= CFG.STRESS_MELTDOWN && this.state !== 'meltdown' && this.state !== 'gone') {
      this.game.meltdown(this);
    }
  }

  goTo(x, z) {
    this.anchor = { x, z };
    this.char.setPath(findPath(this.char.x, this.char.z, x, z));
  }
}

// ============================================================
// 客
// ============================================================
class Customer {
  constructor(game, opts = {}) {
    this.game = game;
    this.id = ++game._custSeq;
    this.label = '客' + String(this.id).padStart(2, '0');
    this.age = pickWeighted(AGE_GROUPS).label;
    this.name = pick(FAMILY_NAMES) + 'さん';
    this.traits = pickN(TRAITS, randInt(1, 3));
    // 特殊イベントで指定された性格を必ず持たせる
    if (opts.traitName) {
      const t = TRAITS.find((x) => x.name === opts.traitName);
      if (t && !this.traits.includes(t)) this.traits[0] = t;
    }

    this.rare = opts.rare || null;
    const forced = opts.purposeName ? PURPOSES.find((p) => p.name === opts.purposeName) : null;
    this.purpose = this.rare
      ? { name: this.rare.name, diff: this.rare.diff, sales: [0, 4000], lines: [this.rare.beats[0].t] }
      : (forced || pick(PURPOSES));

    let diff = this.purpose.diff + (opts.diffAdd || 0);
    let timeMul = 1, angerMul = 1, patMul = 1, stressMul = 1, satisfyMul = 1;
    for (const t of this.traits) {
      diff += t.diffAdd || 0;
      timeMul *= t.timeMul || 1;
      angerMul *= t.angerMul || 1;
      patMul *= t.patience || 1;
      stressMul *= t.stressMul || 1;
      satisfyMul *= t.satisfy || 1;
    }
    this.difficulty = clamp(diff, 1, 6);
    this.timeMul = timeMul;
    this.angerMul = angerMul;
    this.stressMul = stressMul;
    this.satisfyMul = satisfyMul;
    this.patience = rand(CFG.PATIENCE_BASE[0], CFG.PATIENCE_BASE[1]) * patMul * (opts.patienceMul || 1);
    this.patienceBase = this.patience;

    this.anger = opts.angry ? rand(45, 62) : rand(0, 8);
    this.satisfaction = 55;
    this.waitTime = 0;
    this.state = 'entering';
    this.timer = 0;
    this.seat = null;
    this.counter = null;
    this.staff = null;
    this.troublesUsed = [];
    this.beatTimer = rand(1.0, 2.0);
    this.beatIndex = 0;
    this.pendingBeats = [];
    this.serveTime = 0;
    this.serveTotal = 0;
    this.complained = false;
    this.isClaimer = !!opts.angry;

    // --- 連鎖・相互作用 ---
    this.causeId = opts.causeId || null;  // この客の状況を生んだ出来事
    this.special = opts.special || null;  // 特殊イベント由来
    this.groupId = opts.groupId || null;
    this.mismatch = 0;                    // 担当店員との力量差
    this.timeBonus = opts.timeMul || 1;
    this.serveStart = 0;
    this.longLogged = false;
    this.waitLogged = false;
    this.entryShock = 0;                  // 入店時に行列を見て失った忍耐
    this.shoutTimer = 0;

    const look = customerLook();
    this.char = new Character(game.scene, look);
    this.char.root.userData.entity = this;
    this.char.kind = 'customer';
    this.char.setPos(rand(-1.2, 1.2), 10.4);
    this.anchor = { x: this.char.x, z: this.char.z };
    this.char.setIcon(MOOD.normal);
  }

  moodIcon() {
    if (this.anger >= 92) return MOOD.limit;
    if (this.anger >= 78) return MOOD.rage;
    if (this.anger >= 58) return MOOD.angry;
    if (this.anger >= 38) return MOOD.confused;
    // 危険な兆候: まだ怒ってはいないが待たされている
    if (this.state === 'waiting' && this.waitTime > 20) return MOOD.wait;
    if (this.satisfaction > 72) return MOOD.happy;
    return MOOD.normal;
  }

  /** 待ち時間(ゲーム内分) */
  get waitMinutes() { return this.waitTime * CFG.GAME_MIN_PER_SEC; }

  stateText() {
    return {
      entering: '入店中', toReception: '受付へ移動中', reception: '受付中',
      toSeat: '待合へ移動中', waiting: '順番待ち', toCounter: 'カウンターへ移動中', atCounter: '着席・呼び出し待ち',
      serving: '接客中', leaving: '退店中', complaining: '苦情を言っている',
    }[this.state] || this.state;
  }

  goTo(x, z) {
    this.anchor = { x, z };
    this.char.setPath(findPath(this.char.x, this.char.z, x, z));
  }
}

// ============================================================
// ゲーム本体
// ============================================================
export class Game {
  constructor(scene, hooks = {}) {
    this.scene = scene;
    this.hooks = hooks;
    this._staffSeq = 0;
    this._custSeq = 0;

    this.staff = [];
    this.customers = [];
    this.counters = LAYOUT.counters.map((c, i) => ({ idx: i, ...c, staff: null, customer: null }));
    this.receptionQueue = [];
    this.receptionBusyTimer = 0;

    this.time = 0;
    this.peace = CFG.PEACE_MAX;
    this.over = false;

    this.stats = {
      arrived: 0, served: 0, angryLeft: 0, complaints: 0, sales: 0,
      maxWait: 0, meltdowns: 0, quits: 0, mistakes: 0, specials: 0, maxQueue: 0,
      turnedAway: 0, specialEvents: 0, claims: 0, panics: 0, mismatch: 0, conflicts: 0,
      maxStress: 0,
    };
    this.causeTally = new Map();

    // --- 崩壊連鎖 ---
    this.cascade = new Cascade();
    this.queueCauseId = null;    // いまの行列を生んだ出来事
    this.shortageCause = null;   // 人手不足の原因(直近)
    this.socialMul = 1;          // 店内の空気による怒り倍率
    this.socialTimer = 0;
    this.flow = 0;               // 直近の「捌けている感」
    this.systemSlow = 0;         // システム遅延の残り時間

    this.spawnTimer = CFG.SPAWN_FIRST;
    this.randomEventTimer = rand(35, 60);
    this.specialTimer = CFG.SPECIAL_FIRST;
    this.supportCooldown = 0;
    this.supportActive = 0;

    // --- プレイヤー介入 ---
    this.managerTimer = 0;
    this.managerCooldown = 0;
    this.gateOn = false;
    this.gateTimer = 0;
    this.gateCooldown = 0;
    this.gateCauseId = null;

    this.usedNames = new Set();
    // 「新人」と「ベテラン」は必ず配置する。
    // 新人が難案件を掴む / ベテランがクレームに取られる、という連鎖の土台になる。
    const must = ['rookie', 'veteran'].map((id) => STAFF_TYPES.find((t) => t.id === id)).filter(Boolean);
    const rest = pickN(STAFF_TYPES.filter((t) => !must.includes(t)), Math.max(0, CFG.START_STAFF - must.length));
    const startTypes = [...must, ...rest];
    for (let i = 0; i < CFG.START_STAFF; i++) {
      this.staff.push(new Staff(this, startTypes[i] || pick(STAFF_TYPES)));
    }
    this.log(`本日の営業を開始しました(店員${this.staff.length}名)`, 'info');
  }

  uniqueStaffName() {
    if (!this.usedNames) this.usedNames = new Set();
    for (let i = 0; i < 30; i++) {
      const n = pick(FAMILY_NAMES);
      if (!this.usedNames.has(n)) { this.usedNames.add(n); return n; }
    }
    return pick(FAMILY_NAMES) + this._staffSeq;
  }

  // ---------- 便利 ----------
  get gameMinutes() { return this.time * CFG.GAME_MIN_PER_SEC; }
  clock() {
    const total = OPEN_HOUR * 60 + Math.floor(this.gameMinutes);
    const h = Math.floor(total / 60) % 24;
    const mm = Math.floor(total % 60);
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  elapsedText() {
    const total = Math.floor(this.gameMinutes);
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }
  log(text, kind = 'normal') { this.hooks.onLog?.(this.clock(), text, kind); }
  banner(text) { this.hooks.onBanner?.(text); }
  tally(key, n = 1) { this.causeTally.set(key, (this.causeTally.get(key) || 0) + n); }

  get waitingCount() {
    return this.customers.filter((c) => c.state === 'waiting' || c.state === 'toSeat' || c.state === 'reception' || c.state === 'toReception').length;
  }
  get chaos() { return 1 - this.peace / CFG.PEACE_MAX; }
  get activeStaff() { return this.staff.filter((s) => !s.away && s.state !== 'gone'); }
  get freeStaff() { return this.staff.filter((s) => s.available); }

  /** 進行フェーズ 0=序盤 1=中盤 2=後半 3=終盤 */
  get phase() {
    const [a, b, c] = CFG.PHASE_TIMES;
    if (this.time < a) return 0;
    if (this.time < b) return 1;
    if (this.time < c) return 2;
    return 3;
  }
  get phaseName() { return ['序盤', '中盤', '後半', '終盤'][this.phase]; }

  /** 店の余力 0(限界) - 1(余裕) */
  get slack() {
    const free = this.freeStaff.length;
    return clamp(0.5 + free * 0.4 - this.waitingCount * 0.09 - this.chaos * 0.35, 0, 1);
  }

  // ---------- 連鎖の記録 ----------
  /** 出来事を因果グラフに刻む */
  note(tag, label, opts = {}) {
    return this.cascade.record(tag, label, { ...opts, clock: this.clock(), t: this.time });
  }
  /** 平穏度を削り、その責任を出来事に紐づける */
  hurt(amount, nodeId = null) {
    const v = amount * CFG.PEACE_PHASE_MUL[this.phase];
    this.peace = clamp(this.peace - v, 0, CFG.PEACE_MAX);
    if (nodeId) this.cascade.addImpact(nodeId, v);
    return v;
  }
  /** 人手が減った原因を覚えておく(担当ミスマッチの遠因になる) */
  markShortage(id) { if (id) this.shortageCause = { id, t: this.time }; }
  get shortageCauseId() {
    return this.shortageCause && this.time - this.shortageCause.t < 80 ? this.shortageCause.id : null;
  }

  // ============================================================
  update(dt) {
    if (this.over) return;
    this.time += dt;

    this.updateTimers(dt);
    this.updateSocial(dt);
    this.updateSpawn(dt);
    this.updateReception(dt);
    for (const c of this.customers) this.updateCustomer(c, dt);
    for (const s of this.staff) this.updateStaff(s, dt);
    this.assign();
    this.updatePeace(dt);
    this.updateRandomEvents(dt);
    this.updateSpecialEvents(dt);

    // 退場処理
    this.customers = this.customers.filter((c) => {
      if (c.dead) { c.char.dispose(); return false; }
      return true;
    });
    this.staff = this.staff.filter((s) => {
      if (s.dead) { s.char.dispose(); return false; }
      return true;
    });

    const q = this.waitingCount;
    if (q > this.stats.maxQueue) {
      this.stats.maxQueue = q;
      if (q === 5 || q === 8 || q === 12 || q === 16) {
        const id = this.note('queue', `待ち人数が${q}人に膨張`, {
          causes: [this.queueCauseId, this.shortageCauseId],
          meta: { minutes: Math.round(this.stats.maxWait) },
        });
        this.queueCauseId = id;
        this.log(`待ち人数が${q}人になりました`, q >= 8 ? 'bad' : 'warn');
        if (q >= 8) this.banner(`⚠ 待ち人数 ${q}人`);
      }
    }
    for (const s of this.staff) if (s.stress > this.stats.maxStress) this.stats.maxStress = Math.round(s.stress);

    if (this.peace <= 0) this.gameOver();
  }

  // ---------- 各種タイマー ----------
  updateTimers(dt) {
    if (this.supportCooldown > 0) this.supportCooldown = Math.max(0, this.supportCooldown - dt);
    if (this.managerCooldown > 0) this.managerCooldown = Math.max(0, this.managerCooldown - dt);
    if (this.gateCooldown > 0) this.gateCooldown = Math.max(0, this.gateCooldown - dt);
    if (this.systemSlow > 0) this.systemSlow = Math.max(0, this.systemSlow - dt);
    if (this.managerTimer > 0) {
      this.managerTimer = Math.max(0, this.managerTimer - dt);
      // 店長がいる間はストレスが少しずつ抜けていく
      for (const s of this.staff) if (!s.away) s.stress = clamp(s.stress - CFG.MANAGER_CALM * dt, 0, 100);
      if (this.managerTimer === 0) this.log('店長が事務所に戻りました', 'info');
    }
    if (this.gateOn) {
      this.gateTimer -= dt;
      if (this.gateTimer <= 0) this.closeGate();
    }
  }

  // ---------- 店内の空気(客同士の影響) ----------
  updateSocial(dt) {
    this.flow = Math.max(0, this.flow - dt * 0.07);
    this.socialTimer -= dt;
    if (this.socialTimer > 0) return;
    this.socialTimer = 0.5;

    const q = this.waitingCount;
    let mul = 1 + this.chaos * 0.32;
    if (q <= 2) mul *= CFG.SOCIAL.calmBonus;           // 空いている → 忍耐が持つ
    else mul *= 1 + Math.max(0, q - 3) * CFG.SOCIAL.crowdPenalty;
    if (this.flow > 1.2) mul *= CFG.SOCIAL.flowBonus;  // スムーズに捌けている
    let angry = 0;
    for (const c of this.customers) if (c.anger > 72) angry++;
    mul *= 1 + angry * 0.07;
    this.socialMul = clamp(mul, 0.3, 2.8);

    // 空いていて店員に余裕があるときは、怒りがゆっくり収まる
    if (q <= 2 && this.freeStaff.length >= 1) {
      for (const c of this.customers) {
        if (c.state === 'waiting') c.anger = Math.max(0, c.anger - 1.1);
      }
    }
  }

  /**
   * ある客の周囲にいる待ち客へ感情を伝播させる。
   * 単発イベント時だけ呼ぶので O(n) で済む。
   */
  broadcast(origin, amount, causeId = null, lines = null) {
    const R = CFG.SOCIAL.radius;
    const ox = origin.char.x, oz = origin.char.z;
    let hit = 0;
    let witness = null;
    for (const x of this.customers) {
      if (x === origin || x.dead) continue;
      if (x.state !== 'waiting' && x.state !== 'toSeat' && x.state !== 'reception' && x.state !== 'toReception') continue;
      const d = Math.hypot(x.char.x - ox, x.char.z - oz);
      if (d > R) continue;
      x.anger = clamp(x.anger + amount * (1 - (d / R) * 0.5), 0, 120);
      if (causeId) x.causeId = causeId;
      hit++;
      if (!witness || chance(0.4)) witness = x;
    }
    if (hit >= 2 && lines && witness && chance(0.55)) witness.char.say(pick(lines), 'c', 2.8);
    return hit;
  }

  // ---------- 来店 ----------
  updateSpawn(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const ramp = 1 / (1 + this.time / CFG.SPAWN_RAMP);
    let interval = clamp(CFG.SPAWN_BASE * ramp, CFG.SPAWN_MIN, CFG.SPAWN_BASE);
    interval *= rand(0.65, 1.4);
    this.spawnTimer = interval;
    if (this.gateOn) { this.turnAway(); return; }
    if (this.customers.length >= CFG.MAX_CUSTOMERS) return;
    if (this.customers.length + this.staff.length >= CFG.MAX_CHARACTERS) return;
    this.spawnCustomer();
  }

  /** 受付制限中: 来店をあきらめた客 */
  turnAway() {
    this.stats.turnedAway++;
    const id = this.note('gate', `受付制限中に客が引き返した(${this.stats.turnedAway}人目)`, {
      causes: [this.gateCauseId],
    });
    this.hurt(CFG.PEACE_DRAIN.turnedAway, id);
    if (this.stats.turnedAway % 3 === 0) {
      this.log(`受付制限中: ${this.stats.turnedAway}人が入店せずに帰りました`, 'warn');
    }
  }

  spawnCustomer(opts = {}) {
    let o = { ...opts };
    // 序盤は特殊案件を強く抑制し、後半にかけて増やす
    const rareMul = this.time < CFG.GRACE_TIME ? 0.12 : [0.5, 0.9, 1.15, 1.35][this.phase];
    if (!o.rare && !o.purposeName && chance(CFG.RARE_CHANCE * rareMul)) o.rare = pick(RARE_CASES);
    const c = new Customer(this, o);
    this.customers.push(c);
    this.stats.arrived++;
    c.state = 'toReception';

    // --- 客同士の影響: 行列を見た瞬間に忍耐が削られる ---
    const q = this.waitingCount;
    if (q >= 4) {
      const mul = Math.max(CFG.SOCIAL.entryMin, 1 - (q - 3) * CFG.SOCIAL.entryPenalty);
      c.entryShock = 1 - mul;
      c.patience *= mul;
      c.anger = clamp(c.anger + Math.min(16, (q - 3) * 1.5), 0, 120);
      if (!c.causeId) c.causeId = this.queueCauseId;
      if (q >= 6 && chance(0.45)) c.char.say(pick(CROWD_LINES), 'c', 2.8);
    }

    this.enterReception(c);
    if (c.rare) {
      this.stats.specials++;
      this.banner('⚠ 特殊案件発生');
      this.log(`⚠ 特殊案件:${c.label}「${c.rare.name}」`, 'special');
      this.tally('rare:' + c.rare.name);
      const id = this.note('rare', `特殊案件「${c.rare.name}」が来店`, {
        causes: [c.causeId], meta: { special: c.rare.name, purpose: c.rare.name },
      });
      c.causeId = id;
      this.hurt(CFG.PEACE_DRAIN.special, id);
    } else if (c.isClaimer) {
      this.banner('⚠ クレーマー来店');
      this.log(`⚠ クレーマーが来店しました(${c.label})`, 'bad');
      this.tally('claimer');
      const id = this.note('claimer', `クレーマーが来店(${c.purpose.name})`, {
        causes: [c.causeId], meta: { purpose: c.purpose.name, trait: c.traits[0] && c.traits[0].name },
      });
      c.causeId = id;
    } else {
      this.log(`${c.label}が来店しました(${c.purpose.name})`, 'normal');
    }
    this.tally('purpose:' + c.purpose.name);
    return c;
  }

  receptionSpots() {
    const base = LAYOUT.reception.spot;
    return [
      { x: base.x, z: base.z },
      { x: base.x + 1.1, z: base.z + 1.1 },
      { x: base.x + 2.3, z: base.z + 1.7 },
      { x: base.x + 3.5, z: base.z + 2.0 },
    ];
  }

  enterReception(c) {
    const spots = this.receptionSpots();
    if (this.receptionQueue.length >= spots.length) {
      // 受付が渋滞 → そのまま待合へ
      this.log(`受付が混雑しています(${c.label}はそのまま待機)`, 'warn');
      this.toWaiting(c);
      return;
    }
    this.receptionQueue.push(c);
    c.state = 'toReception';
    const s = spots[this.receptionQueue.length - 1];
    c.goTo(s.x, s.z);
  }

  updateReception(dt) {
    const spots = this.receptionSpots();
    this.receptionQueue.forEach((c, i) => {
      const s = spots[Math.min(i, spots.length - 1)];
      if (Math.hypot(c.anchor.x - s.x, c.anchor.z - s.z) > 0.15) c.goTo(s.x, s.z);
    });
    const head = this.receptionQueue[0];
    if (!head) return;
    if (!head.char.arrived) return;
    if (head.state === 'toReception') {
      head.state = 'reception';
      head.char.face(LAYOUT.reception.deskX, LAYOUT.reception.deskZ);
      head.timer = rand(CFG.RECEPTION_TIME[0], CFG.RECEPTION_TIME[1]);
      if (chance(0.5)) head.char.say(pick(head.purpose.lines), 'c', 2.6);
    } else if (head.state === 'reception') {
      head.timer -= dt;
      if (head.timer <= 0) {
        this.receptionQueue.shift();
        this.toWaiting(head);
      }
    }
  }

  // ---------- 待合 ----------
  freeSeat() {
    const used = new Set(this.customers.map((c) => c.seat).filter((s) => s !== null && s !== undefined));
    for (let i = 0; i < LAYOUT.seats.length; i++) if (!used.has(i)) return i;
    return -1;
  }
  freeStand() {
    const used = new Set(this.customers.map((c) => c.standIdx).filter((s) => s !== null && s !== undefined));
    for (let i = 0; i < LAYOUT.standSpots.length; i++) if (!used.has(i)) return i;
    return -1;
  }

  toWaiting(c) {
    c.state = 'toSeat';
    const si = this.freeSeat();
    if (si >= 0) {
      c.seat = si;
      const s = LAYOUT.seats[si];
      c.goTo(s.x, s.z + 0.05);
    } else {
      const st = this.freeStand();
      c.standIdx = st >= 0 ? st : null;
      const s = st >= 0 ? LAYOUT.standSpots[st] : { x: rand(-2, 6), z: rand(6.0, 7.0) };
      c.goTo(s.x, s.z);
    }
  }

  // ---------- 客の更新 ----------
  updateCustomer(c, dt) {
    const ch = c.char;

    switch (c.state) {
      case 'toSeat':
        if (ch.arrived) {
          c.state = 'waiting';
          if (c.seat !== null && c.seat !== undefined) {
            ch.setSitting(true);
            ch.angle = Math.PI; // カウンター方向
          } else {
            ch.face(0, -4);
          }
        }
        break;

      case 'waiting': {
        c.waitTime += dt;
        // 立ち待ちの客は、椅子が空いたら座りに行く
        if (c.seat === null || c.seat === undefined) {
          c.reseatTimer = (c.reseatTimer || 0) - dt;
          if (c.reseatTimer <= 0) {
            c.reseatTimer = 2.0;
            const si = this.freeSeat();
            if (si >= 0) {
              c.seat = si;
              c.standIdx = null;
              c.state = 'toSeat';
              const sp = LAYOUT.seats[si];
              c.goTo(sp.x, sp.z + 0.05);
              break;
            }
          }
        }
        const mins = c.waitMinutes;
        this.stats.maxWait = Math.max(this.stats.maxWait, mins);
        // 店内の空気(行列・怒っている客・捌けている感)が怒りの速度を変える
        const rate = (100 / c.patience) * c.angerMul * CFG.ANGER_WAIT_RATE * this.socialMul;
        c.anger = clamp(c.anger + rate * dt, 0, 120);
        ch.agitation = clamp((c.anger - 45) / 45, 0, 1);

        // 危険な兆候: 待ち時間が一定を超えたら連鎖に刻む
        if (!c.waitLogged && mins > 12) {
          c.waitLogged = true;
          const id = this.note('longWait', `${c.label}(${c.purpose.name})の待ち時間が${Math.round(mins)}分を超える`, {
            causes: [c.causeId, this.queueCauseId],
            meta: { minutes: Math.round(mins), purpose: c.purpose.name },
          });
          c.causeId = id;
          // queueCauseId は「行列を作った構造的な原因」を指したままにしておく
          // (ここで上書きすると連鎖が待ち時間ノードの数珠つなぎになる)
        }

        // 怒鳴り声は周囲へ伝染する
        if (c.anger > 60 && chance(dt * 0.09)) {
          ch.say(pick(ANGRY_LINES), 'c', 2.4);
          if (c.anger > 78) {
            const hit = this.broadcast(c, CFG.SOCIAL.shoutAnger, c.causeId, CONTAGION_LINES);
            if (hit >= 3 && chance(0.35)) {
              const id = this.note('contagion', `${c.label}の怒鳴り声が周囲${hit}人へ伝染`, {
                causes: [c.causeId], meta: { purpose: c.purpose.name },
              });
              this.log(`${c.label}の声で待合の空気が悪くなりました(${hit}人に影響)`, 'warn');
              this.hurt(0.6, id);
            }
          }
        }
        if (c.anger >= 100) this.customerLimit(c);
        break;
      }

      case 'toCounter':
        if (ch.arrived) {
          ch.setSitting(true);
          ch.angle = Math.PI; // カウンター(奥)を向く
          c.state = 'atCounter';
          c.timer = 14;
        }
        break;

      case 'atCounter': {
        c.timer -= dt;
        const cn = this.counters[c.counter];
        const st = cn && cn.staff;
        if (st && st.state === 'waitingGuest') {
          c.state = 'serving';
          this.beginServe(c, cn);
        } else if (!st || c.timer <= 0) {
          // 店員が来られなくなった
          if (cn) { cn.staff = null; cn.customer = null; }
          c.counter = null; c.staff = null;
          ch.setSitting(false);
          c.anger = clamp(c.anger + 12, 0, 120);
          this.toWaiting(c);
        }
        break;
      }

      case 'serving':
        this.updateServe(c, dt);
        break;

      case 'complaining':
        c.timer -= dt;
        ch.agitation = 1;
        if (c.timer <= 0) this.leave(c, 'angry');
        break;

      case 'leaving':
        if (ch.arrived) c.dead = true;
        break;
    }

    // 立ち待ちの客もじりじり怒る
    if (c.state === 'toReception' || c.state === 'reception') {
      c.waitTime += dt * 0.6;
      c.anger = clamp(c.anger + (100 / c.patience) * c.angerMul * 0.35 * dt, 0, 120);
    }

    ch.setIcon(c.rare && c.state === 'serving' ? MOOD.special : c.moodIcon());
    // 怒っている客の足元に赤いエフェクト(危険な兆候の可視化)
    ch.setAura(c.anger >= 68 ? clamp((c.anger - 68) / 32, 0.25, 1) : 0);
  }

  customerLimit(c) {
    if (c.seat !== null && c.seat !== undefined) c.char.setSitting(false);
    if (chance(0.45)) {
      // 店員へ詰め寄る
      c.state = 'complaining';
      c.timer = rand(3.0, 5.0);
      const target = this.counters.find((cn) => cn.staff) || this.counters[1];
      c.goTo(target.guestSpot.x + rand(-1.4, 1.4), target.guestSpot.z + 1.0);
      c.char.say(pick(['責任者を出してください！', 'どれだけ待たせるんですか！', 'いい加減にしてください！']), 'c', 4);
      this.complaint(c, target.staff);
    } else {
      c.char.say(pick(LEAVE_LINES), 'c', 3);
      this.leave(c, 'angry');
    }
  }

  /**
   * クレーム発生。
   * ここが連鎖の要: 対応できる店員が1名「取られる」ため、
   * 残りの人員で難案件を回すことになり、次の問題を生む。
   */
  complaint(c, staff, causeId = null) {
    this.stats.complaints++;
    this.tally('complaint');
    c.complained = true;
    const id = this.note('complaint', `${c.label}がクレーム(${c.purpose.name})`, {
      causes: [causeId, c.causeId, this.queueCauseId],
      meta: { purpose: c.purpose.name, trait: c.traits[0] && c.traits[0].name },
    });
    c.causeId = id;
    this.hurt(CFG.PEACE_DRAIN.complaint, id);
    this.log(`${c.label}がクレーム「${c.purpose.name}」`, 'bad');

    // 周囲の客に空気が伝染する
    const hit = this.broadcast(c, CFG.SOCIAL.claimAnger, id, CONTAGION_LINES);
    if (hit >= 2) this.log(`周囲の客${hit}人に不穏な空気が広がりました`, 'warn');

    const handler = this.assignClaimHandler(c, id);
    if (!handler && staff) {
      staff.addStress(10 * c.stressMul, id);
      staff.char.say(pick(STAFF_STRAINED), 's', 2.5);
    }
    return id;
  }

  /** 一番頼れる店員がクレーム対応に取られる */
  assignClaimHandler(c, causeId) {
    const rank = (a, b) => (b.skill * 1.4 - b.stress / 90) - (a.skill * 1.4 - a.stress / 90);
    // まず手の空いている店員、次に事後処理中の店員
    let pool = this.staff.filter((s) => s.state === 'idle' && !s.away);
    if (!pool.length) pool = this.staff.filter((s) => s.state === 'wrapup' && !s.away);

    if (!pool.length) {
      // 誰も空いていない → 接客中のベテランを引き剥がす
      // (対応中だった客は待合へ戻され、それがまた次の火種になる)
      const serving = this.staff.filter((s) => s.state === 'serving' && !s.away);
      if (serving.length > 1 && this.activeStaff.length > 1) {
        serving.sort(rank);
        const s = serving[0];
        const victim = s.customer;
        const cn = s.counter !== null ? this.counters[s.counter] : null;
        if (cn) { cn.staff = null; cn.customer = null; }
        s.customer = null;
        s.counter = null;
        s.char.setSitting(false);
        if (victim && !victim.dead) {
          victim.staff = null;
          victim.counter = null;
          victim.char.setSitting(false);
          victim.anger = clamp(victim.anger + 24, 0, 120);
          victim.state = 'toSeat';
          this.toWaiting(victim);
          const vid = this.note('interrupt', `${victim.label}の接客がクレーム対応で中断`, {
            causes: [causeId], meta: { purpose: victim.purpose.name, staff: s.name, staffType: s.type.name },
          });
          victim.causeId = vid;
          this.hurt(1.2, vid);
          this.log(`${victim.label}の接客が中断されました(${s.name}はクレーム対応へ)`, 'bad');
        }
        return this.startClaim(s, c, causeId);
      }
      const id = this.note('noHandler', 'クレーム対応に回せる店員がいない', { causes: [causeId] });
      this.markShortage(id);
      this.hurt(0.8, id);
      this.log('クレーム対応に回せる店員がいません', 'bad');
      return null;
    }
    pool.sort(rank);
    return this.startClaim(pool[0], c, causeId);
  }

  startClaim(s, c, causeId) {
    if (s.counter !== null && this.counters[s.counter] && this.counters[s.counter].staff === s) {
      this.counters[s.counter].staff = null;
      this.counters[s.counter].customer = null;
    }
    s.counter = null;
    s.state = 'toClaim';
    s.claimTarget = c;
    s.claimTimer = rand(CFG.CLAIM_TIME[0], CFG.CLAIM_TIME[1])
      / (this.managerTimer > 0 ? CFG.MANAGER_CLAIM_MUL : 1);
    s.refuse = 0;
    s.char.setSitting(false);
    s.goTo(c.char.x + rand(-0.9, 0.9), c.char.z + 1.1);
    s.char.say(pick(CLAIM_LINES), 's', 3.2);
    s.claims++;
    const id = this.note('claimHandler', `${s.type.name}・${s.name}がクレーム対応へ`, {
      causes: [causeId], meta: { staff: s.name, staffType: s.type.name },
    });
    s.causeId = id;
    this.markShortage(id);
    this.log(`${s.name}(${s.type.name})がクレーム対応に入りました`, 'warn');
    return s;
  }

  leave(c, mode) {
    c.seat = null; c.standIdx = null;
    const qi = this.receptionQueue.indexOf(c);
    if (qi >= 0) this.receptionQueue.splice(qi, 1);
    c.char.setSitting(false);
    c.state = 'leaving';
    c.goTo(LAYOUT.exit.x + rand(-1, 1), LAYOUT.exit.z + 1.4);
    if (mode === 'angry') {
      this.stats.angryLeft++;
      this.tally('angryLeave');
      const mins = Math.round(c.waitMinutes);
      const id = this.note('angryLeave', `${c.label}が怒って帰る(待ち${mins}分)`, {
        causes: [c.causeId, this.queueCauseId],
        meta: { purpose: c.purpose.name, minutes: mins, trait: c.traits[0] && c.traits[0].name },
      });
      this.hurt(CFG.PEACE_DRAIN.angryLeave, id);
      c.char.setIcon(MOOD.rage);
      c.char.agitation = 1;
      this.log(`${c.label}が怒って帰りました(待ち${mins}分)`, 'bad');
      // 「そんなに待つの？」— 残された客の不満が上がる
      const hit = this.broadcast(c, CFG.SOCIAL.leaveAnger, id, CONTAGION_LINES);
      if (hit >= 3) {
        this.log(`${c.label}の退店を見た${hit}人の不満が上がりました`, 'warn');
        this.cascade.addImpact(id, 0.5);
      }
    } else {
      const happy = c.satisfaction > 62;
      c.char.setIcon(happy ? MOOD.happy : MOOD.normal);
      if (happy) {
        this.peace = Math.min(CFG.PEACE_MAX, this.peace + CFG.PEACE_GAIN_HAPPY);
        c.char.say(pick(HAPPY_LINES), 'c', 3);
        this.flow += 1;
        // 楽しそうに帰る客を見て、待たされている客の一部が苛立つ
        if (this.waitingCount >= 5) this.broadcast(c, CFG.SOCIAL.envyAnger, c.causeId, ENVY_LINES);
      } else {
        this.flow += 0.4;
      }
      this.stats.served++;
    }
  }

  // ---------- 接客の割り当て ----------
  assign() {
    const waiting = this.customers.filter((c) => c.state === 'waiting' && c.char.arrived);
    if (!waiting.length) return;
    const freeStaff = this.staff.filter((s) => s.available);
    if (!freeStaff.length) return;
    const freeCounters = this.counters.filter((cn) => !cn.staff && !cn.customer);
    if (!freeCounters.length) return;

    // 怒っている客を優先しつつ、待たせすぎた客が永遠に後回しにならないようにする
    waiting.sort((a, b) => (b.anger * 1.3 + b.waitTime * 2.0) - (a.anger * 1.3 + a.waitTime * 2.0));
    // 実力のある店員から順に埋まる。人手が足りないと「選べない」
    freeStaff.sort((a, b) => (b.skill - b.stress / 220) - (a.skill - a.stress / 220));

    for (const cn of freeCounters) {
      const s = freeStaff.shift();
      const c = waiting.shift();
      if (!s || !c) break;
      cn.staff = s; cn.customer = c;
      s.state = 'toCounter'; s.counter = cn.idx; s.customer = c;
      s.goTo(cn.staffSpot.x, cn.staffSpot.z);
      c.state = 'toCounter'; c.counter = cn.idx; c.staff = s;
      c.seat = null; c.standIdx = null;
      c.char.setSitting(false);
      c.char.agitation = 0;
      c.goTo(cn.guestSpot.x, cn.guestSpot.z);
      this.log(`${s.name}が${c.label}を${cn.idx + 1}番へご案内`, 'good');

      // --- 力量と案件のミスマッチ = 連鎖の代表的な起点 ---
      // ★6 は誰にとっても重いので、ベテランが担当しても「ミスマッチ」とは呼ばない
      const gap = c.difficulty - s.skill * 5.4;
      if (gap >= 1.3) {
        c.mismatch = clamp(gap / 2.2, 0, 1.4);
        this.stats.mismatch++;
        s.mismatches++;
        const id = this.note('mismatch', `${s.type.name}・${s.name}が${c.purpose.name}(★${c.difficulty})を担当`, {
          causes: [this.shortageCauseId, c.causeId],
          meta: { staff: s.name, staffType: s.type.name, purpose: c.purpose.name },
        });
        c.causeId = id;
        s.causeId = id;
        this.log(`${s.name}(${s.type.name})が難案件「${c.purpose.name}」を担当します`, 'warn');
      } else {
        c.mismatch = 0;
      }
    }
  }

  // ---------- 接客 ----------
  beginServe(c, cn) {
    const s = cn.staff;
    if (!s) { this.leave(c, 'done'); return; }
    let speed = s.speedStat;
    if (s.type.id === 'avoider') speed *= c.difficulty <= 2 ? 1.45 : 0.62;
    let base = CFG.BASE_SERVE_TIME * c.difficulty * c.timeMul / Math.max(0.3, speed);
    if (c.mismatch) base *= 1 + c.mismatch * 0.5;   // 不慣れな担当は時間がかかる
    base *= c.timeBonus || 1;
    c.serveTotal = base;
    c.serveTime = base;
    c.serveStart = this.time;
    c.longLogged = false;
    c.beatTimer = 0.6;
    c.beatIndex = 0;
    s.state = 'serving';
    s.char.face(cn.guestSpot.x, cn.guestSpot.z);
  }

  updateServe(c, dt) {
    const cn = this.counters[c.counter];
    const s = cn && cn.staff;
    if (!s || s.state !== 'serving') return; // 店員が離脱した場合は下で処理

    // ストレスが高いほど手続きが進まない ← 負の連鎖の中核
    let prog = s.speedMul;
    if (this.systemSlow > 0) prog *= 0.72;
    c.serveTime -= dt * prog;
    if (s.panicTimer > 0) s.panicTimer = Math.max(0, s.panicTimer - dt);

    s.fatigue = clamp(s.fatigue + CFG.FATIGUE_RATE * dt, 0, 100);
    s.addStress(
      dt * 0.15 * s.type.stressGain * (c.difficulty / 3) * c.stressMul * (1 + (c.mismatch || 0) * 0.55),
      c.causeId
    );
    c.anger = clamp(c.anger - dt * 1.2 * s.type.satisfy * s.satisfyMul, 0, 120);

    // 接客が長引いているか(待ち行列の原因として記録する)
    const elapsed = this.time - c.serveStart;
    if (!c.longLogged && elapsed > CFG.LONG_SERVE) {
      c.longLogged = true;
      const mins = Math.round(elapsed * CFG.GAME_MIN_PER_SEC);
      // ここでは閾値に達したことだけを記録する。
      // 実際に何分かかったかは接客完了時に relabel で書き直す。
      const id = this.note('longServe', `${c.purpose.name}の接客が長期化`, {
        causes: [c.causeId],
        meta: { purpose: c.purpose.name, staff: s.name, staffType: s.type.name },
      });
      c.causeId = id;
      c.longNodeId = id;
      this.markShortage(id);
      if (!this.queueCauseId) this.queueCauseId = id;
      this.log(`${s.name}の接客が長引いています(${c.purpose.name} ${mins}分)`, 'warn');
    }

    c.beatTimer -= dt;
    if (c.beatTimer <= 0) {
      c.beatTimer = rand(CFG.SERVE_BEAT[0], CFG.SERVE_BEAT[1]);
      this.serveBeat(c, s);
    }

    if (c.serveTime <= 0) this.finishServe(c, s);
  }

  serveBeat(c, s) {
    // 保留中のビート(トラブルの続き)を先に消化
    if (c.pendingBeats.length) {
      const b = c.pendingBeats.shift();
      (b.w === 'c' ? c.char : s.char).say(b.t, b.w, 3.0);
      return;
    }

    if (c.beatIndex === 0) {
      c.char.say(pick(c.purpose.lines), 'c', 3.0);
      c.beatIndex++;
      return;
    }
    if (c.beatIndex === 1) {
      s.char.say(s.tierIndex >= 2 ? pick(STAFF_STRAINED) : pick(STAFF_REPLIES), 's', 2.6);
      c.beatIndex++;
      return;
    }
    c.beatIndex++;

    // --- 高ストレス: 無言になる / バックヤードを見る / ときに衝突する ---
    if (s.tierIndex >= 2 && chance(0.3 + (s.tierIndex - 2) * 0.2)) {
      // 短気なタイプは、黙る代わりに言い返してしまう
      if (chance((s.type.conflict || 0) * 0.28 * (s.tierIndex - 1))) {
        this.conflict(s, c, c.causeId);
        return;
      }
      s.silentTimer = 4.0;
      s.char.say(pick(s.tierIndex >= 3 ? STAFF_LIMIT : STAFF_SILENT), 's', 2.8);
      c.anger = clamp(c.anger + 4 + s.tierIndex * 2, 0, 120);
      c.serveTime += 1.8;
      c.serveTotal += 1.8;
      return;
    }
    // --- 中ストレス: セリフが疲れてくる ---
    if (s.tierIndex === 1 && chance(CFG.TIER_TALK[1])) {
      s.char.say(pick(STAFF_TIRED), 's', 2.6);
      c.serveTime += 0.8;
      return;
    }
    // --- 売上至上主義: 混雑していても提案を続けて接客を長引かせる ---
    if ((s.type.push || 0) > 0.5 && this.waitingCount >= 4 && chance(0.4)) {
      s.char.say(pick([
        'こちらの補償オプションもいかがですか',
        'ついでに光回線も見ていきませんか',
        'タブレットも一緒にどうでしょう',
        '今ならクレジットカードも同時申込で……',
      ]), 's', 3.0);
      c.anger = clamp(c.anger + 9, 0, 120);
      c.serveTime += 3.4;
      c.serveTotal += 3.4;
      c.salesBonus = (c.salesBonus || 1) * 1.12;
      const id = this.note('push', `${s.name}が混雑中も追加提案を継続`, {
        causes: [c.causeId], meta: { staff: s.name, staffType: s.type.name, purpose: c.purpose.name },
      });
      c.causeId = id;
      this.markShortage(id);
      return;
    }

    // レア案件の専用ビート
    if (c.rare && c.beatIndex === 3) {
      c.pendingBeats = c.rare.beats.slice(1);
      c.char.say(c.rare.beats[0].t, 'c', 3.2);
      s.addStress(c.rare.stress * s.type.stressGain * c.stressMul * 0.34, c.causeId);
      c.serveTime += c.rare.time;
      c.serveTotal += c.rare.time;
      this.log(`${c.label}「${c.rare.name}」→ ${s.name} ストレス +${Math.round(c.rare.stress * 0.34)}`, 'special');
      if (c.rare.complaint) this.complaint(c, s, c.causeId);
      return;
    }

    // トラブル発生(開店直後は起きにくい)
    const troubleChance = this.time < CFG.GRACE_TIME
      ? 0.12
      : 0.36 + this.chaos * 0.22 + (c.mismatch || 0) * 0.12;
    if (c.troublesUsed.length < 2 && chance(troubleChance)) {
      const pool = TROUBLES.filter((t) => !c.troublesUsed.includes(t.id));
      if (pool.length) {
        const t = pickWeighted(pool);
        c.troublesUsed.push(t.id);
        c.pendingBeats = t.beats.slice(1);
        (t.beats[0].w === 'c' ? c.char : s.char).say(t.beats[0].t, t.beats[0].w, 3.2);
        const st = t.stress * 0.5 * s.type.stressGain * c.stressMul;
        const id = this.note('trouble', `${c.label}に「${t.name}」が発生`, {
          causes: [c.causeId],
          meta: { trouble: t.name, purpose: c.purpose.name, staff: s.name, staffType: s.type.name },
        });
        c.causeId = id;
        s.addStress(st, id);
        c.anger = clamp(c.anger + t.anger, 0, 120);
        c.serveTime += t.time * 0.7 * c.timeMul;
        c.serveTotal += t.time * 0.7 * c.timeMul;
        if (t.salesBonus) c.salesBonus = (c.salesBonus || 1) * t.salesBonus;
        this.tally('trouble:' + t.name);
        this.log(`${c.label}「${t.beats[0].t}」 ${s.name} ストレス +${Math.round(st)}`, 'warn');
        if (t.twist) this.log(`→ ${t.twist}`, 'info');

        // 新人は難案件でパニックになりやすい
        if ((s.type.panic || 0) > 0.3 && c.difficulty >= 4
            && chance(s.type.panic * (s.tierIndex >= 1 ? 0.5 : 0.22))) {
          this.panic(s, c, id);
        } else if (s.tierIndex >= 2 && chance((s.type.conflict || 0) * 0.32)) {
          // ストレスの高い店員が客と衝突する(短気ほど起きやすい)
          this.conflict(s, c, id);
        }
        return;
      }
    }

    // 雑談 / 相槌
    if (c.traits.some((t) => t.name === '世間話が長い') && chance(0.5)) {
      c.char.say(pick(SMALL_TALK), 'c', 3.0);
      c.serveTime += 2.2;
      s.addStress(1.5 * s.type.stressGain);
    } else if (chance(0.5)) {
      s.char.say(s.stress > 65 ? pick(STAFF_STRAINED) : pick(STAFF_REPLIES), 's', 2.4);
    } else {
      c.char.say(pick(SMALL_TALK), 'c', 2.8);
    }
  }

  conflict(s, c, causeId = null) {
    s.char.say(pick(CONFLICT_LINES), 's', 3.2);
    c.anger = clamp(c.anger + 28, 0, 120);
    this.stats.complaints++;
    this.stats.conflicts++;
    this.tally('conflict');
    const id = this.note('conflict', `${s.type.name}・${s.name}が${c.label}と口論`, {
      causes: [causeId, s.causeId, c.causeId],
      meta: { staff: s.name, staffType: s.type.name, purpose: c.purpose.name },
    });
    this.hurt(CFG.PEACE_DRAIN.conflict, id);
    s.causeId = id;
    c.causeId = id;
    this.log(`${s.name}と${c.label}が口論になりました`, 'bad');
    this.banner('💢 店員と客が口論');
    s.addStress(8, id);
    // 口論は待合の空気を一気に悪くする
    const hit = this.broadcast(c, CFG.SOCIAL.shoutAnger * 1.2, id, CONTAGION_LINES);
    if (hit >= 2) this.log(`待合の客${hit}人がその様子を見ていました`, 'warn');
  }

  /** 新人などがパニックを起こす */
  panic(s, c, causeId = null) {
    if (s.panicTimer > 0) return;
    s.panicTimer = rand(5, 9);
    s.char.say(pick(STAFF_PANIC), 's', 3.4);
    const id = this.note('panic', `${s.type.name}・${s.name}がパニックに`, {
      causes: [causeId, s.causeId],
      meta: { staff: s.name, staffType: s.type.name, purpose: c.purpose.name },
    });
    s.addStress(12 * s.type.stressGain, id);
    c.anger = clamp(c.anger + 10, 0, 120);
    c.serveTime += 4;
    c.serveTotal += 4;
    c.causeId = id;
    this.stats.panics++;
    this.hurt(0.9, id);
    this.log(`${s.name}がパニックになっています(${c.purpose.name})`, 'bad');
  }

  finishServe(c, s) {
    // ミス判定(ストレス段階と担当ミスマッチで跳ね上がる)
    const missRate = s.type.mistake * s.mistakeMul * (1 + (c.mismatch || 0) * 0.7) * (c.difficulty / 3.2);
    if (chance(missRate)) {
      this.stats.mistakes++;
      this.tally('mistake');
      const id = this.note('mistake', `${s.type.name}・${s.name}が${c.purpose.name}の手続きをミス`, {
        causes: [c.causeId, s.causeId],
        meta: { staff: s.name, staffType: s.type.name, purpose: c.purpose.name },
      });
      this.hurt(CFG.PEACE_DRAIN.mistake, id);
      c.causeId = id;
      c.anger = clamp(c.anger + 22, 0, 120);
      s.addStress(9 * s.type.stressGain, id);
      c.serveTime = rand(4, 8);
      c.serveTotal += c.serveTime;
      s.char.say('……すみません、やり直します', 's', 3.2);
      this.log(`${s.name}が手続きをミス(${c.label})`, 'bad');
      // ミスは本人をさらに追い込む
      if (chance((s.type.panic || 0) * 0.5)) this.panic(s, c, id);
      else if (s.tierIndex >= 2 && chance((s.type.conflict || 0) * 0.25)) this.conflict(s, c, id);
      if (c.anger > 82 && chance(0.4)) this.complaint(c, s, id);
      return;
    }

    const satisfyBase = 92 - c.anger * 0.55;
    c.satisfaction = clamp(satisfyBase * s.type.satisfy * s.satisfyMul * c.satisfyMul, 0, 100);
    const [lo, hi] = c.purpose.sales;
    let sales = rand(lo, hi) * s.type.salesMul * (c.salesBonus || 1);
    if (c.satisfaction < 40) sales *= 0.35;
    sales = Math.round(sales / 100) * 100;
    s.sales += sales;
    s.served++;
    this.stats.sales += sales;

    const cn = this.counters[c.counter];
    if (cn) { cn.staff = null; cn.customer = null; }
    c.staff = null; c.counter = null;
    s.customer = null;
    s.state = 'wrapup';
    s.timer = rand(1.4, 2.8);
    s.char.setSitting(false);
    s.addStress(-12 + c.difficulty * 0.9);
    s.lastDifficulty = c.difficulty;
    // 長期接客ノードに最終的な所要時間を反映する
    if (c.longNodeId) {
      const total = Math.round((this.time - c.serveStart) * CFG.GAME_MIN_PER_SEC);
      this.cascade.relabel(c.longNodeId, `${c.purpose.name}の接客が${total}分に及ぶ`, { minutes: total });
    }
    this.log(`${s.name}が${c.label}の対応を完了(¥${sales.toLocaleString()})`, 'good');
    c.char.setSitting(false);
    this.leave(c, 'done');
  }

  // ---------- 店員の更新 ----------
  updateStaff(s, dt) {
    const ch = s.char;
    ch.agitation = clamp((s.stress - 55) / 45, 0, 1) * 0.8 + this.chaos * 0.2;
    // 姿勢が落ちる(危険な兆候の可視化)
    ch.slump = clamp((s.stress - 42) / 56, 0, 1);
    if (s.refuse > 0) s.refuse = Math.max(0, s.refuse - dt);
    if (s.silentTimer > 0) s.silentTimer = Math.max(0, s.silentTimer - dt);
    if (s.panicTimer > 0 && s.state !== 'serving') s.panicTimer = Math.max(0, s.panicTimer - dt);

    if (s.temp && s.state !== 'gone') {
      s.lifeTimer -= dt;
      if (s.lifeTimer <= 0 && (s.state === 'idle' || s.state === 'wrapup')) {
        s.state = 'gone';
        s.char.say('では、失礼します', 's', 3);
        s.goTo(LAYOUT.backyard.x, LAYOUT.backyard.z);
        this.log(`応援スタッフ ${s.name} が戻りました`, 'info');
      }
    }

    switch (s.state) {
      case 'idle':
        s.stress = clamp(s.stress - dt * 0.95, 0, 100);
        s.fatigue = clamp(s.fatigue - dt * 0.35, 0, 100);
        s.idleTimer -= dt;
        if (s.idleTimer <= 0 && ch.arrived) {
          s.idleTimer = rand(6, 14);
          const spot = pick(LAYOUT.idleSpots);
          s.goTo(spot.x + rand(-0.5, 0.5), spot.z + rand(-0.3, 0.3));
        }
        // 限界に近い店員は新しい客を取らなくなる
        if (s.tierIndex >= 2 && s.refuse <= 0 && this.activeStaff.length > 1 && chance(dt * 0.055)) {
          s.refuse = rand(7, 14);
          ch.say(pick(REFUSE_LINES), 's', 2.8);
          const id = this.note('refuse', `${s.type.name}・${s.name}が新規の対応を避け始めた`, {
            causes: [s.causeId], meta: { staff: s.name, staffType: s.type.name },
          });
          s.causeId = id;
          this.markShortage(id);
          this.hurt(0.5, id);
          this.log(`${s.name}が新しい対応を避けています`, 'warn');
        }
        break;

      // --- クレーム対応(店員が1名拘束される) ---
      case 'toClaim':
        if (s.claimTarget && s.claimTarget.dead) { s.claimTarget = null; }
        if (ch.arrived || !s.claimTarget) {
          s.state = 'claim';
          if (s.claimTarget) ch.face(s.claimTarget.char.x, s.claimTarget.char.z);
        }
        break;

      case 'claim': {
        s.claimTimer -= dt;
        s.addStress(dt * 0.85 * s.type.stressGain, s.causeId);
        const tgt = s.claimTarget;
        if (tgt && !tgt.dead) {
          ch.face(tgt.char.x, tgt.char.z);
          tgt.anger = clamp(tgt.anger - dt * 2.6, 0, 120);
        }
        if (chance(dt * 0.22)) ch.say(pick(CLAIM_LINES), 's', 2.6);
        if (s.claimTimer <= 0) {
          s.addStress(CFG.CLAIM_STRESS * s.type.stressGain * 0.5, s.causeId);
          s.claimTarget = null;
          s.state = 'wrapup';
          s.timer = 0.8;
          this.stats.claims++;
          this.log(`${s.name}がクレーム対応を終えました`, 'info');
        }
        break;
      }

      case 'toCounter':
        if (ch.arrived) {
          const cn = this.counters[s.counter];
          ch.setSitting(true);
          ch.face(cn.guestSpot.x, cn.guestSpot.z);
          s.state = 'waitingGuest';
          s.timer = 12;
        }
        break;

      case 'waitingGuest':
        s.timer -= dt;
        if (s.customer && s.customer.state === 'serving') s.state = 'serving';
        else if (!s.customer || s.customer.dead || s.customer.counter === null || s.timer <= 0) {
          // 客が消えた
          const cn = this.counters[s.counter];
          if (cn) { cn.staff = null; cn.customer = null; }
          s.customer = null; s.counter = null;
          s.state = 'wrapup'; s.timer = 0.5;
          ch.setSitting(false);
        }
        break;

      case 'serving':
        if (!s.customer || s.customer.dead || s.customer.state !== 'serving') {
          const cn = this.counters[s.counter];
          if (cn) { cn.staff = null; cn.customer = null; }
          s.customer = null; s.counter = null;
          s.state = 'wrapup'; s.timer = 1.0;
          ch.setSitting(false);
        }
        break;

      case 'wrapup':
        s.timer -= dt;
        if (s.timer <= 0) {
          const cn = s.counter !== null ? this.counters[s.counter] : null;
          if (cn && cn.staff === s) { cn.staff = null; cn.customer = null; }
          s.counter = null;
          ch.setSitting(false);
          // 面倒事回避型は難案件のあと席を外したがる
          if ((s.type.escape || 0) > 0 && (s.lastDifficulty || 0) >= 4 && s.tierIndex >= 1 && chance(0.4)) {
            const id = this.note('escape', `${s.type.name}・${s.name}が難案件のあと席を外した`, {
              causes: [s.causeId], meta: { staff: s.name, staffType: s.type.name },
            });
            this.markShortage(id);
            s.lastDifficulty = 0;
            this.takeBreak(s);
          } else if (s.fatigue > 88 && chance(0.4)) this.takeBreak(s, false);
          else {
            s.state = 'idle';
            const spot = pick(LAYOUT.idleSpots);
            s.goTo(spot.x + rand(-0.5, 0.5), spot.z + rand(-0.3, 0.3));
          }
        }
        break;

      case 'toBreak':
      case 'meltdown':
        if (ch.arrived) {
          ch.root.visible = false;
          s.state = 'break';
          s.timer = s.meltdownPending
            ? rand(CFG.MELTDOWN_TIME[0], CFG.MELTDOWN_TIME[1]) * (s.type.breakdown || 1)
            : rand(CFG.BREAK_TIME[0], CFG.BREAK_TIME[1]);
        }
        break;

      case 'break':
        s.timer -= dt;
        s.stress = clamp(s.stress - CFG.STRESS_RECOVER * dt, 0, 100);
        s.fatigue = clamp(s.fatigue - 2.2 * dt, 0, 100);
        if (s.timer <= 0) {
          if (s.meltdownPending && chance(0.18 * (s.type.breakdown || 1)) && this.staff.length > 1) {
            // 帰宅
            s.dead = true;
            this.stats.quits++;
            this.tally('quit');
            const id = this.note('quit', `${s.type.name}・${s.name}が帰宅`, {
              causes: [s.causeId], meta: { staff: s.name, staffType: s.type.name },
            });
            this.markShortage(id);
            this.hurt(6 * (s.type.breakdown || 1), id);
            this.log(`${s.name}「${pick(QUIT_LINES)}」— ${s.name}は帰宅しました`, 'bad');
            this.banner('🚪 ' + s.name + 'が帰ってしまいました');
            return;
          }
          s.meltdownPending = false;
          ch.root.visible = true;
          ch.setPos(LAYOUT.backyard.x, LAYOUT.backyard.z);
          s.state = 'idle';
          s.stress = Math.min(s.stress, 28);
          const spot = pick(LAYOUT.idleSpots);
          s.goTo(spot.x, spot.z);
          this.log(`${s.name}が現場に戻りました`, 'info');
        }
        break;

      case 'gone':
        if (ch.arrived) s.dead = true;
        break;
    }

    ch.setIcon(s.moodIcon());
  }

  takeBreak(s, announce = true) {
    if (s.away || s.state === 'gone') return;
    if (this.activeStaff.length <= 1) return; // 店を無人にしない
    s.state = 'toBreak';
    s.char.setSitting(false);
    s.goTo(LAYOUT.backyard.x, LAYOUT.backyard.z);
    if (announce) {
      s.char.say(pick(BREAK_LINES), 's', 3.2);
      this.log(`${s.name}がバックヤードへ消えました`, 'warn');
      this.tally('break');
      if (this.waitingCount >= 4) {
        const id = this.note('break', `${s.type.name}・${s.name}が離席(待ち${this.waitingCount}人)`, {
          causes: [s.causeId], meta: { staff: s.name, staffType: s.type.name },
        });
        this.markShortage(id);
      }
    }
  }

  /** ストレス段階が上がったときの反応 */
  onStressTier(s, tier) {
    if (tier === 2) {
      const id = this.note('stress', `${s.type.name}・${s.name}のストレスが高水準に`, {
        causes: [s.causeId], meta: { staff: s.name, staffType: s.type.name },
      });
      s.causeId = id;
      s.char.say(pick(STAFF_TIRED), 's', 2.6);
      this.log(`${s.name}のストレスが高くなっています`, 'warn');
    } else if (tier === 3) {
      const id = this.note('stressLimit', `${s.type.name}・${s.name}が限界に近づく`, {
        causes: [s.causeId], meta: { staff: s.name, staffType: s.type.name },
      });
      s.causeId = id;
      this.hurt(0.8, id);
      this.log(`${s.name}が限界に近づいています`, 'bad');
      if (!s.warned) {
        s.warned = true;
        this.banner('⚠ ' + s.name + 'が限界に近づいています');
      }
    }
  }

  meltdown(s) {
    if (s.state === 'meltdown' || s.state === 'gone' || s.meltdownPending) return;
    s.meltdowns++;
    s.mental = clamp(s.mental - 30, 0, 100);
    this.stats.meltdowns++;
    this.tally('meltdown:' + s.name);
    const sev = s.type.breakdown || 1;
    const id = this.note('meltdown', `${s.type.name}・${s.name}のメンタルが限界に`, {
      causes: [s.causeId], meta: { staff: s.name, staffType: s.type.name },
    });
    s.causeId = id;
    s.breakSeverity = sev;
    this.hurt(CFG.PEACE_DRAIN.meltdown * sev, id);
    this.markShortage(id);
    this.banner('😵 ' + s.name + 'のメンタルが限界です');
    this.log(`${s.name}(${s.type.name})のメンタルが限界に達しました`, 'bad');
    s.char.say(pick(STAFF_LIMIT), 's', 3.4);

    // 接客中なら客を解放
    if (s.customer) {
      const c = s.customer;
      const cn = this.counters[s.counter];
      if (cn) { cn.staff = null; cn.customer = null; }
      c.staff = null;
      c.char.setSitting(false);
      c.anger = clamp(c.anger + 30, 0, 120);
      c.causeId = id;
      if (c.state === 'serving' || c.state === 'toCounter') {
        c.counter = null;
        c.state = 'toSeat';
        this.toWaiting(c);
        this.log(`${c.label}の対応が中断されました`, 'bad');
        this.broadcast(c, CFG.SOCIAL.shoutAnger * 0.7, id);
      }
      s.customer = null;
      s.counter = null;
    }
    s.char.setSitting(false);
    s.char.setIcon('😵');
    s.char.say(pick(MELTDOWN_LINES), 's', 4);
    s.meltdownPending = true;
    s.state = 'meltdown';
    s.goTo(LAYOUT.backyard.x, LAYOUT.backyard.z);
  }

  // ---------- 平穏度 ----------
  updatePeace(dt) {
    let drain = 0;
    let angryWait = 0;
    for (const c of this.customers) {
      if (c.state === 'waiting' && c.anger > 70) { drain += CFG.PEACE_DRAIN.longWait; angryWait++; }
    }
    let stressed = 0;
    for (const s of this.staff) {
      if (s.tierIndex >= 2 && !s.away) { drain += CFG.PEACE_DRAIN.highStress; stressed++; }
    }
    // 待ち行列そのものの圧
    const q = this.waitingCount;
    if (q > 9) drain += (q - 9) * 0.09;
    if (drain > 0) {
      // じわじわ削るぶんの責任は「いまの行列を作った出来事」に乗せる
      this.hurt(drain * dt, angryWait >= stressed ? this.queueCauseId : this.shortageCauseId);
      this.tally('drain', drain * dt);
    }
  }

  // ---------- ランダムイベント ----------
  updateRandomEvents(dt) {
    this.randomEventTimer -= dt;
    if (this.randomEventTimer > 0) return;
    // 序盤は間隔を長く、荒れてくるほど短く
    const phaseMul = [1.9, 1.25, 1.0, 0.85][this.phase];
    this.randomEventTimer = rand(28, 52) * phaseMul * (1 - this.chaos * 0.3);
    if (this.time < CFG.GRACE_TIME) return;

    const roll = Math.random();
    if (roll < 0.3 && this.waitingCount >= 3) {
      const cand = this.staff.filter((s) => s.state === 'idle');
      if (cand.length && this.activeStaff.length > 1) this.takeBreak(pick(cand));
    } else if (roll < 0.55) {
      // クレーマー来店
      if (this.customers.length < CFG.MAX_CUSTOMERS) this.spawnCustomer({ angry: true });
    } else if (roll < 0.72) {
      // 団体来店
      const n = randInt(2, 3);
      this.log(`団体のお客様が来店しました(${n}名)`, 'warn');
      for (let i = 0; i < n; i++) {
        if (this.customers.length < CFG.MAX_CUSTOMERS) this.spawnCustomer();
      }
    } else if (roll < 0.78) {
      // 店員同士の衝突
      const tired = this.staff.filter((x) => !x.away && x.tierIndex >= 1);
      if (tired.length >= 2) {
        const [a, b] = pickN(tired, 2);
        a.char.say(pick(['さっきの案件、引き継ぎ聞いてました？', 'そっち空いてますよね？', 'なんで先に休憩行くんですか']), 's', 3.4);
        b.char.say(pick(['こっちも手一杯です', '聞いてないです', '……今それ言います？']), 's', 3.4);
        const id = this.note('staffConflict', `${a.name}と${b.name}の間に不穏な空気`, {
          causes: [a.causeId, b.causeId], meta: { staff: a.name, staffType: a.type.name },
        });
        a.addStress(9, id); b.addStress(9, id);
        this.hurt(CFG.PEACE_DRAIN.conflict, id);
        this.tally('staffConflict');
        this.log(`${a.name}と${b.name}の間に不穏な空気が流れました`, 'bad');
      }
    } else if (roll < 0.9) {
      const s = pick(this.staff.filter((x) => !x.away));
      if (s) {
        s.char.say(pick(['システムが重いです……', '在庫がありません……', '電話が鳴りっぱなしです']), 's', 3);
        s.addStress(6, s.causeId);
        this.log(`${s.name}に別件が発生(ストレス +6)`, 'warn');
      }
    }
  }

  // ============================================================
  // 特殊イベント
  // ------------------------------------------------------------
  // 同じイベントでも、店が空いていれば処理できて、
  // 混雑していれば崩壊の引き金になる。
  // ============================================================
  updateSpecialEvents(dt) {
    if (this.time < CFG.SPECIAL_FIRST) return;
    this.specialTimer -= dt;
    if (this.specialTimer > 0) return;
    this.specialTimer = rand(CFG.SPECIAL_INTERVAL[0], CFG.SPECIAL_INTERVAL[1]) * (this.phase >= 2 ? 0.82 : 1.1);
    const pool = SPECIAL_EVENTS.filter((e) => !e.lateOnly || this.phase >= 2);
    if (!pool.length) return;
    this.fireSpecial(pickWeighted(pool));
  }

  fireSpecial(ev) {
    const slack = this.slack;
    const busy = slack < 0.42;
    this.stats.specialEvents++;
    const id = this.note('special', `特殊イベント「${ev.name}」`, {
      causes: busy ? [this.queueCauseId, this.shortageCauseId] : [],
      meta: { special: ev.name },
    });
    this.banner('⚠ ' + ev.name);
    this.log(`⚠ ${ev.name} — ${busy ? ev.busy : ev.calm}`, busy ? 'bad' : 'special');
    this.hurt(CFG.PEACE_DRAIN.special * (busy ? 1.8 : 0.45), id);
    this.tally('specialEvent:' + ev.name);

    const serving = this.customers.filter((c) => c.state === 'serving' && c.staff);
    const opts = {
      causeId: id, special: ev.name,
      purposeName: ev.purpose, diffAdd: (ev.diffAdd || 0) + (busy ? 1 : 0),
      patienceMul: ev.patienceMul, traitName: ev.traitName, timeMul: ev.timeMul,
    };

    switch (ev.kind) {
      case 'group': {
        const n = Math.max(1, (ev.count || 2) - (busy ? 0 : 1));
        const gid = 'g' + id;
        for (let i = 0; i < n; i++) {
          if (this.customers.length >= CFG.MAX_CUSTOMERS) break;
          if (this.customers.length + this.staff.length >= CFG.MAX_CHARACTERS) break;
          const c = this.spawnCustomer({ ...opts, groupId: gid });
          if (i === 0) c.char.say(ev.line, 'c', 3.4);
        }
        break;
      }
      case 'single': {
        if (this.customers.length < CFG.MAX_CUSTOMERS) {
          const c = this.spawnCustomer(opts);
          c.char.say(ev.line, 'c', 3.4);
        }
        break;
      }
      case 'infect': {
        // 接客中の全員に同じトラブルが降ってくる
        const t = TROUBLES.find((x) => x.id === ev.troubleId);
        if (!t || !serving.length) { this.log(`${ev.name}: 幸い、対象がいませんでした`, 'info'); break; }
        for (const c of serving) {
          const st = c.staff;
          if (!st) continue;
          c.pendingBeats = t.beats.slice(1);
          c.char.say(ev.line, 'c', 3.2);
          c.serveTime += t.time * 0.8;
          c.serveTotal += t.time * 0.8;
          st.addStress(t.stress * 0.55 * st.type.stressGain, id);
          c.causeId = id;
        }
        this.markShortage(id);
        break;
      }
      case 'escalate': {
        const c = pick(serving);
        if (!c) { this.log(`${ev.name}: 対象の接客がありませんでした`, 'info'); break; }
        c.difficulty = clamp(c.difficulty + (ev.diffAdd || 2), 1, 6);
        const add = c.serveTotal * ((ev.timeMul || 1.6) - 1);
        c.serveTime += add;
        c.serveTotal += add;
        c.char.say(ev.line, 'c', 3.4);
        if (c.staff) c.staff.addStress(14 * c.staff.type.stressGain, id);
        c.causeId = id;
        this.markShortage(id);
        break;
      }
      case 'claimNow': {
        const c = pick(serving) || pick(this.customers.filter((x) => x.state === 'waiting'));
        if (!c) break;
        c.char.say(ev.line, 'c', 3.4);
        c.anger = clamp(c.anger + 30, 0, 120);
        this.complaint(c, c.staff, id);
        break;
      }
      case 'catchMistake': {
        // 一番実力の低い店員が捕まる
        const target = serving.sort((a, b) => a.staff.skill - b.staff.skill)[0];
        if (!target) break;
        target.char.say(ev.line, 'c', 3.4);
        const st = target.staff;
        st.addStress(18 * st.type.stressGain, id);
        target.anger = clamp(target.anger + 26, 0, 120);
        target.serveTime += 6;
        target.serveTotal += 6;
        target.causeId = id;
        this.stats.mistakes++;
        this.hurt(CFG.PEACE_DRAIN.mistake * (busy ? 1.4 : 0.6), id);
        this.log(`${st.name}の説明ミスが指摘されました`, 'bad');
        if (busy) this.complaint(target, st, id);
        break;
      }
      case 'systemSlow': {
        this.systemSlow = busy ? 46 : 24;
        for (const c of serving) if (c.staff) c.staff.addStress(7 * c.staff.type.stressGain, id);
        this.markShortage(id);
        break;
      }
      case 'phone': {
        const pool = this.staff.filter((x) => x.state === 'idle');
        if (!pool.length) {
          this.log('電話に出られる店員がいません', 'bad');
          this.hurt(1.2, id);
          break;
        }
        const st = pick(pool);
        st.state = 'toClaim';
        st.claimTarget = null;
        st.claimTimer = busy ? rand(16, 24) : rand(9, 14);
        st.causeId = id;
        st.char.setSitting(false);
        st.goTo(LAYOUT.reception.spot.x + 1.0, LAYOUT.reception.spot.z - 1.2);
        st.char.say('お電話ありがとうございます、ケータイショップ……', 's', 3.4);
        this.markShortage(id);
        this.log(`${st.name}が電話対応に取られました`, 'warn');
        break;
      }
      default: break;
    }
    return id;
  }

  // ---------- 応援スタッフ ----------
  callSupport() {
    if (this.over || this.supportCooldown > 0) return false;
    if (this.staff.length + this.customers.length >= CFG.MAX_CHARACTERS) return false;
    const s = new Staff(this, pick(STAFF_TYPES), true);
    s.char.setPos(LAYOUT.backyard.x, LAYOUT.backyard.z);
    s.goTo(LAYOUT.idleSpots[0].x, LAYOUT.idleSpots[0].z);
    s.char.say('応援に入ります！', 's', 3);
    this.staff.push(s);
    this.supportCooldown = CFG.SUPPORT_COOLDOWN;
    this.peace = Math.min(CFG.PEACE_MAX, this.peace + 3);
    this.log(`応援スタッフ ${s.name}(${s.type.name})が到着しました`, 'good');
    this.banner('👏 応援スタッフ到着');
    this.note('support', `応援スタッフ ${s.name} が到着`);
    return true;
  }

  // ---------- 店長介入 ----------
  callManager() {
    if (this.over || this.managerCooldown > 0 || this.managerTimer > 0) return false;
    this.managerTimer = CFG.MANAGER_DURATION;
    this.managerCooldown = CFG.MANAGER_COOLDOWN;
    for (const s of this.staff) {
      if (s.away) continue;
      s.stress = clamp(s.stress - 7, 0, 100);
      s.refuse = 0;
      s.panicTimer = 0;
      // 対応中のクレームが一気に片付く
      if (s.state === 'claim') s.claimTimer /= CFG.MANAGER_CLAIM_MUL;
    }
    this.peace = Math.min(CFG.PEACE_MAX, this.peace + 2);
    this.banner('🧑‍💼 店長が現場に入りました');
    this.log('店長が現場に入りました(ストレス上昇を抑制・クレーム対応が高速化)', 'good');
    this.note('manager', '店長が現場に入る');
    return true;
  }

  // ---------- 受付制限 ----------
  toggleGate() {
    if (this.over) return false;
    if (this.gateOn) { this.closeGate(true); return true; }
    if (this.gateCooldown > 0) return false;
    this.gateOn = true;
    this.gateTimer = CFG.GATE_DURATION;
    this.gateCauseId = this.note('gate', '受付制限を開始');
    this.banner('🚧 受付を一時制限しました');
    this.log('受付制限: 新規の来店を止めます(そのぶん売上機会を失います)', 'warn');
    return true;
  }

  closeGate(manual = false) {
    if (!this.gateOn) return;
    this.gateOn = false;
    this.gateTimer = 0;
    this.gateCooldown = CFG.GATE_COOLDOWN;
    this.log(`受付制限を解除しました${manual ? '' : '(時間切れ)'}`, 'info');
  }

  // ---------- 終了 ----------
  gameOver() {
    this.over = true;
    const stats = { ...this.stats };
    stats.time = this.elapsedText();
    stats.timeMinutes = Math.floor(this.gameMinutes);
    stats.maxWait = Math.round(this.stats.maxWait);

    // 終端ノード。直近で効いた出来事を原因として繋ぐ
    const collapse = this.note('collapse', '店舗崩壊', {
      causes: this.cascade.recentImpactful(3),
      impact: 6,
    });
    this.cascade.terminal = collapse;

    const res = this.cascade.analyze(stats);
    stats.cause = res.cause;
    stats.chain = res.chain;
    stats.title = res.title;
    stats.rootTag = res.rootTag;
    this.hooks.onGameOver?.(stats);
  }

  // ---------- 分離(重なり回避) ----------
  separate(dt) {
    const all = [];
    for (const c of this.customers) if (c.char.root.visible) all.push(c.char);
    for (const s of this.staff) if (s.char.root.visible) all.push(s.char);
    const R = 0.62;
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if (a.sitting) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        if (b.sitting) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (R - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
      }
    }
    // 立ち止まっている人はゆっくり定位置へ戻る
    const pull = (ent) => {
      const ch = ent.char;
      if (ch.path || ch.sitting || !ent.anchor) return;
      const dx = ent.anchor.x - ch.x, dz = ent.anchor.z - ch.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05 && d < 3) {
        const k = Math.min(1, dt * 1.6);
        ch.x += dx * k; ch.z += dz * k;
      }
    };
    for (const c of this.customers) pull(c);
    for (const s of this.staff) pull(s);
  }

  updateCharacters(dt, camera) {
    const cx = camera.position.x, cz = camera.position.z;
    const rush = this.chaos;
    for (const c of this.customers) {
      c.char.rush = rush;
      const far = (c.char.x - cx) ** 2 + (c.char.z - cz) ** 2 > 400;
      c.char.update(dt, far);
    }
    for (const s of this.staff) {
      s.char.rush = rush;
      const far = (s.char.x - cx) ** 2 + (s.char.z - cz) ** 2 > 400;
      s.char.update(dt, far);
    }
  }

  destroy() {
    for (const c of this.customers) c.char.dispose();
    for (const s of this.staff) s.char.dispose();
    this.customers = [];
    this.staff = [];
  }

  pickTargets() {
    const arr = [];
    for (const c of this.customers) if (c.char.root.visible) arr.push(c.char.root);
    for (const s of this.staff) if (s.char.root.visible) arr.push(s.char.root);
    return arr;
  }
}
