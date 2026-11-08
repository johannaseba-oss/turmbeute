// Ziehen & Ablegen außerhalb des Kampfes: Item auf Pokémon = anlegen, auf Inventarplatz = umsortieren.
import { run, canEquip } from '../run.js';
import { h } from './dom.js';
import { itemIconUrl } from '../data.js';
import { G } from '../game.js';

export function startDrag(ev, el, idx) {
  const sx = ev.clientX, sy = ev.clientY;
  let ghost = null, over = null;
  el._dragged = false;
  const move = (e) => {
    if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) < 9) return;
    if (!ghost) { ghost = h('div.dragghost', h('img', { src: itemIconUrl(run.inv[idx].id) })); document.body.append(ghost); el._dragged = true; el.style.opacity = 0.35; }
    ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop],[data-inv]');
    if (over !== t) { over?.classList.remove('drop'); over = t; over?.classList.add('drop'); }
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    el.style.opacity = '';
    over?.classList.remove('drop');
    if (ghost) {
      ghost.remove();
      if (over) drop(idx, over);
      setTimeout(() => (el._dragged = false), 30);
    }
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

function drop(idx, t) {
  const inst = run.inv[idx];
  if (t.dataset.inv != null) {
    const j = +t.dataset.inv;
    [run.inv[idx], run.inv[j]] = [run.inv[j], run.inv[idx]];
    return G.refresh();
  }
  const i = +t.dataset.i;
  if (t.dataset.drop === 'mon' && canEquip(inst)) return G.equip(idx, i);
  G.toastNo('Das kann dort nicht angelegt werden.');
}
