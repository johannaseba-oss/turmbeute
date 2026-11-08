// Übernimmt die fertigen Sprites aus Freundesareale und erzeugt public/data/pokemon.json.
// Aufruf: npm run assets   (Quelle per SRC=... überschreibbar)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = process.env.SRC || 'C:/Users/johan/Documents/Freundesareale';
const PUB = path.resolve('public');
const read = (p) => JSON.parse(fs.readFileSync(path.join(SRC, p), 'utf8'));
const mk = (p) => fs.mkdirSync(p, { recursive: true });
const cp = (from, to) => { mk(path.dirname(to)); fs.copyFileSync(from, to); };
const pad = (n) => String(n).padStart(4, '0');

// --- Pokémon ---------------------------------------------------------------
const dex = read('public/data/pokedex.json');
const battle = read('public/data/battle.json');
const csv = fs.readFileSync(path.join(SRC, 'tools/data/pokemon_species.csv'), 'utf8').trim().split('\n');
const head = csv.shift().split(',');
const col = (n) => head.indexOf(n);
const species = new Map(csv.map((l) => { const c = l.split(','); return [+c[0], { capture: +c[col('capture_rate')], legendary: c[col('is_legendary')] === '1', mythical: c[col('is_mythical')] === '1', baby: c[col('is_baby')] === '1' }]; }));

const ANIMS = ['Idle', 'Attack', 'Hurt'];
const out = [];
for (const p of dex) {
  const b = battle.pokemon[p.dex], sp = species.get(p.dex);
  if (!b || !sp || !ANIMS.every((a) => p.anims[a])) continue;
  const mv = battle.moves[b.move];
  const dir = path.join(SRC, 'public/sprites', pad(p.dex));
  if (!fs.existsSync(path.join(dir, 'p_Normal.png'))) continue;
  for (const f of [...ANIMS.map((a) => p.anims[a].file), 'p_Normal.png']) cp(path.join(dir, f), path.join(PUB, 'sprites', pad(p.dex), f));
  out.push({
    dex: p.dex, name: p.name, types: p.types, rarity: p.rarity, stage: p.stage, family: p.family,
    legendary: sp.legendary, mythical: sp.mythical, baby: sp.baby, catch: sp.capture,
    base: b.base,
    move: mv ? { name: mv.name, type: mv.type, cat: mv.cat === 'spez' ? 'spez' : 'phys', power: mv.power || 60 } : { name: 'Tackle', type: p.types[0], cat: 'phys', power: 40 },
    evos: (b.evos || []).filter((e) => !e.gender).map((e) => (e.stone ? { to: e.to, stone: e.stone } : { to: e.to, level: e.level || 30 })),
    anims: Object.fromEntries(ANIMS.map((a) => { const x = p.anims[a]; return [a, { fw: x.fw, fh: x.fh, cols: x.cols, rows: x.rows, dur: x.dur, file: x.file }]; })),
  });
}
// Entwicklungen nur auf Arten, die es auch gibt
const have = new Set(out.map((p) => p.dex));
for (const p of out) p.evos = p.evos.filter((e) => have.has(e.to));
fs.writeFileSync(path.join(PUB, 'data/pokemon.json'), JSON.stringify(out));
console.log('Pokémon:', out.length);

// --- Bilder ----------------------------------------------------------------
cp(path.join(SRC, 'public/art/slots/sheet.png'), path.join(PUB, 'art/slots/sheet.png'));
for (const f of fs.readdirSync(path.join(SRC, 'public/art/vfx'))) cp(path.join(SRC, 'public/art/vfx', f), path.join(PUB, 'art/vfx', f));
const vfx = read('public/config/vfx.json');
fs.writeFileSync(path.join(PUB, 'data/vfx_sheets.json'), JSON.stringify(vfx.sheets));

// Musik + Geräusche
for (const f of ['zeitturm.mp3', 'gilde.mp3', 'verborgenes-land.mp3']) cp(path.join(SRC, 'public/audio', f), path.join(PUB, 'audio', f));
for (const f of ['ballfall.wav', 'muenze.wav', 'mechanik.wav', 'fp_klick.wav', 'fp_richtig.wav', 'fp_fehler.wav', 'fp_whoosh.wav', 'fp_rang.wav']) cp(path.join(SRC, 'public/audio/sfx', f), path.join(PUB, 'audio/sfx', f));
console.log('fertig – Item-Icons: npm run items');
