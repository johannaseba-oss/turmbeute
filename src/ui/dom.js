// Kleine DOM-Helfer: h('div.cls#id', {attrs}, ...kinder), Bottom-Sheet, Toasts.
export const $ = (s) => document.querySelector(s);

export function h(sel, attrs, ...kids) {
  const [, tag = 'div', rest = ''] = sel.match(/^([a-z0-9]*)(.*)$/i);
  const el = document.createElement(tag || 'div');
  for (const m of rest.matchAll(/([.#])([\w-]+)/g)) m[1] === '.' ? el.classList.add(m[2]) : (el.id = m[2]);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('--')) el.style.setProperty(k, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

export function openSheet(...content) {
  const s = $('#sheet'), c = s.querySelector('.sheet-card');
  c.replaceChildren(...content.flat());
  s.classList.remove('hidden');
  s.onclick = (e) => { if (e.target === s) closeSheet(); };
}
export const closeSheet = () => $('#sheet').classList.add('hidden');
export const sheetOpen = () => !$('#sheet').classList.contains('hidden');

export function toast(text) {
  const t = h('div.toast', text);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 2700);
}
export const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(Math.round(n)));
