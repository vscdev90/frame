# Rocket! in de Google Play Store zetten

Dit stappenplan zet het spel in de Play Store. Het technische werk is gedaan; wat overblijft zijn accounts,
sleutels en formulieren die alleen jij kunt invullen.

Google verandert de regels af en toe. Lees bij twijfel de uitleg in de Play Console zelf.

## Wat er al klaar is

| Wat | Waar |
| --- | --- |
| Play-versie van het spel: echte reclame, Android 16 (API 36) | build-flavor `play` in `android/app/build.gradle` |
| Pakketnaam (uniek, kan na de eerste upload **nooit** meer veranderen) | `io.github.vscdev90.rocket` |
| App-bundle (.aab) bouwen en ondertekenen | GitHub Actions, zodra stap 2 gedaan is |
| Beloningsfilmpjes (AdMob) + toestemmingsformulier voor de EU | `MainActivity.java`, `game.js` |
| Icoon, banner, 6 screenshots | `store/` |
| Store-teksten (Engels) | `store/listing.md` |
| Privacyverklaring (Engels) | `store/privacy-policy.html` |

Er zijn twee versies:

- **`Rocket.apk`** (GitHub Releases) is je testversie: met de testreclame van Google.
  Deze installeert over je huidige app heen.
- **`Rocket-play.aab`** is wat je naar Google uploadt: met jouw echte reclame.
  Dit bestand komt nooit in de openbare releases, alleen in de (privé) bestanden van de GitHub Actions-run.

## 1. Google Play-ontwikkelaarsaccount

1. Ga naar <https://play.google.com/console> en maak een account aan.
   - Kosten: eenmalig 25 dollar.
   - Je moet 18 jaar of ouder zijn.
   - Google controleert je identiteit, wat een paar dagen kan duren.
2. Kies een **persoonlijk** account, tenzij je een bedrijf hebt.
3. **Let op:** nieuwe persoonlijke accounts moeten eerst een **gesloten test** doen voordat je naar iedereen mag
   publiceren. Dat zijn minimaal **12 testers**, die **14 dagen** lang meedoen. Regel dus vrienden en familie met een
   Android-telefoon en een Google-account.

## 2. Uploadsleutel maken en in GitHub zetten

Google ondertekent de echte app zelf ("Play App Signing"). Jij hebt alleen een **uploadsleutel** nodig om te bewijzen
dat een upload van jou komt.

**Maak hem op je eigen computer.** Daarvoor heb je Java nodig (bijvoorbeeld via Android Studio), want daarin zit `keytool`:

```
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Kies een sterk wachtwoord. **Bewaar `upload.jks` en het wachtwoord goed** (bijvoorbeeld in een wachtwoordmanager).
Zet het bestand **niet** in de repo.

Zet de sleutel in GitHub:
1. Ga naar **Settings → Secrets and variables → Actions → New repository secret**.
2. Maak deze vier secrets aan:

| Secret | Waarde |
| --- | --- |
| `UPLOAD_KEYSTORE_BASE64` | de inhoud van `upload.jks` als base64 (zie hieronder) |
| `UPLOAD_KEYSTORE_PASSWORD` | het wachtwoord |
| `UPLOAD_KEY_ALIAS` | `upload` |
| `UPLOAD_KEY_PASSWORD` | het wachtwoord (hetzelfde, tenzij je een apart sleutelwachtwoord koos) |

Base64 maken:
- Mac/Linux: `base64 -i upload.jks | pbcopy` (Mac) of `base64 -w0 upload.jks` (Linux)
- Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload.jks")) | Set-Clipboard`

Vanaf de volgende build staat er bij de GitHub Actions-run een bestand **Rocket-play-bundle** (een zip met `Rocket-play.aab`).

## 3. AdMob (de reclame)

1. Maak een account op <https://admob.google.com> met hetzelfde Google-account.
2. **Apps → Add app**: kies Android, "nee, nog niet in een store", en geef de naam Rocket!.
3. Je krijgt een **App ID** (`ca-app-pub-…~…`). Zet die in GitHub als secret **`ADMOB_APP_ID`**.
4. **Ad units → Add ad unit → Rewarded**, naam bijvoorbeeld "Rewarded".
   Zet de **Ad unit ID** (`ca-app-pub-…/…`) als secret **`ADMOB_REWARDED_ID`**.
5. **Privacy & messaging → GDPR**: maak een toestemmingsbericht voor de EU en publiceer het.
   Zonder dit bericht kan de app in Europa geen toestemming vragen, en dan krijgen Europese spelers geen filmpjes.
6. Koppel later, na publicatie, de app in AdMob aan je Play Store-app.
7. Klik **nooit** op je eigen echte advertenties. Dat kan je AdMob-account kosten.
   Test met `Rocket.apk`: die gebruikt altijd de testreclame van Google.

Zonder `ADMOB_APP_ID` werkt de Play-versie gewoon, maar dan met de testreclame. Die levert niets op.

## 4. Privacyverklaring online zetten

Google wil een webadres voor je privacyverklaring.

1. Vul eerst je contact-e-mailadres in op de plek van `[YOUR CONTACT EMAIL]` in `store/privacy-policy.html`.
2. Zet de pagina online. Twee mogelijkheden:
   - **GitHub Pages:** deze repo heeft al een Pages-workflow. Zet in **Settings → Pages** de bron op
     "GitHub Actions" en voeg de branch samen met `main`. De pagina staat dan op
     `https://vscdev90.github.io/frame/vuurpijl/store/privacy-policy.html`.
   - **Google Sites:** maak een gratis pagina op <https://sites.google.com> en plak de tekst erin.

## 5. De app aanmaken in de Play Console

1. **Create app**:
   - naam uit `store/listing.md`
   - taal English (United States)
   - **Game**
   - **Free**
2. **Store listing**: teksten uit `store/listing.md`, plaatjes uit `store/`.
3. **App content** (alles invullen):
   - **Privacy policy:** het adres uit stap 4.
   - **Ads:** *Yes, my app contains ads*.
   - **App access:** alles is toegankelijk zonder inloggen.
   - **Content rating:** vul de vragenlijst eerlijk in. Er zitten tekenfilm-explosies in, grappige scheten en geen
     geweld tegen mensen. Meestal kom je dan uit op PEGI 3 of 7.
   - **Target audience:** kies **13+**. Als je ook kinderen onder 13 kiest, gelden de strenge Families-regels voor
     reclame. Door de vrolijke stijl kan Google vragen of het spel kinderen aantrekt; antwoord eerlijk.
   - **Data safety:**
     - De app **verzamelt** *Device or other IDs* (advertentie-ID), via AdMob, voor **Advertising or marketing**
       en **Analytics**, en **deelt** die met Google.
     - Data is versleuteld onderweg.
     - Er zijn geen accounts. De spelvoortgang blijft op het toestel en wordt niet verzameld.
   - **Advertising ID:** *Yes*, voor advertenties.
4. **Testing → Closed testing**:
   - maak een release
   - upload `Rocket-play.aab`
   - accepteer **Play App Signing**
   - voeg de e-mailadressen van je testers toe
5. Na 14 dagen met minstens 12 testers: vraag **toegang tot productie** aan, en maak daarna een productie-release.

## 6. Updates

Elke push naar GitHub bouwt een nieuwe versie met een hoger versienummer. Voor een update:
1. Download de nieuwe `Rocket-play-bundle` bij de laatste run.
2. Upload hem in de Play Console als nieuwe release.

## Controlelijst voor je eerste release

- [ ] Getest op minstens één echte telefoon (met `Rocket.apk`)
- [ ] De vier upload-secrets staan in GitHub en de laatste run heeft een `Rocket-play-bundle`
- [ ] `ADMOB_APP_ID` en `ADMOB_REWARDED_ID` staan in GitHub
- [ ] GDPR-bericht gepubliceerd in AdMob
- [ ] Contact-e-mail ingevuld in de privacyverklaring, en de pagina staat online
- [ ] Store listing, content rating, doelgroep en data safety ingevuld
- [ ] 12 testers uitgenodigd voor de gesloten test
