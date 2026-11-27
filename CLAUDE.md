# CLAUDE.md

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
