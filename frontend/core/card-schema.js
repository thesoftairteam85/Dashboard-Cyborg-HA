export const CARD_SCHEMAS = {
  entity: {
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
  },
  energy: {
    label: "Energia",
    defaults: {
      entity: "",
      name: "Energia",
      unit: "kW",
      decimals: 2,
      appearance: { size: "large", density: "comfortable" },
      graph: { enabled: true, hours: 24, type: "area" },
      thresholds: { enabled: false, low: 0, high: 3 },
      actions: { tap: "more-info", hold: "none", double_tap: "none" },
      visibility: { enabled: true, conditions: [] },
      energy: { source: "entity", direction: "auto", aggregation: "latest" },
    },
  },
};
