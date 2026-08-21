"""Cyborg Dashboard core engine."""

from .actions import SUPPORTED_ACTIONS, normalize_actions
from .conditions import normalize_conditions
from .editor import add_item, remove_item, update_item
from .layout import normalize_item, normalize_layout
from .pages import add_page, remove_page
from .schema import default_dashboard, normalize_dashboard
from .serialization import dumps_dashboard, loads_dashboard
from .theme import normalize_theme

__all__ = [
    "SUPPORTED_ACTIONS", "add_item", "add_page", "default_dashboard",
    "dumps_dashboard", "loads_dashboard", "normalize_actions",
    "normalize_conditions", "normalize_dashboard", "normalize_item",
    "normalize_layout", "normalize_theme", "remove_item", "remove_page",
    "update_item",
]
