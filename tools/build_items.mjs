// Schneidet die Item-Icons aus assets-input/items_hd.png (Raster 160 px, Zelle "zeile.spalte") → public/art/items/<id>.png
// Neue Items: Zelle hier eintragen und `npm run items` ausführen.
import fs from 'node:fs';
import sharp from 'sharp';

const SRC = 'assets-input/items_hd.png', OUT = 'public/art/items/', CELL = 160, SIZE = 96;
const MAP = {
  pokeball: '0.3', superball: '0.2', hyperball: '0.1', meisterball: '0.0', netzball: '0.5', tauchball: '0.6', finsterball: '0.11', nestball: '0.7',
  luxusball: '0.9', heilball: '0.12', flottball: '0.13', timerball: '0.8', koederball: '13.7', schwerball: '13.8', mondball: '13.11', turboball: '13.13',
  trank: '0.15', supertrank: '0.23', hypertrank: '0.24', hyperheiler: '0.21', 'x-angriff': '1.25', 'x-abwehr': '1.24', 'x-spezial': '2.0', 'x-tempo': '2.1', sonderbonbon: '1.19',
  sinelbeere: '3.13', tsitrubeere: '3.16', prunusbeere: '3.15', lydzibeere: '4.1', liechibeere: '4.25',
  'fire-stone': '2.12', 'thunder-stone': '2.13', 'water-stone': '2.14', 'leaf-stone': '2.15', 'dusk-stone': '3.0', 'dawn-stone': '3.1', 'ice-stone': '3.5', 'moon-stone': '3.3', 'sun-stone': '3.4', 'shiny-stone': '3.6',
  leftovers: '6.10', 'shell-bell': '7.1', 'kings-rock': '6.0', 'amulet-coin': '6.2', 'lucky-egg': '6.7', 'oval-stone': '6.5', 'hard-stone': '6.13', 'miracle-seed': '6.14',
  'black-glasses': '6.15', 'black-belt': '6.16', magnet: '6.17', 'mystic-water': '6.18', 'sharp-beak': '6.19', 'poison-barb': '6.20', 'never-melt-ice': '6.21', 'spell-tag': '6.22',
  'twisted-spoon': '6.23', charcoal: '6.24', 'dragon-fang': '6.25', 'silk-scarf': '7.0', 'silver-powder': '6.12', 'soft-sand': '6.1', 'metal-coat': '8.0', 'fairy-feather': '5.20',
  'scope-lens': '7.4', 'quick-claw': '5.22', 'choice-band': '6.6', 'focus-sash': '7.13', 'choice-scarf': '5.25', 'choice-specs': '8.9', 'life-orb': '7.9', 'toxic-orb': '7.11',
  'flame-orb': '7.12', 'tide-orb': '6.4', 'prism-orb': '6.11', 'expert-belt': '7.5', 'rocky-helmet': '5.21', everstone: '2.11', 'iron-ball': '7.16', 'heat-rock': '7.21',
  'icy-rock': '7.23', 'damp-rock': '7.20', 'smooth-rock': '7.22', 'spike-core': '7.17', 'hard-core': '7.24', 'pale-pearl': '2.19', 'red-shard': '8.1', 'blue-shard': '8.5',
  'green-shard': '8.6', 'yellow-shard': '8.4', 'star-piece': '2.21', 'comet-shard': '14.10', 'shiny-shard': '1.0', nugget: '2.22', 'big-nugget': '14.8', 'wide-lens': '7.14',
  'metronome': '7.15', 'black-sludge': '7.8', 'soothe-bell': '5.23', 'big-root': '5.0',
  'tafel-feuer': '8.10', 'tafel-wasser': '8.11', 'tafel-elektro': '8.12', 'tafel-pflanze': '8.13', 'tafel-eis': '8.14', 'tafel-kampf': '8.15', 'tafel-gift': '8.16', 'tafel-boden': '8.17',
  'tafel-flug': '8.18', 'tafel-psycho': '8.19', 'tafel-kaefer': '8.20', 'tafel-gestein': '8.21', 'tafel-geist': '8.22', 'tafel-drache': '8.23', 'tafel-unlicht': '8.24', 'tafel-stahl': '8.25',
  'tafel-normal': '18.13', 'tafel-fee': '19.4',
};
// TMs: weiße Disc in Typfarbe einfärben
const TYPES = JSON.parse(fs.readFileSync('public/data/types.json', 'utf8')).colors;
const DISC = '9.8';
const cell = (rc) => { const [r, c] = rc.split('.').map(Number); return sharp(SRC).extract({ left: c * CELL, top: r * CELL, width: CELL, height: CELL }); };
const slug = (t) => t.toLowerCase().replace('ä', 'ae');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const [id, rc] of Object.entries(MAP)) await cell(rc).resize(SIZE, SIZE).png().toFile(OUT + id + '.png');
for (const [t, hex] of Object.entries(TYPES)) {
  const n = parseInt(hex.slice(1), 16);
  await cell(DISC).tint({ r: n >> 16, g: (n >> 8) & 255, b: n & 255 }).resize(SIZE, SIZE).png().toFile(OUT + 'tm-' + slug(t) + '.png');
}
// Meisterball-Fragment: linke Hälfte des Meisterballs
const mb = await cell(MAP.meisterball).png().toBuffer();
await sharp(mb).extract({ left: 0, top: 0, width: 84, height: CELL }).extend({ right: 76, background: { r: 0, g: 0, b: 0, alpha: 0 } }).rotate(-20, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize(SIZE, SIZE).png().toFile(OUT + 'master-fragment.png');
console.log('Icons:', fs.readdirSync(OUT).length);
