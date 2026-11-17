"""Il dashboard segue le rinomine degli entity_id (core/renames.py).

Come websocket.test.py: il modulo non si importa (tira dentro homeassistant),
quindi funzioni e classe si estraggono dal sorgente vero con `ast` e si
eseguono con al posto di Home Assistant tre oggetti minimi. Il test fallisce
se il codice spedito cambia, e non puo' scivolare a provare una copia.
"""
from __future__ import annotations

import ast
import asyncio
import copy
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "custom_components" / "cyborg_dashboard" / "core" / "renames.py"

PASS = 0
FAIL = 0


def ok(name: str, cond: bool, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok  " + name)
    else:
        FAIL += 1
        print("  FAIL " + name + ("  -> " + extra if extra else ""))


tree = ast.parse(SRC.read_text(encoding="utf-8"))
keep = [n for n in tree.body
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        or (isinstance(n, ast.Assign) and any(getattr(t, "id", "") in
            {"DEBOUNCE_SECONDS", "MAX_SAVE_ATTEMPTS"} for t in n.targets))]


class Conflict(Exception):
    pass


timers: list = []


def fake_call_later(_hass, _delay, action):
    entry = {"action": action, "cancelled": False}
    timers.append(entry)

    def cancel():
        entry["cancelled"] = True
    return cancel


class FakeBus:
    def __init__(self):
        self.listeners = []

    def async_listen(self, event_type, handler, event_filter=None):
        self.listeners.append((event_type, handler, event_filter))
        return lambda: None

    def fire(self, data):
        for _t, handler, flt in self.listeners:
            if flt is None or flt(data):
                handler(type("E", (), {"data": data})())


class FakeER:
    EVENT_ENTITY_REGISTRY_UPDATED = "entity_registry_updated"
    EventEntityRegistryUpdatedData = dict


ns: dict = {
    "callback": lambda f: f, "CALLBACK_TYPE": object, "Event": dict,
    "HomeAssistant": object, "Any": object, "Callable": object,
    "er": FakeER, "async_call_later": fake_call_later,
    "DashboardConflictError": Conflict, "DashboardStorage": object,
    "_LOGGER": type("L", (), {"info": staticmethod(lambda *a: None),
                              "warning": staticmethod(lambda *a: None)})(),
}
exec(compile(ast.Module(body=keep, type_ignores=[]), str(SRC), "exec"), ns)
compose = ns["compose_renames"]
rewrite = ns["rewrite_entity_ids"]
is_rename = ns["_is_rename"]
Follower = ns["EntityRenameFollower"]

print("\n== SOLO LA STRINGA INTERA ==")
d = {"a": "sensor.lavatrice_potenza", "b": "sensor.lavatrice_potenza_2",
     "c": "Il sensor.lavatrice_potenza dice"}
out, n = rewrite(d, {"sensor.lavatrice_potenza": "sensor.bagno_lavatrice_potenza"})
ok("l'id esatto si riscrive", out["a"] == "sensor.bagno_lavatrice_potenza")
# Una sostituzione dentro il testo avrebbe trasformato l'entita' sorella.
ok("un id che lo CONTIENE resta com'e'", out["b"] == "sensor.lavatrice_potenza_2")
ok("un testo libero che lo cita resta com'e'", out["c"] == d["c"])
ok("una sola sostituzione contata", n == 1, str(n))
ok("l'originale non e' toccato", d["a"] == "sensor.lavatrice_potenza")

print("\n== CHIAVI E PROFONDITA' ==")
dash = {"pages": [{"sections": [{"items": [
    {"type": "trend", "series": [{"entity": "sensor.old", "color": "#fff"}]},
    {"type": "thermostat", "manual": ["input_boolean.old_b", "input_boolean.x"],
     "order": ["manual", "climate.old_c"]},
]}]}],
    "hierarchy": {"sensor.old": "sensor.parent_old"},
    "colors": {"sensor.old": "#123"}}
ren = {"sensor.old": "sensor.new", "input_boolean.old_b": "input_boolean.new_b",
       "climate.old_c": "climate.new_c", "sensor.parent_old": "sensor.parent_new"}
out, n = rewrite(dash, ren)
it = out["pages"][0]["sections"][0]["items"]
ok("serie di un grafico", it[0]["series"][0]["entity"] == "sensor.new")
ok("lista di interruttori", it[1]["manual"] == ["input_boolean.new_b", "input_boolean.x"])
ok("ordine dei blocchi", it[1]["order"] == ["manual", "climate.new_c"])
ok("chiave e valore della gerarchia", out["hierarchy"] == {"sensor.new": "sensor.parent_new"})
ok("chiave dei colori", out["colors"] == {"sensor.new": "#123"})
ok("sei riferimenti in tutto", n == 6, str(n))
out2, n2 = rewrite(out, ren)
ok("riapplicare e' innocuo (zero sostituzioni)", n2 == 0 and out2 == out)

print("\n== UNA CHIAVE CHE ESISTEVA GIA' ==")
out, _ = rewrite({"colors": {"sensor.new": "#scelto", "sensor.old": "#vecchio"}},
                 {"sensor.old": "sensor.new"})
ok("vince il valore scelto a mano", out["colors"] == {"sensor.new": "#scelto"}, str(out))

print("\n== CATENE ==")
p = compose({}, "a", "b")
p = compose(p, "b", "c")
ok("a->b poi b->c diventa a->c", p.get("a") == "c" and p.get("b") == "c", str(p))
p = compose(compose({}, "a", "b"), "b", "a")
# Il dashboard salvato contiene ancora "a": andata e ritorno non deve toccarlo.
ok("andata e ritorno lascia stare l'id di partenza", "a" not in p, str(p))
out, n = rewrite({"x": "a"}, p)
ok("e il dashboard resta com'era", out == {"x": "a"} and n == 0, str(out))

print("\n== SOLO LE RINOMINE VERE ==")
ok("rinomina", is_rename({"action": "update", "entity_id": "x.b", "old_entity_id": "x.a", "changes": {}}))
ok("update senza cambio di id", not is_rename({"action": "update", "entity_id": "x.a", "changes": {"name": "n"}}))
ok("creazione", not is_rename({"action": "create", "entity_id": "x.a"}))
ok("rimozione", not is_rename({"action": "remove", "entity_id": "x.a"}))


class FakeStorage:
    def __init__(self, data):
        self.data = copy.deepcopy(data)
        self.saves = 0
        self.conflicts = 0

    async def async_load(self):
        return copy.deepcopy(self.data)

    async def async_save(self, data, expected_revision=None):
        if self.conflicts:
            self.conflicts -= 1
            self.data["revision"] += 1      # qualcun altro ha salvato
            raise Conflict()
        if expected_revision != self.data["revision"]:
            raise Conflict()
        self.saves += 1
        data["revision"] = self.data["revision"] + 1
        self.data = copy.deepcopy(data)
        return data["revision"]


async def scenario():
    print("\n== DUECENTO RINOMINE, UN SALVATAGGIO ==")
    bus = FakeBus()
    hass = type("H", (), {"bus": bus})()
    store = FakeStorage({"revision": 7, "ids": [f"sensor.s{i}" for i in range(200)]})
    f = Follower(hass, store)
    await f.async_start()
    seen = []
    f.async_subscribe(seen.append)
    for i in range(200):
        bus.fire({"action": "update", "entity_id": f"sensor.n{i}",
                  "old_entity_id": f"sensor.s{i}", "changes": {}})
    bus.fire({"action": "update", "entity_id": "sensor.zz", "changes": {"name": "x"}})
    live = [t for t in timers if not t["cancelled"]]
    ok("un solo timer vivo dopo la raffica", len(live) == 1, str(len(live)))
    await live[0]["action"]()
    ok("un solo salvataggio", store.saves == 1, str(store.saves))
    ok("tutti e duecento riscritti",
       store.data["ids"] == [f"sensor.n{i}" for i in range(200)])
    ok("gli schermi aperti ricevono la revisione nuova", seen == [8], str(seen))

    print("\n== CONFLITTO: SI RILEGGE E SI RIPROVA ==")
    timers.clear()
    store2 = FakeStorage({"revision": 3, "x": "light.a"})
    store2.conflicts = 1
    f2 = Follower(hass, store2)
    f2._pending = {"light.a": "light.b"}
    await f2._flush()
    ok("scritto al secondo tentativo", store2.data["x"] == "light.b" and store2.saves == 1)

    print("\n== NIENTE DA RISCRIVERE, NIENTE DA SALVARE ==")
    store3 = FakeStorage({"revision": 1, "x": "light.c"})
    f3 = Follower(hass, store3)
    f3._pending = {"light.a": "light.b"}
    await f3._flush()
    ok("nessuna revisione inutile", store3.saves == 0 and store3.data["revision"] == 1)


asyncio.run(scenario())
print(f"\n{PASS} ok, {FAIL} falliti")
sys.exit(1 if FAIL else 0)
