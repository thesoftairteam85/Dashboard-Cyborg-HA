"""Serve the Cyborg Dashboard frontend as a Home Assistant module."""
from __future__ import annotations

from pathlib import Path

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from aiohttp import web

from .const import FRONTEND_MODULE

FRONTEND_URL = "/cyborg_dashboard/frontend"


class CyborgFrontendView(HomeAssistantView):
    url = FRONTEND_URL + "/{filename:.*}"
    name = "api:cyborg_dashboard:frontend"
    requires_auth = True

    async def get(self, request: web.Request, filename: str) -> web.StreamResponse:
        root = Path(__file__).parent / "frontend"
        path = (root / filename).resolve()
        if root.resolve() not in path.parents or not path.is_file():
            raise web.HTTPNotFound()
        content_type = "text/css" if path.suffix == ".css" else "text/javascript"
        return web.Response(body=path.read_bytes(), content_type=content_type)


def register_frontend(hass: HomeAssistant) -> None:
    hass.http.register_view(CyborgFrontendView)
