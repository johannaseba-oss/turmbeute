// Starter: Typ wählen → Spielautomat: drei Walzen ziehen drei Basis-Pokémon (eins vom gewählten Typ, zwei zufällig) → Team.
import { D, mon, portraitUrl, typeColor, artUrl, pick, rnd } from '../data.js';
import { monPerk, opText } from '../mods.js';
import { $, h } from './dom.js';
import { sfx, blip } from '../audio.js';
import { img } from '../gfx/stage.js';

// Ausschnitte aus art/slots/sheet.png
const RECT = { machine: [2, 11, 256, 183], pippi: [[155, 199, 58, 60], [220, 199, 58, 60], [152, 263, 64, 60], [217, 263, 64, 60], [155, 326, 58, 61], [220, 326, 58, 61]], cloudL: [87, 260, 64, 61] };
const WIN = [[44, 34], [104, 34], [164, 34]], WIN_W = 52, WIN_H = 100, CELL = 44;
const MX = 7, MY = 6, CW = 270, CH = 230;

function pool(type) {
  const S = D.B.starter;
  const ok = (p) => p.stage === 1 && !p.legendary && !p.mythical && !p.baby && S.rarities.includes(p.rarity) && p.evos.length > 0;
  if (!type) return D.pokemon.filter(ok);
  const main = D.pokemon.filter((p) => ok(p) && p.types.includes(type));
  return main.length ? main : D.pokemon.filter(ok);
}
const basePool = () => pool(null);
// Drei verschiedene Basis-Pokémon: das erste passt zum Typ (ohne Typ: alle zufällig)
export function rollStarters(type = null) {
  const out = [];
  const add = (list) => { const c = list.filter((p) => !out.includes(p.dex)); if (c.length) out.push(pick(c).dex); };
  if (type) add(pool(type));
  while (out.length < D.B.startTeam) add(basePool());
  return out;
}

export function starterScreen(done) {
  const ov = $('#overlay');
  ov.classList.remove('hidden');
  const S = D.B.starter;
  ov.replaceChildren(h('div.title', { style: { fontSize: '30px', marginBottom: '6px' } }, 'Starter-Typ'),
    h('div.subtitle', { style: { margin: '0 0 14px' } }, 'Der Automat zieht dein Team: ein Basis-Pokémon dieses Typs und zwei zufällige, alle auf Lv 1.'),
    h('div.typegrid', S.types.map((t) => h('button', { style: { background: typeColor(t) }, onclick: () => slots(t, done, S.rerolls) }, t))));
}

function slots(type, done, rerolls) {
  const ov = $('#overlay');
  const c = h('canvas', { width: CW * 3, height: CH * 3 });
  const reveal = h('div.reveal');
  ov.replaceChildren(h('div.title', { style: { fontSize: '26px', marginBottom: '8px' } }, type), h('div.slotwrap', c), reveal);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  const sheet = img(artUrl('slots/sheet.png'));
  const targets = rollStarters(type);
  const list = basePool();
  const strip = () => { const a = []; for (let i = 0; i < 14; i++) a.push(pick(list).dex); return a; };
  const reels = [0, 1, 2].map((i) => ({ dexes: [...strip(), targets[i]], off: 0, speed: 900 + i * 60, stopAt: 1300 + i * 650, stopped: false, settle: 0 }));
  for (const r of reels) for (const d of r.dexes) img(portraitUrl(d));
  const t0 = performance.now();
  let phase = 'spin', winT = 0, raf;
  sfx('mechanik', 0.4);
  const k = 3;
  const frame = (now) => {
    const t = now - t0;
    x.clearRect(0, 0, c.width, c.height);
    // Hintergrund-Wolken
    if (sheet.complete) {
      x.globalAlpha = 0.25;
      x.drawImage(sheet, ...RECT.cloudL, 0, 140 * k, 64 * k, 61 * k);
      x.drawImage(sheet, ...RECT.cloudL, 200 * k, 150 * k, 64 * k, 61 * k);
      x.globalAlpha = 1;
    }
    if (sheet.complete) x.drawImage(sheet, ...RECT.machine, MX * k, MY * k, RECT.machine[2] * k, RECT.machine[3] * k);
    // Walzen in den Fenstern
    reels.forEach((r, i) => {
      const [wx, wy] = WIN[i];
      const X = (MX + wx - 2) * k, Y = (MY + wy - 11) * k;
      x.save(); x.beginPath(); x.rect(X, Y, WIN_W * k, WIN_H * k); x.clip();
      x.fillStyle = '#fff'; x.fillRect(X, Y, WIN_W * k, WIN_H * k);
      const total = r.dexes.length * CELL;
      const final = (r.dexes.length - 1) * CELL - (WIN_H - CELL) / 2;
      if (!r.stopped) {
        r.off = (t / 1000) * r.speed % total;
        if (t > r.stopAt) { r.stopped = true; r.from = r.off; r.st = now; blip(260 + i * 80, 0.07); }
      }
      let off = r.off;
      if (r.stopped) {
        const q = Math.min(1, (now - r.st) / 600);
        const e = 1 - Math.pow(1 - q, 3) + Math.sin(q * Math.PI) * 0.04;
        // nach vorne bis zur nächsten Position, an der das Ziel mittig steht
        let goal = final;
        while (goal < r.from + CELL * 4) goal += total;
        off = r.from + (goal - r.from) * e;
        if (q >= 1) r.done = true;
      }
      for (let j = -1; j < r.dexes.length + 1; j++) {
        const idx = ((j % r.dexes.length) + r.dexes.length) % r.dexes.length;
        const y = Y + (j * CELL - (((off % total) + total) % total)) * k;
        if (y < Y - CELL * k || y > Y + WIN_H * k) continue;
        const im = img(portraitUrl(r.dexes[idx]));
        if (im.complete) x.drawImage(im, X + (WIN_W - 40) / 2 * k, y + 2 * k, 40 * k, 40 * k);
      }
      x.restore();
    });
    // Gewinnlinie blinkt
    if (phase === 'win') {
      const on = Math.floor((now - winT) / 140) % 2 === 0;
      if (on) { x.strokeStyle = '#ffd84a'; x.lineWidth = 2 * k; reels.forEach((_, i) => { const [wx, wy] = WIN[i]; x.strokeRect((MX + wx - 2) * k, (MY + wy - 11 + (WIN_H - CELL) / 2) * k, WIN_W * k, CELL * k); }); }
      // Konfetti
      for (let i = 0; i < 40; i++) {
        const s = (now - winT) / 1000, px = ((i * 53) % CW) * k, py = ((s * (60 + (i % 7) * 20) + i * 37) % CH) * k;
        x.fillStyle = ['#ffd84a', '#ff6a82', '#6ad0ff', '#8ae0a0'][i % 4];
        x.fillRect(px, py, 3 * k, 3 * k);
      }
    }
    // Piepi fiebert mit
    if (sheet.complete) {
      const fr = RECT.pippi[phase === 'win' ? 2 + Math.floor((now - winT) / 160) % 4 : Math.floor(t / 300) % 2];
      x.drawImage(sheet, ...fr, (CW - fr[2] - 2) * k, (CH - fr[3]) * k, fr[2] * k, fr[3] * k);
    }
    if (phase === 'spin' && reels.every((r) => r.done)) { phase = 'win'; winT = now; sfx('fp_rang', 0.55); showReveal(); }
    if (ov.contains(c)) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  function showReveal() {
    reveal.replaceChildren(
      h('div.starters', targets.map((dex) => {
        const sp = mon(dex);
        return h('div.card', { '--rc': '#ffd84a' }, h('img', { src: portraitUrl(dex), style: { imageRendering: 'pixelated' } }), h('div.nm', sp.name), h('div', ...sp.types.map((t) => h('span.tchip', { style: { background: typeColor(t) } }, t))), h('small', opText(monPerk(dex))));
      })),
      h('div.menu', { style: { margin: '10px auto 0' } },
        h('button.btn.pri', { onclick: () => { cancelAnimationFrame(raf); done(targets); } }, 'Los geht’s!'),
        rerolls > 0 ? h('button.btn', { onclick: () => { cancelAnimationFrame(raf); slots(type, done, rerolls - 1); } }, `Nochmal drehen (${rerolls})`) : null));
  }
}
