"""Core dashboard configuration schema.

Schema version history
----------------------
v2  pages[].items[]                      flat card list, optional free-text
                                         ``section`` string on each card
v3  pages[].sections[].items[]           sections are first-class objects with
                                         their own id/title/icon/accent

v2 documents are migrated to v3 on load (see ``_migrate_page_v2``), so an
existing stored dashboard keeps its cards and its section grouping without
the user having to rebuild anything.
"""
from __future__ import annotations

from typing import Any

SCHEMA_VERSION = 3

DEFAULT_THEME = {
    "mode": "dark", "density": "comfortable", "radius": 16, "gap": 16,
    "surface": "card", "background": None, "accent": "#00e5ff",
    "text": None, "animations": True,
}

# Skeleton shipped on first install. Empty on purpose: the frontend offers a
# one-click "componi automaticamente" that fills these from the real entity
# registry. Shipping the *structure* immediately means the user sees a real
# dashboard tree from the first load instead of a blank canvas.
DEFAULT_SECTIONS: list[dict[str, Any]] = [
    {"id": "sec-sicurezza", "title": "Sicurezza", "icon": "mdi:shield-home",
     "accent": "#ff3d71", "items": []},
    {"id": "sec-energia", "title": "Energia", "icon": "mdi:flash",
     "accent": "#ffd166", "items": []},
    {"id": "sec-clima", "title": "Clima", "icon": "mdi:thermostat",
     "accent": "#00e5ff", "items": []},
    {"id": "sec-illuminazione", "title": "Illuminazione",
     "icon": "mdi:lightbulb-group", "accent": "#c77dff", "items": []},
    {"id": "sec-presenza", "title": "Presenza", "icon": "mdi:account-group",
     "accent": "#06d6a0", "items": []},
    {"id": "sec-sistema", "title": "Sistema", "icon": "mdi:chip",
     "accent": "#8d99ae", "items": []},
]


def default_dashboard() -> dict[str, Any]:
    return {
        "version": SCHEMA_VERSION,
        "revision": 0,
        "pages": [{
            "id": "home",
            "title": "Cyborg",
            "icon": "mdi:hexagon-multiple-outline",
            "layout": {"type": "grid", "columns": 12, "gap": 16},
            "sections": [dict(s, items=[]) for s in DEFAULT_SECTIONS],
        }],
        "theme": dict(DEFAULT_THEME),
    }


def normalize_item(item: dict[str, Any], index: int) -> dict[str, Any]:
    """Normalize one card, preserving unknown/extension fields."""
    result = dict(item)
    result.setdefault("id", f"card-{index + 1}")
    result.setdefault("type", "entity")
    # ``size`` replaced the old x/y/w/h grid coordinates: cards now flow in
    # array order and only declare how wide they are. Manual coordinates were
    # a constant source of overlapping/invisible cards and meant the user had
    # to think in grid maths to move one card.
    result.setdefault("size", "md")
    if not isinstance(result.get("appearance"), dict):
        result["appearance"] = {}
    if not isinstance(result.get("states"), dict):
        result["states"] = {}
    if not isinstance(result.get("actions"), dict):
        result["actions"] = {}
    return result


def normalize_section(section: dict[str, Any], index: int) -> dict[str, Any]:
    result = dict(section)
    result.setdefault("id", f"sec-{index + 1}")
    result.setdefault("title", f"Sezione {index + 1}")
    result.setdefault("icon", "mdi:shape-outline")
    result.setdefault("accent", None)
    result.setdefault("collapsed", False)
    items = result.get("items")
    result["items"] = [
        normalize_item(i, n) for n, i in enumerate(items)
        if isinstance(i, dict)
    ] if isinstance(items, list) else []
    return result


def _migrate_page_v2(page: dict[str, Any]) -> list[dict[str, Any]]:
    """Turn a v2 flat ``items`` list into v3 ``sections``.

    v2 cards carried an optional free-text ``section`` name. Grouping is done
    case-insensitively but the first spelling seen wins as the display title,
    so "energia" and "Energia" collapse into one section rather than two —
    that duplicate-by-typo behaviour was the whole reason for promoting
    sections to real objects with a stable id.
    """
    groups: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for index, item in enumerate(page.get("items") or []):
        if not isinstance(item, dict):
            continue
        raw = str(item.get("section") or "").strip() or "Generale"
        key = raw.lower()
        if key not in groups:
            groups[key] = {
                "id": f"sec-migrated-{len(order) + 1}",
                "title": raw,
                "icon": "mdi:shape-outline",
                "accent": None,
                "collapsed": False,
                "items": [],
            }
            order.append(key)
        card = dict(item)
        card.pop("section", None)
        groups[key]["items"].append(normalize_item(card, index))
    return [groups[k] for k in order]


def normalize_page(page: dict[str, Any], index: int) -> dict[str, Any]:
    result = dict(page)
    result.setdefault("id", f"page-{index + 1}")
    result.setdefault("title", f"Pagina {index + 1}")
    result.setdefault("icon", "mdi:view-dashboard-outline")
    result.setdefault("layout", {"type": "grid", "columns": 12, "gap": 16})

    sections = result.get("sections")
    if not isinstance(sections, list):
        # No sections key at all -> either a v2 page with items, or brand new.
        migrated = _migrate_page_v2(result)
        sections = migrated or [dict(s, items=[]) for s in DEFAULT_SECTIONS]
    result["sections"] = [
        normalize_section(s, n) for n, s in enumerate(sections)
        if isinstance(s, dict)
    ]
    # Drop the legacy flat list once migrated so cards can never render twice.
    result.pop("items", None)
    return result


def normalize_dashboard(data: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize configuration while retaining extension fields."""
    if not isinstance(data, dict):
        return default_dashboard()
    result = default_dashboard()
    result.update(data)
    result["version"] = SCHEMA_VERSION
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
        normalized = [
            normalize_page(p, i) for i, p in enumerate(pages)
            if isinstance(p, dict)
        ]
        result["pages"] = normalized or default_dashboard()["pages"]
    return result
