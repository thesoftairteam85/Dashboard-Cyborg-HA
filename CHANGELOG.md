# Changelog

Tutte le modifiche rilevanti a questo progetto sono elencate qui, più recenti
in cima. Formato libero, in italiano, pensato per un riepilogo rapido prima
di aggiornare via HACS — non un changelog automatico.

## [0.16.0] - 2026-08-23

La mappa 3D diventa un edificio: si ridimensiona, cambia forma, sale e scende
di piano, e ci si entra dentro a vedere dove sta ogni dispositivo.

### Mappa: piani veri
- Ogni stanza ha un **piano**. Dal pannello della stanza la alzi o l'abbassi
  di un piano alla volta, da -3 (interrato) a +8, e nella scena viene
  sollevata davvero: i piani si impilano uno sopra l'altro.
- **Selettore dei piani** sulla mappa quando l'edificio ne ha più di uno:
  isola un piano e gli altri restano visibili in trasparenza, come riferimento,
  invece di sparire.
- **Distanza tra i piani** regolabile (40-400) dal pannello della pagina.
- La prospettiva della scena si adatta all'altezza dell'edificio. Con la
  vecchia prospettiva fissa un palazzo di otto piani avrebbe attraversato il
  piano della camera e i piani alti si sarebbero rovesciati.
- La **configurazione guidata** ora chiede a che piano si trova ogni stanza, e
  dispone ciascun piano sulla propria griglia.

### Mappa: dimensione e forma
- **Otto maniglie** sulla stanza selezionata: quattro angoli e quattro lati.
  Si trascinano direttamente sulla mappa, anche con la vista ruotata, e la
  stanza si ridimensiona con passo di 5 unità.
- **Forme pronte**: rettangolo, due varianti a L, a T, trapezio, smussata.
- **Vertici trascinabili** uno per uno per le stanze non rettangolari, con i
  pallini vuoti a metà lato che aggiungono un vertice dove serve.
- I muri non sono più quattro fissi: ne viene generato uno per ogni lato del
  perimetro, con una luce diversa a seconda dell'orientamento, altrimenti una
  stanza a L si legge come una macchia informe.
- La stanza in modifica nasconde le sue targhette di stato: coprivano proprio
  la geometria che stai spostando.

### Mappa: dispositivi
- **AGGIUNGI DISPOSITIVO** direttamente dalla stanza. Prima bisognava trovare
  e togliere una spunta "automatiche dall'area" prima che il pulsante di
  ricerca comparisse: chi non la trovava concludeva, correttamente, che il
  sistema non permettesse di aggiungere niente.
- La ricerca propone **per prime le entità dell'area della stanza**, senza
  digitare nulla.
- Scegliere un dispositivo converte da solo la stanza da automatica a manuale,
  invece di ignorare il clic.

### Mappa: dentro la stanza
- Toccando il **nome di una stanza** la vista ci entra dentro: zoom calcolato
  sulla stanza e sulla dimensione reale del riquadro, camera traslata sulla
  stanza, gli altri ambienti sfumano e i muri diventano trasparenti, come una
  casa delle bambole aperta.
- Dentro si vedono **tutti** i dispositivi (non i primi sei), ciascuno al
  proprio posto, con nome e valore.
- In modifica, ogni dispositivo si **trascina** dove sta davvero nella stanza.
  La posizione viene salvata; chi non è stato posizionato si dispone da solo.
  Un dispositivo trascinato fuori dal perimetro di una stanza a L viene
  rifiutato.
- Le icone dei dispositivi mantengono la loro dimensione a qualsiasi zoom:
  scalavano con la scena e a zoom 3× diventavano dischi da 110px sovrapposti.

### Schema
- Versione 5. Una dashboard salvata con la versione precedente viene migrata
  senza perdere nulla: le stanze esistenti restano dove sono, al piano terra,
  rettangolari.

### Verifica
- 425 asserzioni sulla logica del pannello, tutti i test di schema, **38
  asserzioni geometriche misurate** in Chromium headless: salto verticale tra
  i piani, simmetria fra salita e discesa, assenza di derive laterali, muri
  generati per una stanza a L, posizione reale delle maniglie, dimensione
  delle icone dentro la stanza.

## [0.15.0] - 2026-08-23

Le azioni al tocco ora fanno davvero quello che promettono, e l'editor spiega
ogni voce.

### Correzione
- **Alcune azioni non funzionavano affatto.** L'editor offriva
  Accendi / Spegni per qualsiasi entità, ma verificato sull'istanza reale:
  il dominio `cover` non ha `turn_on` né `turn_off` (ha `open_cover`,
  `close_cover`, `stop_cover`, `toggle`) e `lock` ha solo `lock`, `unlock`,
  `open` — nessun `toggle`. Toccando una tapparella o una serratura veniva
  chiamato un servizio inesistente e non succedeva nulla, senza alcun errore
  visibile. Su un sensore veniva chiamato `homeassistant.turn_on`, altrettanto
  inutile.
- Ora ogni dominio dichiara le azioni che supporta davvero, con il **nome del
  servizio reale mostrato accanto all'opzione** (`cover.open_cover`), e
  l'editor elenca solo quelle. Un'entità non comandabile lo dice: "un sensore
  non si comanda, si può solo aprirne i dettagli".
- Una card salvata con un'azione non più applicabile (una tapparella con
  "Accendi") **apre i dettagli** invece di chiamare un servizio inesistente.
- Tapparelle e valvole dicono Apri / Chiudi / Ferma, serrature Blocca /
  Sblocca, scene Attiva, script Esegui, pulsanti Premi: le parole del dominio,
  non quelle di una lampadina.

### Chiarezza
- **I tipi di card sono divisi in due gruppi**: quelli che mostrano l'entità
  scelta e le **card autonome** che costruiscono il proprio contenuto e
  l'entità non la usano. Sceglierne una su una card con un'entità collegata
  ora avvisa esplicitamente, invece di ignorarla in silenzio.
- Ogni tipo ha una **descrizione in una riga** sotto la tendina, che cambia con
  la selezione.

### Verifica
- `tests/frontend.test.js`: 350 asserzioni (24 nuove), fra cui che ogni
  servizio dichiarato sia quello vero, che una tapparella non offra Accendi,
  che un'azione obsoleta non chiami più `cover.turn_on`, e che un sensore non
  provochi alcuna chiamata di servizio.

## [0.14.0] - 2026-08-22

Gestione delle pagine, dashboard impostabile come predefinita, analisi
economica dell'energia.

### Correzioni strutturali
- **Non esisteva alcun modo di aggiungere una pagina.** Le pagine venivano
  soltanto da `default_dashboard()`, che si applica a un'installazione nuova e
  a nient'altro: `result.update(data)` sostituisce l'intera lista con quella
  salvata. Ogni pagina aggiunta ai valori predefiniti dopo la prima
  installazione non è mai arrivata a chi aveva già una dashboard — ecco perché
  **la Mappa 3D non compariva**. Ora l'editor di pagina permette di
  aggiungere, rinominare, riordinare ed eliminare pagine, e la migrazione
  aggiunge la pagina Mappa 3D quando manca, senza toccare nulla di
  configurato.
- **"Non mi fa eliminare le card".** L'eliminazione funzionava, ma senza
  salvare tornava tutto com'era e non c'era alcuna indicazione di modifiche in
  sospeso. Ora ogni mutazione marca la configurazione come modificata, la
  testata mostra **MODIFICHE NON SALVATE**, il pulsante SALVA si evidenzia, e
  uscire dalla modalità modifica salva invece di buttare via le modifiche.

### Novità: la dashboard può essere la plancia predefinita
- **Lo stesso componente è ora anche una card Lovelace** (`cyborg-dashboard-card`).
  Un pannello personalizzato e una dashboard Lovelace sono oggetti diversi in
  Home Assistant, e solo una dashboard Lovelace può essere scelta come
  predefinita. Creando una normale dashboard Lovelace con dentro questa sola
  card in modalità Pannello, **quella** si imposta come predefinita.
- Il modulo viene pubblicato su tutte le pagine del frontend con
  `frontend.add_extra_js_url` (verificato in core 2026.8.3): la card è
  disponibile subito, senza aggiungere risorse a mano.

### Novità: analisi economica
- **Spesa netta del periodo** (oggi / 7 giorni / 30 giorni / 12 mesi) con il
  confronto che conta davvero per un impianto fotovoltaico: **quanto avresti
  speso senza**, e quindi quanto hai risparmiato.
- Ripartizione fra prelievo (costo), autoconsumo (costo evitato) e immissione
  (ricavo), con tariffe configurabili.
- I kWh vengono dalle **statistiche a lungo termine**
  (`recorder/statistics_during_period`, verificato in core 2026.8.3), non
  dagli stati istantanei: una potenza non dice quanto è costato un periodo.
  L'energia di una finestra è ultimo meno primo valore del contatore, non la
  somma dei campioni — sommarli conterebbe la lettura del contatore infinite
  volte.
- **Rilevamento dalla Dashboard Energia**, tariffa inclusa: fra più contratti
  di rete viene proposto il prezzo più alto, perché è quello che pesa.
- Nuove sezioni pronte all'uso: **Monitoraggio** ed **Economia**, che si
  aggiungono con la card già dentro.

### Verifica
- `tests/frontend.test.js`: 326 asserzioni (32 nuove su gestione pagine, stato
  di modifica e analisi economica, inclusa la verifica che un ridisegno di
  sfondo non finga modifiche dell'utente).
- `tests/schema.test.py`: la migrazione aggiunge la mappa a una dashboard
  esistente lasciando intatti contenuti e numero di revisione, e non ne
  aggiunge una seconda.

## [0.13.0] - 2026-08-22

Videocamere in diretta e dettaglio meteo.

### Novità
- **Card Videocamere.** Griglia di anteprime; toccandone una si apre la
  **diretta**. Le anteprime sono fermi immagine aggiornati a intervalli e solo
  la camera che apri diventa un flusso: otto connessioni MJPEG simultanee
  saturerebbero un tablet da parete e le camere stesse, per una parete di
  immagini che nessuno sta guardando. L'aggiornamento sostituisce la sorgente
  dell'immagine sul posto, senza ricostruire il DOM, così le anteprime non
  lampeggiano.
- Endpoint verificati sul sorgente di Home Assistant 2026.8.3
  (`components/camera/__init__.py`): `/api/camera_proxy/{id}?token=…` per il
  fermo immagine e `/api/camera_proxy_stream/{id}?token=…` per l'MJPEG, che sta
  dentro un `<img>` senza alcuna libreria. Il token viene letto dagli attributi
  della camera al momento del render, mai messo in cache, perché HA lo ruota.
- **La composizione della Sicurezza guida con le videocamere** invece di una
  card di stato per ciascuna, che non serviva a niente.
- **Dettaglio meteo.** La card meteo ora si apre: temperatura e condizione in
  grande, andamento delle prossime 12 ore con grafico e probabilità di pioggia,
  previsioni a 7 giorni con minime e precipitazioni, e le condizioni attuali —
  percepita, umidità, pressione, vento con rosa dei venti, visibilità, indice
  UV, alba e tramonto. Le previsioni orarie sono sottoscritte solo se l'entità
  dichiara di supportarle (bit 2 di `supported_features`).

### Correzioni
- **Dipendenza implicita da `entity_id` sull'oggetto stato.** Camere e dettaglio
  meteo leggevano l'identificativo dall'oggetto di stato invece di riceverlo:
  funzionava in Home Assistant ma produceva silenziosamente URL
  `/api/camera_proxy/undefined?token=…` con qualunque oggetto stato privo di
  quel campo. Ora l'id viene passato esplicitamente ovunque.

### Verifica
- `tests/frontend.test.js`: 294 asserzioni (24 nuove su camere e dettaglio
  meteo), incluse la distinzione fermo immagine/flusso, la camera non
  disponibile e la formattazione degli orari nel fuso del browser.

## [0.12.0] - 2026-08-22

Correzione critica sulle unità di misura, diagramma ridisegnato e nuova sezione
Monitoraggio.

### Correzione critica
- **Le unità di misura venivano ignorate.** Ogni potenza veniva letta con
  `parseFloat` e trattata come watt: un sensore di casa in kW valeva 0,2 contro
  carichi in W da 246, quindi la casa risultava da 0,2 W e le quote dei carichi
  arrivavano al 136556%. Ora ogni lettura passa per una conversione esplicita
  (W, kW, MW, mW, VA, kVA, var) prima di essere usata in qualunque calcolo.
  Su un prodotto energetico è un errore che invalida ogni numero mostrato: c'è
  una batteria di test dedicata, incluso il caso esatto osservato sul campo.

### Correzione bloccante
- **Configurando, la pagina tornava in cima a ogni tocco.** Ogni interazione
  ricostruisce il DOM e la posizione di scorrimento andava persa: veniva
  salvato solo il focus. Ora vengono salvati e ripristinati anche lo scorrimento
  della pagina, del pannello di modifica e degli elenchi, prima che il browser
  ridisegni.

### Diagramma del flusso ridisegnato
- **Icone vere:** il traliccio per la rete, la casa per la casa, il pannello per
  il fotovoltaico, l'accumulo per la batteria. I nodi sono ora elementi HTML
  sovrapposti al livello SVG, perché l'SVG non può ospitare `<ha-icon>`; il
  livello SVG conserva solo i percorsi e le particelle.
- **Dimensioni proporzionali alla potenza**, con l'*area* del disco
  proporzionale al valore — è così che si legge un cerchio: raddoppiando la
  potenza raddoppia l'inchiostro. Anche lo spessore dei collegamenti segue la
  potenza.
- **Percentuali rimosse.** La geometria dice già la proporzione; i numeri
  percentuali erano rumore (ed erano sbagliati per via del bug sulle unità).
- **I collegamenti si fermano al bordo dei dischi** invece di correre fino ai
  centri, così una linea non attraversa mai l'etichetta del nodo che collega, e
  la lettura dei nodi principali sta dentro il disco.

### Novità: sezione Monitoraggio
- **Cursore di prelievo** contro la potenza contrattuale, con soglia d'ambra
  all'80% e stato rosso oltre il limite, margine residuo in chiaro e preset per
  i contratti domestici italiani (3, 3.3, 4.5, 6, 10, 15 kW).
- **Letture diagnostiche raggruppate** — tensioni, correnti, temperature dei
  dispositivi, frequenza, fattore di potenza, batterie — trovate da sole in base
  al `device_class`.
- **Tolleranze reali, non inventate:** tensione contro EN 50160 (230 V ±10%,
  cioè 207–253 V), frequenza 50 Hz ±1%, temperature oltre 70 °C in avviso e
  oltre 85 °C in allarme, fattore di potenza sotto 0,90 segnalato perché
  penalizzabile. Le letture fuori tolleranza salgono in cima al gruppo: su un
  pannello diagnostico denso il punto è individuare la lettura sbagliata, non
  leggerle tutte.
- La composizione della Panoramica aggiunge la sezione e riusa il sensore di
  rete già individuato per il flusso, senza richiederlo due volte.

### Verifica
- `tests/frontend.test.js`: 270 asserzioni (22 nuove su unità di misura e
  monitoraggio, incluse le soglie normative e il caso kW/W osservato).
- Verifica in Chromium con misura di raggi e spessori.

## [0.11.0] - 2026-08-22

Configurazione guidata anche per la mappa 3D.

### Novità
- **La mappa 3D chiede quante stanze ci sono e cosa c'è dentro.** Stessa
  procedura passo passo del flusso energetico: prima quali stanze esistono,
  poi una schermata per stanza con le entità che ci compaiono, infine il
  riepilogo e la creazione della pianta.
- **Le stanze non sono più vincolate alle aree di Home Assistant.** Le aree
  vengono proposte già spuntate, ma se ne possono togliere e soprattutto se ne
  possono scrivere di nuove: una casa senza aree configurate deve comunque
  poter disegnare la sua pianta. Una stanza scritta a mano prende l'icona dal
  nome (Taverna -> scale, Garage -> box) e le sue entità si scelgono
  singolarmente, dato che non ha un'area da cui dedurle.
- **La lunghezza della procedura segue le tue risposte:** togliendo una
  stanza al primo passo, la barra di avanzamento si accorcia.
- Per le stanze collegate a un'area, l'automatico resta consigliato: la
  stanza mostra sempre le entità più utili e si aggiorna da sola quando
  aggiungi dispositivi in Home Assistant. Disattivandolo, la lista parte già
  popolata con quello che l'area produce ora, invece che da zero.
- La mappa vuota apre sulla procedura guidata; "Genera e basta" resta lì per
  chi vuole la scorciatoia.

### Verifica
- `tests/frontend.test.js`: 233 asserzioni (24 nuove sul wizard della mappa,
  incluse la stanza scritta a mano senza area, l'accorciamento della
  procedura e il fatto che l'automatico venga salvato come "automatico" e non
  come una lista congelata).
- Verifica a 390 px in Chromium: la procedura si apre nel pannello a
  scomparsa e avanza correttamente da un passo all'altro.

## [0.10.0] - 2026-08-22

Editor usabile da telefono e configurazione guidata del flusso energetico.

### Correzione bloccante
- **L'editor era irraggiungibile da telefono.** Sotto i 1200 px il pannello
  smetteva di stare a destra e finiva in fondo al documento, sotto tutte le
  card: premere CONFIGURA selezionava davvero la card, ma il pannello si
  apriva diverse schermate più in basso e non lo vedeva nessuno. Ora sotto
  quella soglia è un pannello a scomparsa ancorato in basso, con sfondo
  oscurato, maniglia e chiusura toccando fuori. Su desktop non cambia niente.
  Il difetto c'era perché non avevo mai provato la dashboard a larghezza
  telefono: ora c'è un test che la apre a 390 px, preme CONFIGURA e verifica
  che il pannello sia effettivamente dentro lo schermo.
- L'editor di pagina non aveva alcun pulsante di chiusura: su telefono
  significava restare intrappolati nel pannello.

### Novità
- **Configurazione guidata del flusso energetico**, sul modello della
  procedura di Home Assistant: una domanda per schermata — fotovoltaico,
  accumulo, rete, consumo di casa, carichi, gerarchia — con barra di
  avanzamento, possibilità di saltare ogni passo e di tornare indietro.
  Mostra solo sensori con `device_class: power`, con il valore attuale
  accanto a ciascuno per riconoscerli a colpo d'occhio, e marca come
  **consigliato** quello il cui nome combacia con la domanda. La
  configurazione manuale resta raggiungibile da "Configurazione avanzata".
- **Gerarchia dei consumi.** Un carico può essere dichiarato compreso dentro
  un altro (una presa a valle di un quadro che stai già misurando). Il
  sotto-albero lo disegna su un secondo livello sotto il genitore, con la
  quota calcolata sul genitore e non sulla casa. Soprattutto: **un carico
  annidato non viene sommato al totale misurato**, perché il suo consumo è
  già dentro quello del genitore — contarli entrambi inventerebbe consumo
  inesistente e azzererebbe il "Non misurato".
- Le scelte del wizard vengono salvate alla fine della procedura, senza dover
  premere SALVA separatamente.

### Verifica
- `tests/frontend.test.js`: 209 asserzioni (20 nuove su gerarchia e wizard,
  incluso che un genitore inesistente non inghiotta il figlio e che i cicli
  padre-figlio vengano spezzati).
- Nuovo test a 390 px in Chromium: il pannello è `fixed`, dentro lo schermo,
  con sfondo e maniglia; su desktop resta `sticky` senza sfondo.

## [0.9.0] - 2026-08-22

Il nodo Casa del flusso energetico si apre su un sotto-albero dei carichi.

### Novità
- **Clicca su "Casa" e lo schema si espande**: un ramo animato per ogni
  dispositivo che sta assorbendo potenza in quel momento, con watt, nome e
  quota percentuale sul consumo di casa. I rami hanno la stessa animazione
  proporzionale del resto dello schema, quindi si legge a colpo d'occhio chi
  sta tirando davvero.
- **Nodo "Non misurato".** È il motivo per cui vale la pena aprire l'albero:
  vedere che 1,2 kW di un assorbimento da 1,9 kW non è attribuito a nulla dice
  molto più di un elenco ordinato delle tre prese che per caso hai
  strumentato. Compare solo se lo scarto supera il 5% del consumo di casa con
  un minimo di 25 W — sotto quella soglia è arrotondamento tra contatori, non
  un carico nascosto — e solo se c'è almeno un carico misurato con cui
  confrontarlo.
- **Carichi ordinati dal più assorbente**, e chi è a zero non compare: un albero
  pieno di rami da 0 W nasconde quelli che contano.
- Le foglie sono cliccabili e aprono i dettagli dell'entità. Con l'albero
  aperto l'elenco piatto sotto lo schema sparisce, per non dire due volte la
  stessa cosa.

### Note tecniche
- **L'apertura è stato di sessione, non configurazione.** Salvarla nella card
  avrebbe marcato la dashboard come modificata a ogni clic e trasformato una
  curiosità in una scrittura su disco.
- La firma anti-ridisegno ora include le entità del flusso energetico (rete,
  solare, batteria, casa e ogni carico). Senza, l'albero sarebbe rimasto
  congelato finché non cambiava un'entità mostrata da un'altra card.

### Verifica
- `tests/frontend.test.js`: 189 asserzioni (20 nuove sul sotto-albero:
  ordinamento, esclusione dei carichi a zero, calcolo e soglia del resto non
  misurato, somma dei rami uguale al totale di casa, apertura che non sporca
  la configurazione salvata).

## [0.8.0] - 2026-08-22

Pagina Panoramica: meteo, presenze, notifiche, dispositivi accesi e flusso
energetico in una schermata sola.

### Novità
- **Quattro nuovi tipi di card**, non una schermata speciale. Meteo, Attivi
  ora, Notifiche e Presenze sono card normali rese dallo stesso motore a
  sezioni di tutto il resto, quindi si possono mettere in qualsiasi sezione
  invece di restare prigioniere di una pagina "overview".
- **Meteo** con condizioni correnti tradotte, temperatura, vento, pressione e
  striscia delle previsioni a 5 giorni. Le previsioni arrivano da
  `weather/subscribe_forecast`, sottoscritto solo se l'entità dichiara di
  supportarle (bit 1 di `supported_features`): chiederle a un'entità che non
  le espone restituisce un errore.
- **Attivi ora**: tutto ciò che sta funzionando davvero, ordinato dal cambio
  di stato più recente, con un tocco per spegnere. Un clima acceso, una
  tapparella aperta e una luce accesa sono tutti "attivi": quali domini
  contano è configurabile, perché la risposta cambia da casa a casa.
- **Notifiche** persistenti di Home Assistant in tempo reale, più il conteggio
  degli aggiornamenti disponibili.
- **Presenze**: chi è in casa, con foto quando c'è.
- **"COMPONI PANORAMICA"** costruisce la pagina in un click e collega solo le
  card che hanno qualcosa dietro: una tile meteo vuota o una card presenze
  senza persone configurate è peggio di nessuna card.
- La dashboard nuova parte con tre pagine: Panoramica, Cyborg, Mappa 3D.

### Correzioni
- **Le card corte venivano stirate** all'altezza della più alta della riga:
  una card di stato finiva con il badge in fondo e mezzo riquadro vuoto. Ora
  ogni card ha la sua altezza naturale (l'esempio dell'allarme: da 362 a 98 px).
- **Stati in italiano ovunque.** `DISARMED` diceva così; ora dice "Disarmato".
  Idem `PLAYING` -> "In riproduzione", `HEAT COOL` -> "Automatico", `DRY` ->
  "Deumidifica", `OPEN` -> "Aperto". Il vocabolario per device class resta
  prioritario: un sensore porta a "on" dice "Aperta", non "Acceso".

### Note tecniche
- Le sottoscrizioni WebSocket sono gestite da un piccolo registro con chiave e
  chiuse in `disconnectedCallback`. Sottoscrivere dentro un render aprirebbe
  uno stream a ogni ridisegno e li perderebbe tutti; senza la chiusura il
  pannello continuerebbe a ricevere previsioni su un elemento ormai staccato.

### Verifica
- `tests/frontend.test.js`: 169 asserzioni (30 nuove su panoramica e
  vocabolario degli stati, inclusa la verifica che una sottoscrizione venga
  aperta una sola volta e che le card composite non risultino "non
  configurate").
- `tests/visual/`: rendering reale in Chromium, altezze delle card misurate,
  zero errori di console.

## [0.7.0] - 2026-08-22

Rifinitura della dashboard a sezioni e nuova card Flusso energetico.

### Novità
- **Card "Flusso energetico".** Schema animato di Solare / Rete / Batteria /
  Casa, con particelle che scorrono lungo i percorsi a velocità proporzionale
  alla potenza, più l'elenco dei carichi monitorati con la loro quota sul
  consumo di casa. È SVG inline con `<animateMotion>`: l'animazione la gestisce
  il browser fuori dal thread principale, quindi un tablet a parete che tiene
  la card aperta tutto il giorno non spende JavaScript né batteria. Nessuna
  libreria grafica, nessuna dipendenza.
- **Il consumo di casa è calcolato, non richiesto:** solare + prelievo +
  scarica batteria − immissione − carica batteria. Chi ha il contatore di rete
  e quello del fotovoltaico sa già cosa assorbe la casa; pretendere un quarto
  sensore che quasi nessun impianto ha avrebbe lasciato la card vuota. Se il
  sensore "Casa" c'è, ha la precedenza.
- **Segni configurabili per sorgente.** Le convenzioni cambiano da contatore a
  contatore, quindi ogni sorgente ha una spunta "inverti segno" invece di una
  supposizione: immissione e prelievo, carica e scarica, si raddrizzano senza
  toccare i template.
- **Rilevamento dalla Dashboard Energia.** `energy/get_prefs` conserva
  statistiche in kWh, ma uno schema dal vivo vuole potenze in W: le statistiche
  vengono usate come indizio di nome per trovare il sensore di potenza dello
  stesso dispositivo. Quello che non si aggancia resta da collegare a mano,
  invece di essere indovinato male.
- **La composizione automatica mette il flusso in testa alla sezione Energia**
  e prova subito ad agganciarlo: un tipo di card chiamato "energyflow" che
  bisogna sapere di dover aggiungere sarebbe stato di fatto invisibile.

### Correzioni
- **Lo stato era stampato due volte.** Sotto il titolo di una card compariva il
  valore, che il corpo della card ripeteva subito sotto: un sensore di potenza
  diceva "760" e poi "760 W". La riga ora dice *che cosa* è la lettura
  (Potenza, Temperatura, Luce...), non di nuovo il numero.
- **Card troppo alte e vuote:** altezza minima da 118 a 98 px e spaziature
  ridotte; una card sensore era per un terzo aria.
- **Stati leggibili da un essere umano:** una porta ora dice "Aperta"/"Chiusa"
  invece di "ON"/"OFF", e lo stesso vale per movimento, presenza, allagamento,
  fumo, gas, serratura — sia sulle card sia sulle targhette della mappa 3D.
- Le pastiglie della card Clima erano illeggibili: contrasto alzato.

### Verifica
- `tests/frontend.test.js`: 139 asserzioni (37 nuove su flusso energetico e
  leggibilità degli stati, incluso il calcolo del consumo di casa con segni
  diritti e invertiti, entità mancanti e configurazione vuota).
- `tests/visual/`: rendering reale in Chromium headless, 9 asserzioni
  geometriche, zero errori di console.

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
