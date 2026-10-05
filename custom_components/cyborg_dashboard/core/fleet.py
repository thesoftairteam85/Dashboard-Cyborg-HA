"""Cyborg Impianti — il registro degli impianti presso i clienti.

Perche' uno store SEPARATO da quello della plancia
---------------------------------------------------
La dashboard di casa e l'elenco dei clienti hanno cicli di vita e rischi
diversi. La plancia si riscrive intera a ogni salvataggio e cambia dieci volte
al giorno mentre si sposta una card; l'elenco degli impianti cambia una volta
al mese e, se sparisce, sparisce un pezzo di lavoro. Tenerli nello stesso
documento vorrebbe dire che un errore di migrazione sullo schema della
dashboard puo' portarsi via i clienti, e viceversa.

Perche' il monitoraggio e' in PUSH e non in PULL
------------------------------------------------
Un sistema che *interroga* produce un guasto silenzioso: il sito non risponde,
si vede `unavailable`, e `unavailable` non distingue "linea giu'" da "HA
spento" da "sensore rotto". Un sistema che *riceve* produce un guasto
rumoroso: manca il battito, e quello **e'** l'allarme. Non va scritto, e' la
struttura che lo da'.

Qui dentro ci sono solo funzioni pure e il magazzino: nessuna chiamata di
rete. E' quello che le rende verificabili senza un Home Assistant acceso e
senza un broker.
"""
from __future__ import annotations

import datetime
import re
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

FLEET_VERSION = 1
FLEET_KEY = "cyborg_dashboard_fleet"

#: Un impianto per cliente, e i clienti non sono mille. Il tetto esiste perche'
#: un documento arrivato da fuori non possa trasformare il pannello in un
#: elenco infinito, non perche' ci si aspetti di avvicinarsi.
MAX_IMPIANTI = 200

#: I tre canali. `mqtt` e' la spina dorsale (il sito pubblica), `ha` e'
#: l'ispezione a richiesta su un Home Assistant remoto, `api` e' il caso del
#: solo fotovoltaico senza niente in sito.
TRASPORTI = ("mqtt", "ha", "api")

#: Le soglie della vitalita', in secondi.
#:
#: Tre stati e non due. "Giu'" dopo tre minuti sarebbe un allarme a ogni
#: singhiozzo della linea; "giu'" solo dopo un'ora vorrebbe dire accorgersi
#: di un guasto quando il cliente ha gia' telefonato. In mezzo c'e' uno stato
#: che dice "non lo so ancora", che e' l'informazione vera.
SOGLIA_OK = 180
SOGLIA_INCERTO = 1800

#: La finestra entro cui piu' cadute contano come UNA caduta sola: la nostra.
FINESTRA_LINEA_MIA = 300

ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,38}$")


def _testo(valore: Any, massimo: int) -> str:
    return str(valore or "").strip()[:massimo]


def _slug(valore: Any) -> str:
    """Un identificativo utilizzabile come prefisso di topic MQTT.

    Finisce dentro `cyborg/impianti/<id>/#`: uno spazio o un `+` o un `#` li'
    dentro non e' un nome brutto, e' un carattere jolly MQTT che farebbe
    leggere a un impianto i messaggi di un altro. Si sanifica qui, una volta,
    invece di ricordarsene a ogni uso.
    """
    base = str(valore or "").strip().lower()
    base = re.sub(r"[^a-z0-9_-]+", "-", base).strip("-")
    return base[:39] if ID_RE.match(base[:39] or "x") else ""


def normalizza_impianto(riga: Any) -> dict[str, Any] | None:
    """Un impianto valido, oppure None se non c'e' abbastanza per esserlo."""
    if not isinstance(riga, dict):
        return None
    ident = _slug(riga.get("id"))
    if not ident:
        return None
    trasporto = riga.get("trasporto")
    if trasporto not in TRASPORTI:
        trasporto = "mqtt"
    try:
        kwp = max(0.0, min(10000.0, round(float(riga.get("kwp") or 0), 2)))
    except (TypeError, ValueError):
        kwp = 0.0
    fuori = {
        "id": ident,
        "nome": _testo(riga.get("nome"), 60) or ident,
        "cliente": _testo(riga.get("cliente"), 60),
        "note": _testo(riga.get("note"), 400),
        "trasporto": trasporto,
        "kwp": kwp,
        # Canale A
        "mqtt_prefix": _testo(riga.get("mqtt_prefix"), 120) or f"cyborg/impianti/{ident}",
        # Canale B. L'URL si tiene senza barra finale: due barre di fila in
        # mezzo a un percorso sono il genere di dettaglio che fa fallire una
        # richiesta e perdere mezz'ora.
        "ha_url": _testo(riga.get("ha_url"), 200).rstrip("/"),
        # Canale C
        "api_url": _testo(riga.get("api_url"), 300),
        "api_mappa": riga.get("api_mappa") if isinstance(riga.get("api_mappa"), dict) else {},
    }
    return fuori


def normalizza_registro(dati: Any) -> dict[str, Any]:
    """Il documento del registro, sempre nella stessa forma."""
    impianti: list[dict[str, Any]] = []
    visti: set[str] = set()
    righe = dati.get("impianti") if isinstance(dati, dict) else None
    if isinstance(righe, list):
        for riga in righe[:MAX_IMPIANTI]:
            pulita = normalizza_impianto(riga)
            # Due impianti con lo stesso identificativo renderebbero ambiguo
            # ogni messaggio in arrivo: il secondo si scarta.
            if pulita is None or pulita["id"] in visti:
                continue
            visti.add(pulita["id"])
            impianti.append(pulita)
    return {"version": FLEET_VERSION, "impianti": impianti}


SNAPSHOT_VUOTO: dict[str, Any] = {
    "vivo": "giu",
    "visto_alle": None,
    "allarmi": [],
    "energia": {},
    "previsione": {},
    "clima": [],
    "versione": {},
}


def normalizza_snapshot(grezzo: Any) -> dict[str, Any]:
    """Lo stato di un impianto, nella stessa forma qualunque sia il canale.

    E' il punto in cui i tre trasporti smettono di essere diversi. Il pannello
    non deve sapere se un numero e' arrivato da MQTT, da un Home Assistant
    remoto o dall'API di un produttore: se lo sapesse, ogni canale nuovo
    vorrebbe dire toccare l'interfaccia.
    """
    fuori = dict(SNAPSHOT_VUOTO)
    fuori["allarmi"] = []
    fuori["clima"] = []
    if not isinstance(grezzo, dict):
        return fuori

    # L'ora la mette il SITO, non chi riceve.
    #
    # I messaggi sono retained: quando il nostro Home Assistant si riaggancia
    # dopo un riavvio arrivano tutti insieme. Se qui si usasse l'ora di
    # ricezione, ogni impianto sembrerebbe "appena visto" e il monitoraggio
    # mentirebbe proprio nel momento in cui serve. Un messaggio senza orologio
    # non e' un messaggio fresco: e' un messaggio senza orologio, e si dice.
    visto = grezzo.get("visto_alle") or grezzo.get("ts")
    fuori["visto_alle"] = _testo(visto, 40) or None

    allarmi = grezzo.get("allarmi")
    if isinstance(allarmi, list):
        for voce in allarmi[:50]:
            if isinstance(voce, str):
                fuori["allarmi"].append({"gravita": "avviso", "testo": _testo(voce, 200), "da": None})
            elif isinstance(voce, dict):
                gravita = _testo(voce.get("gravita"), 16) or "avviso"
                if gravita not in ("critico", "avviso", "info"):
                    gravita = "avviso"
                fuori["allarmi"].append({
                    "gravita": gravita,
                    "testo": _testo(voce.get("testo"), 200),
                    "da": _testo(voce.get("da"), 40) or None,
                })

    energia = grezzo.get("energia")
    if isinstance(energia, dict):
        pulita: dict[str, Any] = {}
        for chiave in ("ora_w", "oggi_kwh", "autoconsumo_kwh", "immissione_kwh", "batteria_pct"):
            if chiave not in energia:
                continue
            try:
                pulita[chiave] = round(float(energia[chiave]), 3)
            except (TypeError, ValueError):
                # Un numero che non sta in piedi non si mostra affatto. Uno
                # zero al suo posto entrerebbe nelle somme e nei grafici come
                # se fosse una misura vera.
                continue
        fuori["energia"] = pulita

    previsione = grezzo.get("previsione")
    if isinstance(previsione, dict):
        pulita = {}
        for chiave in ("oggi_kwh", "domani_kwh"):
            try:
                pulita[chiave] = round(float(previsione[chiave]), 2)
            except (TypeError, ValueError, KeyError):
                continue
        fuori["previsione"] = pulita

    clima = grezzo.get("clima")
    if isinstance(clima, list):
        for voce in clima[:30]:
            if not isinstance(voce, dict):
                continue
            try:
                gradi = round(float(voce.get("c")), 1)
            except (TypeError, ValueError):
                continue
            fuori["clima"].append({"nome": _testo(voce.get("nome"), 40), "c": gradi})

    versione = grezzo.get("versione")
    if isinstance(versione, dict):
        try:
            pendenti = max(0, int(versione.get("aggiornamenti_pendenti") or 0))
        except (TypeError, ValueError):
            pendenti = 0
        fuori["versione"] = {
            "ha": _testo(versione.get("ha"), 24),
            "aggiornamenti_pendenti": pendenti,
        }
    return fuori


def _secondi(iso: Any, adesso: datetime.datetime) -> float | None:
    """Quanti secondi fa, oppure None se non e' un istante leggibile."""
    testo = str(iso or "").strip()
    if not testo:
        return None
    try:
        quando = datetime.datetime.fromisoformat(testo.replace("Z", "+00:00"))
    except ValueError:
        return None
    if quando.tzinfo is None:
        quando = quando.replace(tzinfo=datetime.timezone.utc)
    return (adesso - quando).total_seconds()


def vitalita(visto_alle: Any, adesso: datetime.datetime) -> str:
    """`ok`, `incerto`, `giu` — oppure `senza_orologio`.

    Il quarto stato non e' un di piu'. Un impianto che pubblica ma non dice
    quando lo ha fatto non e' vivo e non e' morto: e' un impianto configurato
    male, e dirlo e' l'unico modo perche' qualcuno lo sistemi. Contarlo come
    `ok` sarebbe la bugia piu' comoda e piu' pericolosa di tutto il pannello.
    """
    eta = _secondi(visto_alle, adesso)
    if eta is None:
        return "senza_orologio"
    # Un orologio avanti (il sito sbaglia l'ora, o e' su un fuso diverso) non
    # rende l'impianto piu' vivo del vivo: si tratta come appena visto.
    if eta < 0:
        return "ok"
    if eta < SOGLIA_OK:
        return "ok"
    if eta < SOGLIA_INCERTO:
        return "incerto"
    return "giu"


def linea_mia(stati: Any, adesso: datetime.datetime) -> bool:
    """Sono caduti loro, o siamo caduti noi?

    Venti impianti che smettono di rispondere nello stesso quarto d'ora non
    sono venti guasti: e' la linea di casa, o il broker, o il collettore. Un
    pannello che in quel momento mostra venti allarmi rossi sta dando venti
    informazioni sbagliate al posto di una giusta.

    Serve che siano ALMENO DUE e almeno la META', e che siano caduti dentro la
    stessa finestra: dieci impianti giu' da settimane diverse sono dieci
    clienti da richiamare, non un guasto nostro.
    """
    righe = [r for r in stati if isinstance(r, dict)] if isinstance(stati, list) else []
    if len(righe) < 2:
        return False
    caduti = [r for r in righe if r.get("vivo") == "giu"]
    if len(caduti) < 2 or len(caduti) * 2 < len(righe):
        return False
    eta = [_secondi(r.get("visto_alle"), adesso) for r in caduti]
    if any(x is None for x in eta):
        return False
    return (max(eta) - min(eta)) <= FINESTRA_LINEA_MIA


class FleetStore:
    """Il registro su disco. Una sola istanza per Home Assistant."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store = Store(hass, FLEET_VERSION, FLEET_KEY)

    async def async_load(self) -> dict[str, Any]:
        dati = await self._store.async_load()
        return normalizza_registro(dati or {})

    async def async_save(self, dati: Any) -> dict[str, Any]:
        """Si salva SEMPRE la versione normalizzata, non quella ricevuta.

        Normalizzare solo in lettura vorrebbe dire tenere su disco la roba
        come e' arrivata e ripulirla ogni volta: il giorno che qualcuno legge
        il file senza passare di qui, trova il disordine.
        """
        pulito = normalizza_registro(dati)
        await self._store.async_save(pulito)
        return pulito
