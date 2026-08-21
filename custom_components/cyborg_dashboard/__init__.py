"""Cyborg Dashboard Home Assistant integration."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .panel import async_register_panel
from .websocket import async_register_websocket

DOMAIN = "cyborg_dashboard"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Cyborg Dashboard integration."""
    hass.data.setdefault(DOMAIN, {})
    async_register_websocket(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Cyborg Dashboard from a config entry."""
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = entry.data
    await async_register_panel(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Cyborg Dashboard."""
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return True
