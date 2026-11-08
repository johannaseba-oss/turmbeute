// Detail-Sheets: Item, Team-Pokémon, Trainer-Ausrüstung, Typ-Stacks, Werte.
import { D, mon, itemDef, portraitUrl, itemIconUrl, typeColor, rarityColor, rarityName } from '../data.js';
import { computeStats, equipOps, itemStacks, opText, STAT_NAME, STATS, monPerk, monShare, g } from '../mods.js';
import { run, salvageGain, sellPrice, canEquipOn, itemPrice } from '../run.js';
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
  const eq = [...Object.entries(itemStacks(inst)).map(([t, n]) => `+${n} ${t}-Stacks`), ...equipOps(inst).map(opText)];
  if (def.tm) eq.push(`An Pokémon: Einsatz-Attacke wird ${def.tm.name}`);
  if (def.kind === 'stone') eq.push('An passendes Pokémon: sofortige Entwicklung');
  const us = useLines(inst);
  return h('ul.fx',
    def.desc ? li(def.desc) : null,
    eq.length ? [li('Anlegen', 'h'), ...eq.map((t) => li(t))] : null,
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

// --- Item im Inventar ----------------------------------------------------------
export function itemSheet(idx) {
  const inst = run.inv[idx];
  if (!inst) return;
  const def = itemDef(inst.id), b = B();
  const btns = [];
  if (run.phase === 'battle' && b) {
    if (def.kind === 'ball') {
      const e = alive().find((x) => x.uid === b.targetUid) || alive()[0];
      if (e) {
        const p = catchChance(e, inst);
        btns.push(h('button.btn.pri', { onclick: () => { closeSheet(); G.act('ball', { idx }); } }, `Werfen auf ${e.name}`, h('small', `Fangchance ${p >= 1 ? '100' : (p * 100).toFixed(p < 0.1 ? 1 : 0)} %`)));
      }
    } else if (useEffect(inst) && !def.restOnly) btns.push(h('button.btn.purple', { onclick: () => { closeSheet(); G.act('item', { idx }); } }, 'Verbrauchen', h('small', 'kostet die Aktion')));
    btns.push(h('button.btn', { onclick: closeSheet }, 'Zurück'));
  } else {
    if (canEquipOn(inst, 'mon') || canEquipOn(inst, 'trainer')) btns.push(h('button.btn.pri', { onclick: () => equipPicker(idx) }, 'Anlegen'));
    if (def.kind === 'candy') btns.push(h('button.btn.pri', { onclick: () => candyPicker(idx) }, 'Benutzen'));
    btns.push(h('button.btn.purple', { onclick: () => { closeSheet(); G.salvage(idx); } }, 'Zerlegen', h('small', 'permanente Werte')));
    if (run.phase === 'rest') btns.push(h('button.btn.gold', { onclick: () => { closeSheet(); G.sell(idx); } }, `Verkaufen`, h('small', `+${sellPrice(inst)} Gold`)));
    btns.push(h('button.btn.warn', { onclick: () => { closeSheet(); G.discard(idx); } }, 'Wegwerfen'));
  }
  openSheet(itemHead(inst), itemInfo(inst), h('div.btns', btns));
}

function equipPicker(idx) {
  const inst = run.inv[idx];
  const def = itemDef(inst.id);
  const targets = run.team.map((m, i) => {
    const sp = mon(m.dex);
    const evo = def.kind === 'stone' && sp.evos.find((e) => e.stone === def.stone);
    return h('button.btn', { onclick: () => { closeSheet(); G.equip(idx, { mon: i }); } },
      h('img', { src: portraitUrl(m.dex), style: { width: '28px', height: '28px', imageRendering: 'pixelated', verticalAlign: 'middle', marginRight: '6px' } }),
      sp.name, h('small', evo ? `✨ entwickelt sich zu ${mon(evo.to).name}` : m.held ? `ersetzt ${itemDef(m.held.id).name}` : 'frei'));
  });
  if (canEquipOn(inst, 'trainer')) run.trainerEq.forEach((t, i) => targets.push(h('button.btn', { onclick: () => { closeSheet(); G.equip(idx, { trainer: i }); } }, `Trainer-Platz ${i + 1}`, h('small', t ? `ersetzt ${itemDef(t.id).name}` : 'frei'))));
  openSheet(itemHead(inst), h('div.hint', 'Wo anlegen?'), h('div.btns', targets, h('button.btn', { onclick: () => itemSheet(idx) }, 'Zurück')));
}
function candyPicker(idx) {
  openSheet(itemHead(run.inv[idx]), h('div.hint', 'Welches Pokémon?'), h('div.btns', run.team.map((m, i) => h('button.btn', { onclick: () => { closeSheet(); G.candy(idx, i); } }, mon(m.dex).name, h('small', `Lv ${m.level}`)))));
}

// --- Team-Pokémon --------------------------------------------------------------
export function monSheet(i) {
  const m = run.team[i];
  if (!m) return;
  const sp = mon(m.dex), perk = monPerk(m.dex), share = monShare(run, m, i), mv = monMove(m);
  const b = B(), inBattle = run.phase === 'battle' && b;
  const st = D.stacks;
  const btns = [];
  if (inBattle) {
    btns.push(h('button.btn.pri', { disabled: m.used || b.busy, onclick: () => { closeSheet(); G.act('mon', { idx: i }); } }, 'Einsetzen', h('small', m.used ? 'erschöpft bis nächster Floor' : `${mv.name} (${mv.type})`)));
    btns.push(h('button.btn.warn', { disabled: run.team.length <= 1 || b.busy, onclick: () => confirmSac(i) }, 'Opfern', h('small', 'massiver Floor-Boost')));
    if (i > 0) btns.push(h('button.btn', { disabled: b.busy, onclick: () => { closeSheet(); G.act('lead', { idx: i }); } }, 'Als Anführer', h('small', 'kostet die Aktion')));
  } else {
    if (i > 0) btns.push(h('button.btn.pri', { onclick: () => { closeSheet(); G.setLead(i); } }, 'Als Anführer'));
    if (m.held) btns.push(h('button.btn', { onclick: () => { closeSheet(); G.unequip({ mon: i }); } }, 'Item abnehmen'));
    if (run.team.length > 1) btns.push(h('button.btn.warn', { onclick: () => confirmRelease(i) }, 'Freilassen'));
  }
  btns.push(h('button.btn', { onclick: closeSheet }, 'Zurück'));
  const evo = sp.evos.map((e) => `${mon(e.to).name} (${e.level ? 'Lv ' + e.level : itemDef(e.stone)?.name || e.stone})`).join(', ');
  openSheet(
    h('div.sh-head', h('div.big', h('img.px', { src: portraitUrl(m.dex) })),
      h('div', h('h3', sp.name + (i === 0 ? ' ♛' : '')), h('div.sub', `Lv ${m.level}${sp.legendary ? ' · Legendär' : ''}`), h('div', ...sp.types.map(tchip)))),
    h('ul.fx',
      li('Passiv', 'h'),
      li(sp.types.map((t, k) => `+${k === 0 ? st.mainType : st.subType} ${t}-Stacks`).join(', ')),
      li('Fähigkeit: ' + opText(perk), 'on'),
      li('Werte-Anteil' + (i === 0 ? ' (Anführer ×' + D.B.leadShare + ')' : ''), 'h'),
      li(STATS.map((s) => `${STAT_NAME[s]} +${Math.round(share[s])}`).join(' · ')),
      li('Einsetzen', 'h'), li(`${mv.name} · ${mv.type} · Stärke ${Math.round(mv.power * 60)}`),
      i === 0 ? li(`Anführer: Angriff neutral mit ${sp.types[0]}-Boni, Spezial = ${sp.move.name} (${sp.move.type})`) : null,
      evo ? [li('Entwicklung', 'h'), li(evo)] : null,
      m.held ? [li('Trägt', 'h'), li(`${itemDef(m.held.id).name}: ` + [...Object.entries(itemStacks(m.held)).map(([t, n]) => `+${n} ${t}`), ...equipOps(m.held).map(opText)].join(', '))] : null),
    h('div.btns', btns));
}
function confirmSac(i) {
  const m = run.team[i], sp = mon(m.dex), S = D.B.sacrifice;
  openSheet(h('h3', `${sp.name} opfern?`), h('ul.fx',
    li(`Für diesen Floor: +${Math.round(S.floorAllPct * 100)} % alle Werte`),
    li(`+${S.stackMult}× seine Typ-Stacks (${sp.types.join(', ')}) für den Floor`),
    li(`Permanent: +${S.affinity} Affinität für ${sp.types.join(', ')}`),
    li(`Heilt ${S.healPct * 100} % KP`), li('Das Pokémon verlässt das Team für immer.', 'off')),
  h('div.btns', h('button.btn.warn', { onclick: () => { closeSheet(); G.act('sacrifice', { idx: i }); } }, 'Opfern'), h('button.btn', { onclick: () => monSheet(i) }, 'Abbrechen')));
}
function confirmRelease(i) {
  const sp = mon(run.team[i].dex);
  openSheet(h('h3', `${sp.name} freilassen?`), h('div.btns', h('button.btn.warn', { onclick: () => { closeSheet(); G.release(i); } }, 'Freilassen'), h('button.btn', { onclick: () => monSheet(i) }, 'Abbrechen')));
}

export function gearSheet(i) {
  const inst = run.trainerEq[i];
  if (!inst) return openSheet(h('h3', `Trainer-Platz ${i + 1}`), h('div.hint', 'Ziehe ein Item hierher oder tippe ein Item im Inventar → Anlegen. Trainer-Plätze tragen Items, die nicht an ein Pokémon gebunden sind.'), h('div.btns', h('button.btn', { onclick: closeSheet }, 'OK')));
  const btns = [h('button.btn', { onclick: closeSheet }, 'Zurück')];
  if (run.phase !== 'battle') btns.unshift(h('button.btn.pri', { onclick: () => { closeSheet(); G.unequip({ trainer: i }); } }, 'Abnehmen'));
  openSheet(itemHead(inst), itemInfo(inst), h('div.btns', btns));
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
  openSheet(h('h3', 'Typ-Stacks'), h('div.hint', 'Stacks kommen von Team-Pokémon (Haupttyp +2, Zweittyp +1), angelegten Items und Floor-Boni. Affinität aus dem Zerlegen verstärkt alle Effekte eines Typs. Verbrauchst du ein Typ-Item, zündet eine aktive Synergie dieses Typs zusätzlich.'),
    rows.length ? rows : h('div.hint', 'Noch keine Stacks.'), h('ul.fx', li('Synergien', 'h'), ...syn), h('div.btns', h('button.btn', { onclick: closeSheet }, 'Schließen')));
}

export function statsSheet() {
  const { stats, mods } = computeStats(run, B()?.buffs || []);
  const perm = STATS.map((s) => `${STAT_NAME[s]} +${run.perm[s] || 0}`).join(' · ');
  const aff = Object.entries(run.aff).filter(([, v]) => v).map(([t, v]) => `${t} ${v}`).join(' · ') || '–';
  const ks = run.keystones.map((id) => D.keystones.find((k) => k.id === id)).filter(Boolean);
  const keys = ['dmgPct', 'crit', 'evasion', 'lifesteal', 'regen', 'dmgTaken', 'chain', 'doubleHit', 'gold', 'catch'].filter((k) => g(mods, k)).map((k) => opText({ op: k, v: mods[k] }));
  openSheet(h('h3', 'Deine Werte'), h('ul.fx',
    li(STATS.map((s) => `${STAT_NAME[s]} ${fmt(stats[s])}`).join(' · ')),
    keys.length ? [li('Boni', 'h'), ...keys.map((t) => li(t))] : null,
    li('Zerlegt (permanent)', 'h'), li(perm), li('Affinität', 'h'), li(aff),
    ks.length ? [li('Keystones', 'h'), ...ks.map((k) => li(`${k.name}: ${k.text}`, 'on'))] : null,
    li('Lauf', 'h'), li(`Besiegt ${run.stats.kills} · Gefangen ${run.stats.caught} · Zerlegt ${run.stats.salvaged}`)),
  h('div.btns', h('button.btn', { onclick: closeSheet }, 'Schließen')));
}
