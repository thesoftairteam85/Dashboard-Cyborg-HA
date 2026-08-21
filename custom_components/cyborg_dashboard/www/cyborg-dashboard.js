class CyborgDashboard extends HTMLElement {
  set hass(value) {
    this._hass = value;
    this.render();
  }

  connectedCallback() {
    this.config = this.config || { schema_version: 1, pages: [{ id: "home", title: "Home", sections: [{ id: "main", cards: [] }] }] };
    this.render();
  }

  render() {
    if (!this._hass) return;
    const page = this.config.pages[0];
    const cards = page.sections.flatMap(section => section.cards || []);
    this.innerHTML = `<div class="cyborg-shell">
      <header class="cyborg-header">
        <div><div class="cyborg-title">${esc(page.title)}</div><div class="cyborg-subtitle">Cyborg Dashboard</div></div>
        <button id="edit">⚙ Modifica</button>
      </header>
      <main class="cyborg-main">${cards.length ? cards.map(card => this.card(card)).join("") : `<div class="cyborg-empty">Nessuna card configurata.<br><button id="add">+ Aggiungi entità</button></div>`}</main>
    </div>`;
    this.querySelector("#add")?.addEventListener("click", () => this.addCard());
    this.querySelector("#edit")?.addEventListener("click", () => this.editor());
  }

  card(card) {
    const state = this._hass.states[card.config.entity];
    const name = card.config.name || state?.attributes?.friendly_name || card.config.entity || "Entità";
    const value = state?.state ?? "—";
    const unit = card.config.unit || state?.attributes?.unit_of_measurement || "";
    return `<article class="cyborg-card"><div class="entity-head"><span>${esc(name)}</span></div><div class="entity-value">${esc(value)}<small>${esc(unit)}</small></div></article>`;
  }

  addCard() {
    const entities = Object.values(this._hass.states).filter(e => e.entity_id && !e.entity_id.startsWith("scene."));
    const entity = entities[0];
    if (!entity) return;
    this.config.pages[0].sections[0].cards.push({ id: crypto.randomUUID(), type: "entity", config: { entity: entity.entity_id, name: "", unit: "", decimals: 2 } });
    this.render();
  }

  editor() {
    const entities = Object.values(this._hass.states).filter(e => e.entity_id);
    const cards = this.config.pages[0].sections.flatMap(section => section.cards || []);
    this.innerHTML = `<div class="cyborg-editor"><header class="cyborg-header"><div><div class="cyborg-title">Modifica dashboard</div><div class="cyborg-subtitle">Configurazione persistente</div></div><button id="done">✓ Fine</button></header>${cards.map((card,i)=>`<section class="editor-card"><strong>Card ${i+1}</strong><label>Entità<select data-i="${i}">${entities.map(e=>`<option value="${esc(e.entity_id)}" ${e.entity_id===card.config.entity?"selected":""}>${esc(e.attributes?.friendly_name||e.entity_id)}</option>`).join("")}</select></label><label>Nome<input data-name="${i}" value="${esc(card.config.name||"")}"></label><label>Unità<input data-unit="${i}" value="${esc(card.config.unit||"")}"></label></section>`).join("")}<button id="save">Salva</button></div>`;
    this.querySelector("#save")?.addEventListener("click", () => { cards.forEach((card,i)=>{ card.config.entity=this.querySelector(`[data-i="${i}"]`).value; card.config.name=this.querySelector(`[data-name="${i}"]`).value; card.config.unit=this.querySelector(`[data-unit="${i}"]`).value; }); this.dispatchEvent(new CustomEvent("config-changed",{detail:this.config,bubbles:true,composed:true})); this.render(); });
    this.querySelector("#done")?.addEventListener("click", () => this.render());
  }
}
function esc(v){return String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
customElements.define("cyborg-dashboard-panel", CyborgDashboard);
