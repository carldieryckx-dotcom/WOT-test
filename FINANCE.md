# Financieel overzicht – `/finance/`

Privé financieel overzicht op `carldrx.io/finance/`, achter dezelfde Cloudflare Access-login als `/marathon`.

> **Privacy:** echte financiële gegevens horen **nooit** in deze repo, in issues, PR's, commits of de publieke webroot.
> De echte data staat alleen op de server, buiten de repo, en wordt door DRX bijgehouden.
> Voor tests en lokaal bekijken bestaat enkel `server/test/fixtures/finance-sample.json` (`"_fixture": "VERZONNEN TESTDATA"`).

| Onderdeel | Waar |
|---|---|
| Pagina | `finance/index.html`, `app.js`, `style.css` (pure JS + SVG, geen externe requests behalve `fetch('/api/finance')`) |
| API | `GET /api/finance` in `server/src/app.js` (dezelfde Node-service als de marathon-API) |
| Data | JSON-bestand op het pad uit `FINANCE_FILE`, standaard `/var/lib/finance/site-finance.json` |

## API: `GET /api/finance`

- Alleen met een geldige Cloudflare Access-login (`ALLOWED_EMAIL`), net als de marathon-API. Het DRX-Bearer-token werkt hier **niet** (`403`).
- Geeft de inhoud van `FINANCE_FILE` ongewijzigd terug. Het bestand wordt bij **elk** verzoek opnieuw gelezen, niets wordt gecachet.
- Headers: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`.

| Status | Wanneer |
|---|---|
| `200` | JSON-inhoud van het bestand |
| `401` / `403` | niet aangemeld / ander account |
| `404` | bestand ontbreekt (`Nog geen financiële gegevens beschikbaar`) |
| `502` | bestand is geen geldige JSON |
| `500` | bestand niet leesbaar (bv. rechten) |

De inhoud van het bestand wordt nooit gelogd en komt nooit in een foutmelding; in het log staat hooguit de foutcode (bv. `EACCES`).

## Schema

Alle velden behalve `updated`, `period` en `months` mogen ontbreken of leeg zijn.

```
{
  updated: ISO-timestamp,
  period: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' },
  months: [ { month: 'YYYY-MM', income, spending, net,
              byCategory: { income: { <categorie>: bedrag }, spending: { <categorie>: bedrag } } } ],
  transactions: [ { date, month, account, amount, type: 'income'|'spending'|'excluded', category, counterparty } ],
  payments: [ { title, payee, amount, due, status } ],
  subscriptions: [ { name, category, amount, interval, lastSeen } ],
  networth: [ { month, total, estimated, parts: { spaar, aandelen, bolero } } ]
}
```

- `months[]`: `income`, `spending` en alle `byCategory`-waarden zijn **positieve** totalen; `net = income - spending`.
- `transactions[].amount` volgt het teken van de bank: uitgaven negatief, inkomsten positief.
- `type: 'excluded'` (interne overschrijvingen, spaarbewegingen) telt niet mee in totalen en grafieken; de lijst toont ze enkel met de schakelaar *Uitgesloten tonen*.
- `networth.total` bevat ook de zichtrekeningen; `parts` telt dus niet op tot het totaal. `estimated: true` = teruggerekend (open bolletje + stippellijn).
- `payments.status`: `open`, `betaald` of `onbekend`. Open betalingen met een vervaldag vóór vandaag (Brussel) worden als achterstallig gemarkeerd.
- `subscriptions.interval`: `wekelijks`, `tweewekelijks`, `maandelijks`, `tweemaandelijks`, `driemaandelijks` (of `kwartaal`/`trimestrieel`), `halfjaarlijks`, `jaarlijks`. Andere waarden tellen niet mee in het maandtotaal.

## Server (DRX)

- Zet het bestand klaar in `/var/lib/finance/site-finance.json` (of zet `FINANCE_FILE=` in `/etc/marathon.env`). De service draait als gebruiker `marathon` met `ProtectSystem=strict`: lezen mag, maar het bestand en de map moeten leesbaar zijn voor `marathon`, bv.
  ```bash
  sudo install -d -m 750 -o root -g marathon /var/lib/finance
  sudo chgrp marathon /var/lib/finance/site-finance.json && sudo chmod 640 /var/lib/finance/site-finance.json
  ```
  Aanpassingen aan `marathon.service` zijn niet nodig.
- Caddy: voeg `/finance*` toe met `forward_auth` naar `/api/auth-check`, zoals `/marathon*`, en neem `/finance` op in de Cloudflare Access-applicatie. `/api*` loopt al naar de service.
- `*.md` (dus ook dit bestand) moet verborgen blijven in de webroot (`hide … *.md` in `file_server`).

## Lokaal bekijken met de verzonnen data

```bash
cd server
npm install
npm run dev:finance      # http://localhost:8788/finance/ zonder login, met test/fixtures/finance-sample.json
npm test
```
