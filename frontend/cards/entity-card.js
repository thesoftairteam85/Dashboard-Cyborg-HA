import { registerCard } from "../core/card-registry.js";

export function renderEntityCard(card, hass) {
  const c = card.config;
  const state = hass?.states?.[c.entity];
  const value = state?.state ?? "—";
  const unit = c.unit || state?.attributes?.unit_of_measurement || "";
  const name = c.name || state?.attributes?.friendly_name || c.entity || "Entità";
  const icon = c.icon || state?.attributes?.icon || "mdi:home-assistant";

  return `<article class="cyborg-card entity-card">
    <div class="entity-head"><span class="entity-icon">${icon}</span><span>${name}</span></div>
    <div class="entity-value">${value}<small>${unit}</small></div>
  </article>`;
}

registerCard("entity", {
  label: "Entità",
  defaults: {
    entity: "",
    name: "",
    icon: "",
    unit: "",
    decimals: 2,
    appearance: { size: "medium", density: "comfortable" },
    graph: { enabled: false, hours: 24, type: "line" },
    thresholds: { enabled: false, low: 0, high: 0 },
    actions: { tap: "more-info", hold: "none", double_tap: "none" },
    visibility: { enabled: true, conditions: [] },
  },
  render: renderEntityCard,
});
