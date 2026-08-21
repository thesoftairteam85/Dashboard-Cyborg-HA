"""Normalized action model for Cyborg Dashboard."""
from __future__ import annotations

from typing import Any

SUPPORTED_ACTIONS = ("tap", "hold", "double_tap")


def normalize_actions(actions: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize action slots while allowing arbitrary future action payloads."""
    actions = actions if isinstance(actions, dict) else {}
    return {name: actions.get(name) for name in SUPPORTED_ACTIONS}
