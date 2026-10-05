"""Il promemoria della sera prima per la raccolta rifiuti.

Perche' sta nell'integrazione e non nel pannello
-------------------------------------------------
Alle 20:00 il pannello e' chiuso. Un avviso che esiste solo finche' qualcuno
guarda lo schermo non e' un avviso, e' una scritta. Questo gira dentro Home
Assistant, che e' acceso comunque.

Perche' l'avviso ogni minuto non va bene
-----------------------------------------
Si arma a un orario preciso con `async_track_time_change` invece di
controllare in un ciclo: un controllo periodico sbaglia in due modi opposti
(troppo raro e salta la sera, troppo fitto e consuma per trecentosessantacinque
giorni l'anno per mandare trenta avvisi).

Il doppione
-----------
Due card Raccolta che annunciano lo stesso ritiro manderebbero due avvisi
identici. Si tiene memoria dell'ultima data gia' annunciata per card: non e'
un contatore, e' la risposta alla domanda "questo l'ho gia' detto?".
"""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from . import waste

_LOGGER = logging.getLogger(__name__)

#: Gli orari a cui ci si puo' armare. Non uno al minuto: ogni orario distinto
#: fra le card e' un listener, e una card con un refuso ("3:7") non deve poter
#: creare un listener che non serve a niente.
ORARI_MAX = 6


class WasteReminders:
    """Arma gli avvisi serali leggendo le card Raccolta della dashboard."""

    def __init__(self, hass: HomeAssistant, storage: Any, notifications: Any) -> None:
        self._hass = hass
        self._storage = storage
        self._notifications = notifications
        self._unsub: list[Any] = []
        self._gia_detto: dict[str, str] = {}
        self._started = False

    async def async_start(self) -> None:
        if self._started:
            return
        self._started = True
        await self.async_rearm()

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()
        self._started = False

    async def async_rearm(self) -> None:
        """Rilegge la dashboard e si riarma sugli orari che trova.

        Va richiamata a ogni salvataggio: un orario cambiato nell'editor che
        non riarma niente e' esattamente il genere di guasto che si scopre la
        sera che l'avviso non arriva, cioe' troppo tardi.
        """
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()
        try:
            dashboard = await self._storage.async_load()
        except Exception:  # noqa: BLE001 - un avviso non deve poter impedire l'avvio
            _LOGGER.debug("Non riesco a leggere la dashboard per gli avvisi", exc_info=True)
            return
        orari: set[tuple[int, int]] = set()
        for trovata in waste.trova_card_raccolta(dashboard):
            card = trovata["card"]
            if card.get("remind") is False:
                continue
            quando = str(card.get("remind_at") or "20:00")
            try:
                ore, minuti = (int(x) for x in quando.split(":"))
            except (TypeError, ValueError):
                continue
            if not (0 <= ore <= 23 and 0 <= minuti <= 59):
                continue
            orari.add((ore, minuti))
        for ore, minuti in sorted(orari)[:ORARI_MAX]:
            self._unsub.append(
                async_track_time_change(
                    self._hass, self._make_runner(), hour=ore, minute=minuti, second=0
                )
            )

    def _make_runner(self):
        @callback
        def fire(_now) -> None:
            self._hass.async_create_task(self._async_fire())
        return fire

    async def _async_fire(self) -> None:
        """Guarda cosa esce domani e, se c'e' qualcosa, lo dice.

        Si rilegge la dashboard al momento dello scatto invece di fidarsi di
        quella letta all'avvio: fra l'armamento e le 20:00 possono passare
        settimane, e nel mezzo le regole possono essere cambiate.
        """
        oggi = dt_util.now().date()
        try:
            dashboard = await self._storage.async_load()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Avviso raccolta: dashboard illeggibile", exc_info=True)
            return
        adesso = dt_util.now().strftime("%H:%M")
        for trovata in waste.trova_card_raccolta(dashboard):
            card = trovata["card"]
            # Si scatta UNA sola volta per orario: due card con orari diversi
            # armano due listener, e senza questo controllo ciascuno
            # annuncerebbe anche i ritiri dell'altra.
            if str(card.get("remind_at") or "20:00") != adesso:
                continue
            avviso = waste.avviso_di_domani(card, oggi)
            if avviso is None:
                continue
            chiave = str(trovata.get("item") or "")
            if self._gia_detto.get(chiave) == avviso["data"]:
                continue
            self._gia_detto[chiave] = avviso["data"]
            self._notifications.async_add_local({
                "channel": "raccolta",
                "channel_label": "Raccolta rifiuti",
                "title": avviso["titolo"],
                "message": avviso["messaggio"],
                # Il bersaglio: una notifica che nomina un ritiro deve poter
                # portare alla card che lo mostra. Le coordinate si scrivono
                # QUI, dove si sa dove sta la card, invece di farle indovinare
                # al pannello per somiglianza di testo.
                "target": {
                    "kind": "card",
                    "page": trovata.get("page"),
                    "section": trovata.get("section"),
                    "item": trovata.get("item"),
                },
            })
