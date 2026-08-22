"""Cyborg Dashboard sidebar panel."""
from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback

PANEL_PATH = "cyborg-dashboard"
WEB_COMPONENT = "cyborg-dashboard"
STATIC_PATH = "/cyborg_dashboard/static"


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register the Cyborg Dashboard sidebar panel.

    Idempotent by design: ``frontend.async_register_built_in_panel`` raises
    ``ValueError`` if a panel is already registered at ``PANEL_PATH`` (see
    homeassistant/components/frontend/__init__.py). That happens on every
    config entry *reload* (e.g. after a HACS update) because
    ``async_unload_entry`` did not used to remove the panel first, so a
    second ``async_setup_entry`` call hit an already-populated
    ``hass.data[frontend.DATA_PANELS]``. Removing any existing registration
    first makes this call safe to run any number of times.
    """
    www = Path(__file__).parent / "www"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_PATH, str(www), cache_headers=False)]
    )
    if frontend.async_panel_exists(hass, PANEL_PATH):
        frontend.async_remove_panel(hass, PANEL_PATH, warn_if_unknown=False)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_PATH,
        webcomponent_name=WEB_COMPONENT,
        sidebar_title="Cyborg Dashboard",
        sidebar_icon="mdi:view-dashboard-edit",
        module_url=f"{STATIC_PATH}/cyborg-dashboard.js",
        config={"version": "0.4.0"},
        require_admin=False,
    )


@callback
def async_unregister_panel(hass: HomeAssistant) -> None:
    """Remove the Cyborg Dashboard sidebar panel, if present."""
    frontend.async_remove_panel(hass, PANEL_PATH, warn_if_unknown=False)
