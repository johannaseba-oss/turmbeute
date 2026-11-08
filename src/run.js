// Lauf-Zustand: Team, Inventar, Gold, permanente Werte, Floors, Beute, Shop, Zerlegen, Level & Entwicklung.
import { D, mon, itemDef, ri, rnd, pick, weighted, uid, clamp } from './data.js';
import { baseStats, invSize, heldSlots, keystoneOps, sumOps, g, computeStats, allOps, STATS, equipOps, expFor, heldOf } from './mods.js';

const SAVE = 'turmbeute.run.v2', META = 'turmbeute.meta.v1';
// ?nosave: Testläufe (Bot) schreiben nichts in den Speicher
const NOSAVE = typeof location !== 'undefined' && location.search.includes('nosave');
export let run = null;
export const setRun = (r) => (run = r);

export function loadMeta() { try { return JSON.parse(localStorage.getItem(META)) || { best: 0, runs: 0 }; } catch { return { best: 0, runs: 0 }; } }
export function saveMeta(m) { if (NOSAVE) return; try { localStorage.setItem(META, JSON.stringify(m)); } catch {} }
export function save() { if (NOSAVE) return; try { if (run) localStorage.setItem(SAVE, JSON.stringify(run)); } catch {} }
export function loadSaved() { try { return JSON.parse(localStorage.getItem(SAVE)); } catch { return null; } }
export function clearSave() { if (NOSAVE) return; try { localStorage.removeItem(SAVE); } catch {} }

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
export function makeMon(dex, level) {
  const m = { uid: uid(), dex, level, exp: expFor(mon(dex).growth, level), held: [], used: false, fainted: false, hp: null };
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
  if (!inst || !m) return;
  const def = itemDef(inst.id);
  // Entwicklungsstein: entwickelt sofort, wenn passend
  if (def.kind === 'stone') {
    const ev = mon(m.dex).evos.find((e) => e.stone === def.stone);
    if (ev && !noEvolve(m)) { takeOne(invIdx); evolve(m, ev.to); return 'evolved'; }
  }
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
export function newRun(dexes) {
  const B = D.B;
  run = {
    v: 2, floor: 1, fight: 0, fights: 1, phase: 'floor', gold: B.startGold,
    perm: Object.fromEntries(STATS.map((s) => [s, 0])), aff: {},
    team: [], inv: [], keystones: [],
    floorOps: [], floorStacks: {}, battle: null, shop: null, loot: null, events: [],
    stats: { kills: 0, caught: 0, salvaged: 0 }, ksOffer: null,
  };
  for (const dex of dexes) addMon(makeMon(dex, B.level.start));
  ensureInv();
  for (const id of B.startItems) addItem(makeItem(id, 1));
  startFloor();
  return run;
}
export const isBossFloor = (f) => f % D.B.floor.bossEvery === 0;

export function startFloor() {
  run.floorOps = [];
  run.floorStacks = {};
  run.team.forEach((m) => (m.used = false));
  run.fight = 0;
  run.fights = isBossFloor(run.floor) ? 1 : ri(...D.B.floor.fights);
  run.phase = 'floor';
}

// --- Gegner ------------------------------------------------------------------
function maxStage(floor) { let s = 1; for (const [f, st] of D.B.enemy.stageByFloor) if (floor >= f) s = st; return s; }
function spawnPool(floor, boss) {
  const ms = maxStage(floor);
  if (boss) {
    const legends = floor >= D.B.enemy.legendaryBossFrom;
    const pool = D.pokemon.filter((p) => (legends ? p.legendary || p.mythical : !p.legendary && !p.mythical && p.base.reduce((a, b) => a + b) >= 480 && p.evos.length === 0));
    return pool;
  }
  return D.pokemon.filter((p) => !p.legendary && !p.mythical && p.stage <= ms && (p.stage >= ms - 1 || p.evos.length === 0 || floor < 6));
}
export function enemyLevel(floor, boss = false) {
  const E = D.B.enemy;
  return Math.max(1, Math.round(E.levelBase + (floor - 1) * E.levelPerFloor) + ri(0, 1) + (boss ? E.boss.level : 0));
}
export function makeEnemy(floor, { boss = false, elite = false, dex = null } = {}) {
  const E = D.B.enemy;
  const pool = spawnPool(floor, boss);
  const W = D.B.spawn.rarityWeights;
  const sp = dex ? mon(dex) : weighted(pool, (p) => (W[p.rarity] ?? 1) * (p.rarity === 'gewoehnlich' ? 1 : 1 + floor * D.B.spawn.rareGrowth));
  const level = enemyLevel(floor, boss);
  const k = E.statMult * Math.pow(E.growExp, floor - 1) * (elite ? E.eliteMult : 1) * (E.early[floor - 1] ?? 1);
  const bm = boss ? E.boss : { hp: 1, atk: 1, def: 1 };
  const st = baseStats(sp.dex, level);
  const hp = Math.max(1, Math.round(st.hp * k * E.hpMult * bm.hp));
  return {
    uid: uid(), dex: sp.dex, name: sp.name, types: sp.types, level,
    hp, max: hp,
    atk: Math.round(st.atk * k * bm.atk), def: Math.round(st.def * k * bm.def),
    spa: Math.round(st.spa * k * bm.atk), spd: Math.round(st.spd * k * bm.def),
    spe: st.spe, move: sp.move, boss, elite,
    st: {}, defDown: 0, buff: 0, guard: 0, anger: 0, flinch: false,
    pattern: patternFor(sp, boss), pi: 0,
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
export function makeFightEnemies(floor) {
  const F = D.B.floor;
  if (isBossFloor(floor)) return [makeEnemy(floor, { boss: true })];
  let n = 1;
  if (floor >= F.threeEnemiesFrom && rnd() < F.threeEnemiesChance) n = 3;
  else if (floor >= F.twoEnemiesFrom && rnd() < F.twoEnemiesChance) n = 2;
  const elite = rnd() < F.eliteChance;
  return Array.from({ length: n }, (_, i) => makeEnemy(floor, { elite: elite && i === 0 }));
}

// --- Beute & Gold ----------------------------------------------------------------
export function rollLoot(enemies) {
  const L = D.B.loot, ks = sumOps(keystoneOps(run));
  const boss = enemies.some((e) => e.boss), elite = enemies.some((e) => e.elite);
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
  const boss = enemies.some((e) => e.boss);
  const base = ri(...G.perFight) * (1 + run.floor * G.floorMult) * (boss ? G.bossMult : 1) * enemies.length ** 0.6;
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
  for (const f of S.fixed) if ((f.minFloor || 0) <= run.floor) offers.push({ ...makeItem(f.id, run.floor), fixed: true });
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
