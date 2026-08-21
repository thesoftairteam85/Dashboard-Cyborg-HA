"""Persistent storage for Cyborg Dashboard."""
from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .schema import default_dashboard, normalize_dashboard

STORAGE_VERSION = 1
STORAGE_KEY = "cyborg_dashboard"


class DashboardStorage:
    """Load and save the dashboard configuration."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store[dict[str, Any]](hass, STORAGE_VERSION, STORAGE_KEY)

    async def async_load(self) -> dict[str, Any]:
        data = await self._store.async_load()
        return normalize_dashboard(data or default_dashboard())

    async def async_save(self, data: dict[str, Any]) -> None:
        await self._store.async_save(normalize_dashboard(data))
