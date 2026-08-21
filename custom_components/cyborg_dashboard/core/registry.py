"""Dashboard component registry."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass(frozen=True)
class ComponentDefinition:
    """Definition of a Cyborg dashboard component."""

    type: str
    label: str
    capabilities: tuple[str, ...] = ()
    defaults: dict[str, Any] = field(default_factory=dict)


_REGISTRY: dict[str, ComponentDefinition] = {}


def register_component(definition: ComponentDefinition) -> None:
    """Register or replace a component definition."""
    _REGISTRY[definition.type] = definition


def get_component(type_name: str) -> ComponentDefinition | None:
    """Return a component definition."""
    return _REGISTRY.get(type_name)


def list_components() -> list[ComponentDefinition]:
    """Return registered component definitions."""
    return list(_REGISTRY.values())


register_component(
    ComponentDefinition(
        type="entity",
        label="Entity",
        capabilities=("state", "actions", "secondary_info", "conditional", "popup"),
        defaults={"show_name": True, "show_state": True},
    )
)
register_component(
    ComponentDefinition(
        type="section",
        label="Section",
        capabilities=("layout", "title", "visibility"),
        defaults={"title": "", "columns": 12},
    )
)
register_component(
    ComponentDefinition(
        type="button",
        label="Button",
        capabilities=("actions", "icon", "visibility", "conditional"),
        defaults={"action": None},
    )
)
