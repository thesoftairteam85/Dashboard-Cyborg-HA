"""Serialization boundary for dashboard configuration."""
from __future__ import annotations

import json
from typing import Any

from .schema import normalize_dashboard


def dumps_dashboard(data: dict[str, Any]) -> str:
    """Serialize normalized dashboard data deterministically."""
    return json.dumps(normalize_dashboard(data), ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def loads_dashboard(value: str) -> dict[str, Any]:
    """Deserialize and normalize dashboard data."""
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        parsed = None
    return normalize_dashboard(parsed if isinstance(parsed, dict) else None)
