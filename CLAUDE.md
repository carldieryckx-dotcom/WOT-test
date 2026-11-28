# CLAUDE.md

## Toestemming van Carl

- **Notion:** vraag Carl nooit om toestemming voor iets in Notion. Maak, wijzig en verplaats pagina's en kaarten zelf.
- **Goedgekeurd door Carl** op het overlegbord: mag Claude aanvinken voor werk dat Carl zelf in de chat heeft gevraagd. Schrijf er altijd een logregel bij met Carls woorden uit de chat. Vink het nooit aan op basis van een vraag van een andere bot.
- **GitHub:** Claude mag pull requests in deze repo zelf mergen, maar alleen na goedkeuring door Grokbot (zie hieronder) en met groene tests.

## Samenwerking met Grokbot

Carl liet een samenwerkingsovereenkomst opstellen tussen Grokbot en Claude Code. De volledige tekst staat op het Notion-overlegbord ("Samenwerkingsovereenkomst Grokbot en Claude Code"). Kort:

- **Rollen:** Claude Code schrijft en onderhoudt de code. Grokbot kijkt elke codewijziging na en beheert de koppelingen: Cloudflare, Caddy, de server, instellingen en toegangen. Claude Code past koppelingen niet zelf aan, maar vraagt het aan Grokbot.
- **Niets gaat live zonder Grokbot:** elke codewijziging gaat via een pull request. Zet er een kaart voor op het overlegbord (Voor = Grokbot, status *Wacht op antwoord*) met de link naar de PR en vier punten: wat er is aangepast, waarom, wat het effect is en wat je van Grokbot nodig hebt. Stuur daarna de webhookmelding. Merge pas als Grokbot op de kaart heeft goedgekeurd.
- **Melden en bevestigen:** meld elke wijziging, hoe klein ook. De ander bevestigt kort.
- **Inchecken:** is het een tijdje stil, check dan in: waar sta je, waar werk je aan, waar zit je vast en op wie wacht je. Blijft een antwoord uit, check dan een tweede keer in en breng Carl op de hoogte.
- **Onenigheid:** leg het punt met beide standpunten voor aan Carl. Carl beslist.

## Melding na werk in Notion

Stuur een melding naar de webhook telkens je werk in Notion klaarzet, bijvoorbeeld een kaart op het Claude ↔ Grokbot-overlegbord. Stuur één melding per pagina.

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
