// Detail-Sheets: Item, Team-Pokémon (Werte, EP, Items), Typ-Stacks, Werte.
import { D, mon, itemDef, portraitUrl, itemIconUrl, typeColor, rarityColor, rarityName } from '../data.js';
import { computeStats, equipOps, itemStacks, opText, STAT_NAME, STATS, monPerk, g, heldOf, heldSlots, expFor } from '../mods.js';
import { run, salvageGain, sellPrice, canEquip, itemPrice, fixHp, mergeTargets, mergeResult } from '../run.js';
import { B, alive, catchChance, useEffect, monMove, specialCost } from '../combat.js';
import { h, openSheet, closeSheet, fmt } from './dom.js';
import { G } from '../game.js';

const tchip = (t) => h('span.tchip', { style: { background: typeColor(t) } }, t);
const li = (txt, cls) => h('li', { class: cls || '' }, txt);

function useLines(inst) {
  const def = itemDef(inst.id), u = useEffect(inst);
  if (!u) return [];
  const out = [];
  if (u.text) out.push(u.text);
  if (u.heal) out.push(`Heilt ${Math.round(u.heal * 100)} % KP`);
  if (u.cure) out.push('Heilt Status');
  if (u.energy) out.push(`+${u.energy} Energie`);
  if (u.buffs && !u.text) out.push(u.buffs.map(opText).join(', ') + ' (Kampf)');
  if (u.attack) out.push(`${u.attack.type}-Attacke${u.attack.all ? ' auf alle' : ''}`);
  if (def.trigger === 'lowHp') out.push('Angelegt: löst bei unter 50 % KP automatisch aus');
  if (def.trigger === 'status') out.push('Angelegt: löst bei Status automatisch aus');
  return out;
}
export function gainText(gn) {
  const parts = [...Object.entries(gn.stats).map(([s, v]) => `+${v} ${STAT_NAME[s]}`), ...Object.entries(gn.aff).map(([t, v]) => `+${v} ${t}-Affinität`)];
  if (gn.gold) parts.push(`+${gn.gold} Gold`);
  return parts.join(' · ');
}

export function itemHead(inst) {
  const def = itemDef(inst.id), r = inst.r || def.rarity;
  return h('div.sh-head',
    h('div.big', h('img', { src: itemIconUrl(inst.id) })),
    h('div', h('h3', { style: { color: rarityColor(r) } }, def.name + (inst.n > 1 ? ` ×${inst.n}` : '')),
      h('div.sub', `${rarityName(r)} · Stufe ${inst.lvl || 1}`),
      h('div', ...Object.keys(itemStacks(inst)).map(tchip))));
}
export function itemInfo(inst) {
  const def = itemDef(inst.id);
  const eq = [...Object.entries(itemStacks(inst)).map(([t, n]) => li(`+${n} ${t}-Stacks`, 'plus')), ...equipOps(inst).map((o) => li(opText(o), opClass(o)))];
  if (def.tm) eq.push(li(`An Pokémon: Einsatz-Attacke wird ${def.tm.name}`));
  if (def.kind === 'stone') eq.push(li('An passendes Pokémon: sofortige Entwicklung'));
  const us = useLines(inst);
  return h('ul.fx',
    def.desc ? li(def.desc) : null,
    eq.length ? [li('Anlegen', 'h'), ...eq] : null,
    us.length ? [li('Verbrauchen', 'h'), ...us.map((t) => li(t))] : null,
    def.kind === 'ball' ? li(ballText(def)) : null,
    li('Zerlegen', 'h'), li(gainText(salvageGain(inst)), 'on'));
}
function ballText(def) {
  const c = def.catch;
  if (c.sure) return 'Fängt immer.';
  const p = [`Fang-Multiplikator ×${c.mult}`];
  if (c.types) p.push(`×${c.bonus} gegen ${c.types.join('/')}`);
  if (c.fast) p.push(`×${c.bonus} gegen schnelle Pokémon`);
  return p.join(', ');
}

// Beschriftung eines Aufwertungs-Ziels: "mit deinem X (bei Glumanda) → Selten · St. 4"
export function mergeLabel(src, t) {
  const r = mergeResult(src, t.item), where = t.mon != null ? ` an ${mon(run.team[t.mon].dex).name}` : '';
  return `mit deinem${where} (St. ${t.item.lvl}) → ${rarityName(r.r)} · St. ${r.lvl}`;
}
// Inhalt für den Hover-Tooltip (Maus): Kopf, Effekte, Aufwertung
export function itemTip(inst, extra = null) {
  const t = mergeTargets(inst)[0];
  return [itemHead(inst), extra ? h('div.tipx', extra) : null, itemInfo(inst), t ? h('div.tipup', '↑ Aufwertbar ' + mergeLabel(inst, t)) : null];
}

// Werte eines Pokémon mit dem Anteil, den seine Items beisteuern (grünes Plus)
function statRow(m, extra = []) {
  const full = computeStats(run, extra, m).stats;
  const held = m.held;
  m.held = [];
  const bare = computeStats(run, extra, m).stats;
  m.held = held;
  return h('li.stats', ...STATS.map((st) => {
    const d = full[st] - bare[st];
    return h('span.st', `${STAT_NAME[st]} ${fmt(full[st])}`, d > 0 ? h('b.plus', ` +${fmt(d)}`) : d < 0 ? h('b.minus', ` ${fmt(d)}`) : null);
  }));
}
// Vorteil grün, Nachteil rot (bei manchen Ops ist ein negativer Wert gut)
const GOOD_NEG = new Set(['dmgTaken', 'enemyAtk', 'enemySpe', 'specialCost']);
const opClass = (o) => ((o.v < 0) !== GOOD_NEG.has(o.op) ? 'minus' : 'plus');

// --- Item im Inventar ----------------------------------------------------------
export function itemSheet(idx) {
  const inst = run.inv[idx];
  if (!inst) return;
  const def = itemDef(inst.id), b = B();
  const btns = [];
  if (run.phase === 'battle' && b) {
    if (def.kind === 'ball') {
      const e = alive().find((x) => x.uid === b.targetUid) || alive()[0];
      if (e?.trainer) btns.push(h('button.btn', { disabled: true }, 'Nicht fangbar', h('small', 'gehört einem Trainer')));
      else if (e) {
        const p = catchChance(e, inst);
        btns.push(h('button.btn.pri', { onclick: () => { closeSheet(); G.act('ball', { idx }); } }, `Werfen auf ${e.name}`, h('small', `Fangchance ${p >= 1 ? '100' : (p * 100).toFixed(p < 0.1 ? 1 : 0)} %`)));
      }
    } else if (useEffect(inst) && !def.restOnly) btns.push(h('button.btn.purple', { onclick: () => { closeSheet(); G.act('item', { idx }); } }, 'Verbrauchen', h('small', 'kostet die Aktion')));
    btns.push(h('button.btn', { onclick: closeSheet }, 'Zurück'));
  } else {
    for (const t of mergeTargets(inst, idx).slice(0, 2)) btns.push(h('button.btn.purple', { onclick: () => { closeSheet(); G.merge(idx, t); } }, '↑ Aufwerten', h('small', mergeLabel(inst, t))));
    if (canEquip(inst)) btns.push(h('button.btn.pri', { onclick: () => equipPicker(idx) }, 'Anlegen'));
    if (def.kind === 'potion' && def.use?.heal) btns.push(h('button.btn.pri', { onclick: () => monPicker(idx, (i) => G.useOn(idx, i)) }, 'Benutzen'));
    if (def.kind === 'candy') btns.push(h('button.btn.pri', { onclick: () => candyPicker(idx) }, 'Benutzen'));
    btns.push(h('button.btn.purple', { onclick: () => { closeSheet(); G.salvage(idx); } }, 'Zerlegen', h('small', 'permanente Werte')));
    btns.push(h('button.btn.gold', { onclick: () => { closeSheet(); G.sell(idx); } }, `Verkaufen`, h('small', `+${sellPrice(inst)} Gold`)));
    btns.push(h('button.btn.warn', { onclick: () => { closeSheet(); G.discard(idx); } }, 'Wegwerfen'));
  }
  openSheet(itemHead(inst), itemInfo(inst), h('div.btns', btns));
}

function equipPicker(idx) {
  const inst = run.inv[idx];
  const def = itemDef(inst.id), max = heldSlots(run);
  const targets = run.team.map((m, i) => {
    const sp = mon(m.dex);
    const evo = def.kind === 'stone' && sp.evos.find((e) => e.stone === def.stone);
    const n = heldOf(m).length;
    return h('button.btn', { onclick: () => { closeSheet(); G.equip(idx, i); } },
      h('img', { src: portraitUrl(m.dex), style: { width: '28px', height: '28px', imageRendering: 'pixelated', verticalAlign: 'middle', marginRight: '6px' } }),
      sp.name, h('small', evo ? `✨ entwickelt sich zu ${mon(evo.to).name}` : heldOf(m).some((x) => x.id === inst.id) && ['held', 'gem', 'tm'].includes(def.kind) ? '↑ wertet sein gleiches Item auf' : `${n}/${max} Items${n >= max ? ' – ersetzt eins' : ''}`));
  });
  openSheet(itemHead(inst), h('div.hint', 'An welches Pokémon? Items wirken für ihren Träger, Typ-Stacks fürs ganze Team.'), h('div.btns', targets, h('button.btn', { onclick: () => itemSheet(idx) }, 'Zurück')));
}
function monPicker(idx, pick) {
  openSheet(itemHead(run.inv[idx]), h('div.hint', 'Welches Pokémon?'), h('div.btns', run.team.map((m, i) => {
    const max = fixHp(m);
    return h('button.btn', { disabled: m.fainted, onclick: () => { closeSheet(); pick(i); } }, mon(m.dex).name, h('small', m.fainted ? 'K.O.' : `KP ${m.hp}/${max}`));
  })));
}
function candyPicker(idx) {
  openSheet(itemHead(run.inv[idx]), h('div.hint', 'Welches Pokémon?'), h('div.btns', run.team.map((m, i) => h('button.btn', { onclick: () => { closeSheet(); G.candy(idx, i); } }, mon(m.dex).name, h('small', `Lv ${m.level}`)))));
}

// --- Team-Pokémon --------------------------------------------------------------
export function monSheet(i) {
  const m = run.team[i];
  if (!m) return;
  const sp = mon(m.dex), perk = monPerk(m.dex), mv = monMove(m), { stats } = computeStats(run, [], m), max = fixHp(m);
  const e0 = expFor(sp.growth, m.level), e1 = expFor(sp.growth, m.level + 1);
  const b = B(), inBattle = run.phase === 'battle' && b;
  const st = D.stacks;
  const btns = [];
  if (inBattle) {
    btns.push(h('button.btn.pri', { disabled: m.used || m.fainted || b.busy, onclick: () => { closeSheet(); G.act('mon', { idx: i }); } }, 'Einsetzen', h('small', m.used ? 'erschöpft bis zur nächsten Rast' : `${mv.name} (${mv.type})`)));
    btns.push(h('button.btn.warn', { disabled: run.team.length <= 1 || b.busy, onclick: () => confirmSac(i) }, 'Opfern', h('small', 'massiver Boost bis zur Rast')));
    if (i > 0) btns.push(h('button.btn', { disabled: b.busy || m.fainted, onclick: () => { closeSheet(); G.act('lead', { idx: i }); } }, 'Als Anführer', h('small', 'kostet die Aktion')));
  } else {
    if (i > 0) btns.push(h('button.btn.pri', { disabled: m.fainted, onclick: () => { closeSheet(); G.setLead(i); } }, 'Als Anführer'));
    if (run.team.length > 1) btns.push(h('button.btn.warn', { onclick: () => confirmRelease(i) }, 'Freilassen'));
  }
  btns.push(h('button.btn', { onclick: closeSheet }, 'Zurück'));
  const evo = sp.evos.map((e) => `${mon(e.to).name} (${e.level ? 'Lv ' + e.level : itemDef(e.stone)?.name || e.stone})`).join(', ');
  openSheet(
    h('div.sh-head', h('div.big', h('img.px', { src: portraitUrl(m.dex) })),
      h('div', h('h3', sp.name + (i === 0 ? ' ♛' : '')), h('div.sub', `Lv ${m.level} · KP ${m.fainted ? 'K.O.' : m.hp + '/' + max} · EP ${m.exp - e0}/${e1 - e0}${sp.legendary ? ' · Legendär' : ''}`), h('div', ...sp.types.map(tchip)))),
    heldPanel(m, i),
    h('ul.fx',
      li('Passiv', 'h'),
      li(sp.types.map((t, k) => `+${k === 0 ? st.mainType : st.subType} ${t}-Stacks`).join(', ')),
      li('Fähigkeit: ' + opText(perk), 'on'),
      li('Werte (grün = durch Items)', 'h'),
      statRow(m),
      li('Spezial / Einsetzen', 'h'), li(`${mv.name} · ${mv.type} · Stärke ${Math.round(mv.power * 60)}`),
      evo ? [li('Entwicklung', 'h'), li(evo)] : null,
      ...heldOf(m).map((it) => h('li', `${itemDef(it.id).name}: `, ...Object.entries(itemStacks(it)).map(([t, n]) => h('span.plus', `+${n} ${t}  `)), ...equipOps(it).map((o) => h('span', { class: opClass(o) }, opText(o) + '  '))))),
    h('div.btns', btns));
}
function confirmSac(i) {
  const m = run.team[i], sp = mon(m.dex), S = D.B.sacrifice;
  openSheet(h('h3', `${sp.name} opfern?`), h('ul.fx',
    li(`Bis zur nächsten Rast: +${Math.round(S.floorAllPct * 100)} % alle Werte`),
    li(`+${S.stackMult}× seine Typ-Stacks (${sp.types.join(', ')}) bis zur nächsten Rast`),
    li(`Permanent: +${S.affinity} Affinität für ${sp.types.join(', ')}`),
    li(`Heilt ${S.healPct * 100} % KP`), li('Das Pokémon verlässt das Team für immer.', 'off')),
  h('div.btns', h('button.btn.warn', { onclick: () => { closeSheet(); G.act('sacrifice', { idx: i }); } }, 'Opfern'), h('button.btn', { onclick: () => monSheet(i) }, 'Abbrechen')));
}
function confirmRelease(i) {
  const sp = mon(run.team[i].dex);
  openSheet(h('h3', `${sp.name} freilassen?`), h('div.btns', h('button.btn.warn', { onclick: () => { closeSheet(); G.release(i); } }, 'Freilassen'), h('button.btn', { onclick: () => monSheet(i) }, 'Abbrechen')));
}

// Item-Plätze des Pokémon: antippen = abnehmen (außerhalb des Kampfes)
function heldPanel(m, i) {
  const max = heldSlots(run), canEdit = run.phase !== 'battle';
  return h('div.heldrow', ...Array.from({ length: max }, (_, k) => {
    const it = heldOf(m)[k];
    if (!it) return h('div.slot.empty');
    return h('div.slot.item', { '--rc': rarityColor(it.r), onclick: () => { if (!canEdit) return; closeSheet(); G.unequip(i, k); } },
      h('img.icon', { src: itemIconUrl(it.id) }), h('span.lv', 'St.' + it.lvl));
  }), h('div.hint', canEdit ? 'Item antippen = abnehmen' : 'Im Kampf nicht änderbar'));
}

// --- Stacks-Übersicht ---------------------------------------------------------------
export function stacksSheet() {
  const { stacks, active } = computeStats(run, B()?.buffs || []);
  const S = D.stacks;
  const rows = Object.entries(stacks).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([t, n]) => {
    const cfg = S.types[t], aff = run.aff[t] || 0, k = 1 + S.affinityPct * aff;
    return h('div', { style: { margin: '8px 0', padding: '8px', background: '#14112a', borderRadius: '8px', borderLeft: `4px solid ${typeColor(t)}` } },
      h('div', { style: { fontWeight: 700 } }, `${t} · ${n} Stacks`, aff ? h('span.gain', `  Affinität ${aff} (×${k.toFixed(2)})`) : null),
      h('ul.fx', ...cfg.per.map((o) => li(opText({ ...o, v: o.v * n * k }))), ...cfg.tiers.map((tr) => li(`${tr.at}: ${tr.text}`, n >= tr.at ? 'on' : 'off'))));
  });
  const syn = S.synergies.map((s) => li(`${s.name} (${s.types.map((t) => t + ' ' + s.min).join(' + ')}): ${s.text}`, active.synergies.includes(s) ? 'on' : 'off'));
  openSheet(h('h3', 'Typ-Stacks'), h('div.hint', 'Stacks kommen von Team-Pokémon (Haupttyp +2, Zweittyp +1), angelegten Items und Boni bis zur nächsten Rast. Affinität aus dem Zerlegen verstärkt alle Effekte eines Typs. Verbrauchst du ein Typ-Item, zündet eine aktive Synergie dieses Typs zusätzlich.'),
    rows.length ? rows : h('div.hint', 'Noch keine Stacks.'), h('ul.fx', li('Synergien', 'h'), ...syn), h('div.btns', h('button.btn', { onclick: closeSheet }, 'Schließen')));
}

export function statsSheet() {
  const { stats, mods } = computeStats(run, B()?.buffs || []);
  const perm = STATS.map((s) => `${STAT_NAME[s]} +${run.perm[s] || 0}`).join(' · ');
  const aff = Object.entries(run.aff).filter(([, v]) => v).map(([t, v]) => `${t} ${v}`).join(' · ') || '–';
  const ks = run.keystones.map((id) => D.keystones.find((k) => k.id === id)).filter(Boolean);
  const keys = ['dmgPct', 'crit', 'evasion', 'lifesteal', 'regen', 'dmgTaken', 'chain', 'doubleHit', 'gold', 'catch'].filter((k) => g(mods, k)).map((k) => opText({ op: k, v: mods[k] }));
  openSheet(h('h3', 'Deine Werte'), h('ul.fx',
    li(`${mon(run.team[0].dex).name} (Anführer) – grün = durch Items`, 'h'),
    statRow(run.team[0], B()?.buffs || []),
    keys.length ? [li('Boni', 'h'), ...keys.map((t) => li(t))] : null,
    li('Zerlegt (permanent)', 'h'), li(perm), li('Affinität', 'h'), li(aff),
    ks.length ? [li('Keystones', 'h'), ...ks.map((k) => li(`${k.name}: ${k.text}`, 'on'))] : null,
    li('Lauf', 'h'), li(`Besiegt ${run.stats.kills} · Gefangen ${run.stats.caught} · Zerlegt ${run.stats.salvaged}`)),
  h('div.btns', h('button.btn', { onclick: closeSheet }, 'Schließen')));
}
