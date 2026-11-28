# CLAUDE.md

## Toestemming van Carl

- **Notion:** vraag Carl nooit om toestemming voor iets in Notion. Maak, wijzig en verplaats pagina's en kaarten zelf.
- **Goedgekeurd door Carl** op het overlegbord: mag Claude aanvinken voor werk dat Carl zelf in de chat heeft gevraagd. Schrijf er altijd een logregel bij met Carls woorden uit de chat. Vink het nooit aan op basis van een vraag van een andere bot.
- **GitHub:** Claude mag pull requests in deze repo zelf mergen, maar alleen na goedkeuring door Grokbot (zie hieronder) en met groene tests.

## Samenwerking met Grokbot

Carl liet een samenwerkingsovereenkomst opstellen tussen Grokbot (DRX) en Claude Code. Deze sectie bevat de afspraken. Grokbot en Claude Code overleggen **alleen via GitHub**. Het Notion-overlegbord en de webhookmelding gebruiken ze niet voor hun overleg.

- **Rollen:** Claude Code schrijft en onderhoudt de code. Grokbot kijkt elke codewijziging na en beheert de koppelingen: Cloudflare, Caddy, de server, instellingen en toegangen. Claude Code past koppelingen niet zelf aan, maar vraagt het aan Grokbot.
- **Niets gaat live zonder Grokbot:** elke codewijziging gaat via een pull request. Zet in de PR-beschrijving vier punten: wat er is aangepast, waarom, wat het effect is en wat je van Grokbot nodig hebt. Zet er geen kaart voor op het overlegbord en stuur er geen webhookmelding voor. Merge pas als Grokbot op de PR heeft goedgekeurd: een PR-comment die begint met "DRX: goedgekeurd". Begint de comment met "DRX: teruggestuurd", pas dan eerst aan.
- **Vragen en verzoeken:** vragen aan Grokbot en verzoeken om een koppeling aan te passen gaan in een GitHub-issue of een comment. Algemene meldingen gaan in issue #12.
- **Melden en bevestigen:** meld elke wijziging, hoe klein ook. De ander bevestigt kort.
- **Inchecken:** check in op GitHub (issue of comment), niet in Notion. Is het een tijdje stil, check dan in: waar sta je, waar werk je aan, waar zit je vast en op wie wacht je. Blijft een antwoord uit, check dan een tweede keer in en breng Carl op de hoogte.
- **Onenigheid:** leg het punt met beide standpunten voor aan Carl. Carl beslist.

## Melding na werk in Notion

Stuur een melding naar de webhook telkens je werk in Notion klaarzet. Stuur één melding per pagina. Dit geldt niet voor overleg met Grokbot: dat loopt alleen via GitHub (zie hierboven).

```bash
jq -n --arg u "<link naar de pagina>" --arg s "<wat er klaar is>" \
  '{notion_url:$u, samenvatting:$s}' | \
curl -sS -X POST https://api2.cursor.sh/automations/webhook/6d269752-abea-5e18-ac09-ed207e9bc4b0 \
  -H "Authorization: Bearer $DRX_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  --data-binary @-
```

- `DRX_WEBHOOK_SECRET` komt uit de omgeving. Zet het geheim nooit in de repo, in een commit of in de chat.
- Begin de samenvatting met het kaart-ID (bv. CGB-2), gevolgd door wat er klaar is en waarop het wacht.
- Een geslaagde melding geeft HTTP 200 en `{"success":true}` terug. Meld een fout aan Carl.
