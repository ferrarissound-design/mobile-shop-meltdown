import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { buildShop, LAYOUT } from './shop.js';
import { Game } from './sim.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';

// ============================================================
// 描画セットアップ
// ============================================================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: window.devicePixelRatio < 2,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x1b2430, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb6c9);
scene.fog = new THREE.Fog(0x9fb6c9, 34, 70);

const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 120);

// ライト(影なし・軽量)
scene.add(new THREE.HemisphereLight(0xffffff, 0x9c907f, 1.05));
const sun = new THREE.DirectionalLight(0xfff2dc, 0.62);
sun.position.set(7, 14, 9);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xd8e8ff, 0.22);
fill.position.set(-8, 7, -9);
scene.add(fill);

// 地面(店の外)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshLambertMaterial({ color: 0x8fa08a })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
scene.add(ground);

const { walls } = buildShop(scene);

// ============================================================
// カメラ操作(クォータービュー / タッチ対応)
// ============================================================
const cam = {
  theta: 0.16,
  phi: 0.70,
  radius: 22,
  target: new THREE.Vector3(0, 0.9, -0.6),
  tTheta: 0.16, tPhi: 0.70, tRadius: 22,
};
const CAM_LIMIT = { phiMin: 0.26, phiMax: 1.12, rMin: 10, rMax: 32 };

function applyCamera(dt) {
  cam.theta += (cam.tTheta - cam.theta) * Math.min(1, dt * 12);
  cam.phi += (cam.tPhi - cam.phi) * Math.min(1, dt * 12);
  cam.radius += (cam.tRadius - cam.radius) * Math.min(1, dt * 10);
  const sp = Math.sin(cam.phi);
  camera.position.set(
    cam.target.x + cam.radius * sp * Math.sin(cam.theta),
    cam.target.y + cam.radius * Math.cos(cam.phi),
    cam.target.z + cam.radius * sp * Math.cos(cam.theta)
  );
  camera.lookAt(cam.target);

  // カメラ側の壁を隠す(壁の中に入り込まないようにする)
  for (const w of walls) {
    const d = w.nx * (camera.position.x - cam.target.x) + w.nz * (camera.position.z - cam.target.z);
    w.mesh.visible = d < 1.0;
  }
}

// --- ポインタ入力 ---
let userZoomed = false;
let camReady = false;
const pointers = new Map();
let pinchDist = 0, pinchRadius = 0;
let downInfo = null;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    pinchRadius = cam.tRadius;
    downInfo = null;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;

  if (pointers.size === 1) {
    if (downInfo) downInfo.moved += Math.abs(dx) + Math.abs(dy);
    cam.tTheta -= dx * 0.006;
    cam.tPhi = clampNum(cam.tPhi - dy * 0.005, CAM_LIMIT.phiMin, CAM_LIMIT.phiMax);
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0) {
      userZoomed = true;
      cam.tRadius = clampNum(pinchRadius * (pinchDist / Math.max(1, d)), CAM_LIMIT.rMin, CAM_LIMIT.rMax);
    }
  }
}, { passive: true });

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (p && downInfo && pointers.size === 0) {
    const dt = performance.now() - downInfo.t;
    if (downInfo.moved < 12 && dt < 400) pickAt(e.clientX, e.clientY);
  }
  if (pointers.size === 0) downInfo = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  userZoomed = true;
  cam.tRadius = clampNum(cam.tRadius * (1 + Math.sign(e.deltaY) * 0.12), CAM_LIMIT.rMin, CAM_LIMIT.rMax);
}, { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

const clampNum = (v, a, b) => (v < a ? a : v > b ? b : v);

// --- タップ選択 ---
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pickAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(game.pickTargets(), true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.entity) o = o.parent;
    if (o && o.userData.entity) { ui.select(o.userData.entity); return; }
  }
  ui.hidePanel();
}

// ============================================================
// ゲーム
// ============================================================
const ui = new UI();
const sound = new Sound();
let speed = 1;
let paused = true;
let started = false;
let game = null;
let goodSfxCd = 0;

function makeGame() {
  ui.clearLog();
  ui.hidePanel();
  document.body.classList.remove('collapsing');
  game = new Game(scene, {
    onLog: (t, text, kind) => {
      ui.pushLog(t, text, kind);
      if (kind === 'special') sound.sfx('alert');
      else if (kind === 'bad') sound.sfx('angry');
      else if (text.includes('来店しました') && goodSfxCd <= 0) { sound.sfx('door'); goodSfxCd = 0.6; }
      else if (kind === 'good' && goodSfxCd <= 0) { sound.sfx('good'); goodSfxCd = 1.2; }
    },
    onBanner: (text) => { ui.showBanner(text); sound.sfx('alert'); },
    onGameOver: (stats) => {
      document.body.classList.add('collapsing');
      sound.sfx('over');
      setTimeout(() => ui.showGameOver(stats), 900);
    },
  });
}

// ============================================================
// メインループ
// ============================================================
let last = performance.now();
let acc = 0;
let uiAcc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;

  if (game && started && !paused && !game.over) {
    const scaled = Math.min(dt, 1 / 20) * speed;
    // ロジックは固定ステップ
    acc += scaled;
    let steps = 0;
    while (acc >= CFG.SIM_STEP && steps < 10) {
      game.update(CFG.SIM_STEP);
      acc -= CFG.SIM_STEP;
      steps++;
      if (game.over) break;
    }
    if (steps >= 10) acc = 0;
    // 見た目(移動・アニメーション)は可変ステップ
    game.updateCharacters(Math.min(scaled, 0.14), camera);
    game.separate(Math.min(scaled, 0.14));
    if (goodSfxCd > 0) goodSfxCd -= dt;
    sound.setChaos(game.chaos);
  } else if (game) {
    game.updateCharacters(Math.min(dt, 0.1), camera);
  }

  sound.update();
  applyCamera(dt);
  ui.tick(dt);

  uiAcc += dt;
  if (uiAcc > 0.18 && game) {
    uiAcc = 0;
    ui.setStats(game);
    ui.refreshPanel();
  }

  renderer.render(scene, camera);
}

// ============================================================
// リサイズ
// ============================================================
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  const portrait = h > w;
  camera.fov = portrait ? 52 : 45;
  camera.updateProjectionMatrix();
  // 縦画面では店全体が入るように引く
  const want = portrait ? 25.5 : 21.5;
  if (!userZoomed) { cam.tRadius = want; if (!camReady) { cam.radius = want; camReady = true; } }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ============================================================
// UIイベント
// ============================================================
document.querySelectorAll('#ctrlbar .sp').forEach((b) => {
  b.addEventListener('click', () => {
    const v = Number(b.dataset.sp);
    document.querySelectorAll('#ctrlbar .sp').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    if (v === 0) { paused = true; } else { paused = false; speed = v; }
    sound.resume();
  });
});

document.getElementById('soundBtn').addEventListener('click', (e) => {
  sound.init();
  sound.resume();
  const on = sound.toggle();
  e.currentTarget.textContent = on ? '🔊' : '🔇';
});

document.getElementById('supportBtn').addEventListener('click', () => {
  if (game && game.callSupport()) sound.sfx('good');
});

document.getElementById('startBtn').addEventListener('click', () => {
  sound.init();
  sound.resume();
  document.getElementById('start').classList.add('hidden');
  document.body.classList.add('playing');
  if (game) game.destroy();
  makeGame();
  started = true;
  paused = false;
  speed = 1;
  setSpeedButton(1);
});

document.getElementById('retryBtn').addEventListener('click', () => {
  ui.hideGameOver();
  if (game) game.destroy();
  makeGame();
  acc = 0;
  started = true;
  paused = false;
  speed = 1;
  setSpeedButton(1);
  sound.resume();
});

function setSpeedButton(v) {
  document.querySelectorAll('#ctrlbar .sp').forEach((x) => {
    x.classList.toggle('on', Number(x.dataset.sp) === v);
  });
}

// タブが非表示のあいだは進行を止める(復帰時の暴走防止)
document.addEventListener('visibilitychange', () => {
  last = performance.now();
  acc = 0;
});

// 起動前もカメラだけ回して背景を見せる
makeGame();
requestAnimationFrame(frame);

// デバッグ用フック
window.__game = () => game;
