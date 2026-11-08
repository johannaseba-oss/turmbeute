// Lauf-Zustand: Team, Inventar, Gold, permanente Werte, Floors, Beute, Shop, Zerlegen, Level & Entwicklung.
import { D, mon, itemDef, ri, rnd, pick, weighted, uid, clamp } from './data.js';
import { invSize, trainerSlotCount, keystoneOps, sumOps, g, computeStats, allOps, STATS, equipOps } from './mods.js';

const SAVE = 'turmbeute.run.v1', META = 'turmbeute.meta.v1';
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
  const t = trainerSlotCount(run);
  while (run.trainerEq.length < t) run.trainerEq.push(null);
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
export function makeMon(dex, level) { return { uid: uid(), dex, level, held: null, used: false }; }
export function addMon(m) {
  if (run.team.length >= D.B.teamMax) return false;
  run.team.push(m);
  return true;
}
export function releaseMon(idx) {
  const m = run.team.splice(idx, 1)[0];
  if (m?.held && !addItem(m.held)) run.events.push({ kind: 'toast', text: `${itemName(m.held)} ging verloren (Inventar voll)` });
  return m;
}

export function canEquipOn(inst, target) {
  const def = itemDef(inst.id);
  if (!['held', 'gem', 'stone', 'tm', 'berry'].includes(def.kind)) return false;
  if (def.onlyMon && target === 'trainer') return false;
  return true;
}
// Item anlegen: target = {mon: idx} oder {trainer: idx}
export function equip(invIdx, target) {
  const inst = run.inv[invIdx];
  if (!inst) return;
  const def = itemDef(inst.id);
  if (target.mon != null) {
    const m = run.team[target.mon];
    // Entwicklungsstein: entwickelt sofort, wenn passend
    if (def.kind === 'stone') {
      const ev = mon(m.dex).evos.find((e) => e.stone === def.stone);
      if (ev && !heldNoEvolve(m)) { takeOne(invIdx); evolve(m, ev.to); return 'evolved'; }
    }
    const old = m.held;
    m.held = takeOne(invIdx);
    if (old) addItem(old);
  } else {
    const old = run.trainerEq[target.trainer];
    run.trainerEq[target.trainer] = takeOne(invIdx);
    if (old) addItem(old);
  }
  return 'ok';
}
export function unequip(target) {
  if (freeSlots() <= 0) return false;
  if (target.mon != null) { const m = run.team[target.mon]; if (!m.held) return false; addItem(m.held); m.held = null; }
  else { const it = run.trainerEq[target.trainer]; if (!it) return false; addItem(it); run.trainerEq[target.trainer] = null; }
  return true;
}
const heldNoEvolve = (m) => m.held && equipOps(m.held).some((o) => o.op === 'noEvolve');

export function evolve(m, to) {
  const from = m.dex;
  m.dex = to;
  run.events.push({ kind: 'evolve', from, to, uid: m.uid });
}
// Level-Ups nach dem Floor (inkl. Entwicklungen)
export function levelTeam(extra = 0) {
  const ks = sumOps(keystoneOps(run));
  for (const m of run.team) {
    const egg = m.held ? equipOps(m.held).filter((o) => o.op === 'levelUp').reduce((s, o) => s + o.v, 0) : 0;
    giveLevels(m, D.B.level.perFloor + g(ks, 'levelUp') + egg + extra);
  }
}
export function giveLevels(m, n) {
  m.level = Math.min(D.B.level.max, m.level + n);
  if (heldNoEvolve(m)) return;
  for (let k = 0; k < 3; k++) {
    const ev = mon(m.dex).evos.find((e) => e.level && m.level >= e.level);
    if (!ev) break;
    evolve(m, ev.to);
  }
}

// --- Neuer Lauf ----------------------------------------------------------------
export function newRun(starterDex) {
  const B = D.B;
  run = {
    v: 1, floor: 1, fight: 0, fights: 1, phase: 'floor', gold: B.startGold,
    perm: Object.fromEntries(STATS.map((s) => [s, 0])), aff: {},
    team: [makeMon(starterDex, B.level.start)], inv: [], trainerEq: [], keystones: [],
    floorOps: [], floorStacks: {}, hp: 1, battle: null, shop: null, loot: null, events: [],
    stats: { kills: 0, caught: 0, salvaged: 0 }, ksOffer: null,
  };
  ensureInv();
  for (const id of B.startItems) addItem(makeItem(id, 1));
  run.hp = maxHp();
  startFloor();
  return run;
}
export const maxHp = () => computeStats(run).stats.hp;
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
export function makeEnemy(floor, { boss = false, elite = false, dex = null } = {}) {
  const E = D.B.enemy;
  const pool = spawnPool(floor, boss);
  const W = D.B.spawn.rarityWeights;
  const sp = dex ? mon(dex) : weighted(pool, (p) => (W[p.rarity] ?? 1) * (p.rarity === 'gewoehnlich' ? 1 : 1 + floor * D.B.spawn.rareGrowth));
  const f = floor - 1, grow = (1 + E.growLin * f + E.growQuad * f * f) * Math.pow(E.growExp, f);
  const k = grow * (elite ? E.eliteMult : 1) * (E.early[floor - 1] ?? 1);
  const [bh, ba, bd, bs, bsd, bsp] = sp.base;
  const bm = boss ? E.boss : { hp: 1, atk: 1, def: 1 };
  const hp = Math.round((E.hpBase + bh * E.hp) * k * bm.hp);
  const e = {
    uid: uid(), dex: sp.dex, name: sp.name, types: sp.types, level: Math.min(100, 2 + floor * 2 + (boss ? 5 : 0)),
    hp, max: hp,
    atk: Math.round((E.atkBase + ba * E.atk) * k * bm.atk), def: Math.round((E.defBase + bd * E.def) * k * bm.def),
    spa: Math.round((E.spaBase + bs * E.spa) * k * bm.atk), spd: Math.round((E.spdBase + bsd * E.spd) * k * bm.def),
    spe: Math.round(bsp * E.spe), move: sp.move, boss, elite,
    st: {}, defDown: 0, buff: 0, guard: 0, anger: 0, flinch: false,
    pattern: patternFor(sp, boss), pi: 0,
  };
  return e;
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
  for (const s of Object.keys(gain.stats)) gain.stats[s] = Math.max(1, Math.round(gain.stats[s]));
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
