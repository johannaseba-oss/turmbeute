// Kampfbühne: Canvas mit PMD-Sprites (Idle/Attack/Hurt), Effekt-Sheets, Schadenszahlen, Ballwurf.
// Sheets: Zeilen = 8 Blickrichtungen (2 = rechts, 6 = links).
import { D, mon, spriteUrl, typeColor, itemIconUrl, artUrl } from '../data.js';

const imgs = new Map();
export function img(src) {
  if (!imgs.has(src)) { const i = new Image(); i.src = src; imgs.set(src, i); }
  return imgs.get(src);
}
const ok = (i) => i && i.complete && i.naturalWidth;

const VFX_TYPE = { Feuer: 'fire_impact', Wasser: 'water_impact', Elektro: 'electric_impact', Pflanze: 'nature_impact', Eis: 'frost_impact', Gift: 'poison_impact', Psycho: 'arcane_impact', Drache: 'arcane_blast', Geist: 'shadow_impact', Unlicht: 'shadow_impact', Fee: 'holy_impact', Normal: 'magic_missile_hit', Flug: 'wind', Kampf: 'sword_clash', Boden: 'earth', Gestein: 'ground_slam', Käfer: 'slime_hit', Stahl: 'sword_clash' };
const VFX_STATUS = { burn: 'burning', poison: 'poisoned', para: 'shocked', sleep: 'weakened', freeze: 'frozen', confuse: 'charmed' };
export const STATUS_ICON = { burn: '🔥', poison: '☠', para: '⚡', sleep: '💤', freeze: '❄', confuse: '💫' };
const INTENT = { atk: ['⚔', '#ff8a7a'], strong: ['💥', '#ff5050'], spez: ['✦', '#c8a0ff'], status: ['☣', '#c070f0'], guard: ['🛡', '#8ac8ff'], buff: ['▲', '#ffd060'] };

export class Stage {
  constructor(canvas) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.actors = new Map(); // uid -> {dex, side, anim, t0, flash, shake, alpha, dy}
    this.fx = [];
    this.texts = [];
    this.ball = null;
    this.speed = 1;
    this.t = performance.now();
    this.onTap = null;
    this.bg = null;
    canvas.addEventListener('pointerdown', (ev) => this.tap(ev));
    const loop = (t) => { this.t = t; this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  resize() {
    const r = this.c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w && h && (w !== this.c.width || h !== this.c.height)) { this.c.width = w; this.c.height = h; this.bg = null; }
    this.dpr = dpr;
  }
  wait(ms) { return new Promise((r) => setTimeout(r, ms / this.speed)); }

  // Szene setzen: Spieler-Anführer + Gegner
  setScene(leadDex, enemies) {
    const keep = new Map();
    const player = this.actors.get('player');
    keep.set('player', player && player.dex === leadDex && player.alpha > 0.5 ? player : this.actor(leadDex, 'p'));
    enemies.forEach((e) => keep.set(e.uid, this.actors.get(e.uid) || this.actor(e.dex, 'e')));
    this.actors = keep;
    this.enemies = enemies;
  }
  actor(dex, side) {
    const sp = mon(dex);
    for (const a of ['Idle', 'Attack', 'Hurt']) img(spriteUrl(dex, sp.anims[a].file));
    return { dex, side, anim: 'Idle', t0: this.t, flash: 0, shake: 0, alpha: 1, dy: 0, lunge: 0 };
  }
  play(uid, anim) { const a = this.actors.get(uid); if (a) { a.anim = anim; a.t0 = this.t; } }

  // Positionen (Fußpunkt) in Canvas-Pixeln
  pos(uid) {
    const W = this.c.width, H = this.c.height;
    if (uid === 'player') return { x: W * 0.24, y: H * 0.8 };
    const list = (this.enemies || []).map((e) => e.uid);
    const i = list.indexOf(uid), n = list.length;
    const xs = n === 1 ? [0.72] : n === 2 ? [0.6, 0.84] : [0.52, 0.7, 0.88];
    const ys = n === 1 ? [0.8] : n === 2 ? [0.74, 0.84] : [0.72, 0.84, 0.74];
    return { x: W * (xs[i] ?? 0.7), y: H * (ys[i] ?? 0.8) };
  }
  scale() { return Math.max(2, Math.floor(this.c.height / 75)); }

  frame(dex, anim, dir, ms) {
    const sp = mon(dex), a = sp.anims[anim] || sp.anims.Idle;
    const im = img(spriteUrl(dex, a.file));
    const total = a.dur.reduce((s, d) => s + d, 0);
    let tick = Math.floor(ms / (1000 / 60));
    const once = anim !== 'Idle';
    if (once && tick >= total) return null;
    tick = tick % total;
    let i = 0;
    while (tick >= a.dur[i]) { tick -= a.dur[i]; i++; }
    return { im, sx: i * a.fw, sy: (a.rows === 1 ? 0 : dir) * a.fh, fw: a.fw, fh: a.fh };
  }

  // Hintergrund-Sprite (art/bg/<id>.png) für den aktuellen Floor
  setBackground(id) {
    if (id === this.bgId) return;
    this.bgId = id;
    this.bg = null;
    const im = img(artUrl(`bg/${id}.png`));
    if (!ok(im)) im.addEventListener('load', () => { if (this.bgId === id) this.bg = null; }, { once: true });
  }
  drawBg() {
    const W = this.c.width, H = this.c.height;
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const x = off.getContext('2d');
    const bgi = this.bgId && img(artUrl(`bg/${this.bgId}.png`));
    if (ok(bgi)) {
      // Bild füllend (Ausschnitt mittig), etwas abgedunkelt, Boden-Verlauf für Kontrast unter den Sprites
      x.imageSmoothingEnabled = false;
      const k = Math.max(W / bgi.naturalWidth, H / bgi.naturalHeight);
      const dw = bgi.naturalWidth * k, dh = bgi.naturalHeight * k;
      x.drawImage(bgi, (W - dw) / 2, (H - dh) / 2, dw, dh);
      x.fillStyle = `rgba(12,10,24,${D.B.backgrounds?.dim ?? 0.3})`;
      x.fillRect(0, 0, W, H);
      const fl = x.createLinearGradient(0, H * 0.55, 0, H);
      fl.addColorStop(0, 'rgba(12,10,24,0)'); fl.addColorStop(1, 'rgba(12,10,24,0.55)');
      x.fillStyle = fl; x.fillRect(0, 0, W, H);
      const v = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
      this.bg = off;
      return;
    }
    const gr = x.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#1a1730'); gr.addColorStop(0.62, '#2a2446'); gr.addColorStop(0.63, '#221d38'); gr.addColorStop(1, '#141122');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    // Turmmauer: Ziegel
    const bw = Math.round(W / 14), bh = Math.round(bw / 2.2), wallH = H * 0.62;
    for (let row = 0; row * bh < wallH; row++) {
      for (let col = -1; col * bw < W; col++) {
        const ox = (row % 2) * bw / 2;
        const shade = 30 + ((row * 7 + col * 13) % 9);
        x.fillStyle = `rgb(${shade + 8},${shade + 4},${shade + 28})`;
        x.fillRect(col * bw + ox + 1, row * bh + 1, bw - 2, bh - 2);
      }
    }
    // Fenster mit Mondlicht
    const wx = W * 0.5, wy = H * 0.12, ww = W * 0.12, wh = H * 0.3;
    x.fillStyle = '#0c0a18'; x.beginPath(); x.roundRect(wx - ww / 2, wy, ww, wh, [ww / 2, ww / 2, 0, 0]); x.fill();
    const glow = x.createRadialGradient(wx, wy + wh * 0.4, 2, wx, wy + wh * 0.4, W * 0.35);
    glow.addColorStop(0, 'rgba(150,170,255,0.18)'); glow.addColorStop(1, 'rgba(150,170,255,0)');
    x.fillStyle = glow; x.fillRect(0, 0, W, H);
    // Boden-Fliesen
    x.strokeStyle = 'rgba(255,255,255,0.04)'; x.lineWidth = 2;
    for (let i = -8; i <= 8; i++) { x.beginPath(); x.moveTo(W / 2 + i * W * 0.04, wallH); x.lineTo(W / 2 + i * W * 0.16, H); x.stroke(); }
    for (let k = 1; k < 5; k++) { const y = wallH + (H - wallH) * (k / 5) ** 1.4; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
    // Vignette
    const v = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    this.bg = off;
  }

  draw() {
    this.resize();
    const x = this.x, W = this.c.width, H = this.c.height;
    if (!W) return;
    if (!this.bg) this.drawBg();
    x.imageSmoothingEnabled = false;
    x.drawImage(this.bg, 0, 0);
    const s = this.scale(), dpr = this.dpr;
    // Schatten + Sprites
    const order = [...this.actors.entries()].sort((a, b) => this.pos(a[0]).y - this.pos(b[0]).y);
    for (const [uid, a] of order) {
      const p = this.pos(uid), e = this.enemies?.find((q) => q.uid === uid);
      const big = e?.boss ? 1.5 : 1;
      const ss = Math.round(s * big);
      x.globalAlpha = a.alpha * 0.5;
      x.fillStyle = '#000';
      x.beginPath(); x.ellipse(p.x, p.y, 13 * ss, 4 * ss, 0, 0, Math.PI * 2); x.fill();
      x.globalAlpha = a.alpha;
      const dir = a.side === 'p' ? 2 : 6;
      let f = this.frame(a.dex, a.anim, dir, this.t - a.t0);
      if (!f) { a.anim = 'Idle'; a.t0 = this.t; f = this.frame(a.dex, 'Idle', dir, 0); }
      if (ok(f.im)) {
        const shake = a.shake > this.t ? Math.sin(this.t / 25) * 3 * ss / 2 : 0;
        const lunge = a.lunge > this.t ? Math.sin(((a.lunge - this.t) / 260) * Math.PI) * 10 * ss * (a.side === 'p' ? 1 : -1) : 0;
        const dx = Math.round(p.x - (f.fw * ss) / 2 + shake + lunge), dy = Math.round(p.y - f.fh * ss * 0.7 + a.dy);
        if (e?.elite) { x.save(); x.shadowColor = '#ffd84a'; x.shadowBlur = 14 * dpr; }
        x.drawImage(f.im, f.sx, f.sy, f.fw, f.fh, dx, dy, f.fw * ss, f.fh * ss);
        if (e?.elite) x.restore();
        if (a.flash > this.t) {
          x.save(); x.globalCompositeOperation = 'source-atop'; x.restore();
          x.globalAlpha = a.alpha * 0.6; x.globalCompositeOperation = 'lighter';
          x.drawImage(f.im, f.sx, f.sy, f.fw, f.fh, dx, dy, f.fw * ss, f.fh * ss);
          x.globalCompositeOperation = 'source-over';
        }
      }
      x.globalAlpha = 1;
    }
    // Gegner-Leisten
    for (const e of this.enemies || []) this.drawEnemyBar(e);
    // Effekte
    const now = this.t;
    this.fx = this.fx.filter((v) => {
      const frames = D.vfx_sheets[v.key];
      const im = img(artUrl(`vfx/${v.key}.png`));
      const i = Math.floor((now - v.t0) / (1000 / 24) * this.speed);
      if (!frames || i >= frames.length) return false;
      if (ok(im)) {
        const [sx, sy, fw, fh] = frames[i], k = s * (v.size || 1) * 0.7;
        x.globalCompositeOperation = v.add ? 'lighter' : 'source-over';
        x.drawImage(im, sx, sy, fw, fh, v.x - (fw * k) / 2, v.y - (fh * k) / 2, fw * k, fh * k);
        x.globalCompositeOperation = 'source-over';
      }
      return true;
    });
    // Ball
    if (this.ball) this.drawBall();
    // Schwebende Zahlen
    this.texts = this.texts.filter((t) => {
      const k = (now - t.t0) / (900 / this.speed);
      if (k >= 1) return false;
      const fs = Math.round((t.size || 16) * dpr * (k < 0.15 ? 0.7 + k * 3 : 1.15 - k * 0.15));
      x.font = `700 ${fs}px "Pixelify Sans", monospace`;
      x.textAlign = 'center';
      x.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const y = t.y - k * 40 * dpr;
      x.lineWidth = 4 * dpr; x.strokeStyle = '#120f1f'; x.strokeText(t.text, t.x, y);
      x.fillStyle = t.color; x.fillText(t.text, t.x, y);
      x.globalAlpha = 1;
      return true;
    });
  }
  drawEnemyBar(e) {
    const a = this.actors.get(e.uid);
    if (!a || a.alpha <= 0.05) return;
    const x = this.x, dpr = this.dpr, p = this.pos(e.uid);
    const n = this.enemies.length, w = Math.min(this.c.width * (n === 1 ? 0.36 : n === 2 ? 0.26 : 0.2), 190 * dpr), h = 7 * dpr;
    const bx = Math.min(this.c.width - w - 4 * dpr, Math.max(4 * dpr, p.x - w / 2));
    const topY = p.y - (mon(e.dex).anims.Idle.fh * this.scale() * (e.boss ? 1.5 : 1)) * 0.8 - 30 * dpr;
    const by = Math.max(22 * dpr, topY);
    x.globalAlpha = a.alpha;
    x.font = `600 ${Math.round(10.5 * dpr)}px "Pixelify Sans", monospace`;
    x.textAlign = 'left';
    x.fillStyle = e.boss ? '#ffb070' : e.elite ? '#ffd84a' : '#e8e4ff';
    const name = (e.elite ? '★ ' : '') + e.name;
    x.fillText(name, bx, by - 4 * dpr);
    x.textAlign = 'right'; x.fillStyle = '#9a94c0';
    x.fillText('Lv ' + e.level, bx + w, by - 4 * dpr);
    // Leiste
    x.fillStyle = '#0d0b18'; x.fillRect(bx - dpr, by - dpr, w + 2 * dpr, h + 2 * dpr);
    x.fillStyle = '#3a1020'; x.fillRect(bx, by, w, h);
    const k = Math.max(0, e.hp / e.max);
    x.fillStyle = k > 0.5 ? '#e83a5a' : k > 0.2 ? '#f08a30' : '#ff4040';
    x.fillRect(bx, by, w * k, h);
    if (e.guard > 0) { x.fillStyle = 'rgba(140,200,255,0.8)'; x.fillRect(bx, by + h - 2 * dpr, w * Math.min(1, e.guard / e.max), 2 * dpr); }
    x.font = `700 ${Math.round(9 * dpr)}px "Pixelify Sans", monospace`; x.textAlign = 'center'; x.fillStyle = '#fff';
    x.fillText(`${e.hp}/${e.max}`, bx + w / 2, by + h + 9 * dpr);
    // Typen-Punkte
    e.types.forEach((t, i) => { x.fillStyle = typeColor(t); x.fillRect(bx + i * 7 * dpr, by + h + 3 * dpr, 5 * dpr, 5 * dpr); });
    // Status
    const st = Object.keys(e.st).map((s) => STATUS_ICON[s] + (s === 'poison' && e.st.poison > 1 ? e.st.poison : '')).join(' ');
    if (st) { x.textAlign = 'right'; x.font = `${Math.round(10 * dpr)}px sans-serif`; x.fillText(st, bx + w, by + h + 11 * dpr); }
    // Absicht
    if (e.hp > 0 && e.intent) {
      const [ic, col] = INTENT[e.intent.it] || ['?', '#fff'];
      const txt = ic + (e.intent.dmg != null ? ' ' + e.intent.dmg : '');
      x.font = `700 ${Math.round(11 * dpr)}px "Pixelify Sans", sans-serif`;
      const tw = x.measureText(txt).width + 10 * dpr;
      const ix = bx + w / 2 - tw / 2, iy = by - 30 * dpr;
      x.fillStyle = 'rgba(12,10,24,0.85)'; x.beginPath(); x.roundRect(ix, iy, tw, 15 * dpr, 4 * dpr); x.fill();
      x.strokeStyle = col; x.lineWidth = dpr; x.stroke();
      x.fillStyle = col; x.textAlign = 'center'; x.fillText(txt, bx + w / 2, iy + 11.5 * dpr);
    }
    if (this.targetUid === e.uid && this.enemies.filter((q) => q.hp > 0).length > 1) {
      const sz = 6 * dpr, ty = p.y + 8 * dpr;
      x.fillStyle = '#ffd84a'; x.beginPath(); x.moveTo(p.x, ty); x.lineTo(p.x - sz, ty + sz); x.lineTo(p.x + sz, ty + sz); x.fill();
    }
    x.globalAlpha = 1;
  }
  drawBall() {
    const b = this.ball, x = this.x, s = this.scale();
    const im = img(itemIconUrl(b.id));
    if (!ok(im)) return;
    const now = this.t;
    let px, py, rot = 0;
    const k = Math.min(1, (now - b.t0) / (520 / this.speed));
    if (b.phase === 'fly') {
      px = b.x0 + (b.x1 - b.x0) * k; py = b.y0 + (b.y1 - b.y0) * k - Math.sin(k * Math.PI) * this.c.height * 0.35; rot = k * 12;
    } else { px = b.x1; py = b.y1 + (b.phase === 'fall' ? 0 : 0); rot = b.wobble ? Math.sin((now - b.wt) / 90) * 0.5 * Math.max(0, 1 - (now - b.wt) / 500) : 0; }
    const sz = 9 * s;
    x.save(); x.translate(px, py); x.rotate(rot);
    x.imageSmoothingEnabled = true;
    x.drawImage(im, -sz / 2, -sz / 2, sz, sz);
    x.restore();
    if (b.stars && now - b.stars < 900) {
      x.fillStyle = '#ffe070';
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + (now - b.stars) / 300; const r = 8 * s * ((now - b.stars) / 900); x.fillRect(px + Math.cos(a) * r, py - 4 * s + Math.sin(a) * r * 0.6, 3 * this.dpr, 3 * this.dpr); }
    }
  }

  // --- Effekt-Helfer ----------------------------------------------------------
  hitAt(uid, type, size = 1.3) {
    const p = this.pos(uid), a = this.actors.get(uid);
    const key = VFX_TYPE[type] || 'magic_missile_hit';
    this.fx.push({ key, x: p.x, y: p.y - 14 * this.scale(), t0: this.t, size, add: true });
    if (a) { a.flash = this.t + 140; a.shake = this.t + 260; this.play(uid, 'Hurt'); }
  }
  vfx(uid, key, size = 1.2, lift = 14) {
    const p = this.pos(uid);
    this.fx.push({ key, x: p.x, y: p.y - lift * this.scale(), t0: this.t, size, add: true });
  }
  text(uid, text, color, size = 16, lift = 30) {
    const p = this.pos(uid);
    this.texts.push({ text, color, x: p.x + (Math.random() - 0.5) * 20 * this.dpr, y: p.y - lift * this.scale(), t0: this.t, size });
  }
  lunge(uid) { const a = this.actors.get(uid); if (a) { a.lunge = this.t + 260; this.play(uid, 'Attack'); } }
  async ko(uid) {
    const a = this.actors.get(uid);
    if (!a) return;
    this.vfx(uid, 'pixel_burst', 1.4, 10);
    const t0 = performance.now();
    await new Promise((res) => { const step = () => { const k = (performance.now() - t0) / (450 / this.speed); a.alpha = Math.max(0, 1 - k); a.dy = k * 10 * this.dpr; k < 1 ? setTimeout(step, 16) : res(); }; step(); });
  }
  async throwBall(id, uid, shakes, ok) {
    const p0 = this.pos('player'), p1 = this.pos(uid), s = this.scale();
    const a = this.actors.get(uid);
    this.ball = { id, x0: p0.x, y0: p0.y - 20 * s, x1: p1.x, y1: p1.y - 10 * s, t0: this.t, phase: 'fly' };
    await this.wait(520);
    // Pokémon wird eingesaugt
    this.vfx(uid, 'level_up_burst', 0.9, 10);
    if (a) a.alpha = 0;
    this.ball.phase = 'sit';
    await this.wait(350);
    for (let i = 0; i < shakes; i++) { this.ball.wobble = true; this.ball.wt = this.t; await this.wait(650); }
    if (ok) { this.ball.stars = this.t; await this.wait(900); this.ball = null; return; }
    this.vfx(uid, 'pixel_burst', 1, 10);
    this.ball = null;
    if (a) { a.alpha = 1; a.shake = this.t + 300; }
    await this.wait(300);
  }
}
