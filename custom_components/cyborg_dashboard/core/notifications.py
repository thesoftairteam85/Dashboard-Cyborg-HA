"""Notification log: every message Home Assistant sends out, kept and replayed.

Why this exists
---------------
Home Assistant has no history of the notifications it sends. ``notify.*`` is a
fire-and-forget service call, and the Telegram integration is no different: a
message leaves for the phone and nothing remains in Home Assistant to say it
ever happened. ``persistent_notification`` is the only thing the frontend can
list, and almost nobody routes their alerts through it.

So an "alerts" panel that only reads persistent notifications shows an empty
box on an install whose alarms all go to Telegram, which is exactly the case
here.

What is captured
----------------
Verified against Home Assistant core 2026.8.3:

* ``EVENT_CALL_SERVICE`` (``homeassistant/const.py``, fired in
  ``core.py`` ``ServiceRegistry.async_call``) carries
  ``{domain, service, service_data}``. Every outgoing notification in Home
  Assistant, whatever the transport, is a service call in the ``notify``
  domain (``notify.send_message`` for the modern entity-based platforms,
  ``notify.<service>`` for the legacy ones) or in ``telegram_bot``. Listening
  on one event and filtering by domain therefore captures Telegram, the mobile
  apps, HTML5 and e-mail with a single hook, and keeps working when a new
  transport is added.

* ``telegram_text`` / ``telegram_command`` / ``telegram_callback``
  (``telegram_bot/const.py``) are the *incoming* direction: what the user
  writes to the bot.

Note on ``telegram_sent``: it exists, but its payload
(``telegram_bot/bot.py``) is only ``{chat_id, message_id, message_tag,
message_thread_id, bot}`` — the text is deliberately not included. It is
useless as the source of an alert list, which is why the service call is used
instead.

Ordering caveat: ``EVENT_CALL_SERVICE`` is fired *before* the handler runs, so
a captured entry means "Home Assistant tried to send this", not "Telegram
acknowledged it". For an at-a-glance alert panel that is the right trade: the
alternative would drop every message whose delivery confirmation never arrives.
"""
from __future__ import annotations

import time
from collections import deque
from typing import Any

from homeassistant.const import EVENT_CALL_SERVICE
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

STORAGE_VERSION = 1
STORAGE_KEY = "cyborg_dashboard_notifications"

#: Kept in memory and on disk. 120 entries is roughly a fortnight of alerts on
#: a normal install and a few hours on a chatty one, and costs ~30 kB.
MAX_ENTRIES = 120

#: Service domains whose calls are notifications.
NOTIFY_DOMAINS = ("notify", "telegram_bot")

#: telegram_bot services that carry no user-facing message and must not become
#: entries: deleting a message or answering a callback is not an alert.
TELEGRAM_SILENT_SERVICES = frozenset({
    "delete_message", "answer_callback_query", "leave_chat", "download_file",
    "send_chat_action", "set_message_reaction", "edit_replymarkup",
})

#: Incoming Telegram events (verified in telegram_bot/const.py, core 2026.8.3).
INCOMING_EVENTS = ("telegram_text", "telegram_command", "telegram_callback")

#: Writes are batched: a burst of ten alerts must not mean ten disk writes.
SAVE_DELAY = 8


@callback
def _is_notify_call(data: dict[str, Any]) -> bool:
    """Cheap pre-filter for EVENT_CALL_SERVICE (receives the event *data*)."""
    return data.get("domain") in NOTIFY_DOMAINS


def _clean(value: Any, limit: int = 600) -> str:
    """Coerce anything a service payload may hold into short display text."""
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return ""
    text = str(value).strip()
    return text[:limit]


def _channel_of(domain: str, service: str, data: dict[str, Any]) -> tuple[str, str]:
    """Return (channel key, human label) for a notification service call."""
    if domain == "telegram_bot":
        return "telegram", "Telegram"
    target = data.get("entity_id")
    if isinstance(target, list):
        target = target[0] if target else None
    name = str(target or service or "")
    if "telegram" in name.lower():
        return "telegram", "Telegram"
    if "mobile_app" in name:
        pretty = name.split("mobile_app_", 1)[-1].replace("_", " ").strip()
        return "mobile", f"App {pretty}" if pretty else "App"
    if service == "persistent_notification" or "persistent" in name:
        return "persistent", "Home Assistant"
    if "html5" in name:
        return "push", "Push web"
    if service == "notify":
        return "notify", "Notifica"
    return "notify", name.replace("notify.", "").replace("_", " ").strip() or "Notifica"


class NotificationLog:
    """Rolling log of everything Home Assistant notified about."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store[dict[str, Any]](hass, STORAGE_VERSION, STORAGE_KEY)
        self._entries: deque[dict[str, Any]] = deque(maxlen=MAX_ENTRIES)
        self._subscribers: list[Any] = []
        self._unsub: list[Any] = []
        self._seq = 0
        self._started = False

    # ------------------------------------------------------------- lifecycle

    async def async_start(self) -> None:
        """Load history and begin listening. Idempotent."""
        if self._started:
            return
        self._started = True

        stored = await self._store.async_load()
        if isinstance(stored, dict):
            for entry in stored.get("entries") or []:
                if isinstance(entry, dict) and entry.get("message"):
                    self._entries.append(entry)
            try:
                self._seq = int(stored.get("seq", len(self._entries)))
            except (TypeError, ValueError):
                self._seq = len(self._entries)

        # The filter runs before the listener job is even scheduled, so calls
        # from other domains cost one dict lookup and nothing else. On an
        # instance where every light toggle fires EVENT_CALL_SERVICE that is
        # the difference between a free hook and a tax on the whole house.
        # It must be decorated with @callback or core rejects it outright
        # (homeassistant/core.py: "Event filter ... is not a callback").
        self._unsub.append(
            self._hass.bus.async_listen(
                EVENT_CALL_SERVICE, self._on_service_call, event_filter=_is_notify_call
            )
        )
        for event_type in INCOMING_EVENTS:
            self._unsub.append(
                self._hass.bus.async_listen(event_type, self._on_telegram_incoming)
            )

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()
        self._subscribers.clear()
        self._started = False

    # -------------------------------------------------------------- capture

    @callback
    def _on_service_call(self, event: Event) -> None:
        """Filter the firehose down to notifications.

        Only reached for the notify domains, thanks to the event filter
        installed in async_start.
        """
        domain = event.data.get("domain")
        service = event.data.get("service") or ""
        if domain == "telegram_bot" and service in TELEGRAM_SILENT_SERVICES:
            return
        data = event.data.get("service_data") or {}
        if not isinstance(data, dict):
            return

        message = _clean(data.get("message")) or _clean(data.get("caption"))
        if not message:
            # A notification with no text is not something to show: photo and
            # location sends without a caption fall here, as do malformed calls.
            return

        channel, label = _channel_of(domain, service, data)
        self._append({
            "source": "sent",
            "channel": channel,
            "channel_label": label,
            "title": _clean(data.get("title"), 160),
            "message": message,
            "service": f"{domain}.{service}",
        })

    @callback
    def _on_telegram_incoming(self, event: Event) -> None:
        """A message written *to* the bot."""
        data = event.data or {}
        message = _clean(data.get("text")) or _clean(data.get("command")) or _clean(data.get("data"))
        if not message:
            return
        who = _clean(data.get("from_first") or data.get("from_user") or "", 80)
        self._append({
            "source": "received",
            "channel": "telegram",
            "channel_label": "Telegram",
            "title": who or "Messaggio ricevuto",
            "message": message,
            "service": event.event_type,
        })

    @callback
    def _append(self, partial: dict[str, Any]) -> None:
        self._seq += 1
        entry = dict(partial)
        entry["id"] = f"cy-{self._seq}"
        entry["ts"] = dt_util.utcnow().isoformat()
        entry["mono"] = time.monotonic()
        self._entries.append(entry)

        for send in list(self._subscribers):
            try:
                send(entry)
            except Exception:  # noqa: BLE001 - a dead socket must not stop the log
                self._subscribers.remove(send)

        # delay= batches a burst of alerts into a single write
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY)

    @callback
    def _data_to_save(self) -> dict[str, Any]:
        return {"seq": self._seq, "entries": list(self._entries)}

    # --------------------------------------------------------------- reading

    @callback
    def async_list(self, limit: int = 50) -> list[dict[str, Any]]:
        """Most recent first, which is the order the card renders them in."""
        items = list(self._entries)
        items.reverse()
        return items[: max(1, min(MAX_ENTRIES, limit))]

    @callback
    def async_subscribe(self, send: Any) -> Any:
        self._subscribers.append(send)

        @callback
        def unsubscribe() -> None:
            if send in self._subscribers:
                self._subscribers.remove(send)

        return unsubscribe

    @callback
    def async_clear(self) -> None:
        self._entries.clear()
        self._store.async_delay_save(self._data_to_save, 1)
