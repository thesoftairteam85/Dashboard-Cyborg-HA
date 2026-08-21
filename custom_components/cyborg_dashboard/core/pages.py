"""Dashboard page management."""
from __future__ import annotations

from copy import deepcopy
from typing import Any

from .schema import normalize_dashboard


def add_page(data: dict[str, Any], page_id: str, title: str) -> dict[str, Any]:
    """Add a new dashboard page."""
    result = deepcopy(normalize_dashboard(data))
    result["pages"].append({
        "id": page_id,
        "title": title,
        "layout": {"type": "grid", "columns": 12, "gap": 16},
        "items": [],
    })
    return result


def remove_page(data: dict[str, Any], page_id: str) -> dict[str, Any]:
    """Remove a page while always retaining one page."""
    result = deepcopy(normalize_dashboard(data))
    if len(result["pages"]) <= 1:
        return result
    result["pages"] = [page for page in result["pages"] if page.get("id") != page_id]
    return result
