"""Cyborg Dashboard Home Assistant integration."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .core.storage import DashboardStorage
from .panel import async_register_panel
from .websocket import async_register_websocket

DOMAIN = "cyborg_dashboard"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Cyborg Dashboard integration."""
    data = hass.data.setdefault(DOMAIN, {})
    data.setdefault("storage", DashboardStorage(hass))
    if not data.get("websocket_registered"):
        async_register_websocket(hass)
        data["websocket_registered"] = True
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Cyborg Dashboard from a config entry."""
    data = hass.data.setdefault(DOMAIN, {})
    data[entry.entry_id] = entry.data
    data.setdefault("storage", DashboardStorage(hass))
    if not data.get("websocket_registered"):
        async_register_websocket(hass)
        data["websocket_registered"] = True
    await async_register_panel(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Cyborg Dashboard."""
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return True
