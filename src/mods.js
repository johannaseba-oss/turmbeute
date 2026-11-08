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
  levelUp: ['+{n} Level pro Floor'], holderShare: ['Träger gibt {p} mehr Werte'], noEvolve: ['keine Entwicklung'], selfStatus: ['du startest {status}'], startStatus: ['Gegner starten {status}'],
  allStacks: ['+{n} auf jeden vorhandenen Typ-Stack'], burnDmg: ['{p} Verbrennungsschaden'], poisonDmg: ['{p} Giftschaden'], burnArmor: ['Verbrannte: {p} Abwehr'], poisonArmor: ['Vergiftete: {p} Abwehr'],
  leech: ['Egelsamen {p} pro Runde'], storm: ['Hagel {p} pro Runde'], nightmare: ['Albtraum {p}'], vsPara: ['{p} gegen Paralysierte'], vsFreeze: ['{p} gegen Eingefrorene'], vsStatus: ['{p} gegen Gegner mit Status'],
  enemySpe: ['Gegner {p} Initiative'], enemyAtk: ['Gegner {p} Angriff'], paraMult: ['Paralyse-Chance ×{x}'], burnSpread: ['Verbrennung springt über'], poisonSpread: ['Gift springt bei K.O. über'], critPierce: ['Volltreffer ignorieren Abwehr'],
  ramp: ['{p} Schaden pro Kampfrunde'], effBoost: ['sehr effektiv +{n}'], consumeStacks: ['Verbrauchen: +{n} Stacks'], invSlots: ['+{n} Inventarplätze'], trainerSlots: ['+{n} Ausrüstungsplatz'],
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

// --- Stacks ------------------------------------------------------------------
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

export const keystoneOps = (run) => run.keystones.flatMap((id) => D.keystones.find((k) => k.id === id)?.ops || []);
export function equippedItems(run) {
  return [...run.team.map((m) => m.held), ...run.trainerEq].filter(Boolean);
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

// Alle Ops des Spielers zusammentragen (außer Kampf-Buffs, die kommen über extra)
export function allOps(run, extra = []) {
  const stacks = computeStacks(run, extra);
  const { ops: sOps, active } = stackOps(run, stacks);
  const ops = [...keystoneOps(run), ...equippedItems(run).flatMap(equipOps), ...sOps, ...(run.floorOps || []), ...extra];
  ops.push(...run.team.map((m) => monPerk(m.dex)));
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

// --- Werte -------------------------------------------------------------------
export function levelFactor(level) { return 1 + D.B.level.statPerLevel * (level - D.B.level.start); }

// Anteil eines Team-Pokémon an den Werten
export function monShare(run, m, idx) {
  const sp = mon(m.dex), B = D.B;
  const holder = m.held ? equipOps(m.held).filter((o) => o.op === 'holderShare').reduce((s, o) => s + o.v, 0) : 0;
  const k = levelFactor(m.level) * (idx === 0 ? B.leadShare : 1) * (1 + holder);
  return Object.fromEntries(STATS.map((s, i) => [s, sp.base[i] * B.teamShare[s] * k]));
}

export function computeStats(run, extra = []) {
  const { ops, stacks, active } = allOps(run, extra);
  const m = sumOps(ops);
  const out = {};
  for (const s of STATS) {
    let v = D.B.trainer[s] + (run.perm[s] || 0) + g(m, s);
    run.team.forEach((t, i) => (v += monShare(run, t, i)[s]));
    const pct = g(m, s + 'Pct') + g(m, 'allPct') + g(m, 'teamAllPct') * run.team.length;
    out[s] = Math.max(1, Math.round(v * (1 + pct)));
  }
  return { stats: out, mods: m, stacks, active };
}

export const invSize = (run) => D.B.inventorySlots + Math.round(g(sumOps(keystoneOps(run)), 'invSlots'));
export const trainerSlotCount = (run) => D.B.trainerSlots + Math.round(g(sumOps(keystoneOps(run)), 'trainerSlots'));
