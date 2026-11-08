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

1. Starter-Typ wählen → Spielautomat zieht 3 Basis-Pokémon auf Lv 1 (eins vom Typ, zwei zufällig; 1× nochmal drehen).
2. Ein Areal hat 15 Kämpfe: 1–13 wilde Pokémon (im 1. Areal erst Nager, kleine Vögel, Käfer, dann stärkere), 14 ein Trainer-Endboss mit Themen-Team eines Typs (Areal 1: 2 Pokémon, jedes Areal eins mehr bis 6, nacheinander, nicht fangbar), 15 ein Legendäres passend zum Level. Danach das nächste, stärkere Areal.
3. Nach jedem Kampf Beute (nehmen oder sofort zerlegen), gefangene Pokémon aufnehmen/tauschen.
4. Rast nach Kampf 5, 10, 13 und am Areal-Ende: alle geheilt und wiederbelebt, Shop (grün = bezahlbar, rot = zu teuer), am Areal-Ende ein Keystone. Verkaufen geht außerhalb des Kampfes jederzeit.

Team: Der Anführer kämpft allein mit seinen eigenen Werten (Pokémon-Formel nach Level) und bis zu 4 Items. Wird er K.O., kommt das nächste Pokémon; verloren ist erst, wenn alle besiegt sind. Besiegte Gegner geben EP an den Kämpfer; mit dem Item EP-Teiler (Shop oder erster Trainer-Sieg) bekommen die anderen die Hälfte, Level ohne Obergrenze, Entwicklungen nach Level oder Stein. Typ-Stacks und Fähigkeiten aller Team-Pokémon gelten fürs ganze Team, Item-Effekte nur für den Träger (außer Gold/Fangen/Shop-Boni).

Kampf-Hintergründe wechseln mit jedem Abschnitt zwischen zwei Rasten (PMD-Dungeon-Bilder aus D:/Pokemon Sprites/Hintergründe), Trainer und Legendäre haben eigene. Trainer-Sprites: public/art/trainers (aus Freundesareale).

Energie: Zeile über den Kampf-Knöpfen; +1 pro Runde (Warten +1 extra), Spezial kostet sie.

Kampfaktionen: Angriff (neutral), Spezial (Typ des Anführers, kostet Energie), Warten, Item verbrauchen, Ball werfen, Pokémon einsetzen (starke Attacke, danach bis zum nächsten Floor erschöpft) oder opfern (Floor-Boost + permanente Affinität). Gegner antippen = anvisieren; über jedem Gegner steht seine nächste Absicht.

Fangen: Formel wie im Original (KP, Fangrate der Art, Ball, Status), 4 Schüttelproben.

## Daten (alles in `public/data/`)

| Datei | Inhalt |
|---|---|
| `balance.json` | Alle Zahlen: Startwerte, Team-Anteile, Energie, Kampf, Gegner-Wachstum, Beute, Shop, Zerlegen, Fangen, Starter |
| `items.json` | Items: `stacks` (Typ-Stacks beim Anlegen), `equip` (Ops), `use` (Verbrauchen), `trigger`, `salvage`, `catch` (Bälle), `tm`, `stone` |
| `stacks.json` | Effekte je Typ-Stack (`per`), Schwellen (`tiers` ab 4/8/12), Synergien mit Entladung (`burst`) |
| `keystones.json` | Lauf-weite Regeländerungen |
| `trainers.json` | Trainer-Endbosse (Typ, Titel, Name, optional Sprite) |
| `pokemon.json` | erzeugt (siehe unten) |
| `types.json` | Typentabelle + Farben |

„Ops“ sind kleine Effekt-Bausteine (`{"op": "burnChance", "v": 0.1}`); die Liste mit Beschreibung steht in `src/mods.js` (`OPS`). Neue Items/Stacks/Keystones brauchen in der Regel nur JSON.

## Assets

- `npm run assets` übernimmt Pokémon-Sprites (Idle/Attack/Hurt + Porträt), Slot-Automat, Effekte und Musik aus `Documents/Freundesareale` und erzeugt `public/data/pokemon.json` (958 Arten).
- `npm run items` schneidet die Item-Icons aus `assets-input/items_hd.png` (160-px-Raster). Zuordnung Item → Zelle steht in `tools/build_items.mjs` (`MAP`). TM-Icons werden aus einer Disc in Typfarbe gefärbt.
- `assets-input/pmd_items.png` (PMD-Item-Sheet) und `assets-input/referenz.jpg` liegen als Referenz bereit.

## Test

`http://localhost:5198/?nosave&bot` → in der Konsole `await __bot.run({ dex: 4, floors: 40 })` spielt automatisch (Balancing). `?nosave` schreibt nichts in den Speicher.
