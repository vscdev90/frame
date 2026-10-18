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

**Sturen:** houd links of rechts van het scherm vast, of zet 📱 aan om te sturen door je telefoon te kantelen.
Tik tijdens de knal om meteen naar de uitslag te gaan.

Het spel is er in het **Nederlands en Engels** (*Rocket!*). Het start in het Engels; met de NL/EN-knop rechtsboven in de schuur wissel je naar Nederlands.

## APK installeren

Elke push naar `vuurpijl/` bouwt via GitHub Actions (`.github/workflows/vuurpijl-apk.yml`) een APK en zet die bij
**Releases** als `Vuurpijl.apk`. Download hem op je telefoon, open hem en sta "installeren uit onbekende bronnen" toe.
Nieuwe versies installeren over de oude heen; je voortgang blijft bewaard.

## Structuur

| Pad | Wat |
| --- | --- |
| `www/` | Het spel zelf (HTML5 canvas, geen libraries). Werkt ook gewoon in een browser. |
| `www/logic.js` | Regels, upgrades, evoluties en de natuurkunde — los van de DOM. |
| `www/i18n.js` | Alle teksten in het Nederlands en Engels. |
| `android/` | Minimale Android-app: een schermvullende WebView die `www/` uit de APK laadt. |
| `tests/balance.mjs` | Simuleert een speler en checkt dat de maan haalbaar is in een redelijk aantal vluchten. |
| `tests/play.mjs` | Speelt het spel in een echte browser (aansteken, vliegen, upgraden). |

Lokaal spelen: `cd vuurpijl/www && python3 -m http.server` en open http://localhost:8000.

De keystore in `android/app/` is een hobbysleutel die bewust is meegecommit, zodat updates over elkaar heen installeren.
Gebruik hem niet voor een app in de Play Store.
