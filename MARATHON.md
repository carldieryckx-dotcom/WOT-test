# Marathonschema – installatie op de Hetzner-server

Privé trainingsschema voor de **Skylux Marathon Kortrijk (zondag 25 april 2027)** op `carldrx.io/marathon`.
Loopjes worden **handmatig** ingevoerd (of als GPX-bestand opgeladen). Er is geen Strava-koppeling meer: de Strava-API is alleen beschikbaar voor betalende abonnees.

> De oude handleiding met Cloudflare Pages, KV en Pages-variabelen is achterhaald. Niets daarvan uitvoeren.

## Hoe het werkt

| Onderdeel | Waar |
|---|---|
| Schema (21 weken: basis → opbouw → piek → taper) | `marathon/plan.js` rekent alles uit op basis van de instellingen |
| Pagina | `marathon/index.html`, `app.js`, `style.css`, statisch geserveerd door **Caddy** |
| API | `server/`: Node 22 + Hono op `127.0.0.1:8788`, achter Caddy `reverse_proxy` voor `/api*` |
| Opslag | SQLite in `/var/lib/marathon/data.sqlite` (tabel `runs` en sleutel `settings` in tabel `kv`) |
| Afscherming | **Cloudflare Access** voor `/marathon` en `/api`. Tweede lijn: `lib/access.js` controleert het Access-token (`Cf-Access-Jwt-Assertion` of cookie `CF_Authorization`) bij elk API-verzoek, en via Caddy `forward_auth` ook voor `/marathon` |
| Config | `/etc/marathon.env` (chmod 600), ingelezen door systemd (`EnvironmentFile`) |

Zonder geldige Access-login geeft alles onder `/marathon` en `/api` een foutmelding, ook als Access verkeerd is ingesteld (*fail closed*). De Marketingland-site op `/` blijft publiek. De root van de repo blijft statisch, zonder build.

```
server/
  package.json, package-lock.json
  src/index.js       start de service (PORT, HOST, DATA_DIR)
  src/app.js         routes en authenticatie
  src/db.js          SQLite (ingebouwde node:sqlite, geen native modules)
  src/gpx.js         GPX lezen: afstand, duur, datum, hartslag
  src/validate.js    invoercontrole
  test/              node --test
  deploy/marathon.service, deploy/Caddyfile.example
  .env.example       voorbeeld voor /etc/marathon.env (zonder geheimen)
lib/access.js        controle van het Cloudflare Access-token (process.env)
```

## API

Alle routes vragen een geldige Access-login, behalve de twee importroutes met het DRX-token (zie verder).

| Methode en pad | Wat |
|---|---|
| `GET /api/me` | `{ email, runs: { count } }` |
| `GET /api/settings` · `PUT /api/settings` | instellingen van het schema (`goalTime`, `runsPerWeek`, `currentWeeklyKm`, `currentLongRunKm`, `peakWeeklyKm`, `startDate`) |
| `GET /api/runs[?after=JJJJ-MM-DD]` | `{ runs: [...] }`, nieuwste eerst |
| `POST /api/runs` | één run als JSON. `201` bij nieuw, `200` met `skipped: true` als hij er al is |
| `POST /api/runs/bulk` | JSON-array (of `{ "runs": [...] }`), max 1000 per verzoek |
| `POST /api/runs/gpx` | `multipart/form-data`, veld `file` (max 10 MB), optioneel `notes`, `avgHr`, `name` |
| `DELETE /api/runs/:id` | run verwijderen |
| `GET /api/auth-check` | `204` als je aangemeld bent (voor Caddy `forward_auth`) |
| `GET /api/finance` | privé financieel overzicht, zie `FINANCE.md` |

**Velden van een run**

| Veld | Verplicht | Voorbeeld |
|---|---|---|
| `date` | ja | `"2026-11-25"` (JJJJ-MM-DD, lokale datum) |
| `km` (of `distanceKm`) | ja | `10.2` of `"10,2"` |
| `duration` (of `durationSec`) | ja | `"58:30"`, `"1:02:03"` of `3510` (seconden) |
| `avgHr` | nee | `148` |
| `notes` | nee | `"Rustig, wind tegen"` |
| `name` | nee | `"Ochtendloop"` |

**Duplicaten** worden altijd overgeslagen op **datum + afstand** (afgerond op 0,01 km), bij alle drie de invoerroutes. Het antwoord zegt per run of hij `created`, `skipped` of `invalid` is. Een run uit GPX en dezelfde run met de hand ingevoerd tellen alleen als duplicaat als de afstand tot op 10 m gelijk is.

**GPX**: afstand wordt per track-segment opgeteld. De duur is de *bewegingstijd*: stukken trager dan 0,5 m/s (stilstaan) tellen niet mee. De datum is de lokale datum (Europe/Brussels) van het eerste punt. Een gemiddelde hartslag in het bestand (`<gpxtpx:hr>`) wordt overgenomen.

## Invoer door DRX (vanaf de server zelf)

`POST /api/runs` en `POST /api/runs/bulk` werken ook zonder Cloudflare Access, met het token `DRX_API_TOKEN` uit `/etc/marathon.env`:

- alleen rechtstreeks op `http://127.0.0.1:8788`, op de server zelf. Via Caddy of het internet weigert de API het token, ook als het juist is (Caddy zet altijd `X-Forwarded-For`);
- alleen deze twee routes. Lezen, verwijderen en instellingen blijven achter Access;
- runs die zo binnenkomen krijgen `source: "drx"`.

```bash
TOKEN=$(sudo sed -n 's/^DRX_API_TOKEN=//p' /etc/marathon.env)

# Eén run
curl -sS -X POST http://127.0.0.1:8788/api/runs \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"date":"2026-11-25","km":10.2,"duration":"58:30","avgHr":148,"notes":"Rustige duurloop"}'

# Meerdere runs (duplicaten worden overgeslagen)
curl -sS -X POST http://127.0.0.1:8788/api/runs/bulk \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '[{"date":"2026-11-24","km":8.0,"duration":"48:00"},{"date":"2026-11-26","km":12.5,"duration":"1:14:10","avgHr":151}]'
```

Antwoord van `bulk`: `{ "created": 2, "skipped": 0, "invalid": 0, "results": [ { "index": 0, "status": "created", "run": {...} }, ... ] }`.

## Eenmalig instellen (DRX)

1. **Node 22** (minstens 22.13, voor de ingebouwde `node:sqlite`):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs && node --version
   ```

2. **Systeemgebruiker** voor de service (geen login):
   ```bash
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin marathon
   ```
   `marathon` moet `/var/www/mijnsite/server` kunnen lezen (standaardrechten 755/644 volstaan).

3. **Code en afhankelijkheden**
   ```bash
   cd /var/www/mijnsite && git pull --ff-only
   cd server && npm ci --omit=dev
   ```

4. **Cloudflare Access**
   Zero Trust-dashboard → *Access → Applications → Add an application → Self-hosted*.
   - Bestemmingen: `carldrx.io/marathon` en `carldrx.io/api`.
   - Policy: *Allow* → *Emails* → Carls e-mailadres. Login met *One-time PIN* (of Google).
   - Kopieer de **Application Audience (AUD) Tag** en het **team domain** (`…cloudflareaccess.com`).
   - Hiervoor moet carldrx.io via Cloudflare lopen (oranje wolkje / proxied DNS).

5. **`/etc/marathon.env`** (zie `server/.env.example`):
   ```bash
   sudo install -m 600 -o root -g root /dev/null /etc/marathon.env
   sudoedit /etc/marathon.env
   ```
   Inhoud: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ALLOWED_EMAIL`, en optioneel `DRX_API_TOKEN` (`openssl rand -hex 32`), `PORT=8788`, `DATA_DIR=/var/lib/marathon`.
   Zet **nooit** `DEV_BYPASS_AUTH` in productie (het werkt sowieso alleen bij een rechtstreekse verbinding op localhost).

6. **Service**
   ```bash
   sudo cp /var/www/mijnsite/server/deploy/marathon.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now marathon
   systemctl status marathon
   curl -s http://127.0.0.1:8788/api/me    # verwacht 401 "Niet aangemeld"
   ```
   systemd maakt `/var/lib/marathon` zelf aan (eigenaar `marathon`, mode 0700).

7. **Caddy**: neem de blokken uit `server/deploy/Caddyfile.example` over (`/api*` naar `127.0.0.1:8788`, `/marathon*` statisch met `forward_auth`, interne mappen verborgen) en herlaad met `sudo systemctl reload caddy`. Controle:
   ```bash
   curl -sI https://carldrx.io/server/package.json   # verwacht 404
   curl -sI https://carldrx.io/.git/config           # verwacht 404
   ```

8. **Deploy na een merge**: de GitHub-workflow `deploy.yml` roept `/usr/local/bin/deploy.sh` aan. Laat dat script dit doen:
   ```bash
   #!/bin/sh
   set -e
   cd /var/www/mijnsite
   git pull --ff-only
   cd server && npm ci --omit=dev
   sudo systemctl restart marathon
   ```
   Daarvoor heeft gebruiker `carl` een sudo-regel nodig, bv. in `/etc/sudoers.d/marathon`:
   `carl ALL=(root) NOPASSWD: /usr/bin/systemctl restart marathon`

**Back-up**: `sudo sqlite3 /var/lib/marathon/data.sqlite ".backup '/root/marathon-$(date +%F).sqlite'"` (of kopieer het bestand terwijl de service gestopt is).

## Daarna (Carl)

- GitHub Pages uitzetten (repo → *Settings → Pages*).
- Geen Strava-app nodig.

## Lokaal testen

```bash
cd server
npm install
npm test                 # unit- en API-tests
npm run dev              # http://localhost:8788/marathon/ zonder login, data in server/data/
```
`npm run dev` zet `DEV_BYPASS_AUTH=1` en `SERVE_STATIC=1`: de API serveert dan ook de statische pagina's. Beide alleen lokaal gebruiken.

## Het schema aanpassen

Klap onderaan op de pagina **Instellingen van je schema** open: doeltijd, aantal loopjes per week (3–6), je huidige weekvolume en langste loop, het piekvolume en de startdatum. Alles wordt meteen herberekend.

Dinsdag is altijd vrij van looptrainingen (vaste spinningles van 1 uur). Het schema toont die dag als cross-training "Spinning 1u" (0 km, telt niet als loopje), bij elk aantal loopjes en ook in de raceweek. Bij 3 loopjes: woensdag kwaliteit, vrijdag rustige duurloop, zondag lange duurloop.

Het schema is een algemeen opbouwschema, geen medisch advies. Bij pijn: rust gaat voor.
