# Changelog

Tutte le modifiche rilevanti a questo progetto sono elencate qui, più recenti
in cima. Formato libero, in italiano, pensato per un riepilogo rapido prima
di aggiornare via HACS — non un changelog automatico.

## [0.4.2] - 2026-08-22

Fix del fix precedente (0.4.1), individuato subito dopo il deploy leggendo
i log reali dell'istanza invece di assumere che il reload fosse pulito.

### Fix
- **Chiamata bloccante nell'event loop durante la registrazione del
  pannello.** `_integration_version()` (introdotta in 0.4.1 per il
  cache-busting del modulo JS) leggeva `manifest.json` da disco in modo
  sincrono dentro `async_register_panel`, una coroutine eseguita
  nell'event loop di Home Assistant. Il core lo segnalava con
  `Detected blocking call to open ... inside the event loop` — un warning
  oggi, un errore bloccante nelle versioni future di HA. La lettura ora
  passa da `hass.async_add_executor_job()`, eseguita nel thread pool.

## [0.4.1] - 2026-08-22

Fix di caching del pannello: dopo un aggiornamento via HACS, il browser
poteva continuare a eseguire la versione JS precedente del pannello anche
a distanza di ore, dando l'impressione che le modifiche non fossero mai
arrivate mentre lato server erano già installate correttamente.

### Fix
- **Il modulo JS del pannello non veniva ricaricato dal browser dopo un
  aggiornamento.** `panel_custom.async_register_panel` carica
  `cyborg-dashboard.js` come modulo ES tramite `import()` dinamico. Un
  browser non ridefinisce mai un custom element già registrato in un
  documento, quindi se il tab della dashboard restava aperto (o veniva solo
  navigato via SPA, senza reload completo) da prima dell'update, l'utente
  continuava a vedere il componente vecchio in memoria — indipendentemente
  dal fatto che HACS avesse già scritto il file nuovo su disco e
  dall'header `cache_headers=False` già presente sulla static path. Ora
  `module_url` include `?v=<versione da manifest.json>`: ogni bump di
  versione produce un URL diverso, quindi il browser è costretto a
  scaricare e rivalutare il modulo nuovo al prossimo caricamento del
  pannello, senza dover contare su un hard refresh manuale dell'utente.

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
