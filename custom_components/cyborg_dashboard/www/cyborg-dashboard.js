const CYBORG_DEFAULTS = {
  version: 1,
  pages: [{ id: "home", title: "Home", layout: { type: "grid", columns: 12, gap: 16 }, items: [] }],
  theme: { mode: "ha", density: "comfortable", radius: 20, surface: "card", accent: "primary" },
};

class CyborgDashboard extends HTMLElement {
  set hass(value) {
    this._hass = value;
    this._ensureState();
    this.render();
  }

  connectedCallback() {
    this._ensureState();
    this.render();
  }

  _ensureState() {
    if (!this._dashboard) this._dashboard = structuredClone(CYBORG_DEFAULTS);
    if (!this._editing) this._editing = false;
  }

  _toggleEdit() {
    this._editing = !this._editing;
    this.render();
  }

  _addEntity() {
    const entities = Object.keys(this._hass?.states || {});
    const entityId = entities[0];
    if (!entityId) return;
    this._dashboard.pages[0].items.push({
      id: `entity-${Date.now()}`,
      type: "entity",
      entity_id: entityId,
      position: { x: 0, y: this._dashboard.pages[0].items.length * 2, w: 3, h: 2 },
      show_name: true,
      show_state: true,
    });
    this.render();
  }

  _removeItem(id) {
    this._dashboard.pages[0].items = this._dashboard.pages[0].items.filter((item) => item.id !== id);
    this.render();
  }

  _renderItem(item) {
    const state = this._hass?.states?.[item.entity_id];
    const value = state?.state ?? "—";
    const name = state?.attributes?.friendly_name || item.entity_id || "Entity";
    return `<article class="item">
      <div class="item-head"><span>${name}</span>${this._editing ? `<button data-remove="${item.id}" aria-label="Remove">×</button>` : ""}</div>
      <div class="value">${value}</div>
      ${state?.attributes?.unit_of_measurement ? `<div class="unit">${state.attributes.unit_of_measurement}</div>` : ""}
    </article>`;
  }

  render() {
    if (!this._hass) return;
    const page = this._dashboard.pages[0];
    const items = page.items.map((item) => this._renderItem(item)).join("");
    const count = Object.keys(this._hass.states || {}).length;
    this.innerHTML = `
      <style>
        :host{display:block;min-height:100vh;box-sizing:border-box;padding:24px;background:var(--primary-background-color);color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif)}
        .shell{max-width:1600px;margin:auto}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}h1{margin:0;font-size:30px;letter-spacing:-.03em}.sub{opacity:.6;margin-top:4px}
        .tools{display:flex;gap:8px}button{border:0;border-radius:12px;padding:10px 14px;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer;font:inherit}.secondary{background:var(--card-background-color);color:var(--primary-text-color)}
        .grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}.item{grid-column:span 3;min-height:120px;padding:18px;border-radius:20px;background:var(--card-background-color);box-shadow:var(--ha-card-box-shadow);box-sizing:border-box}.item-head{display:flex;justify-content:space-between;gap:8px;font-weight:600}.item-head button{padding:2px 8px;background:transparent;color:var(--primary-text-color);font-size:20px}.value{font-size:32px;font-weight:700;margin-top:24px}.unit{opacity:.55;margin-top:3px}.empty{grid-column:1/-1;padding:48px;text-align:center;border:1px dashed var(--divider-color);border-radius:20px;opacity:.7}
        .editing .item{outline:1px dashed var(--primary-color)}@media(max-width:900px){.item{grid-column:span 6}}@media(max-width:600px){:host{padding:14px}.item{grid-column:1/-1}.top{align-items:flex-start}.tools{flex-wrap:wrap}}
      </style>
      <div class="shell ${this._editing ? "editing" : ""}">
        <header class="top"><div><h1>Cyborg Dashboard</h1><div class="sub">${page.title} · ${count} entità disponibili</div></div>
          <div class="tools"><button class="secondary" id="edit">${this._editing ? "Fine" : "Modifica"}</button>${this._editing ? `<button id="add">+ Entità</button>` : ""}</div>
        </header>
        <main class="grid">${items || `<div class="empty">Dashboard vuota${this._editing ? " — premi + Entità per iniziare" : " — attiva Modifica per configurarla"}</div>`}</main>
      </div>`;
    this.querySelector("#edit")?.addEventListener("click", () => this._toggleEdit());
    this.querySelector("#add")?.addEventListener("click", () => this._addEntity());
    this.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => this._removeItem(button.dataset.remove)));
  }
}

if (!customElements.get("cyborg-dashboard")) customElements.define("cyborg-dashboard", CyborgDashboard);
