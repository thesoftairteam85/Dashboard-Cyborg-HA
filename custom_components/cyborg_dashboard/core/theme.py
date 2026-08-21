"""Theme tokens for the Cyborg Dashboard frontend."""
from __future__ import annotations

from typing import Any

DEFAULT_THEME: dict[str, Any] = {
    "mode": "ha",
    "density": "comfortable",
    "radius": 20,
    "surface": "card",
    "accent": "primary",
}


def normalize_theme(theme: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize theme settings while retaining custom future tokens."""
    result = dict(DEFAULT_THEME)
    if isinstance(theme, dict):
        result.update(theme)
    try:
        result["radius"] = max(0, min(48, int(result["radius"])))
    except (TypeError, ValueError):
        result["radius"] = DEFAULT_THEME["radius"]
    return result
