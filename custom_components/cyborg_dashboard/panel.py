"""Cyborg Dashboard sidebar panel."""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback

_LOGGER = logging.getLogger(__name__)

PANEL_PATH = "cyborg-dashboard"
WEB_COMPONENT = "cyborg-dashboard"
STATIC_PATH = "/cyborg_dashboard/static"

def _cache_key() -> str:
    """Cache key for the JS module URL: version plus a hash of the file itself.

    The version alone is not enough. Two things break it. A development build
    changes cyborg-dashboard.js without changing manifest.json, so the URL stays
    identical and the browser keeps the old module - an ES module already
    imported in a document is never re-fetched, whatever the cache headers say.
    And a browser that has cached the module under an old URL only lets go when
    the URL itself changes. Hashing the shipped bytes makes the URL a function
    of the content: identical file, identical URL and a free cache hit; one byte
    different, new URL and a guaranteed re-fetch. sha256 over ~700 kB costs
    about a millisecond, once, at setup - paid in the executor, not the loop.
    """
    version = _integration_version()
    js = Path(__file__).parent / "www" / "cyborg-dashboard.js"
    try:
        digest = hashlib.sha256(js.read_bytes()).hexdigest()[:10]
    except OSError:
        return version
    return f"{version}-{digest}"


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


async def _async_prune_stale_resources(hass: HomeAssistant) -> None:
    """Drop any un-versioned Lovelace resource pointing at this module.

    Earlier versions registered one as a belt-and-braces measure against
    "Custom element doesn't exist". It turned out to be the opposite: a URL
    with no version is cached indefinitely by the browser, loads before the
    panel's own versioned module and permanently claims the element name.
    """
    try:
        resources = hass.data.get("lovelace")
        collection = getattr(resources, "resources", None) if resources else None
        if collection is None:
            return
        for item in list(collection.async_items() or []):
            url = str(item.get("url") or "")
            if url.startswith(STATIC_PATH) and "?v=" not in url:
                await collection.async_delete_item(item["id"])
                _LOGGER.info("Rimossa risorsa Lovelace senza versione: %s", url)
    except Exception:  # noqa: BLE001 - never block panel setup over a cleanup
        _LOGGER.debug("Impossibile ripulire le risorse Lovelace", exc_info=True)


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
    # _integration_version() reads manifest.json from disk. Home Assistant's
    # event loop forbids blocking file I/O directly in an async def (it logs
    # "Detected blocking call to open ... inside the event loop" and future
    # core versions turn this into a hard error) - so it must run in the
    # executor thread pool, not be called inline here.
    version = await hass.async_add_executor_job(_integration_version)
    cache_key = await hass.async_add_executor_job(_cache_key)
    # Publishing the module on every frontend page registers the Lovelace card
    # as a side effect, without the user having to add a resource by hand.
    # A custom panel is NOT a Lovelace dashboard, so it can never be picked as
    # the default dashboard; a Lovelace dashboard holding the equivalent card
    # can. add_extra_js_url is verified present in core 2026.8.3
    # (components/frontend/__init__.py) and is idempotent per URL.
    # The module is loaded once, from a URL that carries the version. A second
    # copy registered as a Lovelace resource *without* a version would be
    # served from the browser cache, win the custom-element name (an element
    # can only be defined once) and make every later copy a no-op — the panel
    # would keep running old code while the integration reported the new
    # version. add_extra_js_url already loads this module on every frontend
    # page, Lovelace included, so no separate resource is needed.
    await _async_prune_stale_resources(hass)
    frontend.add_extra_js_url(hass, f"{STATIC_PATH}/cyborg-dashboard.js?v={cache_key}")
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_PATH,
        webcomponent_name=WEB_COMPONENT,
        sidebar_title="Cyborg Dashboard",
        sidebar_icon="mdi:view-dashboard-edit",
        module_url=f"{STATIC_PATH}/cyborg-dashboard.js?v={cache_key}",
        config={"version": version},
        require_admin=False,
    )


@callback
def async_unregister_panel(hass: HomeAssistant) -> None:
    """Remove the Cyborg Dashboard sidebar panel, if present."""
    frontend.async_remove_panel(hass, PANEL_PATH, warn_if_unknown=False)
