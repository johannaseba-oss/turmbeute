// Lauf-Zustand: Team, Inventar, Gold, permanente Werte, Floors, Beute, Shop, Zerlegen, Level & Entwicklung.
import { D, mon, itemDef, ri, rnd, pick, weighted, uid, clamp } from './data.js';
import { baseStats, randomIvs, invSize, heldSlots, keystoneOps, sumOps, g, computeStats, allOps, STATS, equipOps, expFor, heldOf } from './mods.js';

const SAVE = 'turmbeute.run.v3', META = 'turmbeute.meta.v1';
// Bis zu 3 Läufe gleichzeitig, jeder in seinem Speicherplatz
export const SLOTS = 3;
const slotKey = (n) => `${SAVE}.slot${n}`;
// ?nosave: Testläufe (Bot) schreiben nichts in den Speicher
const NOSAVE = typeof location !== 'undefined' && location.search.includes('nosave');
export let run = null;
export const setRun = (r) => (run = r);

export function loadMeta() { try { return JSON.parse(localStorage.getItem(META)) || { best: 0, runs: 0 }; } catch { return { best: 0, runs: 0 }; } }
export function saveMeta(m) { if (NOSAVE) return; try { localStorage.setItem(META, JSON.stringify(m)); } catch {} }
export function save() { if (NOSAVE) return; try { if (run) localStorage.setItem(slotKey(run.slot || 0), JSON.stringify(run)); } catch {} }
export function loadSaved(n) {
  try {
    // alter Einzel-Spielstand wandert in Platz 1
    if (n === 0 && !localStorage.getItem(slotKey(0)) && localStorage.getItem(SAVE)) { localStorage.setItem(slotKey(0), localStorage.getItem(SAVE)); localStorage.removeItem(SAVE); }
    const r = JSON.parse(localStorage.getItem(slotKey(n)));
    return r && r.v === 3 && r.phase !== 'over' ? r : null;
  } catch { return null; }
}
export function clearSave(n = run?.slot || 0) { if (NOSAVE) return; try { localStorage.removeItem(slotKey(n)); } catch {} }

// --- Items ---------------------------------------------------------------
export function makeItem(id, floor = 1, r = null) {
  const def = itemDef(id), L = D.B.itemLevel;
  const lvl = Math.max(1, 1 + Math.floor((floor - 1) / L.everyFloors) + ri(-L.jitter, 0));
  return { uid: uid(), id, lvl, r: Math.max(def.rarity, r || def.rarity), n: 1 };
}

function rarityWeights(floor) {
  const P = D.B.rarityByFloor.points;
  for (let i = 0; i < P.length - 1; i++) {
    const [f0, w0] = P[i], [f1, w1] = P[i + 1];
    if (floor <= f1) { const k = clamp((floor - f0) / (f1 - f0), 0, 1); return w0.map((v, j) => v + (w1[j] - v) * k); }
  }
  return P[P.length - 1][1];
}
export function rollItem(floor, { minR = 1, kind = null, exclude = [] } = {}) {
  const w = rarityWeights(floor);
  const R = weighted([1, 2, 3, 4, 5].filter((r) => r >= minR), (r) => w[r - 1] || 0.01);
  const pool = D.items.filter((i) => i.weight > 0 && i.rarity <= R && (i.minFloor || 1) <= floor && (!kind || i.kind === kind) && !exclude.includes(i.kind));
  const def = weighted(pool, (i) => i.weight * (i.rarity === R ? 2 : 1));
  // Verbrauchsgüter und Bälle werden nicht "aufgewertet"
  const upg = ['held', 'gem', 'stone', 'tm'].includes(def.kind) ? R : def.rarity;
  return makeItem(def.id, floor, upg);
}

export const itemName = (inst) => itemDef(inst.id).name;
export const stackMax = (inst) => itemDef(inst.id).stack || 1;

// Ins Inventar legen (stapelt gleiche Verbrauchsgüter). Gibt false zurück, wenn kein Platz.
export function addItem(inst) {
  ensureInv();
  const max = stackMax(inst);
  if (max > 1) {
    const s = run.inv.find((x) => x && x.id === inst.id && x.n < max);
    if (s) { s.n += inst.n || 1; fragments(); return true; }
  }
  const i = run.inv.indexOf(null);
  if (i < 0) return false;
  run.inv[i] = inst;
  fragments();
  return true;
}
export const freeSlots = () => run.inv.filter((x) => !x).length;
export function ensureInv() {
  const n = invSize(run);
  while (run.inv.length < n) run.inv.push(null);
}
// 3 Meisterball-Fragmente → Meisterball
function fragments() {
  const f = run.inv.findIndex((x) => x && x.id === 'master-fragment' && x.n >= 3);
  if (f < 0) return;
  run.inv[f].n -= 3;
  if (run.inv[f].n <= 0) run.inv[f] = null;
  run.events.push({ kind: 'toast', text: 'Meisterball zusammengesetzt!' });
  addItem(makeItem('meisterball'));
}
export function takeOne(idx) {
  const it = run.inv[idx];
  if (!it) return null;
  if (it.n > 1) { it.n--; return { ...it, uid: uid(), n: 1 }; }
  run.inv[idx] = null;
  return it;
}

// --- Team ------------------------------------------------------------------
export function makeMon(dex, level, ivs = randomIvs()) {
  const m = { uid: uid(), dex, level, ivs, exp: expFor(mon(dex).growth, level), held: [], used: false, fainted: false, hp: null };
  return m;
}
export const monStats = (m, extra = []) => computeStats(run, extra, m).stats;
export const monMax = (m) => monStats(m).hp;
// KP-Stand absichern (neues Pokémon = volle KP, nie über Maximum)
export function fixHp(m) {
  const max = monMax(m);
  if (m.hp == null) m.hp = max;
  m.hp = Math.max(0, Math.min(max, m.hp));
  return max;
}
export const lead = () => run.team[0];
export const ableTeam = () => run.team.filter((m) => !m.fainted);
export function addMon(m) {
  if (run.team.length >= D.B.teamMax) return false;
  run.team.push(m);
  fixHp(m);
  return true;
}
export function releaseMon(idx) {
  const m = run.team.splice(idx, 1)[0];
  for (const it of heldOf(m)) if (!addItem(it)) run.events.push({ kind: 'toast', text: `${itemName(it)} ging verloren (Inventar voll)` });
  ensureLeadAble();
  return m;
}
// Anführer muss kampffähig sein
export function ensureLeadAble() {
  const i = run.team.findIndex((m) => !m.fainted);
  if (i > 0) run.team.unshift(...run.team.splice(i, 1));
}
// Beleber: besiegtes Pokémon mit frac seiner KP zurückholen
export function reviveMon(m, frac) {
  if (!m?.fainted) return false;
  m.fainted = false;
  m.hp = Math.max(1, Math.round(monMax(m) * frac));
  return true;
}
export const reviveItems = () => run.inv.map((x, i) => [x, i]).filter(([x]) => x && itemDef(x.id).use?.revive);
// Heilen: frac = Anteil der max. KP, revive = Besiegte wiederbeleben
export function healTeam(frac, revive = false) {
  for (const m of run.team) {
    if (m.fainted && !revive) continue;
    const max = fixHp(m);
    if (m.fainted) { m.fainted = false; m.hp = 0; }
    m.hp = Math.min(max, Math.round(m.hp + max * frac));
  }
}

export function canEquip(inst) {
  return ['held', 'gem', 'stone', 'tm', 'berry'].includes(itemDef(inst.id).kind);
}
// Item an Pokémon monIdx anlegen; ist es voll, ersetzt es Platz replace (das alte geht ins Inventar)
export function equip(invIdx, monIdx, replace = null) {
  const inst = run.inv[invIdx];
  const m = run.team[monIdx];
  if (!inst || !m || !canEquip(inst)) return;
  const def = itemDef(inst.id);
  // Entwicklungsstein: entwickelt sofort, wenn passend
  if (def.kind === 'stone') {
    const ev = mon(m.dex).evos.find((e) => e.stone === def.stone);
    if (ev && !noEvolve(m)) { takeOne(invIdx); evolve(m, ev.to); return 'evolved'; }
  }
  // Trägt das Pokémon dasselbe Item schon, wird aufgewertet statt ein Platz belegt
  const same = m.held.findIndex((x) => x.id === inst.id);
  if (same >= 0 && canMergeKind(inst)) { mergeInto(takeOne(invIdx), { mon: monIdx, slot: same }); return 'merged'; }
  const before = monMax(m);
  if (m.held.length >= heldSlots(run)) {
    if (replace == null) return 'full';
    const [old] = m.held.splice(replace, 1);
    m.held.push(takeOne(invIdx));
    addItem(old);
  } else m.held.push(takeOne(invIdx));
  m.hp += Math.max(0, monMax(m) - before);
  fixHp(m);
  return 'ok';
}
// --- Aufwerten: ein zweites gleiches Item auf das vorhandene ziehen ---
// Gleiche Seltenheit → eine Stufe seltener (max. Legendär); dazu immer +1 Item-Stufe
export const canMergeKind = (inst) => ['held', 'gem', 'tm'].includes(itemDef(inst.id).kind);
export function mergeResult(src, dst) {
  const a = dst.r || 1, b = src.r || 1;
  return { r: a === b ? Math.min(5, a + 1) : Math.max(a, b), lvl: Math.max(dst.lvl || 1, src.lvl || 1) + 1 };
}
// Gleiche Items im Inventar oder an Pokémon, auf die inst gezogen werden kann
export function mergeTargets(inst, skipInv = -1) {
  if (!inst || !canMergeKind(inst)) return [];
  const out = [];
  run.inv.forEach((x, j) => { if (x && j !== skipInv && x !== inst && x.id === inst.id) out.push({ inv: j, item: x }); });
  run.team.forEach((m, i) => m.held.forEach((x, k) => { if (x !== inst && x.id === inst.id) out.push({ mon: i, slot: k, item: x }); }));
  return out;
}
export const refItem = (ref) => (ref.inv != null ? run.inv[ref.inv] : run.team[ref.mon]?.held[ref.slot]);
export function mergeInto(src, ref) {
  const dst = refItem(ref), m = ref.mon != null ? run.team[ref.mon] : null;
  const before = m ? monMax(m) : 0;
  Object.assign(dst, mergeResult(src, dst));
  if (m) { m.hp += Math.max(0, monMax(m) - before); fixHp(m); }
  return dst;
}

export function unequip(monIdx, slot) {
  if (freeSlots() <= 0) return false;
  const m = run.team[monIdx];
  const [it] = m.held.splice(slot, 1);
  if (!it) return false;
  addItem(it);
  fixHp(m);
  return true;
}
const noEvolve = (m) => heldOf(m).some((it) => equipOps(it).some((o) => o.op === 'noEvolve'));

export function evolve(m, to) {
  const from = m.dex, before = monMax(m);
  m.dex = to;
  m.hp += Math.max(0, monMax(m) - before);
  run.events.push({ kind: 'evolve', from, to, uid: m.uid });
}
// Erfahrung geben: Level-Ups (ohne Obergrenze) und Entwicklungen
export function giveExp(m, xp) {
  m.exp += Math.round(xp);
  const gr = mon(m.dex).growth;
  let ups = 0;
  while (m.exp >= expFor(gr, m.level + 1)) {
    const before = monMax(m);
    m.level++; ups++;
    if (!m.fainted) m.hp += Math.max(0, monMax(m) - before);
    if (!noEvolve(m)) {
      const ev = mon(m.dex).evos.find((e) => e.level && m.level >= e.level);
      if (ev) evolve(m, ev.to);
    }
  }
  if (ups) run.events.push({ kind: 'levelup', uid: m.uid, level: m.level, ups });
  return ups;
}
export function giveLevels(m, n) { giveExp(m, expFor(mon(m.dex).growth, m.level + n) - m.exp); }

// --- Neuer Lauf ----------------------------------------------------------------
export function newRun(dexes, slot = 0) {
  const B = D.B;
  run = {
    v: 3, slot, areal: 1, fight: 0, floor: 1, phase: 'floor', gold: B.startGold, trainersSeen: [],
    perm: Object.fromEntries(STATS.map((s) => [s, 0])), aff: {},
    team: [], inv: [], keystones: [],
    floorOps: [], floorStacks: {}, battle: null, shop: null, loot: null, events: [],
    stats: { kills: 0, caught: 0, salvaged: 0 }, ksOffer: null,
  };
  for (const dex of dexes) addMon(makeMon(dex, B.level.start));
  ensureInv();
  for (const id of B.startItems) addItem(makeItem(id, 1));
  startSegment();
  return run;
}
// --- Areal: bis zu 15 Kämpfe (wild → Trainer-Endboss → Legendäres), Rast nach bestimmten Kämpfen ---
// run.floor = Fortschritt über alle Areale (Kampf-Nummer insgesamt), skaliert Gegner, Items und Preise.
export const AR = () => D.B.areal;
export function fightKind(fight = run.fight) {
  if (fight === AR().legendAt) return 'legend';
  if (fight === AR().trainerAt) return 'trainer';
  return 'wild';
}
export const progressOf = (areal, fight) => (areal - 1) * AR().fights + fight;
export const ownsItem = (id) => [...run.inv, ...run.team.flatMap((m) => m.held)].some((it) => it?.id === id);
export const isRestAfter = (fight) => AR().restAfter.includes(fight) || fight === AR().fights;

// Abschnitt beginnt (Spielstart und nach jeder Rast): Opfer-/Floor-Boni und erschöpfte Pokémon zurücksetzen
export function startSegment() {
  run.floorOps = [];
  run.floorStacks = {};
  run.team.forEach((m) => (m.used = false));
  run.phase = 'floor';
}
// Nächsten Kampf zählen (springt nach Kampf 15 ins nächste Areal)
export function advanceFight() {
  if (run.fight >= AR().fights) { run.areal++; run.fight = 0; }
  run.fight++;
  run.floor = progressOf(run.areal, run.fight);
}

// --- Gegner ------------------------------------------------------------------
const bst = (p) => p.base.reduce((x, y) => x + y, 0);
// Wilde Pokémon: zu Beginn eines Areals schwache "Routen-Pokémon" (Nager, kleine Vögel, Käfer), dann immer stärkere
function wildPool(areal, fight) {
  const W = AR().wild;
  const cap = W.bstStart + W.bstPerFight * fight + W.bstPerAreal * (areal - 1);
  const min = cap - W.bstWindow;
  const ok = (p) => !p.legendary && !p.mythical && !p.baby;
  if (areal === 1 && fight <= W.routeFights) {
    const route = D.pokemon.filter((p) => ok(p) && W.route.includes(p.dex));
    if (route.length) return route;
  }
  let pool = D.pokemon.filter((p) => ok(p) && bst(p) <= cap && bst(p) >= min);
  if (pool.length < 10) pool = D.pokemon.filter((p) => ok(p) && bst(p) <= cap).sort((x, y) => bst(y) - bst(x)).slice(0, 40);
  return pool;
}
// Legendäre: nach Basiswert-Summe sortiert, spätere Areale ziehen stärkere
function legendPool(areal) {
  const list = D.pokemon.filter((p) => p.legendary || p.mythical).sort((x, y) => bst(x) - bst(y));
  const L = AR().legend, start = Math.min(list.length - L.window, (areal - 1) * L.step);
  return list.slice(Math.max(0, start), Math.max(0, start) + L.window);
}
export function enemyLevel(prog, add = 0) {
  const E = D.B.enemy;
  return Math.max(1, Math.round(E.levelBase + (prog - 1) * E.levelPerFight) + ri(0, 1) + add);
}
export function makeEnemy(prog, { kind = 'wild', elite = false, dex = null, sp = null, levelAdd = 0, mult = null, group = 1 } = {}) {
  const E = D.B.enemy, W = D.B.spawn.rarityWeights;
  if (!sp) {
    const pool = kind === 'legend' ? legendPool(run.areal) : wildPool(run.areal, run.fight);
    sp = dex ? mon(dex) : weighted(pool, (p) => (W[p.rarity] ?? 1) * (p.rarity === 'gewoehnlich' ? 1 : 1 + prog * D.B.spawn.rareGrowth) || 0.2);
  }
  const level = enemyLevel(prog, levelAdd + (kind === 'legend' ? E.legend.level : 0));
  const bm = mult || (kind === 'legend' ? E.legend : { hp: 1, atk: 1, def: 1 });
  const k = E.statMult * Math.pow(E.growExp, prog - 1) * (elite ? E.eliteMult : 1) * (E.early[prog - 1] ?? 1);
  const ivs = randomIvs();
  const st = baseStats(sp.dex, level, ivs);
  const gm = D.B.floor.groupMult[group - 1] ?? 1; // Gruppen: einzelne Gegner etwas schwächer
  const hp = Math.max(1, Math.round(st.hp * k * E.hpMult * bm.hp * gm));
  return {
    uid: uid(), dex: sp.dex, name: sp.name, types: sp.types, level,
    hp, max: hp,
    atk: Math.round(st.atk * k * bm.atk * gm), def: Math.round(st.def * k * bm.def),
    spa: Math.round(st.spa * k * bm.atk * gm), spd: Math.round(st.spd * k * bm.def), ivs,
    spe: st.spe, move: sp.move, boss: kind === 'legend', trainer: kind === 'trainer', elite,
    st: {}, defDown: 0, buff: 0, guard: 0, anger: 0, flinch: false,
    pattern: patternFor(sp, kind === 'legend'), pi: 0,
  };
}
function patternFor(sp, boss) {
  const [, a, d, s, sd, spe] = sp.base;
  if (boss) return ['spez', 'atk', 'buff', 'strong', 'status', 'spez', 'guard', 'strong'];
  if (spe >= Math.max(a, s) && spe >= 90) return ['atk', 'atk', 'strong'];
  if (d + sd > (a + s) * 1.3) return ['atk', 'guard', 'strong'];
  if (s > a) return ['spez', 'status', 'spez', 'buff'];
  return ['atk', 'strong', 'atk', 'status'];
}
// Gegner des aktuellen Kampfes. Trainer: erstes Pokémon kämpft, der Rest wartet in reserve.
export function makeFightEnemies() {
  const F = D.B.floor, prog = run.floor, kind = fightKind();
  if (kind === 'legend') return { enemies: [makeEnemy(prog, { kind })] };
  if (kind === 'trainer') return makeTrainer(prog);
  // Zufällig 1–3 Gegner (ab bestimmten Kämpfen im 1. Areal, danach immer möglich)
  let n = 1;
  const two = run.areal > 1 || run.fight >= F.twoEnemiesFrom, three = run.areal > 1 || run.fight >= F.threeEnemiesFrom;
  const r = rnd();
  if (three && r < F.threeEnemiesChance) n = 3;
  else if (two && r < F.threeEnemiesChance + F.twoEnemiesChance) n = 2;
  const elite = rnd() < F.eliteChance;
  return { enemies: Array.from({ length: n }, (_, i) => makeEnemy(prog, { elite: elite && i === 0, group: n })) };
}
// Trainer-Endboss: Themen-Team eines Typs, Größe wächst mit dem Areal, das letzte Pokémon ist das stärkste
export function makeTrainer(prog) {
  const T = AR().trainer, list = D.trainers.trainers;
  const fresh = list.filter((t) => !run.trainersSeen.includes(t.type));
  const tr = pick(fresh.length ? fresh : list);
  run.trainersSeen.push(tr.type);
  const size = Math.min(6, T.baseSize + run.areal - 1);
  const W = AR().wild;
  const cap = W.bstStart + W.bstPerFight * AR().fights + W.bstPerAreal * (run.areal - 1) + T.bstBonus;
  let pool = D.pokemon.filter((p) => !p.legendary && !p.mythical && !p.baby && p.types.includes(tr.type) && bst(p) <= cap).sort((x, y) => bst(y) - bst(x)).slice(0, 14);
  if (pool.length < 3) pool = D.pokemon.filter((p) => !p.legendary && !p.mythical && p.types.includes(tr.type)).sort((x, y) => bst(x) - bst(y)).slice(0, 10);
  const picks = [];
  while (picks.length < size) { const c = pool.filter((p) => !picks.includes(p)); picks.push(pick(c.length ? c : pool)); }
  picks.sort((x, y) => bst(x) - bst(y));
  const team = picks.map((sp, i) => makeEnemy(prog, { kind: 'trainer', sp, levelAdd: T.levelAdd + (i === picks.length - 1 ? T.aceLevel : 0), mult: { hp: T.hp, atk: T.atk, def: T.def } }));
  const sprite = tr.sprite || 1 + Math.floor(rnd() * 80);
  return { enemies: [team[0]], reserve: team.slice(1), trainer: { ...tr, sprite, size } };
}

// --- Beute & Gold ----------------------------------------------------------------
export function rollLoot(enemies) {
  const L = D.B.loot, ks = sumOps(keystoneOps(run));
  const boss = enemies.some((e) => e.boss || e.trainer), elite = enemies.some((e) => e.elite);
  let n = boss ? L.bossDrops : elite ? L.eliteDrops : ri(...L.dropsPerFight) + (enemies.length > 1 ? 1 : 0);
  n += Math.round(g(ks, 'lootExtra'));
  const items = [];
  for (let i = 0; i < n; i++) {
    if (!boss && rnd() < L.ballChance && i === 0) items.push(rollItem(run.floor, { kind: 'ball' }));
    else items.push(rollItem(run.floor, { minR: boss ? L.minRarityBoss : 1, exclude: ['ball'] }));
  }
  return items;
}
export function fightGold(enemies) {
  const G = D.B.gold, { mods } = computeStats(run);
  const boss = enemies.some((e) => e.boss || e.trainer);
  const base = ri(...G.perFight) * (1 + run.floor * G.floorMult) * (boss ? G.bossMult : 1) * Math.min(3, enemies.length) ** 0.6;
  return Math.round(base * (1 + g(mods, 'gold')));
}

// --- Zerlegen & Verkaufen --------------------------------------------------------
export function salvageGain(inst) {
  const def = itemDef(inst.id), S = D.B.salvage;
  const ks = sumOps(keystoneOps(run));
  const pts = S.byRarity[(inst.r || def.rarity) - 1] * (1 + S.levelScale * ((inst.lvl || 1) - 1)) * (1 + g(ks, 'salvage')) * (inst.n || 1);
  const gain = { stats: {}, aff: {}, gold: 0 };
  for (const [k, v] of Object.entries(def.salvage || { hp: 1 })) {
    if (k === 'all') for (const s of STATS) gain.stats[s] = (gain.stats[s] || 0) + v * pts * (s === 'hp' ? 3 : 1);
    else if (k === 'aff') {
      let types = Object.keys(def.stacks || {});
      if (def.tm) types = [def.tm.type];
      if (!types.length) types = [mon(run.team[0].dex).types[0]];
      for (const t of types) gain.aff[t] = (gain.aff[t] || 0) + Math.max(1, Math.round(v * pts / 2.5));
    } else if (k === 'gold') gain.gold += Math.round(8 * v * pts);
    else gain.stats[k] = (gain.stats[k] || 0) + v * pts * (k === 'hp' ? 2 : 1);
  }
  // Typ-Items geben immer etwas Affinität
  if (!def.salvage?.aff) for (const t of Object.keys(def.stacks || {})) gain.aff[t] = (gain.aff[t] || 0) + ((inst.r || 1) >= 3 ? 1 : 0);
  for (const s of Object.keys(gain.stats)) gain.stats[s] = Math.max(1, Math.round(gain.stats[s] * S.statScale));
  for (const t of Object.keys(gain.aff)) if (!gain.aff[t]) delete gain.aff[t];
  return gain;
}
export function applySalvage(gain) {
  for (const [s, v] of Object.entries(gain.stats)) run.perm[s] = (run.perm[s] || 0) + v;
  for (const [t, v] of Object.entries(gain.aff)) run.aff[t] = (run.aff[t] || 0) + v;
  run.gold += gain.gold;
  run.stats.salvaged++;
}
export function itemPrice(inst) {
  const def = itemDef(inst.id), S = D.B.shop;
  const fixed = S.fixed.find((f) => f.id === inst.id);
  const ks = sumOps(keystoneOps(run));
  const base = fixed ? fixed.price : S.priceByRarity[(inst.r || def.rarity) - 1] * (1 + 0.08 * ((inst.lvl || 1) - 1));
  return Math.max(1, Math.round(base * (1 + run.floor * S.priceFloorMult) * (1 - g(ks, 'shopDiscount'))));
}
export function sellPrice(inst) {
  const def = itemDef(inst.id);
  return Math.round((def.sell || itemPrice(inst) * D.B.shop.sellPct) * (inst.n || 1));
}

// --- Shop ---------------------------------------------------------------------
export function makeShop() {
  const ks = sumOps(keystoneOps(run)), S = D.B.shop;
  const n = S.slots + Math.round(g(ks, 'shopSlots'));
  const offers = Array.from({ length: n }, () => rollItem(run.floor + 1, { exclude: ['ball'] }));
  const owns = (id) => [...run.inv, ...run.team.flatMap((m) => m.held)].some((it) => it?.id === id);
  for (const f of S.fixed) if ((f.minFloor || 0) <= run.floor && !(f.once && owns(f.id))) offers.push({ ...makeItem(f.id, run.floor), fixed: true });
  run.shop = { offers, rerolls: 0 };
}
export const rerollCost = () => D.B.shop.reroll + D.B.shop.rerollStep * (run.shop?.rerolls || 0);

export function keystoneOffer() {
  const owned = new Set(run.keystones);
  const pool = D.keystones.filter((k) => !owned.has(k.id) || ['stapler', 'lehrer'].includes(k.id));
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
  return out;
}
export { allOps };
