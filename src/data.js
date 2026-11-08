// Lädt alle JSON-Daten aus public/data und bietet Nachschlage-Helfer.
const base = import.meta.env.BASE_URL;
export const D = {};
const FILES = ['pokemon', 'items', 'balance', 'types', 'stacks', 'keystones', 'vfx_sheets'];

export async function loadData() {
  const all = await Promise.all(FILES.map((f) => fetch(`${base}data/${f}.json`).then((r) => r.json())));
  FILES.forEach((f, i) => (D[f] = all[i]));
  D.items = D.items.items;
  D.keystones = D.keystones.keystones;
  D.mon = new Map(D.pokemon.map((p) => [p.dex, p]));
  D.item = new Map(D.items.map((i) => [i.id, i]));
  D.B = D.balance;
  D.TYPES = Object.keys(D.types.colors);
}

export const mon = (dex) => D.mon.get(dex);
export const itemDef = (id) => D.item.get(id);
export const typeColor = (t) => D.types.colors[t] || '#888';
export const rarityColor = (r) => D.B.rarities[r - 1]?.color || '#888';
export const rarityName = (r) => D.B.rarities[r - 1]?.name || '';
export const pad = (n) => String(n).padStart(4, '0');
export const spriteUrl = (dex, file) => `${base}sprites/${pad(dex)}/${file}`;
export const portraitUrl = (dex) => spriteUrl(dex, 'p_Normal.png');
export const itemIconUrl = (id) => `${base}art/items/${itemDef(id)?.icon || id}.png`;
export const artUrl = (p) => `${base}art/${p}`;

// Typ-Effektivität eines Angriffstyps gegen eine Typenliste (×2 / ×0,5 / ×0)
export function typeEff(atk, defTypes) {
  const c = D.types.chart[atk];
  if (!c) return 1;
  let m = 1;
  for (const t of defTypes) {
    if (c.ne.includes(t)) m *= 0;
    else if (c.se.includes(t)) m *= 2;
    else if (c.nve.includes(t)) m *= 0.5;
  }
  return m;
}

// Zufall
export const rnd = Math.random;
export const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
export function weighted(list, w) {
  const tot = list.reduce((s, x) => s + w(x), 0);
  let r = rnd() * tot;
  for (const x of list) { r -= w(x); if (r <= 0) return x; }
  return list[list.length - 1];
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const uid = () => Math.random().toString(36).slice(2, 9);
