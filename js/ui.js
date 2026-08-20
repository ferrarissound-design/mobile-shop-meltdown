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
      start: $('start'), gameover: $('gameover'),
      resultCause: $('resultCause'), resultTable: $('resultTable'),
      resultRecords: $('resultRecords'), records: $('records'),
    };
    this.bannerTimer = 0;
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

    const cd = g.supportCooldown;
    const btn = this.el.supportBtn;
    if (cd > 0) {
      btn.disabled = true;
      this.el.supportCd.style.width = (100 - (cd / CFG.SUPPORT_COOLDOWN) * 100) + '%';
      btn.firstElementChild.textContent = `📣 応援 (${Math.ceil(cd)}s)`;
    } else if (btn.disabled) {
      btn.disabled = false;
      this.el.supportCd.style.width = '0%';
      btn.firstElementChild.textContent = '📣 応援スタッフを呼ぶ';
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
    this.el.resultTable.innerHTML = rows
      .map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');
    this.el.resultCause.innerHTML = '<b>今回の主な崩壊原因</b>';
    const span = document.createElement('span');
    span.textContent = stats.cause;
    this.el.resultCause.appendChild(span);
    const { rec, updated } = this.saveRecords(stats);
    this.showRecords(this.el.resultRecords, rec, updated);
    this.el.gameover.classList.remove('hidden');
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
  <div class="row"><b>ストレス</b><span>${Math.round(s.stress)}/100</span></div>
  ${meter(s.stress, 100, stressColor)}
  <div class="row"><b>疲労</b><span>${Math.round(s.fatigue)}/100</span></div>
  ${meter(s.fatigue, 100, '#8ec3ff')}
  <div class="row"><b>メンタル</b><span>${Math.round(s.mental)}/100</span></div>
  ${meter(s.mental, 100, '#c4a6ff')}
  <div class="row"><b>接客能力</b><span>${Math.round(s.skill * 100)}</span></div>
  <div class="row"><b>処理速度</b><span>×${s.speedStat.toFixed(2)}</span></div>
  <div class="row"><b>対応人数</b><span>${s.served}人</span></div>
  <div class="row"><b>売上</b><span>¥${Math.round(s.sales).toLocaleString('ja-JP')}</span></div>
  <div class="row"><b>現在の客</b><span>${s.customer ? esc(s.customer.label) : '—'}</span></div>
  <div class="row"><b>状態</b><span>${esc(staffStateText(s))}</span></div>`;
}

function staffStateText(s) {
  return {
    idle: '待機中', toCounter: 'カウンターへ移動中', waitingGuest: 'お客様を待っている',
    serving: '接客中', wrapup: '事後処理中', toBreak: 'バックヤードへ移動中',
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
  <div class="row"><b>状態</b><span>${esc(c.stateText())}</span></div>
  <div class="traits">${c.traits.map((t) => `<span>${esc(t.name)}</span>`).join('')}</div>`;
}
