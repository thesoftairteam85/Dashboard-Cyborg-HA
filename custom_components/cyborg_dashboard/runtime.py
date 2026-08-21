"""Runtime helpers for Cyborg Dashboard."""
from __future__ import annotations

from homeassistant.core import HomeAssistant

DOMAIN = "cyborg_dashboard"

async def async_setup_runtime(hass: HomeAssistant) -> None:
    """Initialize runtime state for the dashboard."""
    hass.data.setdefault(DOMAIN, {}).setdefault("runtime", {})
