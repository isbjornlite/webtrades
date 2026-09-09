# DXY / Gold Mismatch — Paper Trading

Forskningsverktøy for å teste en DXY/Gold-divergensstrategi over tid, med
**fake money**. Ingen ekte handler, ingen broker, ingen ekte penger noe sted
i dette prosjektet.

Systemet kjører automatisk i skyen via GitHub Actions (gratis), og
dashbordet vises via GitHub Pages (gratis, statisk nettside). Du trenger
aldri å ha en nettleser eller telefon åpen for at det skal fungere — det
kjører uansett.

## Oppsett (gjør dette én gang, fra telefonen)

### 1. Opprett repoet
Opprett et nytt GitHub-repo (offentlig er enklest) og last opp/pakk ut
innholdet i denne zip-filen i repoet, slik at mappestrukturen ser slik ut
i rot:

```
.github/workflows/sync.yml
src/
docs/
package.json
```

### 2. Legg til API-nøkkelen som en secret
Gå til repoet → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**

- Name: `TWELVE_DATA_API_KEY`
- Secret: (lim inn Twelve Data-nøkkelen din)

Nøkkelen er da skjult og ligger aldri i noen fil i repoet.

### 3. Skru på GitHub Pages
Gå til repoet → **Settings** → **Pages**

- Source: **Deploy from a branch**
- Branch: **main**, mappe: **/docs**
- Lagre

Etter et minutt eller to får du en lenke som `https://brukernavn.github.io/repo-navn/`
— det er dashbordet ditt. Bokmerk den på telefonen.

### 4. Kjør den første synkroniseringen manuelt
Gå til repoet → **Actions**-fanen → velg workflowen **"Sync DXY/Gold paper
trading state"** → **Run workflow** → **Run workflow**.

Dette tar ca. 3–4 minutter (28 API-kall med innebygd forsinkelse for å
holde seg innenfor Twelve Data sin gratis rate-grense). Når den er ferdig
(grønn hake), åpne Pages-lenken din — dashbordet skal nå vise ekte data.

## Hvordan det kjører videre

- Workflowen kjører automatisk **hver time** (cron), henter nye barer,
  kjører strategimotoren, og committer oppdatert state tilbake til repoet
- Dashbordet leser alltid den siste committede staten — bare åpne
  Pages-lenken når du vil sjekke status
- Merk: GitHub deaktiverer automatisk planlagte (cron) workflows hvis
  repoet er helt inaktivt i 60 dager. Gjør du ingenting annet med repoet,
  kan du trenge å trykke "Run workflow" manuelt igjen etter en lang pause,
  eller committe noe smått innimellom

## Justere strategiparametere

Alt ligger i `src/config.js`. Endre en verdi, commit, push — neste
planlagte kjøring bruker de nye parameterne automatisk (historiske trades
endres ikke, kun fremtidig oppførsel).

## Kjøre en backtest

Live-systemet bygger opp historikk sakte (bar for bar, i sanntid). Vil du
se raskt om strategien har hatt et fortrinn over en lengre historisk
periode, kan du kjøre en engangs-backtest:

1. Gå til repoet → **Actions** → velg **"Backtest DXY/Gold strategy"** →
   **Run workflow**
2. La feltet "outputsize" stå på standardverdien (5000 barer), eller sett
   et lavere tall hvis Twelve Data-planen din ikke tillater så mye historikk
3. Vent til den er ferdig (samme ventetid som en vanlig synk, ca. 3–4 min)
4. Åpne dashbordet ditt og trykk **"Se backtest-resultater"** øverst

Backtesten kjører strategien over hele den hentede historikken i én omgang,
med en helt fersk konto ($10 000) — den påvirker **ikke** de løpende
paper-trading-kontoene dine. Du kan kjøre den på nytt så ofte du vil; hver
kjøring overskriver forrige backtest-resultat.

## Nullstille en konto

Slett (eller tøm) `docs/data/state-<timeframe>.json` via GitHub sin
nettside (rediger filen direkte i nettleseren, eller be Copilot om det).
Neste kjøring oppretter en frisk konto med $10 000 automatisk.

## Datakilde og antagelser (viktig å vite)

- **DXY** finnes ikke gratis som direkte feed. Den bygges syntetisk fra de
  6 valutaparene som utgjør indeksen (offisiell ICE-formel).
- **ATR-periode**: 14 (standard, ikke eksplisitt spesifisert i strategien).
- **DXY reversal exit**: målt fra DXY-prisen ved trade-entry.
- **Price action-bekreftelse**: forenklet regel (candle-body retning +
  høyere/lavere close enn forrige bar). Dette er den mest "gjettede" delen
  av implementasjonen og bør trolig justeres etter at du har sett den i
  praksis.
- Rate-begrensning: 7 symboler × 4 timeframes = 28 kall per synk, hver
  time = 672 kall/dag, under Twelve Data sin gratis grense på 800/dag.

Dette er kun et forsknings- og paper-trading-prosjekt. Ingen ekte penger,
ingen ekte kjøp/salg, ingen broker er involvert noe sted.
