// Immer sichtbare Teile: Kopfzeile, Anführer-Leiste, Aktionen, Typ-Stacks, Team (mit Items), Inventar.
import { D, mon, itemDef, portraitUrl, itemIconUrl, typeColor, rarityColor } from '../data.js';
import { computeStats, g, heldOf, heldSlots, expFor } from '../mods.js';
import { run, ensureInv, fixHp } from '../run.js';
import * as R from '../run.js';
import { B, specialCost, leadMoves, alive, areaCost } from '../combat.js';
import { STATUS_ICON } from '../gfx/stage.js';
import { $, h, fmt } from './dom.js';
import { G } from '../game.js';
import { itemSheet, monSheet, stacksSheet, statsSheet } from './sheets.js';
import { startDrag } from './drag.js';
import { attachTip, hideTip } from './tip.js';
import { itemTip } from './sheets.js';

export function renderHud() {
  if (!run) return;
  hideTip();
  ensureInv();
  const { stats, mods, stacks, active } = computeStats(run, B()?.buffs || []);
  const b = B();
  // Kopf
  const kind = R.fightKind(), N = D.B.areal.fights;
  const sub = run.phase === 'rest' || run.phase === 'keystone' ? 'Rast' : kind === 'trainer' ? `Kampf ${run.fight}/${N} · Trainer` : kind === 'legend' ? `Kampf ${run.fight}/${N} · Legendär` : `Kampf ${Math.max(1, run.fight)}/${N}`;
  $('#floorinfo').replaceChildren(h('span', `Areal ${run.areal}`), h('small', sub));
  $('#gold').textContent = fmt(run.gold);
  // Anführer
  const L = run.team[0];
  fixHp(L);
  const hpK = Math.max(0, L.hp / stats.hp), shK = b ? Math.min(1, b.shield / stats.hp) : 0;
  const pst = b ? Object.keys(b.pst).filter((k) => b.pst[k]).map((k) => STATUS_ICON[k]).join(' ') : '';
  const gr = mon(L.dex).growth, e0 = expFor(gr, L.level), e1 = expFor(gr, L.level + 1);
  $('#player').replaceChildren(
    h('img.lead', { src: portraitUrl(L.dex), onclick: () => monSheet(0) }),
    h('div.bars',
      h('div.leadname', h('b', mon(L.dex).name), ` Lv ${L.level}`),
      h('div.bar', h('i', { style: { width: hpK * 100 + '%' } }), h('b', { style: { width: shK * 100 + '%' } }), h('span', `${fmt(L.hp)} / ${fmt(stats.hp)}${b?.shield ? '  🛡' + fmt(b.shield) : ''}`)),
      h('div.xp', h('i', { style: { width: Math.min(100, ((L.exp - e0) / Math.max(1, e1 - e0)) * 100) + '%' } })),
      h('div.statline', { onclick: () => statsSheet() },
        ...[['ANG', 'atk'], ['ABW', 'def'], ['SP.A', 'spa'], ['SP.V', 'spd'], ['INIT', 'spe']].map(([n, k]) => h('span', n + ' ', h('b', fmt(stats[k])))),
        pst ? h('span.pst', pst) : null)),
  );
  renderActions(b);
  // Stacks
  const chips = Object.entries(stacks).filter(([, n]) => n > 0).sort((a, c) => c[1] - a[1]).map(([t, n]) => {
    const tier = active.tiers.some((x) => x.type === t);
    return h('span.chip', { class: 'chip' + (tier ? ' tier' : ''), style: { background: typeColor(t), color: typeColor(t) }, onclick: () => stacksSheet() }, h('span', { style: { color: '#fff' } }, `${t} ${n}`));
  });
  for (const s of active.synergies) chips.unshift(h('span.chip.syn', { onclick: () => stacksSheet() }, '✦ ' + s.name));
  if (!chips.length) chips.push(h('span.chip.muted', { style: { background: '#333' }, onclick: () => stacksSheet() }, 'Keine Typ-Stacks'));
  $('#stacks').replaceChildren(...chips);
  renderTeam();
  renderBag();
}

function renderActions(b) {
  const a = $('#actions');
  if (run.phase !== 'battle' || !b) {
    const label = { loot: 'Weiter', rest: run.fight >= D.B.areal.fights ? `Weiter zu Areal ${run.areal + 1}` : `Weiter zu Kampf ${run.fight + 1}`, keystone: 'Keystone wählen' }[run.phase];
    a.replaceChildren(label ? h('button.wide', { onclick: () => G.next(), disabled: run.phase === 'keystone' }, label) : '');
    return;
  }
  const mv = leadMoves(), cost = specialCost(), busy = b.busy, max = D.B.energy.max;
  const gain = D.B.energy.perTurn + Math.round(g(computeStats(run).mods, 'energyGain'));
  const energy = h('div.energyrow', h('span.elabel', 'Energie'),
    h('div.energy', ...Array.from({ length: max }, (_, i) => h('i', { class: (i < b.energy ? 'on' : '') + (i < cost ? ' need' : '') }))),
    h('span.etext', `${b.energy}/${max} · +${gain} pro Runde`));
  // Zielwahl läuft: Hinweis statt Knöpfen
  if (G.aim) {
    const n = alive().length, all = G.aim.all;
    a.replaceChildren(energy, h('div.aimbar', { class: 'aimbar' + (all ? ' all' : '') },
      h('div.aimtext', all ? h('b', `✸ Fläche: trifft alle ${n} Gegner`) : h('b', '🎯 Ziel wählen'), h('small', all ? 'Tippe auf die Gegner oder „Los“' : 'Tippe auf den Gegner, den du angreifen willst')),
      all ? h('button.go', { onclick: () => G.confirmAim() }, '✔ Los') : null,
      h('button.cancel', { onclick: () => G.cancelAim() }, 'Abbrechen')));
    return;
  }
  const btn = (cls, icon, name, sub, onclick, disabled) => h('button', { class: cls, onclick, disabled }, h('span.bt', h('i', icon), h('span', name)), h('small', sub));
  a.replaceChildren(energy, h('div.actgrid',
    btn('main', '⚔', 'Angriff', 'Einzelziel · kostenlos', () => G.aimOrAct('attack'), busy),
    btn('spec', '✦', mv.special.name, `Einzelziel · ${mv.special.type} · ${cost}⚡`, () => G.aimOrAct('special'), busy || b.energy < cost),
    btn('area', '✸', 'Rundumschlag', `FLÄCHE · alle Gegner · ${areaCost()}⚡`, () => G.aimOrAct('area'), busy || b.energy < areaCost()),
    btn('wait', '⏳', 'Warten', '+1⚡ · etwas Heilung', () => G.act('wait'), busy)));
}

export function renderTeam() {
  const max = D.B.teamMax;
  const slots = [];
  for (let i = 0; i < max; i++) {
    const m = run.team[i];
    if (!m) { slots.push(h('div.slot.empty', { 'data-drop': 'team', 'data-i': i })); continue; }
    const sp = mon(m.dex), max = fixHp(m), slotsN = heldSlots(run);
    const el = h('div.slot.mon', { class: 'slot mon' + (i === 0 ? ' lead' : '') + (m.used ? ' used' : '') + (m.fainted ? ' ko' : ''), 'data-drop': 'mon', 'data-i': i, onclick: () => monSheet(i) },
      h('img.por', { src: portraitUrl(m.dex) }),
      h('span.lv', 'Lv' + m.level),
      h('div.types', ...sp.types.map((t) => h('i', { style: { background: typeColor(t) } }))),
      h('div.helds', ...Array.from({ length: slotsN }, (_, k) => {
        const it = heldOf(m)[k];
        if (!it) return h('i.free');
        const el = h('i', { style: { '--rc': rarityColor(it.r) } }, h('img', { src: itemIconUrl(it.id) }));
        attachTip(el, () => itemTip(it));
        return el;
      })),
      h('div.mhp', h('i', { style: { width: (m.hp / max) * 100 + '%' } })));
    slots.push(el);
  }
  $('#team').replaceChildren(...slots);
}

export function itemSlot(inst, attrs = {}) {
  if (!inst) return h('div.slot.empty', attrs);
  const def = itemDef(inst.id);
  return h('div.slot.item', { ...attrs, '--rc': rarityColor(inst.r || def.rarity) },
    h('img.icon', { src: itemIconUrl(inst.id), draggable: 'false' }),
    def.stack > 1 ? (inst.n > 1 ? h('span.n', '×' + inst.n) : null) : h('span.lv', 'St.' + inst.lvl),
    def.stacks ? h('div.dots', ...Object.keys(def.stacks).map((t) => h('i', { style: { background: typeColor(t) } }))) : null);
}

export function renderBag() {
  $('#gear').replaceChildren(h('span.label', `Inventar ${run.inv.filter(Boolean).length}/${run.inv.length} · Items auf Pokémon ziehen zum Anlegen`));
  const inBattle = run.phase === 'battle';
  $('#inv').replaceChildren(...run.inv.map((inst, i) => {
    const el = itemSlot(inst, { 'data-inv': i });
    if (inst) {
      const def = itemDef(inst.id);
      if (inBattle && def.kind === 'ball') el.classList.add('can');
      if (R.mergeTargets(inst, i).length) el.append(h('span.upb', '↑'));
      attachTip(el, () => itemTip(inst));
      el.onclick = () => { if (!el._dragged) itemSheet(i); };
      el.onpointerdown = (ev) => { if (!inBattle) startDrag(ev, el, i); };
    }
    return el;
  }));
}
