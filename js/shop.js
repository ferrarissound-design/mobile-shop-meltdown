import * as THREE from '../vendor/three.module.min.js';
import { PALETTE } from './config.js';

// ============================================================
// 店舗レイアウト定義(座標は床面 xz、y=0 が床)
// ============================================================
export const LAYOUT = {
  room: { minX: -9, maxX: 9, minZ: -7.5, maxZ: 7.5, h: 3.2 },
  doorGap: [-1.7, 1.7],
  exit: { x: 0, z: 9.2 },
  entry: { x: 0, z: 6.4 },
  reception: { deskX: -7.5, deskZ: 4.4, spot: { x: -6.05, z: 4.4 } },
  counters: [
    { x: -5.5, z: -4.6, staffSpot: { x: -5.5, z: -5.6 }, guestSpot: { x: -5.5, z: -3.55 } },
    { x: 0.0, z: -4.6, staffSpot: { x: 0.0, z: -5.6 }, guestSpot: { x: 0.0, z: -3.55 } },
    { x: 5.5, z: -4.6, staffSpot: { x: 5.5, z: -5.6 }, guestSpot: { x: 5.5, z: -3.55 } },
  ],
  backyard: { x: 8.1, z: -6.4 },
  seats: [], // 待合椅子(下で生成)
  standSpots: [],
  idleSpots: [],
  displays: [],
};

// 待合椅子 8席(2列 x 4)
for (const z of [1.7, 3.4]) {
  for (const x of [-3.0, -1.0, 1.0, 3.0]) LAYOUT.seats.push({ x, z });
}
// 立ち待ちスポット(埋まるほど入口方向へ伸びる)
LAYOUT.standSpots = [
  { x: -4.9, z: 2.5 }, { x: 4.9, z: 2.5 }, { x: -4.9, z: 4.2 }, { x: 4.9, z: 4.2 },
  { x: -3.0, z: 5.3 }, { x: -1.0, z: 5.3 }, { x: 1.0, z: 5.3 }, { x: 3.0, z: 5.3 },
  { x: 4.9, z: 5.9 }, { x: -4.9, z: 5.9 },
  { x: 1.6, z: 6.6 }, { x: 3.2, z: 6.6 }, { x: 4.8, z: 6.6 }, { x: 6.4, z: 6.6 },
  { x: 7.9, z: 6.6 }, { x: 7.9, z: 5.0 }, { x: 7.9, z: 3.4 }, { x: 7.9, z: 1.8 },
];
// 店員の待機位置
LAYOUT.idleSpots = [
  { x: -5.5, z: -5.6 }, { x: 0, z: -5.6 }, { x: 5.5, z: -5.6 },
  { x: -2.6, z: -5.9 }, { x: 2.6, z: -5.9 }, { x: -7.9, z: -5.4 }, { x: 0, z: -6.5 },
];
// 展示台
for (const z of [-1.6, 0.2, 2.0]) {
  LAYOUT.displays.push({ x: -8.15, z });
  LAYOUT.displays.push({ x: 8.15, z });
}

// 障害物 AABB (ナビ用)
export const OBSTACLES = [
  // 受付デスク
  { minX: -8.05, maxX: -6.95, minZ: 2.9, maxZ: 5.9 },
  // 接客カウンター
  ...LAYOUT.counters.map((c) => ({ minX: c.x - 1.6, maxX: c.x + 1.6, minZ: c.z - 0.45, maxZ: c.z + 0.45 })),
  // 展示台
  ...LAYOUT.displays.map((d) => ({ minX: d.x - 0.55, maxX: d.x + 0.55, minZ: d.z - 0.7, maxZ: d.z + 0.7 })),
];

// ============================================================
// ジオメトリ構築
// ============================================================
const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function box(w, h, d, color, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), color instanceof THREE.Material ? color : mat(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function makeSignTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2f6fb5';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ffffff';
  g.font = 'bold 62px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 1;
  return t;
}

export function buildShop(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const R = LAYOUT.room;
  const W = R.maxX - R.minX;
  const D = R.maxZ - R.minZ;

  // ---- 床 ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(PALETTE.floor));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  root.add(floor);

  // 外の歩道
  const out = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), mat(0xcfcac2));
  out.rotation.x = -Math.PI / 2;
  out.position.set(0, -0.01, R.maxZ + 2);
  root.add(out);

  // 待合エリアのカーペット
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.6), mat(PALETTE.carpet));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.012, 2.55);
  root.add(rug);
  // カウンター前のライン
  const line = new THREE.Mesh(new THREE.PlaneGeometry(17.4, 2.6), mat(PALETTE.floorAlt));
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.008, -3.0);
  root.add(line);

  // ---- 壁 ----
  const wallMat = mat(PALETTE.wall);
  const wallMatBack = mat(PALETTE.wallBack);
  const t = 0.3;
  const walls = [];

  // 奥(-z) : バックヤード扉の分割
  const backGroup = new THREE.Group();
  const bdX = LAYOUT.backyard.x;
  box(bdX - 0.85 - R.minX, R.h, t, wallMatBack, (R.minX + bdX - 0.85) / 2, R.h / 2, R.minZ - t / 2, backGroup);
  box(R.maxX - (bdX + 0.85), R.h, t, wallMatBack, (bdX + 0.85 + R.maxX) / 2, R.h / 2, R.minZ - t / 2, backGroup);
  box(1.7, 0.9, t, wallMatBack, bdX, R.h - 0.45, R.minZ - t / 2, backGroup);
  // 扉枠
  box(1.7, R.h - 0.9, 0.12, mat(0x6b5b4c), bdX, (R.h - 0.9) / 2, R.minZ + 0.02, backGroup);
  const bySign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.36), new THREE.MeshBasicMaterial({ map: makeSignTexture('STAFF ONLY'), transparent: false }));
  bySign.position.set(bdX, R.h - 0.45, R.minZ + 0.1);
  backGroup.add(bySign);
  root.add(backGroup);
  walls.push({ mesh: backGroup, nx: 0, nz: -1 });

  // 手前(+z) : 入口
  const frontGroup = new THREE.Group();
  const [d0, d1] = LAYOUT.doorGap;
  box(d0 - R.minX, R.h, t, wallMat, (R.minX + d0) / 2, R.h / 2, R.maxZ + t / 2, frontGroup);
  box(R.maxX - d1, R.h, t, wallMat, (d1 + R.maxX) / 2, R.h / 2, R.maxZ + t / 2, frontGroup);
  box(d1 - d0, 0.8, t, wallMat, 0, R.h - 0.4, R.maxZ + t / 2, frontGroup);
  // 大きなガラス窓
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xbfe4ef, transparent: true, opacity: 0.35 });
  box(d0 - R.minX - 0.6, R.h - 1.4, 0.08, glassMat, (R.minX + d0) / 2, 1.5, R.maxZ, frontGroup);
  box(R.maxX - d1 - 0.6, R.h - 1.4, 0.08, glassMat, (d1 + R.maxX) / 2, 1.5, R.maxZ, frontGroup);
  root.add(frontGroup);
  walls.push({ mesh: frontGroup, nx: 0, nz: 1 });

  // 左右
  const leftW = box(t, R.h, D + t * 2, wallMat, R.minX - t / 2, R.h / 2, 0, root);
  walls.push({ mesh: leftW, nx: -1, nz: 0 });
  const rightW = box(t, R.h, D + t * 2, wallMat, R.maxX + t / 2, R.h / 2, 0, root);
  walls.push({ mesh: rightW, nx: 1, nz: 0 });

  // ---- 看板 ----
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.05),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('ケータイショップ') })
  );
  sign.position.set(-1.4, 2.5, R.minZ + 0.06);
  root.add(sign);

  // ---- 受付 ----
  const rec = new THREE.Group();
  const rx = LAYOUT.reception.deskX, rz = LAYOUT.reception.deskZ;
  box(1.05, 1.0, 3.0, PALETTE.desk, rx, 0.5, rz, rec);
  box(1.25, 0.1, 3.2, PALETTE.deskTop, rx, 1.05, rz, rec);
  box(0.5, 0.35, 0.5, PALETTE.accent, rx + 0.2, 1.28, rz + 0.9, rec); // 発券機
  box(0.36, 0.06, 0.36, 0xffffff, rx + 0.2, 1.46, rz + 0.9, rec);
  const recSign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshBasicMaterial({ map: makeSignTexture('受付') }));
  recSign.rotation.y = Math.PI / 2;
  recSign.position.set(rx + 0.65, 1.95, rz);
  rec.add(recSign);
  box(0.12, 1.9, 0.12, 0xbfb6ab, rx + 0.6, 0.95, rz - 1.2, rec);
  box(0.12, 1.9, 0.12, 0xbfb6ab, rx + 0.6, 0.95, rz + 1.2, rec);
  root.add(rec);

  // ---- 接客カウンター ----
  LAYOUT.counters.forEach((c, i) => {
    const g = new THREE.Group();
    box(3.2, 0.95, 0.9, PALETTE.desk, c.x, 0.475, c.z, g);
    box(3.4, 0.1, 1.1, PALETTE.deskTop, c.x, 0.99, c.z, g);
    // パーテーション
    box(0.08, 1.5, 1.0, 0xe4dbd0, c.x - 1.7, 0.75, c.z, g);
    box(0.08, 1.5, 1.0, 0xe4dbd0, c.x + 1.7, 0.75, c.z, g);
    // 番号プレート
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.36), new THREE.MeshBasicMaterial({ map: makeSignTexture(String(i + 1)) }));
    num.position.set(c.x, 1.62, c.z - 0.02);
    num.rotation.y = Math.PI;
    g.add(num);
    // 椅子
    makeChair(g, c.guestSpot.x, c.guestSpot.z, 0);          // 背もたれは入口側=客はカウンターを向く
    makeChair(g, c.staffSpot.x, c.staffSpot.z, Math.PI);    // 店員は客の方を向く
    // PC
    box(0.5, 0.36, 0.06, 0x3c4450, c.x - 0.6, 1.22, c.z - 0.2, g);
    box(0.55, 0.04, 0.35, 0x6b7480, c.x - 0.6, 1.05, c.z - 0.05, g);
    root.add(g);
  });

  // ---- 待合椅子 ----
  const benchG = new THREE.Group();
  LAYOUT.seats.forEach((s) => makeChair(benchG, s.x, s.z, 0));
  root.add(benchG);

  // ---- 展示台 ----
  const dispG = new THREE.Group();
  LAYOUT.displays.forEach((d, i) => {
    const dir = d.x < 0 ? 1 : -1;
    box(1.0, 0.85, 1.4, PALETTE.stand, d.x, 0.425, d.z, dispG);
    box(1.1, 0.08, 1.5, 0xffffff, d.x, 0.89, d.z, dispG);
    for (let k = 0; k < 3; k++) {
      const ph = box(0.16, 0.03, 0.3, [0x2b3440, 0xf0f0f2, 0xd4a05a][k % 3], d.x + dir * 0.12, 0.95, d.z - 0.45 + k * 0.45, dispG);
      ph.rotation.x = -0.35;
    }
    // POP
    const pop = box(0.6, 0.4, 0.03, [0xf05a5a, 0xf6c02f, 0x4fb3a5][i % 3], d.x + dir * 0.25, 1.2, d.z, dispG);
    pop.rotation.y = dir * -0.25;
  });
  root.add(dispG);

  // ---- 店の外(周辺の景色) ----
  const ext = new THREE.Group();
  // 歩道
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), mat(0xc8c3ba));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(0, -0.02, R.maxZ + 3.2);
  ext.add(walk);
  // 車道
  const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 9), mat(0x6d7276));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -0.04, R.maxZ + 11);
  ext.add(road);
  for (let i = -4; i <= 4; i++) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.24), mat(0xe8e4d8));
    ln.rotation.x = -Math.PI / 2;
    ln.position.set(i * 6, -0.03, R.maxZ + 11);
    ext.add(ln);
  }
  // 隣のビル
  const bcol = [0xb9b2a6, 0xa8b0b6, 0xc2b09c, 0x9aa39a, 0xb6a9b2];
  const blocks = [
    [-21.0, 2.0, 8.0, 10.0, 6], [21.0, 1.0, 8.0, 10.0, 7],
    [-20.0, -14.0, 10.0, 8.0, 5], [20.5, -14.5, 10.0, 8.0, 6],
    [0.0, -22.0, 20.0, 8.0, 6],
    [-14.0, 21.0, 11.0, 8.0, 6], [13.0, 21.5, 13.0, 8.0, 7],
  ];
  blocks.forEach(([x, z, w, d, h], i) => {
    const b = box(w, h, d, bcol[i % bcol.length], x, h / 2, z, ext);
    // 窓のライン
    for (let k = 1; k < Math.floor(h / 2.2); k++) {
      const win = box(w * 0.86, 0.5, d * 0.86, 0x77848c, x, k * 2.2, z, ext);
      win.renderOrder = 1;
    }
  });
  // 街路樹
  [[-11.5, 9.5], [11.5, 9.5], [-4.5, 9.8], [5.5, 9.8]].forEach(([x, z]) => {
    box(0.3, 1.3, 0.3, 0x7a6046, x, 0.65, z, ext);
    const t2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), mat(0x6a9e63));
    t2.position.set(x, 2.1, z);
    ext.add(t2);
  });
  root.add(ext);

  // ---- 観葉植物 ----
  [[-8.2, 6.6], [8.2, -1.0 + 8.0]].forEach(([x, z]) => {
    box(0.5, 0.5, 0.5, 0xb98a63, x, 0.25, z, root);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(0x6fae6a));
    leaf.position.set(x, 0.95, z);
    root.add(leaf);
  });

  return { root, walls };
}

const chairGeoLeg = new THREE.BoxGeometry(0.08, 0.42, 0.08);
const chairGeoSeat = new THREE.BoxGeometry(0.72, 0.1, 0.68);
const chairGeoBack = new THREE.BoxGeometry(0.72, 0.6, 0.1);
const chairMatSeat = new THREE.MeshLambertMaterial({ color: PALETTE.chairSeat });
const chairMatFrame = new THREE.MeshLambertMaterial({ color: PALETTE.chair });

function makeChair(parent, x, z, rotY) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const seat = new THREE.Mesh(chairGeoSeat, chairMatSeat);
  seat.position.y = 0.46;
  g.add(seat);
  const back = new THREE.Mesh(chairGeoBack, chairMatFrame);
  back.position.set(0, 0.78, 0.29);
  g.add(back);
  for (const [dx, dz] of [[-0.3, -0.28], [0.3, -0.28], [-0.3, 0.28], [0.3, 0.28]]) {
    const l = new THREE.Mesh(chairGeoLeg, chairMatFrame);
    l.position.set(dx, 0.21, dz);
    g.add(l);
  }
  parent.add(g);
  return g;
}
