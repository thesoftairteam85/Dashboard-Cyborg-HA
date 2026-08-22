"""Cyborg Dashboard sidebar panel."""
from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback
import json

PANEL_PATH = "cyborg-dashboard"
WEB_COMPONENT = "cyborg-dashboard"
STATIC_PATH = "/cyborg_dashboard/static"

def _integration_version() -> str:
    """Read the version from manifest.json for cache-busting the JS module URL.

    panel_custom loads cyborg-dashboard.js as an ES module via dynamic import().
    Browsers/Chromium keep an ES module already imported in a tab in memory for
    the lifetime of that document, regardless of server-side cache headers or
    HACS having already written the new file to disk. Appending ?v=<version> to
    the module URL means a version bump produces a new URL, which forces the
    browser to fetch (and the JS engine to re-evaluate) the updated module on
    the next panel load, without depending on the user doing a hard refresh.
    """
    manifest_path = Path(__file__).parent / "manifest.json"
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))["version"]
    except (OSError, KeyError, ValueError):
        return "0"


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
        module_url=f"{STATIC_PATH}/cyborg-dashboard.js?v={_integration_version()}",
        config={"version": _integration_version()},
        require_admin=False,
    )


@callback
def async_unregister_panel(hass: HomeAssistant) -> None:
    """Remove the Cyborg Dashboard sidebar panel, if present."""
    frontend.async_remove_panel(hass, PANEL_PATH, warn_if_unknown=False)
