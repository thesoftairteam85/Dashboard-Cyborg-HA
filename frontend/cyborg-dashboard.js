import { DashboardStore, DEFAULT_CONFIG } from "./core/dashboard-store.js";
import { HABridge } from "./core/ha-bridge.js";
import { getCard } from "./core/card-registry.js";
import "./cards/entity-card.js";
import "./editor/dashboard-editor.js";
import "./cyborg-dashboard.css";

export class CyborgDashboard extends HTMLElement {
  constructor() {
    super();
    this.store = new DashboardStore(DEFAULT_CONFIG);
    this._hass = null;
    this.connection = null;
    this.editing = false;
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
      this.store = new DashboardStore(await this.bridge.loadConfig());
      this.render();
    } catch (error) {
      console.warn("Cyborg Dashboard: backend storage unavailable", error);
    }
  }

  async persist(config) {
    if (this.bridge) await this.bridge.saveConfig(config);
  }

  renderCard(card) {
    const definition = getCard(card.type);
    if (!definition) return `<article class="cyborg-card"><strong>${card.type}</strong><div>Card non registrata</div></article>`;
    return definition.render ? definition.render(card, this._hass) : `<article class="cyborg-card"><strong>${card.config.name || card.config.entity || card.type}</strong></article>`;
  }

  render() {
    if (!this._hass) return;
    const config = this.store.config;
    const page = config.pages?.[0] || { id: "home", title: "Home", sections: [] };
    page.sections ??= [{ id: crypto.randomUUID(), cards: [] }];
    const cards = page.sections.flatMap(section => section.cards || []);
    this.innerHTML = `<div class="cyborg-shell">
      <header class="cyborg-header">
        <div><div class="cyborg-title">${escapeHtml(page.title)}</div><div class="cyborg-subtitle">Cyborg Dashboard</div></div>
        <button data-edit>${this.editing ? "✓ Fine" : "⚙ Modifica"}</button>
      </header>
      <main class="cyborg-main">${cards.length ? cards.map(card => this.renderCard(card)).join("") : '<div class="cyborg-empty">Nessuna card configurata. Attiva Modifica per iniziare.</div>'}</main>
      ${this.editing ? `<cyborg-dashboard-editor></cyborg-dashboard-editor>` : ""}
    </div>`;
    this.querySelector("[data-edit]")?.addEventListener("click", () => {
      this.editing = !this.editing;
      this.render();
    });
    this.initEditor();
  }

  initEditor() {
    const editor = this.querySelector("cyborg-dashboard-editor");
    if (!editor) return;
    editor.value = this.store.config;
    editor.setHass(this._hass);
    editor.addEventListener("config-changed", async (event) => {
      this.store = new DashboardStore(event.detail);
      await this.persist(event.detail);
      this.render();
    });
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

customElements.define("cyborg-dashboard", CyborgDashboard);
