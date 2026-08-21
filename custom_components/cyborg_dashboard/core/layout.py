"""Layout model and validation for Cyborg Dashboard."""
from __future__ import annotations

from typing import Any

DEFAULT_COLUMNS = 12


def normalize_layout(layout: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize a grid layout while preserving future options."""
    layout = layout if isinstance(layout, dict) else {}
    result = {"type": "grid", "columns": DEFAULT_COLUMNS, "gap": 16}
    result.update(layout)
    try:
        result["columns"] = max(1, min(24, int(result["columns"])))
    except (TypeError, ValueError):
        result["columns"] = DEFAULT_COLUMNS
    try:
        result["gap"] = max(0, min(64, int(result["gap"])))
    except (TypeError, ValueError):
        result["gap"] = 16
    return result


def normalize_item(item: dict[str, Any]) -> dict[str, Any]:
    """Normalize a dashboard item without discarding extension fields."""
    result = dict(item)
    result.setdefault("id", "")
    result.setdefault("type", "entity")
    result.setdefault("position", {"x": 0, "y": 0, "w": 3, "h": 2})
    return result
