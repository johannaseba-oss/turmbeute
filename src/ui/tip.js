// Hover-Tooltip (nur mit Maus): zeigt beim Überfahren Effekte und Aufwertungen eines Items. Auf dem Handy öffnet Antippen das Detail-Sheet.
import { h } from './dom.js';

let tip = null;
function place(e) {
  const pad = 14, w = tip.offsetWidth, hgt = tip.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth - 8) x = e.clientX - w - pad;
  if (y + hgt > innerHeight - 8) y = Math.max(8, innerHeight - hgt - 8);
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = y + 'px';
}
export function hideTip() { tip?.remove(); tip = null; }
export function attachTip(el, build) {
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    hideTip();
    tip = h('div.tip', build());
    document.body.append(tip);
    place(e);
  });
  el.addEventListener('pointermove', (e) => { if (tip && e.pointerType === 'mouse') place(e); });
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('pointerdown', hideTip);
}
