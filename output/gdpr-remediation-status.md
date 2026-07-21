# Cadence — Stato di rimedio GDPR

Compagno di `output/pdf/cadence-audit-gdpr.pdf` (audit 20 lug 2026). Il PDF è
binario e non ha sorgente nel repo, quindi lo stato "fatto" è tracciato qui.
_Aggiornato: 21 luglio 2026._

## Legenda
✅ fatto · ⚠️ parziale · 📝 bozza pronta (serve legale) · ⏳ da fare

## Riepilogo per criticità

| # | Criticità | Stato | Dettaglio |
|---|---|---|---|
| 01 | Informativa privacy incompleta | 📝 BOZZA | `docs/legal/informativa-privacy-IT.md` (art. 13-14 completa, dati reali, no segnaposto). Da validare dal legale + pubblicare in EN/ES. |
| 02 | Dati sanitari senza governance | ⏳ | DPA art. 28, DPIA, registro trattamenti, scelta base art. 9 (bozza usa 9.2.h). Legale/organizzativo. |
| 03 | Demo condivisa persistente | ⚠️ | Mitigata da #04 (cooldown reset). In produzione la demo non ci sarà. Isolamento completo (tenant effimeri) non fatto. |
| 04 | Reset demo pubblico | ✅ MITIGATO | `api/demo/reset`: cooldown 15s + guardia in-flight; credenziali rimosse dalla risposta. |
| 05 | Endpoint legacy Mongo/Gemini | ✅ FATTO | Rimosso `app/api/[[...path]]/route.js` + `lib/api/ai.ts` + `scripts/ai_parse.py` (erano morti). |
| 06 | Diritti DSAR / cancellazione | ⏳ | Export dati, cancellazione account self-service, hard-purge, retention automatica. **Prossimo grosso tecnico.** |
| 07 | Header di sicurezza | ✅ FATTO | `SAMEORIGIN`, `frame-ancestors 'self'`, +`nosniff` +`Referrer-Policy`; rimosso CORS `*`. |
| 08 | Autenticazione debole | ⚠️ | Signup min password 6→8 + hint. **Da fare su Supabase**: min password nel dashboard + MFA/TOTP. |
| 09 | Indirizzi/coord a mappe | ⚠️ | Cache ORS geocode+route (meno trasmissioni). Restano: destinatari in informativa (fatti nella bozza §5), avviso pre-apertura Google/Apple, valutazione provider UE. |
| 10 | Voce descritta come locale | ✅ FATTO | Avviso pre-microfono (una volta) + `processLocally` best-effort + niente claim "solo locale" + input testuale sempre. `docs/legal/nota-voce-IT.md`. |
| 11 | Consensi/retention non tracciati | ✅ (consensi) / ⚠️ (retention) | Signup: Termini e Privacy **separati** + `consents{version,timestamp}` nei metadata. `docs/legal/consensi-registrazione-IT.md`. Retention/purge automatico: ⏳ (vedi 06). |

## Documenti legali pronti (bozze, `docs/legal/`)
- `informativa-privacy-IT.md` — informativa art. 13-14.
- `termini-di-servizio-IT.md` — termini di servizio.
- `consensi-registrazione-IT.md` — testi + struttura consensi + JSON da salvare.
- `nota-voce-IT.md` — avviso funzione vocale.

Tutte in IT (primario per Italia/Garante); EN/ES da tradurre dopo validazione legale.

## Restano (non codice puro)
- **06 DSAR** (export/delete/hard-purge/retention) — feature backend.
- **02** DPA/DPIA/registro/base art. 9 — legale/organizzativo.
- **08** min-password Supabase + MFA — config + feature.
- **09** avviso pre-Google/Apple Maps + valutazione provider UE.
- Pubblicazione informativa/termini reali (dai file bozza) + EN/ES.

## Nota
Verifica tecnica, non parere legale. Prima dei dati reali resta valida la
checklist §07 del PDF (Security Advisor, DPA, DPIA, RLS su ogni tabella, ecc.).
