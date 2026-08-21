"""Core dashboard configuration schema."""
from __future__ import annotations

from typing import Any


def default_dashboard() -> dict[str, Any]:
    """Return the minimal persisted dashboard model."""
    return {
        "version": 1,
        "pages": [
            {
                "id": "home",
                "title": "Home",
                "layout": {"type": "grid", "columns": 12, "gap": 16},
                "items": [],
            }
        ],
        "theme": {"mode": "ha", "density": "comfortable"},
    }


def normalize_dashboard(data: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize user data while preserving unknown future options."""
    if not isinstance(data, dict):
        return default_dashboard()
    result = default_dashboard()
    result.update(data)
    if not isinstance(result.get("pages"), list) or not result["pages"]:
        result["pages"] = default_dashboard()["pages"]
    return result
