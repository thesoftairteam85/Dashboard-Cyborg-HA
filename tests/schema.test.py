"""Schema/migration tests. Run: python3 tests/schema.test.py"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "custom_components", "cyborg_dashboard", "core"))
import schema

d = schema.default_dashboard()
assert d["version"] == 4 and len(d["pages"][1]["sections"]) == 6

v2 = {"version": 2, "revision": 7, "pages": [{"id": "home", "items": [
    {"id": "c1", "entity_id": "alarm_control_panel.allarme", "section": "Sicurezza"},
    {"id": "c2", "entity_id": "sensor.a_potenza", "section": "energia"},
    {"id": "c3", "entity_id": "sensor.b_potenza", "section": "Energia"},
    {"id": "c4", "entity_id": "event.backup"}]}]}
m = schema.normalize_dashboard(v2)
secs = m["pages"][0]["sections"]
assert m["version"] == 4 and m["revision"] == 7
assert len(secs) == 3 and len(secs[1]["items"]) == 2, "case-insensitive merge"
assert secs[2]["title"] == "Generale"
assert "items" not in m["pages"][0], "legacy items must be dropped"
assert schema.normalize_dashboard(m) == m, "normalize must be idempotent"
for bad in [None, [], "x", {"pages": "no"}, {"pages": [{"sections": [None, 5, {"title": "A"}]}]}]:
    assert isinstance(schema.normalize_dashboard(bad)["pages"][0]["sections"], list)
assert schema.normalize_dashboard({"revision": "abc"})["revision"] == 0
print("schema: all tests passed")

# ---- v4: floorplan pages ---------------------------------------------------
d = schema.default_dashboard()
assert d["version"] == 4
assert [p["type"] for p in d["pages"]] == ["sections", "sections", "floorplan"]
assert [p["id"] for p in d["pages"]] == ["overview", "home", "map"]
assert d["pages"][0]["sections"] == [], "la panoramica parte vuota, si compone in un click"
assert d["pages"][2]["view"]["pitch"] == 56 and d["pages"][2]["rooms"] == []

# a v3 page (no "type") must become a sections page and keep its cards
v3 = {"version": 3, "pages": [{"id": "home", "sections": [
    {"id": "s", "title": "X", "items": [{"id": "c", "entity_id": "light.a"}]}]}]}
r = schema.normalize_dashboard(v3)
assert r["version"] == 4
assert r["pages"][0]["type"] == "sections"
assert r["pages"][0]["sections"][0]["items"][0]["entity_id"] == "light.a"
assert "rooms" not in r["pages"][0] and "view" not in r["pages"][0]

# floorplan page normalization + clamping of hostile values
fp = {"pages": [{"id": "m", "type": "floorplan",
                 "view": {"yaw": 400, "pitch": 999, "zoom": -5, "wall_height": "abc"},
                 "rooms": [{"id": "r1", "x": "12.7", "y": 3, "w": 5, "h": "nope"},
                           "garbage", None, {"title": "Bagno"}]}]}
r = schema.normalize_dashboard(fp)
pg = r["pages"][0]
assert pg["type"] == "floorplan"
assert pg["view"]["yaw"] == 40, pg["view"]["yaw"]          # 400 % 360
assert pg["view"]["pitch"] == 85                            # clamped
assert pg["view"]["zoom"] == 0.3                            # clamped
assert pg["view"]["wall_height"] == 62                      # bad -> default
assert len(pg["rooms"]) == 2, pg["rooms"]                   # garbage dropped
assert pg["rooms"][0]["x"] == 13 and pg["rooms"][0]["w"] == 40  # rounded + min
assert pg["rooms"][0]["h"] == 160                           # bad -> default
assert pg["rooms"][1]["id"] == "room-2"
assert "sections" not in pg, "floorplan page must not keep sections"
assert schema.normalize_dashboard(r) == r, "v4 normalize must be idempotent"

# unknown page type falls back to sections rather than rendering nothing
assert schema.normalize_dashboard({"pages": [{"type": "wat"}]})["pages"][0]["type"] == "sections"
print("schema v4: all tests passed")

# ---- energyflow card -------------------------------------------------------
d = schema.normalize_dashboard({"pages": [{"sections": [{"items": [
    {"id": "f", "type": "energyflow", "flow": {
        "grid": "sensor.g", "solar": "", "battery": None, "invert_grid": "yes",
        "devices": [{"entity": "sensor.a", "name": "A"}, {"entity": ""}, "junk",
                    {"name": "no entity"}] + [{"entity": "sensor.x%d" % i} for i in range(12)]}},
    {"id": "n", "type": "sensor", "entity_id": "sensor.z"}]}]}]})
f = d["pages"][0]["sections"][0]["items"][0]["flow"]
assert f["grid"] == "sensor.g" and f["solar"] is None and f["battery"] is None
assert f["invert_grid"] is True and f["invert_solar"] is False
assert len(f["devices"]) == 8, len(f["devices"])
assert f["devices"][0] == {"entity": "sensor.a", "name": "A", "icon": "", "parent": None}
assert all(x["entity"] for x in f["devices"])
assert "flow" not in d["pages"][0]["sections"][0]["items"][1], "non-flow card must not gain a flow key"
assert schema.normalize_dashboard(d) == d, "energyflow normalize must be idempotent"

# ---- composite overview cards ---------------------------------------------
d = schema.normalize_dashboard({"pages": [{"sections": [{"items": [
    {"id": "a", "type": "active", "domains": ["light", 5, None, "switch"], "max": "99"},
    {"id": "b", "type": "active", "max": "boh"},
    {"id": "p", "type": "people", "people": ["person.x", 7, ""]},
    {"id": "n", "type": "notifications"},
    {"id": "n2", "type": "notifications", "show_updates": 0},
    {"id": "s", "type": "sensor", "entity_id": "sensor.z"}]}]}]})
it = {c["id"]: c for c in d["pages"][0]["sections"][0]["items"]}
assert it["a"]["domains"] == ["light", "switch"], it["a"]["domains"]
assert it["a"]["max"] == 30, it["a"]["max"]          # clamped
assert it["b"]["max"] == 8                            # bad -> default
assert it["p"]["people"] == ["person.x"]
assert it["n"]["show_updates"] is True
assert it["n2"]["show_updates"] is False
assert "domains" not in it["s"] and "people" not in it["s"], "una card sensore non deve ereditare campi compositi"
assert schema.normalize_dashboard(d) == d, "composite normalize must be idempotent"
print("composite schema: all tests passed")

# load hierarchy
d = schema.normalize_dashboard({"pages": [{"sections": [{"items": [
    {"id": "f", "type": "energyflow", "flow": {"devices": [
        {"entity": "sensor.quadro"},
        {"entity": "sensor.forno", "parent": "sensor.quadro"},
        {"entity": "sensor.piano", "parent": ""},
        {"entity": "sensor.altro", "parent": 42}]}}]}]}]})
devs = d["pages"][0]["sections"][0]["items"][0]["flow"]["devices"]
assert devs[0]["parent"] is None
assert devs[1]["parent"] == "sensor.quadro"
assert devs[2]["parent"] is None, "stringa vuota -> nessun genitore"
assert devs[3]["parent"] is None, "tipo sbagliato -> nessun genitore"
assert schema.normalize_dashboard(d) == d
print("hierarchy schema: all tests passed")
print("energyflow schema: all tests passed")
