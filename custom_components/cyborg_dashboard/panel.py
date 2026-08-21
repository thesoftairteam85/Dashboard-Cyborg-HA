"""Frontend panel registration for Cyborg Dashboard."""
from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.components.frontend import async_register_built_in_panel

from .const import DOMAIN

PANEL_URL = "cyborg-dashboard"
PANEL_TITLE = "Cyborg Dashboard"
PANEL_ICON = "mdi:view-dashboard-edit"

async def async_register_panel(hass: HomeAssistant) -> None:
    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL,
        config={"_panel_custom": True, "embed_iframe": False},
        require_admin=False,
    )
