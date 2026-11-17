"""Quando un entity_id cambia in Home Assistant, il dashboard lo segue.

Il dashboard salva gli entity_id: e' l'unico riferimento stabile che Home
Assistant offre. Ma un entity_id si rinomina, e Home Assistant non aggiorna chi
lo usa: dopo una rinomina ogni card che lo citava mostra un trattino, in
silenzio. E' successo per davvero dopo un trasloco: la card Monitoraggio
mostrava ``sensor.lavatrice_potenza`` scritto in chiaro, con «—» accanto.

Verificato sul sorgente di core 2026.11.1 (``helpers/entity_registry.py``):

* ``EVENT_ENTITY_REGISTRY_UPDATED`` = ``"entity_registry_updated"``;
* per ``action == "update"`` i dati sono ``entity_id`` (il NUOVO), ``changes``
  e ``old_entity_id`` - quest'ultimo presente **solo** quando l'id e' cambiato
  davvero (``if old.entity_id != entity_id: data["old_entity_id"] = ...``).

Tre scelte, ognuna con il suo perche':

1. **Confronto sulla stringa intera, mai su una sottostringa.** Una sostituzione
   «dentro» il testo trasformerebbe ``sensor.lavatrice_potenza_2`` quando si
   rinomina ``sensor.lavatrice_potenza``. E' la stessa lezione della «N» di
   «Nonno compleanno» riconosciuta come turno di notte.
2. **Le chiavi dei dizionari contano quanto i valori.** Colori per entita',
   gerarchia dei carichi, ordine dei blocchi: in diversi punti lo schema usa
   l'entity_id come chiave. Rinominare solo i valori lascerebbe un colore
   attaccato a un'entita' che non esiste piu'.
3. **Le rinomine si raccolgono e si scrivono una volta sola.** Un riordino di
   duecento entita' manda duecento eventi in pochi secondi: duecento
   salvataggi farebbero duecento revisioni, e ogni schermo aperto andrebbe in
   conflitto duecento volte. Si aspetta che la raffica finisca, poi si scrive.
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_call_later

from .storage import DashboardConflictError, DashboardStorage

_LOGGER = logging.getLogger(__name__)

# Abbastanza per coprire una raffica fatta a mano o da uno script, abbastanza
# poco perche' chi rinomina e poi guarda il pannello non veda il trattino.
DEBOUNCE_SECONDS = 2.0
MAX_SAVE_ATTEMPTS = 3


def compose_renames(pending: dict[str, str], old: str, new: str) -> dict[str, str]:
    """Aggiunge ``old -> new`` a una mappa di rinomine non ancora scritte.

    Le catene si risolvono subito: ``a -> b`` seguito da ``b -> c`` diventa
    ``a -> c`` e ``b -> c``, perche' nel dashboard salvato c'e' ancora ``a``.
    Un giro che torna al punto di partenza (``a -> b``, ``b -> a``) si annulla
    invece di riscrivere ``a`` con se stesso.
    """
    result = dict(pending)
    for src, dst in list(result.items()):
        if dst == old:
            result[src] = new
    result[old] = new
    return {src: dst for src, dst in result.items() if src != dst}


def rewrite_entity_ids(data: Any, renames: dict[str, str]) -> tuple[Any, int]:
    """Restituisce una copia di ``data`` con gli entity_id rinominati.

    Tocca solo le stringhe uguali per intero a un id vecchio, nei valori e
    nelle chiavi. Restituisce anche quante sostituzioni ha fatto: zero vuol
    dire che il dashboard non citava nessuna di quelle entita', e allora non
    si salva niente.
    """
    count = 0

    def walk(node: Any) -> Any:
        nonlocal count
        if isinstance(node, str):
            if node in renames:
                count += 1
                return renames[node]
            return node
        if isinstance(node, list):
            return [walk(v) for v in node]
        if isinstance(node, dict):
            out: dict[Any, Any] = {}
            for key, value in node.items():
                new_key = key
                if isinstance(key, str) and key in renames:
                    count += 1
                    new_key = renames[key]
                # Se l'id nuovo era gia' una chiave (raro: qualcuno l'aveva
                # configurato a mano prima della rinomina) vince il valore che
                # c'era gia', che e' una scelta esplicita e non un residuo.
                if new_key in out and new_key != key:
                    walk(value)
                    continue
                out[new_key] = walk(value)
            return out
        return node

    return walk(data), count


class EntityRenameFollower:
    """Ascolta le rinomine e riscrive il dashboard salvato."""

    def __init__(self, hass: HomeAssistant, storage: DashboardStorage) -> None:
        self._hass = hass
        self._storage = storage
        self._pending: dict[str, str] = {}
        self._unsub_event: CALLBACK_TYPE | None = None
        self._unsub_timer: CALLBACK_TYPE | None = None
        self._listeners: list[Callable[[int], None]] = []

    async def async_start(self) -> None:
        if self._unsub_event is not None:
            return
        self._unsub_event = self._hass.bus.async_listen(
            er.EVENT_ENTITY_REGISTRY_UPDATED,
            self._on_registry_updated,
            event_filter=_is_rename,
        )

    @callback
    def async_subscribe(self, listener: Callable[[int], None]) -> CALLBACK_TYPE:
        """Avvisa ``listener`` con la revisione nuova a ogni riscrittura."""
        self._listeners.append(listener)

        @callback
        def remove() -> None:
            if listener in self._listeners:
                self._listeners.remove(listener)

        return remove

    @callback
    def _on_registry_updated(self, event: Event[er.EventEntityRegistryUpdatedData]) -> None:
        data = event.data
        self._pending = compose_renames(self._pending, data["old_entity_id"], data["entity_id"])
        if self._unsub_timer is not None:
            self._unsub_timer()
        self._unsub_timer = async_call_later(self._hass, DEBOUNCE_SECONDS, self._flush)

    async def _flush(self, _now: Any = None) -> None:
        self._unsub_timer = None
        renames, self._pending = self._pending, {}
        if not renames:
            return
        for _attempt in range(MAX_SAVE_ATTEMPTS):
            current = await self._storage.async_load()
            revision = int(current.get("revision", 0) or 0)
            rewritten, count = rewrite_entity_ids(current, renames)
            if not count:
                return
            try:
                new_revision = await self._storage.async_save(
                    rewritten, expected_revision=revision
                )
            except DashboardConflictError:
                # Qualcuno ha salvato fra la lettura e la scrittura: si rilegge
                # e si riapplica. Le rinomine sono idempotenti, riapplicarle a
                # una versione piu' nuova e' sempre corretto.
                continue
            _LOGGER.info(
                "Dashboard aggiornato dopo %d rinomine (%d riferimenti): %s",
                len(renames), count,
                ", ".join(f"{a} -> {b}" for a, b in sorted(renames.items())),
            )
            for listener in list(self._listeners):
                listener(new_revision)
            return
        _LOGGER.warning(
            "Rinomine non scritte nel dashboard dopo %d tentativi: %s",
            MAX_SAVE_ATTEMPTS, renames,
        )


@callback
def _is_rename(event_data: er.EventEntityRegistryUpdatedData) -> bool:
    """Solo gli update che cambiano davvero l'entity_id."""
    return (
        event_data.get("action") == "update"
        and "old_entity_id" in event_data
        and event_data["old_entity_id"] != event_data["entity_id"]
    )
