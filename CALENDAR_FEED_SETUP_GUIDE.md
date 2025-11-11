# Aula-kalender: Trin-for-trin guide

Denne vejledning hjælper dig, der ikke arbejder til daglig med kode, med at få kalenderfeedet fra Aula til at virke sammen med den eksisterende Node.js-backend i dette projekt. Følg trinnene i rækkefølge, og hak gerne af undervejs.

---

## 1. Forberedelse

1. **Sørg for adgang til serveren**  
   Du skal kunne logge ind på den maskine, hvor Node.js-projektet ligger. Typisk sker det via `ssh` eller et grafisk kontrolpanel.

2. **Kontrollér Node.js og npm**  
   Åbn en terminal/kommandoprompt og skriv:
   ```bash
   node -v
   npm -v
   ```
   Begge kommandoer skal vise et versionsnummer (fx `v18.19.0` og `9.6.7`). Hvis du får en fejl, skal du installere Node.js fra [nodejs.org](https://nodejs.org/) (vælg LTS-udgaven).

3. **Find projektmappen**  
   Navigér hen til roden af dette projekt (den mappe, der indeholder `package.json`). I terminalen kan du bruge `cd` (change directory).

---

## 2. Løsning af npm 403-fejl

`npm install` mislykkes, fordi serveren ikke får lov til at hente pakken `node-ical` fra npm-registret. Gør følgende:

### Trin 2A · Test internetadgang til npm

1. Kør:
   ```bash
   npm view node-ical version
   ```
2. Får du igen `403 Forbidden`, betyder det, at enten netværket blokerer, eller at din npm-bruger mangler adgang.

### Trin 2B · Hvis der bruges egen npm-registry

1. Spørg din IT-ansvarlige, om organisationen bruger en privat npm-server.  
2. Hvis svaret er ja, skal du tilføje adressen i en `.npmrc`-fil i projektmappen:
   ```bash
   echo "registry=https://<din-private-registry>/" >> .npmrc
   ```
3. Kræver registry’et login, så få udleveret et token og kør:
   ```bash
   npm config set //<din-private-registry>/:_authToken <TOKEN>
   ```
4. Kør derefter `npm install` igen.

### Trin 2C · Hvis der **ikke** er privat registry (manuel installation)

1. Find en computer med adgang til `https://registry.npmjs.org`.  
2. Download pakken:
   ```bash
   curl -O https://registry.npmjs.org/node-ical/-/node-ical-0.15.1.tgz
   ```
3. Overfør filen `node-ical-0.15.1.tgz` til serveren (fx via SFTP).  
4. På serveren, i projektmappen, kør:
   ```bash
   npm install ./node-ical-0.15.1.tgz
   ```
5. Når installationen er færdig, slettes filen valgfrit med `rm node-ical-0.15.1.tgz`.

Når `npm install` kører uden fejl, er kalenderfunktionen klar til brug.

---

## 3. Konfigurer kalenderfeedet

1. **Åbn konfigurationsfilen**  
   Backend'en forventer, at kalenderen initialiseres fra `sonos-local-server.js`. Hvis du vil ændre indstillinger (fx feed-URL eller hvor ofte den skal opdatere), kan du bruge miljøvariabler eller de indbyggede API-endpoints.

2. **Hvis du kun har et Google Calendar-link**
   Aula kan udsende kalenderen som et offentligt link, der er importeret i Google Calendar. Hvis du modtager et link som
   `https://calendar.google.com/calendar/embed?...`, er det kun en visning i browseren – ikke den ICS-fil, som serveren har brug for.
   Du har to muligheder:

   - **Brug linket direkte**: `CalendarFeed` genkender automatisk Googles embed- og delingslinks og omskriver dem til den rigtige
     ICS-adresse (`.../calendar/ical/<id>/public/basic.ics`). Du kan derfor indsætte embed-linket i `CALENDAR_FEED_URL`, og serveren
     henter den korrekte ICS-fil for dig. 【F:calendar-feed.js†L10-L45】
   - **Find ICS-adressen manuelt**: Åbn Google Calendar → "Indstillinger for min kalender" → "Integrer kalender" → kopier feltet
     "Offentlig adresse i iCal-format". Adressen slutter på `basic.ics` og kan bruges direkte.

3. **Miljøvariabler (valgfrit)**
   Opret/ret en `.env`-fil i projektmappen med fx:
   ```env
   CALENDAR_FEED_URL=https://kalenderlink.aula.dk/?feed=6911c4aab850c2.59299766
   CALENDAR_REFRESH_INTERVAL_HOURS=6
   CALENDAR_LOOKAHEAD_DAYS=90
   CALENDAR_LOOKBEHIND_DAYS=7
   ```
   Disse værdier svarer til standarderne i koden men kan tilpasses. `CalendarFeed` sørger automatisk for at erstatte `webcal://` med `https://`. 【F:calendar-feed.js†L10-L18】【F:calendar-feed.js†L100-L122】

4. **Start serveren første gang**
   Kør:
   ```bash
   npm start
   ```
   Serveren henter nu feedet første gang. Bliver der vist fejl i terminalen, skal de løses (fx forkert URL eller manglende internetforbindelse).

---

## 4. Tjek status og planlæg automatiske opdateringer

1. **Status-endpoint**  
   Når serveren kører, kan du åbne `http://<serverens-adresse>:<port>/calendar/status` i en browser. Her ser du bl.a. `lastFetchedAt` og antal events. Endpointet hentes fra `sonos-local-server.js`. 【F:sonos-local-server.js†L1-L132】

2. **Opdater intervallet uden genstart**  
   Du kan sende en `POST`-anmodning til `/calendar/config` med fx:
   ```bash
   curl -X POST http://<server>:<port>/calendar/config \
     -H "Content-Type: application/json" \
     -d '{"refreshIntervalHours": 12}'
   ```
   Serveren bekræfter den nye opsætning og genstarter opdateringstimeren. 【F:sonos-local-server.js†L134-L231】

3. **Tving en manuel opdatering**  
   Brug endpointet `/calendar/refresh`:
   ```bash
   curl -X POST http://<server>:<port>/calendar/refresh
   ```
   Det svarer til at trykke “opdater nu”.

4. **Se de aktuelle events**  
   Gå til `/calendar/events` for at få en JSON-liste over begivenhederne, inklusive gentagelser, aflysninger osv. `CalendarFeed` håndterer `VEVENT`, `RRULE`, `EXDATE`, `RECURRENCE-ID` og `STATUS:CANCELLED`. 【F:calendar-feed.js†L40-L99】【F:calendar-feed.js†L124-L323】【F:calendar-feed.js†L325-L525】

---

## 5. Driftsrutiner

1. **Automatisk opdatering**  
   Serveren opdaterer automatisk kalenderen med det interval, du har sat (standard er 6 timer). Brug status-endpointet til at tjekke, om opdateringerne lykkes, og kig i serverens log, hvis `lastError` ikke er `null`.

2. **Backup**  
   Tag jævnligt backup af projektmappen og eventuelle databaser, hvis du tilpasser koden yderligere.

3. **Opdatering af Node.js**  
   Hold øje med Node.js’ LTS-udgivelser. Opgrader med passende mellemrum for at få sikkerhedsrettelser.

4. **Support**  
   Hvis du får problemer, notér den præcise fejlmeddelelse fra terminalen eller status-endpointet og del den med en teknisk kollega eller leverandør. Det gør fejlfinding hurtigere.

---

## 6. Hurtig tjekliste

- [ ] Jeg kan køre `node -v` og `npm -v` uden fejl.  
- [ ] `npm install` gennemføres uden `403 Forbidden`.  
- [ ] `.env` (eller tilsvarende) indeholder den rigtige `CALENDAR_FEED_URL`.  
- [ ] Serveren starter med `npm start` uden fejl.  
- [ ] `/calendar/status` viser fornuftige data (fx `eventCount > 0`).  
- [ ] Eventuelt interval er sat, og opdateringstimeren kører.

Når alle punkter er markeret, er kalenderfeedet klar til brug.

Held og lykke – og tøv ikke med at spørge en teknisk kollega, hvis noget driller!
