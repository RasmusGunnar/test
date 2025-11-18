# Opsætning af Node-afhængigheder

Projektet har enkelte Node-scripts (fx `aula-sync.js` og `sonos-local-server.js`), som kræver eksterne pakker som `@supabase/supabase-js`, `node-ical` og `express`. Kommandoen `npm install` bruges til at hente disse afhængigheder ned i et lokal `node_modules`-katalog, så scriptsene kan køres uden at mangle moduler.

## Kan man undgå `npm install`?
- Ja, hvis du kun arbejder med de statiske HTML-filer eller ikke skal køre Node-scripts, kan du undvære `npm install`.
- Nej, hvis du skal køre `aula-sync.js`, Sonos-serveren eller andre Node-baserede workflows. De kræver de nævnte pakker og kan ikke køre korrekt uden et succesfuldt `npm install` (eller en tilsvarende installation via et offline mirror/bundle).

Hvis miljøet ikke har adgang til `registry.npmjs.org`, skal du enten give npm adgang til et godkendt mirror eller installere pakkerne fra et offline bundle.
