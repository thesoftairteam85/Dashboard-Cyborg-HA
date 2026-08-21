"""Energy-domain metadata hooks for Cyborg Dashboard."""
from __future__ import annotations

ENERGY_DOMAINS = {
    "power": ("W", "kW"),
    "energy": ("Wh", "kWh", "MWh"),
    "battery": ("%", "kWh"),
}


def energy_domain_for_unit(unit: str | None) -> str | None:
    """Classify a common energy unit for future specialized renderers."""
    if not unit:
        return None
    for domain, units in ENERGY_DOMAINS.items():
        if unit in units:
            return domain
    return None
