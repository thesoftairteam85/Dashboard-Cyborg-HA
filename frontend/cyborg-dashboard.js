import { DashboardStore, DEFAULT_CONFIG } from "./core/dashboard-store.js";
import { HABridge } from "./core/ha-bridge.js";
import { createCard } from "./core/card-registry.js";
import "./cards/entity-card.js";

export class CyborgDashboard extends HTMLElement {
  constructor() {
    super();
    this.store = new DashboardStore(DEFAULT_CONFIG);
    this.hass = null;
    this.connection = null;
  }

  set hass(value) {
    this._hass = value;
    this.render();
  }

  get hass() { return this._hass; }

  setConfig(config) {
    this.store = new DashboardStore(config);
    this.render();
  }

  async setConnection(connection) {
    this.connection = connection;
    this.bridge = new HABridge(connection);
    try {
      const config = await this.bridge.loadConfig();
      this.store = new DashboardStore(config);
      this.render();
    } catch (error) {
      console.warn("Cyborg Dashboard: backend storage unavailable", error);
    }
  }

  render() {
    if (!this._hass) return;
    const page = this.store.config.pages[0];
    const cards = page?.sections?.flatMap(section => section.cards || []) || [];
    if (!cards.length) {
      const firstEntity = Object.keys(this._hass.states || {})[0];
      if (firstEntity) {
        this.store.addCard(page.id, createCard("entity", { entity: firstEntity }));
      }
    }
    const current = this.store.config.pages[0];
    const currentCards = current.sections.flatMap(section => section.cards || []);
    this.innerHTML = `<div class="cyborg-shell">
      <header><div><strong>${current.title}</strong><small>Cyborg Dashboard</small></div></header>
      <main>${currentCards.map(card => {
        const def = customElements.get("cyborg-card-${card.type}");
        return def?.render ? def.render(card, this._hass) : renderFallback(card, this._hass);
      }).join("")}</main>
    </div>`;
  }
}

function renderFallback(card, hass) {
  const state = hass?.states?.[card.config.entity];
  return `<article class="cyborg-card"><strong>${card.config.name || card.config.entity}</strong><div>${state?.state || "—"}</div></article>`;
}

customElements.define("cyborg-dashboard", CyborgDashboard);
