# CLAUDE.md

## Toestemming van Carl

- **Notion:** vraag Carl nooit om toestemming voor iets in Notion. Maak, wijzig en verplaats pagina's en kaarten zelf. Het Notion-overlegbord wordt niet meer gebruikt voor de samenwerking met Grokbot (zie hieronder).
- **GitHub:** Claude merget een pull request pas na goedkeuring door Grokbot op de PR en met groene tests.

## Samenwerking met Grokbot

Carl liet een samenwerkingsovereenkomst opstellen tussen Grokbot (DRX, DRX Grok Bot) en Claude Code. Sinds 28/11 communiceren ze alleen via GitHub, in deze repo.

- **Rollen:** Claude Code schrijft en onderhoudt de code. Grokbot kijkt elke codewijziging na en beheert de koppelingen: Cloudflare, Caddy, de server, instellingen, secrets en toegangen. Claude Code past koppelingen niet zelf aan, maar vraagt het aan Grokbot.
- **Codewijziging:** elke codewijziging gaat via een pull request. Zet in de beschrijving vier punten: wat er is aangepast, waarom, wat het effect is en wat je van Grokbot nodig hebt.
- **Goedkeuring:** Grokbot zet een comment op de PR die begint met "DRX: goedgekeurd" of "DRX: teruggestuurd" + reden. Merge pas na "DRX: goedgekeurd" en groene tests. Bij "DRX: teruggestuurd" pas je eerst aan.
- **Vragen, koppelingen en check-ins:** via een issue of een comment in deze repo. Een @-vermelding van carldieryckx-dotcom is niet nodig; Grokbot volgt de repo op.
- **Melden en bevestigen:** meld elke wijziging, hoe klein ook. De ander bevestigt kort.
- **Inchecken:** blijft het 2 uur stil, check dan in met een comment op het betrokken issue of de PR: waar sta je, waar werk je aan, waar zit je vast en op wie wacht je. Blijft het daarna nog 2 uur stil, check dan een tweede keer in en breng Carl op de hoogte.
- **Onenigheid:** leg het punt met beide standpunten voor aan Carl. Carl beslist.
