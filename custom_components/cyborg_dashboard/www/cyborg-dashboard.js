const DEFAULT_CONFIG = { schema_version: 1, pages: [{ id: "home", title: "Home", sections: [{ id: "main", cards: [] }] }] };
const STYLE = `:host{display:block;min-height:100vh;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--primary-text-color,#eef3f8);background:var(--primary-background-color,#0b1017)}.cyborg-shell,.cyborg-editor{max-width:1600px;margin:0 auto;padding:24px}.cyborg-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}.cyborg-title{font-size:28px;font-weight:760;letter-spacing:-.03em}.cyborg-subtitle{font-size:13px;opacity:.52;margin-top:4px}.cyborg-header button,.cyborg-empty button,#save{border:1px solid #354154;background:#18212d;color:inherit;border-radius:10px;padding:10px 14px;cursor:pointer}.cyborg-main{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}.cyborg-card{grid-column:span 4;min-height:132px;padding:18px;border:1px solid #293544;border-radius:20px;background:linear-gradient(145deg,#161f2b,#10161e);box-shadow:0 12px 35px rgba(0,0,0,.18)}.entity-head{font-size:14px;opacity:.78}.entity-value{margin-top:22px;font-size:32px;font-weight:760;letter-spacing:-.035em}.entity-value small{font-size:13px;font-weight:500;opacity:.55;margin-left:6px}.cyborg-empty{grid-column:1/-1;padding:60px;text-align:center;border:1px dashed #354154;border-radius:20px;line-height:1.8}.editor-card{max-width:700px;margin:0 0 14px;padding:16px;border:1px solid #293544;border-radius:16px;background:#151d27}.editor-card label{display:block;font-size:12px;opacity:.75;margin-top:12px}.editor-card input,.editor-card select{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border-radius:9px;border:1px solid #354154;background:#0f151d;color:inherit}@media(max-width:1000px){.cyborg-card{grid-column:span 6}}@media(max-width:650px){.cyborg-shell,.cyborg-editor{padding:14px}.cyborg-card{grid-column:1/-1}.cyborg-title{font-size:23px}}`;

class CyborgDashboard extends HTMLElement {
  set hass(value) { this._hass = value; this.render(); }

  async connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    if (!this.shadowRoot.querySelector("style")) {
      const style = document.createElement("style"); style.textContent = STYLE; this.shadowRoot.appendChild(style);
    }
    this.config = structuredClone(DEFAULT_CONFIG);
    await this.loadConfig();
    this.render();
  }

  async loadConfig() {
    const connection = this._hass?.connection;
    if (!connection) return;
    try {
      const data = await connection.sendMessagePromise({ type: "cyborg_dashboard/get_config" });
      if (data?.pages) this.config = data;
    } catch (err) { console.warn("Cyborg Dashboard: storage unavailable", err); }
  }

  async saveConfig() {
    const connection = this._hass?.connection;
    if (!connection) return;
    await connection.sendMessagePromise({ type: "cyborg_dashboard/save_config", config: this.config });
  }

  render() {
    if (!this._hass || !this.shadowRoot) return;
    const page = this.config.pages[0];
    const cards = page.sections.flatMap(section => section.cards || []);
    this.shadowRoot.querySelector(".cyborg-root")?.remove();
    const root = document.createElement("div"); root.className = "cyborg-root";
    root.innerHTML = `<div class="cyborg-shell"><header class="cyborg-header"><div><div class="cyborg-title">${esc(page.title)}</div><div class="cyborg-subtitle">Cyborg Dashboard</div></div><button id="edit">⚙ Modifica</button></header><main class="cyborg-main">${cards.length ? cards.map(c => this.card(c)).join("") : '<div class="cyborg-empty">Nessuna card configurata.<br><button id="add">+ Aggiungi entità</button></div>'}</main></div>`;
    this.shadowRoot.appendChild(root);
    root.querySelector("#add")?.addEventListener("click", () => this.addCard());
    root.querySelector("#edit")?.addEventListener("click", () => this.editor());
  }

  card(card) {
    const state = this._hass.states[card.config.entity];
    const name = card.config.name || state?.attributes?.friendly_name || card.config.entity || "Entità";
    const value = state?.state ?? "—";
    const unit = card.config.unit || state?.attributes?.unit_of_measurement || "";
    return `<article class="cyborg-card"><div class="entity-head">${esc(name)}</div><div class="entity-value">${esc(value)}<small>${esc(unit)}</small></div></article>`;
  }

  async addCard() {
    const entity = Object.values(this._hass.states).find(e => e.entity_id && !e.entity_id.startsWith("scene."));
    if (!entity) return;
    this.config.pages[0].sections[0].cards.push({ id: crypto.randomUUID(), type: "entity", config: { entity: entity.entity_id, name: "", unit: "", decimals: 2 } });
    await this.saveConfig(); this.render();
  }

  editor() {
    const entities = Object.values(this._hass.states).filter(e => e.entity_id);
    const cards = this.config.pages[0].sections.flatMap(section => section.cards || []);
    const root = document.createElement("div"); root.className = "cyborg-root";
    root.innerHTML = `<div class="cyborg-editor"><header class="cyborg-header"><div><div class="cyborg-title">Modifica dashboard</div><div class="cyborg-subtitle">Configurazione persistente</div></div><button id="done">✓ Fine</button></header>${cards.map((card,i)=>`<section class="editor-card"><strong>Card ${i+1}</strong><label>Entità<select data-i="${i}">${entities.map(e=>`<option value="${esc(e.entity_id)}" ${e.entity_id===card.config.entity?"selected":""}>${esc(e.attributes?.friendly_name||e.entity_id)}</option>`).join("")}</select></label><label>Nome<input data-name="${i}" value="${esc(card.config.name||"")}"></label><label>Unità<input data-unit="${i}" value="${esc(card.config.unit||"")}"></label></section>`).join("")}<button id="save">Salva</button></div>`;
    this.shadowRoot.querySelector(".cyborg-root")?.remove(); this.shadowRoot.appendChild(root);
    root.querySelector("#save")?.addEventListener("click", async () => { cards.forEach((card,i) => { card.config.entity=root.querySelector(`[data-i="${i}"]`).value; card.config.name=root.querySelector(`[data-name="${i}"]`).value; card.config.unit=root.querySelector(`[data-unit="${i}"]`).value; }); await this.saveConfig(); this.render(); });
    root.querySelector("#done")?.addEventListener("click", () => this.render());
  }
}
function esc(v){return String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
customElements.define("cyborg-dashboard-panel", CyborgDashboard);
