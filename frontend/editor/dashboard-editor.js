import { getCards } from "../core/card-registry.js";

export class DashboardEditor extends HTMLElement {
  constructor() {
    super();
    this.cards = [];
    this.hass = null;
    this.onSave = null;
  }

  set value(config) {
    this.config = structuredClone(config);
    this.render();
  }

  setHass(hass) {
    this.hass = hass;
    this.render();
  }

  render() {
    if (!this.config) return;
    const page = this.config.pages?.[0];
    const cards = page?.sections?.flatMap((section) => section.cards || []) || [];
    const entities = Object.values(this.hass?.states || {})
      .sort((a, b) => (a.attributes?.friendly_name || a.entity_id).localeCompare(b.attributes?.friendly_name || b.entity_id));

    this.innerHTML = `<div class="editor-shell">
      <div class="editor-header"><div><strong>Modifica dashboard</strong><small>Configurazione persistente</small></div><button data-action="add">+ Aggiungi</button></div>
      <div class="editor-list">
        ${cards.map((card, index) => this.renderCard(card, index, entities)).join("")}
      </div>
    </div>`;

    this.querySelectorAll("[data-save]").forEach((button) => button.addEventListener("click", () => this.save(Number(button.dataset.save))));
    this.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => this.remove(Number(button.dataset.delete))));
    this.querySelector("[data-action=add]")?.addEventListener("click", () => this.add());
  }

  renderCard(card, index, entities) {
    const definition = getCards().find((item) => item.type === card.type);
    const options = entities.map((entity) => `<option value="${entity.entity_id}" ${entity.entity_id === card.config.entity ? "selected" : ""}>${entity.attributes?.friendly_name || entity.entity_id} · ${entity.entity_id}</option>`).join("");
    return `<section class="editor-card">
      <div class="editor-card-head"><strong>${definition?.label || card.type}</strong><button data-delete="${index}">Elimina</button></div>
      <label>Entità<select data-entity="${index}"><option value="">Seleziona entità…</option>${options}</select></label>
      <label>Nome<input data-name="${index}" value="${escapeHtml(card.config.name || "")}" placeholder="Nome visualizzato"></label>
      <div class="editor-grid">
        <label>Unità<input data-unit="${index}" value="${escapeHtml(card.config.unit || "")}"></label>
        <label>Decimali<input type="number" min="0" max="6" data-decimals="${index}" value="${card.config.decimals ?? 2}"></label>
      </div>
      <details><summary>Opzioni avanzate</summary>
        <label><input type="checkbox" data-graph="${index}" ${card.config.graph?.enabled ? "checked" : ""}> Grafico</label>
        <label>Storico (ore)<input type="number" min="1" max="720" data-hours="${index}" value="${card.config.graph?.hours ?? 24}"></label>
        <label>Tap<select data-tap="${index}">${actionOptions(card.config.actions?.tap || "more-info")}</select></label>
        <label>Hold<select data-hold="${index}">${actionOptions(card.config.actions?.hold || "none")}</select></label>
      </details>
      <button class="save" data-save="${index}">Salva card</button>
    </section>`;
  }

  save(index) {
    const page = this.config.pages[0];
    const card = page.sections.flatMap((section) => section.cards || [])[index];
    if (!card) return;
    card.config.entity = this.querySelector(`[data-entity="${index}"]`).value;
    card.config.name = this.querySelector(`[data-name="${index}"]`).value;
    card.config.unit = this.querySelector(`[data-unit="${index}"]`).value;
    card.config.decimals = Number(this.querySelector(`[data-decimals="${index}"]`).value || 0);
    card.config.graph = { ...(card.config.graph || {}), enabled: this.querySelector(`[data-graph="${index}"]`).checked, hours: Number(this.querySelector(`[data-hours="${index}"]`).value || 24) };
    card.config.actions = { ...(card.config.actions || {}), tap: this.querySelector(`[data-tap="${index}"]`).value, hold: this.querySelector(`[data-hold="${index}"]`).value };
    this.dispatchEvent(new CustomEvent("config-changed", { detail: structuredClone(this.config), bubbles: true, composed: true }));
  }

  add() {
    const page = this.config.pages[0];
    page.sections ??= [];
    if (!page.sections.length) page.sections.push({ id: crypto.randomUUID(), cards: [] });
    page.sections[0].cards.push({ id: crypto.randomUUID(), type: "entity", config: { entity: "", name: "", icon: "", unit: "", decimals: 2, graph: { enabled: false, hours: 24 }, actions: { tap: "more-info", hold: "none" } } });
    this.render();
  }

  remove(index) {
    const page = this.config.pages[0];
    let n = 0;
    for (const section of page.sections || []) {
      if (index >= n && index < n + section.cards.length) section.cards.splice(index - n, 1);
      n += section.cards.length;
    }
    this.dispatchEvent(new CustomEvent("config-changed", { detail: structuredClone(this.config), bubbles: true, composed: true }));
    this.render();
  }
}

function actionOptions(value) {
  return ["none", "more-info", "toggle"].map((item) => `<option value="${item}" ${item === value ? "selected" : ""}>${item}</option>`).join("");
}
function escapeHtml(value) { return String(value).replace(/[&<>\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

customElements.define("cyborg-dashboard-editor", DashboardEditor);
