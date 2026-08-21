"""Cyborg Dashboard Home Assistant integration."""
from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry

from .api import register
from .frontend import register_frontend
from .panel import async_register_panel
from .storage import DashboardStorage

DOMAIN = "cyborg_dashboard"

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["storage"] = DashboardStorage(hass)
    register(hass)
    register_frontend(hass)
    await async_register_panel(hass)
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return True
