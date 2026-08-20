// ============================================================
// 手続き的BGM / SE (音声ファイル不要・WebAudioのみ)
// ============================================================
const CALM = [0, 2, 4, 7, 9, 12];
const TENSE = [0, 1, 3, 6, 8, 10, 13];

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.chaos = 0;
    this.nextNote = 0;
    this.step = 0;
    this.master = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
      this.nextNote = this.ctx.currentTime + 0.1;
    } catch (e) { this.enabled = false; }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.16 : 0;
    return this.enabled;
  }

  setChaos(v) { this.chaos = v; }

  /** 毎フレーム呼ぶ。先読みでノートを予約する */
  update() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const beat = 0.42 - this.chaos * 0.16;
    while (this.nextNote < t + 0.3) {
      this.scheduleNote(this.nextNote);
      this.nextNote += beat;
      this.step++;
    }
  }

  scheduleNote(time) {
    const chaos = this.chaos;
    const scale = chaos > 0.5 ? TENSE : CALM;
    const s = this.step % 8;
    // ベース
    if (s % 4 === 0) {
      this.tone(time, 110 * Math.pow(2, (chaos > 0.5 ? -1 : 0) / 12), 0.5, 'triangle', 0.5);
    }
    if (s === 2 || s === 5 || s === 7 || (chaos > 0.6 && s % 2 === 1)) {
      const n = scale[(this.step * 3 + (s % 3)) % scale.length];
      const oct = chaos > 0.75 && (this.step % 5 === 0) ? 12 : 0;
      this.tone(time, 261.6 * Math.pow(2, (n + oct) / 12), 0.3, chaos > 0.5 ? 'square' : 'sine', 0.24);
    }
    // 混乱時の不安な高音
    if (chaos > 0.8 && this.step % 16 === 0) {
      this.tone(time, 880 + Math.random() * 200, 0.9, 'sawtooth', 0.07);
    }
  }

  tone(time, freq, dur, type = 'sine', gain = 0.2) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g); g.connect(this.master);
    o.start(time);
    o.stop(time + dur + 0.02);
  }

  sfx(name) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.01;
    if (name === 'door') {
      this.tone(t, 880, 0.18, 'sine', 0.22);
      this.tone(t + 0.12, 1174, 0.25, 'sine', 0.2);
    } else if (name === 'angry') {
      this.tone(t, 180, 0.18, 'square', 0.22);
      this.tone(t + 0.1, 140, 0.24, 'square', 0.2);
    } else if (name === 'alert') {
      this.tone(t, 660, 0.12, 'square', 0.2);
      this.tone(t + 0.14, 660, 0.12, 'square', 0.2);
    } else if (name === 'good') {
      this.tone(t, 523, 0.14, 'sine', 0.2);
      this.tone(t + 0.1, 784, 0.2, 'sine', 0.18);
    } else if (name === 'over') {
      this.tone(t, 220, 1.2, 'sawtooth', 0.22);
      this.tone(t + 0.2, 165, 1.4, 'sawtooth', 0.2);
      this.tone(t + 0.4, 110, 1.8, 'triangle', 0.24);
    }
  }
}
