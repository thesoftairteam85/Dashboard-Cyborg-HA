"""WebSocket API for Cyborg Dashboard."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .core.storage import DashboardConflictError, DashboardStorage

DOMAIN = "cyborg_dashboard"

TYPE_GET = "cyborg_dashboard/get"
TYPE_SAVE = "cyborg_dashboard/save"
TYPE_NOTIFICATIONS = "cyborg_dashboard/notifications"
TYPE_NOTIFICATIONS_SUBSCRIBE = "cyborg_dashboard/notifications/subscribe"
TYPE_NOTIFICATIONS_CLEAR = "cyborg_dashboard/notifications/clear"
TYPE_NOTIFICATIONS_READ = "cyborg_dashboard/notifications/read"
TYPE_NOTIFICATIONS_DELETE = "cyborg_dashboard/notifications/delete"
TYPE_SCHEDULE = "cyborg_dashboard/schedule"
TYPE_SCHEDULE_SET = "cyborg_dashboard/schedule/set"
TYPE_RUN_FOR = "cyborg_dashboard/run_for"
TYPE_RUN_CANCEL = "cyborg_dashboard/run_for/cancel"


def async_register_websocket(hass: HomeAssistant) -> None:
    """Register Cyborg Dashboard WebSocket commands.

    IMPORTANT: must be called as async_register_command(hass, handler) —
    the two-argument form. websocket_api.websocket_command() (the
    decorator on _ws_get/_ws_save below) stamps _ws_command/_ws_schema
    onto the handler function; async_register_command reads those two
    attributes ONLY in the two-arg form. Calling it as
    async_register_command(hass, TYPE_GET, _ws_get) — three args — takes
    a completely different code path that leaves schema=None in the
    registered (handler, schema) tuple. HA's dispatcher
    (websocket_api/connection.py) then unconditionally does
    `handler(hass, connection, schema(msg))`, and `None(msg)` blows up
    with `TypeError: 'NoneType' object is not callable` on every single
    call. That was the actual cause of "Impossibile caricare la
    dashboard" in the frontend: cyborg_dashboard/get was silently
    failing on every invocation, not just occasionally.
    """
    websocket_api.async_register_command(hass, _ws_get)
    websocket_api.async_register_command(hass, _ws_save)
    websocket_api.async_register_command(hass, _ws_notifications)
    websocket_api.async_register_command(hass, _ws_notifications_subscribe)
    websocket_api.async_register_command(hass, _ws_notifications_clear)
    websocket_api.async_register_command(hass, _ws_notifications_read)
    websocket_api.async_register_command(hass, _ws_notifications_delete)
    websocket_api.async_register_command(hass, _ws_schedule)
    websocket_api.async_register_command(hass, _ws_schedule_set)
    websocket_api.async_register_command(hass, _ws_run_for)
    websocket_api.async_register_command(hass, _ws_run_cancel)


@websocket_api.websocket_command({"type": TYPE_GET})
@callback
def _ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Return the persisted dashboard."""
    async def load() -> None:
        data = await DashboardStorage(hass).async_load()
        connection.send_result(msg["id"], {"dashboard": data})
    hass.async_create_task(load())


@websocket_api.websocket_command({
    "type": TYPE_SAVE,
    "dashboard": dict,
    vol.Optional("expected_revision"): vol.Any(int, None),
})
@websocket_api.async_response
async def _ws_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Persist dashboard configuration.

    Accepts an optional ``expected_revision``: when the caller supplies it
    and it no longer matches what is stored, the save is rejected with a
    ``revision_conflict`` error instead of overwriting a concurrent edit
    (e.g. two browser tabs, or the editor UI racing an automation-driven
    update). Omitting it preserves the previous last-write-wins behavior.
    """
    storage = DashboardStorage(hass)
    try:
        revision = await storage.async_save(
            msg["dashboard"], expected_revision=msg.get("expected_revision")
        )
    except DashboardConflictError as err:
        connection.send_error(
            msg["id"],
            "revision_conflict",
            f"Il dashboard è stato modificato altrove (revisione attuale: {err.current_revision}).",
        )
        return
    connection.send_result(msg["id"], {"saved": True, "revision": revision})


def _log(hass: HomeAssistant):
    """The notification log, or None if setup has not reached it yet."""
    return hass.data.get(DOMAIN, {}).get("notifications")


@websocket_api.websocket_command({
    "type": TYPE_NOTIFICATIONS,
    vol.Optional("limit", default=50): vol.All(int, vol.Range(min=1, max=120)),
})
@callback
def _ws_notifications(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Return the notifications Home Assistant has sent, newest first."""
    log = _log(hass)
    connection.send_result(msg["id"], {
        "notifications": log.async_list(msg["limit"]) if log else [],
        "available": log is not None,
    })


@websocket_api.websocket_command({"type": TYPE_NOTIFICATIONS_SUBSCRIBE})
@callback
def _ws_notifications_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Push each new notification to the panel as it happens.

    A subscription rather than polling: an alert that shows up thirty seconds
    late is not an alert. The unsubscribe callback is handed to
    connection.subscriptions so that closing the browser tab detaches the
    listener; without that the log would accumulate dead sockets forever.
    """
    log = _log(hass)
    if log is None:
        connection.send_error(msg["id"], "not_ready", "Registro notifiche non ancora pronto")
        return

    @callback
    def forward(payload: dict[str, Any]) -> None:
        # The log decides the shape: {"notification": ...} for a new alert,
        # {"reload": True} when read state or deletions changed it elsewhere.
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    connection.subscriptions[msg["id"]] = log.async_subscribe(forward)
    connection.send_result(msg["id"])


@websocket_api.websocket_command({"type": TYPE_NOTIFICATIONS_CLEAR})
@callback
def _ws_notifications_clear(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Empty the log."""
    log = _log(hass)
    if log is not None:
        log.async_clear()
    connection.send_result(msg["id"], {"cleared": True})


@websocket_api.websocket_command({
    "type": TYPE_NOTIFICATIONS_READ,
    vol.Optional("ids"): vol.Any([str], None),
    vol.Optional("read", default=True): bool,
})
@callback
def _ws_notifications_read(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Mark alerts read or unread. Omitting ``ids`` means all of them."""
    log = _log(hass)
    if log is None:
        connection.send_error(msg["id"], "not_ready", "Registro notifiche non ancora pronto")
        return
    changed = log.async_mark_read(msg.get("ids"), msg["read"])
    connection.send_result(msg["id"], {"changed": changed, "unread": log.async_unread()})


@websocket_api.websocket_command({
    "type": TYPE_NOTIFICATIONS_DELETE,
    vol.Optional("ids"): vol.Any([str], None),
    vol.Optional("read_only", default=False): bool,
})
@callback
def _ws_notifications_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Delete the listed alerts, or every already-read one."""
    log = _log(hass)
    if log is None:
        connection.send_error(msg["id"], "not_ready", "Registro notifiche non ancora pronto")
        return
    ids = msg.get("ids")
    if not ids and not msg["read_only"]:
        connection.send_error(msg["id"], "no_selection", "Nessun avviso indicato")
        return
    removed = log.async_delete(ids, msg["read_only"])
    connection.send_result(msg["id"], {"removed": removed, "unread": log.async_unread()})


# ----------------------------------------------------------------- schedule


def _sched(hass: HomeAssistant):
    return hass.data.get(DOMAIN, {}).get("scheduler")


@websocket_api.websocket_command({"type": TYPE_SCHEDULE})
@callback
def _ws_schedule(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Recurring jobs and the countdowns currently running."""
    sched = _sched(hass)
    connection.send_result(msg["id"], sched.async_list() if sched else {"jobs": [], "timers": []})


@websocket_api.websocket_command({
    "type": TYPE_SCHEDULE_SET,
    vol.Required("jobs"): list,
})
@callback
def _ws_schedule_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Replace the whole job list and re-arm the listeners.

    Replace rather than patch: the panel always holds the complete list, and a
    partial update protocol would need conflict handling for a feature where
    the whole payload is a few hundred bytes.
    """
    sched = _sched(hass)
    if sched is None:
        connection.send_error(msg["id"], "not_ready", "Pianificatore non ancora pronto")
        return
    connection.send_result(msg["id"], {"jobs": sched.async_set_jobs(msg["jobs"])})


@websocket_api.websocket_command({
    "type": TYPE_RUN_FOR,
    vol.Required("entity_id"): str,
    vol.Required("minutes"): vol.Coerce(float),
    vol.Optional("data"): dict,
})
@callback
def _ws_run_for(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Switch something on now and guarantee Home Assistant switches it off."""
    sched = _sched(hass)
    if sched is None:
        connection.send_error(msg["id"], "not_ready", "Pianificatore non ancora pronto")
        return
    timer = sched.async_run_for(msg["entity_id"], msg["minutes"], msg.get("data"))
    connection.send_result(msg["id"], {"timer": timer})


@websocket_api.websocket_command({
    "type": TYPE_RUN_CANCEL,
    vol.Required("entity_id"): str,
    vol.Optional("turn_off", default=True): bool,
})
@callback
def _ws_run_cancel(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Stop a countdown, switching the entity off unless asked not to."""
    sched = _sched(hass)
    if sched is None:
        connection.send_error(msg["id"], "not_ready", "Pianificatore non ancora pronto")
        return
    sched.async_cancel_timer_for(msg["entity_id"])
    if msg["turn_off"]:
        sched.async_turn_off(msg["entity_id"])
    connection.send_result(msg["id"], {"cancelled": True})
