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


/* ==========================================================================
 * FLOORPLAN (mappa 3D)
 *
 * The 3D house is rendered with pure CSS 3D transforms — no Three.js, no
 * Babylon.js, no WebGL, no vendored library of any kind. Rationale:
 *  - zero third-party code means zero licensing and zero supply-chain risk on
 *    a product that gets resold to clients;
 *  - CSS 3D transforms are GPU-composited, so an extruded floorplan runs at
 *    60fps even on the cheap wall tablets this is aimed at, where a WebGL
 *    scene would drain battery and stutter;
 *  - the geometry of a flat is boxes. A polygon renderer buys nothing here.
 * A .glb/WebGL renderer can be added later as a second `engine` without
 * changing the room schema.
 * ======================================================================== */

/** Which entities deserve a badge in a room, and how important each one is. */
const BADGE_PRIORITY = [
  { test: (d, dc) => d === "climate", score: 100, kind: "climate" },
  { test: (d, dc) => d === "light", score: 95, kind: "toggle" },
  { test: (d, dc) => d === "sensor" && dc === "temperature", score: 90, kind: "value" },
  { test: (d, dc) => d === "cover", score: 82, kind: "cover" },
  { test: (d, dc) => d === "binary_sensor" && ["door", "window", "motion", "occupancy"].includes(dc), score: 80, kind: "binary" },
  { test: (d, dc) => d === "sensor" && dc === "humidity", score: 74, kind: "value" },
  { test: (d, dc) => d === "sensor" && dc === "power", score: 70, kind: "value" },
  { test: (d, dc) => d === "switch", score: 65, kind: "toggle" },
  { test: (d, dc) => d === "fan", score: 60, kind: "toggle" },
  { test: (d, dc) => d === "media_player", score: 52, kind: "toggle" },
  { test: (d, dc) => d === "lock", score: 50, kind: "binary" },
  { test: (d, dc) => d === "camera", score: 40, kind: "plain" },
  { test: (d, dc) => d === "sensor" && dc === "illuminance", score: 34, kind: "value" },
];

const MAX_BADGES_PER_ROOM = 6;

/** Palette cycled through when rooms are generated from HA areas. */
const ROOM_COLORS = ["#00e5ff", "#c77dff", "#ffd166", "#06d6a0", "#ff8fab", "#8ecae6", "#ffb703", "#a0e7a0"];

/** Icon guessed from an area name, so auto-generated rooms are not all identical. */
const ROOM_ICON_HINTS = [
  [/bagn|doccia|wc|toilet/i, "mdi:shower"],
  [/cucin|kitchen/i, "mdi:silverware-fork-knife"],
  [/soggiorn|salott|living/i, "mdi:sofa"],
  [/camera|letto|bedroom/i, "mdi:bed"],
  [/balcon|terrazz|giardin|balcony/i, "mdi:flower"],
  [/garage|box|auto/i, "mdi:garage"],
  [/studio|ufficio|office/i, "mdi:desk"],
  [/ingress|corrido|entrata|hall/i, "mdi:door-open"],
  [/lavander|laundry/i, "mdi:washing-machine"],
  [/cantina|taverna|basement/i, "mdi:stairs-down"],
  [/sala|pranzo|dining/i, "mdi:table-chair"],
];

function roomIconFor(name) {
  for (const [re, icon] of ROOM_ICON_HINTS) if (re.test(name || "")) return icon;
  return "mdi:floor-plan";
}

/**
 * Screen-delta -> plan-delta for dragging a room while the world is rotated.
 *
 * The world is transformed as scale(zoom) rotateX(pitch) rotateZ(yaw), so a
 * plan point p maps to screen by
 *     M = zoom * [[cosY, -sinY], [cosP*sinY, cosP*cosY]]
 * Dragging needs the inverse, otherwise grabbing a room and moving the mouse
 * right would slide it diagonally. Perspective divide is deliberately ignored:
 * it is a sub-pixel effect at these camera angles and inverting the full
 * homography would not measurably improve the feel.
 */
function unprojectDelta(dx, dy, yawDeg, pitchDeg, zoom) {
  const y = (yawDeg * Math.PI) / 180;
  const cP = Math.max(0.08, Math.cos((pitchDeg * Math.PI) / 180));
  const cY = Math.cos(y), sY = Math.sin(y);
  const k = 1 / (zoom * cP);
  return { dx: k * (cP * cY * dx + sY * dy), dy: k * (-cP * sY * dx + cY * dy) };
}

const DEVICE_CLASS_LABELS = {
  power: "Potenza", energy: "Energia", current: "Corrente", voltage: "Tensione",
  temperature: "Temperatura", humidity: "Umidità", pressure: "Pressione",
  battery: "Batteria", illuminance: "Luminosità", signal_strength: "Segnale",
  door: "Porta", window: "Finestra", motion: "Movimento", smoke: "Fumo",
  gas: "Gas", moisture: "Allagamento", occupancy: "Presenza",
  connectivity: "Connessione", problem: "Anomalia", lock: "Serratura",
  timestamp: "Orario", duration: "Durata", frequency: "Frequenza",
  power_factor: "Fattore di potenza", apparent_power: "Potenza apparente",
  reactive_power: "Potenza reattiva", water: "Acqua", volume: "Volume",
};

const DOMAIN_LABELS = {
  light: "Luce", switch: "Interruttore", climate: "Clima", cover: "Tapparella",
  fan: "Ventilazione", lock: "Serratura", media_player: "Media",
  alarm_control_panel: "Allarme", camera: "Videocamera", person: "Persona",
  device_tracker: "Dispositivo", siren: "Sirena", vacuum: "Aspirapolvere",
  water_heater: "Scaldacqua", humidifier: "Umidificatore", scene: "Scena",
  script: "Script", automation: "Automazione", update: "Aggiornamento",
  weather: "Meteo", sun: "Sole", valve: "Valvola",
};

/**
 * What to print under a card's title.
 *
 * Never the state: every card type already renders the state in its body, so
 * echoing it here produced cards that said "760" and "760 W" one line apart.
 * A descriptor (what the reading IS) carries information the body does not.
 */
function cardDescriptor(entityId, st) {
  const dc = st && st.attributes && st.attributes.device_class;
  if (dc && DEVICE_CLASS_LABELS[dc]) return DEVICE_CLASS_LABELS[dc];
  const d = domainOf(entityId);
  return DOMAIN_LABELS[d] || d.replace(/_/g, " ");
}

/* ==========================================================================
 * OVERVIEW CARDS
 * Weather, live device activity, notifications and presence. All four are
 * ordinary card types rendered by the same sections engine as everything else,
 * so they can be dropped into any section rather than being locked inside a
 * special "overview" screen.
 * ======================================================================== */

const WEATHER_CONDITIONS = {
  "clear-night":   ["mdi:weather-night", "Sereno"],
  cloudy:          ["mdi:weather-cloudy", "Nuvoloso"],
  exceptional:     ["mdi:alert-circle-outline", "Eccezionale"],
  fog:             ["mdi:weather-fog", "Nebbia"],
  hail:            ["mdi:weather-hail", "Grandine"],
  lightning:       ["mdi:weather-lightning", "Temporale"],
  "lightning-rainy": ["mdi:weather-lightning-rainy", "Temporale e pioggia"],
  partlycloudy:    ["mdi:weather-partly-cloudy", "Parzialmente nuvoloso"],
  pouring:         ["mdi:weather-pouring", "Pioggia intensa"],
  rainy:           ["mdi:weather-rainy", "Pioggia"],
  snowy:           ["mdi:weather-snowy", "Neve"],
  "snowy-rainy":   ["mdi:weather-snowy-rainy", "Nevischio"],
  sunny:           ["mdi:weather-sunny", "Soleggiato"],
  windy:           ["mdi:weather-windy", "Ventoso"],
  "windy-variant": ["mdi:weather-windy-variant", "Ventoso"],
};

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

/** Domains that can meaningfully be "running", and how to read that. */
const ACTIVE_DOMAINS = {
  light: (st) => st.state === "on",
  switch: (st) => st.state === "on",
  fan: (st) => st.state === "on",
  input_boolean: (st) => st.state === "on",
  siren: (st) => st.state === "on",
  media_player: (st) => ["playing", "on", "paused"].includes(st.state),
  climate: (st) => st.state !== "off" && st.state !== "unavailable",
  cover: (st) => st.state === "open",
  vacuum: (st) => ["cleaning", "returning"].includes(st.state),
  water_heater: (st) => st.state !== "off",
  humidifier: (st) => st.state === "on",
};

const SIZE_SPAN = { sm: 3, md: 4, lg: 6, xl: 12 };
const SIZE_LABEL = { sm: "Piccola", md: "Media", lg: "Grande", xl: "Piena larghezza" };

/* ==========================================================================
 * ENERGY FLOW
 *
 * Rendered as inline SVG with SMIL <animateMotion> particles rather than a
 * charting library or a requestAnimationFrame loop: the browser animates the
 * particles off the main thread, so a wall tablet showing this card all day
 * costs no JavaScript and no battery. Sign conventions differ between meters
 * (some report export as negative, some as a separate entity), so each source
 * has an explicit invert flag instead of a guess.
 * ======================================================================== */

const FLOW_SLOTS = [
  { key: "solar",   label: "Solare",   icon: "mdi:solar-power-variant", color: "#ffd166" },
  { key: "grid",    label: "Rete",     icon: "mdi:transmission-tower",  color: "#8ecae6" },
  { key: "battery", label: "Batteria", icon: "mdi:home-battery",        color: "#06d6a0" },
  { key: "home",    label: "Casa",     icon: "mdi:home-lightning-bolt", color: "#00e5ff" },
];

/** Format watts for display, switching to kW once the number gets long. */
function fmtPower(w) {
  if (w === null || w === undefined || !Number.isFinite(w)) return { v: "—", u: "" };
  const a = Math.abs(w);
  if (a >= 1000) return { v: (w / 1000).toFixed(a >= 10000 ? 0 : 2), u: "kW" };
  return { v: a >= 100 ? String(Math.round(w)) : w.toFixed(1), u: "W" };
}

const CARD_TYPES = [
  ["entity", "Entità — icona, nome e stato"],
  ["sensor", "Sensore — valore grande con unità"],
  ["control", "Controllo — interruttore on/off"],
  ["status", "Stato — badge colorato"],
  ["climate", "Clima — temperatura e modalità"],
  ["gauge", "Gauge — indicatore percentuale"],
  ["chart", "Grafico — andamento 24h"],
  ["energyflow", "Flusso energetico — schema animato"],
  ["weather", "Meteo — condizioni e previsioni"],
  ["active", "Attivi ora — cosa è acceso"],
  ["notifications", "Notifiche — avvisi e aggiornamenti"],
  ["people", "Presenze — chi è in casa"],
];

/** Card types that stand on their own instead of displaying one entity. */
const COMPOSITE_TYPES = new Set(["energyflow", "active", "notifications", "people"]);

const COMPOSITE_META = {
  energyflow:    ["Flusso energetico", "Potenza in tempo reale", "mdi:transit-connection-variant", "lg"],
  active:        ["Attivi ora", "Dispositivi accesi", "mdi:flash-alert-outline", "md"],
  notifications: ["Notifiche", "Avvisi di sistema", "mdi:bell-outline", "md"],
  people:        ["Presenze", "Chi è in casa", "mdi:account-group", "sm"],
};

const BINARY_WORDS = {
  door: ["Aperta", "Chiusa"], window: ["Aperta", "Chiusa"],
  garage_door: ["Aperto", "Chiuso"], opening: ["Aperto", "Chiuso"],
  motion: ["Movimento", "Nessun movimento"], occupancy: ["Presente", "Vuoto"],
  presence: ["In casa", "Fuori"], moisture: ["Allagamento", "Asciutto"],
  smoke: ["Fumo", "Nessun fumo"], gas: ["Gas", "Nessun gas"],
  problem: ["Anomalia", "Regolare"], safety: ["Pericolo", "Sicuro"],
  connectivity: ["Connesso", "Disconnesso"], battery: ["Scarica", "Carica"],
  lock: ["Sbloccata", "Bloccata"], tamper: ["Manomesso", "Integro"],
};

const STATE_WORDS = {
  on: "Acceso", off: "Spento", open: "Aperto", closed: "Chiuso",
  opening: "In apertura", closing: "In chiusura",
  home: "In casa", not_home: "Fuori", unavailable: "Non disponibile",
  unknown: "Sconosciuto", idle: "Inattivo", standby: "Standby",
  playing: "In riproduzione", paused: "In pausa", buffering: "In caricamento",
  locked: "Bloccato", unlocked: "Sbloccato", locking: "In blocco",
  unlocking: "In sblocco", jammed: "Inceppato",
  disarmed: "Disarmato", armed_home: "Armato in casa", armed_away: "Armato fuori",
  armed_night: "Armato notte", armed_vacation: "Armato vacanza",
  armed_custom_bypass: "Armato parziale", arming: "In attivazione",
  disarming: "In disattivazione", pending: "In attesa", triggered: "Allarme in corso",
  heat: "Riscaldamento", cool: "Raffrescamento", heat_cool: "Automatico",
  dry: "Deumidifica", fan_only: "Ventilazione", auto: "Automatico",
  cleaning: "In pulizia", returning: "Rientro alla base", docked: "In base",
  above_horizon: "Giorno", below_horizon: "Notte",
};

/**
 * Human wording for a state.
 * Device-class wording wins over the generic vocabulary: a door sensor reading
 * "on" means Aperta, not Acceso.
 */
function stateWords(state, deviceClass) {
  const pair = BINARY_WORDS[deviceClass];
  if (pair && (state === "on" || state === "off")) return state === "on" ? pair[0] : pair[1];
  const word = STATE_WORDS[state];
  if (word) return word;
  return String(state).replace(/_/g, " ");
}

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
    this._pageIndex = 0;
    this._registry = null;      // {areas, byArea} from the HA registries
    this._registryLoading = false;
    this._drag = null;          // active room drag
    this._flowSlot = null;      // which energy-flow slot the picker is filling
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

  disconnectedCallback() { this._unsubscribeAll(); }

  // ---------------------------------------------------------------- data ---

  _page() {
    if (!this._dashboard) return null;
    const pages = this._dashboard.pages;
    if (this._pageIndex >= pages.length) this._pageIndex = 0;
    return pages[this._pageIndex];
  }
  _isFloorplan() { const p = this._page(); return !!p && p.type === "floorplan"; }
  _rooms() { const p = this._page(); return (p && p.rooms) || []; }
  _room(id) { return this._rooms().find((r) => r.id === id) || null; }
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
    const parts = [this._editing ? "e" : "v", String(this._pageIndex),
      JSON.stringify(this._selected || null)];
    if (this._isFloorplan()) {
      parts.push(this._registry ? "reg" : "noreg");
      for (const room of this._rooms()) {
        for (const id of this._roomEntities(room)) {
          const st = this._hass.states[id];
          parts.push(id + "=" + (st ? st.state : "?"));
        }
      }
      return parts.join("|");
    }
    for (const sec of this._sections()) {
      for (const it of sec.items) {
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

    // Lead the Energia section with a flow diagram and try to wire it up from
    // the Energy dashboard straight away: requiring the user to know that a
    // card type called "energyflow" exists would make the best card in the set
    // effectively undiscoverable.
    const energia = built.find((sec) => sec.title === "Energia");
    if (energia) {
      const flowCard = {
        id: uid("card"), type: "energyflow", entity_id: "", name: "", size: "lg",
        appearance: { icon: "mdi:transit-connection-variant" }, states: {}, actions: {},
        flow: { grid: null, solar: null, battery: null, home: null, devices: [] },
      };
      energia.items.unshift(flowCard);
      this._detectFlow(flowCard);
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

  // ----------------------------------------------------------- floorplan --

  /**
   * Load the HA area/device/entity registries.
   *
   * Verified against home-assistant/core 2026.8.3: the commands are
   * config/area_registry/list, config/device_registry/list and
   * config/entity_registry/list. An entity's effective area is its own
   * area_id falling back to its device's area_id — that is exactly what HA
   * core does in helpers/entity_registry.py, and skipping the device fallback
   * would leave most entities unassigned, because in practice the area is set
   * on the device, not on each entity.
   */
  async _loadRegistry() {
    if (this._registryLoading) return;
    this._registryLoading = true;
    try {
      const [areas, devices, entities] = await Promise.all([
        this._hass.callWS({ type: "config/area_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
        this._hass.callWS({ type: "config/entity_registry/list" }),
      ]);
      const deviceArea = {};
      for (const d of devices || []) deviceArea[d.id] = d.area_id || null;
      const byArea = {};
      for (const e of entities || []) {
        if (e.disabled_by || e.hidden_by) continue;
        const area = e.area_id || (e.device_id ? deviceArea[e.device_id] : null);
        if (!area) continue;
        (byArea[area] = byArea[area] || []).push(e.entity_id);
      }
      this._registry = { areas: areas || [], byArea };
    } catch (err) {
      this._registry = { areas: [], byArea: {}, error: true };
    }
    this._registryLoading = false;
    this._touch();
  }

  /** Entities shown as badges in a room: explicit list, or derived from its area. */
  _roomEntities(room) {
    if (Array.isArray(room.entities)) return room.entities.filter((e) => this._hass.states[e]);
    if (!room.area_id || !this._registry) return [];
    const pool = this._registry.byArea[room.area_id] || [];
    const scored = [];
    for (const id of pool) {
      const st = this._hass.states[id];
      if (!st || st.state === "unavailable" || st.state === "unknown") continue;
      const d = domainOf(id), dc = st.attributes.device_class;
      const rule = BADGE_PRIORITY.find((r) => r.test(d, dc));
      if (!rule) continue;
      scored.push({ id, score: rule.score });
    }
    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return scored.slice(0, MAX_BADGES_PER_ROOM).map((x) => x.id);
  }

  _badgeKind(entityId) {
    const st = this._hass.states[entityId];
    if (!st) return "plain";
    const rule = BADGE_PRIORITY.find((r) => r.test(domainOf(entityId), st.attributes.device_class));
    return rule ? rule.kind : "plain";
  }

  /** Build rooms from the HA areas, packed into a tidy grid the user can then move. */
  _autoRooms() {
    const page = this._page();
    if (!this._registry || !this._registry.areas.length) return;
    const areas = this._registry.areas;
    const cols = Math.max(1, Math.ceil(Math.sqrt(areas.length)));
    const W = 230, H = 180, GAP = 18;
    page.rooms = areas.map((a, i) => ({
      id: uid("room"),
      area_id: a.area_id,
      title: a.name || a.area_id,
      icon: a.icon || roomIconFor(a.name || a.area_id),
      color: ROOM_COLORS[i % ROOM_COLORS.length],
      x: (i % cols) * (W + GAP),
      y: Math.floor(i / cols) * (H + GAP),
      w: W, h: H,
      entities: null,
    }));
    this._selected = null;
    this._touch();
  }

  _addRoom() {
    const page = this._page();
    const rooms = page.rooms;
    const maxX = rooms.reduce((m, r) => Math.max(m, r.x + r.w), 0);
    const room = { id: uid("room"), area_id: null, title: "Nuova stanza",
      icon: "mdi:floor-plan", color: ROOM_COLORS[rooms.length % ROOM_COLORS.length],
      x: maxX + 18, y: 0, w: 200, h: 160, entities: null };
    rooms.push(room);
    this._selected = { kind: "room", roomId: room.id };
    this._touch();
  }

  _removeRoom(id) {
    const page = this._page();
    page.rooms = page.rooms.filter((r) => r.id !== id);
    if (this._selected && this._selected.roomId === id) this._selected = null;
    this._touch();
  }

  /** Plan bounds, used to size and centre the world. */
  _planBounds() {
    const rooms = this._rooms();
    if (!rooms.length) return { w: 600, h: 400 };
    let w = 0, h = 0;
    for (const r of rooms) { w = Math.max(w, r.x + r.w); h = Math.max(h, r.y + r.h); }
    return { w: Math.max(200, w), h: Math.max(200, h) };
  }

  _badgeMarkup(entityId, room) {
    const st = this._hass.states[entityId];
    if (!st) return "";
    const kind = this._badgeKind(entityId);
    const state = st.state;
    const attrs = st.attributes;
    const unit = attrs.unit_of_measurement || "";
    const on = ON_STATES.has(state);
    let text, cls = "", icon = autoIcon(entityId, st);

    if (kind === "climate") {
      const cur = attrs.current_temperature;
      text = (cur !== undefined ? cur + "°" : String(state)) ;
      cls = on ? "on" : "";
    } else if (kind === "toggle") {
      text = on ? "ON" : "OFF";
      cls = on ? "on" : "off";
    } else if (kind === "binary") {
      text = stateWords(state, attrs.device_class).toUpperCase();
      cls = on ? "alert" : "";
    } else if (kind === "cover") {
      const pos = attrs.current_position;
      text = pos !== undefined ? pos + "%" : String(state);
      cls = on ? "on" : "";
    } else if (kind === "value") {
      const n = parseFloat(state);
      text = (Number.isFinite(n) ? (Math.abs(n) >= 100 ? Math.round(n) : n.toFixed(1)) : state) + (unit ? " " + unit : "");
    } else {
      text = String(state).replace(/_/g, " ");
    }
    const title = attrs.friendly_name || entityId;
    return `<button class="fp-badge ${cls}" data-fp-badge="${esc(entityId)}" title="${esc(title)}">
        <ha-icon icon="${esc(icon)}"></ha-icon><span>${esc(text)}</span>
      </button>`;
  }

  _renderRoom(room, view) {
    const entities = this._roomEntities(room);
    const selected = this._selected && this._selected.kind === "room" && this._selected.roomId === room.id;
    const wallH = view.show_walls ? view.wall_height : 0;
    const badges = entities.map((e) => this._badgeMarkup(e, room)).join("");

    // Walls are extruded from each edge of the floor. transform-origin sits on
    // the edge itself so the wall hinges up out of the floor plane instead of
    // rotating about its own centre and ending up half-buried.
    const walls = view.show_walls ? `
      <div class="fp-wall" style="width:${room.w}px;height:${wallH}px;left:0;top:0;transform-origin:0 0;transform:rotateX(90deg)"></div>
      <div class="fp-wall" style="width:${room.w}px;height:${wallH}px;left:0;top:${room.h}px;transform-origin:0 0;transform:rotateX(90deg)"></div>
      <div class="fp-wall side" style="width:${room.h}px;height:${wallH}px;left:0;top:0;transform-origin:0 0;transform:rotateZ(90deg) rotateX(90deg)"></div>
      <div class="fp-wall side" style="width:${room.h}px;height:${wallH}px;left:${room.w}px;top:0;transform-origin:0 0;transform:rotateZ(90deg) rotateX(90deg)"></div>` : "";

    const label = view.show_labels
      ? `<div class="fp-label"><ha-icon icon="${esc(room.icon)}"></ha-icon><span>${esc(room.title)}</span></div>`
      : "";
    const badgeLayer = badges ? `<div class="fp-badges">${badges}</div>` : "";
    const tag = (label || badgeLayer) ? `
      <div class="fp-anchor" style="transform:translateZ(${wallH + 14}px) rotateZ(calc(var(--yaw) * -1)) rotateX(calc(var(--pitch) * -1))">
        <div class="fp-tag">${label}${badgeLayer}</div>
      </div>` : "";

    return `<div class="fp-room${selected ? " selected" : ""}${this._editing ? " editable" : ""}"
        data-room="${esc(room.id)}"
        style="--rc:${esc(room.color)};left:${room.x}px;top:${room.y}px;width:${room.w}px;height:${room.h}px">
        <div class="fp-floor"></div>
        ${walls}
        ${tag}
      </div>`;
  }

  _renderFloorplan() {
    const page = this._page();
    const view = page.view || {};
    const rooms = this._rooms();

    if (!this._registry && !this._registryLoading) this._loadRegistry();

    if (!rooms.length) {
      const ready = this._registry && this._registry.areas.length;
      return `<div class="bootstrap">
          <ha-icon icon="mdi:floor-plan"></ha-icon>
          <h2>Mappa 3D vuota</h2>
          <p>${ready
            ? `Cyborg ha trovato <strong>${this._registry.areas.length} aree</strong> in Home Assistant (${esc(this._registry.areas.map((a) => a.name).join(", "))}). Genera la pianta e le stanze compariranno con le loro entità già collegate.`
            : this._registry ? "Nessuna area configurata in Home Assistant. Crea le aree in Impostazioni → Aree, oppure aggiungi le stanze a mano." : "Lettura del registro aree di Home Assistant..."}</p>
          ${ready ? '<button data-auto-rooms><ha-icon icon="mdi:auto-fix"></ha-icon> GENERA PIANTA DALLE AREE</button>' : ""}
        </div>`;
    }

    const bounds = this._planBounds();
    return `<div class="fp-viewport${this._editing ? " editing" : ""}" data-fp-viewport
        style="--yaw:${view.yaw}deg;--pitch:${view.pitch}deg;--zoom:${view.zoom}">
        <div class="fp-stage">
          <div class="fp-world" style="width:${bounds.w}px;height:${bounds.h}px;margin-left:${-bounds.w / 2}px;margin-top:${-bounds.h / 2}px">
            <div class="fp-ground" style="width:${bounds.w + 80}px;height:${bounds.h + 80}px;left:-40px;top:-40px"></div>
            ${rooms.map((r) => this._renderRoom(r, view)).join("")}
          </div>
        </div>
        <div class="fp-hud">
          <button class="fp-hud-btn" data-view-nudge="yaw:-15" title="Ruota a sinistra"><ha-icon icon="mdi:rotate-left"></ha-icon></button>
          <button class="fp-hud-btn" data-view-nudge="yaw:15" title="Ruota a destra"><ha-icon icon="mdi:rotate-right"></ha-icon></button>
          <button class="fp-hud-btn" data-view-nudge="pitch:-6" title="Abbassa la camera"><ha-icon icon="mdi:angle-acute"></ha-icon></button>
          <button class="fp-hud-btn" data-view-nudge="pitch:6" title="Alza la camera"><ha-icon icon="mdi:cube-outline"></ha-icon></button>
          <button class="fp-hud-btn" data-view-nudge="zoom:-0.15" title="Riduci"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button>
          <button class="fp-hud-btn" data-view-nudge="zoom:0.15" title="Ingrandisci"><ha-icon icon="mdi:magnify-plus-outline"></ha-icon></button>
          <button class="fp-hud-btn ${view.show_walls ? "active" : ""}" data-view-toggle="show_walls" title="Mostra/nascondi muri"><ha-icon icon="mdi:wall"></ha-icon></button>
          <button class="fp-hud-btn ${view.show_labels ? "active" : ""}" data-view-toggle="show_labels" title="Mostra/nascondi nomi stanze"><ha-icon icon="mdi:label-outline"></ha-icon></button>
          <button class="fp-hud-btn" data-view-flat title="Vista dall'alto (pianta)"><ha-icon icon="mdi:crop-free"></ha-icon></button>
        </div>
        ${this._editing ? '<div class="fp-hint">Trascina una stanza per spostarla · clicca per configurarla</div>' : ""}
      </div>`;
  }

  _renderRoomEditor(room) {
    const areas = (this._registry && this._registry.areas) || [];
    const derived = this._roomEntities(room);
    const custom = Array.isArray(room.entities);
    return `<aside class="editor">
      <div class="editor-title">
        <div><small>STANZA</small><h2>${esc(room.title)}</h2></div>
        <button class="icon" data-close-editor><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
      <div class="section">
        <label>NOME<input data-room-prop="title" value="${esc(room.title)}"></label>
        <label>AREA HOME ASSISTANT<select data-room-prop="area_id">
          <option value="">— nessuna —</option>
          ${areas.map((a) => `<option value="${esc(a.area_id)}" ${room.area_id === a.area_id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
        </select></label>
        <span class="hint">Collegando l'area, le entità di quella stanza compaiono da sole sulla mappa. ${derived.length} entità trovate ora.</span>
        <label>COLORE<input type="color" data-room-prop="color" value="${esc(room.color)}"></label>
        <label>ICONA
          <div class="icon-editor-row">
            <ha-icon data-icon-preview icon="${esc(room.icon)}"></ha-icon>
            <input data-room-prop="icon" data-icon-live value="${esc(room.icon)}" placeholder="mdi:...">
          </div>
          <div class="icon-palette">${SECTION_ICONS.map((i) =>
            `<button type="button" class="icon-swatch" data-icon-pick="${esc(i)}" title="${esc(i)}"><ha-icon icon="${esc(i)}"></ha-icon></button>`).join("")}</div>
        </label>
      </div>
      <div class="section">
        <strong>GEOMETRIA</strong>
        <span class="hint">Puoi anche trascinare la stanza direttamente sulla mappa.</span>
        <div class="two">
          <label>X<input type="number" step="10" data-room-prop="x" value="${room.x}"></label>
          <label>Y<input type="number" step="10" data-room-prop="y" value="${room.y}"></label>
        </div>
        <div class="two">
          <label>LARGHEZZA<input type="number" step="10" min="40" data-room-prop="w" value="${room.w}"></label>
          <label>PROFONDITÀ<input type="number" step="10" min="40" data-room-prop="h" value="${room.h}"></label>
        </div>
      </div>
      <div class="section">
        <strong>ENTITÀ MOSTRATE</strong>
        <label class="check"><input type="checkbox" data-room-auto ${custom ? "" : "checked"}> Automatiche dall'area</label>
        <div class="room-entities">${derived.length
          ? derived.map((e) => `<div class="room-ent"><ha-icon icon="${esc(autoIcon(e, this._hass.states[e]))}"></ha-icon>
              <span>${esc((this._hass.states[e] && this._hass.states[e].attributes.friendly_name) || e)}</span>
              ${custom ? `<button class="mini danger" data-room-ent-remove="${esc(e)}"><ha-icon icon="mdi:close"></ha-icon></button>` : ""}</div>`).join("")
          : '<div class="entity-result-empty">Nessuna entità. Collega un\'area, oppure disattiva l\'automatico e aggiungile a mano.</div>'}</div>
        ${custom ? `<label>AGGIUNGI ENTITÀ<input type="text" data-entity-search value="${esc(this._entityQuery)}" placeholder="nome o entity_id..." autocomplete="off"></label>
          <div class="entity-results" data-entity-results>${this._entityResults()}</div>` : ""}
      </div>
      <button class="delete" data-room-remove="${esc(room.id)}">ELIMINA STANZA</button>
    </aside>`;
  }

  _renderFloorplanPageEditor() {
    const page = this._page();
    const view = page.view || {};
    const areas = (this._registry && this._registry.areas) || [];
    return `<aside class="editor">
      <div class="editor-title"><div><small>MAPPA 3D</small><h2>${esc(page.title)}</h2></div></div>
      <div class="section">
        <label>TITOLO PAGINA<input data-page-prop="title" value="${esc(page.title || "")}"></label>
        <label>ICONA${iconField("data-page-prop", "icon", page.icon || "mdi:floor-plan")}</label>
      </div>
      <div class="section">
        <strong>STANZE</strong>
        <span class="hint">${this._rooms().length} stanze sulla pianta · ${areas.length} aree disponibili in Home Assistant.</span>
        <button class="secondary wide" data-add-room><ha-icon icon="mdi:plus"></ha-icon> AGGIUNGI STANZA</button>
        <button class="secondary wide danger-outline" data-auto-rooms><ha-icon icon="mdi:refresh"></ha-icon> RIGENERA DALLE AREE</button>
      </div>
      <div class="section">
        <strong>CAMERA</strong>
        <label>ROTAZIONE · ${Math.round(view.yaw)}°<input type="range" min="0" max="359" step="1" data-view-prop="yaw" value="${view.yaw}"></label>
        <label>INCLINAZIONE · ${Math.round(view.pitch)}°<input type="range" min="0" max="85" step="1" data-view-prop="pitch" value="${view.pitch}"></label>
        <label>ZOOM · ${Number(view.zoom).toFixed(2)}×<input type="range" min="0.3" max="3" step="0.05" data-view-prop="zoom" value="${view.zoom}"></label>
        <label>ALTEZZA MURI · ${view.wall_height}<input type="range" min="0" max="200" step="2" data-view-prop="wall_height" value="${view.wall_height}"></label>
        <label class="check"><input type="checkbox" data-view-prop="show_walls" ${view.show_walls ? "checked" : ""}> Mostra muri</label>
        <label class="check"><input type="checkbox" data-view-prop="show_labels" ${view.show_labels ? "checked" : ""}> Mostra nomi stanze</label>
      </div>
    </aside>`;
  }

  /**
   * Resolve the live power at each node.
   *
   * Home consumption is derived rather than required: if you have a grid meter
   * and a PV meter you already know what the house is drawing, and asking for a
   * fourth sensor most installs do not have would leave the card empty.
   */
  _flowValues(flow) {
    const raw = (id, invert) => {
      const st = id && this._hass.states[id];
      if (!st) return null;
      const n = parseFloat(st.state);
      if (!Number.isFinite(n)) return null;
      return invert ? -n : n;
    };
    const solar = Math.max(0, raw(flow.solar, flow.invert_solar) || 0);
    const grid = raw(flow.grid, flow.invert_grid);          // + import, - export
    const batt = raw(flow.battery, flow.invert_battery);    // + discharge, - charge
    const gridIn = grid === null ? 0 : Math.max(0, grid);
    const gridOut = grid === null ? 0 : Math.max(0, -grid);
    const battOut = batt === null ? 0 : Math.max(0, batt);
    const battIn = batt === null ? 0 : Math.max(0, -batt);
    const explicitHome = raw(flow.home, false);
    const home = explicitHome !== null && explicitHome !== undefined
      ? Math.max(0, explicitHome)
      : Math.max(0, solar + gridIn + battOut - gridOut - battIn);
    return { solar, grid, batt, gridIn, gridOut, battOut, battIn, home,
      hasSolar: !!flow.solar, hasGrid: !!flow.grid, hasBattery: !!flow.battery };
  }

  _flowNode(x, y, slot, value, sub, labelBelow) {
    const f = fmtPower(value);
    // labelBelow is used for the house: its title would otherwise sit exactly
    // where the grid and battery curves arrive at the node.
    const labelY = labelBelow ? 50 : -46;
    const subY = labelBelow ? 64 : 52;
    return `<g class="ef-node" transform="translate(${x},${y})">
        <circle r="34" class="ef-node-bg" style="--nc:${slot.color}"/>
        <circle r="34" class="ef-node-ring" style="--nc:${slot.color}"/>
        <text class="ef-node-label" y="${labelY}">${esc(slot.label.toUpperCase())}</text>
        <text class="ef-node-val" y="2" style="--nc:${slot.color}">${esc(f.v)}</text>
        <text class="ef-node-unit" y="17">${esc(f.u)}</text>
        ${sub ? `<text class="ef-node-sub" y="${subY}">${esc(sub)}</text>` : ""}
      </g>`;
  }

  /**
   * One flow path plus its moving particles.
   * Particle interval shortens as power rises, so the picture reads as a rate
   * at a glance instead of needing the numbers to be compared.
   */
  _flowPath(id, d, watts, color, reverse) {
    if (!watts || watts < 1) return `<path class="ef-path idle" d="${d}"/>`;
    const dur = Math.max(0.9, Math.min(4.5, 2600 / Math.max(watts, 60)));
    const n = watts > 2000 ? 4 : watts > 500 ? 3 : 2;
    const dots = [];
    for (let i = 0; i < n; i++) {
      dots.push(`<circle r="4" class="ef-dot" style="--nc:${color}">
        <animateMotion dur="${dur.toFixed(2)}s" repeatCount="indefinite"
          begin="${((dur / n) * i).toFixed(2)}s"
          keyPoints="${reverse ? "1;0" : "0;1"}" keyTimes="0;1" calcMode="linear">
          <mpath href="#${id}"/></animateMotion></circle>`);
    }
    return `<path id="${id}" class="ef-path active" style="--nc:${color}" d="${d}"/>${dots.join("")}`;
  }

  _energyFlowBody(item) {
    const flow = item.flow || {};
    const configured = FLOW_SLOTS.some((s) => flow[s.key]);
    if (!configured) {
      return `<div class="ef-empty">
          <ha-icon icon="mdi:transit-connection-variant"></ha-icon>
          <strong>Flusso energetico non configurato</strong>
          <span>Apri la card in modifica e collega almeno il sensore di potenza della rete.</span>
        </div>`;
    }
    const v = this._flowValues(flow);
    const S = FLOW_SLOTS.reduce((m, s) => (m[s.key] = s, m), {});

    // Layout: solar above, grid left, battery right, house below-centre.
    const solarNode = v.hasSolar ? this._flowNode(300, 62, S.solar, v.solar) : "";
    const gridNode = v.hasGrid ? this._flowNode(74, 176, S.grid,
      Math.abs(v.grid || 0), v.gridOut > 0 ? "IMMISSIONE" : "PRELIEVO") : "";
    const battNode = v.hasBattery ? this._flowNode(526, 176, S.battery,
      Math.abs(v.batt || 0), v.battIn > 0 ? "IN CARICA" : "IN SCARICA") : "";
    const homeNode = this._flowNode(300, 286, S.home, v.home, null, true);

    const paths = [
      v.hasSolar ? this._flowPath("ef-s-h", "M300,102 L300,252", v.solar - v.gridOut, S.solar.color, false) : "",
      v.hasGrid ? this._flowPath("ef-g-h", "M104,196 C160,250 200,272 262,282",
        v.gridIn || v.gridOut, S.grid.color, v.gridOut > 0) : "",
      v.hasBattery ? this._flowPath("ef-b-h", "M496,196 C440,250 400,272 338,282",
        v.battOut || v.battIn, S.battery.color, v.battIn > 0) : "",
    ].join("");

    const devices = (flow.devices || []).map((d) => {
      const st = this._hass.states[d.entity];
      const n = st ? parseFloat(st.state) : NaN;
      const f = fmtPower(Number.isFinite(n) ? n : null);
      const share = v.home > 0 && Number.isFinite(n) ? Math.min(100, (n / v.home) * 100) : 0;
      return `<div class="ef-dev" data-fp-badge="${esc(d.entity)}">
          <ha-icon icon="${esc(d.icon || autoIcon(d.entity, st || { attributes: {} }))}"></ha-icon>
          <div class="ef-dev-text">
            <span>${esc(d.name || (st && st.attributes.friendly_name) || d.entity)}</span>
            <div class="ef-dev-bar"><i style="width:${share.toFixed(1)}%"></i></div>
          </div>
          <strong>${esc(f.v)}<small>${esc(f.u)}</small></strong>
        </div>`;
    }).join("");

    return `<div class="ef">
        <svg class="ef-svg" viewBox="0 0 600 366" preserveAspectRatio="xMidYMid meet">
          ${paths}${solarNode}${gridNode}${battNode}${homeNode}
        </svg>
        ${devices ? `<div class="ef-devs">${devices}</div>` : ""}
      </div>`;
  }

  // --------------------------------------------------------- overview ---

  /**
   * Shared WebSocket subscription manager.
   *
   * Cards re-render constantly, so subscribing inside a render would open a new
   * stream on every repaint and leak them all. Subscriptions are keyed and
   * opened once, and every one is closed in disconnectedCallback — without that
   * the panel keeps feeding forecasts to a detached element after the user
   * navigates away.
   */
  _subscribe(key, msg, handler) {
    this._subs = this._subs || {};
    if (this._subs[key]) return;
    this._subs[key] = "pending";
    const conn = this._hass && this._hass.connection;
    if (!conn || !conn.subscribeMessage) { this._subs[key] = null; return; }
    conn.subscribeMessage((ev) => handler(ev), msg)
      .then((unsub) => { this._subs[key] = unsub; })
      .catch(() => { this._subs[key] = null; this._subFailed = this._subFailed || {}; this._subFailed[key] = true; this._touch(); });
  }

  _unsubscribeAll() {
    for (const key of Object.keys(this._subs || {})) {
      const unsub = this._subs[key];
      if (typeof unsub === "function") { try { unsub(); } catch (e) { /* already gone */ } }
    }
    this._subs = {};
  }

  _weatherBody(item) {
    const id = item.entity_id;
    const st = this._hass.states[id];
    if (!st) {
      return `<div class="ov-empty"><ha-icon icon="mdi:weather-cloudy-alert"></ha-icon>
        <span>Collega un'entità meteo per vedere condizioni e previsioni.</span></div>`;
    }
    const a = st.attributes;
    const [icon, label] = WEATHER_CONDITIONS[st.state] || ["mdi:weather-cloudy", String(st.state).replace(/_/g, " ")];
    const unit = a.temperature_unit || "°C";

    // supported_features bit 1 = daily forecast (weather/const.py). Subscribing
    // for a type the entity does not support returns an error, so check first.
    if ((a.supported_features & 1) && item.show_forecast !== false) {
      this._subscribe("wx:" + id,
        { type: "weather/subscribe_forecast", forecast_type: "daily", entity_id: id },
        (ev) => { this._forecast = this._forecast || {}; this._forecast[id] = (ev && ev.forecast) || []; this._touch(); });
    }
    const fc = ((this._forecast || {})[id] || []).slice(0, 5);
    const strip = fc.length ? `<div class="wx-fc">${fc.map((d) => {
      const day = new Date(d.datetime);
      const [ic] = WEATHER_CONDITIONS[d.condition] || ["mdi:weather-cloudy"];
      const hi = d.temperature, lo = d.templow;
      return `<div class="wx-day">
          <span class="wx-dow">${esc(WEEKDAYS[day.getDay()] || "")}</span>
          <ha-icon icon="${esc(ic)}"></ha-icon>
          <span class="wx-hi">${esc(hi !== undefined && hi !== null ? Math.round(hi) + "°" : "—")}</span>
          ${lo !== undefined && lo !== null ? `<span class="wx-lo">${esc(Math.round(lo))}°</span>` : ""}
        </div>`;
    }).join("")}</div>` : "";

    const facts = [
      a.temperature !== undefined ? ["mdi:thermometer", Math.round(a.temperature * 10) / 10 + unit] : null,
      a.humidity !== undefined ? ["mdi:water-percent", Math.round(a.humidity) + "%"] : null,
      a.wind_speed !== undefined ? ["mdi:weather-windy", Math.round(a.wind_speed) + " " + (a.wind_speed_unit || "km/h")] : null,
      a.pressure !== undefined ? ["mdi:gauge", Math.round(a.pressure) + " " + (a.pressure_unit || "hPa")] : null,
    ].filter(Boolean);

    return `<div class="wx">
        <div class="wx-now">
          <ha-icon class="wx-icon" icon="${esc(icon)}"></ha-icon>
          <div>
            <div class="wx-temp">${esc(a.temperature !== undefined ? Math.round(a.temperature) : "—")}<span class="unit-inline">${esc(unit)}</span></div>
            <div class="wx-cond">${esc(label)}</div>
          </div>
        </div>
        <div class="wx-facts">${facts.map(([i, t]) =>
          `<span><ha-icon icon="${esc(i)}"></ha-icon>${esc(t)}</span>`).join("")}</div>
        ${strip}
      </div>`;
  }

  /** Everything currently running, newest change first. */
  _activeEntities(item) {
    const include = Array.isArray(item.domains) && item.domains.length
      ? item.domains : Object.keys(ACTIVE_DOMAINS);
    const exclude = new Set(item.exclude || []);
    const out = [];
    for (const id of Object.keys(this._hass.states)) {
      const d = domainOf(id);
      const test = ACTIVE_DOMAINS[d];
      if (!test || !include.includes(d) || exclude.has(id)) continue;
      const st = this._hass.states[id];
      if (st.state === "unavailable" || st.state === "unknown") continue;
      if (!test(st)) continue;
      out.push({ id, st, since: Date.parse(st.last_changed || 0) || 0 });
    }
    out.sort((a, b) => b.since - a.since);
    return out;
  }

  _activeBody(item) {
    const rows = this._activeEntities(item);
    const cap = item.max || 8;
    if (!rows.length) {
      return `<div class="ov-empty ok"><ha-icon icon="mdi:power-sleep"></ha-icon>
        <span>Niente acceso in questo momento.</span></div>`;
    }
    return `<div class="act">
        <div class="act-count"><strong>${rows.length}</strong><span>attivi</span></div>
        <div class="act-list">${rows.slice(0, cap).map((r) => `
          <button class="act-row" data-toggle-entity="${esc(r.id)}">
            <ha-icon icon="${esc(autoIcon(r.id, r.st))}"></ha-icon>
            <span>${esc(r.st.attributes.friendly_name || r.id)}</span>
            <small>${esc(stateWords(r.st.state, r.st.attributes.device_class))}</small>
          </button>`).join("")}
        </div>
        ${rows.length > cap ? `<div class="act-more">+${rows.length - cap} altri</div>` : ""}
      </div>`;
  }

  _notificationsBody(item) {
    this._subscribe("notif", { type: "persistent_notification/subscribe" }, (ev) => {
      this._notifs = this._notifs || {};
      if (!ev) return;
      if (ev.type === "current" || ev.type === "added") Object.assign(this._notifs, ev.notifications || {});
      if (ev.type === "removed") for (const k of Object.keys(ev.notifications || {})) delete this._notifs[k];
      this._touch();
    });
    const notifs = Object.values(this._notifs || {});
    const updates = item.show_updates === false ? [] : Object.keys(this._hass.states)
      .filter((id) => id.startsWith("update.") && this._hass.states[id].state === "on")
      .map((id) => this._hass.states[id]);

    if (!notifs.length && !updates.length) {
      return `<div class="ov-empty ok"><ha-icon icon="mdi:check-circle-outline"></ha-icon>
        <span>Nessuna notifica. Sistema in ordine.</span></div>`;
    }
    return `<div class="notif">
        ${notifs.map((n) => `<div class="notif-row">
            <ha-icon icon="mdi:bell-ring-outline"></ha-icon>
            <div><strong>${esc(n.title || "Notifica")}</strong><small>${esc(String(n.message || "").slice(0, 140))}</small></div>
          </div>`).join("")}
        ${updates.length ? `<div class="notif-row upd">
            <ha-icon icon="mdi:package-up"></ha-icon>
            <div><strong>${updates.length} aggiornament${updates.length === 1 ? "o" : "i"} disponibil${updates.length === 1 ? "e" : "i"}</strong>
              <small>${esc(updates.slice(0, 3).map((u) => u.attributes.friendly_name || "").join(" · "))}</small></div>
          </div>` : ""}
      </div>`;
  }

  _peopleBody(item) {
    const ids = Array.isArray(item.people) && item.people.length
      ? item.people
      : Object.keys(this._hass.states).filter((id) => id.startsWith("person."));
    if (!ids.length) {
      return `<div class="ov-empty"><ha-icon icon="mdi:account-question-outline"></ha-icon>
        <span>Nessuna persona configurata in Home Assistant.</span></div>`;
    }
    return `<div class="ppl">${ids.map((id) => {
      const st = this._hass.states[id];
      if (!st) return "";
      const home = st.state === "home";
      const pic = st.attributes.entity_picture;
      const name = String(st.attributes.friendly_name || id.split(".")[1]).trim();
      return `<button class="ppl-row ${home ? "home" : ""}" data-more-info="${esc(id)}">
          ${pic ? `<img src="${esc(pic)}" alt="">` : `<ha-icon icon="mdi:account"></ha-icon>`}
          <div><strong>${esc(name)}</strong><small>${esc(home ? "In casa" : st.state === "not_home" ? "Fuori" : st.state)}</small></div>
          <i class="ppl-dot"></i>
        </button>`;
    }).join("")}</div>`;
  }

  _cardBody(item, st) {
    const type = item.type || "entity";
    if (type === "energyflow") return this._energyFlowBody(item);
    if (type === "weather") return this._weatherBody(item);
    if (type === "active") return this._activeBody(item);
    if (type === "notifications") return this._notificationsBody(item);
    if (type === "people") return this._peopleBody(item);
    const attrs = (st && st.attributes) || {};
    const state = st ? st.state : "unavailable";
    const unit = attrs.unit_of_measurement || "";
    const isOn = ON_STATES.has(state);

    if (type === "control") {
      return `<div class="control-row">
          <span class="control-state">${esc(stateWords(state, attrs.device_class))}</span>
          <span class="switch ${isOn ? "on" : ""}"><span class="knob"></span></span>
        </div>`;
    }
    if (type === "status") {
      const alert = ALERT_STATES.has(state);
      return `<div class="status-badge ${alert ? "alert" : ""}">
          <ha-icon icon="${esc(alert ? "mdi:alert-circle" : "mdi:check-circle")}"></ha-icon>
          <span>${esc(stateWords(state, attrs.device_class))}</span>
        </div>`;
    }
    if (type === "climate") {
      const cur = attrs.current_temperature, target = attrs.temperature;
      return `<div class="climate-body">
          <div class="value">${esc(cur !== undefined ? cur : state)}<span class="unit-inline">°C</span></div>
          <div class="climate-meta">
            <span><ha-icon icon="mdi:target"></ha-icon> ${esc(target !== undefined ? target + "°" : "—")}</span>
            <span><ha-icon icon="mdi:tune-variant"></ha-icon> ${esc(stateWords(state, attrs.device_class))}</span>
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
    return `<div class="value entity-value">${esc(stateWords(state, attrs.device_class))}${unit ? `<span class="unit-inline">${esc(unit)}</span>` : ""}</div>`;
  }

  _renderCard(item, section) {
    const isFlow = item.type === "energyflow";
    const composite = COMPOSITE_TYPES.has(item.type);
    const meta = COMPOSITE_META[item.type];
    const st = this._hass.states[item.entity_id];
    const attrs = (st && st.attributes) || {};
    const state = st ? st.state : "unavailable";
    const name = item.name || (meta ? meta[0] : null)
      || attrs.friendly_name || item.entity_id || "Card non configurata";
    const app = item.appearance || {};
    const stateStyle = (item.states && (item.states[state] || item.states.default)) || {};
    const accent = stateStyle.accent || app.accent || section.accent || (this._dashboard.theme && this._dashboard.theme.accent) || "#00e5ff";
    const icon = stateStyle.icon || app.icon || (meta ? meta[2] : null)
      || autoIcon(item.entity_id, st || { attributes: {} });
    const span = SIZE_SPAN[item.size] || SIZE_SPAN[meta ? meta[3] : "md"] || SIZE_SPAN.md;
    const glow = app.glow !== false;
    const pulse = stateStyle.animate ? " pulse" : "";
    const missing = (!item.entity_id && !composite) ? " missing" : "";
    const style = `--accent:${esc(accent)};grid-column:span ${span}`;
    const body = this._cardBody(item, st);
    const sub = stateStyle.label
      || (meta ? meta[1] : cardDescriptor(item.entity_id, st));
    const head = `<div class="head">
        ${item.show_icon === false ? "" : `<ha-icon class="card-icon" icon="${esc(icon)}"></ha-icon>`}
        <div class="head-text"><strong>${esc(name)}</strong>${
          item.show_state === false ? "" : `<small>${esc(sub)}</small>`}</div>
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
    return `<article class="item${pulse}${missing}${isFlow ? " flow" : ""}${composite || item.type === "weather" ? " composite" : ""}" style="${style}${glow ? `;box-shadow:0 0 26px color-mix(in srgb, ${esc(accent)} 16%, transparent)` : ""}"
        ${composite || item.type === "weather" ? "" : `data-tap data-sec="${esc(section.id)}" data-item="${esc(item.id)}"`}>${head}${body}</article>`;
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

  _entityResults(deviceClass) {
    const q = (this._entityQuery || "").trim().toLowerCase();
    if (!q) return `<div class="entity-result-empty">Digita almeno due caratteri per cercare${
      deviceClass ? ` tra i sensori di ${esc(DEVICE_CLASS_LABELS[deviceClass] || deviceClass).toLowerCase()}` : ` tra le ${Object.keys(this._hass.states).length} entità`}.</div>`;
    if (q.length < 2) return `<div class="entity-result-empty">Continua a digitare...</div>`;
    const rows = [];
    for (const id of Object.keys(this._hass.states)) {
      const st = this._hass.states[id];
      if (deviceClass && st.attributes.device_class !== deviceClass) continue;
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

  /**
   * Propose flow entities from the Home Assistant Energy dashboard.
   *
   * energy/get_prefs (verified present in core 2026.8.3) stores *energy*
   * statistics in kWh, but a live flow diagram needs *power* in W. So each
   * energy statistic is used as a naming hint: look for a power-class sensor
   * belonging to the same device name. Anything not matched is simply left for
   * the user to pick, rather than guessed wrongly.
   */
  async _detectFlow(card) {
    let prefs;
    try {
      prefs = await this._hass.callWS({ type: "energy/get_prefs" });
    } catch (err) {
      this._error = "Dashboard Energia non configurata in Home Assistant";
      this._touch();
      return;
    }
    const powerByHint = (hint) => {
      if (!hint) return null;
      const base = hint.replace(/^sensor\./, "").replace(/_(energia|energy)_?(totale|total)?$/i, "");
      let best = null, bestLen = 0;
      for (const id of Object.keys(this._hass.states)) {
        if (!id.startsWith("sensor.")) continue;
        const st = this._hass.states[id];
        if (st.attributes.device_class !== "power") continue;
        const name = id.replace(/^sensor\./, "");
        if (!name.startsWith(base.slice(0, Math.max(6, base.length - 6)))) continue;
        if (name.length > bestLen) { best = id; bestLen = name.length; }
      }
      return best;
    };
    const flow = Object.assign({}, card.flow || {});
    for (const src of (prefs.energy_sources || [])) {
      const guess = powerByHint(src.stat_energy_from);
      if (!guess) continue;
      if (src.type === "grid" && !flow.grid) flow.grid = guess;
      if (src.type === "solar" && !flow.solar) flow.solar = guess;
      if (src.type === "battery" && !flow.battery) flow.battery = guess;
    }
    const devices = (flow.devices || []).slice();
    for (const d of (prefs.device_consumption || [])) {
      const guess = powerByHint(d.stat_consumption);
      if (guess && !devices.some((x) => x.entity === guess)) {
        devices.push({ entity: guess, name: d.name || "", icon: "" });
      }
    }
    flow.devices = devices.slice(0, 8);
    card.flow = flow;
    const found = FLOW_SLOTS.filter((sl) => flow[sl.key]).length;
    this._error = found || devices.length
      ? "" : "Nessun sensore di potenza corrispondente trovato — collegali a mano";
    this._touch();
  }

  _compositeEditor(card) {
    if (card.type === "active") {
      const chosen = Array.isArray(card.domains) && card.domains.length
        ? card.domains : Object.keys(ACTIVE_DOMAINS);
      return `<div class="section">
        <strong>COSA CONSIDERARE ATTIVO</strong>
        <span class="hint">Un clima acceso, una tapparella aperta e una luce accesa sono tutti "attivi": scegli quali contano per te.</span>
        <div class="dom-grid">${Object.keys(ACTIVE_DOMAINS).map((d) =>
          `<button type="button" class="dom-chip ${chosen.includes(d) ? "on" : ""}" data-active-domain="${esc(d)}">
             <ha-icon icon="${esc(DOMAIN_ICONS[d] || "mdi:shape-outline")}"></ha-icon>${esc(DOMAIN_LABELS[d] || d)}</button>`).join("")}
        </div>
        <label>MASSIMO IN ELENCO<input type="number" min="3" max="30" data-prop="max" value="${card.max || 8}"></label>
      </div>`;
    }
    if (card.type === "notifications") {
      return `<div class="section">
        <strong>CONTENUTO</strong>
        <label class="check"><input type="checkbox" data-prop="show_updates" ${card.show_updates !== false ? "checked" : ""}> Includi aggiornamenti disponibili</label>
        <span class="hint">Le notifiche persistenti di Home Assistant arrivano in tempo reale.</span>
      </div>`;
    }
    if (card.type === "people") {
      const all = Object.keys(this._hass.states).filter((id) => id.startsWith("person."));
      const chosen = Array.isArray(card.people) && card.people.length ? card.people : all;
      return `<div class="section">
        <strong>PERSONE</strong>
        <span class="hint">${all.length ? "Deseleziona chi non vuoi mostrare." : "Nessuna persona configurata in Home Assistant."}</span>
        <div class="dom-grid">${all.map((id) =>
          `<button type="button" class="dom-chip ${chosen.includes(id) ? "on" : ""}" data-person="${esc(id)}">
             <ha-icon icon="mdi:account"></ha-icon>${esc(this._hass.states[id].attributes.friendly_name || id)}</button>`).join("")}
        </div>
      </div>`;
    }
    return "";
  }

  /**
   * Build a Panoramica: the handful of things worth seeing before anything
   * else. Only cards with something real behind them are added — an empty
   * weather tile or a presence card with nobody configured is worse than no
   * card at all.
   */
  _composeOverview() {
    const page = this._page();
    const states = this._hass.states;
    const first = (pred) => Object.keys(states).find(pred);
    const mk = (type, extra) => Object.assign({
      id: uid("card"), type, entity_id: "", name: "", size: COMPOSITE_META[type] ? COMPOSITE_META[type][3] : "md",
      appearance: {}, states: {}, actions: { tap: { action: "more-info" } },
    }, extra || {});

    const top = [];
    const weather = first((id) => id.startsWith("weather."));
    if (weather) top.push(mk("weather", { entity_id: weather, size: "md" }));
    if (Object.keys(states).some((id) => id.startsWith("person."))) top.push(mk("people", { size: "sm" }));
    top.push(mk("notifications", { size: "md" }));
    top.push(mk("active", { size: "md" }));

    const alarm = first((id) => id.startsWith("alarm_control_panel."));
    if (alarm) {
      top.push(mk("status", { entity_id: alarm, size: "sm",
        appearance: { icon: "mdi:shield-home" },
        actions: { tap: { action: "more-info" } } }));
    }

    const flowCard = mk("energyflow", { size: "lg",
      appearance: { icon: "mdi:transit-connection-variant" },
      flow: { grid: null, solar: null, battery: null, home: null, devices: [] } });

    const sections = [
      { id: uid("sec"), title: "Panoramica", icon: "mdi:view-dashboard-variant",
        accent: "#00e5ff", collapsed: false, items: top },
      { id: uid("sec"), title: "Energia", icon: "mdi:flash",
        accent: "#ffd166", collapsed: false, items: [flowCard] },
    ];
    page.sections = sections;
    this._detectFlow(flowCard);
    this._selected = null;
    this._touch();
  }

  _flowEditor(card) {
    const flow = card.flow || {};
    const devices = flow.devices || [];
    return `<div class="section">
      <strong>SORGENTI DI POTENZA</strong>
      <span class="hint">Collega i sensori di <em>potenza istantanea</em> (W o kW), non i contatori di energia in kWh.</span>
      <button class="secondary wide" data-detect-flow><ha-icon icon="mdi:auto-fix"></ha-icon> RILEVA DALLA DASHBOARD ENERGIA</button>
      ${FLOW_SLOTS.map((sl) => {
        const id = flow[sl.key];
        const st = id && this._hass.states[id];
        const active = this._flowSlot === sl.key;
        return `<div class="flow-slot ${active ? "active" : ""}" style="--nc:${sl.color}">
            <div class="flow-slot-head">
              <ha-icon icon="${esc(sl.icon)}"></ha-icon>
              <div><strong>${esc(sl.label)}</strong>
                <small>${id ? esc((st && st.attributes.friendly_name) || id) : "non collegato"}</small></div>
              <button class="mini" data-flow-pick="${esc(sl.key)}">${active ? "CHIUDI" : id ? "CAMBIA" : "COLLEGA"}</button>
              ${id ? `<button class="mini danger" data-flow-clear="${esc(sl.key)}"><ha-icon icon="mdi:close"></ha-icon></button>` : ""}
            </div>
            ${id && sl.key !== "home" ? `<label class="check"><input type="checkbox" data-flow-invert="${esc(sl.key)}" ${flow["invert_" + sl.key] ? "checked" : ""}> Inverti segno${
              sl.key === "grid" ? " (se l'immissione risulta come prelievo)" : sl.key === "battery" ? " (se carica e scarica sono scambiate)" : ""}</label>` : ""}
            ${active ? `<input type="text" data-entity-search value="${esc(this._entityQuery)}" placeholder="cerca sensore di potenza..." autocomplete="off">
              <div class="entity-results" data-entity-results>${this._entityResults("power")}</div>` : ""}
          </div>`;
      }).join("")}
      ${flow.home ? "" : '<span class="hint">Senza il sensore "Casa" il consumo domestico viene calcolato: solare + prelievo + scarica batteria − immissione − carica batteria.</span>'}
    </div>
    <div class="section">
      <strong>CARICHI MONITORATI</strong>
      <span class="hint">${devices.length} carichi mostrati sotto lo schema, con la quota sul consumo di casa.</span>
      ${devices.map((d, i) => `<div class="room-ent">
          <ha-icon icon="${esc(d.icon || autoIcon(d.entity, this._hass.states[d.entity] || { attributes: {} }))}"></ha-icon>
          <span>${esc(d.name || (this._hass.states[d.entity] && this._hass.states[d.entity].attributes.friendly_name) || d.entity)}</span>
          <button class="mini danger" data-flow-dev-remove="${i}"><ha-icon icon="mdi:close"></ha-icon></button>
        </div>`).join("")}
      <button class="mini ${this._flowSlot === "__dev" ? "accentbtn" : ""}" data-flow-pick="__dev"><ha-icon icon="mdi:plus"></ha-icon> AGGIUNGI CARICO</button>
      ${this._flowSlot === "__dev" ? `<input type="text" data-entity-search value="${esc(this._entityQuery)}" placeholder="cerca sensore di potenza..." autocomplete="off">
        <div class="entity-results" data-entity-results>${this._entityResults("power")}</div>` : ""}
    </div>`;
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

      ${card.type === "energyflow" ? this._flowEditor(card)
        : COMPOSITE_TYPES.has(card.type) ? this._compositeEditor(card) : `
      <div class="section">
        <strong>ENTITÀ</strong>
        ${card.entity_id ? `<div class="entity-current">
            <ha-icon icon="${esc(autoIcon(card.entity_id, st || { attributes: {} }))}"></ha-icon>
            <div><strong>${esc((st && st.attributes.friendly_name) || card.entity_id)}</strong><small>${esc(card.entity_id)}</small></div>
            <span class="err-state">${esc(state)}</span>
          </div>` : `<div class="warn">Nessuna entità collegata — la card resterà vuota.</div>`}
        <label>CERCA<input type="text" data-entity-search value="${esc(this._entityQuery)}" placeholder="nome o entity_id..." autocomplete="off"></label>
        <div class="entity-results" data-entity-results>${this._entityResults()}</div>
      </div>`}

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
        <button class="secondary wide" data-compose-overview><ha-icon icon="mdi:view-dashboard-variant"></ha-icon> COMPONI PANORAMICA</button>
        <button class="secondary wide" data-autocompose="add"><ha-icon icon="mdi:auto-fix"></ha-icon> AGGIUNGI SEZIONI COMPOSTE</button>
        <button class="secondary wide danger-outline" data-autocompose="replace"><ha-icon icon="mdi:refresh"></ha-icon> RIGENERA DA ZERO</button>
      </div>
    </aside>`;
  }

  _renderEditor() {
    if (this._isFloorplan()) {
      const room = this._selected && this._selected.kind === "room"
        ? this._room(this._selected.roomId) : null;
      return room ? this._renderRoomEditor(room) : this._renderFloorplanPageEditor();
    }
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
    const theme = this._dashboard.theme || {};
    const floorplan = this._isFloorplan();
    const sections = floorplan ? [] : this._sections();
    const total = sections.reduce((n, s) => n + s.items.length, 0);
    const pages = this._dashboard.pages;

    const tabs = pages.length > 1 ? `<nav class="page-tabs">${pages.map((pg, i) =>
      `<button class="page-tab ${i === this._pageIndex ? "active" : ""}" data-page-tab="${i}">
         <ha-icon icon="${esc(pg.icon || "mdi:view-dashboard-outline")}"></ha-icon>
         <span>${esc(pg.title || "Pagina " + (i + 1))}</span>
       </button>`).join("")}</nav>` : "";

    const subtitle = floorplan
      ? `${this._rooms().length} STANZE · ${this._editing ? "MODIFICA ATTIVA" : "MAPPA 3D"}`
      : `${sections.length} SEZIONI · ${total} CARD · ${this._editing ? "MODIFICA ATTIVA" : "SISTEMA ONLINE"}`;

    const body = floorplan ? this._renderFloorplan() : sections.length
      ? sections.map((s, i) => this._renderSection(s, i, sections.length)).join("")
      : `<div class="bootstrap">
           <ha-icon icon="mdi:view-dashboard-outline"></ha-icon>
           <h2>Dashboard vuota</h2>
           <p>Due modi per partire: una <strong>panoramica</strong> con meteo, presenze, notifiche, dispositivi accesi e flusso energetico, oppure la <strong>dashboard completa</strong> con tutte le tue entità divise per sezione.</p>
           <div class="bootstrap-actions">
             <button data-compose-overview><ha-icon icon="mdi:view-dashboard-variant"></ha-icon> COMPONI PANORAMICA</button>
             <button class="secondary" data-autocompose="replace"><ha-icon icon="mdi:auto-fix"></ha-icon> DASHBOARD COMPLETA</button>
           </div>
         </div>`;

    this.innerHTML = `<style>${this._css()}</style>
      <div class="shell" style="--accent:${esc(theme.accent || "#00e5ff")}">
        <header class="top">
          <div class="brand">
            <ha-icon class="brand-icon" icon="${esc(p.icon || "mdi:hexagon-multiple-outline")}"></ha-icon>
            <div>
              <h1>${esc(p.title || "Cyborg")}</h1>
              <div class="sub">${subtitle}</div>
            </div>
          </div>
          <div class="tools">
            ${this._saved ? '<span class="status ok"><ha-icon icon="mdi:check"></ha-icon> SALVATO</span>' : ""}
            ${this._error ? `<span class="status err">${esc(this._error)}</span>` : ""}
            ${this._editing ? `${floorplan
                 ? '<button class="secondary" data-add-room><ha-icon icon="mdi:plus-box-outline"></ha-icon> STANZA</button>'
                 : '<button class="secondary" data-add-section><ha-icon icon="mdi:plus-box-outline"></ha-icon> SEZIONE</button>'}
               <button data-save><ha-icon icon="mdi:content-save"></ha-icon> SALVA</button>` : ""}
            <button class="secondary" data-toggle-edit>
              <ha-icon icon="${this._editing ? "mdi:eye-outline" : "mdi:pencil-outline"}"></ha-icon>
              ${this._editing ? "ESCI" : "MODIFICA"}
            </button>
          </div>
        </header>
        ${tabs}
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

    // --- room entity search (room editor lives outside the card branch)
    if (this._isFloorplan()) {
      const roomSearch = q("[data-entity-search]");
      if (roomSearch) {
        roomSearch.oninput = () => {
          this._entityQuery = roomSearch.value;
          const box = q("[data-entity-results]");
          if (box) { box.innerHTML = this._entityResults(); this._bindEntityRows(); }
        };
      }
      this._bindEntityRows();
    }

    // --- card props
    if (card) {
      const flowSearch = this._flowSlot ? q("[data-entity-search]") : null;
      if (flowSearch) {
        flowSearch.oninput = () => {
          this._entityQuery = flowSearch.value;
          const box = q("[data-entity-results]");
          if (box) { box.innerHTML = this._entityResults("power"); this._bindEntityRows(); }
        };
        this._bindEntityRows();
      }
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

    // --- page tabs
    all("[data-page-tab]").forEach((el) => {
      el.onclick = () => {
        this._pageIndex = parseInt(el.getAttribute("data-page-tab"), 10) || 0;
        this._selected = null;
        this._touch();
      };
    });

    // --- floorplan
    all("[data-auto-rooms]").forEach((el) => { el.onclick = () => this._autoRooms(); });
    all("[data-add-room]").forEach((el) => { el.onclick = () => this._addRoom(); });
    all("[data-room-remove]").forEach((el) => {
      el.onclick = () => this._removeRoom(el.getAttribute("data-room-remove"));
    });
    all("[data-view-nudge]").forEach((el) => {
      el.onclick = () => {
        const [key, raw] = el.getAttribute("data-view-nudge").split(":");
        this._nudgeView(key, parseFloat(raw));
      };
    });
    all("[data-view-toggle]").forEach((el) => {
      el.onclick = () => {
        const key = el.getAttribute("data-view-toggle");
        const view = this._page().view;
        view[key] = !view[key];
        this._touch();
      };
    });
    const flat = q("[data-view-flat]");
    if (flat) flat.onclick = () => {
      const view = this._page().view;
      // Toggle between the plan view and the isometric default. The plan is
      // drawn in the screen plane, so pitch 0 looks straight down at it and
      // larger angles tip it away into the isometric view.
      const isFlat = view.pitch <= 12;
      view.pitch = isFlat ? 56 : 0;
      view.yaw = isFlat ? 32 : 0;
      this._touch();
    };
    all("[data-view-prop]").forEach((el) => {
      const apply = () => {
        const key = el.getAttribute("data-view-prop");
        const view = this._page().view;
        view[key] = el.type === "checkbox" ? el.checked : parseFloat(el.value);
        this._touch();
      };
      el.onchange = apply;
      // Sliders feel dead without live feedback, but a full re-render per
      // input event would be wasteful: update the CSS variable directly and
      // only commit state on change.
      if (el.type === "range") {
        el.oninput = () => {
          const key = el.getAttribute("data-view-prop");
          const vp = q("[data-fp-viewport]");
          if (!vp) return;
          if (key === "yaw" || key === "pitch") vp.style.setProperty("--" + key, el.value + "deg");
          else if (key === "zoom") vp.style.setProperty("--zoom", el.value);
          else apply();
        };
      }
    });
    all("[data-fp-badge]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        this._badgeTap(el.getAttribute("data-fp-badge"));
      };
    });
    all("[data-room-prop]").forEach((el) => {
      el.onchange = () => {
        const room = this._room(this._selected && this._selected.roomId);
        if (!room) return;
        const key = el.getAttribute("data-room-prop");
        const numeric = ["x", "y", "w", "h"].includes(key);
        let value = numeric ? parseInt(el.value, 10) || 0 : el.value;
        if (key === "w" || key === "h") value = Math.max(40, value);
        if (key === "area_id" && !value) value = null;
        room[key] = value;
        this._touch();
      };
    });
    const roomAuto = q("[data-room-auto]");
    if (roomAuto) roomAuto.onchange = () => {
      const room = this._room(this._selected && this._selected.roomId);
      if (!room) return;
      // Switching off "automatic" freezes whatever the area currently yields,
      // so the user starts from a populated list instead of an empty one.
      room.entities = roomAuto.checked ? null : this._roomEntities(room).slice();
      this._touch();
    };
    all("[data-room-ent-remove]").forEach((el) => {
      el.onclick = () => {
        const room = this._room(this._selected && this._selected.roomId);
        if (!room || !Array.isArray(room.entities)) return;
        const id = el.getAttribute("data-room-ent-remove");
        room.entities = room.entities.filter((e) => e !== id);
        this._touch();
      };
    });
    this._bindRoomDrag();

    // --- overview cards
    all("[data-toggle-entity]").forEach((el) => {
      el.onclick = () => {
        const id = el.getAttribute("data-toggle-entity");
        const d = domainOf(id);
        const sd = ["light", "switch", "fan", "media_player", "input_boolean", "cover", "siren", "humidifier"].includes(d) ? d : "homeassistant";
        this._hass.callService(sd, "toggle", { entity_id: id });
      };
    });
    all("[data-more-info]").forEach((el) => {
      el.onclick = () => this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: el.getAttribute("data-more-info") }, bubbles: true, composed: true }));
    });
    all("[data-active-domain]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        const d = el.getAttribute("data-active-domain");
        const cur = Array.isArray(card.domains) && card.domains.length ? card.domains.slice() : Object.keys(ACTIVE_DOMAINS);
        const i = cur.indexOf(d);
        if (i >= 0) cur.splice(i, 1); else cur.push(d);
        card.domains = cur;
        this._touch();
      };
    });
    all("[data-person]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        const id = el.getAttribute("data-person");
        const allP = Object.keys(this._hass.states).filter((x) => x.startsWith("person."));
        const cur = Array.isArray(card.people) && card.people.length ? card.people.slice() : allP;
        const i = cur.indexOf(id);
        if (i >= 0) cur.splice(i, 1); else cur.push(id);
        card.people = cur;
        this._touch();
      };
    });
    const overview = q("[data-compose-overview]");
    if (overview) overview.onclick = () => this._composeOverview();

    // --- energy flow editor
    const detect = q("[data-detect-flow]");
    if (detect && card) detect.onclick = () => this._detectFlow(card);
    all("[data-flow-pick]").forEach((el) => {
      el.onclick = () => {
        const key = el.getAttribute("data-flow-pick");
        this._flowSlot = this._flowSlot === key ? null : key;
        this._entityQuery = "";
        this._touch();
      };
    });
    all("[data-flow-clear]").forEach((el) => {
      el.onclick = () => {
        if (!card || !card.flow) return;
        delete card.flow[el.getAttribute("data-flow-clear")];
        this._touch();
      };
    });
    all("[data-flow-invert]").forEach((el) => {
      el.onchange = () => {
        if (!card) return;
        card.flow = card.flow || {};
        card.flow["invert_" + el.getAttribute("data-flow-invert")] = el.checked;
        this._touch();
      };
    });
    all("[data-flow-dev-remove]").forEach((el) => {
      el.onclick = () => {
        if (!card || !card.flow || !card.flow.devices) return;
        card.flow.devices.splice(parseInt(el.getAttribute("data-flow-dev-remove"), 10), 1);
        this._touch();
      };
    });

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
        const id = row.getAttribute("data-pick-entity");
        if (this._flowSlot) {
          const c = this._selectedCard();
          if (c) {
            c.flow = c.flow || {};
            if (this._flowSlot === "__dev") {
              c.flow.devices = c.flow.devices || [];
              if (!c.flow.devices.some((d) => d.entity === id)) {
                c.flow.devices.push({ entity: id, name: "", icon: "" });
              }
            } else {
              c.flow[this._flowSlot] = id;
            }
          }
          this._flowSlot = null;
          this._entityQuery = "";
          this._touch();
          return;
        }
        if (this._isFloorplan()) {
          const room = this._room(this._selected && this._selected.roomId);
          if (!room || !Array.isArray(room.entities)) return;
          if (!room.entities.includes(id)) room.entities.push(id);
          this._entityQuery = "";
          this._touch();
          return;
        }
        const c = this._selectedCard();
        if (!c) return;
        c.entity_id = id;
        const st = this._hass.states[id];
        if (!c.appearance.icon) c.appearance.icon = autoIcon(id, st);
        this._entityQuery = "";
        this._touch();
      };
    });
  }

  _nudgeView(key, delta) {
    const view = this._page().view;
    if (key === "yaw") view.yaw = (((view.yaw + delta) % 360) + 360) % 360;
    else if (key === "pitch") view.pitch = Math.max(0, Math.min(85, view.pitch + delta));
    else if (key === "zoom") view.zoom = Math.max(0.3, Math.min(3, +(view.zoom + delta).toFixed(2)));
    this._touch();
  }

  /**
   * Drag a room across the plan.
   *
   * The pointer moves in screen space but the room lives in plan space, and the
   * world is rotated, so the screen delta is run through unprojectDelta().
   * Position is written straight to element style during the gesture and only
   * committed to state on release — re-rendering on every pointermove would
   * destroy the element being dragged mid-gesture.
   */
  _bindRoomDrag() {
    if (!this._editing || !this._isFloorplan()) return;
    const view = this._page().view;
    Array.from(this.querySelectorAll(".fp-room.editable")).forEach((el) => {
      el.onpointerdown = (ev) => {
        if (ev.target.closest("[data-fp-badge]")) return;
        const room = this._room(el.getAttribute("data-room"));
        if (!room) return;
        ev.preventDefault();
        el.setPointerCapture(ev.pointerId);
        const start = { x: ev.clientX, y: ev.clientY, rx: room.x, ry: room.y, moved: false };

        el.onpointermove = (mv) => {
          const sdx = mv.clientX - start.x, sdy = mv.clientY - start.y;
          if (!start.moved && Math.hypot(sdx, sdy) < 4) return;
          start.moved = true;
          const d = unprojectDelta(sdx, sdy, view.yaw, view.pitch, view.zoom);
          room.x = Math.round((start.rx + d.dx) / 5) * 5;
          room.y = Math.round((start.ry + d.dy) / 5) * 5;
          el.style.left = room.x + "px";
          el.style.top = room.y + "px";
        };

        el.onpointerup = () => {
          el.onpointermove = null;
          el.onpointerup = null;
          try { el.releasePointerCapture(ev.pointerId); } catch (e) { /* already released */ }
          if (start.moved) { this._touch(); return; }
          this._selected = { kind: "room", roomId: room.id };
          this._entityQuery = "";
          this._touch();
        };
      };
    });
  }

  _badgeTap(entityId) {
    const st = this._hass.states[entityId];
    if (!st) return;
    const kind = this._badgeKind(entityId);
    const domain = domainOf(entityId);
    if (kind === "toggle" || (kind === "binary" && domain === "lock")) {
      const serviceDomain = ["switch", "light", "fan", "media_player", "lock", "cover", "input_boolean"].includes(domain)
        ? domain : "homeassistant";
      this._hass.callService(serviceDomain, domain === "lock" ? (ON_STATES.has(st.state) ? "lock" : "unlock") : "toggle",
        { entity_id: entityId });
      return;
    }
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      detail: { entityId }, bubbles: true, composed: true,
    }));
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

.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:${theme.gap || 16}px;align-items:start}
.item{--accent:#00e5ff;position:relative;display:flex;flex-direction:column;min-height:98px;padding:14px 16px;border-radius:${theme.radius || 16}px;background:linear-gradient(158deg,color-mix(in srgb,var(--accent) 7%,var(--card-background-color)),var(--card-background-color));border:1px solid color-mix(in srgb,var(--accent) 26%,transparent);overflow:hidden;transition:transform .18s,border-color .18s}
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
.value{margin-top:auto;padding-top:10px;font-size:27px;font-weight:750;line-height:1;color:var(--accent);letter-spacing:-.03em}
.entity-value{font-size:20px;text-transform:capitalize}
.unit-inline{font-size:14px;font-weight:500;opacity:.55;margin-left:5px}
.control-row{margin-top:auto;padding-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.control-state{font:10px ui-monospace,monospace;letter-spacing:2px;opacity:.6}
.switch{width:46px;height:26px;border-radius:13px;background:rgba(255,255,255,.14);position:relative;flex-shrink:0;transition:background .22s}
.switch .knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .22s;box-shadow:0 1px 3px rgba(0,0,0,.45)}
.switch.on{background:var(--accent)}
.switch.on .knob{left:23px}
.status-badge{margin-top:auto;padding-top:12px;display:flex;align-items:center;gap:7px}
.status-badge ha-icon{--mdc-icon-size:17px;color:#06d6a0}
.status-badge span{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#06d6a0}
.status-badge.alert ha-icon,.status-badge.alert span{color:var(--accent)}
.climate-body{margin-top:auto;padding-top:12px}
.climate-body .value{margin-top:0;padding-top:0}
.climate-meta{display:flex;gap:12px;margin-top:8px;font:10px ui-monospace,monospace;letter-spacing:.5px;opacity:.8}
.climate-meta span{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:99px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
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


.item.composite,.item.flow{cursor:default}
.bootstrap-actions{display:flex;gap:9px;justify-content:center;flex-wrap:wrap}
.ov-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;flex:1;margin-top:auto;padding:16px 6px;text-align:center;opacity:.5}
.ov-empty ha-icon{--mdc-icon-size:26px;color:var(--accent)}
.ov-empty span{font-size:11.5px;line-height:1.5;max-width:230px}
.ov-empty.ok ha-icon{color:#06d6a0}

.wx{margin-top:12px;display:flex;flex-direction:column;gap:11px}
.wx-now{display:flex;align-items:center;gap:13px}
.wx-icon{--mdc-icon-size:44px;color:var(--accent);filter:drop-shadow(0 0 14px color-mix(in srgb,var(--accent) 50%,transparent));flex-shrink:0}
.wx-temp{font-size:32px;font-weight:750;line-height:1;letter-spacing:-.03em;color:var(--accent)}
.wx-cond{margin-top:4px;font-size:11.5px;opacity:.6}
.wx-facts{display:flex;flex-wrap:wrap;gap:6px}
.wx-facts span{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:99px;font:10px ui-monospace,monospace;letter-spacing:.4px;background:color-mix(in srgb,var(--accent) 11%,transparent);border:1px solid color-mix(in srgb,var(--accent) 20%,transparent)}
.wx-facts ha-icon{--mdc-icon-size:13px;opacity:.75}
.wx-fc{display:flex;gap:5px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--accent) 16%,transparent)}
.wx-day{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 2px;border-radius:10px;background:color-mix(in srgb,var(--accent) 6%,transparent)}
.wx-dow{font:9px ui-monospace,monospace;letter-spacing:1px;opacity:.5;text-transform:uppercase}
.wx-day ha-icon{--mdc-icon-size:18px;color:var(--accent);opacity:.85}
.wx-hi{font-size:12.5px;font-weight:700}
.wx-lo{font-size:10px;opacity:.45}

.act{margin-top:12px;display:flex;flex-direction:column;gap:9px}
.act-count{display:flex;align-items:baseline;gap:6px}
.act-count strong{font-size:28px;font-weight:750;color:var(--accent);line-height:1}
.act-count span{font:10px ui-monospace,monospace;letter-spacing:2px;opacity:.5;text-transform:uppercase}
.act-list{display:flex;flex-direction:column;gap:3px}
.act-row{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border-radius:8px;background:color-mix(in srgb,var(--accent) 7%,transparent);border:1px solid transparent;color:var(--primary-text-color);font-size:11.5px;font-weight:500;letter-spacing:0;text-align:left}
.act-row:hover{border-color:color-mix(in srgb,var(--accent) 40%,transparent);background:color-mix(in srgb,var(--accent) 13%,transparent)}
.act-row ha-icon{--mdc-icon-size:15px;color:var(--accent);flex-shrink:0}
.act-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.act-row small{font:9px ui-monospace,monospace;letter-spacing:.6px;opacity:.45;text-transform:uppercase;flex-shrink:0}
.act-more{font:10px ui-monospace,monospace;letter-spacing:1px;opacity:.4}

.notif{margin-top:12px;display:flex;flex-direction:column;gap:6px}
.notif-row{display:flex;gap:9px;padding:9px 10px;border-radius:10px;background:color-mix(in srgb,#ffd166 10%,transparent);border:1px solid color-mix(in srgb,#ffd166 26%,transparent)}
.notif-row ha-icon{--mdc-icon-size:17px;color:#ffd166;flex-shrink:0}
.notif-row div{min-width:0}
.notif-row strong{display:block;font-size:12px}
.notif-row small{display:block;margin-top:2px;font-size:10.5px;opacity:.6;line-height:1.45}
.notif-row.upd{background:color-mix(in srgb,var(--accent) 10%,transparent);border-color:color-mix(in srgb,var(--accent) 26%,transparent)}
.notif-row.upd ha-icon{color:var(--accent)}

.ppl{margin-top:12px;display:flex;flex-direction:column;gap:5px}
.ppl-row{display:flex;align-items:center;gap:9px;width:100%;padding:6px 8px;border-radius:10px;background:color-mix(in srgb,var(--accent) 6%,transparent);border:1px solid transparent;color:var(--primary-text-color);text-align:left;font-weight:500;letter-spacing:0}
.ppl-row:hover{border-color:color-mix(in srgb,var(--accent) 35%,transparent)}
.ppl-row img{width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;filter:grayscale(1);opacity:.5}
.ppl-row.home img{filter:none;opacity:1}
.ppl-row>ha-icon{--mdc-icon-size:20px;width:30px;height:30px;padding:5px;border-radius:50%;background:rgba(255,255,255,.06);flex-shrink:0;opacity:.5}
.ppl-row.home>ha-icon{opacity:1;color:#06d6a0;background:rgba(6,214,160,.14)}
.ppl-row div{flex:1;min-width:0}
.ppl-row strong{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ppl-row small{display:block;font:9px ui-monospace,monospace;letter-spacing:1px;opacity:.45;text-transform:uppercase}
.ppl-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.18);flex-shrink:0}
.ppl-row.home .ppl-dot{background:#06d6a0;box-shadow:0 0 9px #06d6a0}

.dom-grid{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}
.dom-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:99px;font-size:10.5px;font-weight:600;letter-spacing:.02em;background:transparent;border:1px solid var(--divider-color);color:var(--primary-text-color);opacity:.5}
.dom-chip ha-icon{--mdc-icon-size:13px}
.dom-chip.on{opacity:1;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 50%,transparent);background:color-mix(in srgb,var(--accent) 13%,transparent)}

.item.flow .value{display:none}
.ef{margin-top:10px;display:flex;flex-direction:column;gap:10px;max-width:560px;margin-left:auto;margin-right:auto;width:100%}
.ef-svg{display:block;width:100%;max-width:520px;margin:0 auto;height:auto;overflow:visible}
.ef-node-bg{fill:color-mix(in srgb,var(--nc) 16%,#0a1119);stroke:none}
.ef-node-ring{fill:none;stroke:var(--nc);stroke-width:1.5;opacity:.85}
.ef-node-label{fill:currentColor;opacity:.45;font:600 10px ui-monospace,monospace;letter-spacing:2px;text-anchor:middle}
.ef-node-val{fill:var(--nc);font:750 21px Inter,system-ui,sans-serif;text-anchor:middle;letter-spacing:-.02em}
.ef-node-unit{fill:currentColor;opacity:.5;font:600 10px ui-monospace,monospace;text-anchor:middle}
.ef-node-sub{fill:currentColor;opacity:.4;font:600 9px ui-monospace,monospace;letter-spacing:1.4px;text-anchor:middle}
.ef-path{fill:none;stroke-width:2;stroke-linecap:round}
.ef-path.idle{stroke:currentColor;opacity:.12;stroke-dasharray:4 6}
.ef-path.active{stroke:var(--nc);opacity:.3}
.ef-dot{fill:var(--nc);filter:drop-shadow(0 0 5px var(--nc))}
.ef-empty{display:flex;flex-direction:column;align-items:center;gap:7px;padding:34px 18px;text-align:center;opacity:.6}
.ef-empty ha-icon{--mdc-icon-size:30px;color:var(--accent)}
.ef-empty strong{font-size:13px}
.ef-empty span{font-size:11.5px;opacity:.7;max-width:320px;line-height:1.5}
.ef-devs{display:flex;flex-direction:column;gap:5px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--accent) 16%,transparent)}
.ef-dev{display:flex;align-items:center;gap:9px;padding:5px 2px;cursor:pointer;border-radius:8px}
.ef-dev:hover{background:color-mix(in srgb,var(--accent) 9%,transparent)}
.ef-dev ha-icon{--mdc-icon-size:16px;color:var(--accent);opacity:.8;flex-shrink:0}
.ef-dev-text{flex:1;min-width:0}
.ef-dev-text span{display:block;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ef-dev-bar{height:3px;margin-top:4px;border-radius:99px;background:rgba(255,255,255,.09);overflow:hidden}
.ef-dev-bar i{display:block;height:100%;background:var(--accent);border-radius:99px;transition:width .5s ease}
.ef-dev strong{font:750 13px Inter,system-ui,sans-serif;color:var(--accent);flex-shrink:0}
.ef-dev strong small{font-size:9px;opacity:.55;margin-left:2px;font-weight:600}
.flow-slot{margin-top:9px;padding:10px;border-radius:11px;background:color-mix(in srgb,var(--nc) 8%,transparent);border:1px solid color-mix(in srgb,var(--nc) 26%,transparent)}
.flow-slot.active{border-color:var(--nc)}
.flow-slot-head{display:flex;align-items:center;gap:9px}
.flow-slot-head>ha-icon{--mdc-icon-size:19px;color:var(--nc);flex-shrink:0}
.flow-slot-head>div{flex:1;min-width:0}
.flow-slot-head strong{display:block;font-size:12px}
.flow-slot-head small{display:block;opacity:.5;font:10px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.flow-slot .check{margin-top:8px;font-size:10.5px}
.flow-slot input[type=text]{margin-top:8px}

.page-tabs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:20px}
.page-tab{padding:9px 14px;border-radius:11px;background:transparent;border:1px solid var(--divider-color);color:var(--primary-text-color);opacity:.55;font-size:11px}
.page-tab ha-icon{--mdc-icon-size:16px}
.page-tab:hover{opacity:.85}
.page-tab.active{opacity:1;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 55%,transparent);background:color-mix(in srgb,var(--accent) 12%,transparent)}

.fp-viewport{position:relative;height:min(74vh,760px);min-height:420px;border-radius:20px;overflow:hidden;touch-action:none;border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);background:radial-gradient(120% 90% at 50% 15%,color-mix(in srgb,var(--accent) 9%,#0b1119) 0%,#080d14 70%);perspective:1900px;perspective-origin:50% 42%}
.fp-stage{position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d}
.fp-world{position:absolute;transform-style:preserve-3d;transform:scale(var(--zoom)) rotateX(var(--pitch)) rotateZ(var(--yaw));transition:transform .28s cubic-bezier(.4,0,.2,1)}
.fp-ground{position:absolute;border-radius:14px;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 40px),repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 40px),rgba(255,255,255,.02);box-shadow:0 0 70px rgba(0,0,0,.6)}
.fp-room{position:absolute;transform-style:preserve-3d}
.fp-room.editable{cursor:grab}
.fp-room.editable:active{cursor:grabbing}
.fp-floor{position:absolute;inset:0;border-radius:3px;background:linear-gradient(135deg,color-mix(in srgb,var(--rc) 26%,#0d141d),color-mix(in srgb,var(--rc) 9%,#0b111a));border:1px solid color-mix(in srgb,var(--rc) 55%,transparent);box-shadow:inset 0 0 40px color-mix(in srgb,var(--rc) 14%,transparent)}
.fp-room.selected .fp-floor{border:2px solid #fff;background:linear-gradient(135deg,color-mix(in srgb,var(--rc) 52%,#0d141d),color-mix(in srgb,var(--rc) 26%,#0b111a));box-shadow:inset 0 0 60px color-mix(in srgb,var(--rc) 45%,transparent),0 0 40px color-mix(in srgb,var(--rc) 70%,transparent)}
.fp-room.selected .fp-wall{border-color:#fff;filter:brightness(1.35)}
.fp-wall{position:absolute;background:linear-gradient(to top,color-mix(in srgb,var(--rc) 34%,#0a1017) 0%,color-mix(in srgb,var(--rc) 12%,#0a1017) 65%,color-mix(in srgb,var(--rc) 26%,#0a1017) 100%);border:1px solid color-mix(in srgb,var(--rc) 42%,transparent);border-bottom:0}
.fp-wall.side{filter:brightness(.82)}
.fp-anchor{position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d;pointer-events:none}
.fp-tag{position:absolute;left:0;top:0;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:5px;width:max-content}
.fp-label{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:99px;background:rgba(6,12,20,.82);border:1px solid color-mix(in srgb,var(--rc) 50%,transparent);backdrop-filter:blur(6px);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--rc);white-space:nowrap}
.fp-label ha-icon{--mdc-icon-size:15px}
.fp-badges{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;max-width:186px;pointer-events:auto}
.fp-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:99px;font-size:11px;font-weight:650;letter-spacing:.02em;white-space:nowrap;color:#e8f4ff;background:rgba(8,14,22,.86);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(6px);box-shadow:0 3px 10px rgba(0,0,0,.45);cursor:pointer;transition:transform .15s,border-color .15s}
.fp-badge:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.4)}
.fp-badge ha-icon{--mdc-icon-size:14px;opacity:.85}
.fp-badge.on{color:#0a1017;background:linear-gradient(180deg,#ffd98a,#ffc247);border-color:#ffdb8f;box-shadow:0 3px 14px rgba(255,194,71,.45)}
.fp-badge.on ha-icon{opacity:1}
.fp-badge.off{opacity:.72}
.fp-badge.alert{color:#0a1017;background:linear-gradient(180deg,#ff8fa3,#ff3d71);border-color:#ff8fa3;box-shadow:0 3px 14px rgba(255,61,113,.45)}
.fp-hud{position:absolute;left:14px;bottom:14px;display:flex;gap:5px;flex-wrap:wrap;padding:6px;border-radius:13px;background:rgba(8,14,22,.8);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(8px)}
.fp-hud-btn{padding:7px;border-radius:9px;background:transparent;border:1px solid transparent;color:#cfe6f5;opacity:.7}
.fp-hud-btn:hover{opacity:1;background:rgba(255,255,255,.08)}
.fp-hud-btn.active{opacity:1;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,transparent);background:color-mix(in srgb,var(--accent) 15%,transparent)}
.fp-hud-btn ha-icon{--mdc-icon-size:17px;display:block}
.fp-hint{position:absolute;right:14px;bottom:18px;font:10px ui-monospace,monospace;letter-spacing:1.4px;opacity:.4;pointer-events:none}
.room-entities{margin-top:8px;display:flex;flex-direction:column;gap:4px}
.room-ent{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;background:color-mix(in srgb,var(--accent) 7%,transparent);border:1px solid color-mix(in srgb,var(--accent) 18%,transparent);font-size:11.5px}
.room-ent ha-icon{--mdc-icon-size:16px;color:var(--accent);flex-shrink:0}
.room-ent span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.editor input[type=range]{padding:0;height:26px;background:transparent;border:0;accent-color:var(--accent)}

@media(max-width:1200px){.workspace.editing{grid-template-columns:minmax(0,1fr)}.editor{position:relative;top:0;max-height:none}}
@media(max-width:820px){.shell{padding:14px 14px 40px}.grid{grid-template-columns:repeat(6,minmax(0,1fr))}.item{grid-column:span 6!important}.top{align-items:flex-start}}
`;
  }
}

if (!customElements.get("cyborg-dashboard")) {
  customElements.define("cyborg-dashboard", CyborgDashboard);
}
