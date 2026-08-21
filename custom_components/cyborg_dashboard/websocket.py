"""WebSocket API for Cyborg Dashboard."""
from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .core.storage import DashboardStorage

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


@websocket_api.websocket_command({"type": TYPE_SAVE, "dashboard": dict})
@websocket_api.async_response
async def _ws_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Persist dashboard configuration."""
    await DashboardStorage(hass).async_save(msg["dashboard"])
    connection.send_result(msg["id"], {"saved": True})
