"""Core dashboard configuration schema.

Schema version history
----------------------
v2  pages[].items[]                      flat card list, optional free-text
                                         ``section`` string on each card
v3  pages[].sections[].items[]           sections are first-class objects with
                                         their own id/title/icon/accent
v4  pages[].type                         a page is either a "sections" page or a
                                         "floorplan" page (3D map with rooms[])
v5  pages[].rooms[].level                a room sits on a storey; the map became
    pages[].rooms[].points               genuinely three-dimensional. Rooms also
    pages[].rooms[].spots                gained a free polygon footprint and a
                                         per-device position inside the room.

v2 documents are migrated to v3 on load (see ``_migrate_page_v2``), so an
existing stored dashboard keeps its cards and its section grouping without
the user having to rebuild anything.
"""
from __future__ import annotations

from typing import Any

SCHEMA_VERSION = 5

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


PAGE_TYPES = ("sections", "floorplan")

# Camera defaults for the CSS-3D isometric view. pitch 56deg / yaw 32deg is the
# classic architectural-render angle: high enough to read the floor layout,
# shallow enough that extruded walls still communicate height.
DEFAULT_VIEW = {"yaw": 32, "pitch": 56, "zoom": 1.0, "wall_height": 62,
                "show_walls": True, "show_labels": True, "level_gap": 150,
                "active_level": None}

# A storey index is deliberately signed and bounded: -3 covers cellars and
# garages below grade, +8 is far past any residential building. Bounding it at
# all matters because ``level`` multiplies the vertical offset in the CSS 3D
# scene, and an unbounded value from a hand-edited store would push a room
# millions of pixels out of the perspective frustum and simply vanish.
MIN_LEVEL, MAX_LEVEL = -3, 8

#: Diagnostic groups the monitor card knows about, and therefore the only ones
#: whose thresholds can be overridden.
MONITOR_GROUP_KEYS = ("voltage", "current", "temperature", "frequency",
                      "power_factor", "battery")

#: What can stand on one side of a room. "open" is a real choice — an archway
#: between kitchen and living room is not a wall — so it has to be storable.
WALL_TYPE_KEYS = ("wall", "glass", "window", "door", "garage", "railing",
                  "stairs", "open")


def normalize_room(room: dict[str, Any], index: int) -> dict[str, Any]:
    """Normalize one floorplan room.

    Geometry is stored in abstract plan units (not pixels): the renderer scales
    the whole world to fit the viewport, so a layout authored on a desktop keeps
    its proportions on a wall-mounted tablet.
    """
    result = dict(room)
    result.setdefault("id", f"room-{index + 1}")
    result.setdefault("area_id", None)
    result.setdefault("title", f"Stanza {index + 1}")
    result.setdefault("icon", "mdi:floor-plan")
    result.setdefault("color", "#00e5ff")
    for key, default in (("x", 0), ("y", 0), ("w", 200), ("h", 160)):
        try:
            result[key] = int(round(float(result.get(key, default))))
        except (TypeError, ValueError):
            result[key] = default
    result["w"] = max(40, result["w"])
    result["h"] = max(40, result["h"])

    # Storey. 0 is the entrance floor; the renderer lifts the room by
    # level * view.level_gap along the vertical axis of the scene.
    try:
        result["level"] = max(MIN_LEVEL, min(MAX_LEVEL, int(float(result.get("level", 0)))))
    except (TypeError, ValueError):
        result["level"] = 0

    result["points"] = _normalize_points(result.get("points"))
    result["spots"] = _normalize_spots(result.get("spots"))

    # Entities the user has explicitly hidden inside this room. Stored as an
    # exclusion list rather than an inclusion one so that a device added to the
    # area later shows up by itself: an inclusion list would silently swallow
    # every new device until somebody remembered to tick it.
    # What stands on each side of the room, one entry per polygon edge. An
    # unknown value becomes a plain wall rather than disappearing: a missing
    # side would silently open the room up.
    walls = result.get("walls")
    result["walls"] = ([w if w in WALL_TYPE_KEYS else "wall" for w in walls][:24]
                       if isinstance(walls, list) else [])

    hidden = result.get("hidden")
    result["hidden"] = ([h for h in hidden if isinstance(h, str) and "." in h][:200]
                        if isinstance(hidden, list) else [])

    # entities: None/"auto" means "derive from the area registry at render time"
    entities = result.get("entities")
    result["entities"] = entities if isinstance(entities, list) else None
    return result


def _normalize_points(points: Any) -> list[list[float]] | None:
    """Validate a polygon footprint.

    Vertices are stored as fractions of the room bounding box (0..1), not as
    plan units. That decoupling is what makes a resize handle work on a
    non-rectangular room: dragging a corner only changes ``w``/``h`` and the
    polygon follows by construction, with no per-vertex rescaling pass that
    could accumulate rounding drift over dozens of gestures.

    ``None`` means "plain rectangle" and is the common case, so it stays the
    cheapest possible representation instead of four redundant vertices.
    """
    if not isinstance(points, list) or len(points) < 3:
        return None
    out: list[list[float]] = []
    for pt in points:
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            continue
        try:
            fx = max(0.0, min(1.0, float(pt[0])))
            fy = max(0.0, min(1.0, float(pt[1])))
        except (TypeError, ValueError):
            continue
        out.append([round(fx, 4), round(fy, 4)])
    if len(out) < 3:
        return None
    return out[:24]


def _normalize_spots(spots: Any) -> dict[str, list[float]]:
    """Per-entity position inside a room, as fractions of its bounding box.

    Only entities the user actually placed are stored; everything else is
    auto-arranged at render time. Storing a position for every entity would
    freeze the layout of devices that come and go from an area.
    """
    if not isinstance(spots, dict):
        return {}
    out: dict[str, list[float]] = {}
    for key, value in spots.items():
        if not isinstance(key, str) or "." not in key:
            continue
        if not isinstance(value, (list, tuple)) or len(value) < 2:
            continue
        try:
            fx = max(0.0, min(1.0, float(value[0])))
            fy = max(0.0, min(1.0, float(value[1])))
        except (TypeError, ValueError):
            continue
        out[key] = [round(fx, 4), round(fy, 4)]
    return out


def normalize_view(view: dict[str, Any] | None) -> dict[str, Any]:
    result = dict(DEFAULT_VIEW)
    if isinstance(view, dict):
        result.update(view)
    try:
        result["yaw"] = float(result["yaw"]) % 360
    except (TypeError, ValueError):
        result["yaw"] = DEFAULT_VIEW["yaw"]
    try:
        result["pitch"] = max(0.0, min(85.0, float(result["pitch"])))
    except (TypeError, ValueError):
        result["pitch"] = DEFAULT_VIEW["pitch"]
    try:
        result["zoom"] = max(0.3, min(3.0, float(result["zoom"])))
    except (TypeError, ValueError):
        result["zoom"] = DEFAULT_VIEW["zoom"]
    try:
        result["wall_height"] = max(0, min(200, int(float(result["wall_height"]))))
    except (TypeError, ValueError):
        result["wall_height"] = DEFAULT_VIEW["wall_height"]
    try:
        result["level_gap"] = max(40, min(400, int(float(result.get("level_gap", 150)))))
    except (TypeError, ValueError):
        result["level_gap"] = DEFAULT_VIEW["level_gap"]
    # active_level: None shows the whole building, an int isolates one storey.
    active = result.get("active_level")
    if active is None or active == "":
        result["active_level"] = None
    else:
        try:
            result["active_level"] = max(MIN_LEVEL, min(MAX_LEVEL, int(float(active))))
        except (TypeError, ValueError):
            result["active_level"] = None
    result["show_walls"] = bool(result.get("show_walls", True))
    result["show_labels"] = bool(result.get("show_labels", True))
    return result


def default_dashboard() -> dict[str, Any]:
    return {
        "version": SCHEMA_VERSION,
        "revision": 0,
        "pages": [{
            "id": "overview",
            "type": "sections",
            "title": "Panoramica",
            "icon": "mdi:view-dashboard-variant",
            "layout": {"type": "grid", "columns": 12, "gap": 16},
            "sections": [],
        }, {
            "id": "home",
            "title": "Cyborg",
            "icon": "mdi:hexagon-multiple-outline",
            "layout": {"type": "grid", "columns": 12, "gap": 16},
            "type": "sections",
            "sections": [dict(s, items=[]) for s in DEFAULT_SECTIONS],
        }, {
            "id": "map",
            "type": "floorplan",
            "title": "Mappa 3D",
            "icon": "mdi:floor-plan",
            "view": dict(DEFAULT_VIEW),
            "rooms": [],
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
    if result.get("type") == "active":
        domains = result.get("domains")
        result["domains"] = [d for d in domains if isinstance(d, str)] if isinstance(domains, list) else []
        try:
            result["max"] = max(3, min(30, int(result.get("max", 8))))
        except (TypeError, ValueError):
            result["max"] = 8
    if result.get("type") == "people":
        people = result.get("people")
        result["people"] = [p for p in people if isinstance(p, str) and p] if isinstance(people, list) else []
    if result.get("type") == "monitor":
        # Per-group threshold overrides. Only known groups and known keys
        # survive; a value that will not parse is dropped so the panel falls
        # back to the standard instead of to no limit at all.
        limits = result.get("limits")
        clean: dict[str, dict[str, float]] = {}
        if isinstance(limits, dict):
            for group, values in limits.items():
                if group not in MONITOR_GROUP_KEYS or not isinstance(values, dict):
                    continue
                row: dict[str, float] = {}
                for key in ("warnLow", "warnHigh", "alarmLow", "alarmHigh"):
                    if key not in values or values[key] in (None, ""):
                        continue
                    try:
                        row[key] = float(values[key])
                    except (TypeError, ValueError):
                        continue
                if row:
                    clean[group] = row
        result["limits"] = clean
    if result.get("type") == "trend":
        series = result.get("series")
        rows: list[dict[str, Any]] = []
        if isinstance(series, list):
            for row in series:
                if not isinstance(row, dict):
                    continue
                entity = row.get("entity")
                if not isinstance(entity, str) or "." not in entity:
                    continue
                rows.append({
                    "entity": entity,
                    "name": str(row.get("name") or "")[:60],
                    "color": str(row.get("color") or "")[:32],
                })
                # Eight lines is already at the edge of what a reader can tell
                # apart; past that the chart stops comparing and starts hiding.
                if len(rows) >= 8:
                    break
        result["series"] = rows
        try:
            result["hours"] = max(1, min(720, int(float(result.get("hours", 24)))))
        except (TypeError, ValueError):
            result["hours"] = 24
        for key in ("y_min", "y_max"):
            try:
                result[key] = float(result[key]) if result.get(key) not in (None, "") else None
            except (TypeError, ValueError):
                result[key] = None
    if result.get("type") == "lights":
        lights = result.get("lights")
        result["lights"] = [x for x in lights if isinstance(x, str) and x] if isinstance(lights, list) else []
        result["group_by_area"] = bool(result.get("group_by_area", True))
    if result.get("type") == "irrigation":
        zones = result.get("zones")
        rows: list[dict[str, Any]] = []
        if isinstance(zones, list):
            for zone in zones:
                if not isinstance(zone, dict):
                    continue
                entity = zone.get("entity")
                if not isinstance(entity, str) or "." not in entity:
                    continue
                try:
                    minutes = max(1, min(720, int(float(zone.get("minutes", 10)))))
                except (TypeError, ValueError):
                    minutes = 10
                moisture = zone.get("moisture")
                rows.append({
                    "entity": entity,
                    "name": str(zone.get("name") or "")[:80],
                    "icon": str(zone.get("icon") or "")[:64],
                    "minutes": minutes,
                    "moisture": moisture if isinstance(moisture, str) and moisture else None,
                })
                if len(rows) >= 24:
                    break
        result["zones"] = rows
        rain = result.get("rain_sensor")
        result["rain_sensor"] = rain if isinstance(rain, str) and rain else None
        presets = result.get("presets")
        clean_presets: list[int] = []
        if isinstance(presets, list):
            for value in presets:
                try:
                    clean_presets.append(max(1, min(720, int(float(value)))))
                except (TypeError, ValueError):
                    continue
        result["presets"] = clean_presets[:6]
    if result.get("type") == "camera":
        # Live thumbnails: an MJPEG stream per tile instead of a still refreshed
        # on a timer. Off by default because eight simultaneous streams saturate
        # a wall tablet, but on a card with one or two cameras it removes the
        # refresh delay entirely.
        result["live"] = bool(result.get("live", False))
    if result.get("type") == "notifications":
        result["show_updates"] = bool(result.get("show_updates", True))
        # Messages Cyborg saw leave the house (Telegram and the rest). Default
        # on: an install whose alarms all go to Telegram would otherwise show
        # an empty alerts card, which is exactly the complaint this answers.
        result["show_sent"] = bool(result.get("show_sent", True))
        try:
            result["max"] = max(3, min(60, int(result.get("max", 8))))
        except (TypeError, ValueError):
            result["max"] = 8
    if result.get("type") == "economy":
        # Per-device detail. Each row is one long-term statistic in kWh, the
        # same object the Home Assistant energy dashboard calls an "individual
        # device", so the list can be filled straight from energy/get_prefs
        # instead of asking the user to find twelve sensors by hand.
        devices = result.get("devices")
        rows: list[dict[str, Any]] = []
        if isinstance(devices, list):
            for dev in devices:
                if not isinstance(dev, dict):
                    continue
                entity = dev.get("entity")
                if not isinstance(entity, str) or not entity:
                    continue
                rows.append({
                    "entity": entity,
                    "name": str(dev.get("name") or "")[:80],
                    "icon": str(dev.get("icon") or "")[:64],
                    # "load" spends money, "source" produces it. A battery or a
                    # second string is not a consumer and must not be billed.
                    "kind": "source" if dev.get("kind") == "source" else "load",
                    # A load measured downstream of another meter — the fridge
                    # on a kitchen socket strip — must declare its parent, or
                    # its kWh are billed twice: once in its own row and once
                    # inside the parent's. Home Assistant models the same
                    # relation as included_in_stat.
                    "parent": (dev.get("parent")
                               if isinstance(dev.get("parent"), str) and dev.get("parent") else None),
                })
                if len(rows) >= 24:
                    break
        # Drop parents that point outside the list or form a cycle: a dangling
        # parent would silently exclude a row from every total, and a cycle
        # would make the nesting walk never terminate.
        known = {r["entity"] for r in rows}
        for row in rows:
            if row["parent"] not in known or row["parent"] == row["entity"]:
                row["parent"] = None
        by_entity = {r["entity"]: r for r in rows}
        for row in rows:
            seen = {row["entity"]}
            node = row
            while node["parent"]:
                if node["parent"] in seen:
                    node["parent"] = None
                    break
                seen.add(node["parent"])
                node = by_entity[node["parent"]]
        result["devices"] = rows
        for key in ("grid_import", "grid_export", "solar"):
            value = result.get(key)
            result[key] = value if isinstance(value, str) and value else None
        for key, default in (("price_import", 0.25), ("price_export", 0.10)):
            try:
                result[key] = max(0.0, round(float(result.get(key, default)), 4))
            except (TypeError, ValueError):
                result[key] = default
        period = result.get("period")
        result["period"] = period if period in ("today", "week", "month", "year") else "month"
    if result.get("type") == "camera":
        cams = result.get("cameras")
        result["cameras"] = [c for c in cams if isinstance(c, str) and c] if isinstance(cams, list) else []
        try:
            result["refresh"] = max(5, min(120, int(result.get("refresh", 10))))
        except (TypeError, ValueError):
            result["refresh"] = 10
    if result.get("type") == "monitor":
        groups = result.get("groups")
        result["groups"] = [g for g in groups if isinstance(g, str)] if isinstance(groups, list) else []
        grid = result.get("grid_entity")
        result["grid_entity"] = grid if isinstance(grid, str) and grid else None
        try:
            result["limit_w"] = max(500, min(100000, int(float(result.get("limit_w", 3300)))))
        except (TypeError, ValueError):
            result["limit_w"] = 3300
        try:
            result["max_per_group"] = max(3, min(30, int(result.get("max_per_group", 8))))
        except (TypeError, ValueError):
            result["max_per_group"] = 8
    if result.get("type") == "energyflow":
        flow = result.get("flow")
        flow = dict(flow) if isinstance(flow, dict) else {}
        for slot in ("grid", "solar", "battery", "home"):
            value = flow.get(slot)
            flow[slot] = value if isinstance(value, str) and value else None
        for slot in ("grid", "solar", "battery"):
            flow["invert_" + slot] = bool(flow.get("invert_" + slot))
        devices = flow.get("devices")
        flow["devices"] = [
            {"entity": d["entity"],
             "name": str(d.get("name") or ""),
             "icon": str(d.get("icon") or ""),
             # a load nested inside another is already counted by its parent
             "parent": d["parent"] if isinstance(d.get("parent"), str) and d["parent"] else None}
            for d in devices
            if isinstance(d, dict) and isinstance(d.get("entity"), str) and d["entity"]
        ][:8] if isinstance(devices, list) else []
        result["flow"] = flow
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
        normalize_item(i, n)
        for n, i in enumerate(x for x in items if isinstance(x, dict))
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

    # v3 pages carry no "type"; they are all sections pages by definition.
    page_type = result.get("type")
    result["type"] = page_type if page_type in PAGE_TYPES else "sections"

    if result["type"] == "floorplan":
        result["view"] = normalize_view(result.get("view"))
        rooms = result.get("rooms")
        result["rooms"] = [
            normalize_room(r, n)
            for n, r in enumerate(x for x in rooms if isinstance(x, dict))
        ] if isinstance(rooms, list) else []
        # A floorplan page has no card sections; drop them so the two page
        # types can never both render on the same page.
        result.pop("sections", None)
        result.pop("items", None)
        return result

    result.pop("view", None)
    result.pop("rooms", None)
    sections = result.get("sections")
    if not isinstance(sections, list):
        # No sections key at all -> either a v2 page with items, or brand new.
        migrated = _migrate_page_v2(result)
        sections = migrated or [dict(s, items=[]) for s in DEFAULT_SECTIONS]
    result["sections"] = [
        normalize_section(sec, n)
        for n, sec in enumerate(x for x in sections if isinstance(x, dict))
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
            normalize_page(pg, i)
            for i, pg in enumerate(x for x in pages if isinstance(x, dict))
        ]
        result["pages"] = normalized or default_dashboard()["pages"]

    # A dashboard saved before the 3D map existed keeps only the pages it was
    # stored with: ``result.update(data)`` replaces the whole page list, so
    # every page added to the defaults since then never reaches an existing
    # install. Appending the missing map page is additive, touches nothing the
    # user configured, and without it the feature stays unreachable.
    if not any(p.get("type") == "floorplan" for p in result["pages"]):
        result["pages"].append(normalize_page({
            "id": "map",
            "type": "floorplan",
            "title": "Mappa 3D",
            "icon": "mdi:floor-plan",
            "view": dict(DEFAULT_VIEW),
            "rooms": [],
        }, len(result["pages"])))
    return result
