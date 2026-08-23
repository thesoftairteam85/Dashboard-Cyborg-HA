"""Cyborg Dashboard Home Assistant integration."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .core.notifications import NotificationLog
from .core.scheduler import CyborgScheduler
from .core.storage import DashboardStorage
from .panel import async_register_panel, async_unregister_panel
from .websocket import async_register_websocket

DOMAIN = "cyborg_dashboard"


async def _async_ensure_services(hass: HomeAssistant) -> None:
    """Start the long-lived helpers once, whichever setup path runs first.

    Both of these must survive a config-entry reload. The notification log is
    the only record of the alerts Home Assistant has sent, and the scheduler
    holds live countdowns: tearing either down on every reload would throw away
    the history the panel exists to show, and would leave an irrigation valve
    open with nothing left to close it.
    """
    data = hass.data.setdefault(DOMAIN, {})
    if data.get("notifications") is None:
        data["notifications"] = NotificationLog(hass)
    await data["notifications"].async_start()

    if data.get("scheduler") is None:
        data["scheduler"] = CyborgScheduler(hass)
    await data["scheduler"].async_start()


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Cyborg Dashboard integration."""
    data = hass.data.setdefault(DOMAIN, {})
    data.setdefault("storage", DashboardStorage(hass))
    if not data.get("websocket_registered"):
        async_register_websocket(hass)
        data["websocket_registered"] = True
    await _async_ensure_services(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Cyborg Dashboard from a config entry."""
    data = hass.data.setdefault(DOMAIN, {})
    data[entry.entry_id] = entry.data
    data.setdefault("storage", DashboardStorage(hass))
    if not data.get("websocket_registered"):
        async_register_websocket(hass)
        data["websocket_registered"] = True
    await _async_ensure_services(hass)
    await async_register_panel(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Cyborg Dashboard."""
    async_unregister_panel(hass)
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return True
