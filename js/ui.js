import { CFG } from './config.js';

const $ = (id) => document.getElementById(id);
const REC_KEY = 'keitai-shop.records.v1';

export class UI {
  constructor() {
    this.el = {
      peaceVal: $('peaceVal'), peaceBar: $('peaceBar'), waitVal: $('waitVal'),
      claimVal: $('claimVal'), salesVal: $('salesVal'), clockVal: $('clockVal'),
      banner: $('banner'), log: $('log'), panel: $('panel'),
      supportBtn: $('supportBtn'), supportCd: $('supportCd'),
      managerBtn: $('managerBtn'), managerCd: $('managerCd'),
      gateBtn: $('gateBtn'), gateCd: $('gateCd'),
      signs: $('signs'), vignette: $('vignette'),
      start: $('start'), gameover: $('gameover'),
      resultTitle: $('resultTitle'),
      resultCause: $('resultCause'), resultChain: $('resultChain'), resultTable: $('resultTable'),
      resultRecords: $('resultRecords'), records: $('records'),
    };
    this.bannerTimer = 0;
    this._signKey = '';
    this._vig = -1;
    this.selected = null;
    this.el.panel.addEventListener('click', (e) => {
      if (e.target.classList.contains('close')) this.hidePanel();
    });
    this.showRecords(this.el.records, this.loadRecords(), null);
  }

  // ---------- ステータス ----------
  setStats(g) {
    const p = Math.max(0, Math.round(g.peace));
    this.el.peaceVal.textContent = p;
    this.el.peaceBar.style.width = p + '%';
    this.el.peaceBar.style.background = p > 60 ? '#6ee7a8' : p > 30 ? '#ffd166' : '#ff6b5e';
    this.el.waitVal.textContent = g.waitingCount;
    this.el.claimVal.textContent = g.stats.complaints;
    this.el.salesVal.textContent = '¥' + Math.round(g.stats.sales).toLocaleString('ja-JP');
    this.el.clockVal.textContent = g.clock();

    this.setAction(this.el.supportBtn, this.el.supportCd, g.supportCooldown, CFG.SUPPORT_COOLDOWN,
      '📣 応援', '📣 応援');

    // 店長介入(発動中は残り時間を出す)
    if (g.managerTimer > 0) {
      this.el.managerBtn.disabled = true;
      this.el.managerCd.style.width = (g.managerTimer / CFG.MANAGER_DURATION) * 100 + '%';
      this.el.managerBtn.firstElementChild.textContent = `🧑‍💼 介入中 ${Math.ceil(g.managerTimer)}s`;
    } else {
      this.setAction(this.el.managerBtn, this.el.managerCd, g.managerCooldown, CFG.MANAGER_COOLDOWN,
        '🧑‍💼 店長介入', '🧑‍💼 店長介入');
    }

    // 受付制限(トグル)
    const gb = this.el.gateBtn;
    gb.classList.toggle('on', g.gateOn);
    if (g.gateOn) {
      gb.disabled = false;
      this.el.gateCd.style.width = (g.gateTimer / CFG.GATE_DURATION) * 100 + '%';
      gb.firstElementChild.textContent = `🚧 制限中 ${Math.ceil(g.gateTimer)}s`;
    } else {
      this.setAction(gb, this.el.gateCd, g.gateCooldown, CFG.GATE_COOLDOWN,
        '🚧 受付制限', '🚧 受付制限');
    }

    this.setSigns(g);
  }

  setAction(btn, cd, remain, total, label, labelReady) {
    if (remain > 0) {
      btn.disabled = true;
      cd.style.width = (100 - (remain / total) * 100) + '%';
      btn.firstElementChild.textContent = `${label} (${Math.ceil(remain)}s)`;
    } else {
      if (btn.disabled) btn.disabled = false;
      cd.style.width = '0%';
      if (btn.firstElementChild.textContent !== labelReady) {
        btn.firstElementChild.textContent = labelReady;
      }
    }
  }

  /** 「これはそろそろヤバい」を言語化して並べる */
  setSigns(g) {
    const out = [];
    const q = g.waitingCount;
    if (q >= 10) out.push(['bad', `待ち ${q}人`]);
    else if (q >= 6) out.push(['', `待ち ${q}人`]);

    const stressed = g.staff.filter((s) => s.tierIndex >= 2 && !s.away).length;
    const limit = g.staff.filter((s) => s.tierIndex >= 3 && !s.away).length;
    if (limit) out.push(['bad', `限界寸前の店員 ${limit}人`]);
    else if (stressed) out.push(['', `高ストレス ${stressed}人`]);

    const angry = g.customers.filter((c) => c.anger >= 80).length;
    if (angry >= 3) out.push(['bad', `限界の客 ${angry}人`]);
    else if (angry) out.push(['', `怒っている客 ${angry}人`]);

    const free = g.freeStaff.length;
    if (free === 0 && q > 0) out.push(['bad', '手が空いた店員なし']);
    if (g.systemSlow > 0) out.push(['', 'システム遅延中']);
    if (g.managerTimer > 0) out.push(['calm', '店長 対応中']);
    if (g.gateOn) out.push(['', '受付制限中']);
    const wait = Math.round(g.stats.maxWait);
    if (wait >= 15) out.push(['bad', `最大待ち ${wait}分`]);
    if (!out.length && g.peace > 82) out.push(['calm', '店内は落ち着いています']);

    const key = out.map((o) => o.join(':')).join('|');
    if (key !== this._signKey) {
      this._signKey = key;
      this.el.signs.innerHTML = '';
      for (const [cls, text] of out) {
        const sp = document.createElement('span');
        if (cls) sp.className = cls;
        sp.textContent = text;
        this.el.signs.appendChild(sp);
      }
    }

    // 平穏度が下がるほど画面の縁が不穏になる
    const v = Math.round(Math.min(1, Math.max(0, g.chaos - 0.25) / 0.6) * 20) / 20;
    if (v !== this._vig) {
      this._vig = v;
      this.el.vignette.style.opacity = String(v);
    }
  }

  // ---------- ログ ----------
  pushLog(time, text, kind) {
    const d = document.createElement('div');
    d.className = kind;
    d.innerHTML = `<time>${time}</time><span></span>`;
    d.lastElementChild.textContent = text;
    const box = this.el.log;
    box.insertBefore(d, box.firstChild);
    while (box.childElementCount > CFG.LOG_MAX) box.removeChild(box.lastChild);
  }
  clearLog() { this.el.log.innerHTML = ''; }

  // ---------- バナー ----------
  showBanner(text) {
    this.el.banner.textContent = text;
    this.el.banner.classList.add('show');
    this.bannerTimer = 2.8;
  }
  tick(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove('show');
    }
  }

  // ---------- 詳細パネル ----------
  select(entity) {
    this.selected = entity;
    this.el.panel.classList.remove('hidden');
    this.refreshPanel();
  }
  hidePanel() { this.selected = null; this.el.panel.classList.add('hidden'); }

  refreshPanel() {
    const e = this.selected;
    if (!e) return;
    if (e.dead) { this.hidePanel(); return; }
    this.el.panel.innerHTML = e.type ? staffPanel(e) : customerPanel(e);
  }

  // ---------- 記録 ----------
  loadRecords() {
    try { return JSON.parse(localStorage.getItem(REC_KEY)) || {}; } catch (e) { return {}; }
  }
  saveRecords(stats) {
    const r = this.loadRecords();
    const mins = stats.timeMinutes;
    const updated = {};
    const better = (key, val, cmp = (a, b) => a > b) => {
      if (r[key] === undefined || cmp(val, r[key])) { r[key] = val; updated[key] = true; }
    };
    better('bestTime', mins);
    better('bestSales', stats.sales);
    better('bestServed', stats.served);
    better('mostComplaints', stats.complaints);
    try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) { /* ignore */ }
    return { rec: r, updated };
  }

  showRecords(el, rec, updated) {
    if (!el) return;
    if (!rec || Object.keys(rec).length === 0) {
      el.innerHTML = '<b>記録</b><br>まだ記録がありません';
      return;
    }
    const u = updated || {};
    const fmtT = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
    const row = (k, label, val) => `<div${u[k] ? ' class="new"' : ''}>${label}: ${val}${u[k] ? ' 🏆NEW' : ''}</div>`;
    el.innerHTML = '<b>これまでの記録</b>'
      + (rec.bestTime !== undefined ? row('bestTime', 'ベスト営業時間', fmtT(rec.bestTime)) : '')
      + (rec.bestSales !== undefined ? row('bestSales', '最高売上', '¥' + Math.round(rec.bestSales).toLocaleString('ja-JP')) : '')
      + (rec.bestServed !== undefined ? row('bestServed', '最大対応人数', rec.bestServed + '人') : '')
      + (rec.mostComplaints !== undefined ? row('mostComplaints', '最多クレーム数', rec.mostComplaints + '件') : '');
  }

  // ---------- 結果 ----------
  showGameOver(stats) {
    const rows = [
      ['営業時間', stats.time],
      ['来店客', stats.arrived + '人'],
      ['対応完了', stats.served + '人'],
      ['怒って帰った客', stats.angryLeft + '人'],
      ['クレーム', stats.complaints + '件'],
      ['接客ミス', stats.mistakes + '件'],
      ['特殊案件', stats.specials + '件'],
      ['売上', '¥' + Math.round(stats.sales).toLocaleString('ja-JP')],
      ['最大待ち時間', Math.round(stats.maxWait) + '分'],
      ['最大待ち人数', stats.maxQueue + '人'],
      ['メンタル崩壊した店員', stats.meltdowns + '人'],
    ];
    if (stats.quits) rows.push(['帰宅した店員', stats.quits + '人']);
    if (stats.specialEvents) rows.push(['特殊イベント', stats.specialEvents + '件']);
    if (stats.claims) rows.push(['クレーム対応', stats.claims + '件']);
    if (stats.mismatch) rows.push(['力量外の案件担当', stats.mismatch + '件']);
    if (stats.turnedAway) rows.push(['入店できなかった客', stats.turnedAway + '人']);
    this.el.resultTable.innerHTML = rows
      .map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');

    // 自動生成タイトル
    this.el.resultTitle.innerHTML = '<small>今回の店舗崩壊</small>';
    const t = document.createElement('span');
    t.textContent = '「' + (stats.title || '静かに壊れた日') + '」';
    this.el.resultTitle.appendChild(t);

    this.el.resultCause.innerHTML = '<b>主因</b>';
    const span = document.createElement('span');
    span.textContent = stats.cause;
    this.el.resultCause.appendChild(span);

    this.showChain(stats.chain);
    const { rec, updated } = this.saveRecords(stats);
    this.showRecords(this.el.resultRecords, rec, updated);
    this.el.gameover.classList.remove('hidden');
  }
  /** 崩壊までの連鎖を縦に並べる */
  showChain(chain) {
    const box = this.el.resultChain;
    box.innerHTML = '';
    if (!chain || chain.length < 2) { box.style.display = 'none'; return; }
    box.style.display = '';
    const head = document.createElement('b');
    head.textContent = '崩壊までの連鎖';
    box.appendChild(head);
    chain.forEach((step, i) => {
      if (i > 0) {
        const a = document.createElement('div');
        a.className = 'arrow';
        a.textContent = '↓';
        box.appendChild(a);
      }
      const d = document.createElement('div');
      d.className = 'step' + (i === 0 ? ' first' : '') + (i === chain.length - 1 ? ' last' : '');
      d.style.animationDelay = (i * 0.09).toFixed(2) + 's';
      const time = document.createElement('time');
      time.textContent = step.clock || '';
      const em = document.createElement('em');
      em.textContent = step.label;
      d.appendChild(time);
      d.appendChild(em);
      box.appendChild(d);
    });
  }

  hideGameOver() { this.el.gameover.classList.add('hidden'); }
}

// ---------- パネル描画 ----------
function meter(val, max, color) {
  const w = Math.max(0, Math.min(100, (val / max) * 100));
  return `<div class="meter"><i style="width:${w}%;background:${color}"></i></div>`;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function staffPanel(s) {
  const stressColor = s.stress > 80 ? '#ff6b5e' : s.stress > 50 ? '#ffd166' : '#6ee7a8';
  return `<button class="close" aria-label="閉じる">×</button>
  <h3>${esc(s.name)}<span class="tag">店員</span></h3>
  <div class="row"><b>タイプ</b><span>${esc(s.type.name)}</span></div>
  <div class="row"><b>ストレス</b><span>${['低', '中', '高', '限界'][s.tierIndex]} / ${Math.round(s.stress)}</span></div>
  ${meter(s.stress, 100, stressColor)}
  <div class="row"><b>疲労</b><span>${Math.round(s.fatigue)}/100</span></div>
  ${meter(s.fatigue, 100, '#8ec3ff')}
  <div class="row"><b>メンタル</b><span>${Math.round(s.mental)}/100</span></div>
  ${meter(s.mental, 100, '#c4a6ff')}
  <div class="row"><b>接客能力</b><span>${Math.round(s.skill * 100)}</span></div>
  <div class="row"><b>処理速度</b><span>×${s.speedStat.toFixed(2)}</span></div>
  <div class="row"><b>接客速度</b><span>×${s.speedMul.toFixed(2)}</span></div>
  <div class="row"><b>ミス率</b><span>×${s.mistakeMul.toFixed(2)}</span></div>
  <div class="row"><b>対応人数</b><span>${s.served}人</span></div>
  <div class="row"><b>クレーム対応</b><span>${s.claims}件</span></div>
  <div class="row"><b>売上</b><span>¥${Math.round(s.sales).toLocaleString('ja-JP')}</span></div>
  <div class="row"><b>現在の客</b><span>${s.customer ? esc(s.customer.label) : '—'}</span></div>
  <div class="row"><b>状態</b><span>${esc(staffStateText(s))}</span></div>`;
}

function staffStateText(s) {
  return {
    idle: s.refuse > 0 ? '新規対応を避けている' : '待機中',
    toCounter: 'カウンターへ移動中', waitingGuest: 'お客様を待っている',
    serving: s.panicTimer > 0 ? 'パニック中' : '接客中',
    wrapup: '事後処理中', toBreak: 'バックヤードへ移動中',
    toClaim: 'クレーム対応へ移動中', claim: 'クレーム対応中',
    break: 'バックヤードで休憩中', meltdown: 'メンタル崩壊', gone: '退勤中',
  }[s.state] || s.state;
}

function customerPanel(c) {
  const angerColor = c.anger > 80 ? '#ff6b5e' : c.anger > 50 ? '#ffd166' : '#6ee7a8';
  return `<button class="close" aria-label="閉じる">×</button>
  <h3>${esc(c.name)}<span class="tag cus">客</span></h3>
  <div class="row"><b>識別</b><span>${esc(c.label)} / ${esc(c.age)}</span></div>
  <div class="row"><b>目的</b><span>${esc(c.purpose.name)}</span></div>
  <div class="row"><b>怒り</b><span>${Math.round(c.anger)}/100</span></div>
  ${meter(c.anger, 100, angerColor)}
  <div class="row"><b>満足度</b><span>${Math.round(c.satisfaction)}/100</span></div>
  ${meter(c.satisfaction, 100, '#6ee7a8')}
  <div class="row"><b>待ち時間</b><span>${Math.round(c.waitTime * CFG.GAME_MIN_PER_SEC)}分</span></div>
  <div class="row"><b>忍耐力</b><span>${Math.round(c.patience)}</span></div>
  <div class="row"><b>案件難易度</b><span>${'★'.repeat(c.difficulty)}</span></div>
  ${c.mismatch ? '<div class="row"><b>担当</b><span>力量とかみ合っていない</span></div>' : ''}
  ${c.entryShock > 0.02 ? `<div class="row"><b>入店時の行列</b><span>忍耐 -${Math.round(c.entryShock * 100)}%</span></div>` : ''}
  <div class="row"><b>状態</b><span>${esc(c.stateText())}</span></div>
  <div class="traits">${c.traits.map((t) => `<span>${esc(t.name)}</span>`).join('')}</div>`;
}
