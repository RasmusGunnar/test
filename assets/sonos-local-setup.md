# Opsætning af lokal Sonos-kontrol

Denne guide hjælper dig med at starte den lokale Sonos-controller, som Webkioskens Sonos-view forventer at tale med.

## Krav
- En computer (Windows, macOS eller Linux) på samme netværk som dine Sonos-enheder.
- [Node.js](https://nodejs.org/) version 18 eller nyere installeret.

## Første gang
1. Åbn en terminal / kommandoprompt.
2. Gå til mappen hvor WAP-løsningen ligger (den mappe der indeholder `sonos-local-server.js`).
3. Kør:
   ```bash
   npm install
   ```
   Dette henter de nødvendige pakker (Express, CORS og Sonos-SDK'et).

## Start controlleren
Når installationen er færdig, kan du starte controlleren:

```bash
npm start
```

Serveren lytter som standard på port **8789** og logger `Sonos lokal controller kører på port 8789` når den er klar.

Hold terminalen åben – så længe processen kører, kan Webkiosken kalde den.

### Autostart via hjælpescript
Hvis du hellere vil dobbeltklikke i stedet for at skrive kommandoer, kan du bruge scriptsene i `assets/`:

- **Windows:** `assets/start-sonos-local-controller.ps1`
- **macOS/Linux:** `assets/start-sonos-local-controller.sh`

Første kørsel downloader afhængighederne automatisk. Efterfølgende starter de serveren direkte.

## Fejlfinding
- **Webkiosk viser “Kan ikke forbinde…”**
  - Tjek at controlleren kører og ikke er lukket ned.
  - Sørg for at enheden med Webkiosken kan nå adressen der er angivet i indstillingerne (fx `http://localhost:8789`).
  - Hvis Webkiosken kører over HTTPS og controlleren er HTTP, skal siden åbnes via HTTP eller controlleren sættes op med HTTPS (se nedenfor).
- **Firewall blokerer port 8789**: Tillad indgående forbindelser på port 8789.
- **Ingen Sonos-enheder fundet**: Controlleren bruger SSDP/UPnP. Sikr at Sonos og serveren er på samme subnet, og at multicast ikke er blokeret.

## Kørsel med HTTPS (valgfrit)
Hvis din Webkiosk kun må tale med sikre (HTTPS) endpoints, kan du starte controlleren med egne certifikater:

```bash
SONOS_SSL_KEY=/sti/til/server.key SONOS_SSL_CERT=/sti/til/server.crt npm start
```

Når begge variabler er sat til gyldige filer, starter controlleren en HTTPS-server på samme port i stedet for HTTP.

## Stop controlleren
Tryk `Ctrl + C` i terminalen for at stoppe serveren.

