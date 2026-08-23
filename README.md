# Cyborg Dashboard

Dashboard domotica per Home Assistant: pannello nativo, editor visuale, mappa 3D
della casa e flusso energetico in tempo reale.

Tutto il codice è originale e non dipende da alcuna libreria di terze parti:
niente card della community, niente motori grafici esterni, niente CDN. Il
rendering 3D usa le sole trasformazioni CSS, i grafici sono SVG scritti a mano.
L'unico requisito è Home Assistant.

## Funzionalità

**Dashboard a sezioni** — Le card sono raggruppate in sezioni di primo livello
con titolo, icona e colore propri, riordinabili e comprimibili. La composizione
automatica analizza il registro entità e costruisce Sicurezza, Energia, Clima,
Illuminazione, Presenza e Sistema già popolate.

**Tipi di card** — entità, sensore, controllo, stato, clima, gauge, grafico
storico 24h, flusso energetico, meteo, dispositivi attivi, notifiche, presenze.

**Flusso energetico** — Schema animato di Solare / Rete / Batteria / Casa con
particelle a velocità proporzionale alla potenza. Il nodo Casa si apre su un
sotto-albero dei carichi, con la quota di ciascuno e un nodo "Non misurato" che
mostra quanto consumo non è attribuito a nulla. Configurazione guidata passo
passo, con rilevamento dalla Dashboard Energia di Home Assistant e gerarchia dei
consumi (un carico può essere dichiarato compreso dentro un altro).

**Mappa 3D** — Edificio isometrico in CSS 3D: stanze come volumi estrusi su
più piani, targhette di stato sempre frontali alla camera, controllo al tocco.
Le stanze si generano dalle aree di Home Assistant o si scrivono a mano, si
dispongono trascinandole, si ridimensionano con otto maniglie e cambiano forma
(rettangolo, L, T, trapezio, o vertici liberi trascinabili). Ogni stanza vive
su un piano — da -3 a +8 — e la scena la solleva davvero, con un selettore per
isolare un piano alla volta. Toccando il nome di una stanza la vista ci entra
dentro: muri trasparenti, tutti i dispositivi al loro posto, trascinabili dove
stanno davvero. Configurazione guidata che chiede quali stanze esistono, a che
piano, e cosa c'è dentro ciascuna.

**Panoramica** — Meteo con previsioni, presenze, notifiche persistenti,
dispositivi accesi e flusso energetico in una schermata sola.

## Requisiti

Home Assistant 2026.8.0 o successivo.

## Installazione

Via HACS come repository personalizzato di categoria *Integration*, poi
**Impostazioni → Dispositivi e servizi → Aggiungi integrazione → Cyborg
Dashboard**. Il pannello compare nella barra laterale.

> Dopo un aggiornamento che tocca i file Python serve un **riavvio di Home
> Assistant**, non basta ricaricare l'integrazione: Python non re-importa un
> modulo già caricato in memoria.

## Architettura

    custom_components/cyborg_dashboard/
      __init__.py        setup e teardown della config entry
      panel.py           registrazione del pannello laterale
      websocket.py       comandi cyborg_dashboard/get e /save
      config_flow.py     flusso di configurazione
      core/
        schema.py        schema, valori predefiniti e migrazioni
        storage.py       persistenza con controllo di revisione
        layout.py        normalizzazione degli elementi
      www/
        cyborg-dashboard.js   pannello completo (web component)
    tests/
      schema.test.py     schema e migrazioni
      frontend.test.js   logica del pannello
      visual/            rendering reale in Chromium headless

## Principi di progetto

1. **Nessuna dipendenza esterna.** Una card della community che sparisce da
   GitHub non deve poter rompere un impianto già consegnato.
2. **Home Assistant resta la fonte di verità** per entità, dispositivi, aree e
   servizi. Cyborg non duplica il registro, lo legge.
3. **La configurazione resta modificabile** dopo la prima installazione, sempre,
   da interfaccia.
4. **Configurazione versionata con migrazioni**: una dashboard esistente non si
   rompe e non va rifatta quando lo schema evolve.
5. **Le dashboard Lovelace esistenti non vengono toccate.**

## Test

    python3 tests/schema.test.py       # schema e migrazioni
    node    tests/frontend.test.js     # logica del pannello
    (cd tests/visual && python3 -m http.server 8899 &) && node tests/visual/shoot.js

La suite visiva apre il pannello in Chromium headless con un Home Assistant
simulato, salva gli screenshot e **misura** la geometria della mappa 3D e le
altezze delle card, invece di limitarsi a produrre immagini da guardare.
