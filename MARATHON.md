# Marathonschema – installatie

Privé trainingsschema voor de **Skylux Marathon Kortrijk (zondag 25 april 2027)** op `carldrx.io/marathon`. Loopjes komen erin via handmatige invoer, een GPX-upload of via DRX. Strava wordt niet gebruikt.

## Hoe het werkt

| Onderdeel | Waar |
|---|---|
| Schema (21 weken: basis → opbouw → piek → taper) | `marathon/plan.js` – rekent alles uit op basis van je instellingen |
| Pagina | `marathon/index.html`, `app.js`, `style.css` – statisch via Caddy |
| API | `server/` – Node 22 (Hono) op `127.0.0.1:8788`, Caddy stuurt `/api*` door |
| Opslag | SQLite in `/var/lib/marathon/data.sqlite` (runs en instellingen) |
| Afscherming | **Cloudflare Access** voor `/marathon` en `/api`, plus een eigen controle van het Access-token op elke API-aanroep (`lib/access.js`) |
| Configuratie | `/etc/marathon.env` via systemd (`server/.env.example` toont de velden) |

Zonder geldige Access-login of DRX-token geeft de API een foutmelding, ook als Access verkeerd is ingesteld (*fail closed*). De Marketingland-site op `/` blijft publiek.

## API

| Methode en pad | Wat |
|---|---|
| `GET /api/me` | Wie is aangemeld |
| `GET` / `PUT /api/settings` | Instellingen van het schema |
| `GET /api/runs[?after=JJJJ-MM-DD]` | Runs, nieuwste eerst |
| `POST /api/runs` | Eén run (JSON) |
| `POST /api/runs/bulk` | Meerdere runs: `{ "runs": [ … ] }`, max. 500 |
| `POST /api/runs/gpx` | GPX-upload, multipart-veld `file`, max. 10 MB; optioneel `notes`, `name`, `avgHr` |
| `DELETE /api/runs/:id` | Run verwijderen (alleen via Access, niet met het DRX-token) |
| `GET /healthz` | Draait de service? Geen login nodig, niet bereikbaar via Caddy |

Velden van een run (Engels of Nederlands):

| Veld | Alias | Verplicht | Formaat |
|---|---|---|---|
| `date` | `datum` | ja | `JJJJ-MM-DD` |
| `km` | `afstand` | ja | 0,1 – 100 |
| `duration` | `duur` | ja | seconden, of `u:mm:ss` / `mm:ss` |
| `avgHr` | `hartslag` | nee | 30 – 250 |
| `notes` | `notities` | nee | max. 1000 tekens |
| `name` | `naam` | nee | max. 200 tekens |

**Duplicaten:** een run met dezelfde datum en dezelfde afstand (afgerond op 100 m) wordt niet opnieuw bewaard. `POST /api/runs` geeft dan `200` met `"duplicate": true`, `bulk` telt hem bij `skipped`. Een bulk-verzoek met één ongeldige run wordt volledig geweigerd (`400`, met het nummer van de run).

**GPX:** afstand per tracksegment (pauzes tussen segmenten tellen niet mee), duur van eerste tot laatste tijdstip, datum in Belgische tijd van het eerste punt, gemiddelde hartslag als die in het bestand staat.

### Aanroep door DRX

DRX gebruikt een token in plaats van Cloudflare Access, en roept de API rechtstreeks op de server aan (niet via `carldrx.io`, daar staat Access ervoor):

```bash
source /etc/marathon.env   # of laat systemd/een eigen geheim het token leveren
curl -sS -X POST http://127.0.0.1:8788/api/runs/bulk \
  -H "Authorization: Bearer $DRX_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"runs":[{"date":"2026-11-25","km":10.02,"duration":"55:10","avgHr":151,"notes":"Strava: Ochtendloop"}]}'
```

Het token mag alleen `GET /api/runs`, `POST /api/runs`, `POST /api/runs/bulk` en `POST /api/runs/gpx`. Instellingen wijzigen en runs verwijderen kan alleen Carl, via de pagina. Runs van DRX krijgen de bron `drx` (of `drx-gpx`) en een label in de lijst.

## Eenmalig instellen op de server (DRX)

1. **Node 22.13 of hoger** (`node:sqlite` is ingebouwd, er is geen gecompileerde module nodig).
2. **Code en afhankelijkheden**
   ```bash
   cd /var/www/mijnsite && git pull --ff-only
   cd server && npm ci --omit=dev
   ```
3. **Configuratie** in `/etc/marathon.env` (zie `server/.env.example`), `chmod 600`. Token maken met `openssl rand -hex 32`.
4. **Service**: kopieer `server/marathon.service` naar `/etc/systemd/system/`, pas `User` aan indien nodig, dan
   `sudo systemctl daemon-reload && sudo systemctl enable --now marathon`.
   Controle: `curl -s http://127.0.0.1:8788/healthz` geeft `{"ok":true}`.
5. **Caddy**: voeg toe aan het blok voor `carldrx.io`:
   ```caddy
   @private path /server/* /lib/* /.github/* /*.md
   respond @private 404

   handle /api* {
       reverse_proxy 127.0.0.1:8788
   }
   ```
   De rest (ook `/marathon/`) blijft statisch uit `/var/www/mijnsite`. `/server`, `/lib` en de `.md`-bestanden worden zo niet publiek geserveerd.
6. **Cloudflare Access**: Zero Trust → *Access → Applications → Self-hosted*, bestemmingen `carldrx.io/marathon` en `carldrx.io/api`, policy *Allow → Emails → Carls adres*. Zet de **AUD-tag** en het **team domain** in `/etc/marathon.env`. Laat de server alleen verkeer van Cloudflare toe op poort 443 (anders kan iemand Access omzeilen voor de statische pagina; de API blijft wel afgeschermd door `lib/access.js`).
7. **Automatisch deployen**: breid `/usr/local/bin/deploy.sh` uit met `cd server && npm ci --omit=dev && sudo systemctl restart marathon` na de `git pull`.

## Lokaal testen

```bash
cd server && npm ci && npm test
DEV_BYPASS_AUTH=1 ALLOWED_EMAIL=jij@voorbeeld.be DATA_DIR=./data node index.js
```
De API draait dan op <http://localhost:8788>. `DEV_BYPASS_AUTH` werkt alleen voor verzoeken naar `localhost`.

## Het schema aanpassen

Klap onderaan op de pagina **Instellingen van je schema** open: doeltijd, aantal loopjes per week (3–6), je huidige weekvolume en langste loop, het piekvolume en de startdatum. Alles wordt meteen herberekend.

Het schema is een algemeen opbouwschema, geen medisch advies. Bij pijn: rust gaat voor.
