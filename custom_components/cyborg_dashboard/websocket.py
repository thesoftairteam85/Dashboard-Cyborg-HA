"""WebSocket API for Cyborg Dashboard."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .core.storage import DashboardConflictError, DashboardStorage

TYPE_GET = "cyborg_dashboard/get"
TYPE_SAVE = "cyborg_dashboard/save"


def async_register_websocket(hass: HomeAssistant) -> None:
    """Register Cyborg Dashboard WebSocket commands."""
    websocket_api.async_register_command(hass, TYPE_GET, _ws_get)
    websocket_api.async_register_command(hass, TYPE_SAVE, _ws_save)


@websocket_api.websocket_command({"type": TYPE_GET})
@callback
def _ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Return the persisted dashboard."""
    async def load() -> None:
        data = await DashboardStorage(hass).async_load()
        connection.send_result(msg["id"], {"dashboard": data})
    hass.async_create_task(load())


@websocket_api.websocket_command({
    "type": TYPE_SAVE,
    "dashboard": dict,
    vol.Optional("expected_revision"): vol.Any(int, None),
})
@websocket_api.async_response
async def _ws_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Persist dashboard configuration.

    Accepts an optional ``expected_revision``: when the caller supplies it
    and it no longer matches what is stored, the save is rejected with a
    ``revision_conflict`` error instead of overwriting a concurrent edit
    (e.g. two browser tabs, or the editor UI racing an automation-driven
    update). Omitting it preserves the previous last-write-wins behavior.
    """
    storage = DashboardStorage(hass)
    try:
        revision = await storage.async_save(
            msg["dashboard"], expected_revision=msg.get("expected_revision")
        )
    except DashboardConflictError as err:
        connection.send_error(
            msg["id"],
            "revision_conflict",
            f"Il dashboard è stato modificato altrove (revisione attuale: {err.current_revision}).",
        )
        return
    connection.send_result(msg["id"], {"saved": True, "revision": revision})
