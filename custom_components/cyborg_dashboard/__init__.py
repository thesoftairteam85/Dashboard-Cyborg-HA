"""Cyborg Dashboard Home Assistant integration."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

DOMAIN = "cyborg_dashboard"

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Cyborg Dashboard from a config entry."""
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = entry.data
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Cyborg Dashboard."""
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return True
