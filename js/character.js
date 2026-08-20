import * as THREE from '../vendor/three.module.min.js';
import { PALETTE } from './config.js';
import { pick, rand, chance } from './rng.js';

// ============================================================
// 共有ジオメトリ / マテリアル(軽量化のため使い回す)
// ============================================================
const G = {
  head: new THREE.SphereGeometry(0.21, 10, 8),
  hairCap: new THREE.SphereGeometry(0.225, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hairLong: new THREE.BoxGeometry(0.44, 0.34, 0.36),
  torso: new THREE.BoxGeometry(0.5, 0.62, 0.3),
  hip: new THREE.BoxGeometry(0.46, 0.18, 0.29),
  arm: new THREE.BoxGeometry(0.13, 0.52, 0.14),
  leg: new THREE.BoxGeometry(0.17, 0.6, 0.18),
  shadow: new THREE.CircleGeometry(0.34, 12),
  collar: new THREE.BoxGeometry(0.52, 0.1, 0.32),
  bag: new THREE.BoxGeometry(0.26, 0.3, 0.14),
};
G.shadow.rotateX(-Math.PI / 2);

const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });
const matCache = new Map();
function m(color) {
  let mm = matCache.get(color);
  if (!mm) { mm = new THREE.MeshLambertMaterial({ color }); matCache.set(color, mm); }
  return mm;
}

// ============================================================
// スプライト用テクスチャ(アイコン / 吹き出し)
// ============================================================
const iconCache = new Map();
function iconTexture(ch) {
  let t = iconCache.get(ch);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 72;
  const g = c.getContext('2d');
  g.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, 36, 40);
  t = new THREE.CanvasTexture(c);
  iconCache.set(ch, t);
  return t;
}

const bubbleCache = new Map();
function bubbleTexture(text, who) {
  const key = who + '|' + text;
  let e = bubbleCache.get(key);
  if (e) return e;
  const pad = 16;
  const fs = 26;
  const c = document.createElement('canvas');
  const g0 = c.getContext('2d');
  g0.font = `${fs}px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif`;
  const wpx = Math.min(520, Math.ceil(g0.measureText(text).width) + pad * 2);
  c.width = wpx;
  c.height = fs + pad * 2 + 12;
  const g = c.getContext('2d');
  g.font = `${fs}px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif`;
  g.fillStyle = who === 's' ? 'rgba(226,240,255,0.96)' : 'rgba(255,255,255,0.96)';
  roundRect(g, 2, 2, c.width - 4, c.height - 16, 14);
  g.fill();
  g.strokeStyle = who === 's' ? 'rgba(60,110,170,0.55)' : 'rgba(120,110,100,0.45)';
  g.lineWidth = 3;
  g.stroke();
  // しっぽ
  g.beginPath();
  g.moveTo(c.width / 2 - 9, c.height - 16);
  g.lineTo(c.width / 2 + 9, c.height - 16);
  g.lineTo(c.width / 2, c.height - 2);
  g.closePath();
  g.fillStyle = who === 's' ? 'rgba(226,240,255,0.96)' : 'rgba(255,255,255,0.96)';
  g.fill();
  g.fillStyle = '#25303c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, (c.height - 14) / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  e = { tex: t, aspect: c.width / c.height };
  if (bubbleCache.size > 140) {
    const first = bubbleCache.keys().next().value;
    bubbleCache.get(first).tex.dispose();
    bubbleCache.delete(first);
  }
  bubbleCache.set(key, e);
  return e;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ============================================================
// キャラクター
// ============================================================
export class Character {
  constructor(scene, look) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.look = look;

    const skin = look.skin;
    // 脚
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    for (const [g, sx] of [[this.legL, -0.12], [this.legR, 0.12]]) {
      g.position.set(sx, 0.66, 0);
      const mesh = new THREE.Mesh(G.leg, m(look.pants));
      mesh.position.y = -0.3;
      g.add(mesh);
      this.root.add(g);
    }
    // 腰
    const hip = new THREE.Mesh(G.hip, m(look.pants));
    hip.position.y = 0.72;
    this.root.add(hip);
    // 胴
    this.torso = new THREE.Mesh(G.torso, m(look.top));
    this.torso.position.y = 1.12;
    this.root.add(this.torso);
    if (look.collar) {
      const col = new THREE.Mesh(G.collar, m(look.collar));
      col.position.y = 1.38;
      this.root.add(col);
    }
    // 腕
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    for (const [g, sx] of [[this.armL, -0.32], [this.armR, 0.32]]) {
      g.position.set(sx, 1.36, 0);
      const upper = new THREE.Mesh(G.arm, m(look.top));
      upper.position.y = -0.26;
      g.add(upper);
      const hand = new THREE.Mesh(G.arm, m(skin));
      hand.scale.set(1.02, 0.28, 1.02);
      hand.position.y = -0.52;
      g.add(hand);
      this.root.add(g);
    }
    // 頭
    this.head = new THREE.Group();
    this.head.position.y = 1.62;
    const headMesh = new THREE.Mesh(G.head, m(skin));
    this.head.add(headMesh);
    const hair = new THREE.Mesh(look.longHair ? G.hairLong : G.hairCap, m(look.hair));
    if (look.longHair) hair.position.set(0, 0.02, -0.02);
    else hair.position.y = 0.01;
    this.head.add(hair);
    this.root.add(this.head);

    if (look.bag) {
      const bag = new THREE.Mesh(G.bag, m(look.bagColor));
      bag.position.set(0.3, 1.0, 0.16);
      this.root.add(bag);
    }

    // 影
    this.shadow = new THREE.Mesh(G.shadow, shadowMat);
    this.shadow.position.y = 0.02;
    this.root.add(this.shadow);

    // アイコン
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture('😐'), depthTest: false, transparent: true }));
    this.icon.scale.set(0.62, 0.62, 1);
    this.icon.position.y = 2.12;
    this.icon.visible = false;
    this.icon.renderOrder = 10;
    this.root.add(this.icon);
    this._iconChar = null;

    // 吹き出し
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.bubble.position.y = 2.62;
    this.bubble.visible = false;
    this.bubble.renderOrder = 11;
    this.root.add(this.bubble);
    this.bubbleTimer = 0;

    // 状態
    this.x = 0; this.z = 0; this.angle = 0;
    this.path = null;
    this.pathIdx = 0;
    this.speed = look.speed ?? 1.6;
    this.walkPhase = rand(0, 6.28);
    this.moving = false;
    this.sitting = false;
    this.agitation = 0;   // 0-1 いらだち(足踏み・慌ただしさ)
    this.baseY = 0;
    this.arrived = true;
    this.bobT = rand(0, 6.28);
    this.frameSkip = 0;
    this.gesture = 0;

    scene.add(this.root);
  }

  setPos(x, z) {
    this.x = x; this.z = z;
    this.root.position.set(x, 0, z);
  }

  face(x, z) {
    const dx = x - this.x, dz = z - this.z;
    if (dx * dx + dz * dz > 1e-5) this.angle = Math.atan2(dx, dz);
  }

  setPath(points) {
    if (points) points = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
    this.path = points && points.length ? points : null;
    this.pathIdx = 0;
    this.arrived = !this.path;
  }

  stop() { this.path = null; this.arrived = true; this.moving = false; }

  setSitting(v) {
    if (this.sitting === v) return;
    this.sitting = v;
    if (v) {
      this.root.position.y = -0.16;
      this.legL.rotation.x = -1.45; this.legR.rotation.x = -1.45;
      this.armL.rotation.x = -0.55; this.armR.rotation.x = -0.55;
      this.shadow.visible = false;
    } else {
      this.root.position.y = 0;
      this.legL.rotation.x = 0; this.legR.rotation.x = 0;
      this.armL.rotation.x = 0; this.armR.rotation.x = 0;
      this.shadow.visible = true;
    }
  }

  setIcon(ch) {
    if (ch === this._iconChar) return;
    this._iconChar = ch;
    if (!ch) { this.icon.visible = false; return; }
    this.icon.material.map = iconTexture(ch);
    this.icon.material.needsUpdate = true;
    this.icon.visible = true;
  }

  say(text, who, dur = 3.2) {
    const e = bubbleTexture(text, who);
    this.bubble.material.map = e.tex;
    this.bubble.material.needsUpdate = true;
    const h = 0.46;
    this.bubble.scale.set(h * e.aspect, h, 1);
    this.bubble.visible = true;
    this.bubbleTimer = dur;
    this.gesture = 1;
  }

  hideBubble() { this.bubble.visible = false; this.bubbleTimer = 0; }

  /** dt秒進める。far=true なら簡易更新 */
  update(dt, far) {
    // 安全装置: 座標が壊れたら復帰させる
    if (!Number.isFinite(this.x) || !Number.isFinite(this.z)) {
      this.x = 0; this.z = 6; this.path = null; this.arrived = true;
    }
    // 移動
    this.moving = false;
    if (this.path) {
      const tgt = this.path[this.pathIdx];
      const dx = tgt.x - this.x, dz = tgt.z - this.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * (1 + this.agitation * 0.45) * dt;
      if (d <= step) {
        this.x = tgt.x; this.z = tgt.z;
        this.pathIdx++;
        if (this.pathIdx >= this.path.length) { this.path = null; this.arrived = true; }
      } else {
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
        this.moving = true;
      }
      if (d > 0.02) {
        const want = Math.atan2(dx, dz);
        let diff = want - this.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.angle += diff * Math.min(1, dt * 9);
      }
    }
    this.root.position.x = this.x;
    this.root.position.z = this.z;
    this.root.rotation.y = this.angle;

    // 吹き出し寿命
    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) this.bubble.visible = false;
    }
    if (this.gesture > 0) this.gesture = Math.max(0, this.gesture - dt * 1.6);

    if (far) {
      this.frameSkip = (this.frameSkip + 1) % 3;
      if (this.frameSkip !== 0) return;
      dt *= 3;
    }

    // アニメーション
    if (this.sitting) {
      this.bobT += dt * 1.4;
      const b = Math.sin(this.bobT) * 0.012;
      this.torso.position.y = 1.12 + b;
      this.head.position.y = 1.62 + b;
      const g = this.gesture * Math.sin(this.bobT * 7) * 0.35;
      this.armR.rotation.x = -0.55 + g;
      this.armL.rotation.x = -0.55 - g * 0.4;
      this.head.rotation.z = Math.sin(this.bobT * 2.2) * 0.04 + this.agitation * Math.sin(this.bobT * 9) * 0.09;
      return;
    }

    if (this.moving) {
      this.walkPhase += dt * (7.2 + this.agitation * 3.2);
      const s = Math.sin(this.walkPhase);
      const s2 = Math.sin(this.walkPhase * 2);
      this.legL.rotation.x = s * 0.62;
      this.legR.rotation.x = -s * 0.62;
      this.armL.rotation.x = -s * 0.5;
      this.armR.rotation.x = s * 0.5;
      this.root.position.y = Math.abs(s2) * 0.035;
      this.head.rotation.z = 0;
      this.torso.rotation.z = s * 0.03;
    } else if (this.agitation > 0.35) {
      // 足踏み
      this.walkPhase += dt * 9.5;
      const s = Math.sin(this.walkPhase);
      this.legL.rotation.x = Math.max(0, s) * 0.5;
      this.legR.rotation.x = Math.max(0, -s) * 0.5;
      this.armL.rotation.x = s * 0.22;
      this.armR.rotation.x = -s * 0.22;
      this.root.position.y = 0;
      this.head.rotation.z = Math.sin(this.walkPhase * 1.7) * 0.12;
      this.torso.rotation.z = 0;
    } else {
      this.bobT += dt * 1.6;
      const b = Math.sin(this.bobT) * 0.016;
      this.legL.rotation.x *= 0.85;
      this.legR.rotation.x *= 0.85;
      const g = this.gesture * Math.sin(this.bobT * 6) * 0.4;
      this.armL.rotation.x = -g * 0.3 + Math.sin(this.bobT * 0.9) * 0.03;
      this.armR.rotation.x = g + Math.sin(this.bobT * 0.9 + 1) * 0.03;
      this.root.position.y = b * 0.5;
      this.torso.position.y = 1.12 + b;
      this.head.position.y = 1.62 + b;
      this.head.rotation.z = Math.sin(this.bobT * 0.7) * 0.05;
      this.torso.rotation.z = 0;
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.isSprite) o.material.dispose();
    });
  }
}

// ---------- 見た目の生成 ----------
export function staffLook(typeColor) {
  return {
    top: PALETTE.staffUniform,
    collar: typeColor,
    pants: PALETTE.staffUniform2,
    skin: pick(PALETTE.skin),
    hair: pick(PALETTE.hair),
    longHair: chance(0.45),
    speed: rand(1.7, 2.0),
  };
}

export function customerLook() {
  return {
    top: pick(PALETTE.customerTops),
    pants: pick(PALETTE.customerPants),
    skin: pick(PALETTE.skin),
    hair: pick(PALETTE.hair),
    longHair: chance(0.45),
    bag: chance(0.5),
    bagColor: pick([0x6b5b4c, 0x2f3b46, 0xb0553f, 0x8a7f9b]),
    speed: rand(1.2, 1.7),
  };
}
