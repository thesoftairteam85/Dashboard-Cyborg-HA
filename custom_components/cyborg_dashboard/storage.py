"""Persistent, versioned dashboard storage."""
from __future__ import annotations

from typing import Any
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

STORAGE_VERSION = 1
STORAGE_KEY = "cyborg_dashboard"

DEFAULT_CONFIG: dict[str, Any] = {
    "schema_version": STORAGE_VERSION,
    "pages": [{"id": "home", "title": "Home", "sections": []}],
}

class DashboardStorage:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] = dict(DEFAULT_CONFIG)

    async def async_load(self) -> dict[str, Any]:
        data = await self._store.async_load()
        self._data = self._normalize(data)
        return self._data

    async def async_save(self, data: dict[str, Any]) -> None:
        self._data = self._normalize(data)
        await self._store.async_save(self._data)

    @staticmethod
    def _normalize(data: dict[str, Any] | None) -> dict[str, Any]:
        if not data:
            return dict(DEFAULT_CONFIG)
        result = dict(data)
        result["schema_version"] = STORAGE_VERSION
        result.setdefault("pages", [])
        return result
