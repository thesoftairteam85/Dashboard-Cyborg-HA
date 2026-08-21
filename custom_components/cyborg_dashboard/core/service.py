"""Service execution layer for Cyborg Dashboard."""
from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall


async def async_call_action(hass: HomeAssistant, action: dict[str, Any] | None) -> None:
    """Execute a normalized dashboard action."""
    if not isinstance(action, dict):
        return
    domain = action.get("domain")
    service = action.get("service")
    if not domain or not service:
        return
    data = action.get("data") or {}
    target = action.get("target")
    await hass.services.async_call(
        domain,
        service,
        data,
        target=target,
        blocking=False,
    )
