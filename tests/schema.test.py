"""Schema/migration tests. Run: python3 tests/schema.test.py"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "custom_components", "cyborg_dashboard", "core"))
import schema

d = schema.default_dashboard()
assert d["version"] == 9 and len(d["pages"][1]["sections"]) == 6

v2 = {"version": 2, "revision": 7, "pages": [{"id": "home", "items": [
    {"id": "c1", "entity_id": "alarm_control_panel.allarme", "section": "Sicurezza"},
    {"id": "c2", "entity_id": "sensor.a_potenza", "section": "energia"},
    {"id": "c3", "entity_id": "sensor.b_potenza", "section": "Energia"},
    {"id": "c4", "entity_id": "event.backup"}]}]}
m = schema.normalize_dashboard(v2)
secs = m["pages"][0]["sections"]
assert m["version"] == 9 and m["revision"] == 7
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
assert d["version"] == 9
assert [p["type"] for p in d["pages"]] == ["sections", "sections", "floorplan"]
assert [p["id"] for p in d["pages"]] == ["overview", "home", "map"]
assert d["pages"][0]["sections"] == [], "la panoramica parte vuota, si compone in un click"
assert d["pages"][2]["view"]["pitch"] == 56 and d["pages"][2]["rooms"] == []

# a v3 page (no "type") must become a sections page and keep its cards
v3 = {"version": 3, "pages": [{"id": "home", "sections": [
    {"id": "s", "title": "X", "items": [{"id": "c", "entity_id": "light.a"}]}]}]}
r = schema.normalize_dashboard(v3)
assert r["version"] == 9
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

# ---- v5: storeys, polygon footprints, device spots -------------------------

# a v4 room survives untouched and gains the new fields with safe defaults
v4room = schema.normalize_room({"id": "r1", "title": "Cucina", "x": 10, "y": 20, "w": 200, "h": 160}, 0)
assert v4room["level"] == 0
assert v4room["points"] is None, "a plain room must stay a cheap rectangle"
assert v4room["spots"] == {}
assert v4room["x"] == 10 and v4room["w"] == 200, "existing geometry must not move"

# storey is clamped both ways: it multiplies a vertical offset in the 3D scene
assert schema.normalize_room({"level": 99}, 0)["level"] == 8
assert schema.normalize_room({"level": -99}, 0)["level"] == -3
assert schema.normalize_room({"level": "2"}, 0)["level"] == 2
assert schema.normalize_room({"level": 1.9}, 0)["level"] == 1
assert schema.normalize_room({"level": "primo"}, 0)["level"] == 0
assert schema.normalize_room({"level": None}, 0)["level"] == 0

# polygon footprint
lshape = [[0, 0], [1, 0], [1, 0.5], [0.5, 0.5], [0.5, 1], [0, 1]]
r = schema.normalize_room({"points": lshape}, 0)
assert r["points"] == [[float(a), float(b)] for a, b in lshape]
assert schema.normalize_room({"points": [[0, 0], [1, 0]]}, 0)["points"] is None, "under 3 vertices is not a polygon"
assert schema.normalize_room({"points": "triangolo"}, 0)["points"] is None
assert schema.normalize_room({"points": [[0, 0], [1, 0], [1, 1], "x", [None, 2]]}, 0)["points"] == [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]]
# out-of-box vertices are clamped, never dropped: dropping one would silently
# change the shape, clamping keeps the vertex count the editor is showing
assert schema.normalize_room({"points": [[-3, 0], [1, 0], [1, 9]]}, 0)["points"] == [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]]
assert len(schema.normalize_room({"points": [[0, 0]] * 40}, 0)["points"]) == 24

# spots
r = schema.normalize_room({"spots": {"light.cucina": [0.25, 0.75], "nonsense": [0, 0],
                                     "light.bad": "x", "light.short": [1]}}, 0)
assert r["spots"] == {"light.cucina": [0.25, 0.75]}, r["spots"]
assert schema.normalize_room({"spots": {"light.a": [5, -5]}}, 0)["spots"] == {"light.a": [1.0, 0.0]}
assert schema.normalize_room({"spots": []}, 0)["spots"] == {}

# view: distance between storeys and the isolate-one-storey filter
v = schema.normalize_view({})
assert v["level_gap"] == 150 and v["active_level"] is None
assert schema.normalize_view({"level_gap": 9999})["level_gap"] == 400
assert schema.normalize_view({"level_gap": 1})["level_gap"] == 40
assert schema.normalize_view({"level_gap": "sopra"})["level_gap"] == 150
assert schema.normalize_view({"active_level": 2})["active_level"] == 2
assert schema.normalize_view({"active_level": 77})["active_level"] == 8
assert schema.normalize_view({"active_level": "tutti"})["active_level"] is None
assert schema.normalize_view({"active_level": ""})["active_level"] is None

# a stored v4 dashboard gains the new room fields without losing its map
stored = {"version": 4, "revision": 12, "pages": [
    {"id": "map", "type": "floorplan", "title": "Mappa 3D",
     "view": {"yaw": 32, "pitch": 56, "zoom": 1.0, "wall_height": 62,
              "show_walls": True, "show_labels": True},
     "rooms": [{"id": "room-1", "title": "Salotto", "x": 0, "y": 0, "w": 230, "h": 180,
                "area_id": "salotto", "entities": None}]}]}
mig = schema.normalize_dashboard(stored)
room = mig["pages"][0]["rooms"][0]
assert mig["version"] == 9 and mig["revision"] == 12
assert room["title"] == "Salotto" and room["area_id"] == "salotto" and room["w"] == 230
assert room["level"] == 0 and room["points"] is None and room["spots"] == {}
assert mig["pages"][0]["view"]["level_gap"] == 150
assert schema.normalize_dashboard(mig) == mig, "v5 normalization must be idempotent"

# a multi-storey plan round-trips exactly
multi = {"version": 5, "pages": [{"id": "m", "type": "floorplan",
    "view": {"level_gap": 180, "active_level": 1},
    "rooms": [{"id": "a", "level": 0, "w": 200, "h": 200},
              {"id": "b", "level": 1, "w": 200, "h": 200, "points": lshape,
               "spots": {"light.b": [0.3, 0.4]}},
              {"id": "c", "level": -1, "w": 200, "h": 200}]}]}
rt = schema.normalize_dashboard(multi)
assert [r["level"] for r in rt["pages"][0]["rooms"]] == [0, 1, -1]
assert rt["pages"][0]["rooms"][1]["spots"]["light.b"] == [0.3, 0.4]
assert rt["pages"][0]["view"]["active_level"] == 1
assert schema.normalize_dashboard(rt) == rt


# ---- economy per-device rows + notification log ----------------------------

eco = schema.normalize_item({"type": "economy", "devices": [
    {"entity": "sensor.lavatrice", "name": "Lavatrice"},
    {"entity": "sensor.pv2", "kind": "source"},
    {"entity": "sensor.brutto", "kind": "chissa"},
    {"name": "senza entita"},
    "non un dizionario",
    {"entity": 42},
]}, 0)
assert [d["entity"] for d in eco["devices"]] == ["sensor.lavatrice", "sensor.pv2", "sensor.brutto"]
assert eco["devices"][0]["kind"] == "load", "il default e' un carico, non una sorgente"
assert eco["devices"][1]["kind"] == "source"
assert eco["devices"][2]["kind"] == "load", "un kind sconosciuto non deve diventare sorgente"
assert eco["devices"][0]["name"] == "Lavatrice" and eco["devices"][1]["name"] == ""
assert schema.normalize_item({"type": "economy"}, 0)["devices"] == []
assert schema.normalize_item({"type": "economy", "devices": "tutti"}, 0)["devices"] == []
# 24 righe e' il tetto: una lista arbitrariamente lunga diventa una query
# statistiche arbitrariamente lunga a ogni ridisegno
assert len(schema.normalize_item(
    {"type": "economy", "devices": [{"entity": f"sensor.d{i}"} for i in range(80)]}, 0)["devices"]) == 24
assert schema.normalize_item({"type": "economy", "devices": [
    {"entity": "sensor.x", "name": "n" * 500, "icon": "i" * 500}]}, 0)["devices"][0]["name"] == "n" * 80

nt = schema.normalize_item({"type": "notifications"}, 0)
assert nt["show_sent"] is True and nt["show_updates"] is True and nt["max"] == 8
assert schema.normalize_item({"type": "notifications", "show_sent": False}, 0)["show_sent"] is False
assert schema.normalize_item({"type": "notifications", "max": 999}, 0)["max"] == 60
assert schema.normalize_item({"type": "notifications", "max": "tutti"}, 0)["max"] == 8

# a stored card from before the breakdown existed keeps everything it had
old_eco = {"id": "e1", "type": "economy", "entity_id": "", "grid_import": "sensor.rete",
           "price_import": 0.31, "period": "year"}
mig_eco = schema.normalize_item(old_eco, 0)
assert mig_eco["grid_import"] == "sensor.rete" and mig_eco["price_import"] == 0.31
assert mig_eco["period"] == "year" and mig_eco["devices"] == []
assert schema.normalize_item(mig_eco, 0) == mig_eco

print("schema: tutti i test passati")

# ---- monitor thresholds + trend series -------------------------------------

mon = schema.normalize_item({"type": "monitor", "limits": {
    "voltage": {"warnLow": 210, "warnHigh": "250"},
    "temperature": {"warnHigh": "caldo", "alarmHigh": 95},
    "inventato": {"warnHigh": 1},
    "current": {"nonEsiste": 5},
    "battery": "tutta",
}}, 0)
assert mon["limits"]["voltage"] == {"warnLow": 210.0, "warnHigh": 250.0}
assert mon["limits"]["temperature"] == {"alarmHigh": 95.0}, mon["limits"]["temperature"]
assert "inventato" not in mon["limits"], "un gruppo sconosciuto non deve entrare"
assert "current" not in mon["limits"], "una chiave sconosciuta non lascia un gruppo vuoto"
assert "battery" not in mon["limits"]
assert schema.normalize_item({"type": "monitor"}, 0)["limits"] == {}
assert schema.normalize_item({"type": "monitor", "limits": "boh"}, 0)["limits"] == {}
assert schema.normalize_item(mon, 0) == mon

tr = schema.normalize_item({"type": "trend", "hours": 168, "series": [
    {"entity": "sensor.est", "name": "Esterna", "color": "#00e5ff"},
    {"entity": "sensor.bagno"},
    {"nome": "senza entita"},
    "spazzatura",
]}, 0)
assert [r["entity"] for r in tr["series"]] == ["sensor.est", "sensor.bagno"]
assert tr["series"][1]["name"] == "" and tr["series"][1]["color"] == ""
assert tr["hours"] == 168
assert schema.normalize_item({"type": "trend", "hours": 9999}, 0)["hours"] == 720
assert schema.normalize_item({"type": "trend", "hours": "sempre"}, 0)["hours"] == 24
assert schema.normalize_item({"type": "trend"}, 0)["series"] == []
# twelve lines is the hard ceiling on one cartesian plane
assert len(schema.normalize_item({"type": "trend", "series": [
    {"entity": f"sensor.s{i}"} for i in range(30)]}, 0)["series"]) == 12
# where the lines come from: a snapshot, the discovered rooms, or a whole class
assert schema.normalize_item({"type": "trend"}, 0)["source"] == "manual"
assert schema.normalize_item({"type": "trend", "source": "comfort"}, 0)["source"] == "comfort"
assert schema.normalize_item({"type": "trend", "source": "class"}, 0)["source"] == "class"
# an unknown source must not silently disable the card
assert schema.normalize_item({"type": "trend", "source": "boh"}, 0)["source"] == "manual"
assert schema.normalize_item({"type": "trend"}, 0)["device_class"] == "temperature"
assert schema.normalize_item({"type": "trend", "device_class": "humidity"}, 0)["device_class"] == "humidity"
assert schema.normalize_item({"type": "trend"}, 0)["max_series"] == 8
assert schema.normalize_item({"type": "trend", "max_series": 99}, 0)["max_series"] == 12
assert schema.normalize_item({"type": "trend", "max_series": 0}, 0)["max_series"] == 1
assert schema.normalize_item({"type": "trend", "max_series": "sei"}, 0)["max_series"] == 8
assert schema.normalize_item({"type": "trend", "y_min": "auto"}, 0)["y_min"] is None
assert schema.normalize_item({"type": "trend", "y_min": "12.5"}, 0)["y_min"] == 12.5
assert schema.normalize_item(tr, 0) == tr

# irrigation + lights
irr = schema.normalize_item({"type": "irrigation", "zones": [
    {"entity": "valve.prato", "minutes": 900},
    {"entity": "switch.orto", "moisture": "sensor.terreno"},
    {"entity": "non-un-entity"},
], "presets": [5, "dieci", 20], "rain_sensor": ""}, 0)
assert [z["entity"] for z in irr["zones"]] == ["valve.prato", "switch.orto"]
assert irr["zones"][0]["minutes"] == 720, "una durata assurda viene limitata"
assert irr["zones"][1]["moisture"] == "sensor.terreno"
assert irr["zones"][0]["moisture"] is None
assert irr["presets"] == [5, 20]
assert irr["rain_sensor"] is None
assert schema.normalize_item(irr, 0) == irr

lig = schema.normalize_item({"type": "lights", "lights": ["light.a", 7, ""]}, 0)
assert lig["lights"] == ["light.a"] and lig["group_by_area"] is True
assert schema.normalize_item({"type": "lights", "group_by_area": False}, 0)["group_by_area"] is False

# room visibility list
rv = schema.normalize_room({"hidden": ["sensor.x", "rotto", 5]}, 0)
assert rv["hidden"] == ["sensor.x"]
assert schema.normalize_room({}, 0)["hidden"] == []

print("schema: soglie, andamenti, irrigazione e visibilita' ok")

# ---- v6: auto elettriche ----------------------------------------------------

d6 = schema.normalize_dashboard({"vehicles": [
    {"id": "ev1", "name": "Model 3", "battery": "sensor.soc", "power": "sensor.wb",
     "capacity": 60, "charging": "binary_sensor.ch"},
    {"id": "ev1", "name": "Doppione", "battery": "sensor.soc2"},
    {"name": "Senza entita"},
    {"id": "ev3", "power": "non-un-entity"},
    "spazzatura",
]})
assert [v["id"] for v in d6["vehicles"]] == ["ev1", "ev1-2"], [v["id"] for v in d6["vehicles"]]
assert d6["vehicles"][0]["capacity"] == 60.0
assert d6["vehicles"][0]["charging"] == "binary_sensor.ch"
assert d6["vehicles"][0]["range"] is None
assert d6["version"] == 9
# a vehicle with no entity at all would be a name and nothing else
assert all(v["name"] != "Senza entita" for v in d6["vehicles"])
assert all(v["name"] != "" for v in d6["vehicles"])
assert schema.normalize_dashboard({})["vehicles"] == []
assert schema.normalize_dashboard({"vehicles": "una"})["vehicles"] == []
assert schema.normalize_dashboard(d6) == d6, "v6 idempotente"

# capacity out of range is dropped, not clamped: a wrong number would produce a
# confident and wrong charging estimate
assert schema.normalize_vehicle({"id": "x", "power": "sensor.p", "capacity": 9000}, 0)["capacity"] is None
assert schema.normalize_vehicle({"id": "x", "power": "sensor.p", "capacity": -5}, 0)["capacity"] is None
assert schema.normalize_vehicle({"id": "x", "power": "sensor.p", "capacity": "grande"}, 0)["capacity"] is None
assert schema.normalize_vehicle({"id": "x", "power": "sensor.p", "capacity": 77.5}, 0)["capacity"] == 77.5
assert schema.normalize_vehicle("no", 0) is None
assert len(schema.normalize_dashboard({"vehicles": [
    {"id": f"e{i}", "power": "sensor.p"} for i in range(30)]})["vehicles"]) == 8

# rooms and cards reference vehicles by id
r6 = schema.normalize_room({"vehicles": ["ev1", 5, "", "ev2"]}, 0)
assert r6["vehicles"] == ["ev1", "ev2"]
assert schema.normalize_room({}, 0)["vehicles"] == []
evc = schema.normalize_item({"type": "ev", "vehicles": ["ev1"]}, 0)
assert evc["vehicles"] == ["ev1"] and evc["show_controls"] is True
assert schema.normalize_item({"type": "ev"}, 0)["vehicles"] == []
assert schema.normalize_item({"type": "ev", "show_controls": False}, 0)["show_controls"] is False

# the energy flow opts in by default
ef = schema.normalize_item({"type": "energyflow", "flow": {"grid": "sensor.g"}}, 0)
assert ef["flow"]["show_vehicles"] is True
assert schema.normalize_item({"type": "energyflow", "flow": {"show_vehicles": False}}, 0)["flow"]["show_vehicles"] is False

# a v5 dashboard gains the key without losing anything
old5 = {"version": 5, "revision": 3, "pages": [
    {"id": "h", "type": "sections", "title": "Cyborg", "sections": [
        {"id": "s", "title": "Energia", "icon": "mdi:flash", "accent": "#ffd166",
         "items": [{"id": "c", "type": "energyflow", "entity_id": "", "flow": {"grid": "sensor.g"}}]}]}]}
m6 = schema.normalize_dashboard(old5)
assert m6["version"] == 9 and m6["revision"] == 3 and m6["vehicles"] == []
assert m6["pages"][0]["sections"][0]["items"][0]["flow"]["grid"] == "sensor.g"
assert schema.normalize_dashboard(m6) == m6

print("schema: auto elettriche ok")

# The defaults must survive their own normalizer unchanged: the first save of a
# fresh install used to write a document that differed from what the next load
# produced, which looks like a phantom edit to anything watching revisions.
fresh = schema.normalize_dashboard(None)
assert schema.normalize_dashboard(fresh) == fresh, "il dashboard di fabbrica deve essere idempotente"
assert all("collapsed" in sec for pg in fresh["pages"] for sec in pg.get("sections", []))
assert all(pg.get("layout") for pg in fresh["pages"])
assert schema.normalize_dashboard({"pages": []}) == fresh
assert schema.normalize_dashboard({"pages": "no"}) == fresh

print("schema: valori di fabbrica idempotenti")

# ---- rotazione, azione di riga, esclusioni ---------------------------------

assert schema.normalize_room({}, 0)["rotation"] == 0.0
assert schema.normalize_room({"rotation": 30}, 0)["rotation"] == 30.0
# a handle spun round and round must not leave a five-figure angle in the store
assert schema.normalize_room({"rotation": 725}, 0)["rotation"] == 5.0
assert schema.normalize_room({"rotation": -90}, 0)["rotation"] == 270.0
assert schema.normalize_room({"rotation": "storto"}, 0)["rotation"] == 0.0

for kind in ("active", "room", "lights"):
    assert schema.normalize_item({"type": kind}, 0)["row_action"] == "toggle"
    assert schema.normalize_item({"type": kind, "row_action": "more-info"}, 0)["row_action"] == "more-info"
    # anything unrecognised falls back to the safe historical behaviour
    assert schema.normalize_item({"type": kind, "row_action": "boh"}, 0)["row_action"] == "toggle"
assert "row_action" not in schema.normalize_item({"type": "sensor", "entity_id": "sensor.x"}, 0)

exc = schema.normalize_item({"type": "active", "exclude": ["switch.a", 7, "", "light.b"]}, 0)
assert exc["exclude"] == ["switch.a", "light.b"]
assert schema.normalize_item({"type": "active"}, 0)["exclude"] == []
assert schema.normalize_item({"type": "active", "exclude": "no"}, 0)["exclude"] == []
assert schema.normalize_item(exc, 0) == exc

# --- v8: the lighting card's tap action was a dead setting -------------------
# Whatever an older document stores there was written by a build that never
# read it, so it carries no intent. Resetting it once reproduces the behaviour
# those users actually saw; keeping it would invert every existing card.
old_doc = {"version": 7, "revision": 4, "pages": [
    {"id": "p", "type": "sections", "title": "Casa", "sections": [
        {"id": "s", "title": "Luci", "items": [
            {"id": "lc", "type": "lights", "row_action": "toggle"},
            {"id": "rc", "type": "room", "row_action": "toggle"},
        ]}]}]}
mig8 = schema.normalize_dashboard(old_doc)
lights_card = mig8["pages"][0]["sections"][0]["items"][0]
room_card = mig8["pages"][0]["sections"][0]["items"][1]
assert mig8["version"] == 9
assert lights_card["row_action"] == "more-info", lights_card
# the room card's setting DID work, so it must be left exactly as chosen
assert room_card["row_action"] == "toggle", room_card
# and a document already at v8 is never rewritten again
at8 = schema.normalize_dashboard(mig8)
assert at8["pages"][0]["sections"][0]["items"][0]["row_action"] == "more-info"
mig8["pages"][0]["sections"][0]["items"][0]["row_action"] = "toggle"
again = schema.normalize_dashboard(mig8)
assert again["pages"][0]["sections"][0]["items"][0]["row_action"] == "toggle", "una scelta a v8 va rispettata"

# --- the 3D map now has its own tap action ----------------------------------
view = schema.normalize_view({})
assert view["tap_action"] == "toggle"
assert schema.normalize_view({"tap_action": "more-info"})["tap_action"] == "more-info"
assert schema.normalize_view({"tap_action": "boh"})["tap_action"] == "toggle"

# --- controllo temperatura --------------------------------------------------
th = schema.normalize_item({"type": "thermostat"}, 0)
# empty means "everything there is", so a unit installed next month appears
assert th["units"] == [] and th["manual"] == []
assert th["show_manual"] is True and th["show_extras"] is True
th2 = schema.normalize_item({"type": "thermostat", "units": ["climate.a", "nonvalido", 7],
                             "manual": ["input_boolean.x"], "show_manual": 0}, 0)
assert th2["units"] == ["climate.a"], th2["units"]
assert th2["manual"] == ["input_boolean.x"]
assert th2["show_manual"] is False
assert len(schema.normalize_item({"type": "thermostat",
    "units": [f"climate.c{i}" for i in range(50)]}, 0)["units"]) == 20
assert schema.normalize_item(th2, 0) == th2
# the order inside the card belongs to the user
assert schema.normalize_item({"type": "thermostat"}, 0)["order"] == []
th3 = schema.normalize_item({"type": "thermostat",
                             "order": ["manual", "climate.a", 5, ""]}, 0)
assert th3["order"] == ["manual", "climate.a"], th3["order"]
# an entity that is momentarily missing keeps its place rather than being pruned
assert schema.normalize_item({"type": "thermostat",
    "order": ["climate.sparito", "manual"]}, 0)["order"] == ["climate.sparito", "manual"]
assert schema.normalize_item({"type": "thermostat"}, 0)["columns"] == "auto"
assert schema.normalize_item({"type": "thermostat", "columns": "2"}, 0)["columns"] == "2"
assert schema.normalize_item({"type": "thermostat", "columns": "9"}, 0)["columns"] == "auto"
assert schema.normalize_item(th3, 0) == th3

# --- v9: the room accordion is split into one section per room --------------
old_rooms = {"version": 8, "revision": 3, "pages": [
    {"id": "p", "type": "sections", "title": "Stanze", "sections": [
        {"id": "before", "title": "Meteo", "icon": "mdi:weather-sunny",
         "items": [{"id": "w", "type": "weather", "entity_id": "weather.casa"}]},
        {"id": "rooms", "title": "Stanze", "icon": "mdi:home-group", "accent": "#06d6a0",
         "items": [
             {"id": "c1", "type": "room", "name": "Soggiorno", "area": "sog",
              "appearance": {"icon": "mdi:sofa"}},
             {"id": "c2", "type": "room", "name": "Cucina", "area": "cuc",
              "appearance": {"icon": "mdi:silverware-fork-knife"}},
             {"id": "c3", "type": "room", "name": "Bagno", "area": "bag", "appearance": {}},
         ]},
        {"id": "mixed", "title": "Misto", "icon": "mdi:shape",
         "items": [{"id": "c4", "type": "room", "name": "Studio", "area": "stu"},
                   {"id": "c5", "type": "room", "name": "Garage", "area": "gar"},
                   {"id": "g", "type": "gauge", "entity_id": "sensor.x"}]},
    ]}]}
mig9 = schema.normalize_dashboard(old_rooms)
secs9 = mig9["pages"][0]["sections"]
assert mig9["version"] == 9
titles9 = [s["title"] for s in secs9]
# the accordion is replaced IN PLACE by the sections it contained
assert titles9 == ["Meteo", "Soggiorno", "Cucina", "Bagno", "Misto"], titles9
assert [len(s["items"]) for s in secs9] == [1, 1, 1, 1, 3], [len(s["items"]) for s in secs9]
# each room keeps its own card, untouched
assert secs9[1]["items"][0]["id"] == "c1" and secs9[1]["items"][0]["area"] == "sog"
# only the first room stays open
assert secs9[1]["collapsed"] is False
assert secs9[2]["collapsed"] is True and secs9[3]["collapsed"] is True
# the card's icon wins, the section's icon is the fallback
assert secs9[1]["icon"] == "mdi:sofa", secs9[1]["icon"]
assert secs9[3]["icon"] == "mdi:home-group", secs9[3]["icon"]
# a section mixing rooms with other cards is a layout somebody built: leave it
assert [c["id"] for c in secs9[4]["items"]] == ["c4", "c5", "g"]
# ids are unique, or two sections would fight over selection and drag
assert len({s["id"] for s in secs9}) == len(secs9)
# and running it again changes nothing
again9 = schema.normalize_dashboard(mig9)
assert [s["title"] for s in again9["pages"][0]["sections"]] == titles9
# a single room in its own section is already the target shape
one = schema.normalize_dashboard({"version": 8, "pages": [{"id": "p", "type": "sections",
    "sections": [{"id": "s", "title": "Soggiorno",
                  "items": [{"id": "c", "type": "room", "name": "Soggiorno", "area": "sog"}]}]}]})
assert len(one["pages"][0]["sections"]) == 1

print("schema: rotazione, azione di riga ed esclusioni ok")
