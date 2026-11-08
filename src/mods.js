// Effekt-System: Items, Typ-Stacks, Synergien, Keystones und Floor-/Kampf-Boni liefern "Ops" ({op, v, type?, status?}).
// Alle Ops werden zu einem mods-Objekt aufsummiert; Kampf und Werte lesen nur mods.
import { D, mon, itemDef } from './data.js';

export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_NAME = { hp: 'KP', atk: 'Angriff', def: 'Abwehr', spa: 'Sp.-Ang.', spd: 'Sp.-Abw.', spe: 'Init.' };
const FLAT = new Set(STATS);

// Beschreibungen der Ops (für Tooltips/Item-Texte). %-Werte werden ×100 angezeigt.
export const OPS = {
  hp: ['+{n} KP'], atk: ['+{n} Angriff'], def: ['+{n} Abwehr'], spa: ['+{n} Sp.-Ang.'], spd: ['+{n} Sp.-Abw.'], spe: ['+{n} Init.'],
  hpPct: ['{p} KP'], atkPct: ['{p} Angriff'], defPct: ['{p} Abwehr'], spaPct: ['{p} Sp.-Ang.'], spdPct: ['{p} Sp.-Abw.'], spePct: ['{p} Initiative'], allPct: ['{p} alle Werte'],
  typeDmg: ['{p} {type}-Schaden'], dmgPct: ['{p} Schaden'], specialPct: ['{p} Spezial-Schaden'], superPct: ['{p} sehr effektive Treffer'],
  burnChance: ['{p} Verbrennungs-Chance'], paraChance: ['{p} Paralyse-Chance'], poisonChance: ['{p} Gift-Chance'], sleepChance: ['{p} Schlaf-Chance'], freezeChance: ['{p} Einfrier-Chance'], confuseChance: ['{p} Verwirrungs-Chance'],
  lifesteal: ['{p} Lebensraub'], regen: ['{p} KP pro Runde'], healPct: ['{p} Heilung'], evasion: ['{p} Ausweichen'], crit: ['{p} Volltreffer'], critDmg: ['{p} Volltreffer-Schaden'],
  defShred: ['Treffer senken Abwehr um {p}'], defIgnore: ['ignoriert {p} Abwehr'], dmgTaken: ['{p} erlittener Schaden'], shield: ['Schild {p} KP zu Kampfbeginn'], hazard: ['Tarnsteine: {p} KP-Schaden zu Kampfbeginn'],
  chain: ['{p} Schaden auf alle anderen Gegner'], doubleHit: ['{p} Doppelschlag'], extraTurn: ['+{n} Extra-Aktion in Runde 1'], statusImmune: ['Statusimmun'], gold: ['{p} Gold'], catch: ['{p} Fangchance'],
  sash: ['Überlebt einmal pro Kampf mit 1 KP'], recoil: ['{p} Rückstoß'], thorns: ['wirft {p} Schaden zurück'], killHeal: ['K.O. heilt {p} KP'], lowHp: ['{p} Schaden unter 50 % KP'],
  energyStart: ['+{n} Start-Energie'], energyGain: ['+{n} Energie pro Runde'], specialCost: ['Spezial kostet {s} Energie'], quick: ['{p} Chance auf Extra-Aktion'], flinch: ['{p} Chance, dass Gegner aussetzen'],
  expMult: ['{p} Erfahrung'], noEvolve: ['keine Entwicklung'], selfStatus: ['du startest {status}'], startStatus: ['Gegner starten {status}'],
  allStacks: ['+{n} auf jeden vorhandenen Typ-Stack'], burnDmg: ['{p} Verbrennungsschaden'], poisonDmg: ['{p} Giftschaden'], burnArmor: ['Verbrannte: {p} Abwehr'], poisonArmor: ['Vergiftete: {p} Abwehr'],
  leech: ['Egelsamen {p} pro Runde'], storm: ['Hagel {p} pro Runde'], nightmare: ['Albtraum {p}'], vsPara: ['{p} gegen Paralysierte'], vsFreeze: ['{p} gegen Eingefrorene'], vsStatus: ['{p} gegen Gegner mit Status'],
  enemySpe: ['Gegner {p} Initiative'], enemyAtk: ['Gegner {p} Angriff'], paraMult: ['Paralyse-Chance ×{x}'], burnSpread: ['Verbrennung springt über'], poisonSpread: ['Gift springt bei K.O. über'], critPierce: ['Volltreffer ignorieren Abwehr'],
  ramp: ['{p} Schaden pro Kampfrunde'], effBoost: ['sehr effektiv +{n}'], consumeStacks: ['Verbrauchen: +{n} Stacks'], invSlots: ['+{n} Inventarplätze'], heldSlots: ['+{n} Item-Platz pro Pokémon'],
  cascade: ['{p} Status-Kaskade'], salvage: ['{p} Zerlegen'], shopDiscount: ['{p} Rabatt'], shopSlots: ['+{n} Shop-Angebote'], afterFightHeal: ['{p} Heilung nach Kampf'], teamAllPct: ['{p} pro Team-Pokémon'],
  monUsePct: ['{p} Einsetzen/Opfern'], subTypeFull: ['Zweittypen volle Stacks'], useBoost: ['{p} Verbrauchen'], lootExtra: ['+{n} Beute'],
};
const STATUS_NAME = { burn: 'verbrannt', poison: 'vergiftet', para: 'paralysiert', sleep: 'schlafend', freeze: 'eingefroren', confuse: 'verwirrt' };
export function opText(o) {
  const t = OPS[o.op]?.[0] || o.op;
  const sign = o.v > 0 ? '+' : '';
  const p = sign + Math.round(o.v * 1000) / 10 + ' %';
  return t.replace('{p}', p).replace('{n}', Math.round(o.v * 10) / 10).replace('{s}', (o.v > 0 ? '+' : '') + o.v).replace('{x}', 1 + o.v).replace('{type}', o.type || '').replace('{status}', STATUS_NAME[o.status] || '');
}

// --- Item-Instanzen: Stufe & Seltenheit skalieren die Werte -----------------
export function rarityScale(inst) {
  const def = itemDef(inst.id);
  return 1 + 0.35 * Math.max(0, (inst.r || def.rarity) - def.rarity);
}
export function levelScale(inst) { return 1 + D.B.itemLevel.scale * ((inst.lvl || 1) - 1); }
export function scaleOp(o, inst) {
  if (FLAT.has(o.op)) return { ...o, v: Math.round(o.v * levelScale(inst) * rarityScale(inst)) };
  if (typeof o.v === 'number' && !['sash', 'statusImmune', 'noEvolve', 'extraTurn', 'specialCost', 'selfStatus', 'levelUp', 'allStacks'].includes(o.op)) return { ...o, v: Math.round(o.v * rarityScale(inst) * 1000) / 1000 };
  return o;
}
export const equipOps = (inst) => (itemDef(inst.id).equip || []).map((o) => scaleOp(o, inst));
export function itemStacks(inst) {
  const st = itemDef(inst.id).stacks || {};
  const bonus = (inst.r || 1) >= 4 ? 1 : 0; // epische/legendäre Items geben +1 Stack
  return Object.fromEntries(Object.entries(st).map(([t, n]) => [t, n + bonus]));
}

// --- Pokémon-Perk ("kleine Fähigkeit") aus dem höchsten Basiswert -------------
const PERK = [['hp', 'hpPct', 0.1], ['atk', 'atkPct', 0.08], ['def', 'defPct', 0.1], ['spa', 'spaPct', 0.08], ['spd', 'spdPct', 0.1], ['spe', 'spePct', 0.1]];
export function monPerk(dex) {
  const b = mon(dex).base;
  let best = 0;
  b.forEach((v, i) => { if (v > b[best]) best = i; });
  const [, op, v] = PERK[best];
  return { op, v };
}

// --- Stacks (gelten fürs ganze Team) -----------------------------------------
export const heldOf = (m) => m.held || [];
export const equippedItems = (run) => run.team.flatMap(heldOf);
export const keystoneOps = (run) => run.keystones.flatMap((id) => D.keystones.find((k) => k.id === id)?.ops || []);

export function computeStacks(run, extraOps = []) {
  const S = D.stacks, st = {};
  const add = (t, n) => { if (t && n) st[t] = (st[t] || 0) + n; };
  const ksOps = keystoneOps(run);
  const subFull = ksOps.some((o) => o.op === 'subTypeFull');
  for (const m of run.team) {
    const sp = mon(m.dex);
    add(sp.types[0], S.mainType);
    add(sp.types[1], subFull ? S.mainType : S.subType);
  }
  for (const inst of equippedItems(run)) for (const [t, n] of Object.entries(itemStacks(inst))) add(t, n);
  for (const [t, n] of Object.entries(run.floorStacks || {})) add(t, n);
  for (const [t, n] of Object.entries(run.battle?.stacks || {})) add(t, n);
  const all = [...ksOps, ...equippedItems(run).flatMap(equipOps), ...extraOps].filter((o) => o.op === 'allStacks').reduce((s, o) => s + o.v, 0);
  if (all) for (const t of Object.keys(st)) st[t] += all;
  return st;
}

// Ops aus Stacks: per-Stack-Effekte (mit Affinität), Schwellen, Synergien
export function stackOps(run, stacks) {
  const S = D.stacks, ops = [], active = { tiers: [], synergies: [] };
  for (const [t, n] of Object.entries(stacks)) {
    const cfg = S.types[t];
    if (!cfg || n <= 0) continue;
    const aff = 1 + S.affinityPct * (run.aff[t] || 0);
    for (const o of cfg.per) ops.push({ ...o, v: o.v * n * aff });
    for (const tier of cfg.tiers) if (n >= tier.at) { ops.push(...tier.ops.map((o) => ({ ...o, v: o.v * aff }))); active.tiers.push({ type: t, ...tier }); }
  }
  for (const syn of S.synergies) {
    if (syn.types.every((t) => (stacks[t] || 0) >= syn.min)) { ops.push(...syn.ops); active.synergies.push(syn); }
  }
  return { ops, active };
}

// Diese Item-Effekte wirken fürs ganze Team, egal wer das Item trägt; alle anderen nur für den Träger
const TEAMWIDE = new Set(['gold', 'catch', 'lootExtra', 'salvage', 'shopDiscount', 'shopSlots', 'invSlots', 'heldSlots', 'allStacks']);

// Alle Ops für ein Pokémon m (Standard: Anführer). extra = Kampf-Buffs.
export function allOps(run, extra = [], m = run.team[0]) {
  const stacks = computeStacks(run, extra);
  const { ops: sOps, active } = stackOps(run, stacks);
  const own = m ? heldOf(m).flatMap(equipOps) : [];
  const others = run.team.filter((x) => x !== m).flatMap(heldOf).flatMap(equipOps).filter((o) => TEAMWIDE.has(o.op));
  const ops = [...keystoneOps(run), ...own, ...others, ...sOps, ...(run.floorOps || []), ...extra];
  ops.push(...run.team.map((t) => monPerk(t.dex)));
  return { ops, stacks, active };
}

export function sumOps(ops) {
  const m = { typeDmg: {}, startStatus: [], selfStatus: [] };
  for (const o of ops) {
    if (o.op === 'typeDmg') m.typeDmg[o.type] = (m.typeDmg[o.type] || 0) + o.v;
    else if (o.op === 'startStatus') m.startStatus.push(o.status);
    else if (o.op === 'selfStatus') m.selfStatus.push(o.status);
    else m[o.op] = (m[o.op] || 0) + o.v;
  }
  return m;
}
export const g = (m, k) => m[k] || 0;

// --- Werte (Pokémon-Formel) -----------------------------------------------------
// KP = (2·Basis + IV)·Lv/100 + Lv + 10, andere = (2·Basis + IV)·Lv/100 + 5
export const randomIvs = () => STATS.map(() => Math.floor(Math.random() * 32));
// Höchster und niedrigster Kampfwert (Ang/Abw/Sp.Ang/Sp.Abw) – ohne Zahlen angezeigt
export function statExtremes(o) {
  const keys = ['atk', 'def', 'spa', 'spd'];
  const sorted = [...keys].sort((a, b) => o[b] - o[a]);
  return { hi: sorted[0], lo: sorted[3] };
}
// ivs = individuelle Werte (0–31) je Wert; ohne: Durchschnitt aus balance.ivs
export function baseStats(dex, level, ivs = null) {
  return Object.fromEntries(STATS.map((s, i) => {
    const iv = ivs ? ivs[i] : D.B.ivs;
    const core = Math.floor(((2 * mon(dex).base[i] + iv) * level) / 100);
    return [s, s === 'hp' ? core + level + 10 : core + 5];
  }));
}

export function computeStats(run, extra = [], m = run.team[0]) {
  const { ops, stacks, active } = allOps(run, extra, m);
  const mods = sumOps(ops);
  const base = m ? baseStats(m.dex, m.level, m.ivs) : Object.fromEntries(STATS.map((s) => [s, 1]));
  const out = {};
  for (const s of STATS) {
    const v = base[s] + (run.perm[s] || 0) + g(mods, s);
    const pct = g(mods, s + 'Pct') + g(mods, 'allPct') + g(mods, 'teamAllPct') * run.team.length;
    out[s] = Math.max(1, Math.round(v * (1 + pct)));
  }
  return { stats: out, mods, stacks, active };
}

export const invSize = (run) => D.B.inventorySlots + Math.round(g(sumOps(keystoneOps(run)), 'invSlots'));
export const heldSlots = (run) => D.B.heldSlots + Math.round(g(sumOps(keystoneOps(run)), 'heldSlots'));

// --- Erfahrung -------------------------------------------------------------------
// Gesamt-EP für Level n je Wachstumsrate (1 langsam, 2 mittel, 3 schnell, 4 mittel-langsam, 5 unregelmäßig, 6 schwankend); ohne Level-Grenze
export function expFor(growth, n) {
  if (n <= 1) return 0;
  const c = n ** 3;
  switch (growth) {
    case 1: return Math.floor(1.25 * c);
    case 3: return Math.floor(0.8 * c);
    case 4: return Math.max(0, Math.floor(1.2 * c - 15 * n * n + 100 * n - 140));
    case 5: return Math.floor(n < 50 ? (c * (100 - n)) / 50 : n < 68 ? (c * (150 - n)) / 100 : n < 98 ? (c * Math.floor((1911 - 10 * n) / 3)) / 500 : n <= 100 ? (c * (160 - n)) / 100 : 0.6 * c);
    case 6: return Math.floor(n < 15 ? (c * ((n + 1) / 3 + 24)) / 50 : n < 36 ? (c * (n + 14)) / 50 : (c * (n / 2 + 32)) / 50);
    default: return c;
  }
}
// EP für einen besiegten Gegner (Formel ab Gen. 5: niedrigere Level bekommen mehr)
export function expGain(enemy, m) {
  const Le = enemy.level, Lp = m.level;
  const b = mon(enemy.dex).exp * (enemy.boss ? 2 : enemy.elite ? 1.5 : 1);
  return Math.floor(((b * Le) / 5) * Math.pow((2 * Le + 10) / (Le + Lp + 10), 2.5)) + 1;
}
