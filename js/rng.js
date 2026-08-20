// 乱数ユーティリティ
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;

/** 配列から重複なしでn個選ぶ */
export function pickN(arr, n) {
  const pool = arr.slice();
  const out = [];
  n = Math.min(n, pool.length);
  for (let i = 0; i < n; i++) out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  return out;
}

/** 重み付き抽選 ({weight} を持つオブジェクト配列) */
export function pickWeighted(arr, weightOf = (o) => o.weight ?? 1) {
  let total = 0;
  for (const o of arr) total += weightOf(o);
  let r = Math.random() * total;
  for (const o of arr) {
    r -= weightOf(o);
    if (r <= 0) return o;
  }
  return arr[arr.length - 1];
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
