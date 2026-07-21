# Consensi in fase di registrazione — Cadence

Testi e struttura da usare nel form di iscrizione. Sostituiscono l'attuale
checkbox unica (Termini + Privacy insieme), separando accettazione contrattuale,
presa visione dell'informativa ed eventuali consensi facoltativi.

_Versione 1.0 — 21 luglio 2026_

## Checkbox da mostrare

**1. Termini di servizio (obbligatoria)**
> Ho letto e accetto i [Termini di servizio](/terms).

**2. Informativa privacy (obbligatoria — presa visione, non "consenso")**
> Ho letto l'[Informativa sulla privacy](/privacy) e sono informato/a su come
> vengono trattati i miei dati.

**3. Dati sanitari — solo se la base scelta è il consenso esplicito (facoltativa/condizionata)**
> Acconsento al trattamento di eventuali dati relativi alla salute inseriti per
> la gestione degli appuntamenti, come descritto nell'Informativa.

> Nota: se la base giuridica per i dati sanitari è l'art. 9.2.h (finalità di cura),
> questa checkbox può non essere necessaria; se è l'art. 9.2.a (consenso
> esplicito), è obbligatoria. Coerente con l'informativa §3.

**4. Comunicazioni facoltative (facoltativa) — solo se attiverai email marketing**
> Desidero ricevere aggiornamenti e novità su Cadence via email. (Revocabile in
> ogni momento.)

## Regole
- Le checkbox **1 e 2 sono separate** e obbligatorie per completare la
  registrazione; **non precompilate**.
- La checkbox **4** (e la 3 se usata come consenso) sono **facoltative,
  separate e non precompilate**; il servizio funziona anche senza.
- Nessun consenso "a pacchetto": ognuno è distinto e revocabile.

## Cosa registrare nel database (prova del consenso)
Alla creazione dell'account salvare, per l'utente:

```json
{
  "consents": {
    "terms":   { "accepted": true, "version": "terms-1.0",   "at": "2026-07-21T10:00:00Z" },
    "privacy": { "seen": true,     "version": "privacy-1.0", "at": "2026-07-21T10:00:00Z" },
    "health":  { "accepted": false, "version": "privacy-1.0", "at": null },
    "marketing": { "accepted": false, "version": "privacy-1.0", "at": null }
  }
}
```

- Salvare **versione + timestamp** di ciò che l'utente ha effettivamente
  accettato (così, se aggiorni Termini/Privacy, sai chi ha accettato quale
  versione).
- Alla revoca (es. marketing) aggiornare `accepted:false` + nuovo timestamp,
  senza cancellare lo storico.
- Suggerimento tecnico: una colonna `metadata` JSON sul profilo utente basta —
  nessuna tabella nuova necessaria.
