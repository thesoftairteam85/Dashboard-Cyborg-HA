class CyborgDashboard extends HTMLElement {
  set hass(value) {
    this._hass = value;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    if (!this._hass) return;
    const count = Object.keys(this._hass.states || {}).length;
    this.innerHTML = `
      <style>
        :host { display:block; min-height:100vh; box-sizing:border-box; padding:24px; background:var(--primary-background-color); color:var(--primary-text-color); }
        .shell { max-width:1600px; margin:auto; }
        h1 { margin:0; font-size:30px; letter-spacing:-.03em; }
        p { opacity:.65; }
        .status { margin-top:24px; padding:24px; border-radius:20px; background:var(--card-background-color); box-shadow:var(--ha-card-box-shadow); }
      </style>
      <div class="shell">
        <h1>Cyborg Dashboard</h1>
        <p>Dashboard engine attivo.</p>
        <div class="status">Home Assistant connesso · ${count} entità disponibili</div>
      </div>`;
  }
}

if (!customElements.get("cyborg-dashboard")) {
  customElements.define("cyborg-dashboard", CyborgDashboard);
}
