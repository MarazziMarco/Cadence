# Nota informativa funzione vocale — Cadence

Testo da mostrare **prima di attivare il microfono** e da usare come descrizione
della funzione. Sostituisce qualunque affermazione che la trascrizione sia
"solo nel browser / solo locale".

_Versione 1.0 — 21 luglio 2026_

## Avviso pre-attivazione (mostrare al primo uso del microfono)
> **Dettatura vocale.** La trascrizione usa il riconoscimento vocale del tuo
> browser. A seconda del browser (ad esempio Chrome), l'audio può essere inviato
> ai server del fornitore del browser per essere convertito in testo. Evita di
> dettare dati non necessari. Puoi sempre inserire il testo manualmente.
>
> [ Ho capito, attiva il microfono ]   [ Annulla ]

## Descrizione breve (tooltip / sotto il pulsante microfono)
> La trascrizione può usare un servizio del fornitore del browser. Alternativa:
> scrivi il testo a mano.

## Regole di implementazione
- **Non descrivere** la trascrizione come esclusivamente locale/on-device.
- Mostrare l'avviso **la prima volta** che l'utente attiva il microfono (memorizza
  la presa visione, es. in localStorage, per non ripeterlo ogni volta).
- Usare `SpeechRecognition.processLocally = true` quando il browser lo supporta
  (best effort), senza però promettere che il trattamento sia solo locale.
- Mantenere sempre disponibile l'**input testuale** come alternativa equivalente.
- Coerente con l'Informativa privacy §7.
