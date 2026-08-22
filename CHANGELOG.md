# Changelog

Tutte le modifiche rilevanti a questo progetto sono elencate qui, più recenti
in cima. Formato libero, in italiano, pensato per un riepilogo rapido prima
di aggiornare via HACS — non un changelog automatico.

## [0.4.0] - 2026-08-22

Questa versione è quella che fa funzionare per la prima volta il salvataggio
reale della dashboard. Tutti i problemi sotto erano presenti da prima, mai
notati perché il frontend non arrivava mai a mostrare un errore leggibile.

### Fix critici
- **`cyborg_dashboard/get` e `.../save` fallivano su ogni chiamata.**
  `async_register_websocket()` registrava i comandi WebSocket con una firma
  di `async_register_command()` che lascia lo schema di validazione a
  `None`; l'API di Home Assistant chiama `schema(msg)` prima di invocare
  l'handler, quindi ogni chiamata falliva con
  `TypeError: 'NoneType' object is not callable`. Il frontend interpretava
  il fallimento del `get` come "dashboard non caricabile" e mostrava sempre
  la configurazione di default — è per questo che la dashboard si chiamava
  sempre "NEXUS" invece di mostrare le tue card salvate: **non erano mai
  state salvate per davvero**.
- **Il pannello sidebar andava in crash a ogni reload dell'integrazione**
  (es. dopo un aggiornamento HACS): `ValueError: Overwriting panel
  cyborg-dashboard`. La registrazione del pannello non era idempotente e
  non veniva mai rimossa in `async_unload_entry`.
- **Il frontend non veniva proprio parsato dal browser.**
  `www/cyborg-dashboard.js` dichiarava due volte, a livello di modulo, le
  stesse funzioni (`coerceNumber`, `evaluateRule`, `resolveRuleStyle`) — un
  `SyntaxError` fatale che impediva il caricamento dell'intero componente.
- **Il Property Editor andava in crash aprendo una card**
  (`ReferenceError: DEFAULT_STATES is not defined`) — variabile morta, mai
  dichiarata, rimossa.

### Novità
- **Concorrenza ottimistica sul salvataggio.** Il dashboard porta ora un
  campo `revision`; se due editor (o due tab) provano a salvare sullo stesso
  stato di partenza, il secondo salvataggio viene rifiutato con un errore
  invece di sovrascrivere silenziosamente il primo (last-write-wins solo se
  il client non specifica la revision attesa, per compatibilità).
- Rinominato il titolo di default della dashboard da "NEXUS" a "Cyborg".

## [0.3.1] e precedenti

Non tracciate in questo changelog (introdotto a partire dalla 0.4.0).
