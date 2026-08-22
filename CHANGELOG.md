# Changelog

Tutte le modifiche rilevanti a questo progetto sono elencate qui, più recenti
in cima. Formato libero, in italiano, pensato per un riepilogo rapido prima
di aggiornare via HACS — non un changelog automatico.

## [0.6.0] - 2026-08-22

Mappa 3D della casa, costruita dentro Cyborg senza alcuna dipendenza esterna.

### Novità
- **Pagine multiple con tab.** Una pagina ora dichiara un `type`: `sections`
  (la dashboard a card) oppure `floorplan` (la mappa 3D). L'installazione
  standard ne monta due, navigabili dai tab in testata.
- **Mappa 3D isometrica in CSS 3D puro.** Niente Three.js, niente Babylon.js,
  niente WebGL, niente libreria vendorizzata: le stanze sono volumi estrusi
  con pavimento e quattro muri, resi con `transform: rotateX()/rotateZ()` e
  composti dalla GPU. Motivazione: zero codice di terzi significa zero rischio
  di licenza e di supply-chain su un prodotto destinato alla rivendita, e un
  tablet economico da parete regge 60fps dove una scena WebGL scalderebbe e
  scatterebbe. La geometria di un appartamento sono scatole: un renderer
  poligonale qui non aggiunge nulla.
- **Generazione della pianta dalle aree di Home Assistant.** Un pulsante legge
  il registro aree e crea una stanza per area, con nome, icona dedotta dal
  nome (Soggiorno -> divano, Bagno -> doccia, ...) e colore distinto.
- **Entità collegate da sole.** Le targhette di una stanza escono dal registro
  entità: l'area effettiva di un'entità è il suo `area_id` con fallback su
  quello del dispositivo — la stessa logica di HA core
  (`helpers/entity_registry.py`), senza la quale la maggior parte delle entità
  resterebbe non assegnata, perché in pratica l'area si imposta sul
  dispositivo. Le entità sono ordinate per rilevanza (clima, luci,
  temperatura, tapparelle, aperture, ...) e limitate a 6 per stanza.
- **Targhette leggibili sempre.** Ogni stanza ha un unico cartellino
  controruotato rispetto alla camera, quindi resta frontale a qualsiasi
  rotazione. Le luci e gli interruttori si accendono toccandoli.
- **Trascinamento delle stanze.** Il delta del puntatore viene riportato in
  coordinate di pianta invertendo la trasformazione del mondo, altrimenti
  trascinando verso destra con la vista ruotata la stanza scivolerebbe in
  diagonale.
- **Controlli camera:** rotazione, inclinazione, zoom, altezza muri, muri e
  nomi on/off, e passaggio immediato tra vista isometrica e pianta dall'alto.

### Correzioni
- Gli id generati di default per stanze, sezioni e card venivano numerati
  sull'indice della lista grezza: elementi malformati scartati lasciavano
  buchi (`room-1`, `room-4`). Ora la numerazione segue la lista filtrata.

### Verifica
- `tests/frontend.test.js`: 102 asserzioni (30 nuove sulla mappa 3D, incluso
  il controllo che `unprojectDelta` inverta esattamente la trasformazione del
  mondo su quattro configurazioni di camera).
- `tests/visual/`: la pagina viene renderizzata in Chromium headless e
  misurata — 9 asserzioni geometriche verificano che in pianta non ci sia
  deformazione prospettica, che in isometrica il pavimento sia schiacciato,
  che i muri salgano sopra il pavimento invece di penderci sotto, e che le
  targhette prendano nome ed entità dal registro aree.

## [0.5.0] - 2026-08-22

Riscrittura dell'architettura della dashboard: le sezioni diventano oggetti di
primo livello. È la versione che rende Cyborg una dashboard domotica vera e
non un elenco piatto di card scollegate.

### Novità
- **Sezioni di primo livello (schema v3).** Prima una card portava una stringa
  `section` libera e il raggruppamento veniva ricostruito a ogni render: due
  refusi ("Energia"/"energia") producevano due blocchi distinti e una sezione
  non poteva esistere senza card dentro. Ora la pagina possiede
  `sections[]`, ogni sezione ha id stabile, titolo, icona, colore accento e
  stato compresso/espanso, e possiede il proprio elenco ordinato di card.
- **Migrazione automatica v2 -> v3.** Le dashboard esistenti vengono convertite
  al caricamento raggruppando le card per il vecchio campo `section` (merge
  case-insensitive, vince la prima grafia vista). Nessuna riconfigurazione
  manuale, nessuna card persa.
- **Composizione automatica.** Un pulsante analizza il registro entità di Home
  Assistant e costruisce Sicurezza / Energia / Clima / Illuminazione /
  Presenza / Sistema già popolate. Ogni entità viene assegnata a una sola
  sezione (assegnazione per punteggio, vince il match più alto) e le entità
  `unavailable`/`unknown` sono escluse.
- **Gestione completa delle sezioni dall'editor:** crea da preset o vuota,
  rinomina, cambia icona e colore, riordina su/giù, comprimi, elimina.
- **Le card si spostano tra sezioni** da una tendina nell'editor della card.
- **Nuovi tipi di card:** `climate` (temperatura attuale + target + modalità),
  `gauge` (barra percentuale) e `chart` (sparkline reale delle ultime 24h via
  il comando core `history/history_during_period` — nessuna dipendenza
  esterna).
- **Dimensione al posto delle coordinate.** Le card dichiarano solo
  Piccola/Media/Grande/Piena e fluiscono nell'ordine dell'elenco; si riordinano
  con le frecce. Le vecchie coordinate x/y/w/h obbligavano a ragionare in
  matematica di griglia e producevano card sovrapposte o invisibili.

### Prestazioni e affidabilità
- **Re-render mirato.** `set hass` ora confronta una firma calcolata solo sulle
  entità effettivamente presenti in dashboard. Con 380 entità il pannello non
  ricostruisce più il DOM a ogni aggiornamento di un sensore che non stai
  nemmeno mostrando.
- **Il focus non si perde più mentre scrivi** nell'editor: posizione del cursore
  e campo attivo vengono ripristinati dopo il repaint.
- **Suite di test.** `tests/schema.test.py` (migrazione, idempotenza, input
  malformati) e `tests/frontend.test.js` (72 asserzioni: composizione
  automatica, rendering di ogni tipo di card, escaping XSS, mutazioni,
  firma anti-rerender, bilanciamento dei tag, ricerca, tap action, sparkline).

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
