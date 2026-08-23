"""Read state and deletion in the notification log.

The log is the one place in Cyborg that owns mutable per-item state shared
between screens, so the properties worth pinning down are the ones two
screens could disagree about: what counts as unread, what a housekeeping
sweep is allowed to remove, and what an upgrade does to entries written
before any of this existed.

Home Assistant is not imported: the parts under test are pure list handling.
The module needs `homeassistant.*` at import time, so the few names it uses
are stubbed — this keeps the suite runnable anywhere, which is the whole
reason it catches things before a restart does.
"""
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "custom_components" / "cyborg_dashboard"))


def _stub(name, **attrs):
    mod = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(mod, key, value)
    sys.modules[name] = mod
    return mod


class _FakeStore:
    # The real Store is generic and the module subscripts it (Store[dict[...]]),
    # so the stand-in has to accept a subscript too.
    def __class_getitem__(cls, _item):
        return cls

    def __init__(self, *a, **kw):
        self.saved = None
        self.saves = 0

    def async_delay_save(self, func, delay):
        self.saved = func()
        self.saves += 1

    async def async_load(self):
        return None


class _FakeDt:
    @staticmethod
    def utcnow():
        import datetime
        return datetime.datetime(2026, 8, 23, 12, 0, 0)


def _callback(fn):
    return fn


_stub("homeassistant")
_stub("homeassistant.const", EVENT_CALL_SERVICE="call_service")
_stub("homeassistant.core", Event=object, HomeAssistant=object, callback=_callback)
_stub("homeassistant.helpers")
_stub("homeassistant.helpers.storage", Store=_FakeStore)
_stub("homeassistant.util", dt=_FakeDt)
_stub("homeassistant.util.dt", utcnow=_FakeDt.utcnow)

from core import notifications as N  # noqa: E402


def fresh(count=3):
    log = N.NotificationLog(object())
    log._store = _FakeStore()
    for i in range(count):
        log._append({"message": f"m{i}", "title": f"t{i}", "channel": "telegram",
                     "source": "sent"})
    return log


# -- new alerts start unread -------------------------------------------------
log = fresh(3)
assert log.async_unread() == 3
assert all(e["read"] is False for e in log._entries)
ids = [e["id"] for e in log._entries]

# -- marking one read leaves the others alone --------------------------------
assert log.async_mark_read([ids[0]]) == 1
assert log.async_unread() == 2
# idempotent: marking the same one again changes nothing and does not re-save
assert log.async_mark_read([ids[0]]) == 0

# -- and it can be undone ----------------------------------------------------
assert log.async_mark_read([ids[0]], read=False) == 1
assert log.async_unread() == 3

# -- mark everything ---------------------------------------------------------
assert log.async_mark_read(None) == 3
assert log.async_unread() == 0

# -- deleting one by id ------------------------------------------------------
log = fresh(3)
ids = [e["id"] for e in log._entries]
assert log.async_delete([ids[1]]) == 1
assert [e["id"] for e in log._entries] == [ids[0], ids[2]]
# an id that is not there is not an error, it is a no-op
assert log.async_delete(["cy-999"]) == 0

# -- the housekeeping sweep must never take an unread alert ------------------
log = fresh(4)
ids = [e["id"] for e in log._entries]
log.async_mark_read([ids[0], ids[2]])
assert log.async_delete(None, read_only=True) == 2
left = [e["id"] for e in log._entries]
assert left == [ids[1], ids[3]], left
assert log.async_unread() == 2
# nothing read left: the sweep is now a no-op rather than a clear-all
assert log.async_delete(None, read_only=True) == 0
assert len(log._entries) == 2

# -- subscribers are told when the list changed underneath them --------------
log = fresh(2)
seen = []
unsub = log.async_subscribe(seen.append)
log._append({"message": "nuovo", "channel": "telegram", "source": "sent"})
assert seen and "notification" in seen[-1], seen
assert seen[-1]["notification"]["read"] is False
log.async_mark_read(None)
assert seen[-1] == {"reload": True}, seen[-1]
log.async_delete([log._entries[0]["id"]])
assert seen[-1] == {"reload": True}
# no change, no broadcast: a no-op must not wake every open panel
before = len(seen)
log.async_delete(["cy-nope"])
assert len(seen) == before
unsub()
log._append({"message": "dopo", "channel": "telegram", "source": "sent"})
assert len(seen) == before

# -- a dead socket removes itself instead of stopping the log ----------------
log = fresh(1)


def explode(_payload):
    raise RuntimeError("socket chiuso")


log.async_subscribe(explode)
log._append({"message": "ancora", "channel": "telegram", "source": "sent"})
assert log._subscribers == []

# -- entries written before read tracking existed --------------------------
# Defaulting them to unread would greet the user with a badge of 120 "new"
# alerts from last month the first time they update.
import asyncio  # noqa: E402

log = N.NotificationLog(object())
store = _FakeStore()


async def _load():
    return {"seq": 2, "entries": [
        {"message": "vecchio", "id": "cy-1"},              # no read flag at all
        {"message": "nuovo", "id": "cy-2", "read": False},  # written after
    ]}


store.async_load = _load
log._store = store
log._hass = types.SimpleNamespace(bus=types.SimpleNamespace(
    async_listen=lambda *a, **kw: (lambda: None)))
asyncio.run(log.async_start())
assert log._entries[0]["read"] is True, log._entries[0]
assert log._entries[1]["read"] is False
assert log.async_unread() == 1

# -- the list keeps the flag so the panel can render it ----------------------
rows = log.async_list(10)
assert rows[0]["id"] == "cy-2" and rows[0]["read"] is False   # newest first
assert rows[1]["read"] is True

print("notifiche: letto/da leggere ed eliminazione ok")
