// Spielablauf: Titel → Starter → Floors (Kämpfe → Beute) → Rast (Shop, Zerlegen, Keystones) → … → Game Over.
import { D, mon, itemDef, portraitUrl, itemIconUrl, typeColor, rarityColor, rarityName, pick, rnd } from './data.js';
import { computeStats, g, sumOps, keystoneOps, opText, expGain } from './mods.js';
import * as R from './run.js';
import { run } from './run.js';
import * as K from './combat.js';
import { Stage } from './gfx/stage.js';
import { $, h, toast, openSheet, closeSheet, sheetOpen } from './ui/dom.js';
import { attachTip, hideTip } from './ui/tip.js';
import { renderHud } from './ui/hud.js';
import { itemHead, itemInfo, gainText, itemTip, mergeLabel } from './ui/sheets.js';
import { starterScreen } from './ui/starter.js';
import { setMusic, sfx, blip, toggleSound, soundOn } from './audio.js';

let stage;
const STATUS_NAME = { burn: 'verbrannt', poison: 'vergiftet', para: 'paralysiert', sleep: 'schläft ein', freeze: 'friert ein', confuse: 'ist verwirrt' };
const STATUS_VFX = { burn: 'burning', poison: 'poisoned', para: 'shocked', sleep: 'weakened', freeze: 'frozen', confuse: 'charmed' };

function log(t) { $('#log').textContent = t; }
async function banner(text, sub = '', ms = 900) {
  const b = $('#banner');
  b.replaceChildren(text, sub ? h('small', sub) : '');
  b.classList.add('on');
  await stage.wait(ms);
  b.classList.remove('on');
}
const effText = (eff) => (eff >= 2 ? 'sehr effektiv!' : eff === 0 ? 'keine Wirkung' : eff < 1 ? 'nicht sehr effektiv' : '');

// Präsentation der Kampf-Ereignisse
async function fx(ev) {
  const W = (ms) => stage.wait(ms);
  switch (ev.kind) {
    case 'start': stage.trainer = run.battle.trainer?.sprite || null; stage.setScene(run.team[0].dex, standing()); refreshIntents(); renderHud(); return;
    case 'sendout': { const t = run.battle.trainer; stage.setScene(run.team[0].dex, standing()); refreshIntents(); renderHud(); await banner(`${t.name} schickt ${ev.e.name}!`, `noch ${run.battle.reserve.length} im Team`, 800); return; }
    case 'pattack': {
      log(ev.move.name + (ev.special ? '!' : ''));
      blip(ev.special ? 520 : 330, 0.06);
      const to = ev.e?.uid || K.alive()[0]?.uid;
      if (ev.all) { stage.play('player', 'Attack'); stage.vfx('player', 'level_up_burst', 0.9, 12); await Promise.all(K.alive().map((x, i) => stage.projectile('player', x.uid, ev.move.type, { arc: 6 + i * 4 }))); return; }
      if (ev.special) { stage.vfx('player', 'level_up_burst', 0.7, 12); if (to) await stage.projectile('player', to, ev.move.type, { size: 1.2, arc: 4 }); return; }
      await stage.dash('player', to);
      return;
    }
    case 'eattack': { if (ev.it === 'spez' || ev.it === 'status') await stage.projectile(ev.e.uid, 'player', ev.e.move.type, { size: 1.1, arc: 4 }); else await stage.dash(ev.e.uid, 'player'); log(`${ev.e.name}: ${{ atk: 'Angriff', strong: 'Wuchtschlag', spez: ev.e.move.name, status: ev.e.move.name }[ev.it] || ''}`); blip(180, 0.08); return W(60); }
    case 'hit': {
      stage.hitAt(ev.e.uid, ev.type, ev.crit ? 1.7 : ev.small ? 0.9 : 1.3);
      const col = ev.eff >= 2 ? '#ffd84a' : ev.eff < 1 ? '#a8a4c8' : '#ffffff';
      stage.text(ev.e.uid, (ev.crit ? '✶' : '') + ev.dmg, col, ev.crit ? 24 : ev.small ? 13 : 18);
      const et = effText(ev.eff);
      if (et && !ev.small) stage.text(ev.e.uid, et, col, 11, 44);
      if (ev.crit) stage.vfx(ev.e.uid, 'critical_hit', 1.2);
      if (ev.label && !ev.small) log(ev.label);
      if (ev.small && LABEL_FX[ev.label]) { stage.vfx(ev.e.uid, LABEL_FX[ev.label][0], 1); stage.text(ev.e.uid, ev.label, LABEL_FX[ev.label][1], 10, 46); }
      blip(ev.crit ? 120 : 90, 0.1, 'sawtooth', 0.05);
      renderHud();
      await W(ev.small ? 160 : 260);
      return stage.back();
    }
    case 'ko': sfx('fp_whoosh', 0.4); await stage.back(); await stage.faint(ev.e.uid); return;
    case 'status': stage.vfx(ev.e.uid, STATUS_VFX[ev.s], 1); if (!ev.quiet) stage.text(ev.e.uid, STATUS_NAME[ev.s], '#e0b0ff', 11, 40); return W(ev.quiet ? 90 : 260);
    case 'pstatus': stage.vfx('player', STATUS_VFX[ev.s], 1); stage.text('player', STATUS_NAME[ev.s], '#e0b0ff', 11, 40); renderHud(); return W(260);
    case 'heal': stage.vfx('player', 'healing', 1.2, 10); stage.text('player', '+' + ev.v, '#7cff8a', 17); if (ev.label) stage.text('player', ev.label, '#b8ffc0', 10, 46); blip(660, 0.12, 'sine', 0.05); flashHud('heal'); renderHud(); return W(280);
    case 'phit': {
      const lf = ev.small && LABEL_FX[ev.label];
      if (!ev.small) stage.hitAt('player', ev.type, 1.2);
      else { if (lf) stage.vfx('player', lf[0], 1.1); const a = stage.actors.get('player'); if (a) a.shake = stage.t + 260; if (ev.label) stage.text('player', ev.label, lf?.[1] || '#ff9a9a', 10, 46); }
      stage.text('player', '-' + ev.dmg, lf?.[1] || '#ff6070', ev.small ? 15 : 18);
      flashHud(lf?.[2] || 'dmg');
      const et = effText(ev.eff ?? 1);
      if (et && !ev.small) stage.text('player', et, '#ffd84a', 11, 44);
      blip(70, 0.12, 'sawtooth', 0.06);
      navigator.vibrate?.(ev.small ? 10 : 25);
      renderHud();
      await W(ev.small ? 150 : 280);
      return stage.back();
    }
    case 'aoe': stage.aoe(ev.type); blip(60, 0.25, 'sawtooth', 0.07); navigator.vibrate?.(30); return stage.wait(320);
    case 'revive': stage.text('player', `${mon(ev.m.dex).name} ist zurück!`, '#7cff8a', 13, 40); flashHud('heal'); renderHud(); return W(400);
    case 'miss': stage.text('player', 'Ausgewichen!', '#8ac8ff', 13); await W(260); return stage.back();
    case 'shield': stage.text('player', '🛡 ' + ev.v, '#8ac8ff', 14); renderHud(); return W(200);
    case 'shieldhit': stage.text('player', '🛡-' + ev.v, '#8ac8ff', 12, 50); return W(100);
    case 'eguard': stage.text(ev.e.uid, '🛡 Schutz', '#8ac8ff', 13); log(`${ev.e.name} schützt sich.`); return W(300);
    case 'ebuff': stage.vfx(ev.e.uid, 'alerted', 1); stage.text(ev.e.uid, '▲ Stärker', '#ffd060', 13); log(`${ev.e.name} wird stärker!`); return W(320);
    case 'use': stage.vfx('player', 'level_up_burst', 0.8, 10); log((ev.auto ? 'Automatisch: ' : '') + itemDef(ev.inst.id).name); sfx('fp_klick', 0.4); renderHud(); return W(260);
    case 'buff': stage.text('player', ev.text, '#ffd060', 11, 46); return W(250);
    case 'synergy': stage.vfx(run.battle.targetUid || K.alive()[0]?.uid, 'thunder_strike', 1.6, 20); await banner('✦ ' + ev.syn.name, ev.syn.text, 700); return;
    case 'monuse': {
      const a = stage.actors.get('player');
      stage.actors.set('player', stage.actor(ev.m.dex, 'p'));
      await banner(mon(ev.m.dex).name, ev.move.name + '!', 500);
      await stage.dash('player', ev.e?.uid || K.alive()[0]?.uid);
      setTimeout(() => stage.actors.set('player', a), 900 / stage.speed);
      return;
    }
    case 'sacrifice': stage.vfx('player', 'level_up_burst', 2.2, 12); sfx('fp_rang', 0.5); await banner(`${mon(ev.m.dex).name} geopfert`, 'Die Kraft geht auf dein Team über', 1100); renderHud(); return;
    case 'ball': sfx('ballfall', 0.5); log(itemDef(ev.inst.id).name + '!'); await stage.throwBall(ev.inst.id, ev.e.uid, ev.shakes, ev.ok); return;
    case 'caught': sfx('fp_rang', 0.6); await banner(`${ev.e.name} gefangen!`, ev.full ? 'Team voll – entscheide nach dem Kampf' : 'Neu im Team', 1100); renderHud(); return;
    case 'faint': sfx('fp_fehler', 0.4); await stage.back(); await stage.faint('player'); log(`${mon(ev.m.dex).name} ist besiegt – Beleber oder aus dem Team entfernen`); await stage.wait(400); return;
    case 'swap': stage.setScene(run.team[0].dex, standing()); renderHud(); return W(250);
    case 'say': log(ev.text); return W(380);
    case 'update': stage.setScene(run.team[0].dex, standing()); refreshIntents(); renderHud(); return;
  }
}
// Auf der Bühne nur stehende Gegner (K.O.-Animation läuft vorher)
const standing = () => (run.battle?.enemies || []).filter((e) => e.hp > 0);
function refreshIntents() {
  const b = run.battle;
  if (!b) return;
  for (const e of b.enemies) e.intent = e.hp > 0 ? K.intentPreview(e) : null;
  if (!K.alive().some((e) => e.uid === b.targetUid)) b.targetUid = K.alive()[0]?.uid;
  stage.targetUid = b.targetUid;
}

// --- Ablauf --------------------------------------------------------------------
export const G = {
  init() {
    stage = new Stage($('#stage'));
    stage.speed = +(localStorage.getItem('turmbeute.speed') || 1);
    $('#speed').textContent = '×' + stage.speed;
    $('#speed').onclick = () => { stage.speed = stage.speed >= 3 ? 1 : stage.speed + 1; $('#speed').textContent = '×' + stage.speed; try { localStorage.setItem('turmbeute.speed', stage.speed); } catch {} };
    $('#menu-btn').onclick = () => G.menu();
    stage.c.addEventListener('pointerdown', (ev) => G.pickTarget(ev));
    K.setFx(fx);
    window.__tb = { G, R, K, stage, get run() { return run; } };
    if (location.search.includes('bot')) import('./bot.js').then((m) => m.installBot(G, R, K, stage));
    G.title();
  },
  title() {
    const meta = R.loadMeta();
    const ov = $('#overlay');
    ov.classList.remove('hidden');
    setMusic(null);
    // Drei Speicherplätze: fortsetzen, löschen oder neu beginnen
    const slot = (n) => {
      const s = R.loadSaved(n);
      if (!s) return h('div.saveslot.empty', h('div.sl-h', `Platz ${n + 1}`), h('div.hint', 'leer'), h('button.btn.gold', { onclick: () => starterScreen((dexes) => G.newRun(dexes, n)) }, 'Neuer Lauf'));
      return h('div.saveslot', h('div.sl-h', `Platz ${n + 1}`, h('small', `Areal ${s.areal} · Kampf ${s.fight}`)),
        h('div.sl-team', s.team.map((m) => h('img', { src: portraitUrl(m.dex), title: mon(m.dex).name }))),
        h('div.sl-row', h('button.btn.pri', { onclick: () => G.resume(s) }, 'Fortsetzen'),
          h('button.btn.warn', { onclick: (e) => { if (e.currentTarget.dataset.sure) { R.clearSave(n); G.title(); } else { e.currentTarget.dataset.sure = 1; e.currentTarget.textContent = 'Wirklich löschen?'; } } }, 'Löschen')));
    };
    ov.replaceChildren(
      h('div.title', 'POKELOOT'),
      h('div.subtitle', 'Erklimme den endlosen Turm. Fange, sammle, zerlege – und bau dir den absurdesten Build.'),
      h('div.menu',
        ...Array.from({ length: R.SLOTS }, (_, n) => slot(n)),
        h('button.btn', { onclick: (e) => { const on = toggleSound(); e.currentTarget.textContent = on ? 'Ton: an' : 'Ton: aus'; } }, soundOn() ? 'Ton: an' : 'Ton: aus'),
        meta.best ? h('div.hint', { style: { textAlign: 'center' } }, `Rekord: ${progText(meta.best)} · ${meta.runs} Läufe`) : null));
  },
  newRun(dexes, slot = 0) {
    R.newRun(dexes, slot);
    const m = R.loadMeta(); m.runs++; R.saveMeta(m);
    $('#overlay').classList.add('hidden');
    setMusic('zeitturm.mp3');
    G.nextFight();
  },
  resume(saved) {
    R.setRun(saved);
    $('#overlay').classList.add('hidden');
    run.events ||= [];
    if (run.phase === 'battle' && run.battle) {
      run.battle.busy = false;
      setMusic('zeitturm.mp3');
      stage.setBackground(floorBg());
      stage.trainer = run.battle.trainer?.sprite || null;
      stage.setScene(run.team[0].dex, standing());
      refreshIntents();
      G.refresh();
    } else if (run.phase === 'battle' || run.phase === 'floor') G.nextFight(true);
    else { setMusic(run.phase === 'rest' || run.phase === 'keystone' ? 'gilde.mp3' : 'zeitturm.mp3'); G.refresh(); }
  },
  refresh() { renderHud(); renderPanel(); R.save(); },

  async nextFight(same = false) {
    const me = run;
    if (!same) R.advanceFight();
    stage.setBackground(floorBg());
    run.phase = 'battle';
    const fight = R.makeFightEnemies();
    renderPanel();
    stage.trainer = null;
    stage.setScene(run.team[0].dex, []);
    renderHud();
    const kind = R.fightKind(), N = D.B.areal.fights;
    if (run.fight === 1) await banner(`Areal ${run.areal}`, `${N} Kämpfe · am Ende ein Trainer und ein Legendäres`, 1100);
    if (kind === 'trainer') { const t = fight.trainer; stage.trainer = t.sprite; await banner(`${t.title} ${t.name}`, `Endboss · ${t.size} ${t.type}-Pokémon`, 1300); }
    else if (kind === 'legend') await banner('Legendäres Pokémon!', fight.enemies[0].name, 1200);
    else if (run.fight > 1) await banner(`Kampf ${run.fight}/${N}`, '', 550);
    if (run !== me) return; // inzwischen neuer Lauf
    await K.startBattle(fight.enemies, fight);
    G.refresh();
  },
  pickTarget(ev) {
    const b = run?.battle;
    if (!b || run.phase !== 'battle') return;
    const r = stage.c.getBoundingClientRect(), k = stage.c.width / r.width;
    const px = (ev.clientX - r.left) * k, py = (ev.clientY - r.top) * k;
    let best = null, bd = Infinity;
    for (const e of K.alive()) { const p = stage.pos(e.uid); const d = Math.hypot(p.x - px, (p.y - 20 * stage.scale()) - py); if (d < bd) { bd = d; best = e; } }
    if (best && bd < stage.c.width * 0.2) { b.targetUid = best.uid; stage.targetUid = best.uid; sfx('fp_klick', 0.25); }
  },
  async act(a, arg) {
    if (!run.battle || run.battle.busy) return;
    const me = run;
    await K.act(a, arg);
    if (run !== me) return;
    G.processEvents();
    if (K.battleLost()) return G.gameOver();
    if (K.battleWon()) return G.win();
  },

  async win() {
    const b = run.battle;
    const defeated = b.enemies;
    const gold = R.fightGold(defeated);
    run.gold += gold;
    const items = R.rollLoot(defeated);
    const mons = [...b.caught];
    for (const e of defeated.filter((x) => x.elite && !x.caught)) {
      if (rnd() < 0.5) mons.push({ ...R.makeMon(e.dex, e.level), offer: true });
      else items.push(R.makeItem('master-fragment', run.floor));
    }
    const boss = defeated.some((e) => e.boss || e.trainer);
    if (b.trainer && !R.ownsItem(D.B.exp.shareItem)) items.unshift(R.makeItem(D.B.exp.shareItem, run.floor));
    const { mods } = computeStats(run);
    run.battle = null;
    giveFightExp(defeated);
    R.healTeam(D.B.floor.healAfterFight + g(mods, 'afterFightHeal'));
    run.loot = { items, gold, mons, boss };
    run.phase = 'loot';
    sfx('muenze', 0.5);
    const me = run;
    await banner(b.trainer ? `${b.trainer.name} besiegt!` : boss ? 'Legendäres besiegt!' : 'Sieg!', `+${gold} Gold`, 700);
    if (run === me) G.refresh();
  },
  takeLoot(i) {
    const it = run.loot.items[i];
    if (!it || it.taken) return;
    const { taken, ...inst } = it;
    if (!R.addItem(inst)) return G.toastNo('Inventar voll – zerlege oder wirf etwas weg.');
    it.taken = true;
    sfx('fp_klick', 0.4);
    G.processEvents();
    G.refresh();
  },
  salvageLoot(i) {
    const it = run.loot.items[i];
    if (!it || it.taken) return;
    const gn = R.salvageGain(it);
    R.applySalvage(gn);
    it.taken = true;
    toast('Zerlegt: ' + gainText(gn));
    sfx('mechanik', 0.35);
    G.refresh();
  },
  sellLoot(i) {
    const it = run.loot.items[i];
    if (!it || it.taken) return;
    run.gold += R.sellPrice(it);
    it.taken = true;
    sfx('muenze', 0.5);
    G.refresh();
  },
  takeMon(i, replace = null) {
    const m = run.loot.mons[i];
    if (replace != null) R.releaseMon(replace);
    const { offer, ...mm } = m;
    if (!R.addMon(mm)) return G.toastNo('Team voll.');
    run.loot.mons.splice(i, 1);
    toast(`${mon(mm.dex).name} ist jetzt im Team!`);
    G.processEvents();
    G.refresh();
  },
  dropMon(i) { run.loot.mons.splice(i, 1); G.refresh(); },

  async next() {
    if (run.phase === 'loot') {
      if (run.loot.mons.length) return G.toastNo('Entscheide erst über die Pokémon.');
      run.loot = null;
      if (!R.isRestAfter(run.fight)) return G.nextFight();
      return G.floorEnd();
    }
    if (run.phase === 'rest') {
      R.startSegment();
      run.shop = null;
      setMusic('zeitturm.mp3');
      return G.nextFight();
    }
  },
  floorEnd() {
    run.floorOps = []; run.floorStacks = {};
    R.healTeam(D.B.floor.healAfterFloor);
    R.makeShop();
    const ks = run.fight >= D.B.areal.fights; // Areal geschafft
    run.phase = ks ? 'keystone' : 'rest';
    if (ks) run.ksOffer = R.keystoneOffer();
    setMusic('gilde.mp3');
    G.processEvents();
    G.refresh();
  },
  pickKeystone(id) {
    run.keystones.push(id);
    run.ksOffer = null;
    run.phase = 'rest';
    R.ensureInv();
    R.healTeam(1);
    sfx('fp_rang', 0.5);
    G.refresh();
  },

  // --- Inventar-Aktionen ---
  // Item an Pokémon mi anlegen; ist es voll, wird gefragt, welches Item ersetzt wird
  equip(idx, mi, replace = null) {
    const name = itemDef(run.inv[idx]?.id)?.name;
    const r = R.equip(idx, mi, replace);
    if (r === 'full') return replacePicker(idx, mi);
    if (r === 'merged') return mergedFx(run.team[mi].held.find((x) => itemDef(x.id).name === name));
    if (r === 'evolved') sfx('fp_rang', 0.5); else sfx('fp_klick', 0.4);
    G.processEvents();
    G.refresh();
  },
  // Inventar-Item idx auf ein gleiches Item ziehen (ref = {inv} oder {mon, slot})
  merge(idx, ref) {
    const src = R.takeOne(idx);
    if (!src) return;
    mergedFx(R.mergeInto(src, ref));
  },
  mergeLoot(li, ref) {
    const it = run.loot.items[li];
    if (!it || it.taken) return;
    it.taken = true;
    const { taken, ...src } = it;
    mergedFx(R.mergeInto(src, ref));
  },
  unequip(mi, slot) { if (!R.unequip(mi, slot)) return G.toastNo('Kein Platz im Inventar.'); G.refresh(); },
  // Beleber außerhalb des Kampfes
  reviveOn(idx, mi) {
    const u = itemDef(run.inv[idx].id).use, m = run.team[mi];
    if (!m.fainted) return;
    R.takeOne(idx);
    R.reviveMon(m, u.revive);
    toast(`${mon(m.dex).name} ist wieder fit!`);
    sfx('fp_rang', 0.5);
    G.refresh();
  },
  // Trank o. Ä. außerhalb des Kampfes auf ein Pokémon
  useOn(idx, mi) {
    const u = itemDef(run.inv[idx].id).use, m = run.team[mi];
    if (m.fainted) return G.toastNo('Besiegte Pokémon werden in der Rast wiederbelebt.');
    R.takeOne(idx);
    const max = R.fixHp(m);
    const before = m.hp;
    m.hp = Math.min(max, m.hp + Math.round(max * (u.heal || 0)));
    toast(`+${m.hp - before} KP für ${mon(m.dex).name}`);
    sfx('fp_richtig', 0.4);
    G.refresh();
  },
  salvage(idx) {
    const inst = run.inv[idx];
    const gn = R.salvageGain(inst);
    R.applySalvage(gn);
    run.inv[idx] = null;
    toast('Zerlegt: ' + gainText(gn));
    sfx('mechanik', 0.35);
    G.refresh();
  },
  sell(idx) { const inst = run.inv[idx]; run.gold += R.sellPrice(inst); run.inv[idx] = null; sfx('muenze', 0.5); G.refresh(); },
  discard(idx) { run.inv[idx] = null; G.refresh(); },
  candy(idx, mi) {
    const u = itemDef(run.inv[idx].id).use;
    R.takeOne(idx);
    R.giveLevels(run.team[mi], u.levelUp || 1);
    sfx('fp_richtig', 0.5);
    G.processEvents();
    G.refresh();
  },
  setLead(i) { if (run.team[i].fainted) return G.toastNo('Dieses Pokémon ist besiegt.'); const [m] = run.team.splice(i, 1); run.team.unshift(m); G.refresh(); },
  release(i) { R.releaseMon(i); G.processEvents(); G.refresh(); },
  buy(i) {
    const o = run.shop.offers[i];
    if (!o || o.sold) return;
    const p = R.itemPrice(o);
    if (run.gold < p) return G.toastNo('Zu wenig Gold.');
    const { fixed, sold, ...inst } = o;
    if (!R.addItem({ ...inst, uid: Math.random().toString(36).slice(2) })) return G.toastNo('Inventar voll.');
    run.gold -= p;
    if (!fixed || D.B.shop.fixed.find((f) => f.id === o.id)?.once) o.sold = true;
    sfx('muenze', 0.5);
    G.processEvents();
    G.refresh();
  },
  reroll() {
    const c = R.rerollCost();
    if (run.gold < c) return G.toastNo('Zu wenig Gold.');
    run.gold -= c;
    const n = run.shop.rerolls + 1;
    R.makeShop();
    run.shop.rerolls = n;
    G.refresh();
  },
  toastNo(t) { toast(t); sfx('fp_fehler', 0.35); },

  processEvents() {
    const ev = run.events.splice(0);
    for (const e of ev) {
      if (e.kind === 'toast') toast(e.text);
      if (e.kind === 'evolve') evolvePopup(e);
      if (e.kind === 'levelup') { const m = run.team.find((x) => x.uid === e.uid); if (m) toast(`${mon(m.dex).name} erreicht Lv ${e.level}!`); }
    }
  },
  gameOver() {
    const meta = R.loadMeta();
    const best = Math.max(meta.best || 0, run.floor);
    meta.best = best; R.saveMeta(meta);
    run.phase = 'over';
    R.clearSave();
    setMusic('verborgenes-land.mp3', 0.3);
    const ov = $('#overlay');
    ov.classList.remove('hidden');
    ov.replaceChildren(h('div.title', { style: { fontSize: '38px' } }, 'BESIEGT'),
      h('div.subtitle', `${progText(run.floor)} erreicht${run.floor >= best ? ' – neuer Rekord!' : ` · Rekord ${progText(best)}`}`),
      h('div', { style: { display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap', justifyContent: 'center' } }, run.team.map((m) => h('img', { src: portraitUrl(m.dex), style: { width: '48px', imageRendering: 'pixelated', borderRadius: '6px' } }))),
      h('div.hint', `Besiegt ${run.stats.kills} · Gefangen ${run.stats.caught} · Zerlegt ${run.stats.salvaged} · Keystones ${run.keystones.length}`),
      h('div.menu', { style: { marginTop: '16px' } }, h('button.btn.gold', { onclick: () => starterScreen((dexes) => G.newRun(dexes)) }, 'Neuer Lauf'), h('button.btn', { onclick: () => G.title() }, 'Titel')));
  },
  menu() {
    openSheet(h('h3', 'Menü'), h('div.btns',
      h('button.btn', { onclick: (e) => { const on = toggleSound(); e.currentTarget.textContent = on ? 'Ton: an' : 'Ton: aus'; } }, soundOn() ? 'Ton: an' : 'Ton: aus'),
      h('button.btn', { onclick: () => help() }, 'Spielregeln'),
      run && run.phase !== 'over' ? h('button.btn', { onclick: () => { closeSheet(); R.save(); run.battle && (run.battle.busy = false); G.title(); } }, 'Speichern & zum Titel') : null,
      run && run.phase !== 'over' ? h('button.btn.warn', { onclick: () => { closeSheet(); run.team.forEach((m) => (m.fainted = true)); G.gameOver(); } }, 'Lauf aufgeben') : null,
      h('button.btn', { onclick: closeSheet }, 'Schließen')));
  },
};

function mergedFx(dst) {
  if (!dst) return G.refresh();
  sfx('fp_rang', 0.5);
  toast(`✨ ${itemDef(dst.id).name} aufgewertet: ${rarityName(dst.r)} · Stufe ${dst.lvl}`);
  G.processEvents();
  G.refresh();
}
// Kurzes Aufleuchten der Anführer-Leiste bei Heilung oder Schaden
function flashHud(kind) {
  const p = $('#player');
  p.classList.remove('fl-heal', 'fl-dmg', 'fl-poison', 'fl-burn');
  void p.offsetWidth;
  p.classList.add('fl-' + kind);
  clearTimeout(p._fl);
  p._fl = setTimeout(() => p.classList.remove('fl-' + kind), 700);
}
const LABEL_FX = { Gift: ['poisoned', '#d58aff', 'poison'], Verbrennung: ['burning', '#ffa040', 'burn'], Rückstoß: ['slash', '#ff8a8a', 'dmg'], Verwirrung: ['charmed', '#ffb0e0', 'dmg'], Egelsamen: ['nature_impact', '#9fe07a', 'dmg'], Hagel: ['frost_impact', '#a8e8ff', 'dmg'], Albtraum: ['shadow_impact', '#b090ff', 'dmg'], Tarnsteine: ['ground_slam', '#e0c890', 'dmg'], Dornen: ['ground_slam', '#e0c890', 'dmg'] };

// Hintergrund-Sprite für den aktuellen Floor (Reihenfolge pro Lauf gemischt, Boss-Floors eigene)
function floorBg() {
  const Bg = D.B.backgrounds;
  if (R.fightKind() !== 'wild') return Bg.boss[(run.areal - 1) % Bg.boss.length];
  if (!run.bgOrder) run.bgOrder = [...Bg.normal].sort(() => rnd() - 0.5);
  const seg = D.B.areal.restAfter.filter((f) => run.fight > f).length;
  return run.bgOrder[((run.areal - 1) * (D.B.areal.restAfter.length + 1) + seg) % run.bgOrder.length];
}
// EP: Kämpfer bekommt alles; die anderen (nicht besiegten) nur mit EP-Teiler einen Anteil
function giveFightExp(defeated) {
  const X = D.B.exp, fighter = run.team[0];
  const hasShare = [...run.inv, ...run.team.flatMap((m) => m.held)].some((it) => it?.id === X.shareItem);
  for (const m of run.team) {
    if (m.fainted) continue;
    const share = m === fighter ? 1 : hasShare ? X.share : 0;
    if (!share) continue;
    const mult = X.mult * (1 + g(computeStats(run, [], m).mods, 'expMult'));
    const xp = defeated.reduce((s, e) => s + expGain(e, m), 0) * share * mult;
    R.giveExp(m, xp);
  }
}
function replacePicker(idx, mi) {
  const m = run.team[mi];
  openSheet(h('h3', `${mon(m.dex).name}: alle Plätze belegt`), h('div.hint', 'Welches Item soll zurück ins Inventar?'),
    h('div.btns', m.held.map((it, k) => h('button.btn', { onclick: () => { closeSheet(); G.equip(idx, mi, k); } },
      h('img', { src: itemIconUrl(it.id), style: { width: '26px', verticalAlign: 'middle', marginRight: '6px' } }), itemDef(it.id).name)),
    h('button.btn', { onclick: closeSheet }, 'Abbrechen')));
}

const progText = (p) => { const N = D.B.areal.fights; return `Areal ${Math.floor((p - 1) / N) + 1}, Kampf ${((p - 1) % N) + 1}`; };

function help() {
  openSheet(h('h3', 'So funktioniert’s'), h('ul.fx',
    h('li', 'Ein Areal hat 15 Kämpfe: erst wilde Pokémon (am Anfang Nager & Co., dann stärkere), Kampf 14 ein Trainer-Endboss mit Themen-Team, Kampf 15 ein Legendäres. Rast mit Heilung und Shop nach Kampf 5, 10 und 13, am Areal-Ende ein Keystone.'),
    h('li', 'Du startest mit 3 Pokémon auf Lv 1. Der Anführer (♛) kämpft mit seinen eigenen Werten und seinen bis zu 4 Items. Wird er besiegt, kommt das nächste. Alle geben Typ-Stacks und ihre Fähigkeit fürs Team.'),
    h('li', 'Besiegte Gegner geben EP an den Kämpfer. Mit dem EP-Teiler (Shop oder erster Trainer-Sieg) bekommen die anderen die Hälfte. Level ohne Obergrenze, Entwicklungen wie im Original. In der Rast wird geheilt; besiegte Pokémon kommen nur mit einem Beleber zurück (oder du entfernst sie aus dem Team).'),
    h('li', 'Über jedem Gegner: ▲ sein höchster und ▼ sein niedrigster Kampfwert (Ang/Abw/Sp.Ang/Sp.Abw). Niedrige Abw → Angriff, niedrige Sp.Abw → Spezial. Rundumschlag trifft alle Gegner.'),
    h('li', 'Im Kampf: Angriff, Spezial (kostet Energie), Warten, ein Item verbrauchen, einen Ball werfen oder ein Pokémon einsetzen/opfern (Pokémon antippen).'),
    h('li', 'Fangen: je weniger KP und mit Status (Schlaf, Paralyse, Gift, Verbrennung), desto besser. Fehlwurf macht den Gegner wütend.'),
    h('li', 'Items: anlegen (an Pokémon oder Trainer-Plätze), im Kampf verbrauchen oder zerlegen für permanente Werte und Typ-Affinität. Ziehen & Ablegen geht auch.'),
    h('li', 'Typ-Stacks: ab 4/8/12 gibt es starke Zusatzeffekte, zwei passende Typen ergeben Synergien. Verbrauchte Typ-Items lösen eine Entladung (und aktive Synergien) aus.'),
    h('li', 'Tippe auf einen Gegner, um ihn anzuvisieren. Die Absicht über ihm zeigt seinen nächsten Zug.')),
  h('div.btns', h('button.btn', { onclick: closeSheet }, 'OK')));
}

// Entwicklungen nacheinander zeigen
const evoQueue = [];
function evolvePopup(e) {
  if (!sheetOpen()) evoQueue.length = 0; // per Tippen daneben geschlossen
  evoQueue.push(e);
  if (evoQueue.length === 1) showEvo();
}
function showEvo() {
  const e = evoQueue[0];
  if (!e) return;
  const a = mon(e.from), b = mon(e.to);
  sfx('fp_rang', 0.5);
  openSheet(h('div', { style: { textAlign: 'center' } },
    h('h3', 'Entwicklung!'),
    h('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', margin: '12px 0' } },
      h('img', { src: portraitUrl(e.from), style: { width: '64px', imageRendering: 'pixelated', filter: 'brightness(1.6) saturate(0)' } }), '➜',
      h('img', { src: portraitUrl(e.to), style: { width: '80px', imageRendering: 'pixelated' } })),
    h('div', `${a.name} hat sich zu ${b.name} entwickelt!`),
    h('div', { style: { marginTop: '6px' } }, ...b.types.map((t) => h('span.tchip', { style: { background: typeColor(t) } }, t)))),
  h('div.btns', h('button.btn.pri', { onclick: () => { closeSheet(); evoQueue.shift(); showEvo(); } }, 'Super!')));
}

// --- Panels über der Bühne (Beute, Rast/Shop, Keystones) ------------------------------
function renderPanel() {
  hideTip();
  const p = $('#panel');
  if (!run || run.phase === 'battle' || run.phase === 'floor') { p.classList.remove('on'); return; }
  p.classList.add('on');
  log('');
  if (run.phase === 'loot') return p.replaceChildren(...lootPanel());
  if (run.phase === 'keystone') return p.replaceChildren(...keystonePanel());
  if (run.phase === 'rest') return p.replaceChildren(...restPanel());
  p.replaceChildren();
}
function itemCard(inst, extra, onclick, mark = 'ok', tipExtra = null) {
  const def = itemDef(inst.id);
  const up = !inst.taken && !inst.sold && R.mergeTargets(inst).length;
  const el = h('div.card', { class: 'card' + (inst.taken || inst.sold ? ' taken' : ` ${mark}`), '--rc': rarityColor(inst.r || def.rarity), onclick },
    up ? h('span.upb', '↑') : null, h('img', { src: itemIconUrl(inst.id) }), h('div.nm', def.name), extra);
  attachTip(el, () => itemTip(inst, tipExtra));
  return el;
}
function lootPanel() {
  const L = run.loot;
  const out = [h('div.ph', L.boss ? '★ Boss-Beute' : 'Beute', h('small', `+${L.gold} Gold`))];
  for (const [i, m] of L.mons.entries()) {
    const sp = mon(m.dex), full = run.team.length >= D.B.teamMax;
    out.push(h('div.card', { style: { flexDirection: 'row', textAlign: 'left', gap: '10px', marginBottom: '8px', '--rc': '#ffd84a' } },
      h('img', { src: portraitUrl(m.dex), style: { imageRendering: 'pixelated' } }),
      h('div', { style: { flex: 1 } }, h('div.nm', `${sp.name} Lv ${m.level}`), h('div', ...sp.types.map((t) => h('span.tchip', { style: { background: typeColor(t) } }, t))), h('div.hint', m.offer ? 'Fang-Chance: will sich dir anschließen!' : 'Gefangen – aber dein Team ist voll.')),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        full ? h('button.btn.pri', { onclick: () => swapPicker(i) }, 'Tauschen') : h('button.btn.pri', { onclick: () => G.takeMon(i) }, 'Aufnehmen'),
        h('button.btn', { onclick: () => G.dropMon(i) }, 'Freilassen'))));
  }
  const left = L.items.filter((x) => !x.taken).length;
  out.push(h('div.hint', 'Tippe ein Item: nehmen, zerlegen, verkaufen oder aufwerten (↑ = du hast es schon). Was du liegen lässt, ist beim Weitergehen weg.'));
  out.push(h('div.cards', L.items.map((it, i) => itemCard(it, h('div.sub', { style: { fontSize: '10px', color: '#9a94c0' } }, 'St.' + it.lvl), () => lootSheet(i)))));
  if (left) out.push(h('div.rowbtns', h('button.btn', { onclick: () => L.items.forEach((_, i) => !L.items[i].taken && R.freeSlots() > 0 && G.takeLoot(i)) }, `Alle ${left} ins Inventar`, h('small', `${R.freeSlots()} Plätze frei`))));
  return out;
}
function lootSheet(i) {
  const it = run.loot.items[i];
  if (it.taken) return;
  openSheet(itemHead(it), itemInfo(it), h('div.btns',
    ...R.mergeTargets(it).slice(0, 2).map((t) => h('button.btn.purple', { onclick: () => { closeSheet(); G.mergeLoot(i, t); } }, '↑ Aufwerten', h('small', mergeLabel(it, t)))),
    h('button.btn.pri', { onclick: () => { closeSheet(); G.takeLoot(i); } }, 'Nehmen', h('small', `${R.freeSlots()} Plätze frei`)),
    h('button.btn.purple', { onclick: () => { closeSheet(); G.salvageLoot(i); } }, 'Sofort zerlegen'),
    h('button.btn.gold', { onclick: () => { closeSheet(); G.sellLoot(i); } }, 'Verkaufen', h('small', `+${R.sellPrice(it)} Gold`)),
    h('button.btn', { onclick: closeSheet }, 'Zurück')));
}
function swapPicker(i) {
  openSheet(h('h3', 'Wen freilassen?'), h('div.btns', run.team.map((m, k) => h('button.btn', { onclick: () => { closeSheet(); G.takeMon(i, k); } },
    h('img', { src: portraitUrl(m.dex), style: { width: '28px', imageRendering: 'pixelated', verticalAlign: 'middle', marginRight: '6px' } }), mon(m.dex).name, h('small', `Lv ${m.level}`))),
  h('button.btn', { onclick: closeSheet }, 'Abbrechen')));
}
function keystonePanel() {
  return [h('div.ph', 'Keystone wählen', h('small', 'gilt für den ganzen Lauf')),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, run.ksOffer.map((id) => {
      const k = D.keystones.find((x) => x.id === id);
      return h('div.card.ks.ok', { '--rc': '#ffd84a', onclick: () => G.pickKeystone(id) }, h('div.nm', '◆ ' + k.name), h('div', k.text));
    }))];
}
function restPanel() {
  const S = run.shop;
  return [h('div.ph', `Rast · Areal ${run.areal}, nach Kampf ${run.fight}`, h('small', run.team.some((m) => m.fainted) ? 'geheilt · K.O. nur mit Beleber' : 'Team geheilt')),
    h('div.cards', S.offers.map((o, i) => { const p = R.itemPrice(o), can = run.gold >= p; return itemCard(o, h('div.pr', { class: 'pr ' + (can ? 'ok' : 'no') }, o.sold ? 'verkauft' : p + ' G'), () => shopSheet(i), can ? 'ok' : 'no', `Preis: ${p} Gold${can ? '' : ' – zu teuer'}`); })),
    h('div.rowbtns', h('button.btn.purple', { class: 'btn purple ' + (run.gold >= R.rerollCost() ? 'ok' : 'no'), onclick: () => G.reroll() }, `Neu würfeln`, h('small', R.rerollCost() + ' Gold'))),
    h('div.hint', 'Grün = kannst du dir leisten, rot = zu teuer. Inventar-Items antippen: Anlegen, Zerlegen oder Verkaufen.')];
}
function shopSheet(i) {
  const o = run.shop.offers[i];
  if (o.sold) return;
  const p = R.itemPrice(o);
  openSheet(itemHead(o), itemInfo(o), h('div.btns',
    h('button.btn.gold', { disabled: run.gold < p, onclick: () => { closeSheet(); G.buy(i); } }, `Kaufen`, h('small', `${p} Gold`)),
    h('button.btn', { onclick: closeSheet }, 'Zurück')));
}
