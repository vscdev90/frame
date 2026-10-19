# Vuurpijl! 🚀🎆

Een verslavend lanceer-en-upgrade-spelletje voor Android, in de stijl van *Epic Plane Evolution* en *Penguin Slide* — maar dan met vuurpijlen.

1. **Steek de lont aan** en tik als de naald in het groene vak staat (PERFECT = extra kracht).
2. **Stuur** door je vinger links of rechts op het scherm te houden. Pak munten 🪙, kruit 🧨 en sterren ⭐ (extra turbo), ontwijk vogels, vliegtuigen, ballonnen, meteorieten en satellieten.
3. Als het kruit op is: **KNAL!** Hoe hoger, hoe meer munten.
4. **Upgrade** in de schuur: Kruit, Stuwkracht, Stroomlijn, Lont, Vinnen, Knal, Magneet en Turbo.
5. **Evolueer** je pijl: Sterretje → Knalpijl → Fluitpijl → Gouden Komeet → Dubbele Draak → Maanraket.
6. Het doel: voorbij **de maan** (6.000 m) langs Mars, de asteroïdengordel, Jupiter, Saturnus en Neptunus naar **het zwarte gat** (52.000 m).

**Lanceerplekken (levels)** komen vrij als je hoog genoeg bent geweest, en betalen meer munten:
🏡 Achtertuin → 🏖️ Strand (150 m) → 🏙️ Stad (600 m) → 🏔️ Bergtop (1.500 m) → 🛰️ Lanceerbasis (3.000 m).
Onderweg vlieg je door onweer in de wolken, noorderlicht in de stratosfeer en langs planeten in de ruimte.

**Wat je lanceert** koop je één keer en kies je voor elke vlucht. Alles heeft een eigen eigenschap en explosie:
- Vuurwerk: 🎆 Klassiek · 💣 Dikke Bertha · 😱 Gierpijl · 🕯️ Lange Brander · 💰 Goudzoeker · ⏫ Tweetrapper
- Gekke dingen: 🥤 Colafles + snoepjes · 🚽 Vliegende wc-pot · 🐄 Scheetkoe · 🐷 Scheetvarken · 🧯 Gasfles ·
  🍌 Reuzenbanaan · 🥕 Reuzenwortel · 🍾 Champagnefles · 🧨 Cartoonraket
- Machines: ✈️ Straaljager · 🛩️ Hover-jet · 🥷 Stealth-jet met liftfan · 🛸 Retro-UFO · 🚀 Ruimteraket (3 trappen)

Echte merknamen (NASA, F-16, F-35, Mentos, ACME, …) zitten er bewust niet in.

**Elke dag iets te doen:**
- 📅 Drie dagelijkse missies (plus een bonuskist als je ze alle drie haalt).
- 🔥 Combo's: munten achter elkaar pakken zonder te botsen geeft tot ×5 munten.
- 🛡️ Schild, 🧲 magneet en ⏳ slow-mo als power-ups, 💰 gouden wolken met een muntenregen.
- ⚠️ Bazen: een reuzenmeeuw (450 m), een ruimtewalvis (16.500 m) en een moederschip (23.500 m). Ontwijken levert veel op.
- 🌧️ Weer per vlucht: regen, wind, sneeuw in de winter en vuurwerk overal op oudjaar (munten ×2).
- 🏆 Verzameling: 18 prestaties, skins (zonnebril, feesthoed, kerstmuts, propellerpet, regenboogspoor, kroon) en een sterrenkaart.
- 👻 Een spook van je recordvlucht vliegt mee.
- 📤 Deel een plaatje van je score.
- 🌌 Na het zwarte gat: begin een nieuw heelal en verdien voortaan meer munten (prestige).

**Show:** opstartscherm met menu-muziek (zelf gesynthetiseerd, geen audiobestanden), een aftelling met stem voor de
ruimteraket (de spraakfunctie van je telefoon), rook en vuur bij het opstijgen en een pepermuntje dat in de colafles valt.

**Cheatmodus:** tik 5× snel op de titel ROCKET! in de schuur. Dit kan alleen in de testversie (`Rocket.apk`) en in de
browser; de Play Store-versie heeft geen cheats.

**Beloningsfilmpjes (alleen in de Android-app):** kijk vrijwillig een filmpje voor 2× munten na een vlucht, of voor
+2 turbo bij je volgende vlucht (eens per 4 minuten). Via Google AdMob, met het verplichte toestemmingsformulier in de EU.

**Sturen:** houd links of rechts van het scherm vast, of zet 📱 aan om te sturen door je telefoon te kantelen.
Tik tijdens de knal om meteen naar de uitslag te gaan.

Het spel (*Rocket!*) is altijd volledig in het Engels. De Nederlandse teksten staan nog in `i18n.js`, maar worden niet gebruikt.

## APK installeren en de Play Store

Elke push naar `vuurpijl/` bouwt via GitHub Actions (`.github/workflows/vuurpijl-apk.yml`) twee versies:

- **`Rocket.apk`** bij **Releases**: de testversie (cheatmodus, testreclame van Google). Download hem op je telefoon,
  open hem en sta "installeren uit onbekende bronnen" toe. Nieuwe versies installeren over de oude heen.
- **`Rocket-play.aab`**: de versie voor Google Play (pakket `io.github.vscdev90.rocket`, geen cheats, echte reclame).
  Die verschijnt als privébestand bij de Actions-run zodra je uploadsleutel als secret in GitHub staat.

Hoe je het spel in de Play Store krijgt: zie **[DEPLOY.md](DEPLOY.md)**.

## Play Store-plaatjes

`store/` bevat het icoon (512×512), de banner (1024×500) en zes screenshots (1080×1920) met koppen, allemaal gemaakt
uit het echte spel. Opnieuw maken (bijvoorbeeld na nieuwe graphics), met het spel lokaal geserveerd:

```
cd vuurpijl/www && python3 -m http.server 8897 &
node vuurpijl/tools/store-art.mjs
```

Dat script maakt ook het app-icoon (`android/app/src/main/res/mipmap-*`).

Lettertypes: Lilita One en Fredoka, beide onder de SIL Open Font License (zie `www/fonts/`).

## Structuur

| Pad | Wat |
| --- | --- |
| `www/` | Het spel zelf (HTML5 canvas, geen libraries). Werkt ook gewoon in een browser. |
| `www/logic.js` | Regels, upgrades, evoluties en de natuurkunde — los van de DOM. |
| `www/meta.js` | Missies, prestaties, skins, weer, bazen en prestige — los van de DOM. |
| `www/i18n.js` | Alle teksten (het spel gebruikt alleen de Engelse). |
| `android/` | Minimale Android-app: een schermvullende WebView die `www/` uit de APK laadt. |
| `tests/balance.mjs` | Simuleert een speler en checkt dat de maan haalbaar is in een redelijk aantal vluchten. |
| `tests/meta.mjs` | Test missies, prestaties, weer en prestige. |
| `tests/play.mjs` | Speelt het spel in een echte browser (aansteken, vliegen, upgraden). |

Lokaal spelen: `cd vuurpijl/www && python3 -m http.server` en open http://localhost:8000.

De keystore in `android/app/` is een hobbysleutel die bewust is meegecommit, zodat de test-APK's over elkaar heen
installeren. De Play-versie gebruikt hem niet: die wordt ondertekend met jouw eigen, geheime uploadsleutel.
