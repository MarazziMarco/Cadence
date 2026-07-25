# Verifica successiva degli interventi GDPR

**Data della verifica:** 21 luglio 2026  
**Oggetto:** confronto tra le modifiche implementate e le 11 criticità del precedente audit GDPR  
**Ambito:** repository locale e progetto Supabase collegato  
**Nota:** questa è una verifica tecnica e organizzativa preliminare, non un parere legale.

## Esito sintetico

Le modifiche hanno migliorato concretamente la sicurezza e la trasparenza del progetto, ma non supportano ancora una dichiarazione di piena conformità GDPR.

| Stato | Numero di criticità |
|---|---:|
| Risolte | 1 |
| Parzialmente risolte | 7 |
| Ancora aperte | 3 |

## Verifica delle 11 criticità

### 1. Informativa privacy e termini — Aperta

Le pagine pubbliche continuano a descrivere Cadence come demo/prototipo, a presentare l'informativa come provvisoria e a chiedere di non inserire dati reali. Esiste una bozza italiana in `docs/legal/`, ma non è pubblicata nelle pagine effettivamente mostrate agli utenti e non è disponibile in modo equivalente in inglese, italiano e spagnolo.

La bozza contiene inoltre tempi di conservazione non allineati all'implementazione: 24 mesi per i dati operativi, normalmente 10 anni per i dati sanitari e 30 giorni per log/cache.

### 2. Governance dei dati sanitari — Aperta

Non risultano ancora completati:

- DPIA;
- registro dei trattamenti;
- DPA art. 28 tra Cadence e i professionisti clienti;
- registro dei responsabili e sub-responsabili;
- procedura per incidenti e data breach;
- validazione legale della base giuridica applicabile ai dati sanitari.

I dati relativi alla salute sono categorie particolari di dati e richiedono condizioni e garanzie specifiche.

### 3. Demo condivisa persistente — Aperta

La demo completa continua a utilizzare un unico account Supabase condiviso, con credenziali statiche visibili nell'applicazione. I visitatori non dispongono quindi di ambienti o tenant isolati.

La demo locale disponibile nella pagina `/demo`, che conserva i dati soltanto nel browser, rappresenta invece un miglioramento valido.

### 4. Reset pubblico della demo — Parzialmente risolta

Sono stati rimossi i dati di accesso dalla risposta dell'endpoint ed è stato introdotto un cooldown di 15 secondi con protezione dalle richieste concorrenti.

Il cooldown è però conservato soltanto nella memoria del processo. In un ambiente serverless può essere aggirato attraverso istanze differenti, riavvii o nuove istanze. L'endpoint resta pubblico e utilizza internamente il service role.

### 5. Endpoint legacy Mongo/Gemini — Risolta

L'endpoint catch-all legacy e i relativi helper/script risultano rimossi dal repository.

### 6. Export, cancellazione e retention — Parzialmente risolta, con errore critico

Sono state introdotte API per esportare i dati e cancellare l'account, oltre alle funzioni SQL `delete_account()` e `purge_expired()`.

Il controllo `supabase db lint --linked --level error` sul database collegato segnala però errori nelle due nuove funzioni:

- `delete_account()` tenta di utilizzare l'intero array delle tabelle come un singolo nome di relazione;
- `purge_expired()` presenta lo stesso problema con l'array delle tabelle sottoposte a cancellazione periodica.

Di conseguenza, cancellazione e purge non devono essere considerati affidabili fino alla correzione e a un test end-to-end sul database.

Ulteriori criticità:

- l'export ignora gli errori delle singole query e può produrre silenziosamente un archivio incompleto;
- se la cancellazione dell'utente Supabase Auth fallisce, l'API può comunque restituire `ok: true`;
- il purge usa 90 giorni, mentre la scelta precedentemente indicata era una finestra di recupero di 30 giorni;
- la cancellazione dell'account è immediata, non una cancellazione recuperabile per 30 giorni;
- la schedulazione cron è best effort e non è stata dimostrata come attiva;
- documentazione e comportamento effettivo riportano tempi di conservazione differenti.

### 7. Header di sicurezza — Parzialmente risolta

Sono stati aggiunti correttamente:

- `X-Frame-Options: SAMEORIGIN`;
- `Content-Security-Policy: frame-ancestors 'self'`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`.

Il wildcard CORS è stato rimosso dall'app Next.js, ma l'Edge Function `optimize-schedule` continua a restituire `Access-Control-Allow-Origin: *`. La CSP protegge dal framing, ma non costituisce ancora una policy completa per script, connessioni, immagini e altre risorse.

### 8. Autenticazione — Parzialmente risolta

La lunghezza minima richiesta dall'interfaccia è stata aumentata da 6 a 8 caratteri. Non risultano però verificati o implementati:

- la stessa policy nel pannello Supabase Auth;
- MFA/TOTP;
- eventuali requisiti aggiuntivi adeguati al trattamento di dati sanitari.

### 9. Mappe, coordinate e regione UE — Parzialmente risolta

Sono stati aggiunti proxy server-side, cache temporanee e un avviso prima di aprire Google Maps o Apple Maps. Il progetto database Supabase risulta collocato a Parigi (`eu-west-3`).

Le invocazioni dell'Edge Function non forzano però `eu-west-3`: in assenza di configurazione Supabase esegue normalmente la funzione nella regione più vicina al chiamante. Restano inoltre da formalizzare DPA, trasferimenti e ruoli dei fornitori di mappe e routing.

### 10. Riconoscimento vocale — Parzialmente risolta

È stato aggiunto un avviso prima dell'uso del microfono nel form dell'appuntamento e viene richiesto `processLocally = true` quando supportato. È inoltre disponibile l'inserimento testuale.

Il pulsante vocale centrale della navigazione mobile avvia però direttamente l'ascolto e può saltare l'avviso. Anche gli altri punti di ingresso vocali devono usare lo stesso controllo preventivo.

### 11. Consensi e prova della retention — Parzialmente risolta

Il signup registra separatamente versione e timestamp di Termini, Privacy e avviso beta nei metadata dell'utente. È un miglioramento rispetto alla situazione precedente.

Restano però questi limiti:

- i documenti associati alle versioni `terms-1.0` e `privacy-1.0` sono ancora provvisori nelle pagine pubbliche;
- i metadata dell'utente non costituiscono uno storico server-side immutabile dei consensi;
- l'avviso beta afferma che il prodotto non è adatto a dati sensibili o reali, in contrasto con il lancio previsto per professionisti sanitari;
- i tempi di retention presenti nel codice e nei documenti non coincidono.

## Verifiche tecniche effettuate

- Build di produzione completata con successo.
- Suite applicativa: 342 test superati.
- Test del solver: 68 test superati.
- Migrazioni locali e remote allineate fino a `202607210002`.
- Edge Function `optimize-schedule` attiva con verifica JWT.
- Lint del database remoto: errori in `delete_account()` e `purge_expired()`, oltre ad alcuni errori preesistenti in funzioni dello schema `app`.
- Header di sicurezza verificati sul server di produzione locale.
- Le pagine Privacy/Termini locali mostrano ancora i testi provvisori.
- Nessun test dedicato trovato per export, cancellazione, purge, reset demo, consensi e avviso vocale.
- Stato esatto dell'ultimo deployment Vercel non verificato per credenziali CLI non valide.

## Priorità residue

1. Correggere e testare realmente `delete_account()` e `purge_expired()`.
2. Definire una sola policy di retention e applicarla coerentemente a codice, database, backup e documentazione.
3. Pubblicare Termini e Informativa completi e coerenti in EN, IT ed ES.
4. Isolare o rimuovere la demo completa condivisa e proteggere il reset con una misura persistente.
5. Completare DPIA, DPA, registro trattamenti e documentazione dei fornitori per i dati sanitari.
6. Attivare MFA e verificare le policy direttamente su Supabase Auth.
7. Forzare la regione UE delle Edge Functions e restringere il CORS.
8. Mostrare l'avviso vocale da ogni punto di ingresso al microfono.
9. Conservare uno storico immutabile delle versioni legali accettate.

## Fonti ufficiali di riferimento

- Commissione europea, dati sensibili: <https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/sensitive-data_en>
- Supabase, invocazioni regionali delle Edge Functions: <https://supabase.com/docs/guides/functions/regional-invocation>
- Supabase Data Processing Addendum: <https://supabase.com/downloads/docs/Supabase%2BDPA%2B260601.pdf>

