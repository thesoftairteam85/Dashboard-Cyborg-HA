"""Dashboard editor operations."""
from __future__ import annotations

from copy import deepcopy
from typing import Any

from .layout import normalize_item, normalize_layout
from .schema import normalize_dashboard


def add_item(data: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
    """Add a dashboard item immutably."""
    result = deepcopy(normalize_dashboard(data))
    page = result["pages"][0]
    page["items"].append(normalize_item(item))
    return result


def update_item(data: dict[str, Any], item_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Update an item while preserving unknown component options."""
    result = deepcopy(normalize_dashboard(data))
    for page in result["pages"]:
        for item in page.get("items", []):
            if item.get("id") == item_id:
                item.update(patch)
                return result
    return result


def remove_item(data: dict[str, Any], item_id: str) -> dict[str, Any]:
    """Remove an item by id."""
    result = deepcopy(normalize_dashboard(data))
    for page in result["pages"]:
        page["items"] = [i for i in page.get("items", []) if i.get("id") != item_id]
    return result
