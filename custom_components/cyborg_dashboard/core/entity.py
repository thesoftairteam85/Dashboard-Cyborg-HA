"""Home Assistant entity helpers for Cyborg Dashboard."""
from __future__ import annotations

from typing import Any


def entity_snapshot(hass: Any, entity_id: str) -> dict[str, Any]:
    """Return a frontend-safe snapshot of an entity."""
    state = hass.states.get(entity_id)
    if state is None:
        return {"entity_id": entity_id, "available": False}
    return {
        "entity_id": entity_id,
        "available": state.state not in {"unknown", "unavailable"},
        "state": state.state,
        "attributes": dict(state.attributes),
        "last_changed": state.last_changed.isoformat(),
        "last_updated": state.last_updated.isoformat(),
    }
