import { LAYOUT, OBSTACLES } from './shop.js';

// ============================================================
// 簡易グリッドナビゲーション (A* + 直線可視スムージング)
// ============================================================
const CELL = 0.45;
const PAD = 0.34; // キャラ半径ぶんの膨張

const MINX = LAYOUT.room.minX;
const MAXX = LAYOUT.room.maxX;
const MINZ = LAYOUT.room.minZ;
const MAXZ = 9.8; // 店の外(退店エリア)まで

const W = Math.ceil((MAXX - MINX) / CELL);
const H = Math.ceil((MAXZ - MINZ) / CELL);
const blocked = new Uint8Array(W * H);

const cx = (i) => MINX + (i + 0.5) * CELL;
const cz = (j) => MINZ + (j + 0.5) * CELL;
const ix = (x) => Math.min(W - 1, Math.max(0, Math.floor((x - MINX) / CELL)));
const iz = (z) => Math.min(H - 1, Math.max(0, Math.floor((z - MINZ) / CELL)));

function buildGrid() {
  const doorL = LAYOUT.doorGap[0] + PAD * 0.4;
  const doorR = LAYOUT.doorGap[1] - PAD * 0.4;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = cx(i), z = cz(j);
      let b = 0;
      // 壁の内側マージン
      if (x < MINX + PAD || x > MAXX - PAD || z < MINZ + PAD) b = 1;
      // 正面の壁(入口の隙間だけ通れる)
      if (Math.abs(z - LAYOUT.room.maxZ) < CELL * 0.9 && (x < doorL || x > doorR)) b = 1;
      if (z > LAYOUT.room.maxZ) {
        // 外は入口前の通路だけ
        if (x < doorL - 1.2 || x > doorR + 1.2) b = 1;
      }
      // 障害物
      for (const o of OBSTACLES) {
        if (x > o.minX - PAD && x < o.maxX + PAD && z > o.minZ - PAD && z < o.maxZ + PAD) { b = 1; break; }
      }
      blocked[j * W + i] = b;
    }
  }
}
buildGrid();

export function isBlocked(x, z) {
  if (x < MINX || x > MAXX || z < MINZ || z > MAXZ) return true;
  return blocked[iz(z) * W + ix(x)] === 1;
}

/** 目的地が壁の中なら、いちばん近い通行可能セルへ寄せる */
function nearestFree(i, j) {
  if (!blocked[j * W + i]) return [i, j];
  for (let r = 1; r < 12; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        if (!blocked[nj * W + ni]) return [ni, nj];
      }
    }
  }
  return [i, j];
}

// 事前確保した作業配列(GC削減)
const gScore = new Float32Array(W * H);
const fScore = new Float32Array(W * H);
const cameFrom = new Int32Array(W * H);
const openMark = new Uint8Array(W * H);
const closed = new Uint8Array(W * H);
let stamp = 0;
const stampArr = new Int32Array(W * H);

const NB = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
];

/** 直線で行けるか(グリッド上のサンプリング) */
function lineFree(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const dist = Math.hypot(dx, dz);
  const steps = Math.ceil(dist / (CELL * 0.6));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (isBlocked(x0 + dx * t, z0 + dz * t)) return false;
  }
  return true;
}

/**
 * 経路を返す [{x,z}, ...] (現在地は含まない)
 */
export function findPath(sx, sz, tx, tz) {
  if (lineFree(sx, sz, tx, tz)) return [{ x: tx, z: tz }];

  const [si, sj] = nearestFree(ix(sx), iz(sz));
  const [ti, tj] = nearestFree(ix(tx), iz(tz));
  const start = sj * W + si;
  const goal = tj * W + ti;
  if (start === goal) return [{ x: tx, z: tz }];

  stamp++;
  const open = [start];
  stampArr[start] = stamp;
  gScore[start] = 0;
  fScore[start] = Math.hypot(ti - si, tj - sj);
  cameFrom[start] = -1;
  openMark[start] = 1;
  closed[start] = 0;

  let guard = 0;
  while (open.length && guard++ < 6000) {
    // 最小f を線形探索(グリッドが小さいので十分速い)
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (fScore[open[k]] < fScore[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    openMark[cur] = 0;
    if (cur === goal) return reconstruct(cur, tx, tz, sx, sz);
    closed[cur] = 1;

    const ci = cur % W, cj = (cur / W) | 0;
    for (const [di, dj, cost] of NB) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nid = nj * W + ni;
      if (blocked[nid]) continue;
      if (di && dj && (blocked[cj * W + ni] || blocked[nj * W + ci])) continue; // 斜めすり抜け防止
      if (stampArr[nid] === stamp && closed[nid]) continue;
      const tentative = gScore[cur] + cost;
      if (stampArr[nid] !== stamp) {
        stampArr[nid] = stamp;
        closed[nid] = 0;
        openMark[nid] = 0;
        gScore[nid] = Infinity;
      }
      if (tentative < gScore[nid]) {
        cameFrom[nid] = cur;
        gScore[nid] = tentative;
        fScore[nid] = tentative + Math.hypot(ti - ni, tj - nj);
        if (!openMark[nid]) { open.push(nid); openMark[nid] = 1; }
      }
    }
  }
  // 見つからない場合は直行
  return [{ x: tx, z: tz }];
}

function reconstruct(cur, tx, tz, sx, sz) {
  const raw = [];
  let n = cur;
  while (n !== -1) {
    raw.push({ x: cx(n % W), z: cz((n / W) | 0) });
    n = cameFrom[n];
  }
  raw.reverse();
  raw.push({ x: tx, z: tz });

  // スムージング: 見通せる限り中間点を飛ばす
  const out = [];
  let px = sx, pz = sz;
  let i = 0;
  while (i < raw.length) {
    let best = i;
    for (let k = raw.length - 1; k > i; k--) {
      if (lineFree(px, pz, raw[k].x, raw[k].z)) { best = k; break; }
    }
    out.push(raw[best]);
    px = raw[best].x; pz = raw[best].z;
    if (best === raw.length - 1) break;
    i = best + 1;
  }
  return out;
}
