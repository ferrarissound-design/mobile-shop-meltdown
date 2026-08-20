// ============================================================
// 崩壊連鎖(因果グラフ)
// ------------------------------------------------------------
// ゲーム中の出来事を「原因つきのノード」として記録し、
// 終了時に「今回の崩壊がどの連鎖で起きたか」を復元する。
//
//   record(tag, label, { causes, impact, meta })
//     causes : このノードを引き起こした先行ノードの id 配列
//     impact : この出来事が平穏度に与えたダメージ(責任の重さ)
//
// 終了時は impact を子から親へ減衰させながら遡上させ、
// 「一番責任の重い根っこ」を主因として取り出す。
// ============================================================
import { pick, chance } from './rng.js';
import { WEEKDAYS, TITLE_FALLBACK } from './data.js';

const DECAY = 0.72;      // 子から親へ責任が伝わる割合
const MAX_NODES = 460;   // メモリ上限(古い枝葉から間引く)
const MAX_CHAIN = 8;     // 表示する連鎖の最大段数

export class Cascade {
  constructor() {
    this.nodes = [];
    this.map = new Map();
    this.seq = 0;
    this.terminal = null;
  }

  /** 出来事を記録して id を返す */
  record(tag, label, opts = {}) {
    const causes = [];
    const src = opts.causes;
    if (src) {
      for (const c of src) {
        if (c && this.map.has(c) && !causes.includes(c)) causes.push(c);
      }
    }
    const n = {
      id: ++this.seq,
      tag,
      label,
      clock: opts.clock || '',
      t: opts.t || 0,
      causes,
      impact: opts.impact || 0,
      meta: opts.meta || null,
      blame: 0,
    };
    this.nodes.push(n);
    this.map.set(n.id, n);
    if (this.nodes.length > MAX_NODES) this.trim();
    return n.id;
  }

  /** 後から判明したダメージを足す */
  addImpact(id, v) {
    const n = this.map.get(id);
    if (n) n.impact += v;
  }

  /** 後から判明した内容でラベルを書き換える(接客の最終所要時間など) */
  relabel(id, label, meta = null) {
    const n = this.map.get(id);
    if (!n) return;
    n.label = label;
    if (meta) n.meta = { ...(n.meta || {}), ...meta };
  }

  has(id) { return this.map.has(id); }
  get(id) { return this.map.get(id); }

  /** 影響の小さい古いノードから間引く(連鎖の骨格は残す) */
  trim() {
    const target = Math.floor(MAX_NODES * 0.75);
    const dropCount = this.nodes.length - target;
    const drop = new Set();
    // 影響が小さく、他から参照されていない古いノードを優先的に落とす
    const referenced = new Set();
    for (const n of this.nodes) for (const c of n.causes) referenced.add(c);
    for (const n of this.nodes) {
      if (drop.size >= dropCount) break;
      if (n.impact <= 0.01 && !referenced.has(n.id)) drop.add(n.id);
    }
    for (const n of this.nodes) {
      if (drop.size >= dropCount) break;
      if (n.impact <= 0.5 && !referenced.has(n.id)) drop.add(n.id);
    }
    if (!drop.size) for (let i = 0; i < dropCount; i++) drop.add(this.nodes[i].id);
    this.nodes = this.nodes.filter((n) => !drop.has(n.id));
    for (const id of drop) this.map.delete(id);
    for (const n of this.nodes) n.causes = n.causes.filter((c) => this.map.has(c));
  }

  /** 直近で影響の大きかったノードを n 件 */
  recentImpactful(n = 3, within = 90) {
    const last = this.nodes.length ? this.nodes[this.nodes.length - 1].t : 0;
    return this.nodes
      .filter((x) => x.impact > 0.2 && last - x.t <= within)
      .sort((a, b) => b.impact - a.impact || b.t - a.t)
      .slice(0, n)
      .map((x) => x.id);
  }

  // ---------- 解析 ----------
  analyze(stats) {
    for (const n of this.nodes) n.blame = n.impact;
    // 時系列の逆順に、責任を原因側へ流す
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (!n.causes.length || n.blame <= 0) continue;
      const share = (n.blame * DECAY) / n.causes.length;
      for (const cid of n.causes) {
        const p = this.map.get(cid);
        if (p) p.blame += share;
      }
    }

    const terminal = (this.terminal && this.map.get(this.terminal))
      || this.nodes[this.nodes.length - 1] || null;
    let chain = this.walk(terminal);
    chain = this.pad(chain);

    const root = chain.length ? chain[0] : terminal;
    const cause = root ? root.label : 'じわじわ積み重なった小さなトラブル';
    return {
      chain: chain.map((n) => ({ label: n.label, clock: n.clock, tag: n.tag })),
      cause,
      rootTag: root ? root.tag : 'unknown',
      title: makeTitle(root, chain, stats),
    };
  }

  /** 終端ノードから責任の重い原因を辿る */
  walk(terminal) {
    if (!terminal) return [];
    const out = [terminal];
    const seen = new Set([terminal.id]);
    let cur = terminal;
    for (let i = 0; i < MAX_CHAIN * 2; i++) {
      if (!cur.causes.length) break;
      let best = null;
      for (const cid of cur.causes) {
        const p = this.map.get(cid);
        if (!p || seen.has(p.id)) continue;
        if (!best || p.blame > best.blame) best = p;
      }
      if (!best) break;
      seen.add(best.id);
      out.push(best);
      cur = best;
    }
    out.reverse();
    return dedupe(out).slice(-MAX_CHAIN);
  }

  /** 連鎖が短いときは、責任の重いノードで間を埋める */
  pad(chain) {
    if (chain.length >= 4) return chain;
    const have = new Set(chain.map((n) => n.id));
    const extra = this.nodes
      .filter((n) => !have.has(n.id) && n.blame > 0.6)
      .sort((a, b) => b.blame - a.blame)
      .slice(0, MAX_CHAIN - chain.length);
    const merged = dedupe([...chain, ...extra].sort((a, b) => a.t - b.t));
    return merged.slice(-MAX_CHAIN);
  }
}

// 同じ種類の出来事が連続したら1行にまとめる(「待ち時間超過」が6行並ばないように)
const REPEATABLE = new Set(['longWait', 'queue', 'trouble', 'complaint', 'angryLeave', 'gate', 'stress']);

function dedupe(list) {
  const out = [];
  for (const n of list) {
    const prev = out.length ? out[out.length - 1] : null;
    if (prev && prev.label === n.label) continue;
    if (prev && prev.tag === n.tag && REPEATABLE.has(n.tag)) {
      // 直近のものを代表にして、件数だけ添える
      const count = (prev._merged || 1) + 1;
      out[out.length - 1] = { ...n, _merged: count, label: `${n.label}(ほか${count - 1}件)` };
      continue;
    }
    out.push(n);
  }
  return out;
}

// ============================================================
// タイトル生成
// ============================================================
function makeTitle(root, chain, stats = {}) {
  const m = (root && root.meta) || {};
  const tag = root ? root.tag : '';
  const cands = [];
  const add = (text, w = 1) => { if (text) cands.push([text, w]); };

  const purpose = m.purpose || pickMeta(chain, 'purpose');
  const staffName = m.staff || pickMeta(chain, 'staff');
  const staffType = m.staffType || pickMeta(chain, 'staffType');
  const trouble = m.trouble || pickMeta(chain, 'trouble');
  const special = m.special || pickMeta(chain, 'special');
  const trait = m.trait || pickMeta(chain, 'trait');
  const wait = Math.round(stats.maxWait || 0);

  switch (tag) {
    case 'mismatch':
      add(`${staffType || '新人'}に${purpose || 'あの案件'}を任せた結果`, 3);
      add(`${purpose || 'あの案件'}、担当を間違えた`, 2);
      break;
    case 'longServe':
      if (m.minutes) add(`${purpose || 'その相談'}に${m.minutes}分かけた店`, 3);
      add(`終わらない${purpose || '接客'}`, 2);
      add(`${purpose || 'あの相談'}が終わらなかった日`, 1.5);
      break;
    case 'special':
      add(`${special || 'あの一件'}から始まった地獄`, 3);
      add(`${special || 'あれ'}さえ来なければ`, 2);
      break;
    case 'rare':
      add(`「${special || purpose || 'その相談'}」と言われた日`, 3);
      break;
    case 'claimer':
      add('あの客が全てを壊した', 3);
      add('クレーマー1名、店1軒', 2);
      break;
    case 'meltdown':
    case 'quit':
      add(`${staffName ? staffName + 'を' : 'ベテランを'}失った店`, 3);
      add(`${staffName || '店員'}が消えた日`, 2);
      break;
    case 'queue':
    case 'longWait':
      if (wait) add(`待ち時間${wait}分の悲劇`, 2.2);
      add('待合室が先に壊れた', 2);
      add('椅子が足りなかっただけの日', 1.6);
      if (purpose) add(`${purpose}の順番が回ってこなかった`, 2);
      add(`最大${stats.maxQueue || ''}人、全員おまたせ`, 1.6);
      add('番号は呼ばれなかった', 1.6);
      break;
    case 'mistake':
      add(`${purpose || '手続き'}のやり直しから全部おかしくなった`, 3);
      break;
    case 'trouble':
      add(`${trouble || 'あの一言'}から始まった地獄`, 3);
      add(`本日${stats.complaints || ''}件目の「${trouble || '……'}」`, 1.5);
      break;
    case 'conflict':
      add('店員が先にキレた日', 3);
      break;
    case 'trait':
      add(`${trait || 'あのお客様'}が全てを壊した`, 3);
      break;
    default:
      break;
  }

  // 状況からの補助タイトル(主因由来のタイトルを消さないよう控えめな重みにする)
  if (wait >= 15) add(`待ち時間${wait}分の悲劇`, 0.7);
  if ((stats.angryLeft || 0) >= 8) add(`${stats.angryLeft}人が帰っていった`, 0.9);
  if ((stats.claims || 0) >= 3) add('謝りっぱなしの一日', 0.9);
  if ((stats.panics || 0) >= 2) add('誰も落ち着いていなかった', 0.9);
  if ((stats.conflicts || 0) >= 2) add('店員のほうが先に限界だった', 1.0);
  if ((stats.meltdowns || 0) >= 2) {
    add(`店員${stats.meltdowns}人が沈んだ日`, 0.9);
    add('バックヤードが満員になった', 0.7);
    add('笑顔が先に品切れした', 0.7);
  }
  if ((stats.quits || 0) >= 1 && staffName) add(`${staffName}が帰った日`, 1.6);
  if ((stats.mistakes || 0) >= 4) add(`ミス${stats.mistakes}回、それでも営業中`, 1.2);
  if ((stats.turnedAway || 0) >= 6) add('入口を閉めても手遅れだった', 1.2);
  if ((stats.specialEvents || 0) >= 3) add('今日は何かがおかしかった', 1.0);
  if ((stats.served || 0) === 0) add('誰ひとり帰せなかった', 2.0);
  if ((stats.sales || 0) === 0) add('売上0円、被害甚大', 1.6);

  if (!cands.length) {
    return fill(pick(TITLE_FALLBACK));
  }
  // 重み付きで選ぶ(毎回同じにならないように)
  let total = 0;
  for (const c of cands) total += c[1];
  let r = Math.random() * total;
  for (const [text, w] of cands) {
    r -= w;
    if (r <= 0) return fill(text);
  }
  return fill(cands[0][0]);
}

function fill(text) {
  return text.replace('{weekday}', pick(WEEKDAYS)).replace(/\s+/g, ' ').trim();
}

function pickMeta(chain, key) {
  for (let i = chain.length - 1; i >= 0; i--) {
    const meta = chain[i].meta;
    if (meta && meta[key]) return meta[key];
  }
  return null;
}

// テストしやすいよう公開
export const _internal = { makeTitle, chance };
