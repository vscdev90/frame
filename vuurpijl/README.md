# Vuurpijl! 🚀🎆

Een verslavend lanceer-en-upgrade-spelletje voor Android, in de stijl van *Epic Plane Evolution* en *Penguin Slide* — maar dan met vuurpijlen.

1. **Steek de lont aan** en tik als de naald in het groene vak staat (PERFECT = extra kracht).
2. **Stuur** door je vinger links of rechts op het scherm te houden. Pak munten 🪙, kruit 🧨 en sterren ⭐ (extra turbo), ontwijk vogels, vliegtuigen, ballonnen, meteorieten en satellieten.
3. Als het kruit op is: **KNAL!** Hoe hoger, hoe meer munten.
4. **Upgrade** in de schuur: Kruit, Stuwkracht, Stroomlijn, Lont, Vinnen, Knal, Magneet en Turbo.
5. **Evolueer** je pijl: Sterretje → Knalpijl → Fluitpijl → Gouden Komeet → Dubbele Draak → Maanraket.
6. Het doel: **de maan** (6.000 m).

## APK installeren

Elke push naar `vuurpijl/` bouwt via GitHub Actions (`.github/workflows/vuurpijl-apk.yml`) een APK en zet die bij
**Releases** als `Vuurpijl.apk`. Download hem op je telefoon, open hem en sta "installeren uit onbekende bronnen" toe.
Nieuwe versies installeren over de oude heen; je voortgang blijft bewaard.

## Structuur

| Pad | Wat |
| --- | --- |
| `www/` | Het spel zelf (HTML5 canvas, geen libraries). Werkt ook gewoon in een browser. |
| `www/logic.js` | Regels, upgrades, evoluties en de natuurkunde — los van de DOM. |
| `android/` | Minimale Android-app: een schermvullende WebView die `www/` uit de APK laadt. |
| `tests/balance.mjs` | Simuleert een speler en checkt dat de maan haalbaar is in een redelijk aantal vluchten. |
| `tests/play.mjs` | Speelt het spel in een echte browser (aansteken, vliegen, upgraden). |

Lokaal spelen: `cd vuurpijl/www && python3 -m http.server` en open http://localhost:8000.

De keystore in `android/app/` is een hobbysleutel die bewust is meegecommit, zodat updates over elkaar heen installeren.
Gebruik hem niet voor een app in de Play Store.
