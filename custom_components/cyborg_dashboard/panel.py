"""Cyborg Dashboard sidebar panel."""
from __future__ import annotations

from pathlib import Path

from homeassistant.components import panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

PANEL_PATH = "cyborg-dashboard"
WEB_COMPONENT = "cyborg-dashboard"
STATIC_PATH = "/cyborg_dashboard/static"


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register the Cyborg Dashboard sidebar panel."""
    www = Path(__file__).parent / "www"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_PATH, str(www), cache_headers=False)]
    )
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_PATH,
        webcomponent_name=WEB_COMPONENT,
        sidebar_title="Cyborg Dashboard",
        sidebar_icon="mdi:view-dashboard-edit",
        module_url=f"{STATIC_PATH}/cyborg-dashboard.js",
        config={"version": "0.1.6"},
        require_admin=False,
    )
