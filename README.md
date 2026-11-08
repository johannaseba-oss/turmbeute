# Turmbeute

Privates Inventory-Roguelike im Browser (Handy hochkant): einen endlosen Turm aus Pokémon-Kämpfen erklimmen. Der Kampf ist simpel, die Tiefe steckt in Beute, Typ-Stacks und Team.

## Starten

```
npm install
npm run dev
```

Läuft auf `http://localhost:5198`. Durch `--host` ist es auch im WLAN erreichbar (die Adresse „Network“ im Terminal auf dem Handy öffnen). Spielstand und Rekord liegen im `localStorage` des Browsers; der Lauf wird nach jeder Aktion gespeichert.

`npm run build` erzeugt `dist/` (relativer Pfad, läuft auch in einem Unterordner, z. B. GitHub Pages). Als Web-App: im Safari „Zum Home-Bildschirm“.

## Ablauf

1. Starter-Typ wählen → Spielautomat zieht ein passendes Basis-Pokémon (1× nochmal drehen).
2. Jeder Floor: 1–3 Kämpfe, alle 10 Floors ein Boss (ab Floor 20 Legendäre).
3. Nach jedem Kampf Beute (nehmen oder sofort zerlegen), gefangene Pokémon aufnehmen/tauschen.
4. Nach dem Floor Rast: Team levelt (+Entwicklungen), volle Heilung, Shop, alle 5 Floors und nach Bossen ein Keystone.

Kampfaktionen: Angriff (neutral), Spezial (Typ des Anführers, kostet Energie), Warten, Item verbrauchen, Ball werfen, Pokémon einsetzen (starke Attacke, danach bis zum nächsten Floor erschöpft) oder opfern (Floor-Boost + permanente Affinität). Gegner antippen = anvisieren; über jedem Gegner steht seine nächste Absicht.

Fangen: Formel wie im Original (KP, Fangrate der Art, Ball, Status), 4 Schüttelproben.

## Daten (alles in `public/data/`)

| Datei | Inhalt |
|---|---|
| `balance.json` | Alle Zahlen: Startwerte, Team-Anteile, Energie, Kampf, Gegner-Wachstum, Beute, Shop, Zerlegen, Fangen, Starter |
| `items.json` | Items: `stacks` (Typ-Stacks beim Anlegen), `equip` (Ops), `use` (Verbrauchen), `trigger`, `salvage`, `catch` (Bälle), `tm`, `stone` |
| `stacks.json` | Effekte je Typ-Stack (`per`), Schwellen (`tiers` ab 4/8/12), Synergien mit Entladung (`burst`) |
| `keystones.json` | Lauf-weite Regeländerungen |
| `pokemon.json` | erzeugt (siehe unten) |
| `types.json` | Typentabelle + Farben |

„Ops“ sind kleine Effekt-Bausteine (`{"op": "burnChance", "v": 0.1}`); die Liste mit Beschreibung steht in `src/mods.js` (`OPS`). Neue Items/Stacks/Keystones brauchen in der Regel nur JSON.

## Assets

- `npm run assets` übernimmt Pokémon-Sprites (Idle/Attack/Hurt + Porträt), Slot-Automat, Effekte und Musik aus `Documents/Freundesareale` und erzeugt `public/data/pokemon.json` (958 Arten).
- `npm run items` schneidet die Item-Icons aus `assets-input/items_hd.png` (160-px-Raster). Zuordnung Item → Zelle steht in `tools/build_items.mjs` (`MAP`). TM-Icons werden aus einer Disc in Typfarbe gefärbt.
- `assets-input/pmd_items.png` (PMD-Item-Sheet) und `assets-input/referenz.jpg` liegen als Referenz bereit.

## Test

`http://localhost:5198/?nosave&bot` → in der Konsole `await __bot.run({ dex: 4, floors: 40 })` spielt automatisch (Balancing). `?nosave` schreibt nichts in den Speicher.
