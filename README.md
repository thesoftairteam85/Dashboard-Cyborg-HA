# Dashboard Cyborg HA

Custom Home Assistant dashboard project inspired by the functional approach of DashboardModern, with an extensible card library, persistent versioned configuration, and a native editor.

## Architecture

- `custom_components/cyborg_dashboard/` — Home Assistant integration
- `frontend/core/` — dashboard store, card registry, schemas, layout engine
- `frontend/cards/` — reusable dashboard components
- `frontend/editor/` — visual configuration editor

## Design goals

1. Fast and responsive UI.
2. Rich, reusable cards with optional advanced features.
3. Configuration remains editable after initial setup.
4. Versioned configuration with migrations.
5. Home Assistant remains the source of truth for entities, devices, areas and services.
6. Existing Home Assistant dashboards are not modified by this project.
