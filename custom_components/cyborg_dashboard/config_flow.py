"""Config flow for Cyborg Dashboard."""
from __future__ import annotations

from homeassistant import config_entries
from homeassistant.core import callback

DOMAIN = "cyborg_dashboard"

class CyborgDashboardConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a Cyborg Dashboard config flow."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Create the dashboard entry."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        return self.async_create_entry(title="Cyborg Dashboard", data={})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return CyborgDashboardOptionsFlowHandler()

class CyborgDashboardOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle dashboard options."""

    async def async_step_init(self, user_input=None):
        return self.async_create_entry(title="", data=user_input or {})
