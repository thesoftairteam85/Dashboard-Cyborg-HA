"""WebSocket API for the Cyborg Dashboard editor."""
from __future__ import annotations

from typing import Any
from homeassistant.core import HomeAssistant
from homeassistant.components import websocket_api

DOMAIN = "cyborg_dashboard"


def register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_get_config)
    websocket_api.async_register_command(hass, ws_save_config)


@websocket_api.websocket_command({"type": "cyborg_dashboard/get_config"})
@websocket_api.async_response
async def ws_get_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    storage = hass.data[DOMAIN]["storage"]
    config = await storage.async_load()
    connection.send_result(msg["id"], config)


@websocket_api.websocket_command({
    "type": "cyborg_dashboard/save_config",
    "config": dict,
})
@websocket_api.async_response
async def ws_save_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    storage = hass.data[DOMAIN]["storage"]
    await storage.async_save(msg["config"])
    connection.send_result(msg["id"], {"success": True})
