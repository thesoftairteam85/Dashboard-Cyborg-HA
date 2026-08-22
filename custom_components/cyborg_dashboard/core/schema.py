"""Core dashboard configuration schema."""
from __future__ import annotations

from typing import Any


DEFAULT_THEME = {
    "mode": "dark", "density": "comfortable", "radius": 16, "gap": 16,
    "surface": "card", "background": None, "accent": "#00e5ff",
    "text": None, "animations": True,
}


def default_dashboard() -> dict[str, Any]:
    return {"version": 2, "revision": 0, "pages": [{
        "id": "home", "title": "Cyborg", "icon": "mdi:hexagon-multiple-outline",
        "layout": {"type": "grid", "columns": 12, "gap": 16}, "items": [],
    }], "theme": dict(DEFAULT_THEME)}


def normalize_dashboard(data: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize configuration while retaining extension fields."""
    if not isinstance(data, dict):
        return default_dashboard()
    result = default_dashboard()
    result.update(data)
    try:
        result["revision"] = int(data.get("revision", 0))
    except (TypeError, ValueError):
        result["revision"] = 0
    theme = dict(DEFAULT_THEME)
    if isinstance(data.get("theme"), dict):
        theme.update(data["theme"])
    result["theme"] = theme
    pages = data.get("pages")
    if not isinstance(pages, list) or not pages:
        result["pages"] = default_dashboard()["pages"]
    else:
        normalized = []
        for index, page in enumerate(pages):
            if not isinstance(page, dict):
                continue
            p = dict(page)
            p.setdefault("id", f"page-{index + 1}")
            p.setdefault("title", f"Page {index + 1}")
            p.setdefault("icon", "mdi:view-dashboard-outline")
            p.setdefault("layout", {"type": "grid", "columns": 12, "gap": 16})
            p.setdefault("items", [])
            normalized.append(p)
        result["pages"] = normalized or default_dashboard()["pages"]
    return result
