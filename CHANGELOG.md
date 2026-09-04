# Changelog

Tutte le modifiche rilevanti a questo progetto sono elencate qui, più recenti
in cima. Formato libero, in italiano, pensato per un riepilogo rapido prima
di aggiornare via HACS — non un changelog automatico.

## [0.47.0] - 2026-09-04

Card **Sistema**: un computer sorvegliato per quello che è, non per le
grandezze elettriche che non ha.

### Perché una card a sé e non il Monitoraggio
Il monitoraggio è costruito su grandezze normate — 230 V ±10% secondo EN 50160,
soglie di temperatura sui quadri. La RAM in MiB e un disco pieno all'80% non
stanno in quella tassonomia: infilarceli peggiora entrambe le card, ed è il
motivo per cui il mini PC lì dentro sembrava «un po' random».

### Si sceglie l'apparecchio, non novanta entità
La card parte dall'oggetto giusto: **un dispositivo di Home Assistant**. Scelto
quello, trova da sola fra le sue entità carico CPU e GPU, memoria usata/libera/
totale, swap, temperature, dischi, rete, code di lettura e scrittura, container
attivi e da quanto è accesa la macchina.

**Trovare non è decidere.** Ogni casella ha la sua tendina, e l'opzione
automatica scrive nero su bianco *cosa* ha trovato («trovato da solo: Utilizzo
della CPU»), così si vede se ha preso la cosa giusta prima di fidarsi.
Temperature e dischi si spengono uno per uno con un occhio: al primo tocco la
lista trovata diventa una lista tua, e un elenco vuoto torna a significare
«cercale tu» invece di «non mostrarne nessuna» — altrimenti dall'editor non si
tornerebbe più indietro.

### Le trappole di un vero server, gestite
- **Lo stesso disco sotto tre punti di mount.** In un container `/etc/hosts`,
  `/etc/hostname` e `/etc/resolv.conf` sono legami al disco di sistema: senza
  deduplica la card elencava quattro volte lo stesso 80,7 %. Due mount con
  dimensione e occupato identici sono lo stesso disco, e vengono contati una
  volta sola.
- **Loopback e ponti Docker non sono traffico**: `lo`, `br-*`, `veth*` restano
  fuori dalla rete. Sono la macchina che parla con se stessa.
- **Le partizioni ripetono il disco che le contiene**: se c'è `sda`, allora
  `sda1` e `sda2` sono la stessa coda vista in due punti. Resta l'aggregato.
- **Il load average non è una percentuale**: `Carico CPU 0.03` è un numero di
  processi, e non viene scambiato per `Utilizzo della CPU 7,5 %`.
- **Swap e memoria dei container non sono memoria di sistema.**
- **La percentuale di memoria** si ricava dal totale quando c'è, altrimenti da
  usata + libera: è la stessa cosa, ed è meglio che dichiarare «non
  disponibile» un dato che si ha sotto un'altra forma.

### Soglie tue
Attenzione e allarme per CPU, memoria, disco e temperatura — verde, ambra,
rossa. Sono valori, non verità: un disco al 90 % su una macchina che scrive log
è normale, su un database no. Una soglia lasciata vuota **non è zero**: zero
accenderebbe l'allarme sempre.

### Verificato
- 1200 asserzioni nella suite frontend, **443 misurate** in Chromium headless:
  che l'arco dell'anello copra davvero il 7,5 % della circonferenza per un
  valore di 7,5, che il disco all'80,7 % sia ambra e la CPU al 7,5 % verde,
  che la barra sia lunga l'80,7 % della sua pista, che sul telefono gli anelli
  vadano a capo invece di stringersi fino a diventare illeggibili.
- Schema v18, con la migrazione provata in andata e ritorno.

## [0.46.0] - 2026-08-30

Il contatore generale, e i grafici che smettono di mescolare megabyte e megabit.

### Contatore generale: una dichiarazione invece di venti
Chi ha un interruttore generale misurato vedeva **il generale e la lavatrice
come due rami paralleli della casa** — un impianto che non esiste — finché non
dichiarava a mano, carico per carico, «questo sta sotto quello».

Ora c'è un campo solo, nell'editor del flusso: **CONTATORE GENERALE**. Dichiarato
una volta, **ogni carico che non ha già un padre gli finisce sotto**. Le
parentele dichiarate continuano a vincere: il generale risponde solo per chi non
ha ancora una risposta.

Sotto il generale compare **Altri carichi**: quello che il generale legge e i
suoi figli non spiegano. È un numero vero — i carichi non misurati a valle — non
un arrotondamento fra sensori. Un generale dichiarato ma inesistente, o senza
lettura di potenza, lascia i carichi dove sono invece di appenderli al vuoto.

### Il tipo di grandezza comprende l'unità
Home Assistant mette sotto `data_rate` **sia i MB/s di un disco sia i Mbit/s di
una scheda di rete**, e sotto `data_size` sia la RAM in uso sia la dimensione di
una partizione. Il grafico «tutte di un tipo» li metteva su un asse solo e non
confrontava niente — mentre il suggerimento della card prometteva il contrario.

Il tipo è ora la coppia **classe + unità**: `Velocità dati · MB/s` e `Velocità
dati · Mbit/s` sono due voci distinte. Di conseguenza:

- la **memoria** (`data_size · MiB`) si separa dalla dimensione dei dischi;
- il **carico della CPU** — che non ha nessuna `device_class`, solo un `%` —
  smette di essere invisibile: prima non era nascosto, era proprio assente.

Una card scritta prima porta la classe senza unità: continua a valere e a
significare «tutte le unità di questa classe», ed è offerta come tale
nell'editor.

### Cercare invece di scorrere
Il selettore «aggiungi una grandezza» era una tendina con **tutte** le entità
numeriche dell'impianto. Su un impianto vero non è un elenco, è un muro.
Ora c'è un **campo di ricerca**: cerca fra nome, entity_id, **dispositivo**,
stanza e unità, a parole in qualunque ordine — `mini pc memoria` trova quello
che si sta cercando anche se il nome dell'entità non contiene le due parole
insieme.

### «Tutto un dispositivo», in un colpo solo
Il riempimento in blocco offre ora anche **ogni dispositivo con più di una
lettura numerica**. È il modo di dire «il mini PC» senza sceglierne novanta a
mano. Le entità di servizio (versione firmware, potenza del segnale) restano
fuori, e le letture sono ordinate per unità: se il tetto delle linee taglia,
taglia dentro un'unità sola.

### Verificato
- 1157 asserzioni nella suite frontend, **416 misurate** in Chromium headless.
- Il difetto del generale è nei test in entrambe le direzioni: senza, tre rami
  affiancati; con, un ramo solo e i conti che tornano (il generale è la somma
  dei suoi figli, «Altri carichi» compreso).

## [0.45.0] - 2026-08-30

Analisi economica **nel tempo**: grafico di confronto, mese specifico, batteria.

### Due difetti corretti prima di aggiungere qualsiasi cosa
Il pannello leggeva le statistiche come *ultimo `sum` meno primo `sum`*. Due
conseguenze, entrambe reali:

1. **Il primo bucket della finestra spariva dai totali.** Su trenta giorni era
   un giorno intero di consumo mai contato; su "oggi" era la prima ora.
2. **Le fasce orarie erano sbagliate di un'ora.** L'energia veniva attribuita
   alla fascia dell'ora *precedente*, e le due ore che contano davvero sono
   proprio i confini: le 8 e le 19. Consumo delle 8, che è F1, veniva
   fatturato come F2.

Ora si legge il campo **`change`** di `recorder/statistics_during_period`, che
dichiara quanta energia è passata *dentro* il bucket. È lo stesso campo che
somma il frontend di Home Assistant per calcolare la crescita di un contatore
(`calculateStatisticSumGrowth`). `sum` resta solo come ripiego per un recorder
che non lo restituisse. C'è un test che rimette il difetto e cade.

### Periodi di calendario, non finestre mobili
"30 giorni" è diventato **"Mese"**, e vuol dire *agosto*, non gli ultimi trenta
giorni. La bolletta arriva per mese solare: senza questo, il confronto con la
bolletta — che è lo scopo dichiarato della card — non era possibile. Stessa
cosa per Giorno, Settimana (che comincia di **lunedì**) e Anno.

Accanto ai quattro tab c'è ora una **navigazione avanti/indietro**:
`‹ Luglio 2026 ›`. È navigazione, non configurazione: **vive in memoria e non
finisce nel dashboard salvato**, così un tablet a muro che si riapre non resta
bloccato su marzo. Cambiare scala la azzera.

### Il grafico storico
Una colonna per ogni ora / giorno / mese del periodo, disegnata **a mano in
SVG**: nessuna libreria, nessuna dipendenza che un giorno può sparire.

- **Barra di sinistra: quello che ha consumato la casa**, divisa in azzurro
  (comprato dalla rete) e ambra (venuto dal sole). *La parte ambra è il
  risparmio, nel punto in cui è successo.*
- **Barra di destra: quello che ha prodotto l'impianto**, divisa in ambra
  (rimasto in casa) e verde (immesso in rete).
- Le colonne sono prese dal **calendario**, non dai dati: un giorno senza
  statistiche resta una colonna vuota invece di sparire e far scivolare tutte
  le altre di un posto.
- **Toccando una colonna ci si entra dentro**: dall'anno al mese, dal mese al
  giorno. È il modo naturale di chiedere "e in marzo quanto?".
- Le etichette sono HTML sotto l'SVG, non testo dentro: l'altezza del grafico è
  in pixel e non segue la larghezza della card, e i numeri non si stirano.

### Confronto col periodo precedente
`rispetto a luglio 2026 · consumo −3% · produzione +4% · energia −3,12 €`.
Il periodo precedente **non è una seconda interrogazione**: è la stessa,
cominciata una finestra prima e tagliata al confine. Contro un periodo vuoto
non viene dichiarata nessuna variazione: +1400% contro zero non è
un'informazione.

### Batteria di accumulo
Due nuovi contatori facoltativi, **carica** e **scarica** (schema v17), rilevati
anche dalla Dashboard Energia con un clic. Con l'accumulo collegato:

    consumo di casa = prelievo − immissione + produzione + scarica − carica
    autoconsumo     = produzione + scarica − carica − immissione

Senza batteria i due termini valgono zero e la formula torna esattamente quella
di prima. La **perdita di ciclo** (carica maggiore di scarica, tipicamente un
decimo) non viene nascosta: abbassa l'autoconsumo, che è dove finisce davvero,
ed è scritta a parole perché nessuno la scambi per un errore di misura.

### Coerenza dei colori
Le righe sotto il grafico usano ora **gli stessi colori del grafico**: azzurro
la rete, ambra il sole rimasto in casa, verde quello immesso. Prima l'ambra
voleva dire "immissione" nelle righe e "sole" nel grafico, nella stessa card.
La batteria è viola: è l'unica voce che nel grafico non ha una barra propria.

### Verificato
- `recorder/statistics_during_period` accetta `change` in `types` e `hour`,
  `day`, `month` in `period` — schema letto dal sorgente di core 2026.8.3.
- `BatterySourceType`: `stat_energy_from` è la **scarica**, `stat_energy_to` la
  **carica** — letto dal sorgente, stessa convenzione della rete.
- 1141 asserzioni nella suite frontend, **405 misurate** in Chromium headless
  (geometria e stili calcolati, non immagini), più schema, pannello, notifiche.

## [0.44.0] - 2026-08-30

Modalita' chiosco per i tablet a muro — scelta A: **una dashboard sola**.

### Perche' A
Dal tablet in camera devi poter accendere le luci della sala. Quindi i tablet
vedono **le stesse pagine**, non una configurazione separata da tenere
allineata: cambia solo cosa compare e chi puo' modificare.

### Chi e' in chiosco
Un utente di Home Assistant **non amministratore**. Quello e' un confine di
permessi vero; il pannello decide solo cosa disegnare dentro quel confine.
**L'assenza di `hass.user` vale amministratore, mai chiosco**: indovinare al
contrario chiuderebbe fuori il proprietario dal suo stesso editor la prima
volta che Home Assistant consegna l'oggetto in ritardo, e da dentro il pannello
non ci sarebbe modo di tornare indietro.

### Cosa cambia sul tablet
- **Niente editor**: nessun MODIFICA, nessun salvataggio, nessuna maniglia di
  trascinamento, e il pannello di modifica non viene nemmeno costruito.
- **Pagine e sezioni**: ognuna ha la sua spunta *si vede sui tablet*, decisa da
  te. Chi non ha la chiave (una pagina scritta prima di oggi) resta **visibile**:
  nasconderla da sola sarebbe il sistema che decide al posto tuo.
- **Nessuna pagina abilitata** non lascia uno schermo muto: lo dice a parole.
- **Schermo scuro dopo N minuti** e **ritorno alla prima pagina dopo N minuti**,
  entrambi a scelta e entrambi **spenti di fabbrica**: uno schermo che si
  spegne da solo senza essere stato chiesto e' un guasto, non una funzione.
  Il tocco che riaccende **non preme** quello che c'era sotto.
- **ANTEPRIMA CHIOSCO** nell'editor della pagina: vedi esattamente quello che
  vede un tablet, senza cambiare niente, e si esce dal pulsante in alto.
- I comandi restano comandi: una card di una luce, su un tablet, si tocca e si
  accende. Verificato.

### Nota sulla sicurezza
Il confine reale e' l'utente non amministratore (piu' `local_only` se vuoi
limitare l'accesso alla rete di casa). La barra laterale ridotta e' cosmetica.
Un `panel_custom` **non puo'** essere la dashboard predefinita di Home
Assistant: per far partire un tablet direttamente qui serve una dashboard
Lovelace con una vista `panel` e una sola card `custom:cyborg-dashboard`.

Schema v16.

### Verifiche
1080 asserzioni frontend (22 nuove sul chiosco), 368 misurate in Chromium, piu'
schema, notifiche e chiave di cache.

## [0.43.0] - 2026-08-26

La bolletta vera: fasce orarie, voci fisse, IVA. Piu' la gerarchia in un posto
solo e le letture del monitoraggio scelte a mano.

### Tariffa monoraria o multifascia F1/F2/F3
Fasce verificate su **due fonti indipendenti**, non a memoria:
- **F1** lun-ven 08:00-19:00, festivi esclusi
- **F2** lun-ven 07:00-08:00 e 19:00-23:00; **sabato 07:00-23:00**
- **F3** lun-sab 23:00-07:00, piu' **tutta la domenica e i festivi nazionali**

- In multifascia il sistema legge le statistiche **ora per ora** e capisce da
  solo dove e' finita l'energia: e' l'unica granularita' che possa dirlo, un
  secchio giornaliero non sa se quei kWh sono andati alle undici del mattino o
  a mezzanotte. Home Assistant tiene le statistiche orarie per sempre, quindi
  la domanda ha risposta su tutto lo storico.
- **Pasquetta compresa.** E' l'unico festivo nazionale mobile e vale F3: il
  calcolo della Pasqua (Meeus) e' verificato su tre anni — 2024 il 31 marzo,
  2026 il 5 aprile, 2027 il 28 marzo. Sbagliarlo significa fatturare male un
  lunedi all'anno, l'errore silenzioso che rende inutile un confronto.
- Un contatore che si azzera non produce consumo negativo.

### Le voci che rendono la card confrontabile con la bolletta
- **Voci fisse** — canone, quota di commercializzazione, quota potenza — al
  giorno, al mese o all'anno, **riproporzionate al periodo mostrato** usando il
  mese e l'anno gregoriani medi, cosi' un totale su "30 giorni" non deriva
  perche' febbraio e' corto. 90 € di canone annuo su 30 giorni fanno 7,39 €.
- **IVA** su energia e quote fisse; l'immissione si sottrae **dopo**, perche'
  il ritiro dedicato non e' una voce su cui il cliente paga l'IVA.
- Nella card: le tre fasce con kWh, percentuale ed euro sotto la riga del
  prelievo, il riquadro **Totale stimato in bolletta** con tutte le voci, e nel
  piede il **prezzo medio effettivo**.
- **Il prezzo monorario resta dov'era**: le tre fasce vivono altrove, quindi non
  ci sono due verita' per lo stesso numero e cambiare modo non fa reinserire
  nulla. Se il recorder non risponde la card torna al prezzo unico **e lo
  dichiara**, invece di mostrare zero.

### La gerarchia dei carichi in un posto solo
Nuova sezione **GERARCHIA DEI CARICHI** nell'editor della pagina: ogni contatore
una volta sola, raggruppato per grandezza, con il suo padre — e la nota *via …*
quando la parentela arriva dall'altro sensore dello stesso apparecchio. Le card
restano per dichiararla al volo: e' sempre la stessa mappa.

### Il monitoraggio: quali letture vedere
- **Il difetto**: la card trovava le letture da sola in base al `device_class` e
  non c'era **nessun modo** di dire quali vedere sotto Tensioni, Correnti,
  Temperature, Batterie. L'elenco a mano esisteva gia' nel codice, ma senza un
  comando che lo scrivesse e senza che lo schema lo salvasse: due pezzi su tre.
- Ora ogni gruppo attivo ha il suo elenco con l'occhio acceso/spento. Il primo
  tocco converte il gruppo da automatico a **scelto da te** — senza quella
  conversione, spegnere un occhio su un elenco trovato da solo non avrebbe
  niente su cui scrivere e non farebbe nulla.
- **AUTOMATICO** riporta il gruppo com'era. Il **massimo per gruppo** vale solo
  in automatico: su un elenco scelto a mano sarebbe un modo di nascondere in
  silenzio qualcosa che e' stato chiesto espressamente.
- Un'entita' scelta che poi sparisce da Home Assistant resta nell'elenco,
  marcata *assente*: altrimenti non ci sarebbe modo di toglierla.
- Schema v15.

### Verifiche
1057 asserzioni frontend, 368 misurate in Chromium — fra cui che la somma delle
tre fasce sia esattamente il costo del prelievo e che il totale del riquadro sia
davvero la somma delle righe sopra.

## [0.42.0] - 2026-08-26

«Compreso dentro» anche nell'editor del flusso energetico.

### Non era ridondanza: era la meta' mancante
L'editor dell'analisi economica offriva la parentela ("compreso dentro"),
quello del flusso energetico **no**: nome, icona e cestino, punto. Dichiararla
di la' e vederla applicata di qua funzionava dalla 0.38.0, ma non c'era modo di
dichiararla **qui**, ne' di verificare che fosse arrivata. Era esattamente
l'asimmetria che ha prodotto tre segnalazioni di fila.

### Novita'
- Ogni carico monitorato ha il suo menu **COMPRESO DENTRO**, con gli altri
  carichi della card e "— è un carico a sé —". Un carico non compare fra i
  propri possibili padri.
- **Il doppio controllo e' visivo, non manuale.** La parentela dichiarata
  nell'analisi economica — che ragiona in kWh — risulta **gia' scelta** qui,
  sui watt, con l'etichetta *già dichiarato nell'analisi economica*. Non si
  riscrive: si vede.
- Un padre che **non e' fra i carichi di questa card** viene detto invece che
  taciuto: *dipende da X, che non è fra questi carichi: viene disegnato lo
  stesso come padre*.
- Se la scelta locale e la mappa condivisa **divergono**, la card lo segnala e
  offre **ALLINEA**, che toglie la scelta locale e lascia parlare la mappa —
  senza dover indovinare quale delle due fosse quella giusta.
- Scegliere qui scrive nella **mappa condivisa di tutta la dashboard**: una
  sola verita', due posti da cui dichiararla e da cui controllarla. Gli anelli
  vengono spezzati subito, non in quattro punti che devono ricordarsene.

### Verifiche
994 asserzioni frontend, 341 misurate in Chromium — fra cui: scegliere un padre
dal menu trasforma davvero il nodo in un figlio nel disegno (un nodo di primo
livello in meno, uno di secondo in piu'), la scelta finisce sia sulla card sia
nella mappa condivisa, e tornando a "carico a sé" il disegno torna piatto.

## [0.41.0] - 2026-08-26

Due difetti che avevo introdotto io: la pagina che salta in cima e i cerchi
ancora fuori misura.

### La pagina saltava in alto a ogni tocco
- **Causa: il layout a incastro di 0.39.0.** Con le card a incastro la griglia
  ha righe da 6 px, e finche' ogni card non ha dichiarato quante gliene servono
  la pagina e' alta **una frazione del vero**. Il ripristino dello scorrimento
  girava *prima* di quella dichiarazione: il valore veniva tosato dall'altezza
  minuscola e la vista schizzava in cima. Misurato: scorrimento a 1240 px, dopo
  un ridisegno **0**.
- La sequenza e' ora: contenuto → aggancio dei comandi → **calcolo delle
  altezze** → ripristino dello scorrimento, tutto prima che il browser
  disegni. Misurato: 1240 → 1240.
- Prova permanente: scorri a meta' pagina, tocca una riga del pannello delle
  linee, e devi essere ancora li' — con la riga toccata **sotto il dito**.
  Rimessa la vecchia sequenza, la prova fallisce: non e' un'asserzione che
  passa da sola.

### I cerchi del flusso energetico erano ancora fuori misura
- 0.40.0 aveva allungato il riquadro per fare posto, ma i dischi erano rimasti
  **in pixel fissi**: su un telefono il riquadro e' 330 px e un disco da 104 px
  ne occupava un terzo, contro un quinto sul desktop.
- Il disco e' ora dichiarato nelle **stesse unita' del disegno** (`cqw`, cioe'
  una frazione del riquadro), esattamente come le coordinate: un nodo tiene la
  sua proporzione a ogni larghezza. Sul telefono il disco di CASA passa da 104
  a 57 px.
- Il pavimento e' **18 px**, non 22: il raggio codifica la potenza, e un
  pavimento che morde presto appiattisce la differenza fra una lampada da 25 W
  e un'asciugatrice da 160 W. Misurato: a 22 px i due venivano 11 e 13 pixel e
  l'ordine di grandezza smetteva di leggersi — che e' proprio quello che le
  dimensioni servono a dire.
- Con i dischi in proporzione l'allungamento verticale serve molto meno: da
  1.38 a **1.15**, quel tanto che basta a fare posto alle scritte, che restano
  a misura fissa per restare leggibili.
- Prova permanente: il disco deve pesare **la stessa frazione del riquadro** su
  telefono e desktop (scarto sotto il 3%).

### Verifiche
978 asserzioni frontend, 331 misurate in Chromium, piu' schema, notifiche e
chiave di cache.

## [0.40.0] - 2026-08-26

Il flusso energetico si legge anche sul telefono.

### Il difetto
I nodi del diagramma sono HTML posizionato in **percentuale** sopra un disegno
che si rimpicciolisce, ma i dischi e le scritte erano in **pixel fissi**. Su un
telefono il riquadro passa da 560 a 330 px mentre le pastiglie restano grandi
uguali: si accavallano. Con la gerarchia dei carichi finalmente rispettata
(0.38.0) il caso peggiore e' diventato il piu' comune — un padre e un figlio
incolonnati — e l'etichetta del padre finiva **sotto** il disco del figlio.
Misurato: 60x7 px di sovrapposizione su uno schermo da 390 px, zero su desktop.

La prova che c'era gia' non lo vedeva perche' misurava **solo foglie
affiancate**: nessuno aveva mai misurato una colonna padre-figlio su schermo
stretto.

### La correzione
- Su una card stretta (sotto i 460 px) il disegno viene **allungato in
  verticale**: le stesse percentuali cadono piu' distanti, i tracciati si
  stirano — il viewBox e' gia' `preserveAspectRatio="none"` — e le scritte
  restano leggibili invece di rimpicciolirsi con il resto. Rimpicciolire tutto
  in proporzione sarebbe stato piu' semplice e avrebbe reso le etichette da
  10 px alte 6.
- Il rapporto d'aspetto del riquadro passa **dallo stile inline al CSS**
  (`--vb`): un attributo `style` inline batte ogni foglio di stile, quindi la
  container query non avrebbe mai potuto vincerlo. E' la stessa trappola gia'
  pagata sui muri della mappa 3D.
- **Larghezza dei nomi e distanza fra i nodi erano la stessa variabile.** Sono
  due cose diverse: un figlio unico non ha nessuno accanto, quindi il suo nome
  puo' usare tutto lo spazio del padre. Con le due confuse "Friggitrice ad
  aria" usciva "Friggitrice a..." con mezzo diagramma vuoto intorno.

### Verifiche
Nuova prova permanente: telefono da 390 px, gerarchia aperta, **ogni** disco,
etichetta e valore confrontati a coppie con tutti gli altri. Zero
sovrapposizioni, nessun nome tagliato, figlio sotto il padre e staccato,
diagramma dentro lo schermo — e su schermo largo il disegno non viene allungato
inutilmente. 977 asserzioni frontend, 325 misurate in Chromium.

## [0.39.0] - 2026-08-26

Uno zero che non era uno zero, le card che si incastrano, le linee che scegli tu.

### L'asciugatrice a 0 W mentre gira
- **Il difetto sta nella presa, non nella dashboard** — ma la dashboard lo
  raccontava come se fosse vero. Misurato sullo storico: la presa Tuya riporta
  `0.0 W` per una quarantina di secondi mentre la macchina lavora (11:18:59
  zero, 11:19:41 di nuovo 172 W; 11:56:09 zero, 11:56:51 di nuovo 165 W) e il
  contatore di energia sale dritto per tutto il tempo. Il dato e' **fresco**,
  quindi nessun controllo di obsolescenza lo prende: e' semplicemente falso.
- Uno zero viene ora **coperto con l'ultima lettura reale**, per al massimo due
  minuti, e **solo finche' l'interruttore che alimenta quel carico e' acceso**.
  Quel limite e' cio' che rende il ponte onesto: senza, una macchina che ha
  davvero finito continuerebbe a mostrare i suoi watt. Con, spegnere e'
  istantaneo e un buco di trasmissione e' invisibile — che e' il verso giusto.
- Un valore coperto si vede che lo e': contorno punteggiato e la spiegazione
  passando sopra.

### Le card si incastrano
- La griglia ha ora una traccia di riga fine (6 px) e ogni card **dichiara
  quante righe occupa**, misurata dal vero: una card bassa non prenota piu'
  l'altezza della piu' alta che le sta accanto, e quella dopo scivola su.
  Le altezze vengono **rimisurate** quando cambiano da sole — un fotogramma di
  telecamera che arriva, un grafico che riceve lo storico, una sezione che si
  apre.
- **Quello che non fa, e perche'**: un vano largo tre colonne resta vuoto se
  tutte le card rimaste ne occupano quattro. E' geometria, non un errore: per
  chiudere anche quelli servono larghezze che si incastrino, ed e' una scelta
  che spetta a te. Misurato: area riempita in aumento, sezione piu' corta,
  nessun buco peggiorato.
- Si puo' spegnere (`theme.pack`) se in qualche pagina l'ordine visivo non
  convince.

### Tenendo premuto un grafico scegli le linee
- **Pressione prolungata** (500 ms, la stessa soglia delle card di Home
  Assistant) sull'area del grafico: si apre l'elenco delle linee, una per una,
  con occhio acceso/spento. Col mouse funziona anche il tasto destro.
- La scelta e' **salvata sulla card**, non nella sessione: fatta sul tablet in
  cucina, e' ancora li' domani e sull'altro tablet.
- **Tutte** / **Nessuna** per ripartire, e l'ultima linea accesa non si puo'
  spegnere: un paio di assi vuoto col pannello chiuso sarebbe un vicolo cieco.
- Schema v13: `hidden_series` per card.

### Verifiche
- 977 asserzioni frontend, 317 misurate in Chromium (fra cui il riempimento
  reale della griglia e le sovrapposizioni fra card), piu' schema, notifiche e
  chiave di cache.

## [0.38.0] - 2026-08-26

Quello che sta funzionando adesso, e da quanto davvero.

### Accesi e spenti
- La card **Stanza** si raggruppa per stato: **Accesi** in cima, **Spenti**
  sotto. Spegni un carico e si sposta da solo nella sezione di sotto, dove lo
  riaccendi. Il vecchio raggruppamento per tipo resta disponibile per card, dal
  selettore "Come raggruppare".
- Fuori dalle due sezioni restano **videocamere, centrale di allarme e letture
  numeriche**: una telecamera non e' "spenta" perche' e' in idle e un contatto
  porta non e' un carico da accendere.
- La classificazione non e' `state == "on"`. Una tapparella conta la
  **posizione** (su parecchie integrazioni una tapparella ferma a zero riporta
  ancora `open`); clima, ventole e umidificatori contano `off`/`unavailable`;
  un media player conta anche `standby`.
- Nell'editor: **Mostra tutto / Nascondi tutto** e il conteggio dei visibili.
  Un `input_boolean` nascosto non compare ne' fra gli accesi ne' fra gli spenti.
- Ogni riga di stanza ha ora **44 px di altezza minima**. Le righe senza il
  pulsante-icona tondo (clima, sicurezza) collassavano a 33 px: il bersaglio
  piu' piccolo della pagina, e quello che si tocca di piu'.

### La gerarchia dei carichi vale in tutte le card
- **Il difetto**: la gerarchia era una mappa `entity -> entity`. Ma una presa
  intelligente pubblica **due** entita' per un solo carico — `..._potenza` in W
  e `..._energia` in kWh. Dichiarando "compreso dentro" nell'analisi economica,
  che ragiona in kWh, il flusso energetico — che disegna watt — non vedeva
  niente: stessa presa, stesso cavo, due entity_id. La friggitrice finiva
  **accanto** alla presa che la alimenta invece che sotto.
- Ora la parentela e' un fatto dell'**apparecchio**: dichiarata su una
  qualunque delle sue entita', vale per tutte, e il padre viene ritradotto nel
  sensore della stessa grandezza che la card sta disegnando — watt con watt,
  kWh con kWh, e a parita' di grandezza si preferisce la stessa unita' (W e kW
  sono la stessa cosa fisica ma non lo stesso numero).
- **Schema v12**: la semina della mappa condivisa dalle card riparte una volta.
  La v10 girava solo per le dashboard piu' vecchie di 10, quindi un padre
  dichiarato *dopo* quella migrazione non arrivava mai alla mappa condivisa.

### "Acceso da" dice la verita'
- **Il difetto**: `last_changed` non misura da quando il carico e' acceso.
  Home Assistant ripristina le entita' all'avvio e le timbra con l'ora del
  **ripristino**. Verificato sull'impianto: due ore dopo un riavvio, cinque
  interruttori portavano lo stesso `last_changed` al millisecondo, e la card
  diceva "da 2 h 44" per tutti — che e' da quanto e' acceso Home Assistant.
- Il recorder invece non riscrive la storia all'avvio. Una sola chiamata per
  tutta la card recupera l'orario vero: l'asciugatrice era partita alle 08:25,
  la cantinetta due giorni prima.
- Un **blip di rete** — la cantinetta persa per tre decimi di secondo — non
  azzera il conteggio; uno spegnimento vero si'. Senza recorder si ripiega su
  `last_changed` invece di lasciare un buco. La storia viene richiesta una
  volta per entita' e ripetuta solo a un cambio di stato reale: una card che si
  ridisegna a ogni aggiornamento non deve diventare una raffica di query.

### Verifiche
- 953 asserzioni frontend, 297 misurate in Chromium, 15 sulla chiave di cache,
  piu' schema e notifiche.
- Corretta una trappola nota nel codice nuovo: le righe di storia compresse
  portano l'epoch in **secondi come numero**, e `Date.parse(numero)` lo
  converte in stringa e lo legge come anno — la stessa famiglia di
  `Date.parse(0)` che aveva gia' prodotto "9731 giorni".

## [0.37.0] - 2026-08-26

I dispositivi che Home Assistant non ha messo in nessuna stanza.

### Il problema
Un interruttore acceso e funzionante — il piano a induzione — non compariva
sotto Cucina. Non era un errore della dashboard: quel dispositivo, in Home
Assistant, **non era assegnato ad alcuna area**, né sull'entità né
sull'apparecchio. Nessuna stanza poteva trovarlo, e nulla lo diceva: spariva
e basta. Sull'impianto reale non era un caso isolato — 269 entità su 382 non
hanno un'area, e fra queste ci sono il CDZ, il contatto della porta e i
comandi della videocamera.

### Novità
- **L'editor della stanza avverte da solo**: "N dispositivi di Home Assistant
  non hanno un'area: nessuna stanza può trovarli."
- Sotto la ricerca dispositivi compare il blocco **SENZA AREA IN HOME
  ASSISTANT**, ordinato mettendo davanti quello che si comanda (luci,
  interruttori, clima, tapparelle) e lasciando in fondo i sensori. Automazioni,
  persone, telefoni e diagnostica restano fuori: non sono roba da stanza.
- Ogni riga si può **aggiungere a mano alla stanza** oppure **archiviare
  nell'area con un tocco**. Il pulsante lo dice chiaramente: cambia Home
  Assistant, non solo la dashboard, e sposta **tutto l'apparecchio** — la presa
  con i suoi quattro sensori — non la singola entità.
- Lo stesso blocco compare nell'editor della **card Stanza**, dove l'unica cosa
  sensata da fare è assegnare l'area, perché quella card segue l'area.
- Un rifiuto di Home Assistant viene **detto**, non ingoiato in silenzio.

### Copia vecchia nel browser
- L'indirizzo del modulo ora porta **un'impronta del file**, non la sola
  versione: `?v=0.37.0-<hash>`. Stesso file, stesso indirizzo e nessun
  download inutile; un solo byte diverso, indirizzo nuovo e ricarica
  garantita. Prima, una modifica senza cambio di versione lasciava il browser
  sul modulo già importato — e un modulo ES già importato non viene mai
  riletto, qualunque cosa dicano le intestazioni di cache.
- L'avviso **"SVUOTA LA CACHE"** ora funziona anche quando il pannello è
  montato come card di Lovelace, dove `panel.config` non esiste: la versione
  dichiarata dall'integrazione viene letta da `hass.panels`.

### Verifiche
- `config/device_registry/update` (device_id + area_id) e
  `config/entity_registry/update` (entity_id + area_id) verificati sul
  sorgente di core 2026.8.3, non a memoria.
- 904 asserzioni frontend, 285 misurate in Chromium, 15 sulla chiave di cache
  del pannello, più schema e notifiche. Tutte verdi.

## [0.36.0] - 2026-08-26

Ogni giorno del meteo ha le sue ore.

### Il problema
Aprendo un giorno futuro si vedevano i totali — massima, minima, pioggia,
vento — ma non l'andamento ora per ora. Il dato però c'era già: i fornitori
mandano 48-72 ore di previsione oraria, e il pannello ne teneva **solo le
prime dodici**, quelle della striscia in cima. Domani e dopodomani venivano
scaricati e buttati via.

### Novità
- **Aprendo un giorno compaiono le sue ore**, con la stessa curva e lo stesso
  indicatore al puntatore della striscia principale: temperatura, condizione,
  probabilità di pioggia e vento su ogni ora di quel giorno.
- Le ore sono selezionate per **giorno di calendario locale**, non per una
  finestra di ore: «domani» vuol dire da mezzanotte a mezzanotte dov'è la casa,
  non «fra 24 e 48 ore».
- Oltre l'orizzonte della previsione oraria il pannello **lo dice**, invece di
  mostrare uno spazio vuoto senza spiegazione.

### Verifiche
874 asserzioni frontend e **271 misurate** in Chromium (5 nuove), con un
fornitore simulato che manda 60 ore: che oggi abbia le sue ore, che domani
abbia le **sue** e non quelle di oggi, che domani parta da mezzanotte e non
dall'ora attuale, e che il quinto giorno — fuori dall'orizzonte — dichiari il
motivo invece di restare vuoto.


## [0.35.0] - 2026-08-26

Mappa 3D: materiali e luce vera. Primo dei due passaggi.

### La scelta, e perché ho cambiato idea
Avevo raccomandato la strada dell'**immagine renderizzata**. Ripensandoci non
la consiglio più, per due motivi che pesano più della fedeltà:

1. **Un'immagine renderizzata è morta.** Non può mostrare una luce accesa, non
   si abbassa col dimmer, non diventa notte. Tutto quello che la casa sta
   *facendo* deve tornarci sopra come targhetta — cioè esattamente la confusione
   di simboli da cui questa dashboard cerca di allontanarsi.
2. **Costa un modello 3D per ogni cliente.** Mezza giornata a installazione non
   scala su un prodotto da rivendere.

Quindi lo sforzo va dove il fotorealismo non ha risposta: **luce, stato,
movimento**. Una scena generata può fare l'unica cosa che il render non può —
essere illuminata dalle luci vere.

### Novità
- **Materiali del pavimento**, disegnati in CSS: parquet, piastrelle, cemento,
  tappeto, pietra, prato, acqua. Nessun file immagine da ospitare, niente che
  possa sparire. Dedotti dal nome della stanza (bagno → piastrelle, camera →
  parquet, garage → cemento) e sovrascrivibili nell'editor della stanza.
- **Luce reale.** Pavimento e muri prendono colore e intensità dalle lampadine
  che sono davvero accese: un dimmer al 30% illumina la stanza al 30%, una
  lampadina calda la fa calda, una stanza con tutto spento resta al buio. Una
  luce accesa su quattro non illumina come quattro. Il colore viene dalla
  temperatura dichiarata dalla lampadina.
- **Pozza di luce** sul pavimento, gettata dall'alto e sfumata verso i bordi.
- **Ombre di contatto** sotto ogni stanza e **occlusione ambientale** alla base
  dei muri. Senza, i volumi galleggiavano e la scena si leggeva come forme
  colorate piatte — che è buona parte di quello che la faceva sembrare uno
  schema invece di una casa.

### Due difetti trovati mentre la costruivo
- **`filter` su un elemento `preserve-3d` appiattisce tutta la scena 3D.**
  Avevo messo il bagliore della stanza illuminata sulla stanza stessa: i muri
  collassavano e ogni segnaposto finiva altrove. L'hanno preso i test del
  tocco, che hanno smesso di trovare quello che cliccavano. Il bagliore ora sta
  sul pavimento, che è una foglia e non ha niente di 3D sotto.
- **Uno stile inline batte qualunque regola del foglio di stile.**
  L'ombreggiatura geometrica di ogni muro era scritta come `filter` inline, per
  cui la luce della stanza non poteva raggiungerli qualunque cosa dicesse il
  CSS. Ora quella è una proprietà personalizzata e il foglio di stile
  moltiplica le due cose.

### Verifiche
874 asserzioni frontend (12 nuove) e **266 misurate** in Chromium (9 nuove).
Le nuove misurano i **pixel**, non le classi: che il pavimento acceso sia
davvero più chiaro di quello spento, che lo siano anche i muri, che la pozza di
luce compaia solo da accesa, che abbassando il dimmer la luminosità calcolata
scenda davvero, e che due stanze accanto con luci diverse si distinguano nella
stessa immagine.

### Il prossimo passaggio
Arredi come volumi semplici (letto, divano, tavolo, piano cucina) posizionabili
per stanza. È quello che fa leggere una stanza *come* una stanza, e senza è il
limite di quanto lontano può arrivare questa mappa.


## [0.34.0] - 2026-08-26

Due difetti veri sul flusso energetico, e il test che avrebbe dovuto
prenderli era scritto male.

### Il figlio non stava sotto il padre
La 0.33 ha unificato la gerarchia, ma restava un caso scoperto: **se il carico
padre non è fra i dispositivi della card Flusso, il figlio non ha niente sotto
cui stare** e ricadeva silenziosamente in cima, in parallelo agli altri. È il
tuo caso: la presa che misura la friggitrice era dichiarata nell'analisi
economica ma non nell'elenco del diagramma.

Ora, se il padre dichiarato ha una lettura di potenza vera, **viene tirato
dentro il diagramma da solo**. Hai detto che quel carico dipende da quello:
disegnare il figlio senza il padre è disegnare mezzo fatto, e non ha senso
chiederti di elencare la stessa presa due volte.

### Non si leggeva l'ordine di grandezza
Due tentativi sbagliati, e il secondo è quello interessante.

Il primo era il codice originale: curva giusta (radice quadrata, perché un
cerchio si legge da quanto inchiostro ha) ma **intervallo troppo stretto** —
25 W accanto a 196 W venivano 26 px contro 38 px, su un telefono
indistinguibili.

Il secondo l'ho scritto io ieri: **puro proporzionale all'area**.
Teoricamente corretto e peggiore nella pratica — appena un nodo domina, per
esempio un «Non misurato» da 1,5 kW accanto a carichi da decine di watt, tutti
gli altri cerchi finiscono sul minimo di leggibilità e tornano identici fra
loro. Lo stesso difetto, raggiunto dalla parte opposta.

Quindi: curva a radice quadrata su un **intervallo largo**. L'ordinamento è
sempre leggibile e la proporzione è onesta dentro la banda — il compromesso
che fa ogni grafico a cerchi scalati quando i dati veri hanno un elemento
dominante.

### Il test era scritto male
L'asserzione che doveva impedire le targhette accavallate **raggruppava i nodi
per fascia orizzontale** prima di confrontarli. Ma i nodi hanno raggi diversi,
quindi le loro targhette stanno ad altezze diverse: due targhette che si
toccavano finivano in gruppi diversi e non venivano mai confrontate. Ora il
confronto è fra **tutte le coppie**, con vera intersezione di rettangoli.

Aggiunta anche una scena che riproduce il caso reale — quattro carichi, quei
nomi, quelle potenze, 390 px — e verifica che le targhette non si tocchino,
che un carico sei volte più grande abbia un cerchio visibilmente più grande, e
che **più watt non disegnino mai un cerchio più piccolo**.

### Verifiche
862 asserzioni frontend, suite schema, suite notifiche e **257 misurate** in
Chromium (6 nuove), due esecuzioni consecutive identiche.


## [0.33.0] - 2026-08-24

La gerarchia dei carichi si dichiara una volta sola. Schema alla versione 10.

### Il bug
Avevi impostato la gerarchia e il flusso energetico continuava a disegnare i
due carichi **in parallelo**. Non era il disegno a sbagliare: la stessa cosa —
«questo carico è dentro quello» — era **memorizzata in due posti diversi**, la
lista dispositivi della card Analisi economica e quella della card Flusso.
Dichiararla in una lasciava l'altra completamente all'oscuro. Ed è anche il
motivo per cui non ricordavi dove si facesse: si fa in due posti.

Ma «la friggitrice è dentro la presa» è un fatto sull'**impianto**, non su una
card. Ora è così: una mappa unica a livello di dashboard, letta da entrambe le
card. La versione 10 dello schema la **semina da sola** con quello che avevi
già dichiarato, quindi la tua configurazione non va rifatta — comincia
semplicemente a valere anche nel flusso. Il `parent` scritto su una singola
card continua a funzionare e ha la precedenza quando c'è.

I cicli vengono spezzati alla lettura togliendo **un solo anello**, non
svuotando la mappa: il resto di quello che hai dichiarato resta valido.

### Correzione di disegno
**I due carichi si accavallavano**, con le targhette fuse in
«Friggitrice ad ariaCantinetta». Due cause: con due o tre carichi la
spaziatura restava quella pensata per otto, e il limite di larghezza delle
targhette era **un valore fisso in pixel** — 104 px sono un terzo di un
telefono e un sesto di un monitor, mentre il diagramma è posizionato in
**percentuale**. Ora pochi carichi si prendono lo spazio che hanno, e ogni
targhetta è limitata alla larghezza dello **spazio che le compete**, calcolata
dalla spaziatura stessa.

### Verifiche
862 asserzioni frontend, suite schema (con la migrazione v10, la mappa ripulita
dai dati sporchi e l'invariante «nessun ciclo»), suite notifiche e **251
misurate** in Chromium (8 nuove). Fra le nuove: che un figlio dichiarato
**solo** nella mappa condivisa venga disegnato come figlio e su una riga più
bassa del padre, e che su uno schermo da 390 px nessuna targhetta si accavalli
con la vicina.

Sistemata anche l'instabilità di tre asserzioni mie, che leggevano un'opacità
**mentre la dissolvenza era in corso**: la suite ora passa quattro volte di
fila senza variazioni.


## [0.32.0] - 2026-08-24

Seguire una linea col cursore, un meteo che dice di dove parla, e
l'ordine dentro le card deciso da te.

### Grafici: la linea sotto il puntatore si stacca dalle altre
Quattro linee che si incrociano su un piano solo diventano illeggibili nel
momento esatto in cui ti serve un numero da una di esse.

Passando il cursore: la linea più vicina **si ingrossa e mantiene il suo
bagliore**, le altre **si attenuano** — attenuate, non nascoste, così gli
incroci che stavi leggendo restano lì. Una **guida verticale** segna l'istante,
un **punto** si posa su ogni curva, e sotto compare la **lettura** con l'ora e
il valore di ogni grandezza, quella seguita in evidenza e nel suo colore. Si
accende anche la voce di legenda corrispondente.

I valori sono **campioni veri del recorder**, il più vicino nel tempo: non
interpolo fra due misure, perché un numero inventato fra due letture su un
grafico diagnostico è peggio che nessun numero. Il puntatore **non ridisegna la
card**: un ridisegno per movimento ricostruirebbe l'SVG sotto il dito.

### Meteo
- **Il pannello dice di che posto parla.** Prima aveva per titolo il nome
  dell'entità — «Forecast Casa Oscar» — che è un'etichetta scritta da qualcuno,
  non un luogo. Ora sotto il titolo ci sono **nome della posizione e coordinate
  reali** dalla configurazione di Home Assistant, più il **fornitore** ricavato
  dall'attribuzione (met.no): quando due entità meteo non vanno d'accordo,
  sapere quale servizio parla cambia tutto.
- **La curva delle prossime ore ha una scala**: gradi sull'asse verticale, ore
  su quello orizzontale, massimo e minimo etichettati. Prima era una sparkline
  senza asse, stirata per riempire il riquadro — la pendenza dipendeva dalla
  finestra, non dal tempo.
- **Lo stesso indicatore al puntatore**, con ora, temperatura, condizione,
  probabilità di pioggia e vento. Il punto si aggancia a un'ora reale della
  previsione: fra due ore il fornitore non dice niente, e inventarlo sarebbe
  finzione.
- **I giorni si aprono.** Ogni riga mostra **solo i campi che quel giorno ha
  davvero**: chi manda vento e nuvolosità li vede, chi manda solo massima e
  minima vede due voci — non sei etichette mezze vuote.

### L'ordine dentro la card
Nella card Controllo temperatura decidi tu cosa viene prima, **la riga di
sospensione compresa**: sopra le unità, in mezzo, o in fondo. Frecce su/giù
nell'editor, più la scelta fra una e due colonne. Quello che aggiungi domani
entra in coda senza che tu rifaccia l'ordine.

### Correzioni
- **«0 °C impostata» e «ora null°».** Un'unità spenta riporta `temperature:
  null`, e `Number(null)` è **0** — finito, quindi passava ogni controllo. La
  card annunciava con sicurezza un valore che non esiste. È la **terza volta**
  che questa trappola produce un bug visibile in questo progetto (prima l'asse
  di un grafico collassato a zero, poi una soglia), quindi ora c'è **una sola
  funzione** `num()` usata ovunque uno stato diventi un numero, e non ci sarà
  una quarta.
- **I risultati della ricerca nell'editor erano deformati**: usavo un nome di
  classe inventato, senza nessuna regola CSS, quindi le righe perdevano
  l'impaginazione e nome ed entity_id finivano appiccicati su una riga
  centrata. Ora usano le righe standard del resto dell'editor.

### Verifiche
862 asserzioni frontend, suite schema, suite notifiche e **245 misurate** in
Chromium (35 nuove). Fra le nuove, col puntatore vero: che una sola linea vada
a fuoco ed sia **misurabilmente** più spessa e più opaca, che i punti cadano
tutti sullo stesso istante, che spostandosi in verticale cambi la linea
seguita, e che uscendo torni tutto com'era. Sul meteo: che un numero più caldo
stia **più in alto** (scala verificata per posizione, non perché le etichette
sembrano ordinate) e che un giorno con meno dati mostri **meno voci, non
trattini**.


## [0.32.0] - 2026-08-24

Seguire una linea col cursore, e un meteo che dice di dove parla.

### Grafici: la linea sotto il puntatore si stacca dalle altre
Quattro linee che si incrociano su un piano solo diventano illeggibili nel
momento esatto in cui ti serve un numero da una di esse.

Ora passando il cursore sul grafico: la linea più vicina **si ingrossa e
mantiene il suo bagliore**, le altre **si attenuano** — attenuate, non
nascoste, così gli incroci che stavi leggendo restano lì. Una **guida
verticale** segna l'istante sotto il puntatore, un **punto** si posa su ogni
curva a quell'istante, e sotto compare la **lettura**: l'ora e il valore di
ogni grandezza, con quella seguita in evidenza e nel suo colore. Anche la voce
di legenda corrispondente si accende.

I valori mostrati sono **campioni veri del recorder**, il più vicino nel tempo
al punto in cui sei: non interpolo fra due misure, perché un numero inventato
fra due letture su un grafico diagnostico è peggio che nessun numero.

Il puntatore **non ridisegna la card**: tocca direttamente i nodi già a
schermo. Un ridisegno per ogni movimento del mouse ricostruirebbe l'SVG sotto
il dito, e il grafico combatterebbe col cursore invece di seguirlo.

### Meteo: luogo e scala
- **Il pannello dice di che posto parla.** Prima aveva per titolo il nome
  dell'entità — «Forecast Casa Oscar» — che è un'etichetta scritta da qualcuno,
  non un luogo. Ora sotto il titolo compaiono il **nome della posizione e le
  coordinate reali** prese dalla configurazione di Home Assistant, più il
  **fornitore** ricavato dall'attribuzione dell'entità (met.no, nel tuo caso):
  quando due entità meteo non vanno d'accordo, sapere quale servizio parla
  cambia tutto.
- **La curva delle prossime ore ha una scala.** Prima era una sparkline senza
  asse: una linea che sale dice che qualcosa cresce, e nient'altro. Su un
  pannello meteo la domanda è «quanto farà caldo alle quattro», e una curva
  senza numeri non può rispondere. Ora ci sono i gradi sull'asse verticale, le
  ore su quello orizzontale, e **massimo e minimo etichettati** sul punto.
  Niente più `preserveAspectRatio="none"`: la vecchia curva si stirava per
  riempire il riquadro, quindi la pendenza che mostrava dipendeva dalla
  finestra, non dal tempo.

### Verifiche
855 asserzioni frontend, suite schema, suite notifiche e **230 misurate** in
Chromium (20 nuove). Le nuove usano il puntatore vero: che una sola linea vada
a fuoco, che sia **misurabilmente** più spessa e più opaca delle altre, che i
punti di riferimento cadano tutti sullo stesso istante, che spostandosi in
verticale cambi la linea seguita, e che uscendo dal grafico torni tutto com'era.
Sul meteo: che un numero più caldo stia **più in alto** — la scala verificata
per posizione, non perché le etichette sembrano ordinate.


## [0.31.0] - 2026-08-24

Due difetti dell'ultima versione, entrambi della stessa famiglia: il
sistema che decide al posto tuo. Schema alla versione 9.

### Le stanze non si erano divise
La 0.30 creava una sezione per stanza, ma **solo su una dashboard nuova**. Il
controllo che evita i doppioni vedeva le aree già presenti dentro la vecchia
fisarmonica «Stanze» e si rifiutava di fare qualsiasi cosa: chi aveva già la
dashboard — cioè esattamente chi ne aveva bisogno — premeva il pulsante,
leggeva «ogni stanza ha già la sua sezione» e non vedeva cambiare niente.
Mancava la migrazione.

**Ora la divisione avviene sul documento**, alla versione 9: una sezione fatta
*solo* di card stanza, e più d'una, viene sostituita **sul posto** dalle
sezioni che conteneva — stessa pagina, stessa posizione, stesso ordine, ogni
stanza col suo nome e la sua icona, solo la prima aperta. Una sezione che
mescola una stanza con altre card è un layout costruito apposta e non viene
toccata. Il pulsante STANZE fa la stessa conversione subito, senza aspettare
un riavvio.

### «Scale - Override Manuale» non c'entra niente col clima
La card Clima si popolava da sola cercando parole come «manuale» nei nomi. Così
un override delle luci delle scale è finito fra i comandi del condizionatore,
perché nel nome c'è scritto «Manuale».

**Un dominio è un fatto, un nome è un'opinione.** Dedurre da un dominio va
bene: `climate.*` *è* un termostato. Dedurre da un nome no: il nome è una
stringa che qualcuno ha scritto, non una dichiarazione di cosa fa l'entità.

Quindi ora **nessun interruttore entra nella card da solo**. I candidati
trovati dal nome compaiono nell'editor come **suggerimenti**, con scritto che
sono indizi, e si accettano con un clic. La riga di sospensione non compare
finché non ne scegli almeno uno. Vale lo stesso principio già applicato ai
comandi che non comandano: il sistema può proporre, non decidere.

### Verifiche
855 asserzioni frontend, suite schema (con la migrazione v9: sostituzione sul
posto, ordine conservato, sezioni miste non toccate, id unici, idempotenza) e
**210 misurate** in Chromium — fra cui che «Scale - Override Manuale» resti nei
suggerimenti e non entri mai nella card, e che accettarne uno costi un clic.


## [0.30.0] - 2026-08-24

Una sezione per stanza, e il controllo del clima dove serve.

### Stanze: una sezione ciascuna
Prima era **una sola** sezione «Stanze»: aprirla rovesciava tutta la casa sullo
schermo in un colpo, chiuderla nascondeva la casa intera. Non c'era modo di
dire «fammi vedere il bagno e basta», che è l'unica cosa che si chiede a un
elenco di stanze.

Ora **ogni stanza è una sezione propria**: intestazione, colore, apertura,
posizione nell'ordine e voce nel menù «sposta in una pagina» — quindi una
stanza può anche diventare una pagina a sé. Solo la prima nasce aperta.

**Idempotente sull'area**: rilancia STANZE dopo aver creato una stanza nuova in
Home Assistant e vengono aggiunte *solo* quelle nuove. Una stanza che avevi
spostato in un'altra pagina non ritorna come doppione. È il caso «stanze
future», e deve funzionare senza rifare quello che avevi già sistemato.

### Controllo temperatura (pulsante CLIMA)
Sulla domanda «panoramica o sezione temperature»: **sezione temperature**, e
non è un compromesso. L'analisi e l'azione vanno insieme — leggere «balcone
28,9°» e poi dover navigare altrove per accendere il condizionatore è la
frattura che rende scomoda una dashboard. E siccome dalla 0.23 le sezioni si
trascinano ovunque e si spostano in pagine proprie, metterla qui non ti
vincola: se domani la vuoi in panoramica è **un trascinamento, non un
rifacimento**. Una sola card, collocabile ovunque — così la scelta non è più
una forchetta fra due implementazioni.

- **Una card per unità**: acceso/spento, temperatura impostata con −/+ e
  cursore, modalità, e ventola / programma / flusso **solo su chi li dichiara**.
  Verificato sulle tue due: il CDZ Storm espone 953 (temperatura, ventola,
  programma, flusso, on/off, flusso orizzontale), il termostato 385
  (temperatura, on/off) — e infatti il secondo non mostra una ventola che non
  ha.
- **I limiti li detta l'unità.** Uno dei tuoi va 8-30 °C a passi di 1, l'altro
  1-7 a passi di 0,5: qualunque intervallo scritto nel codice ne avrebbe reso
  uno incontrollabile.
- **La sospensione delle automazioni sta in cima, con una frase intera.**
  `input_boolean.automazioni_cdz_disattivate` non è un dispositivo, è uno
  **stato dell'impianto**: con quello attivo il resto della casa smette di
  decidere per te. Merita la prima riga della card e la scritta «le automazioni
  NON intervengono», non di confondersi con una presa in fondo a una stanza.
  Viene riconosciuto da solo, o lo scegli tu.
- **Trascinare il cursore non manda una chiamata per pixel.** Solo il valore su
  cui si ferma il dito parte, dopo 320 ms: molti condizionatori ignorano una
  raffica di comandi, la temperatura torna indietro e si legge come «la
  dashboard non funziona».

### Correzioni
- **Ogni automazione veniva scambiata per un interruttore di sospensione**: il
  riconoscimento cercava «automation» dentro l'entity_id, e il nome del dominio
  contiene già quella parola. Ora si guarda solo il nome vero.
- **La riga di sospensione non compariva mai su una card appena creata**:
  `Array.isArray([])` è vero, quindi la lista vuota non ricadeva sul
  rilevamento automatico.
- **La temperatura non si poteva regolare a unità spenta.** Era una
  restrizione inventata dalla card: `supported_features` dichiara
  TARGET_TEMPERATURE e non dice «solo mentre gira». Impostare il valore e poi
  accendere è il modo normale di usare un termostato.

### Verifiche
851 asserzioni frontend (37 nuove), suite schema, suite notifiche e **205
misurate** in Chromium (22 nuove) — fra cui che rilanciare STANZE aggiunga solo
le stanze nuove, che i limiti del cursore vengano dall'unità e non dal codice,
e che premere «+» produca **una sola** chiamata a Home Assistant.


## [0.29.0] - 2026-08-23

Niente comandi che non comandano, e il confronto smette di essere
una card sulle temperature.

### Correzioni
- **«Videocamera salotto» in Altro non faceva niente, giustamente.** Era una
  riga-interruttore, e quella videocamera non si può accendere: dichiara
  `supported_features 2` — solo streaming, senza `ON_OFF` — quindi
  `camera.turn_on` andava a vuoto. **Verificato sull'istanza reale.** Stessa
  cosa per la centrale di allarme, che di servizio `toggle` non ne ha proprio
  uno. Ora una riga che non può comandare **non mostra il comando**: apre i
  dettagli e basta, e l'icona-pulsante sparisce del tutto. Un'icona che sembra
  un comando e non fa niente è peggio di nessuna icona — insegna che la
  dashboard è rotta.
- **«INATTIVO» non era una diagnosi.** Una videocamera che funziona riporta lo
  stato `idle`, tradotto alla lettera in «inattivo»: verissimo e completamente
  fuorviante, perché la telecamera sta benissimo, semplicemente non sta
  trasmettendo a nessuno in quell'istante. Ora dice **in linea**, *sta
  registrando*, *in diretta* o *non raggiungibile*.
- **Anche sulla mappa 3D** un tocco su una videocamera non prova più a
  spegnerla.

### Novità
- **Le videocamere hanno il loro blocco nella card Stanza, con l'anteprima.**
  Una videocamera in una stanza è un'immagine, non una riga di testo: si vede
  l'ultimo fotogramma e al tocco si apre la diretta.
- **La centrale ha il suo blocco «Sicurezza»** nella card Stanza, con lo stato
  a colori e il tocco che apre i comandi veri.
- **Il confronto andamenti non è più una card sulle temperature.** Il
  riempimento in blocco era un pulsante fisso «aggiungi tutte le temperature
  delle stanze»: ora è **una scelta del tipo di grandezza** — tensioni,
  correnti, potenze, temperature, qualunque `device_class` esista davvero
  nell'impianto, **coi nomi in italiano** e il conteggio delle entità. La
  scorciatoia delle stanze resta, perché per le temperature ambiente dà nomi
  migliori («Bagno» invece di «Sensore T&U Bagno Temperatura»).
- Il testo a vuoto della card non fa più esempi domestici: spiega le tre
  strade. Un installatore che confronta le temperature di quattro motori o le
  tensioni di tre fasi non deve combattere con una card che presuppone «casa».

### Verifiche
814 asserzioni frontend (44 nuove), suite schema, suite notifiche e **183
misurate** in Chromium (6 nuove). Fra le nuove: che una videocamera senza
`ON_OFF` non produca nessun comando mentre una che lo dichiara resti
comandabile, che «Altro» non contenga più videocamere e centrali, e che
scegliendo un tipo diverso dalla temperatura il grafico si riempia davvero di
quel tipo.


## [0.28.0] - 2026-08-23

L'allarme non è un interruttore.

### Il problema
La centrale era disegnata come un cursore on/off. È una bugia con tre teste:

1. **«Acceso» non è uno stato che un allarme ha.** Le centrali si armano in una
   **modalità** — in casa, fuori casa, notte, vacanza, parziale — e un cursore
   non può esprimere quale, quindi ne sceglieva una per te senza dirtelo.
2. **Metà degli stati sono transizioni.** `arming` e `pending` sono i tempi di
   uscita e di ingresso, `triggered` vuol dire che la sirena sta suonando. Un
   interruttore a due posizioni non ha dove metterli: mostrava una delle sue
   due posizioni — quella sbagliata — mentre la casa contava alla rovescia.
3. **Molte centrali chiedono un codice.** Un cursore non ha modo di chiederlo,
   quindi la chiamata falliva e basta.

### Novità
- **Card «Centrale allarme».** Stato a parole e a colori, e **un pulsante per
  ogni modalità che la centrale dichiara davvero di avere**, letta da
  `supported_features`. La tua espone in casa, fuori casa e sirena: vedi
  esattamente quelle tre, né una in meno né una in più.
- **Da armato, «Disarma» diventa il primo pulsante.** Con la sirena che suona,
  il tasto che ti serve dev'essere sotto il pollice, non quarto in fila.
- La **modalità in corso è mostrata e disattivata**, non riproposta: la card
  risponde insieme a «cosa sta facendo» e «cosa posso fare».
- **Conto alla rovescia e allarme in corso si vedono.** Sono le uniche due cose
  della card che si muovono, così non si possono scambiare per uno stato fermo.
- **Tastierino** quando la centrale dichiara `code_format` o
  `code_arm_required`. Il codice vive solo in memoria, **non entra mai nel
  documento salvato** e viene cancellato subito dopo l'uso: una dashboard è
  sincronizzata, esportata e leggibile da chiunque la apra.
- **Antipanico solo tenendo premuto 1,2 s**, e solo se la centrale dichiara
  `TRIGGER`. Un comando che sveglia i vicini non deve essere raggiungibile da
  un pollice che sfiora lo schermo in tasca.

### Correzioni
- **Una card `control`, `status` o `entità` puntata su una centrale disegna ora
  la centrale**, non il cursore. La tua card esistente si corregge da sola,
  senza toccare niente: un tipo di card che non può dire la verità sulla
  propria entità non deve disegnare.
- La composizione automatica crea una card allarme vera invece di una targhetta
  di stato che diceva «disarmato» senza darti modo di farci niente.

### Verifiche
Bit delle funzionalità **verificati sull'istanza reale** leggendo i selettori
che i servizi di `alarm_control_panel` dichiarano: `alarm_arm_home` vuole 1,
`alarm_arm_away` 2, `alarm_arm_night` 4, `alarm_trigger` 8,
`alarm_arm_custom_bypass` 16, `alarm_arm_vacation` 32.

784 asserzioni frontend (25 nuove), suite schema, suite notifiche e **177
misurate** in Chromium (18 nuove) — fra cui, con eventi pointer reali, che **un
tocco sull'antipanico non faccia scattare la sirena** e che tenendolo premuto
invece sì.


## [0.27.0] - 2026-08-23

Guardare un dispositivo senza azionarlo. Schema alla versione 8.

### Il problema
Toccare «luci scale» sulla mappa 3D le spegneva, e non c'era modo di chiedere
i dettagli. L'azione al tocco era stata sistemata in 0.21.0 sulle **righe delle
card**, ma la mappa ha un proprio percorso di tocco che non passava di lì ed è
rimasto **cablato**: qualunque cosa fosse comandabile, si comandava.

Peggio: la card **Illuminazione** mostrava nell'editor il menù «Azione al
tocco» e le sue righe **ignoravano completamente il valore**. Una tendina che
non faceva niente — il modo migliore per convincere l'utente che la funzione
sia rotta ovunque.

### Correzioni
- **La mappa 3D ha la sua azione al tocco** (nell'editor della mappa):
  *Accendi/spegni* oppure *Apri i dettagli*. Vale per le icone dei
  dispositivi e per l'elenco sotto la mappa.
- **Tenendo premuto (500 ms) si fa sempre l'altra cosa.** Pressione prolungata
  e non un secondo pulsante perché un'icona sulla mappa è un cerchio da 38 px
  sopra un muro: un controllo gemello lì accanto renderebbe la mappa
  illeggibile proprio agli ingrandimenti in cui serve di più. Trascinare non
  conta come pressione prolungata — quello è spostare la mappa — e il clic che
  segue il rilascio **non** esegue anche l'azione breve.
- **Nell'elenco sotto la mappa il pulsante opposto è visibile**, perché lì lo
  spazio c'è e un comando che si vede batte uno che bisogna sapere. Ce l'hanno
  solo le cose comandabili: un termometro non ha niente da accendere, e
  fingere il contrario sarebbe un pulsante che non funziona.
- **La card Illuminazione onora davvero l'azione al tocco.**

### Migrazione (schema v8)
Le card `lights` esistenti hanno `row_action` salvato da build che quel campo
non leggevano, quindi quel valore **non porta nessuna intenzione**. Farlo
funzionare così com'era avrebbe **invertito** ogni card di illuminazione già
installata: il nome avrebbe cominciato a spegnere le luci, cioè esattamente il
difetto segnalato. La migrazione lo riporta una volta sola a *Apri i dettagli*,
che riproduce ciò che era sullo schermo. Le card `room`, dove l'impostazione
funzionava, non vengono toccate.

### Verifiche
- 759 asserzioni frontend (14 nuove), suite schema (con la migrazione v8 e il
  fatto che una scelta fatta a v8 vada rispettata), suite notifiche, e **159
  misurate** in Chromium (12 nuove).
- Le nuove misurate usano **eventi pointer reali**: pressione breve, pressione
  tenuta 700 ms, e pressione trascinata. Verificano ai punti di uscita — la
  chiamata di servizio e l'evento `hass-more-info` — cosa riceverebbe davvero
  Home Assistant, non cosa sembra a schermo.


## [0.26.0] - 2026-08-23

Gli avvisi si possono leggere, segnare e buttare via. Uno alla volta.

### Il problema
Il registro avvisi era in sola lettura: un elenco che cresceva e basta.
L'unica operazione esistente era «svuota tutto», che è il contrario di quello
che serve — buttare via anche l'allarme che non hai ancora visto non è fare
ordine, è perdere informazione.

### Novità
- **Stato letto / da leggere per ogni avviso.** Un tocco sul testo lo segna
  letto, un altro lo rimette fra i da leggere. I letti restano in elenco ma
  sbiadiscono; i da leggere portano un pallino e una barra di colore sul
  bordo. Nasconderli sarebbe peggio: «dov'è finito» diventerebbe la domanda
  successiva.
- **Eliminazione singola.** Ogni avviso ha la sua croce.
- **Filtro TUTTE / DA LEGGERE**, con i conteggi in chiaro sulle linguette.
- **SEGNA TUTTI LETTI** e **PULISCI I LETTI**. La pulizia è la scopa che
  svuota la casella *senza toccare niente di non letto*: è la differenza fra
  fare ordine e perdere un allarme.
- **Le notifiche persistenti di Home Assistant hanno il loro tasto elimina**,
  che chiama `persistent_notification.dismiss`. Non hanno stato di lettura e
  la card non finge che ce l'abbiano: non sono sue, sono di Home Assistant.

### Analisi
- **Lo stato «letto» sta sul server, accanto all'avviso, non nel browser.**
  Un avviso letto sul telefono deve risultare letto anche sul tablet a muro, e
  deve sopravvivere a un browser che pulisce i propri dati. È l'unica versione
  in cui due schermi non possono essere in disaccordo.
- Quando qualcosa cambia, il registro dice a tutti i pannelli aperti di
  rileggere invece di mandare una differenza. Il payload sono pochi kilobyte;
  un pannello che mostra un avviso già eliminato è un bug peggiore di un
  giro di rete in più.
- Il tocco aggiorna **subito** la copia locale e poi conferma col server: la
  riga risponde sotto il dito, e se la chiamata fallisce il rilettura
  successiva rimette le cose a posto entro un giro.
- Gli avvisi salvati **prima** di questa versione partono come **letti**.
  Metterli fra i da leggere accoglierebbe l'utente con un contatore di 120
  avvisi «nuovi» del mese scorso, che è peggio che inutile.

### Verifiche
- Nuova suite `tests/notifications.test.py` (22 asserzioni) sul registro:
  che una pulizia non porti mai via un non letto, che un'operazione a vuoto
  non svegli i pannelli, che un socket morto si tolga di mezzo da solo invece
  di fermare il registro, e che le voci senza il campo `read` vengano lette
  come già lette.
- 745 asserzioni frontend (22 nuove) e **147 misurate** in Chromium (13
  nuove), fra cui: che la croce elimini quella riga e nessun'altra, che il
  letto sia *misurabilmente* più spento del da leggere, che la riga degli
  aggiornamenti non finga di essere eliminabile, e che su schermo da 390 px
  le croci restino dentro lo schermo e sopra i 20 px di lato.


## [0.25.0] - 2026-08-23

Il grafico di confronto non è più un elenco fisso: segue le stanze da solo.
Schema alla versione 7.

### Il problema
La card «Confronto andamenti» faceva già la cosa giusta — più linee sullo
stesso piano cartesiano, una scala verticale sola — ma teneva un **elenco di
entità scelto una volta**. Un elenco scelto una volta è una fotografia, e una
fotografia non può rispondere a «oggi quattro stanze, domani dieci»: il
sensore che installi il mese prossimo non entra nel grafico, e niente sullo
schermo spiega perché. Andava aggiunto a mano, una tendina alla volta.

### Novità
- **Tre modalità per decidere da dove arrivano le linee** (segmentato in cima
  all'editor del grafico):
  - **Segui le stanze** — le stesse stanze della card Temperature, sonda
    esterna compresa. Aggiungi un sensore a un'area e la linea compare da
    sola, senza riaprire l'editor. È la modalità con cui nasce il grafico
    creato dal pulsante TEMPERATURE.
  - **Tutte di un tipo** — segue un `device_class` (temperatura, umidità,
    potenza…) su tutta l'istanza, ordinate per stanza. Il menù elenca solo le
    classi che esistono davvero qui, con quante entità le portano.
  - **Scelte da me** — il comportamento di prima, congelato apposta.
- **Il tetto passa da 8 a 12 linee**, con il numero massimo impostabile.
  Oltre le otto un piano cartesiano smette di confrontare e comincia a
  nascondere: il limite resta, ma ora è una tua decisione dentro un tetto
  dichiarato. Aggiunti quattro colori distinti per le linee 9-12.
- **Passare a «scelte da me» materializza quello che c'è a schermo**, invece
  di svuotare il grafico nel momento in cui chiedi di comandarlo tu.
- Nella modalità manuale, **AGGIUNGI TUTTE LE TEMPERATURE DELLE STANZE**
  riempie l'elenco in un colpo solo.

### Correzioni
- **Il grafico «segui le stanze» restava vuoto dopo un semplice ricaricamento
  della pagina.** Le modalità automatiche dipendono dal registro aree, che
  viene letto pigramente: se nient'altro nella pagina lo aveva già chiesto,
  la ricerca non aveva niente su cui lavorare e la card mostrava per sempre
  «scegli le grandezze». Ora è la card stessa a richiederlo.
- **Seguendo un `device_class`, la temperatura esterna veniva tagliata via dal
  limite di linee.** Non avendo area finiva in fondo all'ordinamento, quindi
  era la prima a cadere fuori: si perdeva esattamente la linea per cui il
  confronto esiste. Ora le sonde esterne sono ordinate per prime.

### Verifiche
- 723 asserzioni frontend (21 nuove) e **134 misurate** in Chromium (8 nuove).
  Fra le nuove: che una stanza aggiunta *dopo* la creazione della card entri
  da sola nel grafico, che aggiungerla non ricolori le linee già presenti, e
  — misurando i rettangoli reali dei tracciati — che tutte le linee stiano
  dentro **lo stesso** riquadro di disegno e si sovrappongano in orizzontale,
  cioè che siano davvero sullo stesso piano cartesiano e non affiancate.


## [0.24.0] - 2026-08-23

La sezione Temperature c'era, ma sceglieva male e ti lasciava fuori
l'esterno. Corretta alla radice.

### Correzioni
- **Veniva scelto il sensore sbagliato dentro una stanza.** La ricerca
  prendeva il *primo* sensore di temperatura dell'area, e l'ordine del
  registro entità non dice niente sulla rilevanza. Nel tuo bagno c'è una
  Shelly Plug che pubblica la temperatura del proprio chip: bastava che fosse
  elencata per prima e la card avrebbe annunciato il bagno a 46 °C. Ora i
  candidati vengono **ordinati per merito**: chi misura anche l'umidità dallo
  stesso dispositivo è un sensore ambientale e vince; chi si chiama
  presa/relè/CPU/batteria/inverter sta misurando se stesso e viene retrocesso.
  A parità, vince il nome più corto — il sensore principale di un dispositivo
  è quasi sempre quello senza qualificatori aggiunti.
- **La temperatura esterna era strutturalmente esclusa.** In Home Assistant
  non esiste un'area «fuori», quindi `sensor.temperatura_esterna` non
  appartiene a nessuna e la ricerca per aree non poteva vederla: proprio il
  confronto dentro/fuori che avevi chiesto era l'unico impossibile. Ora i
  sensori che parlano dell'esterno entrano **in cima**, con l'icona del sole,
  perché l'esterno è il riferimento contro cui si leggono le stanze.
- **L'umidità viene abbinata per dispositivo, non per area.** Due sensori
  nella stessa stanza possono discordare; accoppiare temperatura e umidità
  dello stesso apparecchio evita che una card descriva due posti diversi.

### Novità
- **Elenco delle stanze modificabile a mano.** Prima l'editor mostrava cosa
  era stato rilevato e basta. Ora c'è **SCEGLI LE STANZE A MANO**: nome,
  icona, sensore di temperatura e sensore di umidità per ogni riga, con
  spostamento su/giù, aggiunta e rimozione. I menù propongono **tutti** i
  sensori, area o non area — è così che ci metti dentro l'esterno o un
  sensore che Home Assistant non ha classificato. Un pulsante riporta al
  rilevamento automatico.
- Prendere il comando **parte dall'elenco già rilevato**, non da una lista
  vuota: chi personalizza quasi sempre vuole correggere una riga su cinque,
  non riscriverle tutte.

### Verifiche
- 702 asserzioni frontend (16 nuove) e **126 misurate** in Chromium (7 nuove).
  Le nuove riproducono la disposizione reale dei sensori di casa tua — sonda
  esterna senza area, bagno con la Shelly Plug elencata per prima, camera con
  due sensori di temperatura — e verificano che il bagno legga il sensore a
  muro e non il chip della presa.


## [0.23.0] - 2026-08-23

L'ordine delle schede e delle sezioni lo decidi tu.

### Novità
- **Riordino delle schede in alto trascinandole.** In modifica ogni scheda
  della barra (Dashboard, Mappa 3D, Energia, …) diventa afferrabile: la
  trascini dove vuoi e un segno luminoso mostra in anticipo dove finirà. Il
  rilascio è un **inserimento**, non uno scambio: portare Energia in prima
  posizione fa scalare le altre di uno invece di scambiarla con quella che
  c'era. Restando sulla pagina che stavi guardando, non su quella che ha
  ereditato il suo numero.
- **Frecce ◀ ▶ sulla scheda attiva.** Gli eventi di trascinamento HTML5 non
  esistono su uno schermo touch, quindi da telefono e da tablet il riordino
  passa dalle frecce. Sono solo sulla scheda attiva: una coppia su ogni scheda
  trasformerebbe la barra in una fila di frecce senza più i titoli.
- **Riordino delle sezioni dentro una pagina, sempre trascinando.** La maniglia
  è l'intestazione della sezione, come la barra del titolo di una finestra —
  non l'intera sezione, altrimenti si porterebbe dietro anche le card, che
  hanno già un loro riordino.
- Il pannello **PAGINE** dice ora esplicitamente che quell'ordine è l'ordine
  della barra in alto e che la prima pagina è quella che si apre all'avvio.

### Correzioni
- **La suite visiva stava testando una copia vecchia del pannello.** Il file
  che il banco di prova carica in Chromium era una copia aggiornata a mano, e
  una copia aggiornata a mano prima o poi è vecchia: la suite dichiarava verde
  del codice che non era quello in spedizione. È il falso negativo più caro che
  esista, ed è la stessa classe di problema della risorsa Lovelace non
  versionata di 0.21.0. Ora la copia viene rifatta dal sorgente **a ogni
  esecuzione**, e la build usata viene stampata in testa al log.

### Verifiche
- 686 asserzioni frontend, suite schema completa, **119 asserzioni misurate**
  in Chromium (18 nuove sull'ordine): fra queste un vero trascinamento HTML5
  con `DataTransfer`, la verifica che il rilascio sulla metà sinistra inserisca
  davanti e non scambi, che il segno di inserimento sia visibile, che le frecce
  siano larghe almeno 24 px e che fuori modifica non resti nessuna maniglia.


## [0.22.0] - 2026-08-23

Tre richieste, tutte e tre chiuse: entità libere nell'illuminazione, la mappa
che finalmente si lascia cliccare, e la sezione Temperature.

### Novità
- **Illuminazione: puoi scegliere qualsiasi entità, non solo `light.*`.**
  Molte luci sono pilotate da una presa o da un relè, quindi restringere la
  sezione al dominio `light` significava lasciare fuori metà dell'impianto.
  L'editor ora ha un selettore **Tutte le luci / Scelte da me**: nella seconda
  modalità cerchi fra `light`, `switch`, `input_boolean` e `fan` e componi
  l'elenco a mano. Le righe si adattano da sole a cosa hanno davanti — una
  presa non mostra il cursore di intensità né il pannello colore, perché non
  li ha — e il comando viene instradato sul dominio reale dell'entità
  (`switch.turn_on` per una presa, `light.turn_on` per una luce). Anche
  l'accensione/spegnimento di gruppo raggruppa per dominio: prima un unico
  `light.turn_on` ignorava in silenzio tutte le prese dell'elenco.

- **Sezione Temperature (pulsante TEMPERATURE nella barra di modifica).**
  Una scheda per stanza con temperatura in evidenza, umidità, giudizio
  (fresco / caldo / secco / umido / ok) e un indicatore su una **scala comune
  12–34 °C**: la scala fissa è il punto, perché è ciò che rende due stanze
  confrontabili a colpo d'occhio invece di darti sei grafici scollegati. Le
  stanze vengono trovate da sole dalle aree di Home Assistant che hanno un
  sensore di temperatura, l'umidità viene appaiata dalla stessa area. Le
  soglie di comfort sono modificabili. Il pulsante crea in un colpo solo la
  card comfort **e** il grafico storico delle stesse stanze, già compilato.

### Correzioni
- **La mappa 3D non si lasciava cliccare («non mi fa cliccare su balcone, su
  cucina, è molto bagato»).** Due cause reali, non una: l'area sensibile di
  ogni stanza era il suo **rettangolo di ingombro**, non la sua sagoma, quindi
  una stanza a L rubava i clic ai vicini; e le targhette fluttuanti, più larghe
  della stanza, coprivano tutto quello che avevano sotto. Ora la sagoma reale
  (`clip-path`) è l'area sensibile, i clic che la mancano **cadono sulla stanza
  sotto** invece di essere assorbiti, la stanza selezionata passa sopra le
  altre, e in modifica le targhette spariscono del tutto.
- **«Devo poterle modificare tutte».** Con stanze sovrapposte o su piani
  diversi, alcune restavano irraggiungibili col solo clic sulla mappa. Ora
  **l'elenco completo delle stanze** è presente sia nell'editor della pagina
  sia in quello della stanza: qualunque stanza è a un clic, sovrapposizioni
  comprese.

### Verifiche
- 666 asserzioni frontend, suite schema completa, **101 asserzioni misurate**
  in Chromium headless (geometria reale, non screenshot): fra queste, che ogni
  stanza sovrapposta possieda almeno un pixel cliccabile, che l'indicatore
  Temperature segua il valore sulla scala condivisa, e che nessuna scheda
  debordi a 300 px di larghezza.


## [0.21.0] - 2026-08-23

Sette segnalazioni, tre delle quali erano bug veri.

### Correzioni
- **«Apri i dettagli» non funzionava: l'interruttore cambiava stato.** Le righe
  dei dispositivi nelle card Stanza, Attivi ora e Luci erano cablate su
  "accendi/spegni" e ignoravano l'azione scelta. Non si poteva ispezionare un
  relè senza azionarlo, che su una caldaia o un cancello non è un problema
  estetico. Ora **la riga fa quello che dici tu**, e **l'icona fa sempre
  l'altra cosa**: comando e dettagli restano entrambi a un tocco, senza menù.
- **«Quando clicco mi si abbassa la visuale».** Il ripristino dello scorrimento
  conosceva quattro contenitori scritti a mano: scorrere a metà l'elenco dei
  dispositivi di una stanza e toccare un occhio riportava l'elenco in cima. Ora
  ogni contenitore scorrevole dichiara una chiave e viene ripristinato — e un
  elenco nuovo non può più essere dimenticato, perché finché non dichiara la
  chiave non scorre in proprio.
- **Il cursore della mappa 3D.** La scena porta un'animazione di 0,28 s sulla
  trasformazione, che serve ai pulsanti della barra ma durante il
  trascinamento faceva inseguire la casa con un terzo di secondo di ritardo e
  continuare a girare dopo che il dito si era fermato — «gira come vuole lui».
  Ora l'animazione viene sospesa per la durata del gesto, e la sensibilità è
  passata da 0,4 a 0,55 gradi per pixel: un giro completo in circa la larghezza
  di un telefono.

### Mappa 3D: ruotare le stanze
- **Maniglia di rotazione** su ogni stanza selezionata: la giri con il mouse
  per metterla nella posizione vera. Scatta di 5°, con **Shift** gira libera.
  C'è anche un cursore nel pannello.
- L'angolo è calcolato **nello spazio della pianta**, non sullo schermo: la
  scena è ruotata e inclinata, e un angolo schermo farebbe girare la stanza a
  velocità diverse a seconda di dove ti trovi, e al contrario oltre i 90° di
  camera.
- Ridimensionamento, vertici e posizioni dei dispositivi ora tengono conto
  della rotazione: senza, trascinare il lato di una stanza girata la spostava
  in diagonale.

### Sezioni: dove vivono
- Ogni sezione può stare **dentro una pagina** insieme alle altre oppure
  diventare una **scheda tutta sua** accanto a Dashboard e Mappa 3D. Si sceglie
  dal pannello della sezione, sezione per sezione. Energia accanto alla mappa,
  se è lì che la vuoi.
- La nuova scheda nasce accanto a quella di origine, non in fondo, e prende
  nome e icona della sezione. La pagina lasciata vuota viene rimossa — ma mai
  l'ultima, e mai la Mappa 3D.

### Attivi ora: scegli tu cosa vedere
- Selezione **entità per entità**, non più solo per dominio. Un interruttore
  che in realtà è una funzione di una videocamera — luce infrarossa,
  registrazione, modalità silenziosa — è tecnicamente acceso ma non è un
  dispositivo di casa.
- L'elenco è **raggruppato per dispositivo** con un interruttore unico per
  tutto il dispositivo, perché quel rumore arriva sempre un dispositivo alla
  volta. Elenca anche ciò che ora è spento, così lo escludi prima che si
  accenda.
- È una lista di **esclusione**: un dispositivo installato domani compare da
  solo.

### Illuminazione
- Pulsante **LUCI** nella barra in alto: crea la sezione Illuminazione già
  puntata su tutte le luci di casa. Se esiste già, la seleziona invece di
  farne una seconda.

### «Le modifiche non le vedo applicate»
Causa trovata, ed era reale. Una versione precedente registrava il pannello
anche come **risorsa Lovelace con un URL senza versione**, come rete di
sicurezza contro "Custom element doesn't exist". Si è rivelata l'opposto: un
URL senza versione il browser lo tiene in cache a tempo indeterminato, viene
caricato per primo e **si prende il nome dell'elemento** — un custom element si
può definire una volta sola, quindi ogni copia successiva, compreso il modulo
versionato del pannello, veniva ignorata in silenzio. Risultato: la dashboard
continuava a eseguire codice vecchio mentre l'integrazione dichiarava la
versione nuova.

- La risorsa senza versione viene **rimossa**, e l'integrazione ora la ripulisce
  da sola a ogni avvio se qualcuno la ricrea.
- Il pannello **scrive sempre la build in esecuzione** accanto al sottotitolo
  (`v0.21.0`): la risposta più veloce a "l'aggiornamento è arrivato?" è poterlo
  leggere sullo schermo.
- Se la build in esecuzione e la versione dell'integrazione non coincidono, il
  pannello lo **dice in testa**, con entrambi i numeri, invece di lasciare il
  problema a indovinare.

### Verifica
- 623 asserzioni sulla logica del pannello, schema completo, **91 asserzioni
  geometriche misurate** in Chromium headless — fra cui che ruotare cambia
  davvero la proiezione a schermo, che il pannello non torna in cima a ogni
  clic e che durante il trascinamento la scena non ha inerzia.

## [0.20.0] - 2026-08-23

L'auto elettrica entra nel sistema: dichiarata una volta, presente ovunque.

### Auto elettriche
Un'auto in carica è il carico più grande che una casa avrà mai — 7,4 kW su una
wallbox domestica, 22 kW in trifase — e a differenza di ogni altro carico è un
**accumulo**: la domanda non è "quanto sta assorbendo" ma "quanto è piena e
quando è pronta". Le due cose stanno su entità diverse, spesso di integrazioni
diverse. Per questo l'auto si dichiara **una volta sola**, a livello di
dashboard, e viene letta da tutti e tre i posti in cui serve.

- **Card Auto elettrica** — anello di carica con la percentuale, stato
  (in carica / collegata / scollegata), potenza alla colonnina, autonomia,
  obiettivo di carica come tacca sulla barra, e **tempo stimato alla carica**.
  Comandi di avvio/arresto e limite di corrente quando l'impianto li espone.
- **Mappa 3D** — l'auto compare **dentro il garage**, con il suo simbolo, la
  barra dello stato di carica e il fulmine quando sta caricando. Si vede dalla
  pianta, senza entrare nella stanza, e si trascina dove è parcheggiata
  davvero. Un garage è una stanza come le altre: quello che lo rende un garage
  è che dentro c'è un'auto (e un lato basculante, dalla 0.18.0).
- **Flusso energetico** — l'auto entra da sola nel sotto-albero dei consumi,
  con il suo colore e la sua percentuale sotto il nodo. Se il sensore della
  wallbox era già stato aggiunto a mano come carico generico, **non viene
  contato due volte**.
- **Rilevamento automatico**: Cyborg cerca in Home Assistant la batteria
  dell'auto e la potenza della colonnina e propone la configurazione.
- Funziona anche con **una sola wallbox e nessuna integrazione dell'auto**:
  mostra semplicemente meno, senza inventare niente.
- Più auto: fino a otto.

### Onestà dei numeri
- Il tempo alla carica viene calcolato solo quando **ogni termine è reale**:
  capacità dichiarata, potenza che scorre, obiettivo sopra il livello attuale.
  Senza capacità il tempo non compare invece di essere stimato a caso. Oltre le
  24 ore non viene mostrato, perché un conto alla rovescia di 50 ore non è
  un'informazione. La stima non tiene conto del rallentamento oltre l'80% ed è
  dichiarata come stima.
- Una capacità fuori scala viene **scartata**, non limitata: un numero sbagliato
  produrrebbe una stima sicura di sé e sbagliata.
- Una batteria di cui l'impianto non pubblica il livello resta "—", non zero:
  chi deve decidere se partire ha bisogno che le due cose restino distinte.
- Senza un sensore dedicato, "in carica" si deduce dalla potenza sopra i 400 W:
  sotto quella soglia una colonnina è a riposo, non sta caricando.

### Correzione
- **Il dashboard di fabbrica non era idempotente.** Le pagine predefinite non
  passavano dal loro stesso normalizzatore: al primo salvataggio veniva scritto
  un documento diverso da quello che il caricamento successivo produceva dallo
  stesso input, e chi confronta le revisioni vedeva una modifica fantasma.

### Verifica
- 586 asserzioni sulla logica del pannello, schema completo, **85 asserzioni
  geometriche misurate** in Chromium headless — fra cui che l'anello è
  davvero al 62% del cerchio, che la barra nel garage è proporzionale allo
  stato di carica, e che l'auto non finisce dietro il muro del garage.

## [0.19.0] - 2026-08-23

La sezione Stanze, e il confronto andamenti che ora disegna davvero le linee.

### Nuova sezione: Stanze
- **Una card per ogni stanza**, con un solo pulsante: *STANZE* nella barra in
  alto crea una card per ogni area di Home Assistant.
- Ogni card raccoglie i dispositivi della sua area e li mette in ordine di
  significato: le **letture** (temperatura, umidità, potenza) in testa, poi
  **Luci** — con intensità, colore e temperatura per chi le supporta — **Clima**
  con temperatura attuale e impostata, **Aperture** con apri/ferma/chiudi e la
  posizione, **Prese e interruttori**, e infine *Altro*.
- La card **segue l'area**: un dispositivo spostato in quella stanza in Home
  Assistant compare qui da solo, senza toccare la dashboard. Le entità di
  diagnostica e configurazione restano fuori, e ogni dispositivo ha un occhio
  per nasconderlo.
- Spegnimento di tutte le luci della stanza dall'intestazione del gruppo.

### Correzioni
- **Il confronto andamenti non disegnava nessuna linea.** Con la scala
  verticale in automatico il limite era `null`, e `Number(null)` è `0` — un
  numero finito. Il grafico si tarava quindi fra -0,6 e +0,6 e tutte le linee
  finivano fuori dal riquadro. Ora "automatico" è distinto da "zero".
- La legenda del grafico troncava i nomi a poche lettere.
- `max_readings: 0` sulla card stanza tornava a 4: `||` tratta lo zero come
  "non impostato", e zero letture in testa è una scelta legittima.

### Verifica
- 544 asserzioni sulla logica del pannello, schema completo, **71 asserzioni
  geometriche misurate** in Chromium headless.

## [0.18.0] - 2026-08-23

Lati della stanza, soglie che decidi tu, confronto degli andamenti.

### Mappa 3D — i lati della stanza
- Ogni lato di una stanza può essere quello che è davvero: **muro, porta
  finestra, finestra, porta, basculante, ringhiera, scala, o aperto**. Un
  balcone non ha quattro muri: ha un muro con una porta finestra e una
  ringhiera sugli altri tre lati, e ora la mappa lo dice.
- Ogni tipo ha la sua altezza e la sua trasparenza: la ringhiera è alta poco
  più di metà ed è traforata, le vetrate si vedono attraverso, un lato aperto
  non disegna niente.
- Si sceglie lato per lato dal pannello della stanza, che indica anche
  l'orientamento (nord/est/sud/ovest) e la lunghezza di ciascun lato.

### Monitoraggio — le soglie le imposti tu
- Ogni gruppo (tensioni, correnti, temperature, frequenza, fattore di potenza,
  batterie) ha **quattro soglie modificabili**: avviso sotto/sopra, allarme
  sotto/sopra.
- I valori predefiniti restano le norme — EN 50160 per tensione e frequenza,
  0,90 per il fattore di potenza — e l'intestazione del gruppo dichiara sempre
  **quali numeri sta usando** e se sono di norma o personalizzati. Lasciando un
  campo vuoto si torna alla norma.
- Un armadio server che sta a 78 °C non è un guasto e un inverter che declassa
  sopra i 60 °C lo è: la stessa soglia per tutti era sbagliata in entrambi i
  casi.
- Il fattore di potenza viene valutato in modulo: -0,95 vale come +0,95, il
  segno dice solo se il carico è induttivo o capacitivo.
- Una soglia illeggibile nel file salvato torna alla norma invece di
  **sparire**: un documento corrotto non deve disarmare un controllo.

### Nuova card: confronto andamenti
- Fino a **otto grandezze sullo stesso grafico**, con una sola scala verticale:
  è quella che rende leggibile "il bagno è più freddo del soggiorno". La
  temperatura esterna contro quelle di soggiorno, bagno e soppalco, per dire.
- Periodo 6 ore / 24 ore / 3 giorni / 7 giorni, colore per linea, scala
  verticale automatica o fissata a mano.
- La legenda mostra il valore attuale e il minimo/massimo del periodo per ogni
  linea.

### Verifica
- 525 asserzioni sulla logica del pannello, schema completo, **59 asserzioni
  geometriche misurate** in Chromium headless.

## [0.17.0] - 2026-08-23

Correzioni ai difetti segnalati, telefono incluso, più le notifiche Telegram
negli avvisi e il dettaglio per dispositivo nell'analisi economica.

### Correzioni
- **Il gauge del contatore disegnava l'arco al contrario oltre il 50%.** La
  bandiera SVG *large-arc* veniva alzata appena il valore superava metà scala,
  e il browser prendeva la strada lunga attorno al cerchio: 266° invece di 94°.
  Da qui i due "blob" staccati al posto dell'arco. Sotto il 50% era corretto,
  ed è per questo che era sfuggito.
- **La mappa 3D non si adattava al telefono.** Lo zoom è un numero di pixel per
  unità di pianta: quello giusto su un pannello da 1500px fa uscire la casa da
  uno schermo da 390px. Ora la vista si adatta da sola alla larghezza reale, e
  c'è un pulsante *adatta allo schermo*.
- **Sul telefono non si poteva interagire con le stanze.** Ogni elemento che ha
  un gesto proprio ora lo rivendica (`touch-action`), altrimenti se lo prendeva
  lo scroll della pagina. In più: **trascina lo sfondo per ruotare la casa,
  pizzica per zoomare**, maniglie e vertici ingranditi per il dito.
- **Entrando in una stanza sul telefono i dispositivi si accavallavano.** Le
  targhette con nome e valore sono uscite dalla scena e sono diventate un
  **elenco sotto la mappa**, leggibile a qualsiasi larghezza. Sul telefono la
  barra dei comandi sta su una riga sola.
- **L'anteprima delle videocamere si rompeva.** L'aggiornamento riutilizzava
  l'URL precedente, con dentro il token di accesso: quando Home Assistant lo
  ruota, ogni richiesta successiva torna 401 e il browser disegna la sua icona
  di immagine rotta — il "?" sopra il riquadro. Ora il token viene riletto a
  ogni aggiornamento. Tolto anche il `loading="lazy"` che ritardava la prima
  immagine fino allo scroll, e un errore di caricamento ora si spiega invece di
  mostrare un'icona rotta. Nuova opzione **anteprime sempre in diretta**.
- **Doppio conteggio dei carichi.** Nell'analisi economica ogni contatore può
  ora dichiarare di essere **compreso dentro** un altro: la friggitrice dentro
  la presa cucina, la presa cucina dentro il quadro FEM. Solo i carichi radice
  entrano nel totale, i figli restano elencati e annidati, e ogni padre mostra
  anche quanto consuma **al netto dei figli**. Prima 200 + 60 + 20 faceva 280
  kWh di kilowattora contati fino a tre volte.
- **Le stanze mostravano tutte le entità.** Le entità di diagnostica e
  configurazione (versioni firmware, RSSI, pulsanti di riavvio) non entrano più
  nella stanza — Home Assistant le marca già come tali. E ogni dispositivo ha
  un **occhio** nell'editor della stanza per nasconderlo o mostrarlo. La lista
  è di esclusione, così un dispositivo aggiunto domani all'area compare da solo.
- Un'entità senza `last_changed` risultava accesa "da 9731 giorni":
  `Date.parse(0)` non è 0, è l'anno 2000.

### Avvisi
- **Le notifiche Telegram arrivano negli avvisi della Panoramica.** Home
  Assistant non conserva nulla di ciò che invia; Cyborg ora registra ogni
  chiamata ai servizi `notify` e `telegram_bot` — quindi Telegram, app mobile,
  push web ed e-mail con un solo aggancio — e le ripropone nella card, anche
  dopo un riavvio. In tempo reale, via sottoscrizione.
- Si distingue ciò che è **partito** da casa da ciò che è **arrivato** al bot.
- Nota tecnica: l'evento `telegram_sent` esiste ma non contiene il testo del
  messaggio, solo chat_id e message_id. Per un elenco di avvisi è inutile, ed è
  il motivo per cui la sorgente è la chiamata al servizio.

### Attivi ora
- Riscritta. Un elenco piatto che mescola una lampada dimmerata, una tapparella
  aperta, una pompa di calore in deumidificazione e una cassa in pausa non dice
  niente. Ora è **raggruppata**: luci, prese, clima, aperture, media, pulizia,
  sirene. Ogni riga dice **dov'è** (la stanza) e **da quando**, e ogni gruppo ha
  il suo spegnimento in blocco.

### Analisi economica
- **Voce per ogni dispositivo**: quanti kWh e quanti euro nel periodo, con la
  quota sul consumo di casa e il **non misurato** dichiarato apertamente.
- Le sorgenti sono separate dai carichi e valorizzate alla tariffa di
  immissione.
- **Importazione dalla Dashboard Energia** dei dispositivi individuali, con un
  clic. Corretto anche il rilevamento della rete: esistono due formati di
  configurazione in Home Assistant e ne veniva letto uno solo.

### Nuove sezioni
- **Luci** — tutte le luci per stanza, con accensione, intensità, colore,
  temperatura in kelvin ed effetti. I comandi compaiono in base a ciò che ogni
  corpo illuminante dichiara di saper fare, quindi le RGB che installerai
  avranno i loro comandi senza toccare niente.
- **Irrigazione** — zone con avvio a tempo, umidità del terreno e sensore
  pioggia.
- **Orari** per luci e zone, eseguiti da Home Assistant e non dal browser: una
  valvola aperta "per dieci minuti" si chiude anche se chiudi la pagina,
  blocchi il telefono o riavvii il sistema a metà ciclo.

### Verifica
- 503 asserzioni sulla logica del pannello, schema completo, **53 asserzioni
  geometriche misurate** in Chromium headless — di cui 14 su uno schermo da
  390px, dove prima non veniva provato niente.

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
