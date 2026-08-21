"""Register the Cyborg Dashboard as a native Home Assistant custom panel."""
from __future__ import annotations

from pathlib import Path

from homeassistant.components import panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DOMAIN

PANEL_TITLE = "Cyborg Dashboard"
PANEL_ICON = "mdi:view-dashboard-edit"
PANEL_NAME = f"{DOMAIN}-panel"


async def async_register_panel(hass: HomeAssistant) -> None:
    www_path = Path(__file__).parent / "www"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(f"/{DOMAIN}", str(www_path), False)]
    )

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_NAME,
        frontend_url_path=DOMAIN,
        module_url=f"/{DOMAIN}/cyborg-dashboard.js",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=False,
        config={},
        config_panel_domain=DOMAIN,
    )
