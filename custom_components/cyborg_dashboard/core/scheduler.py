"""Scheduler: timed on/off and run-for-N-minutes, executed by Home Assistant.

Why the schedule lives here and not in the panel
------------------------------------------------
A watering valve opened "for ten minutes" from a browser must close after ten
minutes *whatever happens to that browser*. A timer running in the panel dies
with the tab, with the phone locking, with the tablet on the wall going to
sleep — and leaves the valve open. On an irrigation line that is a flooded
garden, so the countdown belongs to Home Assistant, which is also the thing
that will still be running at 03:00.

The same argument applies to a lighting schedule: it has to fire whether or not
anybody is looking at the dashboard.

APIs used (verified against Home Assistant core 2026.8.3)
---------------------------------------------------------
* ``homeassistant.helpers.event.async_track_time_change`` — fires a callback at
  a given hour/minute/second every day. One listener per recurring job; core
  computes the next occurrence itself and handles DST transitions, which is
  precisely the part nobody should reimplement.
* ``homeassistant.helpers.event.async_track_point_in_time`` — one-shot at an
  absolute time, used for the run-for-N-minutes countdown.
* ``homeassistant.helpers.storage.Store`` — persistence. A pending countdown is
  written to disk and re-armed on restart: restarting Home Assistant in the
  middle of a watering cycle must not strand the valve open either.
* ``hass.services.async_call`` for the actual switching.

Everything here is standard Home Assistant plumbing. No external dependency,
nothing that can disappear from GitHub.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import (
    async_track_point_in_time,
    async_track_time_change,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
STORAGE_KEY = "cyborg_dashboard_schedule"

#: Guard rail. A single dashboard with more than this many timed jobs is a
#: configuration mistake, and each job holds a core listener.
MAX_JOBS = 120

#: A countdown longer than this is almost certainly a typo, and on an
#: irrigation line a typo means a flooded garden.
MAX_RUN_MINUTES = 12 * 60

WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _domain(entity_id: str) -> str:
    return entity_id.split(".", 1)[0]


def _service_for(entity_id: str, action: str) -> tuple[str, str]:
    """Map (entity, on/off) onto a service that actually exists.

    ``turn_on`` is not universal: ``cover`` has open/close, ``valve`` has
    open_valve/close_valve, ``lock`` has lock/unlock. Calling ``turn_on`` on
    those does nothing at all and reports no error, which is the worst possible
    failure mode for a schedule — it looks configured and never runs.
    """
    domain = _domain(entity_id)
    on = action == "on"
    if domain == "cover":
        return "cover", "open_cover" if on else "close_cover"
    if domain == "valve":
        return "valve", "open_valve" if on else "close_valve"
    if domain == "lock":
        return "lock", "unlock" if on else "lock"
    if domain in ("light", "switch", "fan", "input_boolean", "siren",
                  "humidifier", "climate", "media_player", "water_heater",
                  "automation", "script", "scene"):
        return domain, "turn_on" if on else "turn_off"
    return "homeassistant", "turn_on" if on else "turn_off"


def normalize_job(job: dict[str, Any], index: int) -> dict[str, Any] | None:
    """Validate one recurring job, or drop it."""
    if not isinstance(job, dict):
        return None
    entity = job.get("entity_id")
    if not isinstance(entity, str) or "." not in entity:
        return None
    action = "off" if job.get("action") == "off" else "on"

    raw_time = str(job.get("at") or "")
    parts = raw_time.split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None

    days = job.get("days")
    if isinstance(days, list):
        clean_days = [d for d in days if d in WEEKDAYS]
    else:
        clean_days = []
    # An empty list means every day rather than never: a job that can never
    # fire is not a schedule, it is a bug the user cannot see.
    if not clean_days:
        clean_days = list(WEEKDAYS)

    data = job.get("data")
    result = {
        "id": str(job.get("id") or f"job-{index + 1}"),
        "entity_id": entity,
        "action": action,
        "at": f"{hour:02d}:{minute:02d}",
        "days": clean_days,
        "enabled": job.get("enabled", True) is not False,
        "label": str(job.get("label") or "")[:80],
        # extra service data, e.g. a brightness or a colour for a light
        "data": data if isinstance(data, dict) else {},
    }
    return result


class CyborgScheduler:
    """Recurring on/off jobs plus one-shot countdowns."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store[dict[str, Any]](hass, STORAGE_VERSION, STORAGE_KEY)
        self._jobs: list[dict[str, Any]] = []
        self._timers: list[dict[str, Any]] = []
        self._unsub_jobs: list[Any] = []
        self._unsub_timers: dict[str, Any] = {}
        self._seq = 0
        self._started = False

    # ------------------------------------------------------------- lifecycle

    async def async_start(self) -> None:
        if self._started:
            return
        self._started = True
        stored = await self._store.async_load()
        if isinstance(stored, dict):
            self._jobs = [
                j for j in (normalize_job(x, i) for i, x in enumerate(stored.get("jobs") or []))
                if j is not None
            ][:MAX_JOBS]
            self._timers = [t for t in (stored.get("timers") or []) if isinstance(t, dict)]
            try:
                self._seq = int(stored.get("seq", 0))
            except (TypeError, ValueError):
                self._seq = 0
        self._rearm_jobs()
        self._rearm_timers()

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsub_jobs:
            unsub()
        self._unsub_jobs.clear()
        for unsub in self._unsub_timers.values():
            unsub()
        self._unsub_timers.clear()
        self._started = False

    # ---------------------------------------------------------- recurring

    @callback
    def _rearm_jobs(self) -> None:
        for unsub in self._unsub_jobs:
            unsub()
        self._unsub_jobs.clear()
        for job in self._jobs:
            if not job["enabled"]:
                continue
            hour, minute = (int(p) for p in job["at"].split(":"))
            self._unsub_jobs.append(
                async_track_time_change(
                    self._hass,
                    self._make_job_runner(job["id"]),
                    hour=hour, minute=minute, second=0,
                )
            )

    def _make_job_runner(self, job_id: str):
        @callback
        def run(_now) -> None:
            job = next((j for j in self._jobs if j["id"] == job_id), None)
            if not job or not job["enabled"]:
                return
            # The day filter is applied at fire time, not at arm time: core
            # tracks an hour/minute, and re-arming a listener whenever the date
            # rolls over would be a second scheduler on top of the first.
            today = WEEKDAYS[dt_util.now().weekday()]
            if today not in job["days"]:
                return
            self._call(job["entity_id"], job["action"], job.get("data") or {})
        return run

    @callback
    def _call(self, entity_id: str, action: str, data: dict[str, Any] | None = None) -> None:
        domain, service = _service_for(entity_id, action)
        payload: dict[str, Any] = {"entity_id": entity_id}
        if action == "on" and data:
            payload.update(data)
        self._hass.async_create_task(
            self._hass.services.async_call(domain, service, payload, blocking=False)
        )

    # ------------------------------------------------------------ countdown

    @callback
    def async_run_for(self, entity_id: str, minutes: float, data: dict[str, Any] | None = None) -> dict[str, Any]:
        """Switch something on now and guarantee it goes off later."""
        minutes = max(1.0, min(float(MAX_RUN_MINUTES), float(minutes)))
        self.async_cancel_timer_for(entity_id)

        self._seq += 1
        end = dt_util.utcnow() + timedelta(minutes=minutes)
        timer = {
            "id": f"t-{self._seq}",
            "entity_id": entity_id,
            "ends_at": end.isoformat(),
            "minutes": minutes,
        }
        self._timers.append(timer)
        self._call(entity_id, "on", data)
        self._arm_timer(timer)
        self._save()
        return timer

    @callback
    def _arm_timer(self, timer: dict[str, Any]) -> None:
        when = dt_util.parse_datetime(timer["ends_at"])
        if when is None:
            return

        @callback
        def fire(_now) -> None:
            self._unsub_timers.pop(timer["id"], None)
            self._timers = [t for t in self._timers if t["id"] != timer["id"]]
            self._call(timer["entity_id"], "off")
            self._save()

        # A countdown whose end time is already in the past — the instance was
        # down when it should have fired — is honoured immediately rather than
        # dropped: leaving a valve open because Home Assistant restarted is the
        # exact failure this class exists to prevent.
        if when <= dt_util.utcnow():
            self._hass.loop.call_soon(fire, None)
            return
        self._unsub_timers[timer["id"]] = async_track_point_in_time(self._hass, fire, when)

    @callback
    def _rearm_timers(self) -> None:
        for timer in list(self._timers):
            self._arm_timer(timer)

    @callback
    def async_cancel_timer_for(self, entity_id: str) -> None:
        for timer in [t for t in self._timers if t["entity_id"] == entity_id]:
            unsub = self._unsub_timers.pop(timer["id"], None)
            if unsub:
                unsub()
            self._timers.remove(timer)
        self._save()

    # --------------------------------------------------------------- public

    @callback
    def async_turn_off(self, entity_id: str) -> None:
        """Switch something off through the right service for its domain."""
        self._call(entity_id, "off")

    @callback
    def async_list(self) -> dict[str, Any]:
        return {"jobs": list(self._jobs), "timers": list(self._timers)}

    @callback
    def async_set_jobs(self, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        clean = [j for j in (normalize_job(x, i) for i, x in enumerate(jobs or [])) if j is not None]
        self._jobs = clean[:MAX_JOBS]
        self._rearm_jobs()
        self._save()
        return self._jobs

    @callback
    def _save(self) -> None:
        self._store.async_delay_save(
            lambda: {"seq": self._seq, "jobs": self._jobs, "timers": self._timers}, 3
        )
