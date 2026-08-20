import { CFG, MOOD } from './config.js';
import {
  FAMILY_NAMES, GIVEN_NAMES, STAFF_TYPES, AGE_GROUPS, PURPOSES, TRAITS,
  STAFF_REPLIES, STAFF_STRAINED, SMALL_TALK, TROUBLES, RARE_CASES,
  ANGRY_LINES, LEAVE_LINES, HAPPY_LINES, BREAK_LINES, MELTDOWN_LINES,
  QUIT_LINES, CONFLICT_LINES,
} from './data.js';
import { rand, randInt, pick, pickN, chance, pickWeighted, clamp } from './rng.js';
import { LAYOUT } from './shop.js';
import { findPath } from './nav.js';
import { Character, staffLook, customerLook } from './character.js';

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

  get busy() { return this.state === 'serving' || this.state === 'toCounter' || this.state === 'wrapup'; }
  get away() { return this.state === 'break' || this.state === 'toBreak' || this.state === 'meltdown' || this.state === 'gone'; }

  moodIcon() {
    if (this.state === 'meltdown') return MOOD.broken;
    if (this.stress >= 85) return MOOD.tired;
    if (this.stress >= 60) return MOOD.confused;
    if (this.stress >= 35) return MOOD.normal;
    return MOOD.happy;
  }

  addStress(v) {
    this.stress = clamp(this.stress + v, 0, 100);
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

    this.rare = opts.rare || null;
    this.purpose = this.rare ? { name: this.rare.name, diff: this.rare.diff, sales: [0, 4000], lines: [this.rare.beats[0].t] } : pick(PURPOSES);

    let diff = this.purpose.diff;
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
    this.patience = rand(CFG.PATIENCE_BASE[0], CFG.PATIENCE_BASE[1]) * patMul;

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

    const look = customerLook();
    this.char = new Character(game.scene, look);
    this.char.root.userData.entity = this;
    this.char.kind = 'customer';
    this.char.setPos(rand(-1.2, 1.2), 10.4);
    this.anchor = { x: this.char.x, z: this.char.z };
    this.char.setIcon(MOOD.normal);
  }

  moodIcon() {
    if (this.anger >= 88) return MOOD.rage;
    if (this.anger >= 62) return MOOD.angry;
    if (this.anger >= 38) return MOOD.confused;
    if (this.satisfaction > 72) return MOOD.happy;
    return MOOD.normal;
  }

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
    };
    this.causeTally = new Map();

    this.spawnTimer = CFG.SPAWN_FIRST;
    this.randomEventTimer = rand(25, 45);
    this.supportCooldown = 0;
    this.supportActive = 0;

    this.usedNames = new Set();
    const startTypes = pickN(STAFF_TYPES, CFG.START_STAFF);
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

  // ============================================================
  update(dt) {
    if (this.over) return;
    this.time += dt;

    this.updateSpawn(dt);
    this.updateReception(dt);
    for (const c of this.customers) this.updateCustomer(c, dt);
    for (const s of this.staff) this.updateStaff(s, dt);
    this.assign();
    this.updatePeace(dt);
    this.updateRandomEvents(dt);

    if (this.supportCooldown > 0) this.supportCooldown = Math.max(0, this.supportCooldown - dt);

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
      if (q === 5 || q === 8 || q === 12) this.log(`待ち人数が${q}人になりました`, q >= 8 ? 'bad' : 'warn');
    }

    if (this.peace <= 0) this.gameOver();
  }

  // ---------- 来店 ----------
  updateSpawn(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const ramp = 1 / (1 + this.time / CFG.SPAWN_RAMP);
    let interval = clamp(CFG.SPAWN_BASE * ramp, CFG.SPAWN_MIN, CFG.SPAWN_BASE);
    interval *= rand(0.65, 1.4);
    this.spawnTimer = interval;
    if (this.customers.length >= CFG.MAX_CUSTOMERS) return;
    if (this.customers.length + this.staff.length >= CFG.MAX_CHARACTERS) return;
    this.spawnCustomer();
  }

  spawnCustomer(opts = {}) {
    let o = { ...opts };
    if (!o.rare && chance(CFG.RARE_CHANCE)) o.rare = pick(RARE_CASES);
    const c = new Customer(this, o);
    this.customers.push(c);
    this.stats.arrived++;
    c.state = 'toReception';
    this.enterReception(c);
    if (c.rare) {
      this.stats.specials++;
      this.banner('⚠ 特殊案件発生');
      this.log(`⚠ 特殊案件:${c.label}「${c.rare.name}」`, 'special');
      this.tally('rare:' + c.rare.name);
      this.peace -= CFG.PEACE_DRAIN.special;
    } else if (c.isClaimer) {
      this.banner('⚠ クレーマー来店');
      this.log(`⚠ クレーマーが来店しました(${c.label})`, 'bad');
      this.tally('claimer');
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
        this.stats.maxWait = Math.max(this.stats.maxWait, c.waitTime * CFG.GAME_MIN_PER_SEC);
        const rate = (100 / c.patience) * c.angerMul * CFG.ANGER_WAIT_RATE * (1 + this.chaos * 0.35);
        c.anger = clamp(c.anger + rate * dt, 0, 120);
        ch.agitation = clamp((c.anger - 45) / 45, 0, 1);
        if (c.anger > 60 && chance(dt * 0.09)) {
          ch.say(pick(ANGRY_LINES), 'c', 2.4);
        }
        if (c.anger >= 100) this.customerLimit(c);
        break;
      }

      case 'toCounter':
        if (ch.arrived) {
          ch.setSitting(true);
          ch.angle = 0; // カウンター(奥)を向く
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
  }

  customerLimit(c) {
    if (c.seat !== null && c.seat !== undefined) c.char.setSitting(false);
    if (chance(0.35)) {
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

  complaint(c, staff) {
    this.stats.complaints++;
    this.peace -= CFG.PEACE_DRAIN.complaint;
    this.tally('complaint');
    this.log(`${c.label}がクレーム「${c.purpose.name}」`, 'bad');
    if (staff) {
      staff.addStress(10 * c.stressMul);
      staff.char.say(pick(STAFF_STRAINED), 's', 2.5);
    }
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
      this.peace -= CFG.PEACE_DRAIN.angryLeave;
      this.tally('angryLeave');
      c.char.setIcon(MOOD.rage);
      c.char.agitation = 1;
      this.log(`${c.label}が怒って帰りました(待ち${Math.round(c.waitTime * CFG.GAME_MIN_PER_SEC)}分)`, 'bad');
    } else {
      const happy = c.satisfaction > 62;
      c.char.setIcon(happy ? MOOD.happy : MOOD.normal);
      if (happy) {
        this.peace = Math.min(CFG.PEACE_MAX, this.peace + CFG.PEACE_GAIN_HAPPY);
        c.char.say(pick(HAPPY_LINES), 'c', 3);
      }
      this.stats.served++;
    }
  }

  // ---------- 接客の割り当て ----------
  assign() {
    const waiting = this.customers.filter((c) => c.state === 'waiting' && c.char.arrived);
    if (!waiting.length) return;
    const freeStaff = this.staff.filter((s) => s.state === 'idle');
    if (!freeStaff.length) return;
    const freeCounters = this.counters.filter((cn) => !cn.staff && !cn.customer);
    if (!freeCounters.length) return;

    waiting.sort((a, b) => (b.anger * 1.6 + b.waitTime) - (a.anger * 1.6 + a.waitTime));
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
    }
  }

  // ---------- 接客 ----------
  beginServe(c, cn) {
    const s = cn.staff;
    if (!s) { this.leave(c, 'done'); return; }
    let speed = s.speedStat;
    if (s.type.id === 'avoider') speed *= c.difficulty <= 2 ? 1.45 : 0.62;
    const base = CFG.BASE_SERVE_TIME * c.difficulty * c.timeMul / Math.max(0.3, speed);
    c.serveTotal = base;
    c.serveTime = base;
    c.beatTimer = 0.6;
    c.beatIndex = 0;
    s.state = 'serving';
    s.char.face(cn.guestSpot.x, cn.guestSpot.z);
  }

  updateServe(c, dt) {
    const cn = this.counters[c.counter];
    const s = cn && cn.staff;
    if (!s || s.state !== 'serving') return; // 店員が離脱した場合は下で処理

    c.serveTime -= dt;
    s.fatigue = clamp(s.fatigue + CFG.FATIGUE_RATE * dt, 0, 100);
    s.addStress(dt * 0.17 * s.type.stressGain * (c.difficulty / 3) * c.stressMul);
    c.anger = clamp(c.anger - dt * 1.2 * (s.type.satisfy), 0, 120);

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
      s.char.say(s.stress > 60 ? pick(STAFF_STRAINED) : pick(STAFF_REPLIES), 's', 2.6);
      c.beatIndex++;
      return;
    }
    c.beatIndex++;

    // レア案件の専用ビート
    if (c.rare && c.beatIndex === 3) {
      c.pendingBeats = c.rare.beats.slice(1);
      c.char.say(c.rare.beats[0].t, 'c', 3.2);
      s.addStress(c.rare.stress * s.type.stressGain * c.stressMul * 0.34);
      c.serveTime += c.rare.time;
      c.serveTotal += c.rare.time;
      this.log(`${c.label}「${c.rare.name}」→ ${s.name} ストレス +${Math.round(c.rare.stress * 0.34)}`, 'special');
      if (c.rare.complaint) this.complaint(c, s);
      return;
    }

    // トラブル発生
    const troubleChance = 0.42 + this.chaos * 0.2;
    if (c.troublesUsed.length < 2 && chance(troubleChance)) {
      const pool = TROUBLES.filter((t) => !c.troublesUsed.includes(t.id));
      if (pool.length) {
        const t = pickWeighted(pool);
        c.troublesUsed.push(t.id);
        c.pendingBeats = t.beats.slice(1);
        (t.beats[0].w === 'c' ? c.char : s.char).say(t.beats[0].t, t.beats[0].w, 3.2);
        const st = t.stress * 0.5 * s.type.stressGain * c.stressMul;
        s.addStress(st);
        c.anger = clamp(c.anger + t.anger, 0, 120);
        c.serveTime += t.time * 0.7 * c.timeMul;
        c.serveTotal += t.time * 0.7 * c.timeMul;
        if (t.salesBonus) c.salesBonus = (c.salesBonus || 1) * t.salesBonus;
        this.tally('trouble:' + t.name);
        this.log(`${c.label}「${t.beats[0].t}」 ${s.name} ストレス +${Math.round(st)}`, 'warn');
        if (t.twist) this.log(`→ ${t.twist}`, 'info');

        // 短気な店員の衝突
        if (s.type.id === 'shorttemper' && s.stress > 68 && chance(0.35)) {
          this.conflict(s, c);
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

  conflict(s, c) {
    s.char.say(pick(CONFLICT_LINES), 's', 3.2);
    c.anger = clamp(c.anger + 28, 0, 120);
    this.peace -= CFG.PEACE_DRAIN.conflict;
    this.stats.complaints++;
    this.tally('conflict');
    this.log(`${s.name}と${c.label}が口論になりました`, 'bad');
    s.addStress(8);
  }

  finishServe(c, s) {
    // ミス判定
    const missRate = s.type.mistake * (1 + s.stress / 110) * (c.difficulty / 3.2);
    if (chance(missRate)) {
      this.stats.mistakes++;
      this.peace -= CFG.PEACE_DRAIN.mistake;
      this.tally('mistake');
      c.anger = clamp(c.anger + 22, 0, 120);
      s.addStress(9 * s.type.stressGain);
      c.serveTime = rand(4, 8);
      c.serveTotal += c.serveTime;
      s.char.say('……すみません、やり直します', 's', 3.2);
      this.log(`${s.name}が手続きをミス(${c.label})`, 'bad');
      return;
    }

    const satisfyBase = 92 - c.anger * 0.55;
    c.satisfaction = clamp(satisfyBase * s.type.satisfy * c.satisfyMul, 0, 100);
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
    s.addStress(-9 + c.difficulty * 0.9);
    this.log(`${s.name}が${c.label}の対応を完了(¥${sales.toLocaleString()})`, 'good');
    c.char.setSitting(false);
    this.leave(c, 'done');
  }

  // ---------- 店員の更新 ----------
  updateStaff(s, dt) {
    const ch = s.char;
    ch.agitation = clamp((s.stress - 55) / 45, 0, 1) * 0.8 + this.chaos * 0.2;

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
        s.stress = clamp(s.stress - dt * 0.7, 0, 100);
        s.fatigue = clamp(s.fatigue - dt * 0.35, 0, 100);
        s.idleTimer -= dt;
        if (s.idleTimer <= 0 && ch.arrived) {
          s.idleTimer = rand(6, 14);
          const spot = pick(LAYOUT.idleSpots);
          s.goTo(spot.x + rand(-0.5, 0.5), spot.z + rand(-0.3, 0.3));
        }
        break;

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
          if (s.fatigue > 88 && chance(0.4)) this.takeBreak(s, false);
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
          s.timer = s.meltdownPending ? rand(CFG.MELTDOWN_TIME[0], CFG.MELTDOWN_TIME[1]) : rand(CFG.BREAK_TIME[0], CFG.BREAK_TIME[1]);
        }
        break;

      case 'break':
        s.timer -= dt;
        s.stress = clamp(s.stress - CFG.STRESS_RECOVER * dt, 0, 100);
        s.fatigue = clamp(s.fatigue - 2.2 * dt, 0, 100);
        if (s.timer <= 0) {
          if (s.meltdownPending && chance(0.18) && this.staff.length > 1) {
            // 帰宅
            s.dead = true;
            this.stats.quits++;
            this.tally('quit');
            this.log(`${s.name}「${pick(QUIT_LINES)}」— ${s.name}は帰宅しました`, 'bad');
            this.peace -= 6;
            return;
          }
          s.meltdownPending = false;
          ch.root.visible = true;
          ch.setPos(LAYOUT.backyard.x, LAYOUT.backyard.z);
          s.state = 'idle';
          s.stress = Math.min(s.stress, 35);
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
    }
  }

  meltdown(s) {
    if (s.state === 'meltdown' || s.state === 'gone' || s.meltdownPending) return;
    s.meltdowns++;
    s.mental = clamp(s.mental - 30, 0, 100);
    this.stats.meltdowns++;
    this.tally('meltdown:' + s.name);
    this.peace -= CFG.PEACE_DRAIN.meltdown;
    this.banner('😵 店員のメンタルが限界です');
    this.log(`${s.name}のメンタルが限界に達しました`, 'bad');

    // 接客中なら客を解放
    if (s.customer) {
      const c = s.customer;
      const cn = this.counters[s.counter];
      if (cn) { cn.staff = null; cn.customer = null; }
      c.staff = null;
      c.char.setSitting(false);
      c.anger = clamp(c.anger + 30, 0, 120);
      if (c.state === 'serving' || c.state === 'toCounter') {
        c.counter = null;
        c.state = 'toSeat';
        this.toWaiting(c);
        this.log(`${c.label}の対応が中断されました`, 'bad');
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
    for (const c of this.customers) {
      if (c.state === 'waiting' && c.anger > 70) drain += CFG.PEACE_DRAIN.longWait;
    }
    for (const s of this.staff) {
      if (s.stress > 75 && !s.away) drain += CFG.PEACE_DRAIN.highStress;
    }
    // 待ち行列そのものの圧
    const q = this.waitingCount;
    if (q > 9) drain += (q - 9) * 0.09;
    this.peace = clamp(this.peace - drain * dt, 0, CFG.PEACE_MAX);
    if (drain > 0) this.tally('drain', drain * dt);
  }

  // ---------- ランダムイベント ----------
  updateRandomEvents(dt) {
    this.randomEventTimer -= dt;
    if (this.randomEventTimer > 0) return;
    this.randomEventTimer = rand(28, 52) * (1 - this.chaos * 0.35);

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
      const tired = this.staff.filter((x) => !x.away && x.stress > 55);
      if (tired.length >= 2) {
        const [a, b] = pickN(tired, 2);
        a.char.say(pick(['さっきの案件、引き継ぎ聞いてました？', 'そっち空いてますよね？', 'なんで先に休憩行くんですか']), 's', 3.4);
        b.char.say(pick(['こっちも手一杯です', '聞いてないです', '……今それ言います？']), 's', 3.4);
        a.addStress(9); b.addStress(9);
        this.peace -= CFG.PEACE_DRAIN.conflict;
        this.tally('staffConflict');
        this.log(`${a.name}と${b.name}の間に不穏な空気が流れました`, 'bad');
      }
    } else if (roll < 0.9) {
      const s = pick(this.staff.filter((x) => !x.away));
      if (s) {
        s.char.say(pick(['システムが重いです……', '在庫がありません……', '電話が鳴りっぱなしです']), 's', 3);
        s.addStress(6);
        this.log(`${s.name}に別件が発生(ストレス +6)`, 'warn');
      }
    }
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
    return true;
  }

  // ---------- 終了 ----------
  gameOver() {
    this.over = true;
    const stats = { ...this.stats };
    stats.time = this.elapsedText();
    stats.timeMinutes = Math.floor(this.gameMinutes);
    stats.cause = this.mainCause();
    this.hooks.onGameOver?.(stats);
  }

  mainCause() {
    const t = this.causeTally;
    const cands = [];
    const troubles = [];
    const purposes = [];
    const rares = [];
    for (const [k, v] of t) {
      if (k.startsWith('trouble:')) troubles.push([k.slice(8), v]);
      else if (k.startsWith('purpose:')) purposes.push([k.slice(8), v]);
      else if (k.startsWith('rare:')) rares.push([k.slice(5), v]);
    }
    troubles.sort((a, b) => b[1] - a[1]);
    purposes.sort((a, b) => b[1] - a[1]);
    rares.sort((a, b) => b[1] - a[1]);

    if (troubles[0] && troubles[0][1] >= 3) cands.push([`「${troubles[0][0]}」が${troubles[0][1]}件連続で発生`, troubles[0][1] * 1.4]);
    if (purposes[0] && purposes[0][1] >= 4) cands.push([`${purposes[0][0]}の客が${purposes[0][1]}人来店`, purposes[0][1]]);
    if (rares.length) cands.push([`特殊案件「${rares[0][0]}」の来店`, 3 + this.stats.specials * 1.5]);
    if (this.stats.angryLeft >= 3) cands.push([`怒って帰った客が${this.stats.angryLeft}人`, this.stats.angryLeft * 1.7]);
    if (this.stats.meltdowns >= 1) cands.push([`店員${this.stats.meltdowns}人のメンタル崩壊`, this.stats.meltdowns * 3.2]);
    if (this.stats.mistakes >= 2) cands.push([`接客ミスが${this.stats.mistakes}件`, this.stats.mistakes * 1.6]);
    if (this.stats.maxQueue >= 8) cands.push([`待ち人数が最大${this.stats.maxQueue}人まで膨張`, this.stats.maxQueue * 0.9]);
    if (this.stats.complaints >= 4) cands.push([`クレーム${this.stats.complaints}件の連鎖`, this.stats.complaints * 1.2]);
    if (t.get('quit')) cands.push([`店員が${t.get('quit')}人その場で帰宅`, 8]);
    if (t.get('staffConflict') >= 2) cands.push([`店員同士の衝突が${t.get('staffConflict')}回`, t.get('staffConflict') * 2.2]);
    if (t.get('claimer') >= 2) cands.push([`クレーマーが${t.get('claimer')}人連続で来店`, t.get('claimer') * 2.4]);
    if (!cands.length) cands.push(['じわじわ積み重なった小さなトラブル', 1]);
    cands.sort((a, b) => b[1] - a[1]);
    return cands[0][0];
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
    for (const c of this.customers) {
      const far = (c.char.x - cx) ** 2 + (c.char.z - cz) ** 2 > 400;
      c.char.update(dt, far);
    }
    for (const s of this.staff) {
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
