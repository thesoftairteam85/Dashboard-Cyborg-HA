"""Persistent storage for Cyborg Dashboard."""
from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .schema import default_dashboard, normalize_dashboard

STORAGE_VERSION = 1
STORAGE_KEY = "cyborg_dashboard"


class DashboardConflictError(Exception):
    """Raised when a save is attempted against a stale revision."""

    def __init__(self, current_revision: int) -> None:
        super().__init__(
            f"Dashboard revision mismatch: server is at {current_revision}"
        )
        self.current_revision = current_revision


class DashboardStorage:
    """Load and save the dashboard configuration."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store[dict[str, Any]](hass, STORAGE_VERSION, STORAGE_KEY)

    async def async_load(self) -> dict[str, Any]:
        data = await self._store.async_load()
        return normalize_dashboard(data or default_dashboard())

    async def async_save(
        self, data: dict[str, Any], *, expected_revision: int | None = None
    ) -> int:
        """Persist the dashboard, optionally enforcing optimistic concurrency.

        If ``expected_revision`` is provided and does not match the revision
        currently on disk, the save is rejected with ``DashboardConflictError``
        instead of silently overwriting a concurrent edit. Callers that omit
        ``expected_revision`` keep the previous best-effort (last-write-wins)
        behavior for backward compatibility.
        """
        current = await self._store.async_load()
        current_revision = 0
        if isinstance(current, dict):
            try:
                current_revision = int(current.get("revision", 0))
            except (TypeError, ValueError):
                current_revision = 0

        if expected_revision is not None and expected_revision != current_revision:
            raise DashboardConflictError(current_revision)

        normalized = normalize_dashboard(data)
        normalized["revision"] = current_revision + 1
        await self._store.async_save(normalized)
        return normalized["revision"]
