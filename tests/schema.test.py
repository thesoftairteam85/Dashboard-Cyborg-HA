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

# ---- monitor card ----------------------------------------------------------
d = schema.normalize_dashboard({"pages": [{"sections": [{"items": [
    {"id": "m", "type": "monitor", "limit_w": "6000", "groups": ["voltage", 3, "current"],
     "grid_entity": "", "max_per_group": "99"},
    {"id": "m2", "type": "monitor", "limit_w": "boh"},
    {"id": "s", "type": "sensor", "entity_id": "sensor.z"}]}]}]})
it = {c["id"]: c for c in d["pages"][0]["sections"][0]["items"]}
assert it["m"]["limit_w"] == 6000
assert it["m"]["groups"] == ["voltage", "current"]
assert it["m"]["grid_entity"] is None, "stringa vuota -> non collegato"
assert it["m"]["max_per_group"] == 30, "clamp"
assert it["m2"]["limit_w"] == 3300, "valore non numerico -> default"
assert "limit_w" not in it["s"], "una card sensore non deve ereditare campi del monitoraggio"
assert schema.normalize_dashboard(d) == d
print("monitor schema: all tests passed")

# ---- camera card -----------------------------------------------------------
d = schema.normalize_dashboard({"pages": [{"sections": [{"items": [
    {"id": "c", "type": "camera", "cameras": ["camera.a", 5, "", "camera.b"], "refresh": "999"},
    {"id": "c2", "type": "camera", "refresh": "boh"},
    {"id": "s", "type": "sensor", "entity_id": "sensor.z"}]}]}]})
it = {c["id"]: c for c in d["pages"][0]["sections"][0]["items"]}
assert it["c"]["cameras"] == ["camera.a", "camera.b"]
assert it["c"]["refresh"] == 120, "clamp"
assert it["c2"]["refresh"] == 10, "default"
assert "cameras" not in it["s"]
assert schema.normalize_dashboard(d) == d
print("camera schema: all tests passed")

# ---- economy card ----------------------------------------------------------
d = schema.normalize_dashboard({"pages": [{"sections": [{"items": [
    {"id": "e", "type": "economy", "grid_import": "sensor.imp", "grid_export": "",
     "price_import": "0.2456", "price_export": -3, "period": "decade"},
    {"id": "e2", "type": "economy", "price_import": "boh"},
    {"id": "s", "type": "sensor", "entity_id": "sensor.z"}]}]}]})
it = {c["id"]: c for c in d["pages"][0]["sections"][0]["items"]}
assert it["e"]["grid_import"] == "sensor.imp"
assert it["e"]["grid_export"] is None, "stringa vuota -> non collegato"
assert it["e"]["solar"] is None
assert it["e"]["price_import"] == 0.2456
assert it["e"]["price_export"] == 0.0, "prezzo negativo azzerato"
assert it["e"]["period"] == "month", "periodo sconosciuto -> default"
assert it["e2"]["price_import"] == 0.25
assert "price_import" not in it["s"]
assert schema.normalize_dashboard(d) == d
print("economy schema: all tests passed")

# ---- an existing dashboard must gain the 3D map page -----------------------
old_install = {"version": 3, "revision": 12, "pages": [
    {"id": "home", "title": "Cyborg", "icon": "mdi:x", "sections": [
        {"id": "s1", "title": "Energia", "items": [{"id": "c1", "entity_id": "sensor.a"}]}]}]}
m = schema.normalize_dashboard(old_install)
assert len(m["pages"]) == 2, [p["id"] for p in m["pages"]]
assert m["pages"][0]["id"] == "home", "la pagina esistente resta la prima"
assert m["pages"][0]["sections"][0]["items"][0]["entity_id"] == "sensor.a", "contenuto intatto"
assert m["pages"][1]["type"] == "floorplan" and m["pages"][1]["rooms"] == []
assert m["revision"] == 12, "la revisione non viene toccata"
assert schema.normalize_dashboard(m) == m, "non deve aggiungere una seconda mappa"
assert len([p for p in schema.normalize_dashboard(m)["pages"] if p["type"] == "floorplan"]) == 1
print("map-page backfill: all tests passed")
