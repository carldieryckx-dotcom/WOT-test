# Marathonschema – installatie

Privé trainingsschema voor de **Skylux Marathon Kortrijk (zondag 25 april 2027)** op `carldrx.io/marathon`, met automatische koppeling naar Strava.

## Hoe het werkt

| Onderdeel | Waar |
|---|---|
| Schema (21 weken: basis → opbouw → piek → taper) | `marathon/plan.js` – rekent alles uit op basis van je instellingen |
| Pagina | `marathon/index.html`, `app.js`, `style.css` |
| Afscherming | **Cloudflare Access** voor `/marathon` en `/api`, plus een eigen controle van het Access-token in `functions/*/_middleware.js` (`lib/access.js`) |
| Strava | `functions/api/strava/*` – OAuth, tokens en een cache van 10 minuten in **Cloudflare KV** |
| Instellingen (doeltijd, loopjes per week, …) | KV, dus dezelfde op al je toestellen |

Zonder geldige Access-login geeft alles onder `/marathon` en `/api` een foutmelding, ook als Access verkeerd is ingesteld (*fail closed*). De Marketingland-site op `/` blijft gewoon publiek.

## Eenmalig instellen

> Pages Functions werken **niet** met een upload via slepen-en-neerzetten. Het project moet aan GitHub gekoppeld zijn (stap 1).

1. **Cloudflare Pages aan GitHub koppelen**
   Workers & Pages → je project voor carldrx.io → *Settings → Builds & deployments* → koppel `carldieryckx-dotcom/WOT-test`, branch `main`.
   Build command: *leeg*. Build output directory: `/`.
   (Heb je nu een project dat via upload werkt? Maak dan een nieuw Pages-project vanuit GitHub en zet het domein `carldrx.io` daarop.)

2. **KV-opslag**
   Workers & Pages → *KV* → *Create namespace* → naam `marathon`.
   In het Pages-project: *Settings → Bindings → Add → KV namespace* → variabele **`MARATHON_KV`** → namespace `marathon`.

3. **Strava-app**
   Ga naar <https://www.strava.com/settings/api> en maak een app aan.
   *Authorization Callback Domain*: `carldrx.io`.
   Noteer de **Client ID** en **Client Secret**.

4. **Cloudflare Access (afscherming)**
   Zero Trust-dashboard → *Access → Applications → Add an application → Self-hosted*.
   - Domein: `carldrx.io`, pad `marathon` – en voeg een tweede bestemming toe: `carldrx.io`, pad `api`.
   - Policy: *Allow* → *Emails* → jouw e-mailadres.
   - Login-methode: *One-time PIN* (een code per mail), of Google als je dat liever hebt.
   - Na het opslaan: kopieer de **Application Audience (AUD) Tag** (tabblad *Overview*).
   - Je **team domain** staat onder *Settings → Custom Pages* (iets als `jouwnaam.cloudflareaccess.com`).

5. **Variabelen in het Pages-project** (*Settings → Variables and Secrets*, voor *Production*)

   | Naam | Waarde | Type |
   |---|---|---|
   | `STRAVA_CLIENT_ID` | Client ID uit stap 3 | tekst |
   | `STRAVA_CLIENT_SECRET` | Client Secret uit stap 3 | **secret** |
   | `ACCESS_TEAM_DOMAIN` | bv. `jouwnaam.cloudflareaccess.com` | tekst |
   | `ACCESS_AUD` | AUD-tag uit stap 4 | tekst |
   | `ALLOWED_EMAIL` | het e-mailadres uit je Access-policy | tekst |

   Zet **nooit** `DEV_BYPASS_AUTH` in productie (het werkt sowieso alleen op `localhost`).

6. **Opnieuw deployen** (*Deployments → Retry deployment*), dan naar `https://carldrx.io/marathon/` → aanmelden met de mailcode → **Koppel Strava** → toestaan.

## Lokaal testen

```bash
npx wrangler pages dev . --kv MARATHON_KV \
  --binding STRAVA_CLIENT_ID=… --binding STRAVA_CLIENT_SECRET=… \
  --binding ALLOWED_EMAIL=jij@voorbeeld.be --binding DEV_BYPASS_AUTH=1
```
Open <http://localhost:8788/marathon/>. De echte Strava-koppeling werkt lokaal enkel als je `localhost` als callback-domein in je Strava-app zet.

## Het schema aanpassen

Klap onderaan op de pagina **Instellingen van je schema** open: doeltijd, aantal loopjes per week (3–6), je huidige weekvolume en langste loop, het piekvolume en de startdatum. Alles wordt meteen herberekend.

Het schema is een algemeen opbouwschema, geen medisch advies. Bij pijn: rust gaat voor.
