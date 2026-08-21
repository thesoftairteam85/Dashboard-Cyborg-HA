"""Visibility and conditional rendering model."""
from __future__ import annotations

from typing import Any


def normalize_conditions(conditions: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Normalize conditions without restricting future operators."""
    if not isinstance(conditions, list):
        return []
    return [dict(condition) for condition in conditions if isinstance(condition, dict)]
