// Rundenbasierter Kampf. Jede Funktion meldet ihre Schritte über fx(evt) (Animationen/Log) und wartet darauf.
// Ohne Oberfläche (Bot-Test) ist fx ein No-op.
import { D, mon, itemDef, typeEff, rnd, ri, clamp, pick } from './data.js';
import { computeStats, g, sumOps, opText } from './mods.js';
import { run, makeMon, addMon, takeOne, maxHp, save } from './run.js';

let fx = async () => {};
export const setFx = (f) => (fx = f);
const C = () => D.B.combat;
// Abwehr wirkt relativ zum Angriff: gleich starke Werte halbieren ungefähr den Schaden
const defFactor = (A, Def) => (A + C().defK) / (A + C().defK + Def);
export const STATUS = { burn: 'Verbrennung', poison: 'Gift', para: 'Paralyse', sleep: 'Schlaf', freeze: 'Eis', confuse: 'Verwirrung' };
const TYPE_STATUS = { Feuer: 'burn', Elektro: 'para', Gift: 'poison', Psycho: 'confuse', Fee: 'sleep', Geist: 'sleep', Pflanze: 'sleep', Eis: 'freeze' };

export const B = () => run.battle;
export const P = () => computeStats(run, B()?.buffs || []);
export const lead = () => run.team[0];
export const alive = () => B().enemies.filter((e) => e.hp > 0);

// --- Kampfstart ------------------------------------------------------------------
export async function startBattle(enemies) {
  const { stats, mods } = computeStats(run);
  run.battle = { enemies, turn: 1, energy: D.B.energy.start + Math.round(g(mods, 'energyStart')), buffs: [], stacks: {}, shield: 0, pst: {}, sashUsed: 0, extra: Math.round(g(mods, 'extraTurn')), target: 0, caught: [], log: [], quickUsed: false };
  const b = B();
  run.hp = Math.min(run.hp, stats.hp);
  await fx({ kind: 'start' });
  for (const s of mods.selfStatus) b.pst[s] = s === 'poison' ? 1 : 3;
  if (g(mods, 'shield') > 0) { b.shield = Math.round(stats.hp * g(mods, 'shield')); await fx({ kind: 'shield', v: b.shield }); }
  if (g(mods, 'hazard') > 0) for (const e of alive()) await dealRaw(e, Math.round(e.max * g(mods, 'hazard')), 'Gestein', 'Tarnsteine');
  for (const s of mods.startStatus) for (const e of alive()) await inflict(e, s, mods, true);
  save();
}

// --- Schaden des Spielers --------------------------------------------------------
function dmgCalc(e, { power, type, cat, neutral }, stats, mods) {
  const c = C(), b = B();
  const A = cat === 'phys' ? stats.atk : stats.spa;
  let D_ = cat === 'phys' ? e.def : e.spd;
  let ign = g(mods, 'defIgnore') + e.defDown;
  if (e.st.burn) ign += g(mods, 'burnArmor');
  if (e.st.poison) ign += g(mods, 'poisonArmor');
  D_ *= 1 - clamp(ign, 0, 0.9);
  let eff = neutral ? 1 : typeEff(type, e.types);
  if (eff > 1) eff += g(mods, 'effBoost') * (eff / 2);
  const leadTypes = mon(lead().dex).types;
  const stab = leadTypes.includes(type) ? c.stab : 1;
  let mult = 1 + g(mods, 'dmgPct') + (mods.typeDmg[type] || 0) + (eff > 1 ? g(mods, 'superPct') : 0) + g(mods, 'ramp') * (b.turn - 1);
  if (run.hp < P().stats.hp * 0.5) mult += g(mods, 'lowHp');
  if (e.st.para) mult += g(mods, 'vsPara');
  if (e.st.freeze) mult += g(mods, 'vsFreeze');
  if (Object.keys(e.st).length) mult += g(mods, 'vsStatus');
  const crit = rnd() < g(mods, 'crit');
  if (crit && g(mods, 'critPierce')) D_ *= 0.3;
  let dmg = A * power * defFactor(A, D_) * eff * stab * mult * (0.9 + rnd() * 0.2);
  if (crit) dmg *= c.critMult + g(mods, 'critDmg');
  return { dmg: Math.max(eff === 0 ? 0 : 1, Math.round(dmg)), eff, crit };
}

// Ein Treffer (inkl. Status, Kettenschaden, Lebensraub …)
async function strike(e, move, { stats, mods, label, secondary = false, statusBonus = null } = {}) {
  const { dmg, eff, crit } = dmgCalc(e, move, stats, mods);
  await fx({ kind: 'hit', e, dmg: absorb(e, dmg), eff, crit, type: move.type, label });
  if (e.hp <= 0) { await onKill(e, mods); return dmg; }
  // Status-Chancen
  const ch = [['burn', g(mods, 'burnChance')], ['para', g(mods, 'paraChance') * (1 + g(mods, 'paraMult'))], ['poison', g(mods, 'poisonChance')], ['sleep', g(mods, 'sleepChance')], ['freeze', g(mods, 'freezeChance')], ['confuse', g(mods, 'confuseChance')]];
  if (statusBonus) ch.push([statusBonus, 0.5]);
  for (const [s, p] of ch) if (p > 0 && rnd() < p) await inflict(e, s, mods);
  if (g(mods, 'defShred') > 0) e.defDown = Math.min(0.6, e.defDown + g(mods, 'defShred'));
  if (g(mods, 'flinch') > 0 && rnd() < g(mods, 'flinch')) e.flinch = true;
  if (!secondary) {
    if (g(mods, 'chain') > 0) for (const o of alive().filter((x) => x !== e)) await chainHit(o, Math.round(dmg * g(mods, 'chain')), move.type);
    if (e.st.burn && g(mods, 'burnSpread')) for (const o of alive().filter((x) => x !== e && !x.st.burn)) await inflict(o, 'burn', mods, true);
    if (g(mods, 'lifesteal') > 0) await heal(dmg * g(mods, 'lifesteal'), mods, 'Lebensraub');
    if (g(mods, 'recoil') > 0) await hurtPlayer(Math.round(dmg * g(mods, 'recoil')), 'Rückstoß');
  }
  return dmg;
}
function absorb(e, dmg) {
  if (e.guard > 0) { const a = Math.min(e.guard, dmg); e.guard -= a; dmg -= a; }
  e.hp = Math.max(0, e.hp - dmg);
  return dmg;
}
async function chainHit(e, dmg, type) {
  if (dmg <= 0 || e.hp <= 0) return;
  await fx({ kind: 'hit', e, dmg: absorb(e, dmg), eff: 1, type, small: true });
  if (e.hp <= 0) await onKill(e, P().mods);
}
async function dealRaw(e, dmg, type, label) {
  if (e.hp <= 0 || dmg <= 0) return;
  e.hp = Math.max(0, e.hp - dmg);
  await fx({ kind: 'hit', e, dmg, eff: 1, type, small: true, label });
  if (e.hp <= 0) await onKill(e, P().mods);
}
async function onKill(e, mods) {
  run.stats.kills++;
  await fx({ kind: 'ko', e });
  if (g(mods, 'killHeal') > 0) await heal(P().stats.hp * g(mods, 'killHeal'), mods, 'K.O.-Heilung');
  if (e.st.poison && g(mods, 'poisonSpread')) { const o = alive()[0]; if (o) { o.st.poison = (o.st.poison || 0) + e.st.poison; await fx({ kind: 'status', e: o, s: 'poison' }); } }
}

export async function inflict(e, s, mods, quiet = false) {
  if (e.hp <= 0) return;
  const had = !!e.st[s];
  if (s === 'poison') e.st.poison = (e.st.poison || 0) + 1 + Math.round(g(mods, 'poisonDmg'));
  else if (s === 'sleep') e.st.sleep = Math.max(e.st.sleep || 0, ri(...C().sleepTurns));
  else if (s === 'freeze') e.st.freeze = Math.max(e.st.freeze || 0, ri(...C().freezeTurns));
  else if (s === 'confuse') e.st.confuse = 3;
  else e.st[s] = true;
  await fx({ kind: 'status', e, s, quiet });
  // Status-Kaskade
  if (!had && g(mods, 'cascade') > 0 && rnd() < g(mods, 'cascade')) {
    const other = pick(Object.keys(STATUS).filter((x) => !e.st[x]));
    if (other) await inflict(e, other, { ...mods, cascade: 0 });
  }
}

async function heal(v, mods, label) {
  const max = P().stats.hp;
  v = Math.round(v * (1 + g(mods, 'healPct')));
  const h = Math.min(v, max - run.hp);
  if (h <= 0) return;
  run.hp += h;
  await fx({ kind: 'heal', v: h, label });
}
async function hurtPlayer(dmg, label) {
  run.hp = Math.max(0, run.hp - dmg);
  await fx({ kind: 'phit', dmg, label, small: true });
  await sashCheck();
}
async function sashCheck() {
  if (run.hp > 0) return;
  const { mods } = P();
  if (B().sashUsed < g(mods, 'sash')) { B().sashUsed++; run.hp = 1; await fx({ kind: 'say', text: 'Fokusgurt! Mit 1 KP überlebt.' }); }
}

// --- Aktionen des Spielers ----------------------------------------------------------
const target = () => { const a = alive(); return a.find((e) => e.uid === B().targetUid) || a[0]; };

export function specialCost() {
  const { mods } = P();
  return Math.max(0, D.B.energy.specialCost + Math.round(g(mods, 'specialCost')));
}
export function leadMoves() {
  const sp = mon(lead().dex);
  return {
    attack: { name: 'Angriff', type: sp.types[0], cat: 'phys', power: C().attackMult, neutral: true },
    special: { name: sp.move.name, type: sp.move.type, cat: 'spez', power: C().specialMult * (sp.move.power / 60) },
  };
}

// Status am Rundenanfang (Spieler): Schlaf/Eis/Paralyse können den Zug kosten
async function playerBlocked() {
  const pst = B().pst;
  if (pst.sleep > 0) { pst.sleep--; await fx({ kind: 'say', text: 'Du schläfst …' }); return true; }
  if (pst.freeze > 0) { pst.freeze--; await fx({ kind: 'say', text: 'Eingefroren!' }); return true; }
  if (pst.para && rnd() < C().paraSkip) { await fx({ kind: 'say', text: 'Paralysiert! Zug verloren.' }); return true; }
  return false;
}

export async function act(action, arg = {}) {
  const b = B();
  if (!b || b.busy) return;
  b.busy = true;
  try {
    if (await playerBlocked()) { await endPlayerAction(); return; }
    const done = await doAction(action, arg);
    if (done === false) return;
    await endPlayerAction();
  } finally {
    if (run.battle) run.battle.busy = false;
    save();
    await fx({ kind: 'update' });
  }
}

async function doAction(action, arg) {
  const b = B();
  const { stats, mods } = P();
  const mv = leadMoves();
  const confused = b.pst.confuse > 0 && rnd() < C().confuseSelfHit;
  if (b.pst.confuse > 0) b.pst.confuse--;
  if (confused && ['attack', 'special'].includes(action)) {
    await fx({ kind: 'say', text: 'Verwirrt! Du triffst dich selbst.' });
    await hurtPlayer(Math.round(stats.atk * 0.6), 'Verwirrung');
    return true;
  }
  if (action === 'attack') {
    const e = target();
    await fx({ kind: 'pattack', move: mv.attack });
    await strike(e, mv.attack, { stats, mods });
    if (g(mods, 'doubleHit') > 0 && rnd() < g(mods, 'doubleHit') && alive().length) { await fx({ kind: 'say', text: 'Doppelschlag!' }); await strike(target(), mv.attack, { stats, mods }); }
  } else if (action === 'special') {
    const cost = specialCost();
    if (b.energy < cost) return false;
    b.energy -= cost;
    const e = target();
    const move = { ...mv.special, power: mv.special.power * (1 + g(mods, 'specialPct')) };
    await fx({ kind: 'pattack', move, special: true });
    await strike(e, move, { stats, mods, label: move.name, statusBonus: rnd() < 0.3 ? TYPE_STATUS[move.type] : null });
  } else if (action === 'wait') {
    await fx({ kind: 'say', text: 'Durchatmen …' });
    await heal(stats.hp * C().waitHeal, mods, 'Warten');
    b.energy = Math.min(D.B.energy.max, b.energy + C().waitEnergy);
  } else if (action === 'item') return useItem(arg.idx, stats, mods);
  else if (action === 'ball') return throwBall(arg.idx, stats, mods);
  else if (action === 'mon') return useMon(arg.idx, stats, mods);
  else if (action === 'sacrifice') return sacrifice(arg.idx, mods);
  else if (action === 'lead') {
    const [m] = run.team.splice(arg.idx, 1);
    run.team.unshift(m);
    await fx({ kind: 'swap' });
  }
  return true;
}

// Item verbrauchen
export function useEffect(inst) {
  const def = itemDef(inst.id);
  if (def.use) return def.use;
  if (def.kind === 'ball' || def.kind === 'treasure' || def.kind === 'fragment') return null;
  if (def.stacks) return { burst: 1.5, floorStacks: 2, text: 'Typ-Entladung und +2 Stacks für den Floor' };
  if (def.equip) return { buffs: def.equip.map((o) => ({ ...o, v: o.v * 2 })), text: 'Überladen: doppelte Wirkung für den Kampf' };
  return null;
}
async function useItem(idx, stats, mods) {
  const inst = run.inv[idx];
  const def = itemDef(inst.id);
  const u = useEffect(inst);
  if (!u || def.restOnly) return false;
  takeOne(idx);
  await fx({ kind: 'use', inst });
  await applyUse(inst, u, stats, mods);
  return true;
}
export async function applyUse(inst, u, stats, mods) {
  const b = B(), def = itemDef(inst.id);
  const boost = 1 + g(mods, 'useBoost');
  if (u.heal) await heal(stats.hp * u.heal * boost, mods, def.name);
  if (u.cure) { b.pst = {}; await fx({ kind: 'say', text: 'Status geheilt.' }); }
  if (u.energy) b.energy = Math.min(D.B.energy.max, b.energy + u.energy);
  if (u.buffs) { b.buffs.push(...u.buffs.map((o) => ({ ...o, v: o.v * boost }))); await fx({ kind: 'buff', text: u.buffs.map((o) => opText({ ...o, v: o.v * boost })).join(', ') }); }
  const types = Object.keys(def.stacks || {});
  const cs = Math.round(g(mods, 'consumeStacks'));
  if (u.floorStacks || cs) for (const t of types) run.floorStacks[t] = (run.floorStacks[t] || 0) + Math.round((u.floorStacks || 0) * boost) + cs;
  if (u.burst && types.length && alive().length) await typeBurst(types[0], u.burst * boost, stats, mods, def.name);
  if (u.attack && alive().length) {
    const a = u.attack, move = { name: a.name, type: a.type, cat: 'spez', power: a.power * boost };
    await fx({ kind: 'pattack', move, special: true });
    for (const e of a.all ? alive() : [target()]) await strike(e, move, { stats, mods, label: a.name, statusBonus: a.status, secondary: a.all });
  }
}
// Typ-Entladung: Schaden je nach Stacks; aktive Synergie mit diesem Typ zündet zusätzlich
async function typeBurst(type, power, stats, mods, label) {
  const st = P().stacks[type] || 0;
  const move = { name: 'Entladung', type, cat: 'spez', power: power * (1 + st * 0.08) };
  await fx({ kind: 'pattack', move, special: true });
  await strike(target(), move, { stats, mods, label: `${type}-Entladung`, secondary: true });
  for (const syn of P().active.synergies.filter((s) => s.types.includes(type))) {
    if (!alive().length) break;
    const bu = syn.burst;
    await fx({ kind: 'synergy', syn });
    const m2 = { name: syn.name, type: bu.type, cat: 'spez', power: bu.power * (1 + st * 0.05) };
    for (const e of bu.all ? alive() : [target()]) await strike(e, m2, { stats, mods, label: syn.name, statusBonus: bu.status, secondary: true });
    if (bu.heal) await heal(stats.hp * bu.heal, mods, syn.name);
    if (bu.shield) { B().shield += Math.round(stats.hp * bu.shield); await fx({ kind: 'shield', v: B().shield }); }
  }
}

// Team-Pokémon einsetzen (typisierter Großangriff, danach erschöpft bis zum nächsten Floor)
export function monMove(m) {
  const sp = mon(m.dex);
  const tm = m.held && itemDef(m.held.id).tm;
  return tm ? { name: tm.name, type: tm.type, cat: 'spez', power: tm.power } : { ...sp.move, power: sp.move.power / 60 };
}
async function useMon(idx, stats, mods) {
  const m = run.team[idx];
  if (!m || m.used) return false;
  m.used = true;
  const mv = monMove(m), sp = mon(m.dex);
  const k = C().useMonMult * (1 + g(mods, 'monUsePct')) * (0.7 + m.level * 0.015) * (1 + sp.base.reduce((a, c) => a + c) / 1200);
  const move = { name: mv.name, type: mv.type, cat: mv.cat === 'phys' ? 'phys' : 'spez', power: mv.power * k };
  await fx({ kind: 'monuse', m, move });
  await strike(target(), move, { stats, mods, label: `${sp.name}: ${mv.name}`, statusBonus: TYPE_STATUS[mv.type] });
  return true;
}
// Pokémon opfern: massiver Floor-Boost, permanente Affinität
async function sacrifice(idx, mods) {
  if (run.team.length <= 1) return false;
  const S = D.B.sacrifice, mult = 1 + g(mods, 'monUsePct');
  const [m] = run.team.splice(idx, 1);
  const sp = mon(m.dex);
  run.floorOps.push({ op: 'allPct', v: S.floorAllPct * mult });
  sp.types.forEach((t, i) => (run.floorStacks[t] = (run.floorStacks[t] || 0) + Math.round((i === 0 ? D.stacks.mainType : D.stacks.subType) * S.stackMult * mult)));
  for (const t of sp.types) run.aff[t] = (run.aff[t] || 0) + S.affinity;
  if (m.held) run.events.push({ kind: 'toast', text: `${itemDef(m.held.id).name} ging mit verloren` });
  await fx({ kind: 'sacrifice', m });
  const st = P();
  await heal(st.stats.hp * S.healPct, st.mods, 'Opfer');
  return true;
}

// --- Pokéball -----------------------------------------------------------------------
export function catchChance(e, inst, mods = P().mods) {
  const cb = itemDef(inst.id).catch, K = D.B.catch, b = B();
  if (cb.sure) return 1;
  let ball = cb.mult;
  if (cb.types && e.types.some((t) => cb.types.includes(t))) ball *= cb.bonus;
  if (cb.fast && mon(e.dex).base[5] >= cb.fast) ball *= cb.bonus;
  if (cb.nest) ball *= clamp(K.nestMax - run.floor * 0.15, 1, K.nestMax);
  if (cb.timer) ball *= Math.min(K.timerMax, 1 + (b.turn - 1) * K.timerPerTurn);
  if (cb.quick && b.turn === 1) ball *= K.quickTurn1;
  let st = 1;
  for (const s of Object.keys(e.st)) st = Math.max(st, K.status[s] || 1);
  const rate = mon(e.dex).catch;
  let a = ((3 * e.max - 2 * e.hp) * rate * ball) / (3 * e.max) * st * (1 + g(mods, 'catch'));
  if (e.boss) a *= K.bossMult;
  if (a >= 255) return 1;
  const bb = 65536 / Math.pow(255 / a, 0.1875);
  return Math.pow(bb / 65536, 4);
}
async function throwBall(idx, stats, mods) {
  const inst = run.inv[idx];
  if (!inst || itemDef(inst.id).kind !== 'ball') return false;
  const e = target();
  const p = catchChance(e, inst, mods);
  takeOne(idx);
  // 4 Schüttelproben wie im Original (Wahrscheinlichkeit je Probe = p^(1/4))
  const per = Math.pow(p, 0.25);
  let shakes = 0;
  while (shakes < 4 && rnd() < per) shakes++;
  const ok = shakes === 4;
  await fx({ kind: 'ball', e, inst, shakes: Math.min(3, shakes), ok });
  if (ok) {
    run.stats.caught++;
    e.hp = 0; e.caught = true;
    const cb = itemDef(inst.id).catch;
    const nm = makeMon(e.dex, e.level);
    if (cb.heal) await heal(stats.hp * cb.heal, mods, 'Heilball');
    if (cb.gold) run.gold += cb.gold;
    if (!addMon(nm)) B().caught.push(nm);
    await fx({ kind: 'caught', e, full: B().caught.includes(nm) });
  } else {
    e.anger++;
    await fx({ kind: 'say', text: `${e.name} hat sich befreit – und ist wütend!` });
  }
  return true;
}

// --- Rundenende & Gegnerzug -----------------------------------------------------------
async function endPlayerAction() {
  const b = B();
  if (!alive().length) return;
  const { mods } = P();
  if (b.extra > 0) { b.extra--; await fx({ kind: 'say', text: 'Extra-Aktion!' }); return; }
  if (g(mods, 'quick') > 0 && !b.quickUsed && rnd() < g(mods, 'quick')) { b.quickUsed = true; await fx({ kind: 'say', text: 'Flinkklaue! Noch eine Aktion.' }); return; }
  b.quickUsed = false;
  for (const e of alive()) { await enemyTurn(e); if (run.hp <= 0) return; }
  await roundEnd();
}

export function intentOf(e) { return e.pattern[e.pi % e.pattern.length]; }
export function intentPreview(e) {
  const it = intentOf(e);
  const { stats, mods } = P();
  if (['atk', 'strong', 'spez', 'status'].includes(it)) return { it, dmg: enemyDmg(e, it, stats, mods).dmg };
  return { it };
}
function enemyDmg(e, it, stats, mods) {
  const c = C();
  const spec = it === 'spez' || it === 'status';
  const type = spec ? e.move.type : e.types[0];
  const A = (spec ? e.spa : e.atk) * (1 + 0.2 * e.buff + D.B.enemy.angerAtk * e.anger + g(mods, 'enemyAtk'));
  const Dp = spec ? stats.spd : stats.def;
  const mult = { atk: 1, strong: 1.6, spez: 1.3, status: 0.5 }[it] || 1;
  const eff = spec ? typeEff(type, mon(lead().dex).types) : 1;
  const burn = e.st.burn && !spec ? 0.75 : 1;
  const dmg = A * mult * defFactor(A, Dp) * eff * burn * (1 + g(mods, 'dmgTaken'));
  return { dmg: Math.max(eff === 0 ? 0 : 1, Math.round(dmg)), eff, type };
}
async function enemyTurn(e) {
  const b = B(), { stats, mods } = P();
  const it = intentOf(e);
  e.pi++;
  e.guard = 0;
  if (e.flinch) { e.flinch = false; await fx({ kind: 'say', text: `${e.name} schreckt zurück!` }); return; }
  if (e.st.sleep > 0) { e.st.sleep--; if (!e.st.sleep) delete e.st.sleep; await fx({ kind: 'say', text: `${e.name} schläft.` }); return; }
  if (e.st.freeze > 0) { e.st.freeze--; if (!e.st.freeze) delete e.st.freeze; await fx({ kind: 'say', text: `${e.name} ist eingefroren.` }); return; }
  if (e.st.para && rnd() < C().paraSkip) { await fx({ kind: 'say', text: `${e.name} ist paralysiert!` }); return; }
  if (e.st.confuse > 0) {
    e.st.confuse--; if (!e.st.confuse) delete e.st.confuse;
    if (rnd() < C().confuseSelfHit) { await dealRaw(e, Math.round(e.atk * 0.8), 'Normal', 'Verwirrt'); return; }
  }
  if (it === 'guard') { e.guard = Math.round(e.max * 0.2); await fx({ kind: 'eguard', e }); return; }
  if (it === 'buff') { e.buff++; await fx({ kind: 'ebuff', e }); return; }
  // Ausweichen: Grundwert + Initiative-Vorteil
  const evade = clamp(g(mods, 'evasion') + C().speedEvasion * clamp((stats.spe - e.spe * (1 + g(mods, 'enemySpe'))) / (stats.spe + e.spe), 0, 1), 0, C().evasionCap);
  await fx({ kind: 'eattack', e, it });
  if (rnd() < evade) { await fx({ kind: 'miss' }); return; }
  let { dmg, eff } = enemyDmg(e, it, stats, mods);
  if (b.shield > 0) { const a = Math.min(b.shield, dmg); b.shield -= a; dmg -= a; if (a) await fx({ kind: 'shieldhit', v: a }); }
  run.hp = Math.max(0, run.hp - dmg);
  await fx({ kind: 'phit', dmg, eff, e, type: it === 'spez' || it === 'status' ? e.move.type : e.types[0] });
  await sashCheck();
  if (g(mods, 'thorns') > 0 && dmg > 0) await dealRaw(e, Math.round(dmg * g(mods, 'thorns')), 'Gestein', 'Dornen');
  if (it === 'status' && run.hp > 0) {
    const s = TYPE_STATUS[e.move.type] || TYPE_STATUS[e.types[0]] || 'poison';
    if (g(mods, 'statusImmune') > 0) await fx({ kind: 'say', text: 'Status abgewehrt!' });
    else { b.pst[s] = s === 'sleep' ? 2 : s === 'freeze' ? 1 : s === 'confuse' ? 2 : s === 'poison' ? (b.pst.poison || 0) + 1 : true; await fx({ kind: 'pstatus', s }); await autoTriggers('status'); }
  }
  if (run.hp > 0 && run.hp < stats.hp * 0.5) await autoTriggers('lowHp');
}
// Angelegte Beeren lösen automatisch aus (und sind dann weg)
async function autoTriggers(kind) {
  for (const holder of [...run.team.map((m) => ({ m })), ...run.trainerEq.map((_, i) => ({ t: i }))]) {
    const inst = holder.m ? holder.m.held : run.trainerEq[holder.t];
    if (!inst || itemDef(inst.id).trigger !== kind) continue;
    if (holder.m) holder.m.held = null; else run.trainerEq[holder.t] = null;
    const { stats, mods } = P();
    await fx({ kind: 'use', inst, auto: true });
    await applyUse(inst, itemDef(inst.id).use, stats, mods);
    return;
  }
}

async function roundEnd() {
  const b = B(), c = C();
  const { stats, mods } = P();
  for (const e of alive()) {
    if (e.st.burn) await dealRaw(e, Math.round(e.max * c.burnTick * (1 + g(mods, 'burnDmg'))), 'Feuer', 'Verbrennung');
    if (e.st.poison && e.hp > 0) await dealRaw(e, Math.round(e.max * c.poisonTick * e.st.poison * (1 + g(mods, 'poisonDmg'))), 'Gift', 'Gift');
    if (g(mods, 'leech') > 0 && e.hp > 0) { const d = Math.round(e.max * g(mods, 'leech')); await dealRaw(e, d, 'Pflanze', 'Egelsamen'); await heal(d, mods, 'Egelsamen'); }
    if (g(mods, 'storm') > 0 && e.hp > 0) await dealRaw(e, Math.round(e.max * g(mods, 'storm')), 'Eis', 'Hagel');
    if (g(mods, 'nightmare') > 0 && e.st.sleep && e.hp > 0) await dealRaw(e, Math.round(e.max * g(mods, 'nightmare')), 'Geist', 'Albtraum');
  }
  if (b.pst.burn) await hurtPlayer(Math.round(stats.hp * c.burnTick * 0.5), 'Verbrennung');
  if (b.pst.poison) await hurtPlayer(Math.round(stats.hp * c.poisonTick * 0.5 * b.pst.poison), 'Gift');
  if (g(mods, 'regen') > 0 && run.hp > 0) await heal(stats.hp * g(mods, 'regen'), mods, 'Regeneration');
  b.energy = Math.min(D.B.energy.max, b.energy + D.B.energy.perTurn + Math.round(g(mods, 'energyGain')));
  b.turn++;
}

export const battleWon = () => B() && !alive().length;
export const battleLost = () => run.hp <= 0;
