// Test-Bot (nur mit ?bot in der URL): spielt Läufe automatisch für Balancing. Aufruf in der Konsole: await __bot.run({ floors: 40 }) (dex = festes Einzel-Team)
// smart = legt Items an, kauft Tränke, setzt Pokémon bei Bossen ein. Ergebnis: erreichter Floor + Werte je Rast.
import { rollStarters } from './ui/starter.js';

export function installBot(G, R, K, stage) {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const JUNK = /ball|trank|x-|bonbon|fragment|nugget|star-piece|comet|shiny-shard|hyperheiler|beere|lucky|everstone/;
  async function play({ dex = null, floors = 40, ms = 120000, smart = true } = {}) {
    stage.speed = 500;
    document.querySelector('#overlay').classList.add('hidden');
    G.newRun(dex ? [dex] : rollStarters());
    const t0 = Date.now(), log = [];
    while (Date.now() - t0 < ms) {
      const run = __tb.run;
      if (run.phase === 'over' || run.floor > floors) break;
      if (run.phase === 'battle' && run.battle) {
        if (run.battle.busy) { await new Promise((r) => setTimeout(r, 5)); continue; }
        const b = run.battle, st = K.P().stats;
        const balls = run.inv.map((x, i) => [x, i]).filter(([x]) => x && /ball$/.test(x.id) && !x.id.includes('-'));
        const low = K.alive().find((e) => e.hp / e.max < 0.35 && !e.boss);
        const potion = run.inv.findIndex((x) => x && ['trank', 'supertrank', 'hypertrank'].includes(x.id));
        const freeMon = run.team.findIndex((m) => !m.used);
        if (run.team[0].hp < st.hp * 0.35 && potion >= 0) await G.act('item', { idx: potion });
        else if (low && balls.length && run.team.length < 6) { b.targetUid = low.uid; await G.act('ball', { idx: balls[0][1] }); }
        else if (smart && freeMon >= 0 && K.alive().some((e) => e.boss || e.elite)) await G.act('mon', { idx: freeMon });
        else if (b.energy >= K.specialCost()) await G.act('special');
        else await G.act('attack');
      } else if (run.phase === 'loot') {
        while (run.loot.mons.length) { if (run.team.length < 6) G.takeMon(0); else G.dropMon(0); }
        run.loot.items.forEach((it, i) => { if (R.freeSlots() > 0) G.takeLoot(i); else G.salvageLoot(i); });
        await G.next();
      } else if (run.phase === 'keystone') G.pickKeystone(run.ksOffer[0]);
      else if (run.phase === 'rest') {
        if (smart) {
          run.team.forEach((m, mi) => { for (let k = m.held.length; k < 4; k++) { const i = run.inv.findIndex((x) => x && !JUNK.test(x.id)); if (i >= 0) G.equip(i, mi); } });
          run.shop.offers.forEach((o, i) => { if (o.fixed && o.id === 'trank' && run.gold > 40) G.buy(i); });
        }
        const s = K.P().stats;
        log.push(`F${run.floor} hp${s.hp} atk${s.atk} spa${s.spa} def${s.def} g${run.gold} team${run.team.length} lv${run.team.map((m) => m.level).join('/')}`);
        run.inv.forEach((x, i) => { if (x && !x.id.includes('ball') && !x.id.includes('trank')) G.salvage(i); });
        await G.next();
      } else await new Promise((r) => setTimeout(r, 30));
      await tick();
    }
    const run = __tb.run;
    return { floor: run.floor, phase: run.phase, kills: run.stats.kills, caught: run.stats.caught, team: run.team.map((m) => m.dex + ':' + m.level), log };
  }
  window.__bot = { run: play };
}
