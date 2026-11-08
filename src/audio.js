// Musik (Turm/Rast) und kurze Geräusche aus public/audio.
const base = import.meta.env.BASE_URL;
let music = null, musicFile = null, enabled = true;
try { enabled = localStorage.getItem('turmbeute.sound') !== '0'; } catch {}
const pool = new Map();

export const soundOn = () => enabled;
export function toggleSound() {
  enabled = !enabled;
  try { localStorage.setItem('turmbeute.sound', enabled ? '1' : '0'); } catch {}
  if (!enabled && music) music.pause();
  if (enabled && musicFile) { const f = musicFile; musicFile = null; setMusic(f); }
  return enabled;
}
export function setMusic(file, vol = 0.35) {
  if (file === musicFile) return;
  musicFile = file;
  if (music) { music.pause(); music = null; }
  if (!enabled || !file) return;
  music = new Audio(`${base}audio/${file}`);
  music.loop = true; music.volume = vol;
  music.play().catch(() => {});
}
export function sfx(name, vol = 0.5) {
  if (!enabled) return;
  let list = pool.get(name);
  if (!list) pool.set(name, (list = []));
  let a = list.find((x) => x.paused || x.ended);
  if (!a) { if (list.length > 4) return; a = new Audio(`${base}audio/sfx/${name}.wav`); list.push(a); }
  a.volume = vol; a.currentTime = 0;
  a.play().catch(() => {});
}
// Kurzer Synth-Ton für Treffer (keine Datei nötig)
let ctx = null;
export function blip(freq = 220, dur = 0.08, type = 'square', vol = 0.06) {
  if (!enabled) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
  } catch {}
}
