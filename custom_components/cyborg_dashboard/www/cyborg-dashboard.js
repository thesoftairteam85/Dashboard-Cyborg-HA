/**
 * Cyborg Dashboard — frontend panel.
 *
 * Architecture notes
 * ------------------
 * Sections are first-class objects (schema v3): a page owns an ordered list of
 * sections, each section owns an ordered list of cards. Cards no longer carry
 * x/y/w/h grid coordinates — they flow in array order inside their section and
 * only declare a `size` span. Manual coordinates were the main source of
 * overlapping/invisible cards and forced the user to think in grid maths just
 * to move one tile.
 *
 * Rendering is innerHTML-based and re-runs on state change, but guarded by a
 * signature of only the entities actually placed on the dashboard, so an
 * unrelated sensor updating 6x/second does not thrash the DOM or steal focus
 * from the editor while typing.
 */

const DOMAIN_ICONS = {
  alarm_control_panel: "mdi:shield-home", automation: "mdi:robot",
  binary_sensor: "mdi:radiobox-marked", button: "mdi:gesture-tap-button",
  calendar: "mdi:calendar", camera: "mdi:cctv", climate: "mdi:thermostat",
  cover: "mdi:window-shutter", device_tracker: "mdi:cellphone-marker",
  fan: "mdi:fan", humidifier: "mdi:air-humidifier",
  input_boolean: "mdi:toggle-switch-outline", input_datetime: "mdi:clock-outline",
  input_number: "mdi:ray-vertex", input_select: "mdi:format-list-bulleted",
  input_text: "mdi:form-textbox", light: "mdi:lightbulb", lock: "mdi:lock",
  media_player: "mdi:cast", number: "mdi:ray-vertex", person: "mdi:account",
  scene: "mdi:palette", script: "mdi:script-text",
  select: "mdi:format-list-bulleted", sensor: "mdi:gauge", siren: "mdi:bullhorn",
  sun: "mdi:white-balance-sunny", switch: "mdi:toggle-switch",
  todo: "mdi:format-list-checks", update: "mdi:package-up",
  vacuum: "mdi:robot-vacuum", valve: "mdi:pipe-valve",
  water_heater: "mdi:water-boiler", weather: "mdi:weather-partly-cloudy",
  zone: "mdi:map-marker-radius", event: "mdi:calendar-star",
};

const DEVICE_CLASS_ICONS = {
  power: "mdi:flash", energy: "mdi:lightning-bolt", current: "mdi:current-ac",
  voltage: "mdi:sine-wave", temperature: "mdi:thermometer",
  humidity: "mdi:water-percent", pressure: "mdi:gauge", battery: "mdi:battery",
  illuminance: "mdi:brightness-5", door: "mdi:door-open",
  window: "mdi:window-open", motion: "mdi:motion-sensor",
  smoke: "mdi:smoke-detector", gas: "mdi:gas-cylinder",
  moisture: "mdi:water-alert", occupancy: "mdi:home-account",
  presence: "mdi:home-account", connectivity: "mdi:lan-connect",
  problem: "mdi:alert-circle-outline", lock: "mdi:lock",
};

const ICON_PALETTE = [
  "mdi:lightbulb", "mdi:lightbulb-group", "mdi:ceiling-light", "mdi:lamp",
  "mdi:power-plug", "mdi:flash", "mdi:lightning-bolt", "mdi:solar-power",
  "mdi:home-battery", "mdi:transmission-tower", "mdi:thermometer",
  "mdi:snowflake", "mdi:fire", "mdi:air-conditioner", "mdi:fan",
  "mdi:water-percent", "mdi:weather-partly-cloudy", "mdi:shield-home",
  "mdi:shield-lock", "mdi:cctv", "mdi:door-open", "mdi:window-open",
  "mdi:motion-sensor", "mdi:bullhorn", "mdi:lock", "mdi:account",
  "mdi:account-group", "mdi:washing-machine", "mdi:tumble-dryer",
  "mdi:fridge", "mdi:stove", "mdi:coffee-maker", "mdi:television",
  "mdi:speaker", "mdi:router-wireless", "mdi:chip", "mdi:harddisk",
  "mdi:gauge", "mdi:chart-line", "mdi:hexagon-multiple-outline",
];

const SECTION_ICONS = [
  "mdi:shield-home", "mdi:flash", "mdi:thermostat", "mdi:lightbulb-group",
  "mdi:account-group", "mdi:chip", "mdi:sofa", "mdi:bed", "mdi:silverware-fork-knife",
  "mdi:shower", "mdi:balcony", "mdi:garage", "mdi:washing-machine",
  "mdi:television-classic", "mdi:water", "mdi:leaf", "mdi:car", "mdi:map-marker",
  "mdi:solar-power", "mdi:shape-outline",
];

/**
 * Blueprints used by "componi automaticamente".
 *
 * Each entry scores a candidate entity; the highest-scoring section wins, so
 * an entity lands in exactly one place instead of being duplicated across
 * every section that vaguely matches it. Score 0 = not a match.
 */
const SECTION_PRESETS = [
  {
    id: "sicurezza", title: "Sicurezza", icon: "mdi:shield-home", accent: "#ff3d71", limit: 10,
    score(id, st) {
      const d = domainOf(id), dc = st.attributes.device_class;
      if (d === "alarm_control_panel") return 100;
      if (d === "siren" || d === "lock") return 88;
      if (d === "binary_sensor" && ["door", "window", "motion", "smoke", "gas", "moisture", "tamper", "safety"].includes(dc)) return 85;
      if (d === "camera") return 70;
      return 0;
    },
    cardType: (id) => (domainOf(id) === "lock" || domainOf(id) === "siren" ? "control" : "status"),
  },
  {
    id: "energia", title: "Energia", icon: "mdi:flash", accent: "#ffd166", limit: 10,
    score(id, st) {
      const d = domainOf(id), dc = st.attributes.device_class;
      if (d !== "sensor") return 0;
      if (dc === "power") return 95;
      if (dc === "energy") return 90;
      if (dc === "current" || dc === "voltage") return 60;
      return 0;
    },
    cardType: () => "sensor",
  },
  {
    id: "clima", title: "Clima", icon: "mdi:thermostat", accent: "#00e5ff", limit: 10,
    score(id, st) {
      const d = domainOf(id), dc = st.attributes.device_class;
      if (d === "climate") return 100;
      if (d === "weather") return 80;
      if (d === "sensor" && (dc === "temperature" || dc === "humidity")) return 75;
      if (d === "humidifier" || d === "fan") return 65;
      return 0;
    },
    cardType: (id) => (domainOf(id) === "climate" ? "climate" : domainOf(id) === "sensor" ? "sensor" : "control"),
  },
  {
    id: "illuminazione", title: "Illuminazione", icon: "mdi:lightbulb-group", accent: "#c77dff", limit: 12,
    score(id, st) {
      const d = domainOf(id);
      const name = (st.attributes.friendly_name || id).toLowerCase();
      if (d === "light") return 100;
      if (d === "switch" && /luc|light|lamp|faretti|plafo/.test(name)) return 80;
      if (d === "scene" && /luc|light|lamp/.test(name)) return 55;
      return 0;
    },
    cardType: () => "control",
  },
  {
    id: "presenza", title: "Presenza", icon: "mdi:account-group", accent: "#06d6a0", limit: 8,
    score(id, st) {
      const d = domainOf(id);
      if (d === "person") return 100;
      if (d === "device_tracker") return 55;
      if (d === "binary_sensor" && ["occupancy", "presence"].includes(st.attributes.device_class)) return 70;
      return 0;
    },
    cardType: () => "status",
  },
  {
    id: "sistema", title: "Sistema", icon: "mdi:chip", accent: "#8d99ae", limit: 8,
    score(id, st) {
      const d = domainOf(id);
      const name = (st.attributes.friendly_name || id).toLowerCase();
      if (d === "sensor" && /processor|cpu|memory|memoria|disk|disco|uptime|temperatura del processore/.test(name)) return 85;
      if (d === "update") return 40;
      if (d === "binary_sensor" && st.attributes.device_class === "connectivity") return 60;
      return 0;
    },
    cardType: () => "sensor",
  },
];

const SIZE_SPAN = { sm: 3, md: 4, lg: 6, xl: 12 };
const SIZE_LABEL = { sm: "Piccola", md: "Media", lg: "Grande", xl: "Piena larghezza" };

const CARD_TYPES = [
  ["entity", "Entità — icona, nome e stato"],
  ["sensor", "Sensore — valore grande con unità"],
  ["control", "Controllo — interruttore on/off"],
  ["status", "Stato — badge colorato"],
  ["climate", "Clima — temperatura e modalità"],
  ["gauge", "Gauge — indicatore percentuale"],
  ["chart", "Grafico — andamento 24h"],
];

const ON_STATES = new Set(["on", "open", "unlocked", "home", "playing", "cleaning", "heat", "cool", "heat_cool", "dry", "fan_only", "auto"]);
const ALERT_STATES = new Set(["armed_away", "armed_home", "armed_night", "armed_vacation", "triggered", "unlocked", "open", "on"]);

function esc(v) {
  return String(v === undefined || v === null ? "" : v)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function domainOf(entityId) { return String(entityId || "").split(".")[0]; }
function uid(prefix) { return prefix + "-" + Math.random().toString(36).slice(2, 9); }

function autoIcon(entityId, st) {
  const dc = st && st.attributes && st.attributes.device_class;
  if (dc && DEVICE_CLASS_ICONS[dc]) return DEVICE_CLASS_ICONS[dc];
  return DOMAIN_ICONS[domainOf(entityId)] || "mdi:shape-outline";
}

function iconField(attr, key, value) {
  return `<div class="icon-editor-row">
      <ha-icon data-icon-preview icon="${esc(value)}"></ha-icon>
      <input ${attr}="${esc(key)}" data-icon-live value="${esc(value)}" placeholder="mdi:...">
    </div>
    <div class="icon-palette">${ICON_PALETTE.map((i) =>
      `<button type="button" class="icon-swatch" data-icon-pick="${esc(i)}" title="${esc(i)}"><ha-icon icon="${esc(i)}"></ha-icon></button>`
    ).join("")}</div>`;
}

/** Build an SVG sparkline path from numeric history points. */
function sparkline(points, w, h) {
  if (!points || points.length < 2) return "";
  let min = Math.min(...points), max = Math.max(...points);
  if (max === min) { max = min + 1; }
  const step = w / (points.length - 1);
  const y = (v) => h - ((v - min) / (max - min)) * h;
  const line = points.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <path class="spark-area" d="${area}"></path>
      <path class="spark-line" d="${line}"></path>
    </svg>`;
}

class CyborgDashboard extends HTMLElement {
  constructor() {
    super();
    this._dashboard = null;
    this._editing = false;
    this._selected = null;      // {kind:'card'|'section', sectionId, itemId?}
    this._saved = false;
    this._error = "";
    this._signature = "";
    this._history = {};
    this._pendingHistory = new Set();
    this._entityQuery = "";
  }

  set hass(value) {
    this._hass = value;
    if (!this._dashboard) { this._load(); return; }
    // Only repaint when something we actually display has changed. Without
    // this guard every unrelated state update in a 380-entity install would
    // rebuild the whole DOM and yank focus out of the editor mid-typing.
    const sig = this._buildSignature();
    if (sig !== this._signature) this.render();
  }

  connectedCallback() { if (this._hass && !this._dashboard) this._load(); }

  // ---------------------------------------------------------------- data ---

  _page() { return this._dashboard && this._dashboard.pages[0]; }
  _sections() { const p = this._page(); return (p && p.sections) || []; }
  _section(id) { return this._sections().find((s) => s.id === id) || null; }
  _card(sectionId, itemId) {
    const s = this._section(sectionId);
    return s ? s.items.find((i) => i.id === itemId) || null : null;
  }
  _selectedCard() {
    return this._selected && this._selected.kind === "card"
      ? this._card(this._selected.sectionId, this._selected.itemId) : null;
  }
  _selectedSection() {
    return this._selected && this._selected.kind === "section"
      ? this._section(this._selected.sectionId) : null;
  }

  _buildSignature() {
    if (!this._hass || !this._dashboard) return "";
    const parts = [this._editing ? "e" : "v", JSON.stringify(this._selected || null)];
    for (const s of this._sections()) {
      for (const it of s.items) {
        const st = this._hass.states[it.entity_id];
        parts.push(it.entity_id + "=" + (st ? st.state : "?"));
      }
    }
    return parts.join("|");
  }

  async _load() {
    try {
      const res = await this._hass.callWS({ type: "cyborg_dashboard/get" });
      this._dashboard = res.dashboard;
      this._error = "";
    } catch (err) {
      this._error = "Impossibile caricare la dashboard";
      this._dashboard = { version: 3, revision: 0, theme: { accent: "#00e5ff" },
        pages: [{ id: "home", title: "Cyborg", icon: "mdi:hexagon-multiple-outline", sections: [] }] };
    }
    this.render();
  }

  async _save() {
    try {
      const res = await this._hass.callWS({
        type: "cyborg_dashboard/save",
        dashboard: this._dashboard,
        expected_revision: this._dashboard.revision,
      });
      this._dashboard.revision = res.revision;
      this._error = "";
      this._saved = true;
      this.render();
      setTimeout(() => { this._saved = false; this.render(); }, 2200);
    } catch (err) {
      this._error = (err && err.message) || "Salvataggio non riuscito";
      this.render();
    }
  }

  _touch() { this._signature = ""; this.render(); }

  // ------------------------------------------------------------- mutation --

  _addSection(preset) {
    const base = preset || { title: "Nuova sezione", icon: "mdi:shape-outline", accent: null };
    const section = { id: uid("sec"), title: base.title, icon: base.icon,
      accent: base.accent || null, collapsed: false, items: [] };
    this._page().sections.push(section);
    this._selected = { kind: "section", sectionId: section.id };
    this._touch();
  }

  _removeSection(id) {
    const p = this._page();
    p.sections = p.sections.filter((s) => s.id !== id);
    if (this._selected && this._selected.sectionId === id) this._selected = null;
    this._touch();
  }

  _moveSection(id, delta) {
    const list = this._page().sections;
    const i = list.findIndex((s) => s.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this._touch();
  }

  _addCard(sectionId) {
    const section = this._section(sectionId);
    if (!section) return;
    const card = { id: uid("card"), type: "entity", entity_id: "", name: "",
      size: "md", appearance: {}, states: {}, actions: { tap: { action: "more-info" } } };
    section.items.push(card);
    this._selected = { kind: "card", sectionId, itemId: card.id };
    this._entityQuery = "";
    this._touch();
  }

  _removeCard(sectionId, itemId) {
    const section = this._section(sectionId);
    if (!section) return;
    section.items = section.items.filter((i) => i.id !== itemId);
    if (this._selected && this._selected.itemId === itemId) this._selected = null;
    this._touch();
  }

  _moveCard(sectionId, itemId, delta) {
    const section = this._section(sectionId);
    if (!section) return;
    const i = section.items.findIndex((x) => x.id === itemId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= section.items.length) return;
    [section.items[i], section.items[j]] = [section.items[j], section.items[i]];
    this._touch();
  }

  _reassignCard(fromId, itemId, toId) {
    if (fromId === toId) return;
    const from = this._section(fromId), to = this._section(toId);
    if (!from || !to) return;
    const i = from.items.findIndex((x) => x.id === itemId);
    if (i < 0) return;
    const [card] = from.items.splice(i, 1);
    to.items.push(card);
    this._selected = { kind: "card", sectionId: toId, itemId };
    this._touch();
  }

  /** Set a dotted path on the selected card / section. */
  _set(target, path, value) {
    const keys = path.split(".");
    let node = target;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof node[keys[i]] !== "object" || node[keys[i]] === null) node[keys[i]] = {};
      node = node[keys[i]];
    }
    node[keys[keys.length - 1]] = value;
    this._touch();
  }

  /**
   * Build a full dashboard from the live entity registry.
   *
   * Every candidate entity is scored against every preset and assigned to the
   * single best match, so nothing is duplicated. Unavailable/unknown entities
   * are skipped: seeding a brand-new dashboard with 62 "unavailable" tiles
   * would look broken even though it is technically accurate.
   */
  _autoCompose(replace) {
    const states = this._hass.states || {};
    const buckets = {};
    for (const preset of SECTION_PRESETS) buckets[preset.id] = [];

    for (const entityId of Object.keys(states)) {
      const st = states[entityId];
      if (!st || st.state === "unavailable" || st.state === "unknown") continue;
      if (st.attributes && st.attributes.hidden_by) continue;
      let best = null, bestScore = 0;
      for (const preset of SECTION_PRESETS) {
        const score = preset.score(entityId, st);
        if (score > bestScore) { bestScore = score; best = preset; }
      }
      if (best) buckets[best.id].push({ entityId, st, score: bestScore });
    }

    const page = this._page();
    const built = [];
    for (const preset of SECTION_PRESETS) {
      const chosen = buckets[preset.id]
        .sort((a, b) => b.score - a.score ||
          String(a.st.attributes.friendly_name || a.entityId)
            .localeCompare(String(b.st.attributes.friendly_name || b.entityId)))
        .slice(0, preset.limit);
      if (!chosen.length) continue;
      built.push({
        id: uid("sec"), title: preset.title, icon: preset.icon,
        accent: preset.accent, collapsed: false,
        items: chosen.map((c) => ({
          id: uid("card"),
          type: preset.cardType(c.entityId, c.st),
          entity_id: c.entityId,
          name: "",
          size: preset.cardType(c.entityId, c.st) === "climate" ? "lg" : "md",
          appearance: { icon: autoIcon(c.entityId, c.st) },
          states: {},
          actions: { tap: { action: domainOf(c.entityId) === "sensor" ? "more-info" : "toggle" } },
        })),
      });
    }

    page.sections = replace ? built : page.sections.concat(built);
    this._selected = null;
    this._touch();
  }

  // -------------------------------------------------------------- history --

  _requestHistory(entityId) {
    if (!entityId) return;
    const cached = this._history[entityId];
    if (cached && Date.now() - cached.ts < 300000) return;
    if (this._pendingHistory.has(entityId)) return;
    this._pendingHistory.add(entityId);
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 3600 * 1000);
    this._hass.callWS({
      type: "history/history_during_period",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      entity_ids: [entityId],
      minimal_response: true,
      no_attributes: true,
    }).then((res) => {
      const raw = (res && res[entityId]) || [];
      const points = raw.map((p) => parseFloat(p.s !== undefined ? p.s : p.state))
        .filter((n) => Number.isFinite(n));
      this._history[entityId] = { ts: Date.now(), points };
    }).catch(() => {
      this._history[entityId] = { ts: Date.now(), points: [] };
    }).then(() => {
      this._pendingHistory.delete(entityId);
      this._touch();
    });
  }

  // ------------------------------------------------------------ rendering --

  _cardBody(item, st) {
    const type = item.type || "entity";
    const attrs = (st && st.attributes) || {};
    const state = st ? st.state : "unavailable";
    const unit = attrs.unit_of_measurement || "";
    const isOn = ON_STATES.has(state);

    if (type === "control") {
      return `<div class="control-row">
          <span class="control-state">${esc(isOn ? "ACCESO" : "SPENTO")}</span>
          <span class="switch ${isOn ? "on" : ""}"><span class="knob"></span></span>
        </div>`;
    }
    if (type === "status") {
      const alert = ALERT_STATES.has(state);
      return `<div class="status-badge ${alert ? "alert" : ""}">
          <ha-icon icon="${esc(alert ? "mdi:alert-circle" : "mdi:check-circle")}"></ha-icon>
          <span>${esc(state.replace(/_/g, " "))}</span>
        </div>`;
    }
    if (type === "climate") {
      const cur = attrs.current_temperature, target = attrs.temperature;
      return `<div class="climate-body">
          <div class="value">${esc(cur !== undefined ? cur : state)}<span class="unit-inline">°C</span></div>
          <div class="climate-meta">
            <span><ha-icon icon="mdi:target"></ha-icon> ${esc(target !== undefined ? target + "°" : "—")}</span>
            <span><ha-icon icon="mdi:tune-variant"></ha-icon> ${esc(String(state).replace(/_/g, " "))}</span>
          </div>
        </div>`;
    }
    if (type === "gauge") {
      const num = parseFloat(state);
      const pct = Number.isFinite(num) ? Math.max(0, Math.min(100, num)) : 0;
      return `<div class="gauge">
          <div class="gauge-track"><div class="gauge-fill" style="width:${pct}%"></div></div>
          <div class="value gauge-value">${esc(Number.isFinite(num) ? num : state)}<span class="unit-inline">${esc(unit || "%")}</span></div>
        </div>`;
    }
    if (type === "chart") {
      this._requestHistory(item.entity_id);
      const hist = this._history[item.entity_id];
      const chart = hist && hist.points.length > 1
        ? sparkline(hist.points, 220, 54)
        : `<div class="chart-empty">${hist ? "STORICO NON DISPONIBILE" : "CARICAMENTO STORICO..."}</div>`;
      return `<div class="chart-body">
          <div class="value">${esc(state)}<span class="unit-inline">${esc(unit)}</span></div>
          ${chart}
        </div>`;
    }
    if (type === "sensor") {
      return `<div class="value">${esc(state)}<span class="unit-inline">${esc(unit)}</span></div>`;
    }
    return `<div class="value entity-value">${esc(String(state).replace(/_/g, " "))}${unit ? `<span class="unit-inline">${esc(unit)}</span>` : ""}</div>`;
  }

  _renderCard(item, section) {
    const st = this._hass.states[item.entity_id];
    const attrs = (st && st.attributes) || {};
    const state = st ? st.state : "unavailable";
    const name = item.name || attrs.friendly_name || item.entity_id || "Card non configurata";
    const app = item.appearance || {};
    const stateStyle = (item.states && (item.states[state] || item.states.default)) || {};
    const accent = stateStyle.accent || app.accent || section.accent || (this._dashboard.theme && this._dashboard.theme.accent) || "#00e5ff";
    const icon = stateStyle.icon || app.icon || autoIcon(item.entity_id, st || { attributes: {} });
    const span = SIZE_SPAN[item.size] || SIZE_SPAN.md;
    const glow = app.glow !== false;
    const pulse = stateStyle.animate ? " pulse" : "";
    const missing = !item.entity_id ? " missing" : "";
    const style = `--accent:${esc(accent)};grid-column:span ${span}`;
    const body = this._cardBody(item, st);
    const head = `<div class="head">
        ${item.show_icon === false ? "" : `<ha-icon class="card-icon" icon="${esc(icon)}"></ha-icon>`}
        <div class="head-text"><strong>${esc(name)}</strong>${
          item.show_state === false ? "" : `<small>${esc(stateStyle.label || String(state).replace(/_/g, " "))}</small>`}</div>
      </div>`;

    if (this._editing) {
      const selected = this._selected && this._selected.kind === "card" && this._selected.itemId === item.id;
      return `<article class="item editor-item${selected ? " selected" : ""}${missing}" style="${style}">
          ${head}${body}
          <div class="card-tools">
            <button class="mini" data-card-move="-1" data-sec="${esc(section.id)}" data-item="${esc(item.id)}" title="Sposta indietro"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <button class="mini" data-card-move="1" data-sec="${esc(section.id)}" data-item="${esc(item.id)}" title="Sposta avanti"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
            <button class="mini grow" data-select-card data-sec="${esc(section.id)}" data-item="${esc(item.id)}"><ha-icon icon="mdi:tune"></ha-icon> CONFIGURA</button>
            <button class="mini danger" data-card-remove data-sec="${esc(section.id)}" data-item="${esc(item.id)}" title="Elimina"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
          </div>
        </article>`;
    }
    return `<article class="item${pulse}${missing}" style="${style}${glow ? `;box-shadow:0 0 26px color-mix(in srgb, ${esc(accent)} 16%, transparent)` : ""}"
        data-tap data-sec="${esc(section.id)}" data-item="${esc(item.id)}">${head}${body}</article>`;
  }

  _renderSection(section, index, total) {
    const accent = section.accent || (this._dashboard.theme && this._dashboard.theme.accent) || "#00e5ff";
    const count = section.items.length;
    const selected = this._selected && this._selected.kind === "section" && this._selected.sectionId === section.id;
    const cards = section.items.map((i) => this._renderCard(i, section)).join("");

    const tools = this._editing ? `<div class="sec-tools">
        <button class="mini" data-sec-move="-1" data-sec="${esc(section.id)}" ${index === 0 ? "disabled" : ""} title="Sposta su"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button class="mini" data-sec-move="1" data-sec="${esc(section.id)}" ${index === total - 1 ? "disabled" : ""} title="Sposta giù"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
        <button class="mini" data-sec-config data-sec="${esc(section.id)}"><ha-icon icon="mdi:cog-outline"></ha-icon> SEZIONE</button>
        <button class="mini accentbtn" data-sec-addcard data-sec="${esc(section.id)}"><ha-icon icon="mdi:plus"></ha-icon> CARD</button>
        <button class="mini danger" data-sec-remove data-sec="${esc(section.id)}" title="Elimina sezione"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
      </div>` : "";

    const empty = this._editing
      ? `<button class="section-empty" data-sec-addcard data-sec="${esc(section.id)}"><ha-icon icon="mdi:plus-circle-outline"></ha-icon> Aggiungi la prima entità a “${esc(section.title)}”</button>`
      : "";

    return `<section class="dash-section${selected ? " sec-selected" : ""}" style="--accent:${esc(accent)}">
        <header class="sec-head">
          <button class="sec-toggle" data-sec-collapse data-sec="${esc(section.id)}" title="${section.collapsed ? "Espandi" : "Comprimi"}">
            <ha-icon icon="${section.collapsed ? "mdi:chevron-right" : "mdi:chevron-down"}"></ha-icon>
          </button>
          <ha-icon class="sec-icon" icon="${esc(section.icon || "mdi:shape-outline")}"></ha-icon>
          <h3>${esc(section.title)}</h3>
          <span class="sec-count">${count}</span>
          <span class="sec-rule"></span>
          ${tools}
        </header>
        ${section.collapsed ? "" : (count ? `<div class="grid">${cards}</div>` : empty)}
      </section>`;
  }

  // -------------------------------------------------------------- editor ---

  _entityResults() {
    const q = (this._entityQuery || "").trim().toLowerCase();
    if (!q) return `<div class="entity-result-empty">Digita almeno due caratteri per cercare tra le ${Object.keys(this._hass.states).length} entità.</div>`;
    if (q.length < 2) return `<div class="entity-result-empty">Continua a digitare...</div>`;
    const rows = [];
    for (const id of Object.keys(this._hass.states)) {
      const st = this._hass.states[id];
      const fn = String(st.attributes.friendly_name || "");
      const hay = (fn + " " + id).toLowerCase();
      const at = hay.indexOf(q);
      if (at < 0) continue;
      rows.push({ id, fn: fn || id, st, rank: (fn.toLowerCase().startsWith(q) ? 0 : id.toLowerCase().startsWith(q) ? 1 : 2) * 1000 + at });
      if (rows.length > 400) break;
    }
    rows.sort((a, b) => a.rank - b.rank || a.fn.localeCompare(b.fn));
    if (!rows.length) return `<div class="entity-result-empty">Nessun risultato per “${esc(q)}”.</div>`;
    return rows.slice(0, 12).map((r) => `<div class="entity-result-row" data-pick-entity="${esc(r.id)}">
        <ha-icon icon="${esc(autoIcon(r.id, r.st))}"></ha-icon>
        <div class="err-text"><strong>${esc(r.fn)}</strong><small>${esc(r.id)}</small></div>
        <span class="err-state">${esc(r.st.state)}</span>
      </div>`).join("");
  }

  _renderCardEditor(card) {
    const st = this._hass.states[card.entity_id];
    const app = card.appearance || {};
    const state = st ? st.state : "unknown";
    const sections = this._sections();
    const currentIcon = app.icon || autoIcon(card.entity_id, st || { attributes: {} });
    const tap = (card.actions && card.actions.tap && card.actions.tap.action) || "more-info";

    return `<aside class="editor">
      <div class="editor-title">
        <div><small>CARD</small><h2>${esc(card.name || (st && st.attributes.friendly_name) || card.entity_id || "Nuova card")}</h2></div>
        <button class="icon" data-close-editor><ha-icon icon="mdi:close"></ha-icon></button>
      </div>

      <div class="section">
        <strong>ENTITÀ</strong>
        ${card.entity_id ? `<div class="entity-current">
            <ha-icon icon="${esc(autoIcon(card.entity_id, st || { attributes: {} }))}"></ha-icon>
            <div><strong>${esc((st && st.attributes.friendly_name) || card.entity_id)}</strong><small>${esc(card.entity_id)}</small></div>
            <span class="err-state">${esc(state)}</span>
          </div>` : `<div class="warn">Nessuna entità collegata — la card resterà vuota.</div>`}
        <label>CERCA<input type="text" data-entity-search value="${esc(this._entityQuery)}" placeholder="nome o entity_id..." autocomplete="off"></label>
        <div class="entity-results" data-entity-results>${this._entityResults()}</div>
      </div>

      <div class="section">
        <strong>PRESENTAZIONE</strong>
        <label>TIPO<select data-prop="type">${CARD_TYPES.map(([v, l]) =>
          `<option value="${v}" ${card.type === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <label>DIMENSIONE<select data-prop="size">${Object.keys(SIZE_LABEL).map((v) =>
          `<option value="${v}" ${(card.size || "md") === v ? "selected" : ""}>${esc(SIZE_LABEL[v])}</option>`).join("")}</select></label>
        <label>NOME<input data-prop="name" value="${esc(card.name || "")}" placeholder="${esc((st && st.attributes.friendly_name) || "Nome automatico")}"></label>
        <label>SEZIONE<select data-move-section>${sections.map((s) =>
          `<option value="${esc(s.id)}" ${s.id === this._selected.sectionId ? "selected" : ""}>${esc(s.title)}</option>`).join("")}</select></label>
        <label>ICONA${iconField("data-prop", "appearance.icon", currentIcon)}</label>
      </div>

      <div class="section">
        <strong>STILE</strong>
        <label>COLORE ACCENTO<input type="color" data-prop="appearance.accent" value="${esc(app.accent || (this._section(this._selected.sectionId) || {}).accent || "#00e5ff")}"></label>
        <label class="check"><input type="checkbox" data-prop="appearance.glow" ${app.glow !== false ? "checked" : ""}> Bagliore neon</label>
        <label class="check"><input type="checkbox" data-prop="show_icon" ${card.show_icon !== false ? "checked" : ""}> Mostra icona</label>
        <label class="check"><input type="checkbox" data-prop="show_state" ${card.show_state !== false ? "checked" : ""}> Mostra stato sotto il nome</label>
      </div>

      <div class="section">
        <strong>STATO CORRENTE · ${esc(String(state).toUpperCase())}</strong>
        <span class="hint">Queste impostazioni si applicano solo quando l'entità è in questo stato.</span>
        <label>COLORE<input type="color" data-state-prop="${esc(state)}.accent" value="${esc((card.states[state] && card.states[state].accent) || app.accent || "#00e5ff")}"></label>
        <label>ETICHETTA<input data-state-prop="${esc(state)}.label" value="${esc((card.states[state] && card.states[state].label) || "")}" placeholder="${esc(state)}"></label>
        <label class="check"><input type="checkbox" data-state-prop="${esc(state)}.animate" ${(card.states[state] && card.states[state].animate) ? "checked" : ""}> Animazione pulsante</label>
      </div>

      <div class="section">
        <strong>AZIONE AL TOCCO</strong>
        <select data-prop="actions.tap.action">
          ${[["more-info", "Apri dettagli"], ["toggle", "Accendi/Spegni"], ["turn_on", "Accendi"], ["turn_off", "Spegni"], ["none", "Nessuna"]]
            .map(([v, l]) => `<option value="${v}" ${tap === v ? "selected" : ""}>${esc(l)}</option>`).join("")}
        </select>
      </div>

      <button class="delete" data-card-remove data-sec="${esc(this._selected.sectionId)}" data-item="${esc(card.id)}">ELIMINA CARD</button>
    </aside>`;
  }

  _renderSectionEditor(section) {
    return `<aside class="editor">
      <div class="editor-title">
        <div><small>SEZIONE</small><h2>${esc(section.title)}</h2></div>
        <button class="icon" data-close-editor><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
      <div class="section">
        <label>TITOLO<input data-sec-prop="title" value="${esc(section.title)}"></label>
        <label>COLORE ACCENTO<input type="color" data-sec-prop="accent" value="${esc(section.accent || "#00e5ff")}"></label>
        <label>ICONA
          <div class="icon-editor-row">
            <ha-icon data-icon-preview icon="${esc(section.icon)}"></ha-icon>
            <input data-sec-prop="icon" data-icon-live value="${esc(section.icon)}" placeholder="mdi:...">
          </div>
          <div class="icon-palette">${SECTION_ICONS.map((i) =>
            `<button type="button" class="icon-swatch" data-icon-pick="${esc(i)}" title="${esc(i)}"><ha-icon icon="${esc(i)}"></ha-icon></button>`).join("")}</div>
        </label>
      </div>
      <div class="section">
        <strong>CONTENUTO</strong>
        <span class="hint">${section.items.length} card in questa sezione.</span>
        <button class="secondary wide" data-sec-addcard data-sec="${esc(section.id)}"><ha-icon icon="mdi:plus"></ha-icon> AGGIUNGI CARD</button>
      </div>
      <button class="delete" data-sec-remove data-sec="${esc(section.id)}">ELIMINA SEZIONE</button>
    </aside>`;
  }

  _renderPageEditor() {
    const p = this._page();
    return `<aside class="editor">
      <div class="editor-title"><div><small>PAGINA</small><h2>Struttura</h2></div></div>
      <div class="section">
        <label>TITOLO<input data-page-prop="title" value="${esc(p.title || "")}" placeholder="Cyborg"></label>
        <label>ICONA${iconField("data-page-prop", "icon", p.icon || "mdi:hexagon-multiple-outline")}</label>
        <label>COLORE TEMA<input type="color" data-theme-prop="accent" value="${esc((this._dashboard.theme && this._dashboard.theme.accent) || "#00e5ff")}"></label>
      </div>
      <div class="section">
        <strong>SEZIONI</strong>
        <span class="hint">Clicca “SEZIONE” su un blocco per configurarlo, oppure aggiungine uno nuovo.</span>
        <div class="preset-grid">${SECTION_PRESETS.map((pr) =>
          `<button type="button" class="preset" data-add-preset="${esc(pr.id)}" style="--accent:${esc(pr.accent)}">
             <ha-icon icon="${esc(pr.icon)}"></ha-icon><span>${esc(pr.title)}</span></button>`).join("")}
          <button type="button" class="preset" data-add-preset="__blank"><ha-icon icon="mdi:plus"></ha-icon><span>Vuota</span></button>
        </div>
      </div>
      <div class="section">
        <strong>COMPOSIZIONE AUTOMATICA</strong>
        <span class="hint">Analizza le ${Object.keys(this._hass.states).length} entità di Home Assistant e costruisce le sezioni con le entità più rilevanti già collegate.</span>
        <button class="secondary wide" data-autocompose="add"><ha-icon icon="mdi:auto-fix"></ha-icon> AGGIUNGI SEZIONI COMPOSTE</button>
        <button class="secondary wide danger-outline" data-autocompose="replace"><ha-icon icon="mdi:refresh"></ha-icon> RIGENERA DA ZERO</button>
      </div>
    </aside>`;
  }

  _renderEditor() {
    const card = this._selectedCard();
    if (card) return this._renderCardEditor(card);
    const section = this._selectedSection();
    if (section) return this._renderSectionEditor(section);
    return this._renderPageEditor();
  }

  // -------------------------------------------------------------- render ---

  render() {
    if (!this._hass || !this._dashboard) return;
    this._signature = this._buildSignature();

    // Preserve editor focus + caret across the innerHTML swap, otherwise
    // typing in a text field is interrupted every time a state arrives.
    const active = this.querySelector(":focus");
    const focusKey = active && (active.getAttribute("data-prop") || active.getAttribute("data-sec-prop")
      || active.getAttribute("data-page-prop") || (active.hasAttribute("data-entity-search") ? "__search" : null));
    const caret = active && active.selectionStart;

    const p = this._page();
    const sections = this._sections();
    const theme = this._dashboard.theme || {};
    const total = sections.reduce((n, s) => n + s.items.length, 0);

    const body = sections.length
      ? sections.map((s, i) => this._renderSection(s, i, sections.length)).join("")
      : `<div class="bootstrap">
           <ha-icon icon="mdi:view-dashboard-outline"></ha-icon>
           <h2>Dashboard vuota</h2>
           <p>Costruisci la struttura in un click: Cyborg analizza le tue entità e crea le sezioni Sicurezza, Energia, Clima, Illuminazione, Presenza e Sistema già popolate.</p>
           <button data-autocompose="replace"><ha-icon icon="mdi:auto-fix"></ha-icon> COMPONI AUTOMATICAMENTE</button>
         </div>`;

    this.innerHTML = `<style>${this._css()}</style>
      <div class="shell" style="--accent:${esc(theme.accent || "#00e5ff")}">
        <header class="top">
          <div class="brand">
            <ha-icon class="brand-icon" icon="${esc(p.icon || "mdi:hexagon-multiple-outline")}"></ha-icon>
            <div>
              <h1>${esc(p.title || "Cyborg")}</h1>
              <div class="sub">${sections.length} SEZIONI · ${total} CARD · ${this._editing ? "MODIFICA ATTIVA" : "SISTEMA ONLINE"}</div>
            </div>
          </div>
          <div class="tools">
            ${this._saved ? '<span class="status ok"><ha-icon icon="mdi:check"></ha-icon> SALVATO</span>' : ""}
            ${this._error ? `<span class="status err">${esc(this._error)}</span>` : ""}
            ${this._editing ? `<button class="secondary" data-add-section><ha-icon icon="mdi:plus-box-outline"></ha-icon> SEZIONE</button>
               <button data-save><ha-icon icon="mdi:content-save"></ha-icon> SALVA</button>` : ""}
            <button class="secondary" data-toggle-edit>
              <ha-icon icon="${this._editing ? "mdi:eye-outline" : "mdi:pencil-outline"}"></ha-icon>
              ${this._editing ? "ESCI" : "MODIFICA"}
            </button>
          </div>
        </header>
        <div class="workspace ${this._editing ? "editing" : ""}">
          <main>${body}</main>
          ${this._editing ? this._renderEditor() : ""}
        </div>
      </div>`;

    this._bind();
    if (focusKey) {
      const sel = focusKey === "__search" ? "[data-entity-search]"
        : `[data-prop="${focusKey}"],[data-sec-prop="${focusKey}"],[data-page-prop="${focusKey}"]`;
      const el = this.querySelector(sel);
      if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* non-text input */ } }
    }
  }

  // ---------------------------------------------------------------- bind ---

  _bind() {
    const q = (s) => this.querySelector(s);
    const all = (s) => Array.from(this.querySelectorAll(s));
    const card = this._selectedCard();
    const section = this._selectedSection();

    const btn = q("[data-toggle-edit]");
    if (btn) btn.onclick = () => { this._editing = !this._editing; this._selected = null; this._touch(); };
    const save = q("[data-save]");
    if (save) save.onclick = () => this._save();
    const addSec = q("[data-add-section]");
    if (addSec) addSec.onclick = () => this._addSection(null);

    all("[data-autocompose]").forEach((el) => {
      el.onclick = () => this._autoCompose(el.getAttribute("data-autocompose") === "replace");
    });
    all("[data-add-preset]").forEach((el) => {
      el.onclick = () => {
        const key = el.getAttribute("data-add-preset");
        this._addSection(key === "__blank" ? null : SECTION_PRESETS.find((p) => p.id === key));
      };
    });

    // --- section controls
    all("[data-sec-move]").forEach((el) => {
      el.onclick = () => this._moveSection(el.getAttribute("data-sec"), parseInt(el.getAttribute("data-sec-move"), 10));
    });
    all("[data-sec-remove]").forEach((el) => {
      el.onclick = () => this._removeSection(el.getAttribute("data-sec"));
    });
    all("[data-sec-config]").forEach((el) => {
      el.onclick = () => { this._selected = { kind: "section", sectionId: el.getAttribute("data-sec") }; this._touch(); };
    });
    all("[data-sec-addcard]").forEach((el) => {
      el.onclick = () => this._addCard(el.getAttribute("data-sec"));
    });
    all("[data-sec-collapse]").forEach((el) => {
      el.onclick = () => {
        const s = this._section(el.getAttribute("data-sec"));
        if (s) { s.collapsed = !s.collapsed; this._touch(); }
      };
    });

    // --- card controls
    all("[data-select-card]").forEach((el) => {
      el.onclick = () => {
        this._selected = { kind: "card", sectionId: el.getAttribute("data-sec"), itemId: el.getAttribute("data-item") };
        this._entityQuery = "";
        this._touch();
      };
    });
    all("[data-card-remove]").forEach((el) => {
      el.onclick = () => this._removeCard(el.getAttribute("data-sec"), el.getAttribute("data-item"));
    });
    all("[data-card-move]").forEach((el) => {
      el.onclick = () => this._moveCard(el.getAttribute("data-sec"), el.getAttribute("data-item"), parseInt(el.getAttribute("data-card-move"), 10));
    });
    all("[data-tap]").forEach((el) => {
      el.onclick = () => this._tap(el.getAttribute("data-sec"), el.getAttribute("data-item"));
    });

    const close = q("[data-close-editor]");
    if (close) close.onclick = () => { this._selected = null; this._touch(); };

    // --- page + theme
    all("[data-page-prop]").forEach((el) => {
      el.onchange = () => this._set(this._page(), el.getAttribute("data-page-prop"), el.value);
    });
    all("[data-theme-prop]").forEach((el) => {
      el.onchange = () => this._set(this._dashboard.theme, el.getAttribute("data-theme-prop"), el.value);
    });

    // --- section props
    if (section) {
      all("[data-sec-prop]").forEach((el) => {
        el.onchange = () => this._set(section, el.getAttribute("data-sec-prop"), el.value);
      });
    }

    // --- card props
    if (card) {
      all("[data-prop]").forEach((el) => {
        el.onchange = () => {
          const path = el.getAttribute("data-prop");
          this._set(card, path, el.type === "checkbox" ? el.checked : el.value);
        };
      });
      all("[data-state-prop]").forEach((el) => {
        el.onchange = () => {
          const path = el.getAttribute("data-state-prop");
          this._set(card.states, path, el.type === "checkbox" ? el.checked : el.value);
        };
      });
      const move = q("[data-move-section]");
      if (move) move.onchange = () => this._reassignCard(this._selected.sectionId, card.id, move.value);

      const search = q("[data-entity-search]");
      if (search) {
        search.oninput = () => {
          this._entityQuery = search.value;
          const box = q("[data-entity-results]");
          if (box) { box.innerHTML = this._entityResults(); this._bindEntityRows(); }
        };
      }
      this._bindEntityRows();
    }

    // --- live icon preview (no full re-render: keeps the field focused)
    all("[data-icon-live]").forEach((el) => {
      el.oninput = () => {
        const preview = el.parentElement.querySelector("[data-icon-preview]");
        if (preview) preview.setAttribute("icon", el.value);
      };
    });
    all("[data-icon-pick]").forEach((el) => {
      el.onclick = () => {
        const wrap = el.closest("label") || el.parentElement.parentElement;
        const input = wrap && wrap.querySelector("[data-icon-live]");
        if (!input) return;
        input.value = el.getAttribute("data-icon-pick");
        input.dispatchEvent(new Event("input"));
        input.dispatchEvent(new Event("change"));
      };
    });
  }

  _bindEntityRows() {
    Array.from(this.querySelectorAll("[data-pick-entity]")).forEach((row) => {
      row.onclick = () => {
        const c = this._selectedCard();
        if (!c) return;
        const id = row.getAttribute("data-pick-entity");
        c.entity_id = id;
        const st = this._hass.states[id];
        if (!c.appearance.icon) c.appearance.icon = autoIcon(id, st);
        this._entityQuery = "";
        this._touch();
      };
    });
  }

  _tap(sectionId, itemId) {
    const card = this._card(sectionId, itemId);
    if (!card || !card.entity_id) return;
    const action = (card.actions && card.actions.tap && card.actions.tap.action) || "more-info";
    if (action === "none") return;
    if (action === "more-info") {
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: card.entity_id }, bubbles: true, composed: true,
      }));
      return;
    }
    const domain = domainOf(card.entity_id);
    const serviceDomain = ["switch", "light", "fan", "input_boolean", "siren", "automation", "script", "climate", "cover", "lock", "media_player"].includes(domain)
      ? domain : "homeassistant";
    this._hass.callService(serviceDomain, action, { entity_id: card.entity_id });
  }

  // ----------------------------------------------------------------- css ---

  _css() {
    const theme = this._dashboard.theme || {};
    return `
:host{display:block;min-height:100vh;background:${theme.background || "var(--primary-background-color)"};color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,Inter,Roboto,system-ui,sans-serif)}
.shell{max-width:1780px;margin:0 auto;padding:22px 22px 60px;box-sizing:border-box}
*,*::before,*::after{box-sizing:border-box}
.top{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:26px;padding-bottom:18px;border-bottom:1px solid color-mix(in srgb,var(--accent) 22%,transparent)}
.brand{display:flex;align-items:center;gap:14px}
.brand-icon{--mdc-icon-size:32px;color:var(--accent);filter:drop-shadow(0 0 12px color-mix(in srgb,var(--accent) 60%,transparent))}
h1{margin:0;font-size:clamp(22px,3vw,32px);letter-spacing:-.03em;font-weight:750}
.sub{margin-top:4px;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:2px;opacity:.5}
.tools{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
button{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:11px;padding:10px 15px;background:var(--accent);color:#03131a;cursor:pointer;font:inherit;font-size:12px;font-weight:700;letter-spacing:.08em;transition:filter .18s,transform .18s}
button:hover{filter:brightness(1.12)}
button:active{transform:translateY(1px)}
button ha-icon{--mdc-icon-size:17px}
button.secondary{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--primary-text-color);border:1px solid color-mix(in srgb,var(--accent) 34%,transparent)}
button.icon{background:transparent;border:1px solid var(--divider-color);color:var(--primary-text-color);padding:7px}
button:disabled{opacity:.28;cursor:default}
.status{display:inline-flex;align-items:center;gap:5px;font:11px ui-monospace,monospace;letter-spacing:1.5px;padding:7px 11px;border-radius:9px}
.status.ok{color:#06d6a0;background:rgba(6,214,160,.12)}
.status.err{color:#ff8091;background:rgba(255,61,113,.12)}
.status ha-icon{--mdc-icon-size:15px}
.workspace{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:start}
.workspace.editing{grid-template-columns:minmax(0,1fr) 380px}
main{display:flex;flex-direction:column;gap:30px;min-width:0}

.dash-section{--accent:#00e5ff}
.sec-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.sec-toggle{background:transparent;border:0;padding:2px;color:var(--accent);cursor:pointer}
.sec-toggle ha-icon{--mdc-icon-size:20px}
.sec-icon{--mdc-icon-size:20px;color:var(--accent);filter:drop-shadow(0 0 8px color-mix(in srgb,var(--accent) 55%,transparent))}
.sec-head h3{margin:0;font-size:13px;font-weight:750;letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}
.sec-count{font:10px ui-monospace,monospace;padding:2px 8px;border-radius:99px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}
.sec-rule{flex:1;height:1px;background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 40%,transparent),transparent)}
.sec-tools{display:flex;gap:6px;flex-wrap:wrap}
.sec-selected .sec-head h3::after{content:" ◂ IN MODIFICA";font-size:9px;opacity:.6;letter-spacing:.1em}
button.mini{padding:6px 9px;font-size:10px;letter-spacing:.06em;border-radius:8px;background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--primary-text-color);border:1px solid color-mix(in srgb,var(--accent) 26%,transparent)}
button.mini ha-icon{--mdc-icon-size:14px}
button.mini.accentbtn{background:var(--accent);color:#03131a;border-color:transparent}
button.mini.danger{color:#ff8091;border-color:rgba(255,61,113,.4);background:rgba(255,61,113,.1)}
button.mini.grow{flex:1;justify-content:center}

.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:${theme.gap || 16}px}
.item{--accent:#00e5ff;position:relative;display:flex;flex-direction:column;min-height:118px;padding:16px 17px;border-radius:${theme.radius || 16}px;background:linear-gradient(158deg,color-mix(in srgb,var(--accent) 7%,var(--card-background-color)),var(--card-background-color));border:1px solid color-mix(in srgb,var(--accent) 26%,transparent);overflow:hidden;transition:transform .18s,border-color .18s}
.item::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--accent);opacity:.85}
.item[data-tap]{cursor:pointer}
.item[data-tap]:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--accent) 55%,transparent)}
.item.missing{border-style:dashed;opacity:.7}
.item.pulse{animation:cyPulse 1.9s ease-in-out infinite}
@keyframes cyPulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.28)}}
.head{display:flex;align-items:flex-start;gap:11px}
.card-icon{--mdc-icon-size:22px;color:var(--accent);flex-shrink:0;margin-top:1px}
.head-text{min-width:0}
.head-text strong{display:block;font-size:13px;font-weight:650;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.head-text small{display:block;margin-top:2px;font:10px ui-monospace,monospace;letter-spacing:1px;opacity:.45;text-transform:uppercase}
.value{margin-top:auto;padding-top:14px;font-size:30px;font-weight:750;line-height:1;color:var(--accent);letter-spacing:-.03em}
.entity-value{font-size:20px;text-transform:capitalize}
.unit-inline{font-size:14px;font-weight:500;opacity:.55;margin-left:5px}
.control-row{margin-top:auto;padding-top:16px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.control-state{font:10px ui-monospace,monospace;letter-spacing:2px;opacity:.6}
.switch{width:46px;height:26px;border-radius:13px;background:rgba(255,255,255,.14);position:relative;flex-shrink:0;transition:background .22s}
.switch .knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .22s;box-shadow:0 1px 3px rgba(0,0,0,.45)}
.switch.on{background:var(--accent)}
.switch.on .knob{left:23px}
.status-badge{margin-top:auto;padding-top:16px;display:flex;align-items:center;gap:7px}
.status-badge ha-icon{--mdc-icon-size:17px;color:#06d6a0}
.status-badge span{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#06d6a0}
.status-badge.alert ha-icon,.status-badge.alert span{color:var(--accent)}
.climate-body{margin-top:auto;padding-top:12px}
.climate-body .value{margin-top:0;padding-top:0}
.climate-meta{display:flex;gap:14px;margin-top:8px;font:10px ui-monospace,monospace;letter-spacing:1px;opacity:.55}
.climate-meta ha-icon{--mdc-icon-size:13px;vertical-align:-2px}
.gauge{margin-top:auto;padding-top:14px}
.gauge-track{height:6px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}
.gauge-fill{height:100%;background:var(--accent);border-radius:99px;transition:width .5s ease}
.gauge-value{margin-top:10px;padding-top:0;font-size:24px}
.chart-body{margin-top:auto;padding-top:10px}
.chart-body .value{margin-top:0;padding-top:0;font-size:24px}
.spark{width:100%;height:52px;margin-top:6px;display:block;overflow:visible}
.spark-line{fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.spark-area{fill:color-mix(in srgb,var(--accent) 16%,transparent);stroke:none}
.chart-empty{margin-top:12px;font:9px ui-monospace,monospace;letter-spacing:1.5px;opacity:.35}
.card-tools{display:flex;gap:5px;margin-top:12px;padding-top:11px;border-top:1px solid color-mix(in srgb,var(--accent) 18%,transparent)}
.editor-item{outline:1px dashed color-mix(in srgb,var(--accent) 40%,transparent);outline-offset:-1px}
.editor-item.selected{outline:2px solid var(--accent)}
.section-empty{width:100%;justify-content:center;padding:24px;border-radius:14px;border:1px dashed color-mix(in srgb,var(--accent) 34%,transparent);background:color-mix(in srgb,var(--accent) 5%,transparent);color:var(--primary-text-color);font-size:12px;letter-spacing:.04em}
.bootstrap{text-align:center;padding:70px 24px;border:1px dashed color-mix(in srgb,var(--accent) 34%,transparent);border-radius:20px;background:color-mix(in srgb,var(--accent) 4%,transparent)}
.bootstrap ha-icon{--mdc-icon-size:46px;color:var(--accent);opacity:.75}
.bootstrap h2{margin:14px 0 8px;font-size:20px}
.bootstrap p{margin:0 auto 22px;max-width:520px;opacity:.6;font-size:13px;line-height:1.6}

.editor{position:sticky;top:16px;max-height:calc(100vh - 32px);overflow-y:auto;padding:18px;border-radius:18px;background:linear-gradient(168deg,color-mix(in srgb,var(--accent) 6%,var(--card-background-color)),var(--card-background-color));border:1px solid color-mix(in srgb,var(--accent) 28%,transparent);box-shadow:0 18px 50px rgba(0,0,0,.35)}
.editor-title{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px}
.editor-title small,.editor .section>strong{display:block;font:10px ui-monospace,monospace;letter-spacing:.22em;color:var(--accent)}
.editor-title h2{margin:6px 0 0;font-size:17px;line-height:1.3}
.editor .section{border-top:1px solid color-mix(in srgb,var(--accent) 16%,transparent);margin-top:16px;padding-top:15px}
.editor label{display:block;margin:12px 0 0;font:10px ui-monospace,monospace;letter-spacing:.14em;opacity:.65;text-transform:uppercase}
.editor input,.editor select{display:block;width:100%;margin-top:6px;padding:10px;border-radius:9px;border:1px solid var(--divider-color);background:color-mix(in srgb,var(--card-background-color) 60%,#000);color:var(--primary-text-color);font:inherit;font-size:13px}
.editor input:focus,.editor select:focus{outline:0;border-color:var(--accent)}
.editor input[type=color]{padding:2px;height:38px;cursor:pointer}
.editor label.check{display:flex;align-items:center;gap:9px;text-transform:none;letter-spacing:0;font-size:12px;font-family:inherit;opacity:.85}
.editor label.check input{width:auto;margin:0}
.hint{display:block;margin-top:7px;font-size:11px;line-height:1.5;opacity:.45}
.warn{margin-top:8px;padding:9px 11px;border-radius:9px;font-size:11.5px;background:rgba(255,209,102,.12);color:#ffd166;border:1px solid rgba(255,209,102,.3)}
button.wide{width:100%;justify-content:center;margin-top:10px}
button.danger-outline{background:transparent;border:1px solid rgba(255,61,113,.4);color:#ff8091}
.delete{width:100%;justify-content:center;margin-top:20px;background:rgba(255,61,113,.14);color:#ff8091;border:1px solid rgba(255,61,113,.32)}
.entity-current{display:flex;align-items:center;gap:10px;margin-top:8px;padding:10px;border-radius:10px;background:color-mix(in srgb,var(--accent) 8%,transparent);border:1px solid color-mix(in srgb,var(--accent) 24%,transparent)}
.entity-current ha-icon{--mdc-icon-size:20px;color:var(--accent);flex-shrink:0}
.entity-current strong{display:block;font-size:12.5px}
.entity-current small{display:block;opacity:.45;font:10px ui-monospace,monospace}
.err-state{margin-left:auto;font:10px ui-monospace,monospace;padding:3px 7px;border-radius:6px;background:rgba(255,255,255,.07);opacity:.7;flex-shrink:0}
.entity-results{margin-top:8px;max-height:300px;overflow-y:auto;border-radius:10px;border:1px solid var(--divider-color);background:color-mix(in srgb,var(--card-background-color) 60%,#000)}
.entity-result-row{display:flex;align-items:center;gap:10px;padding:9px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05)}
.entity-result-row:last-child{border-bottom:0}
.entity-result-row:hover{background:color-mix(in srgb,var(--accent) 14%,transparent)}
.entity-result-row ha-icon{--mdc-icon-size:18px;color:var(--accent);flex-shrink:0}
.err-text{min-width:0;flex:1}
.err-text strong{display:block;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.err-text small{display:block;opacity:.45;font:10px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.entity-result-empty{padding:12px;font-size:11.5px;opacity:.45;line-height:1.5}
.icon-editor-row{display:flex;gap:9px;align-items:center;margin-top:6px}
.icon-editor-row ha-icon{--mdc-icon-size:20px;flex-shrink:0;width:38px;height:38px;padding:9px;border-radius:9px;background:color-mix(in srgb,var(--accent) 10%,transparent);border:1px solid color-mix(in srgb,var(--accent) 26%,transparent);color:var(--accent)}
.icon-editor-row input{margin-top:0}
.icon-palette{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.icon-swatch{padding:7px;border-radius:8px;background:transparent;border:1px solid var(--divider-color);color:var(--primary-text-color);opacity:.55}
.icon-swatch:hover{opacity:1;border-color:var(--accent);color:var(--accent)}
.icon-swatch ha-icon{--mdc-icon-size:17px;display:block}
.preset-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:10px}
.preset{--accent:#00e5ff;flex-direction:column;gap:5px;padding:12px 8px;background:color-mix(in srgb,var(--accent) 10%,transparent);border:1px solid color-mix(in srgb,var(--accent) 28%,transparent);color:var(--primary-text-color);font-size:10px;letter-spacing:.06em}
.preset ha-icon{--mdc-icon-size:20px;color:var(--accent)}

@media(max-width:1200px){.workspace.editing{grid-template-columns:minmax(0,1fr)}.editor{position:relative;top:0;max-height:none}}
@media(max-width:820px){.shell{padding:14px 14px 40px}.grid{grid-template-columns:repeat(6,minmax(0,1fr))}.item{grid-column:span 6!important}.top{align-items:flex-start}}
`;
  }
}

if (!customElements.get("cyborg-dashboard")) {
  customElements.define("cyborg-dashboard", CyborgDashboard);
}
