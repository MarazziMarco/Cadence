# Cadence — Stato di rimedio GDPR

Compagno di `output/pdf/cadence-audit-gdpr.pdf` (audit 20 lug 2026). Il PDF è
binario e non ha sorgente nel repo, quindi lo stato "fatto" è tracciato qui.

## ✅ Fase 0 — quick win di sicurezza (fatti, solo codice, funzionalità invariate)

| # | Criticità | Stato | Cosa è stato fatto |
|---|---|---|---|
| 05 | Endpoint legacy Mongo/Gemini pubblico | ✅ FATTO | Rimosso `app/api/[[...path]]/route.js` (superficie Mongo `/status` + parser Gemini). `/api/ai/parse` era già morto (nessun import di `lib/api/ai.ts`); rimossi anche `lib/api/ai.ts` e `scripts/ai_parse.py`. Nessuna funzione dell'app persa. |
| 04 | Reset demo pubblico con privilegi elevati | ✅ MITIGATO | `app/api/demo/reset/route.ts`: cooldown 15s + guardia in-flight (no spam del service-role); rimosse le credenziali dalla risposta. Demo login continua a funzionare. Resta: valutare token/allowlist se la demo condivisa rimane. |
| 07 | Header di sicurezza permissivi | ✅ FATTO | `next.config.js`: `X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`, aggiunti `X-Content-Type-Options: nosniff` e `Referrer-Policy`; rimosso il CORS wildcard `*` (l'app chiama la propria API same-origin). |
| 08 | Password troppo corte | ⚠️ PARZIALE | Signup ora `minLength=8` + hint EN/IT/ES aggiornati. **Da fare lato Supabase**: alzare la min-password nel dashboard Auth (il client da solo non basta) + MFA/TOTP (feature separata). |

## ⏳ Non ancora fatte (richiedono feature/legale, non solo codice)

- **01** Informativa artt. 13-14 completa (EN/IT/ES) — testo legale.
- **02** Governance dati sanitari: titolare/responsabile, DPA art. 28, DPIA — legale/organizzativo.
- **03** Demo condivisa persistente — isolare (tenant effimeri) o solo demo locale. Mitigata parzialmente da #04.
- **06** Diritti DSAR: export strutturato, cancellazione account, hard-purge, retention — feature.
- **09** Indirizzi/coordinate a ORS/OSM — cache aggiunta (riduce trasmissioni), ma restano da elencare i destinatari nell'informativa + valutare DPA/provider UE. NB: `metadata.start_location` ora salva l'indirizzo di casa del professionista.
- **10** Voce Web Speech potenzialmente server-side — non descriverla come solo-locale + input testuale sempre disponibile.
- **11** Consensi separati + versione/timestamp; retention/purge cache; precisione coordinate.

## Note

- Verifica tecnica, non parere legale (come il PDF).
- Prima dei dati reali resta valida la checklist §07 del PDF (Security Advisor, DPA, DPIA, RLS su ogni tabella, ecc.).
