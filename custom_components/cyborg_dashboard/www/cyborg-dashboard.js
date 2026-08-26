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
    // These two build nothing from entity scoring: they exist so the page
    // editor can drop in a ready-made section holding the composite card.
    id: "monitoraggio", title: "Monitoraggio", icon: "mdi:gauge-full", accent: "#8ecae6", limit: 0,
    score: () => 0, cardType: () => "monitor", seed: "monitor",
  },
  {
    id: "economia", title: "Economia", icon: "mdi:cash-multiple", accent: "#ffd166", limit: 0,
    score: () => 0, cardType: () => "economy", seed: "economy",
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

/**
 * Guided energy setup, modelled on the Home Assistant energy configuration:
 * one question per screen, in the order an installer actually thinks about a
 * plant. The raw slot editor stays available behind "configurazione avanzata"
 * for anyone who already knows which entity is which.
 */
const WIZARD_STEPS = [
  { key: "solar", title: "Produzione fotovoltaica",
    q: "Quale sensore misura la potenza prodotta dal fotovoltaico?",
    hint: "Cerca la potenza istantanea dell'inverter, in W o kW. Non l'energia in kWh.",
    skip: "Non ho il fotovoltaico",
    match: /solar|fotovolt|pv|inverter|produzion/i },
  { key: "battery", title: "Accumulo",
    q: "Quale sensore misura la potenza della batteria?",
    hint: "Un solo sensore con segno: positivo in scarica, negativo in carica. Se nel tuo impianto è al contrario, lo raddrizzi al passo finale.",
    skip: "Non ho l'accumulo",
    match: /batter|accumul|bess/i },
  { key: "grid", title: "Scambio con la rete",
    q: "Quale sensore misura lo scambio con la rete?",
    hint: "Positivo quando prelevi, negativo quando immetti. È l'unico davvero necessario per far funzionare lo schema.",
    skip: "Salta (schema senza rete)",
    match: /rete|grid|scambio|contator|preliev|immiss|fase/i },
  { key: "home", title: "Consumo di casa",
    q: "Hai un sensore che misura il consumo totale di casa?",
    hint: "Se non ce l'hai, salta: Cyborg lo calcola da solo come solare + prelievo + scarica − immissione − carica.",
    skip: "Non ce l'ho, calcolalo tu",
    match: /casa|home|consumo.*total|total.*consumo|carichi/i },
];

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

/** Winding of a plain rectangular room, in bounding-box fractions. */
const RECT_POINTS = [[0, 0], [1, 0], [1, 1], [0, 1]];

/**
 * Footprint of a room as a closed polygon in bounding-box fractions.
 *
 * Storing vertices as fractions rather than plan units is what lets a resize
 * handle stay trivial: it only writes w/h, and any shape follows. A room with
 * no explicit polygon is a rectangle, which is the overwhelming majority, so
 * that case allocates nothing beyond the shared constant.
 */
function roomPoints(room) {
  const pts = room && room.points;
  if (!Array.isArray(pts) || pts.length < 3) return RECT_POINTS;
  const out = [];
  for (const p of pts) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = Number(p[0]), y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
  }
  return out.length >= 3 ? out : RECT_POINTS;
}

/** CSS clip-path / SVG polygon string for a footprint, in percent units. */
function pointsToCss(points) {
  return points.map((p) => `${(p[0] * 100).toFixed(3)}% ${(p[1] * 100).toFixed(3)}%`).join(",");
}
function pointsToSvg(points) {
  return points.map((p) => `${(p[0] * 100).toFixed(3)},${(p[1] * 100).toFixed(3)}`).join(" ");
}

/**
 * One extruded wall per polygon edge.
 *
 * Each wall is a flat div hinged along its own edge: it is placed at the first
 * vertex, turned in the floor plane by the edge bearing (rotateZ) and then
 * folded up out of that plane (rotateX(90deg)). transform-origin sits on the
 * hinge, otherwise the wall would pivot about its centre and end up half
 * buried under the floor. This generalises the four hard-coded walls the map
 * had while it could only draw rectangles, and reproduces them exactly for a
 * rectangular footprint.
 *
 * The per-edge brightness is not decoration: with a single flat colour an
 * L-shaped room reads as a blob, because the eye needs different shading on
 * differently-oriented faces to resolve the corner.
 */
function roomEdges(room) {
  const pts = roomPoints(room);
  const w = room.w, h = room.h;
  const edges = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const x1 = a[0] * w, y1 = a[1] * h;
    const dx = b[0] * w - x1, dy = b[1] * h - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    edges.push({ x: x1, y: y1, len, angle,
      shade: 1 - 0.2 * Math.abs(Math.sin((angle * Math.PI) / 180)) });
  }
  return edges;
}

/**
 * What stands on each side of a room.
 *
 * A balcony does not have four walls: it has one wall with a French window and
 * a railing on the other three sides, and drawing four solid slabs around it
 * makes the map lie about the house. Each edge therefore carries a type, and
 * the renderer gives each type its own height, opacity and detailing —
 * a railing is waist-high and see-through, glazing is full height and
 * transparent, an opening is nothing at all.
 *
 * `h` is a fraction of the room's wall height, so raising the storey height
 * keeps the proportions.
 */
const WALL_TYPES = [
  { k: "wall", l: "Muro", icon: "mdi:wall", h: 1, opacity: 1, glass: false },
  { k: "glass", l: "Porta finestra", icon: "mdi:door-sliding-glass", h: 1, opacity: 0.3, glass: true },
  { k: "window", l: "Finestra", icon: "mdi:window-closed-variant", h: 1, opacity: 0.55, glass: true, band: true },
  { k: "door", l: "Porta", icon: "mdi:door", h: 1, opacity: 0.85, door: true },
  { k: "garage", l: "Basculante", icon: "mdi:garage", h: 1, opacity: 0.7, ribs: true },
  { k: "railing", l: "Ringhiera", icon: "mdi:fence", h: 0.52, opacity: 0.34, posts: true },
  { k: "stairs", l: "Scala", icon: "mdi:stairs", h: 0.9, opacity: 0.5, steps: true },
  { k: "open", l: "Aperto", icon: "mdi:border-none-variant", h: 0, opacity: 0, none: true },
];
function wallType(key) { return WALL_TYPES.find((w) => w.k === key) || WALL_TYPES[0]; }

/** Type of edge i, defaulting to a plain wall. */
function wallAt(room, index) {
  const list = room && room.walls;
  return wallType(Array.isArray(list) ? list[index] : undefined);
}

/** Area-weighted centre of a footprint, used to place the room label. */
function polygonCentroid(points) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const cross = p[0] * q[1] - q[0] * p[1];
    a += cross;
    cx += (p[0] + q[0]) * cross;
    cy += (p[1] + q[1]) * cross;
  }
  if (Math.abs(a) < 1e-6) {
    let sx = 0, sy = 0;
    for (const p of points) { sx += p[0]; sy += p[1]; }
    return [sx / points.length, sy / points.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/**
 * Turn a plan-space delta into a rotated room's own frame.
 *
 * Everything inside a room — vertices, device positions, resize handles — is
 * expressed relative to the room, so once the room itself is turned the plan
 * delta has to be turned back by the same angle or every drag inside it goes
 * off at a tangent.
 */
function unrotate(delta, rotation) {
  const deg = Number(rotation) || 0;
  if (!deg) return delta;
  const rad = (-deg * Math.PI) / 180;
  return { dx: delta.dx * Math.cos(rad) - delta.dy * Math.sin(rad),
           dy: delta.dx * Math.sin(rad) + delta.dy * Math.cos(rad) };
}

/** Even-odd point-in-polygon, so a dropped device cannot land outside its room. */
function pointInPolygon(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1], xj = points[j][0], yj = points[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

/** Ready-made footprints, because nobody wants to type sixteen coordinates. */
const SHAPE_PRESETS = [
  { k: "rect", l: "Rettangolo", icon: "mdi:square-outline", points: null },
  { k: "l", l: "A L", icon: "mdi:vector-square", points: [[0, 0], [1, 0], [1, 0.55], [0.45, 0.55], [0.45, 1], [0, 1]] },
  { k: "l2", l: "A L specchiata", icon: "mdi:vector-square", points: [[0, 0], [1, 0], [1, 1], [0.55, 1], [0.55, 0.55], [0, 0.55]] },
  { k: "t", l: "A T", icon: "mdi:format-align-center", points: [[0, 0], [1, 0], [1, 0.5], [0.7, 0.5], [0.7, 1], [0.3, 1], [0.3, 0.5], [0, 0.5]] },
  { k: "trap", l: "Trapezio", icon: "mdi:triangle-outline", points: [[0.18, 0], [0.82, 0], [1, 1], [0, 1]] },
  { k: "oct", l: "Smussata", icon: "mdi:octagon-outline", points: [[0.22, 0], [0.78, 0], [1, 0.22], [1, 0.78], [0.78, 1], [0.22, 1], [0, 0.78], [0, 0.22]] },
];

/** Human name of a storey, so the UI never shows a bare signed integer. */
function levelName(level) {
  if (level === 0) return "Piano terra";
  if (level === -1) return "Seminterrato";
  if (level < 0) return `Interrato ${Math.abs(level)}`;
  return `Piano ${level}`;
}

/** The eight grips of a bounding box, as fractions of it. */
const RESIZE_HANDLES = [
  { k: "nw", x: 0, y: 0, t: "Angolo", c: "nwse-resize" },
  { k: "n", x: 0.5, y: 0, t: "Lato", c: "ns-resize" },
  { k: "ne", x: 1, y: 0, t: "Angolo", c: "nesw-resize" },
  { k: "e", x: 1, y: 0.5, t: "Lato", c: "ew-resize" },
  { k: "se", x: 1, y: 1, t: "Angolo", c: "nwse-resize" },
  { k: "s", x: 0.5, y: 1, t: "Lato", c: "ns-resize" },
  { k: "sw", x: 0, y: 1, t: "Angolo", c: "nesw-resize" },
  { k: "w", x: 0, y: 0.5, t: "Lato", c: "ew-resize" },
];

/**
 * Zoom that makes one room fill the viewport at the current camera.
 *
 * The isometric projection turns a w x h footprint into a parallelogram whose
 * screen bounding box is w|cosY| + h|sinY| wide and cosP(w|sinY| + h|cosY|)
 * tall. Fitting that box, rather than the raw footprint, is why the zoom is
 * right at every yaw instead of only when the room happens to face the camera.
 */
function fitZoom(w, h, yawDeg, pitchDeg, vpW, vpH, margin) {
  const y = (yawDeg * Math.PI) / 180, p = (pitchDeg * Math.PI) / 180;
  const cY = Math.abs(Math.cos(y)), sY = Math.abs(Math.sin(y));
  const projW = w * cY + h * sY;
  const projH = Math.max(0.08, Math.cos(p)) * (w * sY + h * cY);
  const k = Math.min(vpW / Math.max(1, projW), vpH / Math.max(1, projH)) * (margin || 0.62);
  return Math.min(3, Math.max(0.3, k));
}

/** Grid arrangement for devices the user has not positioned by hand. */
function autoSpot(index, total) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.max(1, Math.ceil(total / cols));
  const c = index % cols, r = Math.floor(index / cols);
  return [(c + 0.5) / cols, (r + 0.5) / rows];
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

/** Italian name of a device_class, or the raw key when we have no word for it. */
function dcLabel(key) {
  return DEVICE_CLASS_LABELS[key] || String(key).replace(/_/g, " ");
}

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

/**
 * "Attivi ora", grouped by what being active actually *means*.
 *
 * A flat list mixing a dimmed lamp, an open shutter, a heat pump in dry mode
 * and a paused speaker tells the reader nothing: every row says a different
 * kind of thing and none of them says which. Grouping restores the meaning —
 * four lights on, two shutters open — and each group knows how to phrase its
 * own rows and what its off switch is.
 */
const ACTIVE_GROUPS = [
  { k: "luci", l: "Luci accese", one: "luce accesa", icon: "mdi:lightbulb-on",
    color: "#ffd166", domains: ["light"], off: { domain: "light", service: "turn_off" },
    detail: (st) => {
      const b = st.attributes.brightness;
      const pct = b === undefined ? null : Math.round((b / 255) * 100);
      const temp = st.attributes.color_temp_kelvin;
      return [pct !== null ? pct + "%" : null, temp ? temp + "K" : null].filter(Boolean).join(" · ") || "accesa";
    } },
  { k: "carichi", l: "Prese e interruttori", one: "presa accesa", icon: "mdi:power-plug",
    color: "#00e5ff", domains: ["switch", "input_boolean"], off: { domain: "homeassistant", service: "turn_off" },
    detail: () => "acceso" },
  { k: "clima", l: "Clima in funzione", one: "clima in funzione", icon: "mdi:thermostat",
    color: "#06d6a0", domains: ["climate", "fan", "humidifier", "water_heater"],
    off: { domain: "homeassistant", service: "turn_off" },
    detail: (st) => {
      const cur = st.attributes.current_temperature, set = st.attributes.temperature;
      if (cur !== undefined || set !== undefined) {
        return [cur !== undefined ? cur + "° ora" : null, set !== undefined ? "→ " + set + "°" : null]
          .filter(Boolean).join(" ");
      }
      const pct = st.attributes.percentage;
      if (pct !== undefined) return pct + "% velocità";
      return stateWords(st.state);
    } },
  { k: "aperture", l: "Tapparelle e porte aperte", one: "apertura", icon: "mdi:window-shutter-open",
    color: "#8ecae6", domains: ["cover"], off: { domain: "cover", service: "close_cover" },
    detail: (st) => {
      const pos = st.attributes.current_position;
      return pos !== undefined ? "aperta al " + pos + "%" : "aperta";
    } },
  { k: "media", l: "Media in riproduzione", one: "media attivo", icon: "mdi:play-circle",
    color: "#c77dff", domains: ["media_player"], off: { domain: "media_player", service: "turn_off" },
    detail: (st) => {
      const t = st.attributes.media_title;
      if (t) return String(t).slice(0, 42);
      return st.state === "paused" ? "in pausa" : stateWords(st.state);
    } },
  { k: "pulizia", l: "Pulizia in corso", one: "robot al lavoro", icon: "mdi:robot-vacuum",
    color: "#a0e7a0", domains: ["vacuum"], off: { domain: "vacuum", service: "return_to_base" },
    detail: (st) => {
      const b = st.attributes.battery_level;
      return stateWords(st.state) + (b !== undefined ? " · " + b + "%" : "");
    } },
  { k: "allarmi", l: "Sirene attive", one: "sirena attiva", icon: "mdi:bullhorn",
    color: "#ff3d71", domains: ["siren"], alert: true, off: { domain: "siren", service: "turn_off" },
    detail: () => "IN ALLARME" },
];

/** Domain -> group, resolved once instead of scanning the table per entity. */
const ACTIVE_GROUP_OF = (() => {
  const map = {};
  for (const g of ACTIVE_GROUPS) for (const d of g.domains) map[d] = g;
  return map;
})();

/**
 * "da 12 min", "da 2 h", "da ieri".
 *
 * How long something has been on is the single most useful thing the card can
 * add: a light on for four minutes is somebody in the room, the same light on
 * for nine hours is a light nobody turned off.
 */
function sinceWords(ms, nowMs) {
  if (!ms) return "";
  const secs = Math.max(0, Math.round(((nowMs || Date.now()) - ms) / 1000));
  if (secs < 90) return "ora";
  const mins = Math.round(secs / 60);
  if (mins < 60) return "da " + mins + " min";
  const hours = Math.floor(mins / 60), rem = mins % 60;
  if (hours < 24) return "da " + hours + " h" + (rem >= 5 ? " " + rem : "");
  const days = Math.floor(hours / 24);
  return days === 1 ? "da ieri" : "da " + days + " giorni";
}

/** Relative wording for a notification timestamp. */
function agoWords(iso, nowMs) {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return "";
  const secs = Math.max(0, Math.round(((nowMs || Date.now()) - ms) / 1000));
  if (secs < 60) return "adesso";
  const mins = Math.round(secs / 60);
  if (mins < 60) return mins + " min fa";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " h fa";
  const days = Math.floor(hours / 24);
  return days === 1 ? "ieri" : days + " giorni fa";
}

/** Where a notification came from, as an icon and a colour. */
const NOTIF_CHANNELS = {
  telegram: { icon: "mdi:send-circle", color: "#29b6f6", l: "Telegram" },
  mobile: { icon: "mdi:cellphone-message", color: "#06d6a0", l: "App" },
  push: { icon: "mdi:web", color: "#8ecae6", l: "Push web" },
  persistent: { icon: "mdi:bell-ring-outline", color: "#ffd166", l: "Home Assistant" },
  notify: { icon: "mdi:message-text-outline", color: "#c77dff", l: "Notifica" },
};
function notifChannel(key) { return NOTIF_CHANNELS[key] || NOTIF_CHANNELS.notify; }

/* ==========================================================================
 * MONITORAGGIO — diagnostica d'impianto
 *
 * Thresholds are not decoration: EN 50160 fixes the supply voltage at 230 V
 * +/-10% (207-253 V) and the frequency at 50 Hz +/-1%, so a reading can be
 * called out as out of tolerance against a standard instead of a guess. The
 * grid gauge is measured against the contractual limit because that is what
 * actually trips the meter.
 * ======================================================================== */

/**
 * Diagnostic groups and their default limits.
 *
 * The defaults are standards, not opinions — EN 50160 for voltage and
 * frequency, 0.90 for the power factor because below it the distributor
 * penalises — and that is exactly why they must remain *defaults*. A server
 * cabinet that idles at 78 °C is not a fault, an inverter derating above 60 °C
 * is, and a 24 V control circuit has nothing to do with 230 V tolerances. Each
 * limit is therefore overridable per card, and the card says which numbers it
 * is judging against so a reading is never called "out of tolerance" against
 * an invisible rule.
 */
const MONITOR_GROUPS = [
  { key: "voltage", label: "Tensioni", icon: "mdi:sine-wave", unit: "V",
    limits: { warnLow: 207, warnHigh: 253, alarmLow: 195, alarmHigh: 265 },
    std: "EN 50160: 230 V ±10%" },
  { key: "current", label: "Correnti", icon: "mdi:current-ac", unit: "A",
    limits: { warnHigh: null, alarmHigh: null },
    std: "nessuna soglia predefinita: dipende dalla portata dei cavi" },
  { key: "temperature", label: "Temperature", icon: "mdi:thermometer", unit: "°C",
    limits: { warnHigh: 70, alarmHigh: 85 },
    std: "soglia di massima predefinita 70 / 85 °C" },
  { key: "frequency", label: "Frequenza", icon: "mdi:sine-wave", unit: "Hz",
    limits: { warnLow: 49.5, warnHigh: 50.5, alarmLow: 47, alarmHigh: 52 },
    std: "EN 50160: 50 Hz ±1%" },
  { key: "power_factor", label: "Fattore di potenza", icon: "mdi:angle-acute", unit: "",
    limits: { warnLow: 0.9, alarmLow: 0.8 },
    std: "sotto 0,90 è penalizzabile" },
  { key: "battery", label: "Batterie", icon: "mdi:battery", unit: "%",
    limits: { warnLow: 20, alarmLow: 10 },
    std: "avviso al 20%, allarme al 10%" },
];

const LIMIT_KEYS = ["warnLow", "warnHigh", "alarmLow", "alarmHigh"];
const LIMIT_LABELS = { warnLow: "AVVISO SOTTO", warnHigh: "AVVISO SOPRA",
                       alarmLow: "ALLARME SOTTO", alarmHigh: "ALLARME SOPRA" };

/** The limits actually in force for a group: the user's, else the standard. */
function monitorLimits(group, item) {
  const over = (item && item.limits && item.limits[group.key]) || {};
  const out = {};
  for (const k of LIMIT_KEYS) {
    const fallback = Number.isFinite(group.limits[k]) ? group.limits[k] : null;
    const v = over[k];
    if (v === undefined || v === null || v === "") { out[k] = fallback; continue; }
    const n = Number(v);
    // Unparseable stored value falls back to the standard rather than to "no
    // limit": a corrupt document must not quietly disarm a safety threshold.
    out[k] = Number.isFinite(n) ? n : fallback;
  }
  return out;
}

/** "ok" | "warn" | "alarm" for one reading against its limits. */
function limitVerdict(value, limits) {
  if (!Number.isFinite(value)) return "ok";
  // The power factor is judged on magnitude: -0.95 is as good as +0.95, and a
  // sign flip means exporting, not a fault.
  if (limits.alarmLow !== null && value < limits.alarmLow) return "alarm";
  if (limits.alarmHigh !== null && value > limits.alarmHigh) return "alarm";
  if (limits.warnLow !== null && value < limits.warnLow) return "warn";
  if (limits.warnHigh !== null && value > limits.warnHigh) return "warn";
  return "ok";
}

/** One line saying which numbers a group is being judged against. */
function limitHint(group, limits) {
  const bits = [];
  if (limits.warnLow !== null) bits.push("< " + limits.warnLow);
  if (limits.warnHigh !== null) bits.push("> " + limits.warnHigh);
  if (!bits.length) return "nessuna soglia";
  return "avviso " + bits.join(" o ") + (group.unit ? " " + group.unit : "");
}

/** Contractual draw limits commonly found on Italian domestic meters. */
const GRID_LIMIT_PRESETS = [3000, 3300, 4500, 6000, 10000, 15000];

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
  { key: "home",    label: "Casa",     icon: "mdi:home",                color: "#00e5ff" },
];

/**
 * Every power reading normalised to watts.
 *
 * Sensors in one house mix units freely: an inverter reports kW while a smart
 * plug reports W. Reading the raw state and treating it all as watts made a
 * 0.2 kW house look like 0.2 W and turned load shares into 136556%. The unit
 * is part of the value, never an afterthought.
 */
const POWER_UNIT_FACTOR = {
  W: 1, w: 1, watt: 1, watts: 1,
  kW: 1000, kw: 1000, KW: 1000, Kw: 1000,
  MW: 1e6, mW: 0.001,
  VA: 1, kVA: 1000, kva: 1000,
  var: 1, VAr: 1, kvar: 1000, kVAr: 1000,
};

function powerWatts(st) {
  if (!st) return null;
  const n = parseFloat(st.state);
  if (!Number.isFinite(n)) return null;
  const unit = String(st.attributes.unit_of_measurement || "W").trim();
  const factor = Object.prototype.hasOwnProperty.call(POWER_UNIT_FACTOR, unit)
    ? POWER_UNIT_FACTOR[unit] : 1;
  return n * factor;
}

/** Format watts for display, switching to kW once the number gets long. */
function fmtPower(w) {
  if (w === null || w === undefined || !Number.isFinite(w)) return { v: "—", u: "" };
  const a = Math.abs(w);
  if (a >= 1000) return { v: (w / 1000).toFixed(a >= 10000 ? 0 : 2), u: "kW" };
  return { v: a >= 100 ? String(Math.round(w)) : w.toFixed(1), u: "W" };
}

/**
 * Card types.
 *
 * `solo: true` means the card builds its own content and ignores the entity
 * picked above it — choosing one of those on a light card silently dropped the
 * light, with nothing in the interface saying so. They are now in a separate
 * group and the editor explains what the selected type does.
 */
const CARD_TYPES = [
  { k: "entity", l: "Entità", d: "Icona, nome e stato leggibile. Il tipo generico." },
  { k: "sensor", l: "Sensore", d: "Il valore in grande con la sua unità di misura." },
  { k: "control", l: "Controllo", d: "Interruttore on/off. Per luci, prese, ventilatori." },
  { k: "status", l: "Stato", d: "Badge colorato: verde se tutto a posto, acceso se richiede attenzione." },
  { k: "climate", l: "Clima", d: "Temperatura attuale, temperatura impostata e modalità." },
  { k: "gauge", l: "Gauge", d: "Barra percentuale. Per batterie, umidità, livelli." },
  { k: "chart", l: "Grafico", d: "Andamento delle ultime 24 ore dallo storico." },
  { k: "energyflow", l: "Flusso energetico", solo: true, d: "Schema animato Solare / Rete / Batteria / Casa. Si configura da solo." },
  { k: "weather", l: "Meteo", d: "Condizioni e previsioni. Vuole un'entità meteo." },
  { k: "active", l: "Attivi ora", solo: true, d: "Elenco di tutto ciò che è acceso in casa, con spegnimento al tocco." },
  { k: "notifications", l: "Notifiche", solo: true, d: "Avvisi di Home Assistant e aggiornamenti disponibili." },
  { k: "people", l: "Presenze", solo: true, d: "Chi è in casa e chi è fuori." },
  { k: "monitor", l: "Monitoraggio", solo: true, d: "Tensioni, correnti, temperature e prelievo contro il limite del contatore." },
  { k: "camera", l: "Videocamere", solo: true, d: "Anteprime delle camere; al tocco si apre la diretta." },
  { k: "economy", l: "Analisi economica", solo: true, d: "Costi, ricavi e quanto risparmi grazie all'impianto." },
  { k: "comfort", l: "Temperature", solo: true, d: "Temperatura e umidità stanza per stanza, con il giudizio di comfort e la scala colore." },
  { k: "ev", l: "Auto elettrica", solo: true, d: "Stato di carica, potenza alla colonnina, autonomia e tempo alla ricarica completa." },
  { k: "room", l: "Stanza", solo: true, d: "Una stanza intera in una card: luci, clima, aperture e sensori dell'area, con i comandi." },
  { k: "trend", l: "Confronto andamenti", solo: true, d: "Più grandezze sullo stesso grafico: temperature interne contro l'esterna, umidità, potenze." },
  { k: "lights", l: "Luci", solo: true, d: "Tutte le luci per stanza: accensione, intensità, colore, temperatura, effetti e orari." },
  { k: "irrigation", l: "Irrigazione", solo: true, d: "Zone di irrigazione: avvio a tempo garantito da Home Assistant, umidità del terreno, programmi." },
  { k: "alarm", l: "Centrale allarme", d: "Stato reale della centrale e un pulsante per ogni modalità che la centrale dichiara di avere." },
  { k: "thermostat", l: "Controllo temperatura", solo: true, d: "Termostati e condizionatori: acceso/spento, temperatura impostata, modalità, ventola. Più gli interruttori che sospendono le automazioni." },
];

function cardTypeInfo(key) {
  return CARD_TYPES.find((t) => t.k === key) || CARD_TYPES[0];
}

/* ==========================================================================
 * LUCI
 *
 * What a light can actually do is declared by supported_color_modes, verified
 * against core 2026.8.3 (components/light/const.py):
 *
 *   onoff       | the only mode: no dimming at all
 *   brightness  | dimmable, no colour
 *   color_temp  | white with an adjustable temperature in kelvin
 *   hs xy rgb rgbw rgbww | colour
 *   white       | never the only mode
 *
 * Reading it, instead of assuming, is what stops a dimmer slider appearing
 * under a plain relay — and what makes the card correct in advance for the RGB
 * fixtures that are not installed yet: the day one appears, its controls show
 * up on their own because the light itself declares them.
 *
 * light.turn_on treats colour as an exclusive group (vol.Exclusive in the
 * service schema): color_temp_kelvin, hs_color, rgb_color and xy_color may
 * never be sent together, and doing so makes the whole call fail validation.
 * Brightness is in a different group and can always ride along.
 * ======================================================================== */

const COLOR_MODES_BRIGHTNESS = new Set(["brightness", "color_temp", "hs", "xy", "rgb", "rgbw", "rgbww", "white"]);
const COLOR_MODES_COLOR = new Set(["hs", "xy", "rgb", "rgbw", "rgbww"]);

function lightCaps(st) {
  const modes = (st && st.attributes && st.attributes.supported_color_modes) || [];
  const list = Array.isArray(modes) ? modes : [];
  const attrs = (st && st.attributes) || {};
  return {
    dimmable: list.some((m) => COLOR_MODES_BRIGHTNESS.has(m)),
    color: list.some((m) => COLOR_MODES_COLOR.has(m)),
    temp: list.includes("color_temp"),
    effects: Array.isArray(attrs.effect_list) && attrs.effect_list.length > 0,
    minK: Number(attrs.min_color_temp_kelvin) || 2000,
    maxK: Number(attrs.max_color_temp_kelvin) || 6500,
  };
}

/** 0-255 brightness as a percentage, the unit everybody actually thinks in. */
function brightnessPct(st) {
  const b = st && st.attributes && st.attributes.brightness;
  if (b === undefined || b === null) return null;
  return Math.max(1, Math.min(100, Math.round((Number(b) / 255) * 100)));
}

/** #rrggbb for the swatch, from whichever colour attribute the light reports. */
function lightHex(st) {
  const rgb = st && st.attributes && st.attributes.rgb_color;
  if (Array.isArray(rgb) && rgb.length >= 3) {
    return "#" + rgb.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
  }
  return null;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Approximate sRGB of a black-body temperature, for painting the kelvin slider.
 * Tanner Helland's piecewise fit: cheap, monotonic, and close enough that the
 * gradient reads as warm-to-cold, which is all it has to do.
 */
function kelvinToHex(kelvin) {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.52 * Math.log(t - 10) - 305.04;
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}

/** Line colours for a multi-series chart: distinct in hue, equal in weight. */
const MAX_VEHICLES_JS = 8;

const SERIES_COLORS = ["#00e5ff", "#ffd166", "#06d6a0", "#c77dff", "#ff8fab",
                       "#8ecae6", "#ff924c", "#a0e7a0", "#f4978e", "#b5e48c",
                       "#7bdff2", "#e0aaff"];
/** Mirrors MAX_TREND_SERIES in core/schema.py — keep the two in step. */
const MAX_TREND_SERIES = 12;

const TREND_RANGES = [
  { h: 6, l: "6 ore" }, { h: 24, l: "24 ore" },
  { h: 72, l: "3 giorni" }, { h: 168, l: "7 giorni" },
];

/** Ready-made colours, so setting a scene does not require a colour picker. */
const LIGHT_SWATCHES = [
  { hex: "#ffffff", l: "Bianco" }, { hex: "#ffd6a5", l: "Bianco caldo" },
  { hex: "#ff595e", l: "Rosso" }, { hex: "#ff924c", l: "Arancio" },
  { hex: "#ffca3a", l: "Ambra" }, { hex: "#8ac926", l: "Verde" },
  { hex: "#06d6a0", l: "Menta" }, { hex: "#00e5ff", l: "Ciano" },
  { hex: "#4361ee", l: "Blu" }, { hex: "#c77dff", l: "Viola" },
  { hex: "#ff8fab", l: "Rosa" },
];

/** Preset kelvin values with names an installer would use. */
const WHITE_PRESETS = [
  { k: 2200, l: "Candela" }, { k: 2700, l: "Caldo" }, { k: 3000, l: "Relax" },
  { k: 4000, l: "Neutro" }, { k: 5000, l: "Lavoro" }, { k: 6500, l: "Freddo" },
];

/* ==========================================================================
 * COMFORT
 *
 * Not "is it 24.6 degrees" but "is this room comfortable" — the number alone
 * makes the reader do the judging every time, in every room. The bands below
 * are the ones building services use for a dwelling; they are defaults and the
 * card lets them be changed, because a bedroom, a wine cellar and a west-facing
 * balcony do not share an opinion about what is warm.
 * ======================================================================== */

/**
 * A temperature reading that is about a DEVICE, not about a room.
 *
 * Plugs, relays, inverters and computers all publish their own operating
 * temperature with `device_class: temperature`, indistinguishable from a wall
 * sensor as far as the state machine is concerned. Only the name tells them
 * apart, so the name is what gets tested.
 */
const CHIP_TEMP_RE = /(cpu|processor|core temp|chip|board|battery|batteria|plug|presa|relay|rel\u00e8|inverter|charger|caricat|device_temp|internal_temp|_pm[0-9]?_|heatsink|dissipat)/;
/** Sensors that describe the outside, which belongs to no Home Assistant area. */
const OUTDOOR_RE = /(esterno|esterna|external|outdoor|outside|giardino|meteo|weather|open_meteo|fuori)/;
const COMFORT_DEFAULTS = { cold: 18, warm: 26, dry: 30, humid: 60 };

function comfortBands(item) {
  const over = (item && item.bands) || {};
  const out = {};
  for (const k of Object.keys(COMFORT_DEFAULTS)) {
    const n = Number(over[k]);
    out[k] = Number.isFinite(n) ? n : COMFORT_DEFAULTS[k];
  }
  return out;
}

/** Verdict for one room: the word, its colour, and why. */
function comfortVerdict(temp, hum, bands) {
  if (temp === null || temp === undefined || !Number.isFinite(temp)) {
    return { k: "na", l: "N/D", color: "#8d99ae" };
  }
  if (temp < bands.cold) return { k: "cold", l: "FREDDO", color: "#4cc9f0" };
  if (temp > bands.warm) return { k: "hot", l: "CALDO", color: "#ff3d71" };
  // Temperature is in range; humidity decides between comfortable and merely
  // tolerable. A 22-degree room at 75% humidity is not comfortable.
  if (Number.isFinite(hum)) {
    if (hum < bands.dry) return { k: "dry", l: "SECCO", color: "#ffd166" };
    if (hum > bands.humid) return { k: "humid", l: "UMIDO", color: "#8ecae6" };
  }
  return { k: "ok", l: "COMFORT", color: "#06d6a0" };
}

/**
 * Where a temperature sits on a fixed scale, as a percentage.
 *
 * Fixed on purpose: 12 to 34 degrees, the same for every room. A per-room
 * scale would put a cellar at 14 and a balcony at 33 in the same place on
 * their strips, which is precisely the comparison the card exists to make.
 */
const COMFORT_SCALE_MIN = 12, COMFORT_SCALE_MAX = 34;
function comfortPosition(temp) {
  if (!Number.isFinite(temp)) return null;
  const t = Math.max(COMFORT_SCALE_MIN, Math.min(COMFORT_SCALE_MAX, temp));
  return ((t - COMFORT_SCALE_MIN) / (COMFORT_SCALE_MAX - COMFORT_SCALE_MIN)) * 100;
}

/* ==========================================================================
 * AUTO ELETTRICA
 *
 * A charging car is the largest single load a house will ever have — 7.4 kW on
 * a domestic wallbox, 22 kW on three phase — and unlike every other load it is
 * a *store*: the interesting question is not "how much is it drawing" but "how
 * full is it and when will it be ready". Those two facts live on different
 * entities, usually from different integrations (the wallbox measures power,
 * the car reports its state of charge), which is why a vehicle is declared once
 * as a set of entity references and then read as a whole.
 *
 * Every field is optional. A bare wallbox with nothing but a power sensor still
 * works and simply shows less; nothing is invented to fill a gap.
 * ======================================================================== */

/** Words a charger uses for "charging", across integrations and languages. */
const CHARGING_WORDS = /\b(charg|carica|ricarica|in_carica|fast_charg|dc_charg)/i;
const PLUGGED_WORDS = /\b(plug|connect|collegat|inserit|attacc)/i;

/**
 * Read a vehicle's whole state in one go.
 *
 * Returns nulls rather than zeros for anything unknown: a car whose SoC is not
 * published must render as "—", not as an empty battery, because those two
 * mean very different things to somebody deciding whether to drive.
 */
function vehicleState(vehicle, states) {
  const get = (key) => (vehicle[key] ? states[vehicle[key]] : null);
  const num = (st) => {
    if (!st) return null;
    const n = parseFloat(st.state);
    return Number.isFinite(n) ? n : null;
  };

  const socSt = get("battery");
  const soc = num(socSt);
  const powerSt = get("power");
  const powerW = powerSt ? powerWatts(powerSt) : null;
  const rangeKm = num(get("range"));
  const targetSt = get("target");
  const target = num(targetSt);

  const chSt = get("charging");
  let charging = null;
  if (chSt) {
    charging = ON_STATES.has(chSt.state) || CHARGING_WORDS.test(chSt.state);
  } else if (powerW !== null) {
    // No dedicated entity: anything above 400 W on a wallbox is a car
    // charging, not standby. Below that a charger idles, a contactor hums and
    // a meter reads noise.
    charging = powerW > 400;
  }

  const plugSt = get("plugged");
  let plugged = null;
  if (plugSt) {
    plugged = ON_STATES.has(plugSt.state) || PLUGGED_WORDS.test(plugSt.state);
  } else if (charging) {
    plugged = true;
  }

  // Time to target. Only computed when every term is real: capacity declared,
  // power flowing, and a target above the current level.
  let etaMin = null;
  const goal = target !== null ? target : 100;
  if (vehicle.capacity && soc !== null && powerW !== null && powerW > 200 && goal > soc) {
    const kwhNeeded = vehicle.capacity * ((goal - soc) / 100);
    etaMin = Math.round((kwhNeeded / (powerW / 1000)) * 60);
    // Beyond a day the estimate is meaningless: a 2 kW trickle on an empty
    // 100 kWh pack is 50 hours, and printing that as a countdown is noise.
    if (etaMin > 1440) etaMin = null;
  }

  let status;
  if (charging) status = "in carica";
  else if (plugged) status = "collegata";
  else if (plugged === false) status = "scollegata";
  else status = soc !== null ? "a riposo" : "stato sconosciuto";

  return { soc, charging: !!charging, plugged, powerW, rangeKm, target,
    etaMin, status, raw: { socSt, powerSt, chSt } };
}

/** "1 h 25" / "40 min", for a time-to-target. */
function etaWords(minutes) {
  if (minutes === null || minutes === undefined) return "";
  if (minutes < 60) return minutes + " min";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h + " h" + (m >= 5 ? " " + m : "");
}

/** Colour of a state of charge, from empty to full. */
function socColor(soc) {
  if (soc === null || soc === undefined) return "#8d99ae";
  if (soc < 15) return "#ff3d71";
  if (soc < 35) return "#ff924c";
  if (soc < 60) return "#ffd166";
  return "#06d6a0";
}

/* ==========================================================================
 * IRRIGAZIONE
 *
 * A zone is any entity that can be opened: valve, switch, or a light-domain
 * relay someone wired to a solenoid. Timed runs go through the integration's
 * scheduler rather than a timer in this page, because a countdown that dies
 * with the browser tab leaves a valve open and a garden underwater.
 * ======================================================================== */

const IRRIGATION_DOMAINS = ["valve", "switch", "input_boolean", "light"];

/** Default run lengths offered on a zone, in minutes. */
const RUN_PRESETS = [5, 10, 15, 30];

/* ==========================================================================
 * CAMERAS
 *
 * Verified against core 2026.8.3 (components/camera/__init__.py):
 *   /api/camera_proxy/{entity_id}?token=…         single frame
 *   /api/camera_proxy_stream/{entity_id}?token=…  MJPEG, plays inside <img>
 * The token lives in the camera's own state attributes and is rotated by HA,
 * so it is read at render time and never cached.
 *
 * Thumbnails are still frames and only the camera you open becomes a live
 * stream: eight simultaneous MJPEG connections would saturate a wall tablet
 * and the upstream cameras for a wall of images nobody is looking at.
 * ======================================================================== */

function cameraStill(entityId, st) {
  if (!st) return null;
  if (st.attributes.entity_picture) return st.attributes.entity_picture;
  const token = st.attributes.access_token;
  return token ? `/api/camera_proxy/${entityId}?token=${token}` : null;
}

function cameraStream(entityId, st) {
  if (!st) return null;
  const token = st.attributes.access_token;
  return token ? `/api/camera_proxy_stream/${entityId}?token=${token}` : null;
}

/** Composite cards made of device rows, where the tap action is per row. */
const ROW_ACTION_TYPES = new Set(["active", "room", "lights"]);

/** Card types that stand on their own instead of displaying one entity. */
const COMPOSITE_TYPES = new Set(["energyflow", "active", "notifications", "people",
  "monitor", "camera", "economy", "lights", "irrigation", "trend", "room", "ev", "comfort",
  "thermostat"]);

const COMPOSITE_META = {
  comfort:       ["Temperature", "Sensori stanza per stanza", "mdi:home-thermometer", "xl"],
  ev:            ["Auto elettrica", "Ricarica e stato batteria", "mdi:car-electric", "lg"],
  room:          ["Stanza", "Dispositivi della stanza", "mdi:home-floor-g", "md"],
  trend:         ["Confronto andamenti", "Storico a confronto", "mdi:chart-multiple", "lg"],
  lights:        ["Luci", "Illuminazione della casa", "mdi:lightbulb-group", "lg"],
  irrigation:    ["Irrigazione", "Zone e programmi", "mdi:sprinkler-variant", "lg"],
  energyflow:    ["Flusso energetico", "Potenza in tempo reale", "mdi:transit-connection-variant", "lg"],
  active:        ["Attivi ora", "Dispositivi accesi", "mdi:flash-alert-outline", "md"],
  notifications: ["Notifiche", "Avvisi di sistema", "mdi:bell-outline", "md"],
  people:        ["Presenze", "Chi è in casa", "mdi:account-group", "sm"],
  monitor:       ["Monitoraggio", "Diagnostica impianto", "mdi:gauge-full", "lg"],
  camera:        ["Videocamere", "Anteprime live", "mdi:cctv", "lg"],
  thermostat:    ["Controllo temperatura", "Termostati e clima", "mdi:thermostat-box", "lg"],
  economy:       ["Analisi economica", "Costi e risparmio", "mdi:cash-multiple", "lg"],
};

/* ==========================================================================
 * ANALISI ECONOMICA
 *
 * Energy in kWh comes from the recorder statistics
 * (recorder/statistics_during_period, verified in core 2026.8.3), not from
 * the live states: a power reading says nothing about how much a period cost.
 * Every figure is derived from the same three totals — prelievo, immissione,
 * produzione — so the numbers can never disagree with each other.
 * ======================================================================== */

const ECONOMY_PERIODS = [
  { key: "today", label: "Oggi", days: 1, bucket: "hour" },
  { key: "week", label: "7 giorni", days: 7, bucket: "day" },
  { key: "month", label: "30 giorni", days: 30, bucket: "day" },
  { key: "year", label: "12 mesi", days: 365, bucket: "month" },
];

function eur(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return (v < 0 ? "−" : "") + Math.abs(v).toFixed(2).replace(".", ",");
}

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

/* ==========================================================================
 * CENTRALE DI ALLARME
 *
 * An alarm panel rendered as an on/off switch is a lie with three heads.
 *
 * 1. "On" is not a state an alarm has. Home Assistant panels arm to a MODE —
 *    armed_home, armed_away, armed_night, armed_vacation, armed_custom_bypass
 *    — and a switch cannot express which one, so it silently picks for you.
 * 2. Half the states are transitions. `arming` and `pending` are the exit and
 *    entry delays; `triggered` means the siren is going. A two-position toggle
 *    has nowhere to put any of them, so it shows the wrong one of its two
 *    positions while the house is counting down.
 * 3. Panels can demand a code. `code_format` / `code_arm_required` say so, and
 *    a switch has no way to ask for it, so the call just fails.
 *
 * Feature bits verified against the running instance (core 2026.8.3) by
 * reading the target selectors that alarm_control_panel's own services
 * declare: alarm_arm_home wants supported_features 1, alarm_arm_away 2,
 * alarm_arm_night 4, alarm_trigger 8, alarm_arm_custom_bypass 16,
 * alarm_arm_vacation 32. Only the modes a panel really has get a button.
 * ======================================================================== */

/* ==========================================================================
 * CONTROLLO TEMPERATURA
 *
 * Feature bits from ClimateEntityFeature, checked against the two units in
 * this house: the air conditioner reports 953 =
 *   1 TARGET_TEMPERATURE + 8 FAN_MODE + 16 PRESET_MODE + 32 SWING_MODE
 *   + 128 TURN_OFF + 256 TURN_ON + 512 SWING_HORIZONTAL_MODE
 * and the thermostat reports 385 = 1 + 128 + 256. Every control is drawn only
 * when its bit is present, so a unit without a fan never shows a fan selector
 * that would do nothing.
 *
 * The setpoint bounds are NOT assumed: min_temp/max_temp/target_temp_step come
 * from the entity. One of these two units runs 8-30 °C in steps of 1 and the
 * other 1-7 in steps of 0.5 — hardcoding "16-28, half a degree" would make the
 * second one uncontrollable.
 * ======================================================================== */

const CLIMATE_F = { TARGET_TEMP: 1, TARGET_RANGE: 2, TARGET_HUM: 4, FAN: 8,
                    PRESET: 16, SWING: 32, TURN_OFF: 128, TURN_ON: 256,
                    SWING_H: 512 };

const HVAC_WORDS = { off: "Spento", heat: "Caldo", cool: "Freddo",
  heat_cool: "Automatico", auto: "Auto", dry: "Deumidifica", fan_only: "Ventola" };
const HVAC_ICONS = { off: "mdi:power", heat: "mdi:fire", cool: "mdi:snowflake",
  heat_cool: "mdi:sun-snowflake-variant", auto: "mdi:autorenew",
  dry: "mdi:water-percent", fan_only: "mdi:fan" };
const HVAC_COLORS = { off: "#8ea3b8", heat: "#ff924c", cool: "#4cc9f0",
  heat_cool: "#06d6a0", auto: "#06d6a0", dry: "#ffd166", fan_only: "#8ecae6" };

function hvacWords(mode) { return HVAC_WORDS[mode] || String(mode).replace(/_/g, " "); }

/** A switch that suspends the automations, spotted by name. */
const MANUAL_RE = /(automazion|automation|manual|bypass|vacanz|holiday)/i;

const ALARM_MODES = [
  { bit: 1,  state: "armed_home",          service: "alarm_arm_home",          l: "In casa",   icon: "mdi:shield-home",         hint: "Perimetro attivo, dentro ti muovi" },
  { bit: 2,  state: "armed_away",          service: "alarm_arm_away",          l: "Fuori casa", icon: "mdi:shield-lock",        hint: "Tutto attivo" },
  { bit: 4,  state: "armed_night",         service: "alarm_arm_night",         l: "Notte",     icon: "mdi:shield-moon",         hint: "Zone notturne" },
  { bit: 32, state: "armed_vacation",      service: "alarm_arm_vacation",      l: "Vacanza",   icon: "mdi:shield-airplane",     hint: "Assenza prolungata" },
  { bit: 16, state: "armed_custom_bypass", service: "alarm_arm_custom_bypass", l: "Parziale",  icon: "mdi:shield-half-full",    hint: "Con esclusioni" },
];
const ALARM_TRIGGER_BIT = 8;

/** disarmato / armato / in transizione / allarme. Drives colour and layout. */
function alarmPhase(state) {
  if (state === "triggered") return "fire";
  if (state === "arming" || state === "pending" || state === "disarming") return "moving";
  if (String(state).startsWith("armed")) return "armed";
  if (state === "disarmed") return "off";
  return "unknown";
}

const ALARM_PHASE_COLOR = { off: "#06d6a0", armed: "#4cc9f0", moving: "#ffd166",
                            fire: "#ff3d71", unknown: "#8ea3b8" };

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
/**
 * State wording that knows what kind of thing it is describing.
 *
 * A camera sitting there working reports the state `idle`, which `stateWords`
 * renders as "Inattivo" — the literal truth and completely misleading: the
 * camera is fine, it just is not streaming to anybody at this instant. On a
 * dashboard "inattivo" reads as "broken". Same for an alarm panel, whose real
 * information is the arming mode, not on/off.
 */
function entityWords(entityId, st) {
  const d = domainOf(entityId);
  const state = st ? st.state : "unavailable";
  if (state === "unavailable") return "Non raggiungibile";
  if (state === "unknown") return "Sconosciuto";
  if (d === "camera") {
    if (state === "recording") return "Sta registrando";
    if (state === "streaming") return "In diretta";
    if (state === "idle") return "In linea";
    return stateWords(state, st && st.attributes.device_class);
  }
  return stateWords(state, st && st.attributes && st.attributes.device_class);
}

function stateWords(state, deviceClass) {
  const pair = BINARY_WORDS[deviceClass];
  if (pair && (state === "on" || state === "off")) return state === "on" ? pair[0] : pair[1];
  const word = STATE_WORDS[state];
  if (word) return word;
  return String(state).replace(/_/g, " ");
}

/* ==========================================================================
 * AZIONI AL TOCCO
 *
 * Offering "Accendi" on every entity was wrong in two ways: a sensor cannot be
 * turned on at all, and a cover or a lock has no turn_on service — verified
 * against the running instance, cover exposes open_cover/close_cover/stop_cover
 * /toggle and lock exposes lock/unlock/open. Calling light-style services on
 * them failed silently, which is exactly why the options looked like they
 * "didn't work". The editor now offers only what the chosen entity can
 * actually do, and each option carries the real service name.
 * ======================================================================== */

const A_TOGGLE = { k: "toggle", l: "Accendi / Spegni", s: "toggle" };
const A_ON = { k: "turn_on", l: "Accendi", s: "turn_on" };
const A_OFF = { k: "turn_off", l: "Spegni", s: "turn_off" };

const DOMAIN_ACTIONS = {
  light: [A_TOGGLE, A_ON, A_OFF],
  switch: [A_TOGGLE, A_ON, A_OFF],
  fan: [A_TOGGLE, A_ON, A_OFF],
  input_boolean: [A_TOGGLE, A_ON, A_OFF],
  siren: [A_TOGGLE, A_ON, A_OFF],
  humidifier: [A_TOGGLE, A_ON, A_OFF],
  climate: [A_TOGGLE, A_ON, A_OFF],
  water_heater: [A_ON, A_OFF],
  media_player: [
    { k: "play_pause", l: "Play / Pausa", s: "media_play_pause" },
    A_TOGGLE, A_ON, A_OFF],
  cover: [
    { k: "open", l: "Apri", s: "open_cover" },
    { k: "close", l: "Chiudi", s: "close_cover" },
    { k: "stop", l: "Ferma", s: "stop_cover" },
    { k: "toggle", l: "Apri / Chiudi", s: "toggle" }],
  lock: [
    { k: "unlock", l: "Sblocca", s: "unlock" },
    { k: "lock", l: "Blocca", s: "lock" }],
  script: [{ k: "run", l: "Esegui lo script", s: "turn_on" }],
  scene: [{ k: "activate", l: "Attiva la scena", s: "turn_on" }],
  automation: [
    { k: "trigger", l: "Esegui adesso", s: "trigger" },
    A_TOGGLE, A_ON, A_OFF],
  button: [{ k: "press", l: "Premi", s: "press" }],
  input_button: [{ k: "press", l: "Premi", s: "press" }],
  vacuum: [
    { k: "start", l: "Avvia pulizia", s: "start" },
    { k: "return", l: "Torna alla base", s: "return_to_base" }],
  valve: [
    { k: "open", l: "Apri", s: "open_valve" },
    { k: "close", l: "Chiudi", s: "close_valve" }],
};

/** Actions a given entity really supports, always including more-info. */
function actionsFor(entityId) {
  const list = (DOMAIN_ACTIONS[domainOf(entityId)] || []).slice();
  return [{ k: "more-info", l: "Apri i dettagli", s: null }]
    .concat(list)
    .concat([{ k: "none", l: "Nessuna azione", s: null }]);
}

/**
 * Can this entity actually be switched?
 *
 * "Altro" is a catch-all bucket, and everything landing in it was given a
 * toggle row. A camera and an alarm panel both ended up there, and neither
 * does anything when tapped:
 *
 *  - `alarm_control_panel` has NO toggle service at all. `homeassistant.toggle`
 *    on one is a no-op that reports nothing. It needs its own card.
 *  - `camera.turn_on` exists as a service but only works on cameras that
 *    declare CameraEntityFeature.ON_OFF (bit 1). The one in this house reports
 *    supported_features 2 — stream only — so the call goes nowhere. Verified
 *    on the running instance.
 *  - sensors, binary sensors, trackers and weather have nothing to switch by
 *    definition.
 *
 * A control that cannot do what it advertises must not advertise it, so this
 * decides whether a row gets a switch at all or just opens the details.
 */
const NEVER_TOGGLE = new Set(["sensor", "binary_sensor", "device_tracker", "person",
  "weather", "sun", "zone", "update", "image", "select", "number", "text", "datetime",
  "input_datetime", "input_number", "input_select", "input_text", "event", "conversation",
  "stt", "tts", "todo", "calendar", "alarm_control_panel"]);
const CAMERA_ON_OFF = 1;

function canToggle(entityId, st) {
  const d = domainOf(entityId);
  if (NEVER_TOGGLE.has(d)) return false;
  if (d === "camera") {
    return ((Number(st && st.attributes && st.attributes.supported_features) || 0) & CAMERA_ON_OFF)
      === CAMERA_ON_OFF;
  }
  return true;
}

const ON_STATES = new Set(["on", "open", "unlocked", "home", "playing", "cleaning", "heat", "cool", "heat_cool", "dry", "fan_only", "auto"]);
const ALERT_STATES = new Set(["armed_away", "armed_home", "armed_night", "armed_vacation", "triggered", "unlocked", "open", "on"]);

function esc(v) {
  return String(v === undefined || v === null ? "" : v)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function domainOf(entityId) { return String(entityId || "").split(".")[0]; }

const WIND_ROSE = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                   "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
function windRose(deg) {
  const n = parseFloat(deg);
  if (!Number.isFinite(n)) return String(deg);
  return WIND_ROSE[Math.round(((n % 360) + 360) % 360 / 22.5) % 16] + " · " + Math.round(n) + "°";
}
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

/**
 * The next-hours temperature curve, WITH a vertical scale.
 *
 * The sparkline it replaces had no axis at all: a line that rises tells you
 * something is going up, and nothing else. On a weather panel the question is
 * "how warm will it be at four", and a curve without numbers cannot answer it.
 *
 * `preserveAspectRatio` is left at its default here, unlike the sparkline: the
 * old chart stretched to fit and the slope it showed was a function of the box,
 * not of the weather.
 */
/** "14:30" from an ISO timestamp, or an em dash when it is not one. */
/**
 * A real number, or null.
 *
 * `Number(null)` is 0 and `Number("")` is 0, and both are finite — so the
 * obvious `Number.isFinite(Number(v))` treats "no value" as a confident zero.
 * That has now produced three separate visible bugs in this project: a trend
 * axis collapsed to zero, a "0 °C impostata" on a unit that reports no
 * setpoint, and an "ora null°". One helper, used everywhere a state or an
 * attribute becomes a number, so there is no fourth.
 */
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function hhmm2(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "\u2014"
    : String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function hourlyChart(points, labels, unit, meta) {
  if (!points || points.length < 2) return "";
  const W = 520, H = 132, PAD_L = 34, PAD_R = 8, PAD_T = 10, PAD_B = 18;
  let min = Math.min(...points), max = Math.max(...points);
  if (max - min < 2) { const mid = (max + min) / 2; min = mid - 1; max = mid + 1; }
  const pad = (max - min) * 0.15;
  min -= pad; max += pad;
  const x = (i) => PAD_L + (i / (points.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);

  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = min + ((max - min) * i) / ticks;
    const yy = y(v);
    return `<line class="wxc-grid" x1="${PAD_L}" y1="${yy.toFixed(1)}" x2="${W - PAD_R}" y2="${yy.toFixed(1)}"/>
      <text class="wxc-lab" x="${PAD_L - 5}" y="${(yy + 3).toFixed(1)}">${Math.round(v)}°</text>`;
  }).join("");

  const line = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`;

  // Only a few hour labels: one under every point turns the axis into a smear.
  const every = Math.max(1, Math.round(points.length / 5));
  const xlabs = (labels || []).map((l, i) => (i % every === 0 || i === points.length - 1)
    ? `<text class="wxc-lab x" x="${x(i).toFixed(1)}" y="${H - 4}" text-anchor="${i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}">${esc(l)}</text>`
    : "").join("");

  const hi = points.indexOf(Math.max(...points));
  const lo = points.indexOf(Math.min(...points));
  const mark = (i, cls) => `<circle class="wxc-dot ${cls}" cx="${x(i).toFixed(1)}" cy="${y(points[i]).toFixed(1)}" r="3"/>
    <text class="wxc-mark ${cls}" x="${x(i).toFixed(1)}" y="${(y(points[i]) - 7).toFixed(1)}" text-anchor="middle">${Math.round(points[i])}°</text>`;

  // Geometry travels with the markup so the pointer handler does not have to
  // recompute it — and cannot drift out of step with what was drawn.
  const geom = { W, H, PAD_L, PAD_R, PAD_T, PAD_B, min, max, n: points.length,
    points, labels: labels || [], unit, meta: meta || [] };
  return `<div class="wxc-plot">
    <svg class="wxc" viewBox="0 0 ${W} ${H}" data-wx-chart='${esc(JSON.stringify(geom))}'>
      ${grid}
      <path class="wxc-area" d="${area}"/>
      <path class="wxc-line" d="${line}"/>
      ${mark(hi, "hi")}${hi === lo ? "" : mark(lo, "lo")}
      ${xlabs}
      <text class="wxc-unit" x="${PAD_L - 5}" y="${PAD_T - 2}" text-anchor="end">${esc(unit)}</text>
      <g class="wxc-hover">
        <line class="wxc-cursor" x1="0" y1="${PAD_T}" x2="0" y2="${H - PAD_B}"/>
        <circle class="wxc-pt" r="4"/>
      </g>
    </svg>
    <div class="wxc-read" hidden></div>
  </div>`;
}

/* ==========================================================================
 * MATERIALI E LUCE
 *
 * Why this and not a photorealistic render.
 *
 * A rendered image is dead. It cannot show a light that is ON, it cannot dim
 * with the dimmer, it cannot go dark at night. Everything the house is
 * actually DOING has to go back on top of it as a badge — which is precisely
 * the clutter this dashboard is trying to get away from.
 *
 * A generated scene can do the one thing the render cannot: be lit by the real
 * lights. So the effort goes where photorealism has no answer — light, state,
 * motion — instead of chasing a fidelity that would also cost a hand-built 3D
 * model per installation.
 * ======================================================================== */

/** Floor materials, as pure CSS. No image files, nothing to host, nothing to lose. */
const ROOM_MATERIALS = {
  parquet: { l: "Parquet", base: "#7a4a24", plank: true },
  piastrelle: { l: "Piastrelle", base: "#8e9aa6", tile: 46 },
  cemento: { l: "Cemento", base: "#7d8489" },
  tappeto: { l: "Tappeto", base: "#6b5f70", soft: true },
  pietra: { l: "Pietra", base: "#6f6a63", tile: 74 },
  prato: { l: "Prato", base: "#4b7a41", soft: true },
  acqua: { l: "Acqua", base: "#2f6f96" },
  neutro: { l: "Neutro", base: null },
};

/** A sensible material from the room's name, overridable in the editor. */
function guessMaterial(name) {
  const n = String(name || "").toLowerCase();
  if (/(bagno|doccia|lavanderia|wc|servizi)/.test(n)) return "piastrelle";
  if (/(cucina|cottura)/.test(n)) return "piastrelle";
  if (/(camera|letto|soppalco|studio|ufficio)/.test(n)) return "parquet";
  if (/(soggiorno|salotto|sala|living|corridoio|ingresso|disimpegno)/.test(n)) return "parquet";
  if (/(giardino|prato|orto)/.test(n)) return "prato";
  if (/(piscina|vasca)/.test(n)) return "acqua";
  if (/(garage|cantina|box|terrazz|balcone|taverna|soffitta)/.test(n)) return "cemento";
  return "neutro";
}

/** The CSS background for a material, layered under the room's own tint. */
function materialLayers(key) {
  const m = ROOM_MATERIALS[key] || ROOM_MATERIALS.neutro;
  if (!m.base) return "";
  if (m.plank) {
    // Planks: a repeating gradient at an angle, with a second, wider one for
    // the joins so the pattern does not read as a single stripe frequency.
    return `repeating-linear-gradient(94deg,
        color-mix(in srgb,${m.base} 88%,#000) 0 3px,
        color-mix(in srgb,${m.base} 100%,#000) 3px 5px,
        color-mix(in srgb,${m.base} 78%,#000) 5px 22px),
      repeating-linear-gradient(4deg, rgba(0,0,0,.16) 0 1px, transparent 1px 64px)`;
  }
  if (m.tile) {
    const t = m.tile / 2;
    return `repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px ${t}px),
      repeating-linear-gradient(90deg, rgba(0,0,0,.22) 0 1px, transparent 1px ${t}px),
      linear-gradient(150deg, color-mix(in srgb,${m.base} 100%,#000), color-mix(in srgb,${m.base} 72%,#000))`;
  }
  if (m.soft) {
    return `radial-gradient(circle at 30% 25%, color-mix(in srgb,${m.base} 100%,#000) 0%, color-mix(in srgb,${m.base} 74%,#000) 70%)`;
  }
  return `linear-gradient(150deg, color-mix(in srgb,${m.base} 96%,#000), color-mix(in srgb,${m.base} 70%,#000))`;
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
    this._flowOpen = {};        // per-card: is the load sub-tree expanded?
    this._wizard = null;        // {cardId, step} guided energy setup
    this._mapWizard = null;     // {step, rooms[]} guided 3D map setup
    this._focus = null;         // {roomId, zoom, dx, dy, dz} room close-up (not persisted)
    this._roomPicker = false;   // room editor: entity picker open
    this._lightOpen = {};       // which light has its colour panel expanded
    this._schedule = null;      // {jobs[], timers[]} from the integration
    this._schedulePending = false;
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

  /** Nearest scrollable ancestor: inside HA the panel itself is not what scrolls. */
  _scrollParent() {
    if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return null;
    let node = this.parentElement;
    while (node) {
      const oy = getComputedStyle(node).overflowY;
      if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
    }
    return document.scrollingElement || document.documentElement;
  }

  disconnectedCallback() {
    this._unsubscribeAll();
    if (this._camTimer) { clearInterval(this._camTimer); this._camTimer = null; }
  }

  // ---------------------------------------------------------------- data ---

  _page() {
    if (!this._dashboard) return null;
    const pages = this._dashboard.pages;
    if (this._pageIndex >= pages.length) this._pageIndex = 0;
    return pages[this._pageIndex];
  }
  /** Version the integration says it is, from the panel config. */
  _serverVersion() {
    const cfg = (this.panel && this.panel.config) || this._cardConfig || {};
    return String(cfg.version || "");
  }

  /**
   * True when the browser is running a different build from the one the
   * integration just installed — the stale-cached-copy case. Reported in the
   * header instead of leaving "le modifiche non si vedono" as a mystery.
   */
  _staleBuild() {
    const server = this._serverVersion();
    return !!server && !!CYBORG_BUILD && server !== CYBORG_BUILD;
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

  /** Find a card by id anywhere on the current page. */
  _cardById(id) {
    if (!id) return null;
    for (const sec of this._sections()) {
      const found = (sec.items || []).find((it) => it.id === id);
      if (found) return found;
    }
    return null;
  }

  _buildSignature() {
    if (!this._hass || !this._dashboard) return "";
    const parts = [this._editing ? "e" : "v", String(this._pageIndex),
      JSON.stringify(this._selected || null)];
    parts.push(JSON.stringify(this._flowOpen || {}));
    if (this._isFloorplan()) {
      parts.push(this._registry ? "reg" : "noreg");
      parts.push(JSON.stringify(this._focus || null));
      parts.push(this._roomPicker ? "pick" : "-");
      const view = this._page().view || {};
      parts.push("lv" + String(view.active_level) + ":" + String(view.level_gap));
      const focusId = this._focus && this._focus.roomId;
      for (const room of this._rooms()) {
        // Geometry belongs in the signature: resizing a room or moving it to
        // another storey changes nothing about entity state, and without this
        // the map would only repaint on the next unrelated state update.
        parts.push(`${room.id}@${room.x},${room.y},${room.w},${room.h},${room.level || 0},${(room.points || []).length},${(room.walls || []).join("")}`);
        for (const v of this._vehiclesFor(room.vehicles)) {
          if (!Array.isArray(room.vehicles) || !room.vehicles.length) break;
          for (const key of ["battery", "charging", "power"]) {
            const vs = v[key] && this._hass.states[v[key]];
            if (vs) parts.push(v[key] + "=" + vs.state);
          }
        }
        const ids = room.id === focusId ? this._roomAllEntities(room) : this._roomEntities(room);
        for (const id of ids) {
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
        // Composite cards read entities that are not their own entity_id, so
        // without this they would never repaint: "attivi ora" would keep
        // showing a light that was switched off ten minutes ago.
        if (it.type === "active") {
          const rows = this._activeEntities(it);
          parts.push("act:" + rows.length + ":" + rows.map((r) => r.id + "@" + r.st.state).join(","));
        }
        if (it.type === "notifications") {
          parts.push("nt:" + Object.keys(this._notifs || {}).length
            + ":" + ((this._sentNotifs || [])[0] || {}).id
            + ":" + (this._sentNotifs || []).length
            // read state and the view filter belong in the signature: without
            // them a change arriving from another screen would not repaint.
            + ":" + (this._sentNotifs || []).filter((n) => !n.read).length
            + ":" + (this._notifFilter || "")
            + ":" + Object.keys(this._hass.states).filter((id) =>
                id.startsWith("update.") && this._hass.states[id].state === "on").length);
        }
        if (it.type === "thermostat") {
          // Composite: the card's own entity_id is empty, so without this the
          // setpoint and mode would never repaint when they change.
          for (const id of this._thermoUnits(it)) {
            const u = this._hass.states[id];
            parts.push("th:" + id + "@" + u.state + ":" + u.attributes.temperature
              + ":" + u.attributes.current_temperature + ":" + u.attributes.fan_mode
              + ":" + u.attributes.preset_mode + ":" + u.attributes.swing_mode);
          }
          for (const id of this._thermoManual(it)) {
            parts.push("tm:" + id + "@" + this._hass.states[id].state);
          }
        }
        if (it.type === "comfort") {
          parts.push("cf:" + (it.filter || ""));
          for (const r of this._comfortRooms(it)) {
            for (const id of [r.temperature, r.humidity]) {
              const cs = id && this._hass.states[id];
              if (cs) parts.push(id + "=" + cs.state);
            }
          }
        }
        if (it.type === "ev") {
          for (const v of this._vehiclesFor(it.vehicles)) {
            for (const key of ["battery", "charging", "power", "range", "target", "plugged", "switch", "current"]) {
              const vs = v[key] && this._hass.states[v[key]];
              if (vs) parts.push(v[key] + "=" + vs.state);
            }
          }
        }
        if (it.type === "room") {
          for (const id of this._roomCardEntities(it)) {
            const rs = this._hass.states[id];
            parts.push(id + "=" + (rs ? rs.state + ":" + (rs.attributes.brightness || "")
              + ":" + (rs.attributes.current_position ?? "") : "?"));
          }
          parts.push("rl:" + JSON.stringify(this._lightOpen || {}));
        }
        if (it.type === "trend") {
          parts.push("tr:" + (it.hours || 24) + ":" + this._trendSeries(it).map((r) => {
            const ts = this._hass.states[r.entity];
            return r.entity + "=" + (ts ? ts.state : "?") + ":" + (r.color || "");
          }).join(","));
        }
        if (it.type === "lights") {
          parts.push("li:" + JSON.stringify(this._lightOpen || {}));
          for (const id of this._lightEntities(it)) {
            const ls = this._hass.states[id];
            // brightness and colour are part of what the row draws, so a
            // dimmer moved from the wall switch must repaint the slider
            parts.push(id + "=" + (ls ? ls.state + ":" + (ls.attributes.brightness || "")
              + ":" + (ls.attributes.color_temp_kelvin || "")
              + ":" + (ls.attributes.rgb_color || []).join(",")
              + ":" + (ls.attributes.effect || "") : "?"));
          }
          parts.push("sch:" + ((this._schedule && this._schedule.jobs) || []).length);
        }
        if (it.type === "irrigation") {
          for (const z of this._irrigationZones(it)) {
            const zs = this._hass.states[z.entity];
            parts.push(z.entity + "=" + (zs ? zs.state : "?"));
            const ms = z.moisture && this._hass.states[z.moisture];
            if (ms) parts.push(z.moisture + "=" + ms.state);
          }
          parts.push("tm:" + ((this._schedule && this._schedule.timers) || [])
            .map((t) => t.entity_id + "@" + t.ends_at).join(","));
          parts.push("sch:" + ((this._schedule && this._schedule.jobs) || []).length);
        }
        if (it.type === "energyflow" && it.flow) {
          for (const key of ["grid", "solar", "battery", "home"]) {
            const fs = it.flow[key] && this._hass.states[it.flow[key]];
            if (fs) parts.push(it.flow[key] + "=" + fs.state);
          }
          if (it.flow.show_vehicles !== false) {
            for (const v of this._vehicles()) {
              const ps = v.power && this._hass.states[v.power];
              if (ps) parts.push(v.power + "=" + ps.state);
              const bs = v.battery && this._hass.states[v.battery];
              if (bs) parts.push(v.battery + "=" + bs.state);
            }
          }
          for (const d of (it.flow.devices || [])) {
            const ds = this._hass.states[d.entity];
            if (ds) parts.push(d.entity + "=" + ds.state);
          }
        }
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
      this._dirty = false;
      this.render();
      setTimeout(() => { this._saved = false; this.render(); }, 2200);
    } catch (err) {
      this._error = (err && err.message) || "Salvataggio non riuscito";
      this.render();
    }
  }

  /**
   * Mark the configuration as changed and repaint.
   *
   * Without a visible dirty flag, deleting a card and reloading brought it
   * back, which reads as "it won't let me delete" rather than "you didn't
   * save". Every mutation goes through here, so the flag cannot be forgotten.
   */
  _touch(clean) {
    if (!clean) this._dirty = true;
    this._signature = "";
    this.render();
  }

  // ------------------------------------------------------------- mutation --

  /**
   * Page management.
   *
   * There was no way to add, remove or reorder a page at all: pages only ever
   * came from `default_dashboard()`, which applies to a fresh install and
   * nothing else. Any dashboard saved before a page type existed could never
   * reach it — that is why an existing install had no 3D map.
   */
  /**
   * Move a section to another page, or give it a page of its own.
   *
   * A dashboard grows by subject — energia, sicurezza, stanze — and at some
   * point a subject deserves the top level rather than a scroll position. The
   * alternative is a single page that grows without end, which is exactly what
   * a "sections" model is supposed to prevent.
   *
   * The page the section came from is removed when it is left empty, because
   * an empty tab is a dead end the user then has to clean up by hand.
   */
  _moveSectionToPage(sectionId, target) {
    const from = this._page();
    const idx = (from.sections || []).findIndex((x) => x.id === sectionId);
    if (idx < 0) return;
    const [section] = from.sections.splice(idx, 1);

    let destIndex;
    if (target === "__own") {
      const page = {
        id: uid("page"), type: "sections",
        title: section.title || "Sezione",
        icon: section.icon || "mdi:view-dashboard-outline",
        layout: { type: "grid", columns: 12, gap: 16 },
        sections: [section],
      };
      // Inserted right after the page it came from, so the new tab appears
      // next to its origin instead of at the far end of the bar.
      destIndex = this._pageIndex + 1;
      this._dashboard.pages.splice(destIndex, 0, page);
    } else {
      destIndex = parseInt(target, 10);
      const dest = this._dashboard.pages[destIndex];
      if (!dest || dest.type === "floorplan") { from.sections.splice(idx, 0, section); return; }
      dest.sections = dest.sections || [];
      dest.sections.push(section);
    }

    // Drop the page we emptied — but never the last remaining page, and never
    // the 3D map, which holds rooms rather than sections.
    const fromIndex = this._dashboard.pages.indexOf(from);
    if (!from.sections.length && from.type === "sections" && this._dashboard.pages.length > 1) {
      this._dashboard.pages.splice(fromIndex, 1);
      if (destIndex > fromIndex) destIndex -= 1;
    }
    this._pageIndex = Math.max(0, Math.min(this._dashboard.pages.length - 1, destIndex));
    this._selected = { kind: "section", sectionId: section.id };
    this._fitKey = null;
    this._touch();
  }

  /**
   * The Temperature section in one click: the room-by-room comfort card and,
   * under it, every room temperature on one chart.
   *
   * The chart is filled from the same discovery the comfort card uses, so the
   * two always describe the same rooms — building the list twice is how they
   * end up disagreeing.
   */
  async _addComfortSection() {
    if (!this._registry) await this._loadRegistry();
    const existing = this._sections().find((sec) =>
      (sec.items || []).some((it) => it.type === "comfort"));
    if (existing) {
      this._selected = { kind: "section", sectionId: existing.id };
      this._error = "La sezione Temperature esiste già";
      this._touch(true);
      return;
    }
    const rooms = this._comfortRooms({});
    const section = { id: uid("sec"), title: "Temperature", icon: "mdi:home-thermometer",
      accent: "#4cc9f0", collapsed: false, items: [
        { id: uid("card"), type: "comfort", entity_id: "", name: "", size: "xl",
          appearance: { icon: "mdi:home-thermometer" }, states: {}, actions: {},
          rooms: [], bands: {}, filter: "" },
        // source: "comfort" and not a frozen list of entities. The chart must
        // follow the rooms: four today, ten when the next sensors arrive, with
        // nobody going back into the editor to add the lines by hand.
        { id: uid("card"), type: "trend", entity_id: "", name: "Andamento", size: "xl",
          appearance: { icon: "mdi:chart-multiple" }, states: {}, actions: {},
          source: "comfort", device_class: "temperature", max_series: 8,
          series: [], hours: 24, y_min: null, y_max: null },
      ] };
    this._page().sections.push(section);
    this._selected = { kind: "section", sectionId: section.id };
    this._error = rooms.length ? "" : "Nessun sensore di temperatura trovato";
    this._touch();
  }

  /**
   * The climate control section.
   *
   * Deliberately a SECTION and not a fixed place in Panoramica. Analysis and
   * action belong together — reading "balcone 28.9°" and then having to
   * navigate somewhere else to switch the air conditioner on is the split that
   * makes a dashboard annoying — so it is created right where the Temperature
   * cards are. And because sections can be dragged anywhere (and moved to a
   * page of their own), putting it here costs nothing if the user later wants
   * it in Panoramica: it is one drag, not a rebuild.
   */
  _addThermostatSection() {
    const existing = this._sections().find((sec) =>
      (sec.items || []).some((it) => it.type === "thermostat"));
    if (existing) {
      this._selected = { kind: "section", sectionId: existing.id };
      this._error = "La sezione Clima esiste già";
      this._touch(true);
      return;
    }
    const section = { id: uid("sec"), title: "Controllo temperatura",
      icon: "mdi:thermostat-box", accent: "#ff924c", collapsed: false,
      items: [{ id: uid("card"), type: "thermostat", entity_id: "", name: "", size: "xl",
        appearance: { icon: "mdi:thermostat-box" }, states: {}, actions: {},
        units: [], manual: [], show_manual: true, show_extras: true }] };
    this._page().sections.push(section);
    this._selected = { kind: "section", sectionId: section.id };
    this._error = "";
    this._touch();
  }

  /** The Illuminazione section, in one click, already pointed at every light. */
  _addLightSection() {
    if (!this._registry) this._loadRegistry();
    const existing = this._sections().find((sec) =>
      (sec.items || []).some((it) => it.type === "lights"));
    if (existing) {
      // Already there: select it rather than making a second one. Two identical
      // sections is not a feature, it is a mess the user has to undo.
      this._selected = { kind: "section", sectionId: existing.id };
      this._error = "La sezione Illuminazione esiste già";
      this._touch(true);
      return;
    }
    const section = { id: uid("sec"), title: "Illuminazione", icon: "mdi:lightbulb-group",
      accent: "#ffd166", collapsed: false,
      items: [{ id: uid("card"), type: "lights", entity_id: "", name: "", size: "xl",
        appearance: { icon: "mdi:lightbulb-group" }, states: {}, actions: {},
        // more-info: on a lighting card the row is a NAME, and tapping a name
        // to read it should not switch the room off. The bulb icon next to it
        // is the switch, and it is already the thing the hand goes to.
        lights: [], group_by_area: true, row_action: "more-info" }] };
    this._page().sections.push(section);
    this._selected = { kind: "section", sectionId: section.id };
    this._touch();
  }

  _addPage(kind) {
    const pages = this._dashboard.pages;
    const base = { id: uid("page"), title: "Nuova pagina", icon: "mdi:view-dashboard-outline",
      layout: { type: "grid", columns: 12, gap: 16 } };
    let page;
    if (kind === "floorplan") {
      page = Object.assign(base, { type: "floorplan", title: "Mappa 3D", icon: "mdi:floor-plan",
        view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true, show_labels: true },
        rooms: [] });
    } else if (kind === "overview") {
      page = Object.assign(base, { type: "sections", title: "Panoramica",
        icon: "mdi:view-dashboard-variant", sections: [] });
    } else {
      page = Object.assign(base, { type: "sections", sections: [] });
    }
    pages.push(page);
    this._pageIndex = pages.length - 1;
    this._selected = null;
    this._dirty = true;
    this._touch();
    if (kind === "overview") this._composeOverview();
  }

  _removePage(index) {
    const pages = this._dashboard.pages;
    if (pages.length <= 1) { this._error = "Deve restare almeno una pagina"; this._touch(); return; }
    pages.splice(index, 1);
    if (this._pageIndex >= pages.length) this._pageIndex = pages.length - 1;
    this._selected = null;
    this._dirty = true;
    this._touch();
  }

  _movePage(index, delta) {
    const pages = this._dashboard.pages;
    const j = index + delta;
    if (j < 0 || j >= pages.length) return;
    [pages[index], pages[j]] = [pages[j], pages[index]];
    if (this._pageIndex === index) this._pageIndex = j;
    else if (this._pageIndex === j) this._pageIndex = index;
    this._dirty = true;
    this._touch();
  }

  /**
   * Move a page to an arbitrary position.
   *
   * `_movePage` swaps with the neighbour, which is the right primitive for a
   * button but the wrong one for a drop: dropping "Energia" onto the first
   * slot must slide everything else right, not swap Energia with whatever
   * happened to be there. Splice-out-then-splice-in is the only version that
   * matches what the user saw while dragging.
   *
   * The current page is tracked by IDENTITY, not by index. Reordering changes
   * every index after the moved one, so remembering the number would leave the
   * user staring at a different page than the one they were on — the classic
   * off-by-one that makes a reorder feel broken even when the data is right.
   */
  _reorderPage(from, to) {
    const pages = this._dashboard.pages;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    if (from < 0 || from >= pages.length || from === to) return;
    const current = pages[this._pageIndex];
    const [moved] = pages.splice(from, 1);
    pages.splice(Math.max(0, Math.min(pages.length, to)), 0, moved);
    const at = pages.indexOf(current);
    this._pageIndex = at < 0 ? pages.indexOf(moved) : at;
    this._dirty = true;
    this._touch();
  }

  _pageManager() {
    const pages = this._dashboard.pages;
    const hasMap = pages.some((p) => p.type === "floorplan");
    return `<div class="section">
      <strong>PAGINE</strong>
      <span class="hint">${pages.length} pagine · l'ordine qui è l'ordine delle schede in alto, e la prima è quella che si apre all'avvio. Puoi anche trascinare le schede direttamente nella barra.</span>
      <div class="page-list">${pages.map((pg, i) => `
        <div class="page-row ${i === this._pageIndex ? "current" : ""}">
          <ha-icon icon="${esc(pg.icon || "mdi:view-dashboard-outline")}"></ha-icon>
          <div><strong>${esc(pg.title || "Pagina " + (i + 1))}</strong>
            <small>${esc(pg.type === "floorplan" ? "mappa 3D" : (pg.sections || []).length + " sezioni")}</small></div>
          <button class="mini" data-page-move="${i}:-1" ${i === 0 ? "disabled" : ""} title="Sposta su"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button class="mini" data-page-move="${i}:1" ${i === pages.length - 1 ? "disabled" : ""} title="Sposta giù"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
          <button class="mini danger" data-page-remove="${i}" ${pages.length <= 1 ? "disabled" : ""} title="Elimina pagina"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
        </div>`).join("")}</div>
      <div class="preset-grid">
        <button type="button" class="preset" data-add-page="sections"><ha-icon icon="mdi:view-dashboard-outline"></ha-icon><span>Pagina vuota</span></button>
        <button type="button" class="preset" data-add-page="overview" style="--accent:#06d6a0"><ha-icon icon="mdi:view-dashboard-variant"></ha-icon><span>Panoramica</span></button>
        ${hasMap ? "" : `<button type="button" class="preset" data-add-page="floorplan" style="--accent:#c77dff"><ha-icon icon="mdi:floor-plan"></ha-icon><span>Mappa 3D</span></button>`}
      </div>
    </div>`;
  }

  _addSection(preset) {
    const base = preset || { title: "Nuova sezione", icon: "mdi:shape-outline", accent: null };
    const section = { id: uid("sec"), title: base.title, icon: base.icon,
      accent: base.accent || null, collapsed: false, items: [] };
    if (base.seed) {
      const card = { id: uid("card"), type: base.seed, entity_id: "", name: "",
        size: (COMPOSITE_META[base.seed] || [])[3] || "lg",
        appearance: { icon: (COMPOSITE_META[base.seed] || [])[2] || "mdi:shape-outline" },
        states: {}, actions: {} };
      if (base.seed === "monitor") Object.assign(card, { grid_entity: null, limit_w: 3300, groups: [], max_per_group: 8 });
      if (base.seed === "economy") Object.assign(card, { grid_import: null, grid_export: null, solar: null,
        price_import: 0.25, price_export: 0.10, period: "month" });
      section.items.push(card);
      if (base.seed === "monitor") { /* wired by the user in the card editor */ }
      if (base.seed === "economy") this._detectEconomy(card);
    }
    this._page().sections.push(section);
    this._selected = { kind: "section", sectionId: section.id };
    this._touch();
  }

  /**
   * One card per Home Assistant area, in a single Stanze section.
   *
   * Building this by hand is twelve trips through the card editor for a normal
   * flat, and every one of them is the same three choices. The areas are
   * already maintained in Home Assistant; this just projects them.
   */
  /**
   * One section per room, not one section holding every room.
   *
   * The old shape was a single "Stanze" accordion: opening it dumped the whole
   * house on screen at once, and collapsing it hid the house entirely. There
   * was no way to say "show me the bathroom and nothing else", which is the
   * only thing anybody actually wants from a room list.
   *
   * One section per area gives each room its own header, its own collapse, its
   * own colour, its own position in the order, and its own entry in the
   * "sposta in una pagina" menu — so a room can even become a page of its own.
   *
   * Idempotent by area: run it again after adding a room in Home Assistant and
   * only the new rooms are appended. That is the "future rooms" case, and it
   * has to work without the user rebuilding what he already arranged.
   */
  /**
   * Split a section that holds several room cards into one section per room.
   *
   * Mirrors the v9 migration in core/schema.py so the button fixes the layout
   * immediately, without waiting for a reload. Returns how many sections were
   * created, so the caller can tell "I converted your old layout" apart from
   * "there was nothing to do".
   */
  _splitRoomSections() {
    const page = this._page();
    if (!Array.isArray(page.sections)) return 0;
    const rebuilt = [];
    let made = 0;
    for (const section of page.sections) {
      const cards = section.items || [];
      const rooms = cards.filter((c) => c && c.type === "room");
      // Entirely rooms, and more than one: that is an accordion. A section
      // mixing a room with other cards is a layout somebody built on purpose.
      if (rooms.length < 2 || rooms.length !== cards.length) { rebuilt.push(section); continue; }
      rooms.forEach((card, i) => {
        const app = card.appearance || {};
        rebuilt.push({ id: uid("sec"),
          title: String(card.name || "").trim() || ("Stanza " + (i + 1)),
          icon: app.icon || section.icon || "mdi:home-outline",
          accent: section.accent || null,
          collapsed: i > 0,
          items: [card] });
        made += 1;
      });
    }
    if (made) page.sections = rebuilt;
    return made;
  }

  async _addRoomSection() {
    // An installation built by the previous version keeps every room inside one
    // accordion. Converting it is the FIRST thing to try: without this the
    // idempotence check below sees every area as already present and refuses to
    // do anything at all, so the button looked broken to exactly the people who
    // most needed it.
    const split = this._splitRoomSections();
    if (split) {
      this._error = "";
      this._selected = null;
      this._touch();
      return;
    }

    // The registry is not loaded on a sections page, and making the user click
    // twice for no visible reason is the kind of thing that reads as broken.
    if (!this._registry) await this._loadRegistry();
    const areas = (this._registry && this._registry.areas) || [];
    if (!areas.length) {
      this._error = "Nessuna area configurata in Home Assistant (Impostazioni → Aree)";
      this._touch(true);
      return;
    }

    // Which areas already have a room section ANYWHERE in the dashboard, not
    // just on this page: a bathroom that was moved to its own page must not
    // come back as a duplicate here.
    const taken = new Set();
    for (const page of this._dashboard.pages) {
      for (const sec of page.sections || []) {
        for (const it of sec.items || []) {
          if (it.type === "room" && it.area) taken.add(it.area);
        }
      }
    }

    const fresh = areas.filter((a) => !taken.has(a.area_id));
    if (!fresh.length) {
      this._error = "Ogni stanza ha già la sua sezione";
      this._touch(true);
      return;
    }

    let first = null;
    for (const a of fresh) {
      const name = a.name || a.area_id;
      const section = { id: uid("sec"), title: name,
        icon: a.icon || roomIconFor(name), accent: "#06d6a0",
        // Collapsed from the second room on: opening the page on a wall of
        // eight expanded rooms is the problem this change exists to solve.
        collapsed: first !== null,
        items: [{
          id: uid("card"), type: "room", entity_id: "",
          name, size: "xl",
          appearance: { icon: a.icon || roomIconFor(name) },
          states: {}, actions: {},
          area: a.area_id, hidden: [], max_readings: 4, show_others: true,
          row_action: "toggle",
        }] };
      this._page().sections.push(section);
      if (first === null) first = section.id;
    }
    this._selected = { kind: "section", sectionId: first };
    this._error = "";
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

  /** Drop a section at an arbitrary position. Same splice reasoning as
   *  `_reorderPage`: a drop is an insertion, not a swap. */
  _reorderSection(from, to) {
    const list = this._page().sections;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    if (from < 0 || from >= list.length || from === to) return;
    const [moved] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, moved);
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

    // A wall of one-camera status tiles is useless; a single camera card with
    // thumbnails is what a security section actually wants.
    const sicurezza = built.find((sec) => sec.title === "Sicurezza");
    if (sicurezza) {
      const cams = sicurezza.items.filter((i) => domainOf(i.entity_id) === "camera").map((i) => i.entity_id);
      if (cams.length) {
        sicurezza.items = sicurezza.items.filter((i) => domainOf(i.entity_id) !== "camera");
        sicurezza.items.unshift({
          id: uid("card"), type: "camera", entity_id: "", name: "", size: "lg",
          appearance: { icon: "mdi:cctv" }, states: {}, actions: {},
          cameras: cams, refresh: 10,
        });
      }
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
      // entity_category marks the plumbing: firmware version, signal strength,
      // "restart" buttons. Home Assistant hides those from its own auto
      // dashboards, and showing them is what turns one room into a wall of
      // meaningless symbols.
      const deviceName = {};
      for (const d of devices || []) deviceName[d.id] = d.name_by_user || d.name || "";
      const entityDevice = {};
      const category = {};
      for (const e of entities || []) {
        if (e.disabled_by || e.hidden_by) continue;
        if (e.device_id) entityDevice[e.entity_id] = e.device_id;
        if (e.entity_category) category[e.entity_id] = e.entity_category;
        const area = e.area_id || (e.device_id ? deviceArea[e.device_id] : null);
        if (!area) continue;
        (byArea[area] = byArea[area] || []).push(e.entity_id);
      }
      // Reverse index built once here rather than scanned per row: the
      // "attivi ora" card asks for the area of every running entity on every
      // repaint, and rescanning byArea for each of them is quadratic.
      const areaName = {};
      for (const a of areas || []) areaName[a.area_id] = a.name || a.area_id;
      const entityArea = {};
      for (const [aid, ids] of Object.entries(byArea)) {
        for (const id of ids) entityArea[id] = areaName[aid] || aid;
      }
      this._registry = { areas: areas || [], byArea, entityArea, category,
        entityDevice, deviceName };
    } catch (err) {
      this._registry = { areas: [], byArea: {}, entityArea: {}, category: {},
        entityDevice: {}, deviceName: {}, error: true };
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
      level: 0, points: null, spots: {},
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
      x: maxX + 18, y: 0, w: 200, h: 160,
      level: this._page().view && this._page().view.active_level != null ? this._page().view.active_level : 0,
      points: null, spots: {}, entities: null };
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

  /**
   * Entities to draw inside a room when it is focused.
   *
   * Uncapped, but not unfiltered. Handing over every entity of an area put
   * forty symbols inside one living room — firmware versions, signal strengths,
   * restart buttons — and made the close-up useless. Two filters apply:
   * diagnostic and configuration entities are dropped (Home Assistant marks
   * them itself), and anything the user has explicitly hidden for this room is
   * dropped too. An explicit entity list is never filtered: if you chose it by
   * hand, you meant it.
   */
  /**
   * How lit a room actually is, right now.
   *
   * This is the thing a rendered image can never do. The floor and the walls
   * take the colour and the intensity of the lights that are really on: a
   * dimmer at 30% lights the room at 30%, a warm bulb makes it warm, and a
   * room with everything off goes dark. The house on screen stops being a
   * diagram of the house and starts being a picture of it.
   */
  _roomLight(room) {
    const ids = this._roomAllEntities(room)
      .filter((id) => ["light", "switch"].includes(domainOf(id)));
    let on = 0, total = 0, sum = 0, kelvin = 0, kn = 0;
    for (const id of ids) {
      const st = this._hass.states[id];
      if (!st) continue;
      // Only light entities count towards how BRIGHT it is; a switch that
      // happens to be in the room may be a boiler, and a boiler does not lay
      // light on the floor.
      const isLight = domainOf(id) === "light";
      if (!isLight) continue;
      total += 1;
      if (!ON_STATES.has(st.state)) continue;
      on += 1;
      const b = num(st.attributes.brightness);
      sum += b === null ? 1 : Math.max(0.12, b / 255);
      const k = num(st.attributes.color_temp_kelvin);
      if (k !== null) { kelvin += k; kn += 1; }
    }
    if (!total || !on) return { lit: 0, color: null, on: 0, total };
    // Average of what is on, then scaled by how many of the room's lights are
    // on: one lamp of four lit does not light the room like all four.
    const avg = sum / on;
    const share = 0.45 + 0.55 * (on / total);
    return {
      lit: Math.max(0, Math.min(1, avg * share)),
      color: kn ? kelvinToHex(Math.round(kelvin / kn)) : "#ffd7a3",
      on, total,
    };
  }

  _roomAllEntities(room) {
    const hidden = new Set(Array.isArray(room.hidden) ? room.hidden : []);
    if (Array.isArray(room.entities)) {
      return room.entities.filter((e) => this._hass.states[e] && !hidden.has(e));
    }
    if (!room.area_id || !this._registry) return [];
    const cat = this._registry.category || {};
    return (this._registry.byArea[room.area_id] || []).filter((e) => {
      if (!this._hass.states[e] || hidden.has(e)) return false;
      if (cat[e]) return false;
      const st = this._hass.states[e];
      if (st.state === "unavailable" || st.state === "unknown") return false;
      return true;
    });
  }

  /** Everything the room could show, including what is currently hidden. */
  _roomCandidates(room) {
    const seen = new Set();
    const out = [];
    const push = (id) => { if (id && this._hass.states[id] && !seen.has(id)) { seen.add(id); out.push(id); } };
    if (Array.isArray(room.entities)) room.entities.forEach(push);
    else if (room.area_id && this._registry) {
      const cat = this._registry.category || {};
      for (const id of (this._registry.byArea[room.area_id] || [])) if (!cat[id]) push(id);
    }
    for (const id of (room.hidden || [])) push(id);
    return out;
  }

  /** Where a device sits inside its room, in footprint fractions. */
  _spotFor(room, entityId, index, total) {
    const spots = room.spots || {};
    const saved = spots[entityId];
    if (Array.isArray(saved) && saved.length >= 2) return [Number(saved[0]) || 0, Number(saved[1]) || 0];
    return autoSpot(index, total);
  }

  /** One positioned device marker for the focused room. */
  _spotMarkup(room, entityId, index, total) {
    const st = this._hass.states[entityId];
    if (!st) return "";
    const [fx, fy] = this._spotFor(room, entityId, index, total);
    const on = ON_STATES.has(st.state);
    const name = st.attributes.friendly_name || entityId;
    const kind = this._badgeKind(entityId);
    const unit = st.attributes.unit_of_measurement || "";
    let value;
    if (kind === "toggle") value = on ? "acceso" : "spento";
    else if (kind === "binary") value = stateWords(st.state, st.attributes.device_class);
    else if (kind === "climate") value = (st.attributes.current_temperature !== undefined
      ? st.attributes.current_temperature + "°" : stateWords(st.state));
    else if (kind === "cover") value = (st.attributes.current_position !== undefined
      ? st.attributes.current_position + "%" : stateWords(st.state));
    else {
      const n = parseFloat(st.state);
      value = (Number.isFinite(n) ? (Math.abs(n) >= 100 ? Math.round(n) : n.toFixed(1)) : stateWords(st.state))
        + (unit ? " " + unit : "");
    }
    return `<div class="fp-spot${on ? " on" : ""}${this._editing ? " movable" : ""}" data-spot="${esc(entityId)}"
        style="left:${(fx * 100).toFixed(3)}%;top:${(fy * 100).toFixed(3)}%">
        <div class="fp-spot-pin" style="transform:translateZ(26px) rotateZ(calc(var(--yaw) * -1)) rotateX(calc(var(--pitch) * -1)) scale(calc(1 / var(--zoom)))">
          <button class="fp-spot-btn" ${this._editing ? "" : `data-fp-badge="${esc(entityId)}"`} title="${esc(name)}">
            <ha-icon icon="${esc(autoIcon(entityId, st))}"></ha-icon>
          </button>
          <div class="fp-spot-tip"><strong>${esc(name)}</strong><span>${esc(value)}</span></div>
        </div>
      </div>`;
  }

  _renderRoom(room, view) {
    const focusId = this._focus && this._focus.roomId;
    const focused = focusId === room.id;
    const dim = !!focusId && !focused;
    const level = room.level || 0;
    const rot = Number(room.rotation) || 0;
    const gap = view.level_gap || 150;
    const activeLevel = view.active_level;
    const ghost = activeLevel !== null && activeLevel !== undefined && activeLevel !== level;
    const selected = this._selected && this._selected.kind === "room" && this._selected.roomId === room.id;
    const wallH = view.show_walls ? view.wall_height : 0;
    const pts = roomPoints(room);
    const poly = pointsToCss(pts);

    // Focus mode replaces the badge strip with positioned device markers: the
    // point of zooming into a room is to see *where* things are, so a floating
    // list of chips would defeat the whole gesture.
    const allEnts = focused ? this._roomAllEntities(room) : [];
    const entities = focused ? [] : this._roomEntities(room);
    const badges = entities.map((e) => this._badgeMarkup(e, room)).join("");
    const spots = focused
      ? `<div class="fp-spots">${allEnts.map((e, i) => this._spotMarkup(room, e, i, allEnts.length)).join("")}</div>`
      : "";

    // Cars are drawn whether or not the room is focused: "is it charging" is
    // the question you ask by glancing at the plan, not by opening the garage.
    //
    // Two heights on purpose. Seen from outside, the marker floats above the
    // box like the room label does, because at a garage's own wall height the
    // near wall simply covers it and the name is unreadable. Inside a focused
    // room the walls are translucent and the car belongs on the floor, where
    // it actually is.
    const parked = this._vehiclesFor(room.vehicles).filter(() => Array.isArray(room.vehicles) && room.vehicles.length);
    const cars = parked.length && !ghost ? `<div class="fp-cars">${parked.map((v, i) => {
      const vs = vehicleState(v, this._hass.states);
      const [fx, fy] = this._spotFor(room, "vehicle:" + v.id, i, parked.length);
      return `<div class="fp-car${vs.charging ? " charging" : ""}${this._editing ? " movable" : ""}"
          data-spot="vehicle:${esc(v.id)}" style="left:${(fx * 100).toFixed(3)}%;top:${(fy * 100).toFixed(3)}%;--ec:${esc(socColor(vs.soc))}">
          <div class="fp-car-body" style="transform:translateZ(${(focused ? wallH * 0.3 + 6 : wallH + 12).toFixed(1)}px) rotateZ(calc(var(--yaw) * -1)) rotateX(calc(var(--pitch) * -1)) scale(calc(1 / var(--zoom)))">
            <div class="fp-car-icon"><ha-icon icon="${esc(v.icon)}"></ha-icon>
              ${vs.charging ? '<i class="fp-car-bolt"><ha-icon icon="mdi:flash"></ha-icon></i>' : ""}</div>
            <div class="fp-car-soc">
              <span style="width:${vs.soc === null ? 0 : Math.max(0, Math.min(100, vs.soc)).toFixed(1)}%"></span>
            </div>
            <div class="fp-car-tag"><strong>${esc(v.name)}</strong>
              <small>${esc(vs.soc === null ? vs.status : Math.round(vs.soc) + "%"
                + (vs.charging && vs.powerW !== null ? " · " + fmtPower(vs.powerW).v + " " + fmtPower(vs.powerW).u : ""))}</small></div>
          </div>
        </div>`;
    }).join("")}</div>` : "";

    const walls = view.show_walls && !ghost ? roomEdges(room).map((e, i) => {
      const wt = wallAt(room, i);
      if (wt.none || wallH <= 0) return "";
      const h = Math.max(2, wallH * wt.h);
      const cls = ["fp-wall"];
      if (wt.glass) cls.push("glass");
      if (wt.posts) cls.push("railing");
      if (wt.steps) cls.push("stairs");
      if (wt.ribs) cls.push("garage");
      if (wt.door) cls.push("door");
      if (wt.band) cls.push("window");
      return `<div class="${cls.join(" ")}" data-wall="${i}"
        style="width:${e.len.toFixed(2)}px;height:${h.toFixed(2)}px;left:${e.x.toFixed(2)}px;top:${e.y.toFixed(2)}px;
        transform-origin:0 0;transform:rotateZ(${e.angle.toFixed(3)}deg) rotateX(90deg);
        opacity:${wt.opacity};--face:${e.shade.toFixed(3)}"></div>`;
    }).join("") : "";

    const [cx, cy] = polygonCentroid(pts);
    const label = view.show_labels && !ghost
      ? `<div class="fp-label" data-room-focus="${esc(room.id)}" title="Ingrandisci ${esc(room.title)}">
           <ha-icon icon="${esc(room.icon)}"></ha-icon><span>${esc(room.title)}</span>
           ${level ? `<em class="fp-lv">${level > 0 ? "+" : ""}${level}</em>` : ""}
         </div>` : "";
    // Handles and vertices are useless if a stack of status badges is sitting
    // on top of the geometry they move, so the room being edited shows its
    // name and nothing else until it is deselected.
    const editable = this._editing && selected && !ghost;
    // While editing, no room shows its status badges. The strip is wider than
    // the room and floats above the plan, so it lands on top of the rooms
    // next door and eats the clicks meant for them — which is why some rooms
    // simply could not be selected. Editing is about geometry, not readings.
    const badgeLayer = badges && !this._editing ? `<div class="fp-badges">${badges}</div>` : "";
    const tag = (label || badgeLayer) && !dim && !focused ? `
      <div class="fp-anchor" style="left:${(cx * 100).toFixed(3)}%;top:${(cy * 100).toFixed(3)}%;transform:translateZ(${wallH + 14}px) rotateZ(calc(var(--yaw) * -1)) rotateX(calc(var(--pitch) * -1))">
        <div class="fp-tag">${label}${badgeLayer}</div>
      </div>` : "";

    // Handles live in the floor plane on purpose. A billboarded handle would
    // stay readable but would stop looking attached to the corner it moves,
    // and direct manipulation needs the grab point to be where the geometry is.
    const handles = editable ? RESIZE_HANDLES.map((hd) => `
      <button class="fp-handle" data-resize="${hd.k}" title="${hd.t}"
        style="left:${hd.x * 100}%;top:${hd.y * 100}%;cursor:${hd.c}"></button>`).join("") : "";
    const rotHandle = editable ? `
      <button class="fp-rotate" data-rotate="${esc(room.id)}" title="Ruota la stanza">
        <ha-icon icon="mdi:rotate-3d-variant"></ha-icon>
      </button>` : "";
    const vertices = editable && Array.isArray(room.points) ? pts.map((pt, i) => `
      <button class="fp-vertex" data-vertex="${i}" title="Vertice ${i + 1}"
        style="left:${(pt[0] * 100).toFixed(3)}%;top:${(pt[1] * 100).toFixed(3)}%"></button>`).join("")
      + pts.map((pt, i) => {
        const nx = pts[(i + 1) % pts.length];
        return `<button class="fp-vertex add" data-vertex-add="${i}" title="Aggiungi un vertice"
          style="left:${(((pt[0] + nx[0]) / 2) * 100).toFixed(3)}%;top:${(((pt[1] + nx[1]) / 2) * 100).toFixed(3)}%"></button>`;
      }).join("") : "";

    const cls = ["fp-room"];
    if (selected) cls.push("selected");
    if (this._editing && !ghost) cls.push("editable");
    if (focused) cls.push("focused");
    if (dim) cls.push("dim");
    if (ghost) cls.push("ghost");

    const lightState = ghost ? { lit: 0, color: null } : this._roomLight(room);
    if (lightState.lit > 0.02) cls.push("lit");
    const material = room.material || guessMaterial(room.title);
    const layers = materialLayers(material);

    return `<div class="${cls.join(" ")}"
        data-room="${esc(room.id)}" data-level="${level}" data-material="${esc(material)}"
        style="--rc:${esc(room.color)};--lit:${lightState.lit.toFixed(3)};${
          lightState.color ? `--lc:${esc(lightState.color)};` : ""}left:${room.x}px;top:${room.y}px;width:${room.w}px;height:${room.h}px;
          transform:translateZ(${(level * gap).toFixed(2)}px)${rot ? ` rotateZ(${rot}deg)` : ""}">
        <div class="fp-floor" style="clip-path:polygon(${poly})${
          layers ? `;--mat:${layers}` : ""}"></div>
        <svg class="fp-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="${pointsToSvg(pts)}"></polygon></svg>
        ${walls}
        ${spots}
        ${cars}
        ${handles}
        ${rotHandle}
        ${vertices}
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
          ${this._registry ? `<div class="bootstrap-actions">
            <button data-mw-start><ha-icon icon="mdi:wizard-hat"></ha-icon> CONFIGURAZIONE GUIDATA</button>
            ${ready ? '<button class="secondary" data-auto-rooms><ha-icon icon="mdi:auto-fix"></ha-icon> GENERA E BASTA</button>' : ""}
          </div>` : ""}
        </div>`;
    }

    const bounds = this._planBounds();
    const levels = this._levels();
    const gap = view.level_gap || 150;
    const focus = this._focus && this._room(this._focus.roomId) ? this._focus : null;
    const froom = focus ? this._room(focus.roomId) : null;

    // Focus is a camera state, not a stored one: it overrides zoom and slides
    // the world so the chosen room lands on the stage origin. Writing it into
    // page.view instead would make "zoom into the kitchen" a persisted setting
    // and leave the map stuck there on the next load.
    const zoom = focus ? focus.zoom : view.zoom;
    const shift = focus
      ? ` translate3d(${focus.dx.toFixed(2)}px,${focus.dy.toFixed(2)}px,${focus.dz.toFixed(2)}px)`
      : "";

    // Perspective has to grow with the building.
    //
    // The scene is scale(zoom) rotateX rotateZ translateZ(level*gap), so the
    // scale multiplies the storey offset too. With a fixed 1900px perspective
    // an eight-storey plan at a 400-unit interfloor would push the top rooms
    // through the camera plane and render them inside out. Keeping the camera
    // at least three times as far away as the building is tall bounds the
    // foreshortening between floors to something that reads as depth instead
    // of distortion, and a single-storey plan keeps the original 1900px so the
    // common case looks exactly as it did.
    const span = ((levels[levels.length - 1] - levels[0]) * gap + (view.wall_height || 0))
      * Math.max(1, zoom);
    const persp = Math.max(1900, Math.round(span * 3));

    // Only the entrance floor gets a full slab. Repeating it at every storey
    // turned the stack into three opaque grey planes that hid the rooms below;
    // upper and lower storeys get a thin outline instead, which still says
    // "there is a floor here" without becoming the loudest thing on screen.
    const grounds = levels.map((lv) => `
      <div class="fp-ground${lv === 0 ? " base" : " deck"}" data-ground="${lv}"
        style="width:${bounds.w + 80}px;height:${bounds.h + 80}px;left:-40px;top:-40px;transform:translateZ(${(lv * gap).toFixed(2)}px);
          opacity:${view.active_level !== null && view.active_level !== undefined && view.active_level !== lv
            ? 0.06 : (lv === 0 ? 1 : Math.max(0.25, 0.6 - Math.abs(lv) * 0.08)).toFixed(2)}"></div>`).join("");

    const levelBar = levels.length > 1 ? `
      <div class="fp-levels">
        <button class="fp-hud-btn ${view.active_level === null || view.active_level === undefined ? "active" : ""}" data-level-pick="all" title="Tutti i piani"><ha-icon icon="mdi:layers-triple-outline"></ha-icon></button>
        ${levels.slice().reverse().map((lv) => `<button class="fp-hud-btn ${view.active_level === lv ? "active" : ""}" data-level-pick="${lv}" title="${esc(levelName(lv))}">${lv > 0 ? "+" : ""}${lv}</button>`).join("")}
      </div>` : "";

    const focusBar = froom ? `
      <div class="fp-focus-bar">
        <ha-icon icon="${esc(froom.icon)}"></ha-icon>
        <div class="ffb-text">
          <strong>${esc(froom.title)}</strong>
          <small>${this._roomAllEntities(froom).length} dispositivi · ${esc(levelName(froom.level || 0))}${this._editing ? " · trascina le icone per posizionarle" : ""}</small>
        </div>
        ${this._editing ? `<button class="ffb-add" data-room-add-device="${esc(froom.id)}"><ha-icon icon="mdi:plus"></ha-icon> DISPOSITIVO</button>` : ""}
        <button class="ffb-exit" data-focus-exit><ha-icon icon="mdi:close"></ha-icon></button>
      </div>` : "";

    // Inside a room, the pins say *where*; this list says *what*. On a phone
    // the footprint is 250px wide and eight labelled pins pile into an
    // unreadable heap, so the names and values move out of the scene and into
    // a list that works at any width — and stays useful on a desktop too.
    const focusList = froom ? `<div class="fp-devices">
        ${this._roomAllEntities(froom).map((id) => {
          const dst = this._hass.states[id];
          if (!dst) return "";
          const on = ON_STATES.has(dst.state);
          const unit = dst.attributes.unit_of_measurement || "";
          const n = parseFloat(dst.state);
          const value = Number.isFinite(n)
            ? (Math.abs(n) >= 100 ? Math.round(n) : n.toFixed(1)) + (unit ? " " + unit : "")
            : stateWords(dst.state, dst.attributes.device_class);
          // The list has room for a companion control, unlike a 38 px pin, so
          // here the counterpart action gets a real button instead of relying
          // on the long press: an affordance you can see beats one you have to
          // know about. Only switchable things get it — a thermometer has
          // nothing to flip.
          const kind = this._badgeKind(id);
          const actionable = kind === "toggle" || (kind === "binary" && domainOf(id) === "lock");
          const tapToggles = (view.tap_action || "toggle") === "toggle";
          return `<div class="fp-dev${on ? " on" : ""}">
            ${actionable ? `<button class="fp-dev-alt" data-fp-badge-alt="${esc(id)}" title="${tapToggles ? "Apri i dettagli" : "Accendi / spegni"}">
              <ha-icon icon="${esc(autoIcon(id, dst))}"></ha-icon></button>`
              : `<ha-icon icon="${esc(autoIcon(id, dst))}"></ha-icon>`}
            <button class="fp-dev-main" data-fp-badge="${esc(id)}">
              <span><strong>${esc(dst.attributes.friendly_name || id)}</strong><small>${esc(value)}</small></span>
            </button>
          </div>`;
        }).join("")}
      </div>` : "";

    return `<div class="fp-wrap">${this._renderFloorplanViewport(
      { view, rooms, bounds, focus, zoom, shift, persp, grounds, levelBar, focusBar })}${focusList}</div>`;
  }

  /**
   * The 3D scene itself, split out so the room close-up can put a plain list
   * of the room's devices underneath it.
   *
   * Everything it needs is passed in one object rather than nine positional
   * arguments: the split already cost one "bounds is not defined" at runtime,
   * and a named bag makes the next addition impossible to mis-order.
   */
  _renderFloorplanViewport({ view, rooms, bounds, focus, zoom, shift, persp, grounds, levelBar, focusBar }) {
    return `<div class="fp-viewport${this._editing ? " editing" : ""}${focus ? " focusing" : ""}" data-fp-viewport data-keep-scroll="map"
        style="--yaw:${view.yaw}deg;--pitch:${view.pitch}deg;--zoom:${zoom};--persp:${persp}px">
        <div class="fp-stage">
          <div class="fp-world" style="width:${bounds.w}px;height:${bounds.h}px;margin-left:${-bounds.w / 2}px;margin-top:${-bounds.h / 2}px;
            transform:scale(var(--zoom)) rotateX(var(--pitch)) rotateZ(var(--yaw))${shift}">
            ${grounds}
            ${rooms.map((r) => this._renderRoom(r, view)).join("")}
          </div>
        </div>
        ${focusBar}
        ${levelBar}
        <div class="fp-hud">
          <button class="fp-hud-btn" data-view-nudge="yaw:-15" title="Ruota a sinistra"><ha-icon icon="mdi:rotate-left"></ha-icon></button>
          <button class="fp-hud-btn" data-view-nudge="yaw:15" title="Ruota a destra"><ha-icon icon="mdi:rotate-right"></ha-icon></button>
          <button class="fp-hud-btn" data-view-nudge="pitch:-6" title="Abbassa la camera"><ha-icon icon="mdi:angle-acute"></ha-icon></button>
          <button class="fp-hud-btn" data-view-nudge="pitch:6" title="Alza la camera"><ha-icon icon="mdi:cube-outline"></ha-icon></button>
          <button class="fp-hud-btn zoomable" data-view-nudge="zoom:-0.15" title="Riduci"${focus ? " disabled" : ""}><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button>
          <button class="fp-hud-btn zoomable" data-view-nudge="zoom:0.15" title="Ingrandisci"${focus ? " disabled" : ""}><ha-icon icon="mdi:magnify-plus-outline"></ha-icon></button>
          <button class="fp-hud-btn ${view.show_walls ? "active" : ""}" data-view-toggle="show_walls" title="Mostra/nascondi muri"><ha-icon icon="mdi:wall"></ha-icon></button>
          <button class="fp-hud-btn ${view.show_labels ? "active" : ""}" data-view-toggle="show_labels" title="Mostra/nascondi nomi stanze"><ha-icon icon="mdi:label-outline"></ha-icon></button>
          <button class="fp-hud-btn" data-view-flat title="Vista dall'alto (pianta)"><ha-icon icon="mdi:crop-free"></ha-icon></button>
          <button class="fp-hud-btn" data-view-fit title="Adatta allo schermo"><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon></button>
        </div>
        ${this._editing
          ? '<div class="fp-hint">Trascina la stanza per spostarla · maniglie per ridimensionare · tocca il nome per entrarci</div>'
          : '<div class="fp-hint">Trascina lo sfondo per ruotare · pizzica per zoomare · tocca il nome di una stanza</div>'}
      </div>`;
  }

  /**
   * Fit the whole plan into the viewport.
   *
   * The saved zoom is a number of screen pixels per plan unit, so a plan that
   * fits a 1500px desktop panel overflows a 390px phone by a factor of four —
   * which is exactly what "sul cellulare la mappa non si adatta" describes.
   * The fix cannot be a smaller stored zoom, because that would then be wrong
   * on the desktop: the zoom has to be derived from the viewport that is
   * actually on screen. This runs once per page visit per breakpoint, and on
   * demand from the HUD.
   */
  _fitPlan(force) {
    const vp = this.querySelector("[data-fp-viewport]");
    if (!vp) return false;
    const rect = vp.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const page = this._page();
    const view = page.view || {};
    const bounds = this._planBounds();
    const levels = this._levels();
    const gap = view.level_gap || 150;
    // A stacked building is taller on screen than its footprint, so the fit has
    // to account for the storeys too or the top floor lands off-screen.
    const spread = (levels[levels.length - 1] - levels[0]) * gap * Math.cos((view.pitch * Math.PI) / 180);
    const fit = fitZoom(bounds.w, bounds.h + Math.abs(spread), view.yaw, view.pitch,
      rect.width, rect.height, 0.82);
    if (!force && Math.abs(fit - view.zoom) < 0.02) return false;
    view.zoom = Math.round(fit * 100) / 100;
    this._touch(!force);
    return true;
  }

  /**
   * One-finger orbit and two-finger pinch on the map background.
   *
   * Without this the map is unusable on a phone: the HUD buttons are the only
   * way to turn the house, and there is no way to zoom at all beyond fixed
   * steps. touch-action:none on the viewport hands the gesture to us instead
   * of to the page scroller, which is what made the rooms untouchable.
   */
  _bindMapGestures() {
    const vp = this.querySelector("[data-fp-viewport]");
    if (!vp) return;
    const page = this._page();
    const view = page.view;
    const pointers = new Map();
    let start = null;

    const dist = () => {
      const [a, b] = Array.from(pointers.values());
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    vp.onpointerdown = (ev) => {
      // Anything with its own gesture — a room, a handle, a device pin, the
      // HUD — keeps it. Only the empty background orbits the camera.
      if (ev.target.closest(".fp-room, .fp-hud, .fp-levels, .fp-focus-bar")) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      vp.setPointerCapture(ev.pointerId);
      start = { yaw: view.yaw, pitch: view.pitch, zoom: view.zoom,
        x: ev.clientX, y: ev.clientY, d: pointers.size === 2 ? dist() : 0 };
    };

    vp.onpointermove = (ev) => {
      if (!pointers.has(ev.pointerId) || !start) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      if (pointers.size >= 2) {
        if (!start.d) { start.d = dist(); start.zoom = view.zoom; return; }
        if (!start.dragging) { start.dragging = true; vp.classList.add("dragging"); }
        const k = dist() / start.d;
        view.zoom = Math.min(3, Math.max(0.3, Math.round(start.zoom * k * 100) / 100));
        vp.style.setProperty("--zoom", view.zoom);
        return;
      }
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      // The world carries a 0.28s ease on its transform so that the HUD
      // buttons animate. During a drag that same easing makes the house lag a
      // third of a second behind the pointer and keep turning after the finger
      // stops — "gira come vuole lui". The transition is suppressed for the
      // duration of the gesture and restored on release.
      if (!start.dragging) {
        start.dragging = true;
        vp.classList.add("dragging");
      }
      // 0.55 deg per pixel horizontally: a full turn in roughly the width of a
      // phone, which is what makes it feel like the house follows the finger.
      view.yaw = (((start.yaw + dx * 0.55) % 360) + 360) % 360;
      view.pitch = Math.min(85, Math.max(0, start.pitch - dy * 0.35));
      vp.style.setProperty("--yaw", view.yaw.toFixed(2) + "deg");
      vp.style.setProperty("--pitch", view.pitch.toFixed(2) + "deg");
    };

    const release = (ev) => {
      if (!pointers.has(ev.pointerId)) return;
      pointers.delete(ev.pointerId);
      try { vp.releasePointerCapture(ev.pointerId); } catch (e) { /* already gone */ }
      if (pointers.size) { start = null; return; }
      const moved = !!(start && start.dragging);
      start = null;
      vp.classList.remove("dragging");
      if (!moved) return;   // a tap on the background is not a camera move
      // Committed only on release: re-rendering during the gesture would
      // rebuild the element the finger is holding.
      this._touch();
    };
    vp.onpointerup = release;
    vp.onpointercancel = release;

    vp.onwheel = (ev) => {
      if (ev.target.closest(".fp-hud, .fp-levels")) return;
      ev.preventDefault();
      view.zoom = Math.min(3, Math.max(0.3,
        Math.round((view.zoom * (ev.deltaY > 0 ? 0.92 : 1.08)) * 100) / 100));
      this._touch();
    };
  }

  /** Every storey that actually holds a room, low to high, always including 0. */
  _levels() {
    const set = new Set([0]);
    for (const r of this._rooms()) set.add(r.level || 0);
    return Array.from(set).sort((a, b) => a - b);
  }

  /**
   * Enter or leave the room close-up.
   *
   * The fit is computed here, against the measured viewport, rather than at
   * render time: the viewport is a min(74vh, 760px) box, so its real size is
   * only known once it is laid out, and guessing it would make the zoom right
   * on a desktop and wrong on a tablet.
   */
  _focusRoom(roomId) {
    const room = this._room(roomId);
    if (!room) return;
    if (this._focus && this._focus.roomId === roomId) { this._exitFocus(); return; }
    const view = this._page().view || {};
    const vp = this.querySelector("[data-fp-viewport]");
    const rect = vp ? vp.getBoundingClientRect() : { width: 900, height: 560 };
    const bounds = this._planBounds();
    const gap = view.level_gap || 150;
    this._focus = {
      roomId,
      // A wide panel can afford air around the room; a phone cannot.
      zoom: fitZoom(room.w, room.h, view.yaw, view.pitch, rect.width || 900, rect.height || 560,
        (rect.width || 900) < 620 ? 0.78 : 0.6),
      dx: bounds.w / 2 - (room.x + room.w / 2),
      dy: bounds.h / 2 - (room.y + room.h / 2),
      dz: -((room.level || 0) * gap),
    };
    if (this._editing) { this._selected = { kind: "room", roomId }; this._entityQuery = ""; }
    this._touch(true);
  }

  _exitFocus() {
    this._focus = null;
    this._touch(true);
  }

  /**
   * Guided 3D map setup.
   *
   * Step 0 asks which rooms exist, seeded from the Home Assistant areas but
   * not bound to them: a flat with no areas configured must still be able to
   * draw a plan, so rooms can be typed by hand. One step per room then
   * confirms what appears inside it, and the last step builds the plan.
   */
  _startMapWizard() {
    const areas = (this._registry && this._registry.areas) || [];
    const existing = this._rooms();
    const rooms = areas.map((a, i) => {
      const prev = existing.find((r) => r.area_id === a.area_id);
      return {
        area_id: a.area_id,
        title: (prev && prev.title) || a.name || a.area_id,
        icon: (prev && prev.icon) || a.icon || roomIconFor(a.name || a.area_id),
        color: (prev && prev.color) || ROOM_COLORS[i % ROOM_COLORS.length],
        on: true,
        entities: null,          // null = automatic from the area
      };
    });
    // rooms the user created by hand survive a re-run of the wizard
    for (const r of existing) {
      if (r.area_id && areas.some((a) => a.area_id === r.area_id)) continue;
      rooms.push({ area_id: null, title: r.title, icon: r.icon, color: r.color,
        on: true, entities: Array.isArray(r.entities) ? r.entities.slice() : [] });
    }
    this._mapWizard = { step: 0, rooms, newRoom: "" };
    this._entityQuery = "";
    this._touch();
  }

  _mapWizardRooms() { return this._mapWizard.rooms.filter((r) => r.on); }

  _mapWizardBody() {
    const w = this._mapWizard;

    if (w.step === 0) {
      const areas = (this._registry && this._registry.areas) || [];
      const count = this._mapWizardRooms().length;
      return `<div class="wiz-step">
          <div class="wiz-q">Quante stanze ha la casa?</div>
          <div class="wiz-hint">${areas.length
            ? `Cyborg ha trovato <strong>${areas.length} aree</strong> in Home Assistant. Togli la spunta a quelle che non vuoi sulla mappa, e aggiungi le stanze che in Home Assistant non esistono.`
            : "In Home Assistant non ci sono aree configurate. Scrivi qui i nomi delle stanze: potrai collegarle alle aree più avanti, oppure scegliere le entità a mano."}</div>
          <div class="wiz-list" data-keep-scroll="wiz">${w.rooms.map((r, i) => `
            <button type="button" class="wiz-opt ${r.on ? "sel" : ""}" data-mw-room="${i}">
              <ha-icon icon="${esc(r.on ? "mdi:checkbox-marked" : "mdi:checkbox-blank-outline")}"></ha-icon>
              <div><strong>${esc(r.title)}</strong><small>${esc(r.area_id ? "area di Home Assistant" : "stanza aggiunta a mano")}</small></div>
              ${r.area_id ? "" : `<em class="wiz-tip" style="background:#c77dff">manuale</em>`}
            </button>`).join("")}</div>
          <div class="mw-add">
            <input type="text" data-mw-newroom value="${esc(w.newRoom || "")}" placeholder="Nome di una stanza da aggiungere...">
            <button class="secondary" data-mw-addroom><ha-icon icon="mdi:plus"></ha-icon></button>
          </div>
          <div class="wiz-hint"><strong>${count}</strong> stanz${count === 1 ? "a" : "e"} finiranno sulla mappa.</div>
        </div>`;
    }

    const rooms = this._mapWizardRooms();
    if (w.step <= rooms.length) {
      const room = rooms[w.step - 1];
      const pool = room.area_id && this._registry
        ? (this._registry.byArea[room.area_id] || []) : [];
      const auto = room.entities === null;
      const chosen = new Set(auto
        ? this._roomEntities({ area_id: room.area_id, entities: null })
        : room.entities);
      const q = (this._entityQuery || "").trim().toLowerCase();
      let rows = (pool.length ? pool : Object.keys(this._hass.states))
        .filter((id) => { const st = this._hass.states[id];
          return st && ACTIVE_DOMAINS[domainOf(id)] !== undefined || (st && BADGE_PRIORITY.some((r) => r.test(domainOf(id), st.attributes.device_class))); })
        .filter((id) => !q || ((this._hass.states[id].attributes.friendly_name || "") + " " + id).toLowerCase().includes(q));
      if (!pool.length && !q) rows = rows.slice(0, 30);

      return `<div class="wiz-step">
          <div class="wiz-q">Cosa c'è in ${esc(room.title)}?</div>
          <div class="wiz-hint">${room.area_id
            ? `Queste sono le entità dell'area <strong>${esc(room.title)}</strong>. Lasciando l'automatico, la stanza mostra sempre le più utili e si aggiorna da sola quando aggiungi dispositivi in Home Assistant.`
            : "Questa stanza non è collegata a un'area, quindi le entità vanno scelte a mano."}</div>
          <div class="level-picker">
            <button class="mini" data-mw-level="-1" ${(room.level || 0) <= -3 ? "disabled" : ""} title="Un piano più in basso"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
            <div class="level-now"><strong>${esc(levelName(room.level || 0))}</strong><small>a che piano si trova</small></div>
            <button class="mini" data-mw-level="1" ${(room.level || 0) >= 8 ? "disabled" : ""} title="Un piano più in alto"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          </div>
          ${room.area_id ? `<label class="check"><input type="checkbox" data-mw-auto ${auto ? "checked" : ""}> Automatico dall'area (consigliato)</label>` : ""}
          ${auto && room.area_id ? `<div class="wiz-list" data-keep-scroll="wiz">${[...chosen].map((id) => {
            const st = this._hass.states[id];
            return `<div class="wiz-opt sel" style="pointer-events:none">
              <ha-icon icon="${esc(autoIcon(id, st))}"></ha-icon>
              <div><strong>${esc((st && st.attributes.friendly_name) || id)}</strong><small>${esc(id)}</small></div></div>`;
          }).join("") || '<div class="entity-result-empty">Nessuna entità utile trovata in quest\'area.</div>'}</div>`
          : `<input type="text" data-entity-search value="${esc(this._entityQuery)}" placeholder="filtra le entità..." autocomplete="off">
             <div class="wiz-list" data-keep-scroll="wiz">${rows.slice(0, 40).map((id) => {
               const st = this._hass.states[id];
               return `<button type="button" class="wiz-opt ${chosen.has(id) ? "sel" : ""}" data-mw-ent="${esc(id)}">
                 <ha-icon icon="${esc(chosen.has(id) ? "mdi:checkbox-marked" : "mdi:checkbox-blank-outline")}"></ha-icon>
                 <div><strong>${esc((st && st.attributes.friendly_name) || id)}</strong><small>${esc(id)}</small></div>
               </button>`;
             }).join("") || '<div class="entity-result-empty">Nessun risultato.</div>'}</div>`}
        </div>`;
    }

    const rr = this._mapWizardRooms();
    return `<div class="wiz-step">
        <div class="wiz-q">Tutto pronto</div>
        <div class="wiz-hint">Cyborg disporrà le ${rr.length} stanze su una griglia ordinata, un piano alla volta. Da lì le <strong>trascini</strong> sulla mappa per farle somigliare alla pianta vera, le <strong>ridimensioni</strong> con le maniglie bianche e ne cambi la <strong>forma</strong> dal pannello di destra.${
          new Set(rr.map((r) => r.level || 0)).size > 1
            ? ` L'edificio ha ${new Set(rr.map((r) => r.level || 0)).size} piani: il selettore a destra sulla mappa ne isola uno alla volta.` : ""}</div>
        <div class="wiz-list" data-keep-scroll="wiz">${rr.map((r) => `<div class="wiz-opt sel" style="pointer-events:none;--nc:${esc(r.color)}">
            <ha-icon icon="${esc(r.icon)}"></ha-icon>
            <div><strong>${esc(r.title)}</strong><small>${esc(levelName(r.level || 0) + " · " + (r.entities === null
              ? this._roomEntities({ area_id: r.area_id, entities: null }).length + " entità automatiche"
              : r.entities.length + " entità scelte"))}</small></div>
          </div>`).join("")}</div>
      </div>`;
  }

  _mapWizardEditor() {
    const w = this._mapWizard;
    const rooms = this._mapWizardRooms();
    const total = rooms.length + 2;
    const last = w.step >= total - 1;
    const label = w.step === 0 ? "Stanze"
      : w.step <= rooms.length ? rooms[w.step - 1].title : "Riepilogo";
    return `<div class="wiz">
        <div class="wiz-bar">${Array.from({ length: total }, (_, i) =>
          `<i class="${i < w.step ? "done" : i === w.step ? "now" : ""}"></i>`).join("")}</div>
        <div class="wiz-head">
          <span>PASSO ${w.step + 1} DI ${total}</span>
          <strong>${esc(label)}</strong>
        </div>
        ${this._mapWizardBody()}
        <div class="wiz-nav">
          ${w.step > 0 ? '<button class="secondary" data-mw-back><ha-icon icon="mdi:chevron-left"></ha-icon> INDIETRO</button>' : ""}
          <button data-mw-next ${w.step === 0 && !rooms.length ? "disabled" : ""}>${last ? "CREA LA MAPPA" : "AVANTI"} <ha-icon icon="${last ? "mdi:check" : "mdi:chevron-right"}"></ha-icon></button>
        </div>
        <button class="wiz-advanced" data-mw-exit>Annulla</button>
      </div>`;
  }

  /** Commit the wizard answers into real rooms laid out on a grid. */
  _finishMapWizard() {
    const page = this._page();
    const rooms = this._mapWizardRooms();
    const W = 230, H = 180, GAP = 18;
    // Each storey gets its own grid. Packing every room into one grid would
    // stack a first-floor bedroom directly above a ground-floor one only by
    // accident, and would leave holes on the floor that has fewer rooms.
    const perLevel = {};
    page.rooms = rooms.map((r) => {
      const lv = r.level || 0;
      const n = (perLevel[lv] = (perLevel[lv] || 0));
      perLevel[lv] = n + 1;
      const count = rooms.filter((x) => (x.level || 0) === lv).length;
      const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
      return {
        id: uid("room"),
        area_id: r.area_id,
        title: r.title,
        icon: r.icon,
        color: r.color,
        x: (n % cols) * (W + GAP),
        y: Math.floor(n / cols) * (H + GAP),
        w: W, h: H,
        level: lv, points: null, spots: {},
        entities: r.entities,
      };
    });
    this._mapWizard = null;
    this._selected = null;
    this._entityQuery = "";
    this._save();
  }

  /**
   * The list of every room, always reachable.
   *
   * It appears in the page editor *and* in the room editor. Selecting a room
   * switches the panel to that room's editor, and when the list only lived in
   * the page editor it vanished at exactly that moment — so you could reach
   * one room and then had to go hunting on the canvas for the next. On a plan
   * where rooms overlap that hunt is what "non mi fa cliccare su balcone" was.
   */
  _roomSwitcher() {
    const rooms = this._rooms();
    if (!rooms.length) return '<div class="entity-result-empty">Nessuna stanza.</div>';
    return `<div class="room-list" data-keep-scroll="room-list">${rooms.map((r) => {
      const sel = this._selected && this._selected.kind === "room" && this._selected.roomId === r.id;
      return `<button class="room-list-row ${sel ? "on" : ""}" data-pick-room="${esc(r.id)}" style="--rc:${esc(r.color)}">
        <ha-icon icon="${esc(r.icon)}"></ha-icon>
        <div class="rl-txt"><strong>${esc(r.title)}</strong>
          <small>${esc(levelName(r.level || 0))} · ${Math.round(r.w)}×${Math.round(r.h)}${
            Number(r.rotation) ? " · " + Math.round(r.rotation) + "°" : ""}</small></div>
        <i class="rl-dot"></i>
      </button>`;
    }).join("")}</div>`;
  }

  _renderRoomEditor(room) {
    const areas = (this._registry && this._registry.areas) || [];
    const derived = this._roomEntities(room);
    const all = this._roomAllEntities(room);
    const candidates = this._roomCandidates(room);
    const hiddenSet = new Set(Array.isArray(room.hidden) ? room.hidden : []);
    const custom = Array.isArray(room.entities);
    const level = room.level || 0;
    const shape = Array.isArray(room.points) ? room.points : null;
    const activePreset = !shape ? "rect"
      : (SHAPE_PRESETS.find((sp) => sp.points && sp.points.length === shape.length
          && sp.points.every((pt, i) => Math.abs(pt[0] - shape[i][0]) < 0.01 && Math.abs(pt[1] - shape[i][1]) < 0.01)) || { k: "custom" }).k;
    const placed = Object.keys(room.spots || {}).length;
    return `<aside class="editor" data-keep-scroll="editor">
      ${this._editorHead("STANZA", room.title)}
      <div class="section">
        <strong>CAMBIA STANZA</strong>
        ${this._roomSwitcher()}
      </div>
      <div class="section">
        <label>NOME<input data-room-prop="title" value="${esc(room.title)}"></label>
        <label>AREA HOME ASSISTANT<select data-room-prop="area_id">
          <option value="">— nessuna —</option>
          ${areas.map((a) => `<option value="${esc(a.area_id)}" ${room.area_id === a.area_id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
        </select></label>
        <span class="hint">Collegando l'area, le entità di quella stanza compaiono da sole sulla mappa. ${all.length} entità trovate ora.</span>
        <label>COLORE<input type="color" data-room-prop="color" value="${esc(room.color)}"></label>
        <label>ICONA
          <div class="icon-editor-row">
            <ha-icon data-icon-preview icon="${esc(room.icon)}"></ha-icon>
            <input data-room-prop="icon" data-icon-live value="${esc(room.icon)}" placeholder="mdi:...">
          </div>
          <div class="icon-palette">${SECTION_ICONS.map((i) =>
            `<button type="button" class="icon-swatch" data-icon-pick="${esc(i)}" title="${esc(i)}"><ha-icon icon="${esc(i)}"></ha-icon></button>`).join("")}</div>
        </label>
        <label>PAVIMENTO
          <select data-room-prop="material">
            <option value="">Automatico · ${esc((ROOM_MATERIALS[guessMaterial(room.title)] || {}).l || "neutro")}</option>
            ${Object.keys(ROOM_MATERIALS).map((k) =>
              `<option value="${esc(k)}" ${room.material === k ? "selected" : ""}>${esc(ROOM_MATERIALS[k].l)}</option>`).join("")}
          </select>
          <span class="hint">Il materiale è disegnato in CSS, senza immagini da ospitare da nessuna parte. In automatico viene dedotto dal nome della stanza.</span>
        </label>
      </div>

      <div class="section">
        <strong>PIANO</strong>
        <span class="hint">La mappa è un edificio, non una pianta: ogni stanza vive su un piano e viene sollevata di conseguenza.</span>
        <div class="level-picker">
          <button class="mini" data-room-level="-1" ${level <= -3 ? "disabled" : ""} title="Abbassa di un piano"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
          <div class="level-now"><strong>${esc(levelName(level))}</strong><small>quota ${level > 0 ? "+" : ""}${level}</small></div>
          <button class="mini" data-room-level="1" ${level >= 8 ? "disabled" : ""} title="Alza di un piano"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        </div>
      </div>

      <div class="section">
        <strong>FORMA</strong>
        <span class="hint">Le maniglie bianche sulla mappa ridimensionano la stanza. Con una forma non rettangolare compaiono anche i vertici, trascinabili uno per uno.</span>
        <div class="shape-grid">${SHAPE_PRESETS.map((sp) => `
          <button class="shape-btn ${activePreset === sp.k ? "active" : ""}" data-room-shape="${sp.k}" title="${esc(sp.l)}">
            <span class="shape-prev" style="clip-path:polygon(${pointsToCss(sp.points || RECT_POINTS)})"></span>
            <small>${esc(sp.l)}</small>
          </button>`).join("")}</div>
        ${shape ? `<div class="vertex-list">
          ${shape.map((pt, i) => `<div class="vertex-row"><span>V${i + 1}</span>
            <em>${Math.round(pt[0] * 100)}% · ${Math.round(pt[1] * 100)}%</em>
            <button class="mini danger" data-vertex-remove="${i}" ${shape.length <= 3 ? "disabled" : ""}><ha-icon icon="mdi:close"></ha-icon></button></div>`).join("")}
        </div>
        <span class="hint">${shape.length} vertici. Sulla mappa, i pallini pieni si trascinano e quelli vuoti a metà lato aggiungono un vertice.</span>` : ""}
      </div>

      <div class="section">
        <strong>LATI DELLA STANZA</strong>
        <span class="hint">Un balcone non ha quattro muri: ne ha uno con una porta finestra e una ringhiera sugli altri tre lati. Ogni lato può essere quello che è davvero.</span>
        <div class="wall-list">${roomEdges(room).map((e, i) => {
          const wt = wallAt(room, i);
          const bearing = ((Math.round(e.angle) % 360) + 360) % 360;
          const side = bearing < 45 || bearing >= 315 ? "nord" : bearing < 135 ? "est" : bearing < 225 ? "sud" : "ovest";
          return `<div class="wall-row">
            <ha-icon icon="${esc(wt.icon)}"></ha-icon>
            <div class="wall-txt"><strong>Lato ${i + 1}</strong><small>${esc(side)} · ${Math.round(e.len)} unità</small></div>
            <select data-wall-type="${i}">
              ${WALL_TYPES.map((w) => `<option value="${esc(w.k)}" ${w.k === wt.k ? "selected" : ""}>${esc(w.l)}</option>`).join("")}
            </select>
          </div>`;
        }).join("")}</div>
        <button class="secondary wide" data-walls-reset><ha-icon icon="mdi:wall"></ha-icon> TUTTI MURI</button>
      </div>

      <div class="section">
        <strong>GEOMETRIA</strong>
        <div class="two">
          <label>X<input type="number" step="10" data-room-prop="x" value="${room.x}"></label>
          <label>Y<input type="number" step="10" data-room-prop="y" value="${room.y}"></label>
        </div>
        <div class="two">
          <label>LARGHEZZA<input type="number" step="10" min="40" data-room-prop="w" value="${room.w}"></label>
          <label>PROFONDITÀ<input type="number" step="10" min="40" data-room-prop="h" value="${room.h}"></label>
        </div>
        <label>ROTAZIONE · ${Math.round(Number(room.rotation) || 0)}°
          <input type="range" min="0" max="355" step="5" data-room-prop="rotation" value="${Math.round(Number(room.rotation) || 0)}"></label>
        <span class="hint">Sulla mappa la maniglia con la freccia circolare gira la stanza. Scatta di 5° per volta; tenendo premuto <strong>Shift</strong> gira libera.</span>
      </div>

      <div class="section">
        <strong>DISPOSITIVI NELLA STANZA</strong>
        <div class="seg">
          <button class="${custom ? "" : "active"}" data-room-mode="auto">Automatici dall'area</button>
          <button class="${custom ? "active" : ""}" data-room-mode="manual">Scelti da me</button>
        </div>
        <span class="hint">${custom
          ? `${all.length} dispositivi scelti a mano. Sulla mappa ne vedi al massimo ${MAX_BADGES_PER_ROOM}: entra nella stanza per vedere i visibili.`
          : `Presi dall'area collegata, senza le entità di diagnostica e configurazione. Sulla mappa compaiono i ${Math.min(derived.length, MAX_BADGES_PER_ROOM)} più significativi; l'occhio qui sotto decide chi si vede entrando nella stanza.`}</span>
        <button class="wide" data-room-add-device="${esc(room.id)}"><ha-icon icon="mdi:plus"></ha-icon> AGGIUNGI DISPOSITIVO</button>
        ${this._roomPicker ? `<label>CERCA<input type="text" data-entity-search value="${esc(this._entityQuery)}" placeholder="nome o entity_id..." autocomplete="off" data-autofocus></label>
          <div class="entity-results" data-entity-results data-keep-scroll="entities">${this._roomEntityResults(room)}</div>
          <button class="secondary wide" data-room-picker-close>CHIUDI RICERCA</button>` : ""}
        ${candidates.length ? `<div class="room-vis-head">
          <span>${all.length} visibili su ${candidates.length}</span>
          <button class="mini" data-room-vis-all><ha-icon icon="mdi:eye"></ha-icon> MOSTRA TUTTI</button>
        </div>` : ""}
        <div class="room-entities" data-keep-scroll="room-entities">${candidates.length
          ? candidates.map((e) => {
            const shown = !hiddenSet.has(e);
            return `<div class="room-ent${shown ? "" : " hidden"}">
              <ha-icon icon="${esc(autoIcon(e, this._hass.states[e]))}"></ha-icon>
              <span>${esc((this._hass.states[e] && this._hass.states[e].attributes.friendly_name) || e)}</span>
              ${(room.spots || {})[e] ? '<em class="room-ent-pos" title="Posizionato a mano">●</em>' : ""}
              <button class="mini" data-room-vis="${esc(e)}" title="${shown ? "Nascondi dalla stanza" : "Mostra nella stanza"}">
                <ha-icon icon="${shown ? "mdi:eye" : "mdi:eye-off"}"></ha-icon></button>
              ${custom ? `<button class="mini danger" data-room-ent-remove="${esc(e)}"><ha-icon icon="mdi:close"></ha-icon></button>` : ""}</div>`;
          }).join("")
          : '<div class="entity-result-empty">Nessun dispositivo. Collega un\'area oppure aggiungili a mano.</div>'}</div>
        ${this._vehicles().length ? `<div class="room-cars">
          <strong>AUTO PARCHEGGIATE QUI</strong>
          <span class="hint">Un garage è una stanza come le altre: quello che lo rende un garage è che dentro c'è un'auto. Compare sulla mappa con il suo stato di carica, anche senza entrare nella stanza.</span>
          ${this._vehicles().map((v) => {
            const on = Array.isArray(room.vehicles) && room.vehicles.includes(v.id);
            return `<button type="button" class="dom-chip ${on ? "on" : ""}" data-room-veh="${esc(v.id)}">
              <ha-icon icon="${esc(v.icon)}"></ha-icon>${esc(v.name)}</button>`;
          }).join("")}
        </div>` : ""}
        <button class="secondary wide" data-room-focus-btn="${esc(room.id)}"><ha-icon icon="mdi:magnify-scan"></ha-icon> ENTRA NELLA STANZA E POSIZIONA</button>
        <span class="hint">${placed} dispositivi posizionati a mano; gli altri si dispongono da soli.</span>
      </div>

      <button class="delete" data-room-remove="${esc(room.id)}">ELIMINA STANZA</button>
    </aside>`;
  }

  /**
   * Entity search for a room, biased towards the room's own area.
   *
   * A generic search over 380 entities makes "add the ceiling light to the
   * kitchen" a typing exercise. Listing the area's own entities first, with no
   * query at all, turns it into one tap in the common case.
   */
  _roomEntityResults(room) {
    const q = (this._entityQuery || "").trim().toLowerCase();
    const already = new Set(this._roomAllEntities(room));
    if (!q) {
      const pool = (room.area_id && this._registry && this._registry.byArea[room.area_id]) || [];
      const free = pool.filter((id) => !already.has(id) && this._hass.states[id]);
      if (!free.length) {
        return `<div class="entity-result-empty">${room.area_id
          ? "Tutti i dispositivi dell'area sono già nella stanza. Cerca per aggiungerne altri."
          : "Digita per cercare tra tutte le entità di Home Assistant."}</div>`;
      }
      return `<div class="entity-result-head">DALL'AREA DI QUESTA STANZA</div>` + free.slice(0, 14).map((id) => {
        const st = this._hass.states[id];
        return `<div class="entity-result-row" data-pick-entity="${esc(id)}">
          <ha-icon icon="${esc(autoIcon(id, st))}"></ha-icon>
          <div class="err-text"><strong>${esc(st.attributes.friendly_name || id)}</strong><small>${esc(id)}</small></div>
          <span class="err-state">${esc(st.state)}</span>
        </div>`;
      }).join("");
    }
    return this._entityResults();
  }

  _renderFloorplanPageEditor() {
    const page = this._page();
    const view = page.view || {};
    const areas = (this._registry && this._registry.areas) || [];
    return `<aside class="editor" data-keep-scroll="editor">
      ${this._editorHead("MAPPA 3D", page.title)}
      <div class="section">
        <label>TITOLO PAGINA<input data-page-prop="title" value="${esc(page.title || "")}"></label>
        <label>ICONA${iconField("data-page-prop", "icon", page.icon || "mdi:floor-plan")}</label>
      </div>
      <div class="section">
        <strong>CONFIGURAZIONE GUIDATA</strong>
        <span class="hint">Ti chiede quali stanze ci sono e cosa c'è dentro ciascuna, una domanda alla volta.</span>
        <button class="wide" data-mw-start><ha-icon icon="mdi:wizard-hat"></ha-icon> ${this._rooms().length ? "RIFAI LA PROCEDURA" : "AVVIA CONFIGURAZIONE GUIDATA"}</button>
      </div>
      <div class="section">
        <strong>STANZE</strong>
        <span class="hint">${this._rooms().length} stanze sulla pianta · ${areas.length} aree disponibili in Home Assistant.</span>
        <button class="secondary wide" data-add-room><ha-icon icon="mdi:plus"></ha-icon> AGGIUNGI STANZA</button>
        <button class="secondary wide danger-outline" data-auto-rooms><ha-icon icon="mdi:refresh"></ha-icon> RIGENERA DALLE AREE</button>
      </div>
      <div class="section">
        <strong>STANZE</strong>
        <span class="hint">Ogni stanza è raggiungibile da qui, anche quando sulla pianta ne sta sopra un'altra. Toccane una per selezionarla e modificarla.</span>
        ${this._roomSwitcher()}
      </div>
      <div class="section">
        <strong>PIANI</strong>
        <span class="hint">${this._levels().length > 1
          ? "L'edificio ha più piani. Il selettore in alto a destra sulla mappa isola un piano alla volta."
          : "Tutte le stanze sono al piano terra. Apri una stanza e usa le frecce per portarla a un altro piano."}</span>
        <div class="level-rows">${this._levels().slice().reverse().map((lv) => {
          const on = this._rooms().filter((r) => (r.level || 0) === lv);
          return `<button class="level-row ${view.active_level === lv ? "active" : ""}" data-level-pick="${lv}">
            <strong>${esc(levelName(lv))}</strong><small>${on.length} ${on.length === 1 ? "stanza" : "stanze"}</small></button>`;
        }).join("")}</div>
        ${view.active_level !== null && view.active_level !== undefined
          ? '<button class="secondary wide" data-level-pick="all">MOSTRA TUTTI I PIANI</button>' : ""}
      </div>
      <div class="section">
        <strong>CAMERA</strong>
        <label>ROTAZIONE · ${Math.round(view.yaw)}°<input type="range" min="0" max="359" step="1" data-view-prop="yaw" value="${view.yaw}"></label>
        <label>INCLINAZIONE · ${Math.round(view.pitch)}°<input type="range" min="0" max="85" step="1" data-view-prop="pitch" value="${view.pitch}"></label>
        <label>ZOOM · ${Number(view.zoom).toFixed(2)}×<input type="range" min="0.3" max="3" step="0.05" data-view-prop="zoom" value="${view.zoom}"></label>
        <label>ALTEZZA MURI · ${view.wall_height}<input type="range" min="0" max="200" step="2" data-view-prop="wall_height" value="${view.wall_height}"></label>
        <label>DISTANZA TRA I PIANI · ${view.level_gap}<input type="range" min="40" max="400" step="5" data-view-prop="level_gap" value="${view.level_gap}"></label>
        <label class="check"><input type="checkbox" data-view-prop="show_walls" ${view.show_walls ? "checked" : ""}> Mostra muri</label>
        <label class="check"><input type="checkbox" data-view-prop="show_labels" ${view.show_labels ? "checked" : ""}> Mostra nomi stanze</label>
        <label>AZIONE AL TOCCO SUI DISPOSITIVI
          <select data-view-tap>
            <option value="toggle" ${(view.tap_action || "toggle") === "toggle" ? "selected" : ""}>Accendi / spegni</option>
            <option value="more-info" ${view.tap_action === "more-info" ? "selected" : ""}>Apri i dettagli</option>
          </select>
          <span class="hint">Vale per le icone sulla mappa e per l'elenco sotto. <strong>Tenendo premuto</strong> si fa sempre l'altra cosa, così comando e dettagli restano entrambi raggiungibili senza cambiare impostazione.</span>
        </label>
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
      const w = powerWatts(id && this._hass.states[id]);
      if (w === null) return null;
      return invert ? -w : w;
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

  /**
   * Disc radius from power, in diagram units.
   *
   * Area — not radius — is proportional to the value, which is how a circle is
   * read: doubling the power doubles the ink. A floor keeps a 5 W standby load
   * from collapsing into an unreadable dot.
   */
  /**
   * Circle size for a power reading.
   *
   * Square root, because a circle is read by how much ink it has: scaling the
   * radius linearly makes a 4x load look 16x bigger.
   *
   * Two failed attempts are worth recording, because the second is the
   * interesting one.
   *
   * 1. `min + (max - min) * sqrt(...)` with min 20 and max 38. The curve was
   *    right and the RANGE was too narrow: 25 W next to 196 W came out 26 px
   *    against 38 px — near enough identical on a phone. The order of
   *    magnitude, the entire reason for drawing circles, was invisible.
   *
   * 2. Pure area-proportional, `max * sqrt(w / ref)`. Theoretically correct and
   *    worse in practice: as soon as ONE node dominates — an "unmeasured"
   *    remainder of 1.5 kW next to loads of tens of watts — every other circle
   *    lands on the legibility floor and they all become the same size again.
   *    Exactly the complaint, arrived at from the opposite direction.
   *
   * So: the sqrt curve mapped across a WIDE band. The ordering is always
   * readable and the proportion is honest within the band, which is the trade
   * every scaled-circle chart makes once a real dataset has a dominant member.
   */
  _flowRadius(watts, reference, min, max) {
    const ref = Math.max(reference, 1);
    const w = Math.max(0, watts || 0);
    return Math.round(Math.min(max, min + (max - min) * Math.sqrt(w / ref)));
  }

  /**
   * A node is HTML positioned over the SVG, not an SVG group.
   *
   * SVG cannot host <ha-icon>, and the whole point of this pass is real icons —
   * a pylon for the grid, a house for the house — instead of a bare number in a
   * ring. The SVG layer keeps only the paths and their particles.
   */
  _flowNodeHtml(x, y, slot, watts, sub, opts) {
    const o = opts || {};
    const f = fmtPower(watts);
    const r = o.radius || 34;
    const inside = !o.outside;
    const lw = o.slot ? `--lw:calc(${((o.slot / 600) * 100).toFixed(2)}cqw - 8px);` : "";
    return `<div class="ef-n ${o.cls || ""}${inside ? " inside" : ""}" style="--nc:${slot.color};--r:${r * 2}px;${lw}left:${(x / 600) * 100}%;top:${(y / o.vb) * 100}%"
        ${o.attrs || ""}>
        <span class="ef-n-lab">${esc(slot.label)}</span>
        <span class="ef-n-disc">
          <ha-icon icon="${esc(slot.icon)}"></ha-icon>
          ${inside ? `<span class="ef-n-in">${esc(f.v)}<i>${esc(f.u)}</i></span>` : ""}
        </span>
        ${inside ? "" : `<span class="ef-n-val">${esc(f.v)}<i>${esc(f.u)}</i></span>`}
        ${sub ? `<span class="ef-n-sub">${esc(sub)}</span>` : ""}
      </div>`;
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
    const w = Math.min(6, 1.6 + Math.sqrt(watts / 300));
    const dots = [];
    for (let i = 0; i < n; i++) {
      dots.push(`<circle r="4" class="ef-dot" style="--nc:${color}">
        <animateMotion dur="${dur.toFixed(2)}s" repeatCount="indefinite"
          begin="${((dur / n) * i).toFixed(2)}s"
          keyPoints="${reverse ? "1;0" : "0;1"}" keyTimes="0;1" calcMode="linear">
          <mpath href="#${id}"/></animateMotion></circle>`);
    }
    return `<path id="${id}" class="ef-path active" style="--nc:${color};stroke-width:${w.toFixed(1)}" d="${d}"/>${dots.join("")}`;
  }

  /**
   * Loads currently drawing power, biggest first, plus the unmeasured rest.
   *
   * The "Altro" node is the point of the whole sub-tree: seeing that 1.2 kW of
   * a 1.9 kW draw is unaccounted for tells you far more than a tidy list of the
   * three sockets you happen to have metered. It is only shown when the gap is
   * big enough to be real rather than rounding noise.
   */
  _flowLoads(flow, homeWatts) {
    const all = [];
    for (const d of (flow.devices || [])) {
      const st = this._hass.states[d.entity];
      if (!st) continue;
      const n = powerWatts(st);
      if (n === null || n < 1) continue;
      all.push({
        entity: d.entity,
        name: d.name || st.attributes.friendly_name || d.entity,
        icon: d.icon || autoIcon(d.entity, st),
        watts: n,
        parent: this._parentOf(d.entity, d.parent),
        children: [],
      });
    }
    // Declared vehicles join the flow on their own. A car is the single
    // largest load a house will ever have and the whole point of the diagram
    // is to show where the power goes, so requiring the wallbox to be added a
    // second time as a generic device would be busywork. If the user *has*
    // already added that sensor by hand, the vehicle is skipped rather than
    // counted twice.
    if (flow.show_vehicles !== false) {
      const already = new Set(all.map((l) => l.entity));
      for (const v of this._vehicles()) {
        if (!v.power || already.has(v.power)) continue;
        const vst = this._hass.states[v.power];
        if (!vst) continue;
        const vw = powerWatts(vst);
        if (vw === null || vw < 1) continue;
        const vs = vehicleState(v, this._hass.states);
        all.push({
          entity: v.power, name: v.name, icon: v.icon, watts: vw,
          parent: this._parentOf(v.power, v.flow_parent), children: [],
          vehicle: v, soc: vs.soc, charging: vs.charging,
        });
        already.add(v.power);
      }
    }

    // A child whose parent is not itself on the diagram cannot be drawn under
    // anything, so it silently became a root and the hierarchy looked ignored —
    // which is exactly what it looked like on screen: four loads in a row.
    //
    // If the declared parent is a real load with a power reading, it belongs on
    // the diagram: the user said this load hangs off that one, and drawing the
    // child without the parent is drawing half a fact. It is added here rather
    // than demanding the user list it twice.
    {
      const present = new Set(all.map((l) => l.entity));
      for (const l of all.slice()) {
        if (!l.parent || present.has(l.parent)) continue;
        const pst = this._hass.states[l.parent];
        const pw = pst ? powerWatts(pst) : null;
        if (pw === null) continue;
        all.push({
          entity: l.parent,
          name: pst.attributes.friendly_name || l.parent,
          icon: autoIcon(l.parent, pst),
          watts: pw,
          parent: this._parentOf(l.parent, null),
          children: [],
          implied: true,
        });
        present.add(l.parent);
      }
    }

    // A nested load is already inside its parent's reading, so only roots may
    // be summed against the house total — counting both would invent
    // consumption that does not exist and shrink "unmeasured" to nothing.
    const byId = {};
    for (const l of all) byId[l.entity] = l;
    const loads = [];
    for (const l of all) {
      const parent = l.parent && byId[l.parent];
      if (parent && parent !== l) parent.children.push(l); else loads.push(l);
    }
    for (const l of loads) l.children.sort((a, b) => b.watts - a.watts);
    loads.sort((a, b) => b.watts - a.watts);
    const measured = loads.reduce((t, l) => t + l.watts, 0);
    const rest = homeWatts - measured;
    // 5% of the house draw, floor 25 W: below that the remainder is meter
    // rounding between sensors, not a real hidden load. And with nothing
    // metered at all there is no remainder to speak of — a lone "unmeasured"
    // node would just restate the house total under a second name.
    if (loads.length && homeWatts > 0 && rest > Math.max(25, homeWatts * 0.05)) {
      loads.push({ entity: null, name: "Non misurato", icon: "mdi:help-circle-outline",
        watts: rest, other: true, children: [] });
    }
    return loads;
  }

  /**
   * Who a load hangs off, for the whole dashboard.
   *
   * The per-card `parent` still wins when it is set — an existing card keeps
   * doing exactly what it did — but when it is not, the shared map answers.
   * That is what makes "the fryer is inside the socket strip" a fact declared
   * once and honoured by both the flow diagram and the economic analysis,
   * instead of two lists that can disagree about the same wiring.
   */
  _hierarchy() {
    const h = this._dashboard && this._dashboard.hierarchy;
    return (h && typeof h === "object") ? h : {};
  }

  _parentOf(entity, declared) {
    if (declared) return declared;
    const p = this._hierarchy()[entity];
    return p && p !== entity ? p : null;
  }

  /** Record a parent for everybody, not just for the card being edited. */
  _setParent(entity, parent) {
    if (!this._dashboard) return;
    if (!this._dashboard.hierarchy || typeof this._dashboard.hierarchy !== "object") {
      this._dashboard.hierarchy = {};
    }
    const h = this._dashboard.hierarchy;
    if (!parent) { delete h[entity]; return; }
    if (parent === entity) return;
    // Walk up before accepting: a cycle makes every total uncomputable.
    let node = parent, guard = 0;
    while (node && guard++ < 20) {
      if (node === entity) return;
      node = h[node];
    }
    h[entity] = parent;
  }

  _flowSubtree(item, flow, homeWatts, precomputed, homeR) {
    const loads = precomputed || this._flowLoads(flow, homeWatts);
    if (!loads.length) {
      return { extra: 130, html: "", svg: `<text class="ef-subhint" x="300" y="440">${
        esc((flow.devices || []).length
          ? "Nessun carico sta assorbendo potenza in questo momento"
          : "Nessun carico monitorato — aggiungili nell'editor della card")}</text>` };
    }
    const n = loads.length;
    // With only two or three loads the old formula still packed them 120 units
    // apart — fine on a desktop, but the diagram is positioned in PERCENT of a
    // 600-unit viewBox, so on a 370 px phone that is 74 real pixels between two
    // discs whose labels are wider than that. They collided into
    // "Friggitrice ad ariaCantinetta". Few loads get the room they have.
    const spacing = n <= 2 ? 230 : n === 3 ? 175 : Math.min(120, 560 / n);
    const y = 476;
    const childY = 616;
    const hasChildren = loads.some((l) => l.children.length);
    const vb = 366 + (hasChildren ? 340 : 200);

    // sizes are comparable within a level, so the biggest load is visibly the
    // biggest; percentages are gone because the geometry already says it
    const refRoot = Math.max(...loads.map((l) => l.watts), 1);
    const svg = [];
    const html = [];

    loads.forEach((l, i) => {
      const x = Math.round(300 + (i - (n - 1) / 2) * spacing);
      const color = l.other ? "#8d99ae" : l.vehicle ? (l.vehicle.color || "#06d6a0") : "#00e5ff";
      const r = this._flowRadius(l.watts, refRoot, 12, 42);
      svg.push(this._flowPath("ef-l" + i,
        `M300,${322 + (homeR || 0)} C300,${390 + (homeR || 0)} ${x},${y - 74} ${x},${y - r - 5}`,
        l.watts, color, false));
      html.push(this._flowNodeHtml(x, y,
        { label: l.name, icon: l.icon, color },
        l.watts,
        // The car's sub-line is its state of charge: "3.6 kW" and "62% and
        // climbing" answer different questions, and on a car it is the second
        // one that decides whether you can leave.
        l.vehicle && l.soc !== null ? Math.round(l.soc) + "%" + (l.charging ? " ⚡" : "") : null,
        { vb, radius: r, outside: true, slot: spacing,
          cls: "leaf" + (l.other ? " other" : "") + (l.vehicle ? " ev" + (l.charging ? " charging" : "") : ""),
          attrs: l.entity ? `data-fp-badge="${esc(l.entity)}"` : "" }));

      const cn = l.children.length;
      if (!cn) return;
      const refChild = Math.max(...l.children.map((c) => c.watts), 1);
      l.children.forEach((c, j) => {
        const cx = Math.round(x + (j - (cn - 1) / 2) * Math.min(cn <= 2 ? 150 : 88, spacing));
        svg.push(this._flowPath("ef-c" + i + "-" + j,
          `M${x},${y + r + 4} C${x},${y + 84} ${cx},${childY - 84} ${cx},${childY - 32}`,
          c.watts, "#7de2ff", false));
        html.push(this._flowNodeHtml(cx, childY,
          { label: c.name, icon: c.icon, color: "#7de2ff" },
          c.watts, null,
          { vb, radius: this._flowRadius(c.watts, refChild, 10, 30), outside: true,
            slot: Math.min(cn <= 2 ? 150 : 88, spacing), cls: "leaf child",
            attrs: c.entity ? `data-fp-badge="${esc(c.entity)}"` : "" }));
      });
    });
    return { extra: hasChildren ? 340 : 200, svg: svg.join(""), html: html.join("") };
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
    const open = !!this._flowOpen[item.id];
    const loads = this._flowLoads(flow, v.home);
    const sub = open ? this._flowSubtree(item, flow, v.home, loads,
      this._flowRadius(v.home, Math.max(v.solar, Math.abs(v.grid || 0), Math.abs(v.batt || 0), v.home, 1), 30, 52) - 34)
      : { extra: 0, svg: "", html: "" };
    const vb = 366 + sub.extra;

    // one reference for every main node, so their sizes are comparable
    const ref = Math.max(v.solar, Math.abs(v.grid || 0), Math.abs(v.batt || 0), v.home, 1);
    const R = (w) => this._flowRadius(w, ref, 30, 52);

    const solarNode = v.hasSolar
      ? this._flowNodeHtml(300, 62, S.solar, v.solar, null, { vb, radius: R(v.solar) }) : "";
    const gridNode = v.hasGrid
      ? this._flowNodeHtml(78, 182, S.grid, Math.abs(v.grid || 0),
          v.gridOut > 0 ? "immissione" : "prelievo",
          { vb, radius: R(Math.abs(v.grid || 0)), cls: v.gridOut > 0 ? "export" : "" }) : "";
    const battNode = v.hasBattery
      ? this._flowNodeHtml(522, 182, S.battery, Math.abs(v.batt || 0),
          v.battIn > 0 ? "in carica" : "in scarica",
          { vb, radius: R(Math.abs(v.batt || 0)) }) : "";
    const homeNode = this._flowNodeHtml(300, 286, S.home, v.home,
      open ? "chiudi" : loads.length ? loads.length + " carichi" : "dettaglio",
      { vb, radius: R(v.home), cls: "home" + (open ? " open" : ""),
        attrs: `data-flow-toggle="${esc(item.id)}" role="button" tabindex="0"` });

    // Paths stop at the discs instead of running to their centres, so a
    // connection never crosses the label or the reading of the node it joins.
    const rSolar = R(v.solar), rGrid = R(Math.abs(v.grid || 0)),
          rBatt = R(Math.abs(v.batt || 0)), rHome = R(v.home);
    const link = (ax, ay, ra, bx, by, rb, bend) => {
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const x1 = ax + ux * (ra + 5), y1 = ay + uy * (ra + 5);
      const x2 = bx - ux * (rb + 5), y2 = by - uy * (rb + 5);
      if (!bend) return `M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${(mx + (x2 - x1) * 0.12).toFixed(1)},${(my + 26).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    };
    const paths = [
      v.hasSolar ? this._flowPath("ef-s-h", link(300, 62, rSolar, 300, 286, rHome, false),
        v.solar - v.gridOut, S.solar.color, false) : "",
      v.hasGrid ? this._flowPath("ef-g-h", link(78, 182, rGrid, 300, 286, rHome, true),
        v.gridIn || v.gridOut, S.grid.color, v.gridOut > 0) : "",
      v.hasBattery ? this._flowPath("ef-b-h", link(522, 182, rBatt, 300, 286, rHome, true),
        v.battOut || v.battIn, S.battery.color, v.battIn > 0) : "",
    ].join("");

    const devices = (flow.devices || []).map((d) => {
      const st = this._hass.states[d.entity];
      const n = powerWatts(st);
      const f = fmtPower(n);
      const share = v.home > 0 && n !== null ? Math.min(100, (n / v.home) * 100) : 0;
      return `<div class="ef-dev" data-fp-badge="${esc(d.entity)}">
          <ha-icon icon="${esc(d.icon || autoIcon(d.entity, st || { attributes: {} }))}"></ha-icon>
          <div class="ef-dev-text">
            <span>${esc(d.name || (st && st.attributes.friendly_name) || d.entity)}</span>
            <div class="ef-dev-bar"><i style="width:${share.toFixed(1)}%"></i></div>
          </div>
          <strong>${esc(f.v)}<small>${esc(f.u)}</small></strong>
        </div>`;
    }).join("");

    return `<div class="ef${open ? " open" : ""}">
        <div class="ef-stage" style="aspect-ratio:600/${vb}">
          <svg class="ef-svg" viewBox="0 0 600 ${vb}" preserveAspectRatio="none">
            ${paths}${sub.svg}
          </svg>
          <div class="ef-nodes">${solarNode}${gridNode}${battNode}${homeNode}${sub.html}</div>
        </div>
        ${devices && !open ? `<div class="ef-devs">${devices}</div>` : ""}
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

  /**
   * A device row that obeys the card's chosen tap action.
   *
   * The rows used to be hard-wired to "toggle", so a card configured with
   * *Apri i dettagli* still flipped the switch — you could never inspect a
   * relay without operating it, which on a boiler or a gate is not a cosmetic
   * problem. Now the row body does what the card says, and the icon always
   * does the other thing, so both are one tap away whichever way it is set.
   */
  _deviceRow(id, st, on, cls, item) {
    // Something that cannot be switched gets no switch. The row opens the
    // details and the companion icon-button disappears entirely, because an
    // icon that looks like a command and does nothing is worse than no icon:
    // it teaches the user that the dashboard is broken.
    if (!canToggle(id, st)) {
      return `<div class="${cls}${on ? " on" : ""} info plain" role="button" tabindex="0"
          data-more-info="${esc(id)}">
        <ha-icon class="act-icon-flat" icon="${esc(autoIcon(id, st))}"></ha-icon>
        <span>${esc(st.attributes.friendly_name || id)}</span>
        <small>${esc(entityWords(id, st))}</small>
      </div>`;
    }
    const toggleFirst = (item.row_action || "toggle") === "toggle";
    return `<div class="${cls}${on ? " on" : ""}${toggleFirst ? "" : " info"}" role="button" tabindex="0"
        ${toggleFirst ? `data-toggle-entity="${esc(id)}"` : `data-more-info="${esc(id)}"`}>
      <button class="act-icon" data-row-act="${esc(id)}" title="${toggleFirst ? "Apri i dettagli" : "Accendi / spegni"}">
        <ha-icon icon="${esc(autoIcon(id, st))}"></ha-icon>
      </button>
      <span>${esc(st.attributes.friendly_name || id)}</span>
      <small>${esc(stateWords(st.state, st.attributes.device_class))}</small>
    </div>`;
  }

  /**
   * Per-entity include/exclude for "attivi ora".
   *
   * Domain filters were not enough: an IR illuminator, a camera's "silent
   * mode" and a panel light are all `switch` entities that are genuinely on,
   * and they crowd out the things that matter. Listing everything the card
   * *could* show — including what is currently off, so it can be excluded
   * before it next comes on — turns this into one pass instead of a game of
   * whack-a-mole every time something switches.
   *
   * Grouped by device, with a bulk toggle, because that noise always arrives a
   * whole device at a time.
   */
  _activeExcludeEditor(card) {
    const exclude = new Set(card.exclude || []);
    const include = Array.isArray(card.domains) && card.domains.length
      ? card.domains : Object.keys(ACTIVE_DOMAINS);
    const reg = this._registry || {};
    const candidates = Object.keys(this._hass.states).filter((id) => {
      const d = domainOf(id);
      if (!ACTIVE_DOMAINS[d] || !include.includes(d)) return false;
      const st = this._hass.states[id];
      return st.state !== "unavailable" && st.state !== "unknown";
    });
    if (!candidates.length) return '<div class="entity-result-empty">Nessun dispositivo compatibile.</div>';

    const groups = new Map();
    for (const id of candidates) {
      const dev = (reg.entityDevice || {})[id];
      const key = dev || "__solo";
      const label = dev ? ((reg.deviceName || {})[dev] || "Dispositivo") : "Senza dispositivo";
      if (!groups.has(key)) groups.set(key, { label, ids: [] });
      groups.get(key).ids.push(id);
    }
    const rows = Array.from(groups.values())
      .sort((a, b) => (b.ids.length - a.ids.length) || a.label.localeCompare(b.label));
    const shownCount = candidates.filter((id) => !exclude.has(id)).length;

    return `<div class="room-vis-head">
        <span>${shownCount} visibili su ${candidates.length}</span>
        <button class="mini" data-active-vis-all><ha-icon icon="mdi:eye"></ha-icon> MOSTRA TUTTI</button>
      </div>
      <div class="room-entities" data-keep-scroll="active-exclude">
        ${rows.map((g) => {
          const allHidden = g.ids.every((id) => exclude.has(id));
          return `${g.ids.length > 1 ? `<div class="dev-group-head">
              <strong>${esc(g.label)}</strong>
              <button class="mini" data-active-dev="${esc(g.ids.join("|"))}" title="${allHidden ? "Mostra tutto il dispositivo" : "Nascondi tutto il dispositivo"}">
                <ha-icon icon="${allHidden ? "mdi:eye" : "mdi:eye-off"}"></ha-icon></button>
            </div>` : ""}
            ${g.ids.map((id) => {
              const st = this._hass.states[id];
              const shown = !exclude.has(id);
              const on = ON_STATES.has(st.state);
              return `<div class="room-ent${shown ? "" : " hidden"}">
                <ha-icon icon="${esc(autoIcon(id, st))}"></ha-icon>
                <span>${esc(st.attributes.friendly_name || id)}</span>
                ${on ? '<em class="room-ent-pos" title="Acceso adesso">●</em>' : ""}
                <button class="mini" data-active-vis="${esc(id)}" title="${shown ? "Nascondi" : "Mostra"}">
                  <ha-icon icon="${shown ? "mdi:eye" : "mdi:eye-off"}"></ha-icon></button>
              </div>`;
            }).join("")}`;
        }).join("")}
      </div>`;
  }

  /** Toggle through a service the entity's domain actually has. */
  _toggleEntity(id) {
    const d = domainOf(id);
    const sd = ["light", "switch", "fan", "media_player", "input_boolean",
                "cover", "siren", "humidifier"].includes(d) ? d : "homeassistant";
    this._hass.callService(sd, "toggle", { entity_id: id });
  }

  /** Area of an entity, from the registry, or "" when it has none. */
  _areaOf(entityId) {
    return (this._registry && this._registry.entityArea && this._registry.entityArea[entityId]) || "";
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
      // Date.parse(0) is NOT 0: the number is coerced to the string "0",
      // which parses as the year 2000, so an entity with no last_changed
      // rendered as "on for 9731 days". Guard the missing value explicitly.
      const changed = st.last_changed ? Date.parse(st.last_changed) : NaN;
      out.push({ id, st, since: Number.isFinite(changed) ? changed : 0 });
    }
    out.sort((a, b) => b.since - a.since);
    return out;
  }

  /** The same list, split into the groups a person actually thinks in. */
  _activeGroups(item) {
    const rows = this._activeEntities(item);
    const buckets = new Map();
    for (const r of rows) {
      const g = ACTIVE_GROUP_OF[domainOf(r.id)];
      if (!g) continue;
      if (!buckets.has(g.k)) buckets.set(g.k, { group: g, rows: [] });
      buckets.get(g.k).rows.push(r);
    }
    // Fixed order, not insertion order: the card must not reshuffle its
    // sections every time a different device happens to switch on first.
    return ACTIVE_GROUPS.map((g) => buckets.get(g.k)).filter(Boolean);
  }

  /**
   * "Attivi ora".
   *
   * Every row answers three questions the old flat list left open: what is it,
   * *where* is it, and *since when*. Without the area a row named "Faretti"
   * means nothing in a house with four sets of them, and without the elapsed
   * time there is no way to tell "someone is in there" from "nobody turned it
   * off this morning".
   */
  _activeBody(item) {
    if (!this._registry && !this._registryLoading) this._loadRegistry();
    const groups = this._activeGroups(item);
    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    if (!total) {
      return `<div class="ov-empty ok"><ha-icon icon="mdi:power-sleep"></ha-icon>
        <span>Niente acceso in questo momento.</span></div>`;
    }
    const cap = item.max || 8;
    const now = Date.now();
    const perGroup = Math.max(2, Math.ceil(cap / Math.max(1, groups.length)) + 1);

    const summary = `<div class="act-head">
        <div class="act-count"><strong>${total}</strong><span>attiv${total === 1 ? "o" : "i"}</span></div>
        <div class="act-chips">${groups.map((g) => `
          <span class="act-chip" style="--gc:${esc(g.group.color)}" title="${esc(g.group.l)}">
            <ha-icon icon="${esc(g.group.icon)}"></ha-icon>${g.rows.length}</span>`).join("")}</div>
      </div>`;

    const body = groups.map((g) => {
      const shown = g.rows.slice(0, perGroup);
      const hidden = g.rows.length - shown.length;
      return `<section class="act-group" style="--gc:${esc(g.group.color)}">
        <header>
          <ha-icon icon="${esc(g.group.icon)}"></ha-icon>
          <strong>${esc(g.group.l)}</strong>
          <em>${g.rows.length}</em>
          ${g.group.off ? `<button class="act-off" data-act-off="${esc(g.group.k)}" data-act-card="${esc(item.id || "")}" title="Spegni tutto in questo gruppo"><ha-icon icon="mdi:power"></ha-icon></button>` : ""}
        </header>
        ${shown.map((r) => {
          const area = this._areaOf(r.id);
          const name = String(r.st.attributes.friendly_name || r.id).trim();
          const act = (item.row_action || "toggle") === "toggle";
          return `<div class="act-row${g.group.alert ? " alert" : ""}${act ? "" : " info"}"
              ${act ? `data-toggle-entity="${esc(r.id)}"` : `data-more-info="${esc(r.id)}"`} role="button" tabindex="0">
            <button class="act-icon" data-row-act="${esc(r.id)}" title="${act ? "Apri i dettagli" : "Accendi / spegni"}">
              <ha-icon icon="${esc(autoIcon(r.id, r.st))}"></ha-icon>
            </button>
            <div class="act-txt">
              <strong>${esc(name)}</strong>
              <small>${esc([area, g.group.detail(r.st)].filter(Boolean).join(" · "))}</small>
            </div>
            <span class="act-since">${esc(sinceWords(r.since, now))}</span>
          </div>`;
        }).join("")}
        ${hidden > 0 ? `<div class="act-more">+${hidden} altr${hidden === 1 ? "o" : "i"}</div>` : ""}
      </section>`;
    }).join("");

    return `<div class="act">${summary}${body}</div>`;
  }

  /**
   * Avvisi.
   *
   * Three sources in one list, because that is how a person experiences them:
   *  - persistent notifications, the only thing Home Assistant itself keeps;
   *  - pending updates;
   *  - and everything Cyborg has seen leave the house — Telegram above all —
   *    which Home Assistant does not record anywhere. That log lives in the
   *    integration (core/notifications.py) and is pushed here live.
   */
  _notificationsBody(item) {
    this._subscribe("notif", { type: "persistent_notification/subscribe" }, (ev) => {
      this._notifs = this._notifs || {};
      if (!ev) return;
      if (ev.type === "current" || ev.type === "added") Object.assign(this._notifs, ev.notifications || {});
      if (ev.type === "removed") for (const k of Object.keys(ev.notifications || {})) delete this._notifs[k];
      this._touch(true);
    });

    const wantSent = item.show_sent !== false;
    if (wantSent) this._loadSentNotifications();

    const notifs = Object.entries(this._notifs || {});
    const updates = item.show_updates === false ? [] : Object.keys(this._hass.states)
      .filter((id) => id.startsWith("update.") && this._hass.states[id].state === "on")
      .map((id) => this._hass.states[id]);
    const all = wantSent ? (this._sentNotifs || []) : [];
    const unread = all.filter((n) => !n.read).length;
    const onlyUnread = this._notifFilter === "unread";
    const sent = onlyUnread ? all.filter((n) => !n.read) : all;
    const now = Date.now();
    const cap = item.max || 8;

    if (!notifs.length && !updates.length && !all.length) {
      return `<div class="ov-empty ok"><ha-icon icon="mdi:check-circle-outline"></ha-icon>
        <span>${this._sentPending && wantSent
          ? "Lettura degli avvisi..."
          : "Nessun avviso. Sistema in ordine."}</span></div>`;
    }

    // Persistent notifications belong to Home Assistant, not to this log, so
    // there is nothing here to mark as read: the only meaningful action is
    // dismissing them, which is exactly what the core service does.
    const persistentRows = notifs.map(([key, n]) => `<div class="notif-row" style="--nc:#ffd166">
        <ha-icon icon="mdi:bell-ring-outline"></ha-icon>
        <div class="notif-txt"><strong>${esc(n.title || "Notifica")}</strong>
          <small>${esc(String(n.message || "").slice(0, 180))}</small></div>
        <span class="notif-when">${esc(agoWords(n.created_at, now))}</span>
        <button class="notif-x" data-notif-dismiss="${esc(n.notification_id || key)}" title="Elimina"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>`).join("");

    const sentRows = sent.slice(0, cap).map((n) => {
      const ch = notifChannel(n.channel);
      const inbound = n.source === "received";
      return `<div class="notif-row${inbound ? " in" : ""}${n.read ? " read" : " unread"}" style="--nc:${esc(ch.color)}">
        <ha-icon icon="${esc(inbound ? "mdi:message-reply-text" : ch.icon)}"></ha-icon>
        <div class="notif-txt" data-notif-read="${esc(n.id)}" data-read="${n.read ? "1" : "0"}"
             title="${n.read ? "Segna come da leggere" : "Segna come letto"}">
          <strong>${n.read ? "" : '<i class="notif-dot"></i>'}${esc(n.title || (inbound ? "Messaggio ricevuto" : n.channel_label || ch.l))}</strong>
          <small>${esc(String(n.message || "").slice(0, 180))}</small>
          <em>${esc(inbound ? "ricevuto da " + (n.channel_label || ch.l) : "inviato via " + (n.channel_label || ch.l))}</em>
        </div>
        <span class="notif-when">${esc(agoWords(n.ts, now))}</span>
        <button class="notif-x" data-notif-del="${esc(n.id)}" title="Elimina questo avviso"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>`;
    }).join("");

    const updateRow = updates.length ? `<div class="notif-row upd" style="--nc:#8ecae6">
        <ha-icon icon="mdi:package-up"></ha-icon>
        <div class="notif-txt"><strong>${updates.length} aggiornament${updates.length === 1 ? "o" : "i"} disponibil${updates.length === 1 ? "e" : "i"}</strong>
          <small>${esc(updates.slice(0, 3).map((u) => u.attributes.friendly_name || "").join(" · "))}</small></div>
      </div>` : "";

    const bar = all.length ? `<div class="notif-bar">
        <div class="cf-chips">
          <button class="${onlyUnread ? "" : "on"}" data-notif-filter="">TUTTE · ${all.length}</button>
          <button class="${onlyUnread ? "on" : ""}" data-notif-filter="unread">DA LEGGERE · ${unread}</button>
        </div>
        <span class="notif-acts">
          ${unread ? '<button class="mini" data-notif-readall><ha-icon icon="mdi:email-open-outline"></ha-icon> SEGNA TUTTI LETTI</button>' : ""}
          ${all.length - unread ? '<button class="mini" data-notif-purge title="Elimina solo quelli già letti"><ha-icon icon="mdi:broom"></ha-icon> PULISCI I LETTI</button>' : ""}
        </span>
      </div>` : "";

    const empty = all.length && !sent.length
      ? `<div class="ov-empty ok"><ha-icon icon="mdi:check-circle-outline"></ha-icon><span>Nessun avviso da leggere.</span></div>` : "";

    const more = sent.length > cap
      ? `<div class="act-more">+${sent.length - cap} avvisi più vecchi</div>` : "";

    return `<div class="notif">${bar}${persistentRows}${updateRow}${sentRows}${empty}${more}</div>`;
  }

  /**
   * Pull the sent-notification log once, then keep it live over a push
   * subscription. Polling would either lag behind an alarm or hammer the
   * websocket; the backend already knows the moment a message goes out.
   */
  _loadSentNotifications() {
    if (this._sentNotifs || this._sentPending) return;
    this._sentPending = true;
    this._hass.callWS({ type: "cyborg_dashboard/notifications", limit: 60 })
      .then((res) => {
        this._sentNotifs = (res && res.notifications) || [];
        this._sentPending = false;
        this._subscribe("sent", { type: "cyborg_dashboard/notifications/subscribe" }, (ev) => {
          if (!ev) return;
          // Two shapes on one channel: a new alert, or "somebody changed the
          // list somewhere else" — read on the phone, deleted on the tablet.
          if (ev.reload) { this._refetchNotifications(); return; }
          if (!ev.notification) return;
          this._sentNotifs = [ev.notification].concat(this._sentNotifs || []).slice(0, 120);
          this._touch(true);
        });
        this._touch(true);
      })
      .catch(() => {
        // An older integration without the log must not blank the card: the
        // persistent notifications and updates still render.
        this._sentNotifs = [];
        this._sentPending = false;
        this._touch(true);
      });
  }

  /** Re-read the log after it changed on the server. */
  _refetchNotifications() {
    this._hass.callWS({ type: "cyborg_dashboard/notifications", limit: 60 })
      .then((res) => { this._sentNotifs = (res && res.notifications) || []; this._touch(true); })
      .catch(() => { /* the card keeps what it has rather than blanking */ });
  }

  /**
   * Read state and deletions go to the server, never to localStorage.
   *
   * An alert read on the phone must be read on the wall tablet too, and it
   * must survive a browser that clears its storage. Keeping the flag next to
   * the alert itself is the only version where two screens cannot disagree.
   *
   * The local copy is updated immediately so the row responds under the
   * finger, and the server's broadcast refetch then makes it authoritative:
   * an optimistic paint that a failed call would leave lying is corrected
   * within one round trip.
   */
  _notifRead(ids, read) {
    const set = new Set(ids || []);
    for (const n of this._sentNotifs || []) {
      if (!ids || set.has(n.id)) n.read = read;
    }
    this._touch(true);
    this._hass.callWS({ type: "cyborg_dashboard/notifications/read", ids: ids || null, read })
      .catch(() => this._refetchNotifications());
  }

  _notifDelete(ids, readOnly) {
    const set = new Set(ids || []);
    this._sentNotifs = (this._sentNotifs || []).filter((n) =>
      !(ids ? set.has(n.id) : (readOnly && n.read)));
    this._touch(true);
    this._hass.callWS({ type: "cyborg_dashboard/notifications/delete",
      ids: ids || null, read_only: !!readOnly })
      .catch(() => this._refetchNotifications());
  }

  // ----------------------------------------------- controllo temperatura ---

  /** Climate entities of this card: the chosen ones, or every one there is. */
  _thermoUnits(item) {
    const chosen = Array.isArray(item.units) && item.units.length ? item.units : null;
    const all = Object.keys(this._hass.states).filter((id) => domainOf(id) === "climate");
    return (chosen || all).filter((id) => this._hass.states[id]);
  }

  /**
   * The switches that suspend the automations.
   *
   * These are not devices, they are a MODE of the installation: with
   * "automazioni disattivate" on, everything else in the house stops deciding
   * for you. That deserves its own row at the top of the card with a plain
   * sentence, not to be buried among the switches in some room — which is
   * where it lives today, indistinguishable from a socket.
   */
  /**
   * The suspension switches ARE the ones the user chose. Nothing else.
   *
   * This used to fall back to a name search, and a name search is a guess about
   * meaning made from a string. It put "Scale - Override Manuale" — a lighting
   * override for the staircase — into a climate card, because the word
   * "Manuale" appears in it. A domain is a fact; a name is an opinion. Guessing
   * from a domain is fine, guessing from a name is not allowed to decide
   * anything on its own: it may only SUGGEST, in the editor, where the user
   * accepts it with one click.
   */
  _thermoManual(item) {
    const list = Array.isArray(item.manual) ? item.manual : [];
    return list.filter((id) => this._hass.states[id]);
  }

  /** Candidates offered in the editor. Never applied without a click. */
  _thermoManualHints(item) {
    const already = new Set(this._thermoManual(item));
    return Object.keys(this._hass.states).filter((id) => {
      const d = domainOf(id);
      if (d !== "input_boolean" && d !== "switch") return false;
      if (already.has(id)) return false;
      const st = this._hass.states[id];
      // The object_id, not the whole entity_id: testing the full id makes every
      // automation.* entity match, because the domain name contains the word.
      return MANUAL_RE.test(id.split(".")[1] + " " + (st.attributes.friendly_name || ""));
    }).slice(0, 6);
  }

  /**
   * The order of the blocks inside the card, decided by the user.
   *
   * A card is not a fixed template: where the suspension row sits relative to
   * the units, and which unit comes first, are the user's call — the
   * suspension may be the first thing you look at in one house and a footnote
   * in another. `order` is a list of block keys ("manual", or an entity id);
   * anything not listed keeps its natural position at the end, so adding a
   * unit later never needs the order to be rewritten.
   */
  _thermoBlocks(item) {
    const units = this._thermoUnits(item);
    const manual = item.show_manual === false ? [] : this._thermoManual(item);
    const keys = (manual.length ? ["manual"] : []).concat(units);
    const wanted = Array.isArray(item.order) ? item.order.filter((k) => keys.includes(k)) : [];
    return wanted.concat(keys.filter((k) => !wanted.includes(k)));
  }

  _thermostatBody(item) {
    const units = this._thermoUnits(item);
    const manual = item.show_manual === false ? [] : this._thermoManual(item);

    if (!units.length && !manual.length) {
      return `<div class="ov-empty"><ha-icon icon="mdi:thermostat-box"></ha-icon>
        <span>${manual.length || this._thermoUnits({}).length
          ? "Nessun blocco da mostrare."
          : "Nessun termostato o condizionatore in Home Assistant."}</span></div>`;
    }

    const manualOn = manual.filter((id) => ON_STATES.has(this._hass.states[id].state));
    const manualRows = manual.length ? `<div class="th-manual ${manualOn.length ? "on" : ""}">
        ${manual.map((id) => {
          const st = this._hass.states[id];
          const on = ON_STATES.has(st.state);
          return `<button class="th-man-row ${on ? "on" : ""}" data-toggle-entity="${esc(id)}">
            <ha-icon icon="${esc(on ? "mdi:hand-back-right" : "mdi:robot")}"></ha-icon>
            <span><strong>${esc(st.attributes.friendly_name || id)}</strong>
              <small>${esc(on ? "le automazioni NON intervengono" : "le automazioni sono attive")}</small></span>
            <i class="th-sw ${on ? "on" : ""}"></i>
          </button>`;
        }).join("")}
      </div>` : "";

    // One flow, not "the suspension row and then a grid of units": the grid was
    // what made the suspension row structurally unmovable.
    const cols = item.columns === "1" ? "one" : item.columns === "2" ? "two" : "";
    const blocks = this._thermoBlocks(item).map((key) => key === "manual"
      ? `<div class="th-block manual">${manualRows}</div>`
      : `<div class="th-block">${this._thermoUnit(key, item)}</div>`).join("");
    return `<div class="th"><div class="th-grid ${esc(cols)}">${blocks}</div></div>`;
  }

  /** One unit: state, current reading, setpoint, and only the controls it has. */
  _thermoUnit(id, item) {
    const st = this._hass.states[id];
    const a = st.attributes || {};
    const f = Number(a.supported_features) || 0;
    const has = (bit) => (f & bit) === bit;
    const mode = st.state;
    const on = mode !== "off" && mode !== "unavailable";
    const color = HVAC_COLORS[mode] || "#8ea3b8";

    if (st.state === "unavailable") {
      return `<div class="th-unit off"><div class="th-head">
        <ha-icon icon="mdi:thermostat-box"></ha-icon>
        <strong>${esc(a.friendly_name || id)}</strong></div>
        <div class="th-na">Non raggiungibile</div></div>`;
    }

    const cur = a.current_temperature;
    const target = a.temperature;
    // Bounds and step come from the entity. One unit here runs 8-30 in whole
    // degrees, the other 1-7 in halves: any hardcoded range breaks one of them.
    const step = Number(a.target_temp_step) || 0.5;
    const lo = Number(a.min_temp);
    const hi = Number(a.max_temp);
    // Adjustable even while the unit is off. Locking the setpoint on a stopped
    // unit was an invention of this card: `supported_features` declares
    // TARGET_TEMPERATURE, and says nothing about "only while running". Setting
    // the target first and then switching on is a normal way to use a
    // thermostat, and forbidding it is the same class of mistake as offering a
    // control that does nothing — just in the opposite direction.
    //
    // Number.isFinite and not `!== undefined`: a stopped unit reports
    // `temperature: null`, and Number(null) is 0 — so the card was showing a
    // confident "0 °C impostata" for a setpoint that does not exist.
    const canSet = has(CLIMATE_F.TARGET_TEMP) && num(target) !== null;
    const decimals = step < 1 ? 1 : 0;

    const modes = (a.hvac_modes || []).filter((m) => m !== "off");
    const fanModes = has(CLIMATE_F.FAN) ? (a.fan_modes || []) : [];
    const presets = has(CLIMATE_F.PRESET) ? (a.preset_modes || []) : [];
    const swings = has(CLIMATE_F.SWING) ? (a.swing_modes || []) : [];

    const picker = (label, key, list, value) => list.length ? `<label class="th-pick">${esc(label)}
        <select data-thermo-set="${esc(id)}|${esc(key)}">
          ${list.map((v) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(String(v).replace(/_/g, " "))}</option>`).join("")}
        </select></label>` : "";

    return `<div class="th-unit ${on ? "on" : "off"}" style="--th:${esc(color)}">
      <div class="th-head">
        <ha-icon icon="${esc(HVAC_ICONS[mode] || "mdi:thermostat-box")}"></ha-icon>
        <div class="th-name"><strong>${esc(a.friendly_name || id)}</strong>
          <small>${esc(hvacWords(mode))}${num(cur) !== null ? " · ora " + esc(String(num(cur))) + "°" : ""}</small></div>
        ${has(CLIMATE_F.TURN_ON) || has(CLIMATE_F.TURN_OFF)
          ? `<button class="th-power ${on ? "on" : ""}" data-thermo-power="${esc(id)}"
               title="${on ? "Spegni" : "Accendi"}"><ha-icon icon="mdi:power"></ha-icon></button>` : ""}
      </div>
      ${canSet ? `<div class="th-set">
        <button class="th-step" data-thermo-step="${esc(id)}|-1"><ha-icon icon="mdi:minus"></ha-icon></button>
        <div class="th-val"><strong>${esc(Number(target).toFixed(decimals))}</strong><i>°C</i>
          <small>${esc(on ? "impostata" : "impostata · unità spenta")}</small></div>
        <button class="th-step" data-thermo-step="${esc(id)}|1"><ha-icon icon="mdi:plus"></ha-icon></button>
      </div>
      <input class="th-range" type="range" min="${Number.isFinite(lo) ? lo : 5}" max="${Number.isFinite(hi) ? hi : 35}"
        step="${step}" value="${esc(String(target))}" data-thermo-temp="${esc(id)}">` : ""}
      ${!canSet && has(CLIMATE_F.TARGET_TEMP)
        ? `<div class="th-noset">Nessuna temperatura impostata: l'unità non ne riporta una in questo stato.</div>` : ""}
      ${modes.length ? `<div class="th-modes">
        ${modes.map((m) => `<button class="th-mode ${m === mode ? "on" : ""}" data-thermo-mode="${esc(id)}|${esc(m)}"
            style="--tm:${esc(HVAC_COLORS[m] || "#8ea3b8")}" title="${esc(hvacWords(m))}">
          <ha-icon icon="${esc(HVAC_ICONS[m] || "mdi:tune")}"></ha-icon><span>${esc(hvacWords(m))}</span>
        </button>`).join("")}
      </div>` : ""}
      ${item.show_extras === false ? "" : `<div class="th-extras">
        ${picker("Ventola", "fan_mode", fanModes, a.fan_mode)}
        ${picker("Programma", "preset_mode", presets, a.preset_mode)}
        ${picker("Flusso", "swing_mode", swings, a.swing_mode)}
      </div>`}
    </div>`;
  }

  /**
   * Setpoint changes are debounced.
   *
   * Dragging the slider fires an event per pixel. Sending each one to an air
   * conditioner over the network floods it and, on several units, makes it
   * ignore the whole burst — the temperature then snaps back and it reads as
   * "the dashboard does not work". Only the value the finger stopped on is
   * sent.
   */
  _thermoTemp(id, value) {
    const st = this._hass.states[id];
    if (!st) return;
    const a = st.attributes || {};
    const lo = num(a.min_temp) ?? 5;
    const hi = num(a.max_temp) ?? 35;
    const step = Number(a.target_temp_step) || 0.5;
    const clamped = Math.max(lo, Math.min(hi, Math.round(value / step) * step));
    // Optimistic paint so the number follows the thumb, corrected by the next
    // state update from Home Assistant.
    a.temperature = clamped;
    this._signature = "";
    this.render();
    clearTimeout(this._thermoTimer);
    this._thermoTimer = setTimeout(() => {
      this._hass.callService("climate", "set_temperature",
        { entity_id: id, temperature: clamped });
    }, 320);
  }

  // ------------------------------------------------------------ allarme ---

  /**
   * The alarm panel, drawn from what the panel itself declares.
   *
   * Buttons come from `supported_features`, so a panel that only knows "in
   * casa" and "fuori casa" shows exactly two — no dead controls, and no
   * missing mode on a panel that has more. When the panel asks for a code
   * (`code_format`, or `code_arm_required`) the keypad appears; without it the
   * arm call would simply be refused with nothing on screen to explain why.
   */
  _alarmBody(item, st) {
    if (!st) {
      return `<div class="ov-empty"><ha-icon icon="mdi:shield-off-outline"></ha-icon>
        <span>Centrale non disponibile.</span></div>`;
    }
    const state = st.state;
    const attrs = st.attributes || {};
    const feats = Number(attrs.supported_features) || 0;
    const phase = alarmPhase(state);
    const color = ALARM_PHASE_COLOR[phase];
    const modes = ALARM_MODES.filter((m) => (feats & m.bit) === m.bit);
    const armed = phase === "armed" || phase === "fire";
    const moving = phase === "moving";
    const id = item.entity_id;

    const needsCode = !!attrs.code_format
      || (attrs.code_arm_required === true && !armed);
    const codeVal = (this._alarmCode || {})[id] || "";
    // A numeric keypad for a numeric code: `code_format` is "number" or
    // "text", and asking for a text keyboard on a 4-digit PIN is a small
    // insult on a phone.
    const numeric = attrs.code_format === "number";

    const changed = attrs.changed_by
      ? `<span class="al-by">ultima modifica · ${esc(attrs.changed_by)}</span>` : "";

    const head = `<div class="al-head ${esc(phase)}" style="--al:${esc(color)}">
        <ha-icon icon="${esc(phase === "fire" ? "mdi:alarm-light"
          : armed ? "mdi:shield-lock" : moving ? "mdi:timer-sand" : "mdi:shield-off-outline")}"></ha-icon>
        <div class="al-txt">
          <strong>${esc(stateWords(state, null))}</strong>
          <small>${esc(phase === "fire" ? "Allarme in corso"
            : moving ? "Conto alla rovescia in corso"
            : armed ? "Sorveglianza attiva" : "Nessuna sorveglianza")}</small>
        </div>
      </div>`;

    if (!modes.length) {
      return `${head}<div class="al-note">Questa centrale non dichiara nessuna modalità di attivazione.</div>`;
    }

    const keypad = needsCode ? `<label class="al-code">CODICE
        <input type="${numeric ? "tel" : "password"}" inputmode="${numeric ? "numeric" : "text"}"
          autocomplete="off" data-alarm-code="${esc(id)}" value="${esc(codeVal)}"
          placeholder="${esc(numeric ? "••••" : "codice")}">
      </label>` : "";

    // Disarm first when armed: in a hurry, with the siren going, the button
    // you need must be the one under your thumb, not the fourth in a row.
    const disarm = `<button class="al-btn off ${armed || moving ? "primary" : ""}"
        data-alarm-act="${esc(id)}|alarm_disarm" ${phase === "off" ? "disabled" : ""}>
        <ha-icon icon="mdi:shield-off-outline"></ha-icon>
        <span><strong>Disarma</strong><small>Sorveglianza spenta</small></span>
      </button>`;

    const armButtons = modes.map((m) => `<button class="al-btn ${state === m.state ? "current" : ""}"
        data-alarm-act="${esc(id)}|${esc(m.service)}" ${state === m.state ? "disabled" : ""}>
        <ha-icon icon="${esc(m.icon)}"></ha-icon>
        <span><strong>${esc(m.l)}</strong><small>${esc(state === m.state ? "attiva adesso" : m.hint)}</small></span>
      </button>`).join("");

    // The panic button fires a siren, so it is deliberately NOT a plain tap:
    // it needs a hold. A control that wakes the neighbours must not be
    // reachable by a thumb brushing the screen in a pocket.
    const panic = (feats & ALARM_TRIGGER_BIT) === ALARM_TRIGGER_BIT
      ? `<button class="al-panic" data-alarm-panic="${esc(id)}" title="Tieni premuto per far scattare l'allarme">
          <ha-icon icon="mdi:alarm-light-outline"></ha-icon> TIENI PREMUTO PER L'ALLARME
        </button>` : "";

    return `${head}${keypad}
      <div class="al-grid">${armed || moving ? disarm + armButtons : armButtons + disarm}</div>
      ${panic}${changed}`;
  }

  /**
   * Run an alarm service, carrying the code when the panel wants one.
   *
   * The code is held on the component and never written into the saved
   * document: a dashboard is synchronised, exported and read by anyone with
   * the panel open, and an alarm code has no business in it.
   */
  _alarmAct(entityId, service) {
    const st = this._hass.states[entityId];
    if (!st) return;
    const attrs = st.attributes || {};
    const code = ((this._alarmCode || {})[entityId] || "").trim();
    if (attrs.code_format && !code) {
      this._error = "Serve il codice della centrale";
      this._touch(true);
      return;
    }
    const data = { entity_id: entityId };
    if (code) data.code = code;
    this._hass.callService("alarm_control_panel", service, data);
    // Clear it immediately: a code left in a field on a wall tablet is the
    // same as a code written on the wall.
    if (this._alarmCode) delete this._alarmCode[entityId];
    this._error = "";
    this._touch(true);
  }

  // ---------------------------------------------------------- comfort ---

  /**
   * Rooms with a temperature sensor, discovered from the area registry.
   *
   * Explicit rows win when present; otherwise every area that has a
   * temperature sensor becomes a row, and a humidity sensor in the same area
   * is paired with it. Discovery rather than configuration, because the areas
   * are already maintained in Home Assistant and re-declaring them here would
   * be a second list to keep in sync.
   */
  _comfortRooms(item) {
    const explicit = Array.isArray(item.rooms) ? item.rooms.filter((r) => r && r.temperature) : [];
    if (explicit.length) {
      return explicit.map((r) => ({
        key: r.temperature,
        name: r.name || (this._hass.states[r.temperature]
          && this._hass.states[r.temperature].attributes.friendly_name) || r.temperature,
        icon: r.icon || "mdi:home-thermometer",
        temperature: r.temperature, humidity: r.humidity || null,
      }));
    }
    if (!this._registry) return [];
    const cat = this._registry.category || {};
    const dev = this._registry.entityDevice || {};
    const numeric = (id) => {
      const st = this._hass.states[id];
      return st && !cat[id] && Number.isFinite(parseFloat(st.state)) ? st : null;
    };
    const ofClass = (id, dc) => {
      const st = numeric(id);
      return st && st.attributes.device_class === dc;
    };

    // Every device that reports humidity. A thing that measures BOTH
    // temperature and humidity is a climate sensor; a thing that reports only
    // temperature may well be a relay reporting how hot its own chip is.
    const humidDevices = new Set();
    for (const id of Object.keys(this._hass.states)) {
      if (ofClass(id, "humidity") && dev[id]) humidDevices.add(dev[id]);
    }

    /**
     * Which temperature sensor represents a room.
     *
     * The previous version took the FIRST match in the area, which is
     * arbitrary: a Shelly plug in the bathroom exposes its internal chip
     * temperature, and if the registry happened to list it first the card
     * would proudly report the bathroom at 45 °C. Order in the entity registry
     * is not a statement about relevance, so it must not be treated as one.
     *
     * Ranking, strongest signal first:
     *  +60  the same physical device also reports humidity -> climate sensor
     * -120  the name says plug/relay/CPU/battery -> it is measuring itself
     *  tie  shorter entity_id wins: the primary sensor of a device is almost
     *       always the one without the extra qualifier in its name.
     */
    const score = (id) => {
      let s = 0;
      const st = this._hass.states[id];
      const hay = (id + " " + ((st && st.attributes.friendly_name) || "")).toLowerCase();
      if (CHIP_TEMP_RE.test(hay)) s -= 120;
      if (dev[id] && humidDevices.has(dev[id])) s += 60;
      return s;
    };
    const best = (ids) => ids.slice().sort((a, b) => {
      const d = score(b) - score(a);
      return d !== 0 ? d : a.length - b.length;
    })[0] || null;

    const rows = [];
    const claimed = new Set();
    for (const area of this._registry.areas) {
      const pool = this._registry.byArea[area.area_id] || [];
      const temps = pool.filter((id) => ofClass(id, "temperature"));
      const hums = pool.filter((id) => ofClass(id, "humidity"));
      const temperature = best(temps);
      if (!temperature) continue;
      // Prefer the humidity reading from the SAME device: two sensors in one
      // room can disagree, and pairing them by device keeps a single card from
      // describing two different places.
      const sameDevice = hums.find((h) => dev[h] && dev[h] === dev[temperature]);
      pool.forEach((id) => claimed.add(id));
      rows.push({ key: area.area_id, name: area.name || area.area_id,
        icon: area.icon || roomIconFor(area.name || area.area_id),
        temperature, humidity: sameDevice || hums[0] || null });
    }

    // The outdoor sensor almost never belongs to an area — there is no
    // "outside" room in Home Assistant — and excluding it made the one
    // comparison people actually want (inside vs outside) impossible. It goes
    // FIRST: outside is the reference the rooms are read against.
    const outdoor = Object.keys(this._hass.states)
      .filter((id) => !claimed.has(id) && ofClass(id, "temperature"))
      .filter((id) => {
        const st = this._hass.states[id];
        return OUTDOOR_RE.test((id + " " + ((st && st.attributes.friendly_name) || "")).toLowerCase());
      })
      .sort((a, b) => a.length - b.length);
    for (const id of outdoor.slice(0, 3)) {
      const st = this._hass.states[id];
      rows.unshift({ key: id, name: (st && st.attributes.friendly_name) || "Esterno",
        icon: "mdi:sun-thermometer-outline", temperature: id,
        humidity: Object.keys(this._hass.states).find((h) =>
          !claimed.has(h) && ofClass(h, "humidity") && dev[h] && dev[h] === dev[id]) || null,
        outdoor: true });
    }
    return rows;
  }

  _comfortBody(item) {
    if (!this._registry && !this._registryLoading) this._loadRegistry();
    const rooms = this._comfortRooms(item);
    if (!rooms.length) {
      return `<div class="ov-empty"><ha-icon icon="mdi:home-thermometer-outline"></ha-icon>
        <span>${this._registry
          ? "Nessuna area con un sensore di temperatura. Assegna i sensori alle aree in Home Assistant, oppure scegli le stanze a mano nell'editor."
          : "Lettura del registro aree…"}</span></div>`;
    }
    const bands = comfortBands(item);
    const filter = item.filter || "";
    const shown = filter ? rooms.filter((r) => r.key === filter) : rooms;

    const num = (id) => {
      const st = id && this._hass.states[id];
      if (!st) return null;
      const n = parseFloat(st.state);
      return Number.isFinite(n) ? n : null;
    };

    const chips = `<div class="cf-chips">
        <button class="cf-chip ${filter ? "" : "on"}" data-comfort-filter="">
          <ha-icon icon="mdi:home"></ha-icon>TUTTE<em>${rooms.length}</em></button>
        ${rooms.map((r) => `<button class="cf-chip ${filter === r.key ? "on" : ""}" data-comfort-filter="${esc(r.key)}">
          <ha-icon icon="${esc(r.icon)}"></ha-icon>${esc(r.name)}</button>`).join("")}
      </div>`;

    const cards = shown.map((r) => {
      const t = num(r.temperature), h = num(r.humidity);
      const v = comfortVerdict(t, h, bands);
      const pos = comfortPosition(t);
      return `<article class="cf-room" style="--cc:${esc(v.color)}">
        <header>
          <span class="cf-ico"><ha-icon icon="${esc(r.icon)}"></ha-icon></span>
          <strong>${esc(r.name)}</strong>
          <em class="cf-badge">${esc(v.l)}</em>
        </header>
        <div class="cf-vals">
          <button class="cf-t" ${r.temperature ? `data-more-info="${esc(r.temperature)}"` : ""}>
            <small>TEMPERATURA</small>
            <b>${t === null ? "—" : t.toFixed(1)}<i>°</i></b>
          </button>
          <button class="cf-h" ${r.humidity ? `data-more-info="${esc(r.humidity)}"` : ""}>
            <small><ha-icon icon="mdi:water"></ha-icon> UMIDITÀ</small>
            <b>${h === null ? "—" : Math.round(h)}<i>%</i></b>
            <span class="cf-hbar"><i style="width:${h === null ? 0 : Math.max(0, Math.min(100, h))}%"></i></span>
          </button>
        </div>
        <div class="cf-scale">${pos === null ? "" : `<i style="left:${pos.toFixed(1)}%"></i>`}</div>
      </article>`;
    }).join("");

    return `<div class="cf">${chips}<div class="cf-grid">${cards}</div></div>`;
  }

  // --------------------------------------------------- auto elettrica ---

  /** Vehicles declared on this dashboard. */
  _vehicles() {
    return (this._dashboard && Array.isArray(this._dashboard.vehicles))
      ? this._dashboard.vehicles : [];
  }

  _vehicle(id) { return this._vehicles().find((v) => v.id === id) || null; }

  /** Vehicles a card or a room shows: the listed ones, or all of them. */
  _vehiclesFor(list) {
    const all = this._vehicles();
    if (!Array.isArray(list) || !list.length) return all;
    return list.map((id) => this._vehicle(id)).filter(Boolean);
  }

  /**
   * A ring rather than a bar.
   *
   * The state of charge is the one number somebody reads from across the room,
   * and a ring carries it at a glance while leaving its middle free for the
   * percentage. The arc is a stroked circle with a dash offset, so there is no
   * arc-flag arithmetic to get wrong.
   */
  _socRing(soc, charging, size) {
    const r = 34, c = 2 * Math.PI * r;
    const pct = soc === null ? 0 : Math.max(0, Math.min(100, soc));
    const color = socColor(soc);
    return `<svg class="ev-ring${charging ? " charging" : ""}" viewBox="0 0 80 80" style="width:${size}px;height:${size}px">
      <circle class="ev-ring-bg" cx="40" cy="40" r="${r}"/>
      <circle class="ev-ring-arc" cx="40" cy="40" r="${r}" style="stroke:${esc(color)};
        stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${(c * (1 - pct / 100)).toFixed(1)}"/>
      <text class="ev-ring-val" x="40" y="${charging ? 38 : 45}">${soc === null ? "—" : Math.round(pct)}</text>
      ${soc !== null ? `<text class="ev-ring-pct" x="40" y="${charging ? 50 : 57}">%</text>` : ""}
      ${charging ? '<text class="ev-ring-bolt" x="40" y="64">⚡</text>' : ""}
    </svg>`;
  }

  _evBody(item) {
    const vehicles = this._vehiclesFor(item.vehicles);
    if (!vehicles.length) {
      return `<div class="ov-empty"><ha-icon icon="mdi:car-electric-outline"></ha-icon>
        <span>Nessuna auto elettrica configurata. Aprendo la card in modifica puoi dichiararla — bastano la percentuale di batteria e il sensore di potenza della colonnina — oppure lasciare che Cyborg la cerchi da sola.</span></div>`;
    }
    return `<div class="ev">${vehicles.map((v) => {
      const st = vehicleState(v, this._hass.states);
      const rows = [];
      if (st.powerW !== null) {
        const f = fmtPower(st.powerW);
        rows.push([st.charging ? "mdi:flash" : "mdi:flash-off", "Potenza", f.v + " " + f.u]);
      }
      if (st.rangeKm !== null) rows.push(["mdi:map-marker-distance", "Autonomia", Math.round(st.rangeKm) + " km"]);
      if (st.target !== null) rows.push(["mdi:target", "Obiettivo", Math.round(st.target) + "%"]);
      if (st.etaMin !== null) rows.push(["mdi:timer-sand", "Alla carica", etaWords(st.etaMin)]);

      const hasSwitch = v.switch && this._hass.states[v.switch];
      const hasCurrent = v.current && this._hass.states[v.current];
      const curSt = hasCurrent ? this._hass.states[v.current] : null;

      return `<article class="ev-car${st.charging ? " charging" : ""}" style="--ec:${esc(socColor(st.soc))}">
        <div class="ev-top">
          ${this._socRing(st.soc, st.charging, 92)}
          <div class="ev-id">
            <button class="ev-name" ${v.battery ? `data-more-info="${esc(v.battery)}"` : ""}>
              <ha-icon icon="${esc(v.icon)}"></ha-icon><strong>${esc(v.name)}</strong>
            </button>
            <span class="ev-status">${esc(st.status)}${
              st.etaMin !== null ? " · pronta fra " + esc(etaWords(st.etaMin)) : ""}</span>
            ${st.soc !== null && st.target !== null && st.target > st.soc ? `<div class="ev-target">
              <i style="width:${Math.max(0, Math.min(100, st.soc)).toFixed(1)}%"></i>
              <b style="left:${Math.max(0, Math.min(100, st.target)).toFixed(1)}%"></b>
            </div>` : ""}
          </div>
        </div>
        ${rows.length ? `<div class="ev-rows">${rows.map(([icon, label, value]) => `
          <div class="ev-row"><ha-icon icon="${esc(icon)}"></ha-icon>
            <span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div>` : ""}
        ${item.show_controls !== false && (hasSwitch || hasCurrent) ? `<div class="ev-ctl">
          ${hasSwitch ? `<button class="ev-btn ${ON_STATES.has(this._hass.states[v.switch].state) ? "on" : ""}"
            data-ev-switch="${esc(v.switch)}">
            <ha-icon icon="${ON_STATES.has(this._hass.states[v.switch].state) ? "mdi:stop" : "mdi:play"}"></ha-icon>
            ${ON_STATES.has(this._hass.states[v.switch].state) ? "FERMA" : "AVVIA"}</button>` : ""}
          ${hasCurrent ? `<label class="ev-amp">CORRENTE · ${esc(curSt.state)} A
            <input type="range" data-ev-current="${esc(v.current)}"
              min="${esc(curSt.attributes.min ?? 6)}" max="${esc(curSt.attributes.max ?? 32)}"
              step="${esc(curSt.attributes.step ?? 1)}" value="${esc(curSt.state)}"></label>` : ""}
        </div>` : ""}
      </article>`;
    }).join("")}</div>`;
  }

  /**
   * Find the electric vehicle in a Home Assistant instance.
   *
   * Matched on device_class plus naming, because there is no EV device class:
   * a car's state of charge is a battery sensor like any other, and what
   * distinguishes it is that it lives on a device whose name says car. Better
   * to propose something the user confirms than to require twelve entity
   * pickers before anything appears on screen.
   */
  _detectVehicles() {
    const CAR = /\b(auto|car|vehicle|veicolo|ev|tesla|zoe|leaf|kona|id\.?[345]|model[_\s-]?[3ysx]|e[_\s-]?tron|ioniq|kia|renault|bmw|volvo|polestar)\b/i;
    const WALL = /\b(wallbox|colonnina|charger|caricator|easee|zappi|go-?e|keba|pulsar|evse)\b/i;
    const states = this._hass.states;
    const nameOf = (id) => ((states[id].attributes.friendly_name || "") + " " + id);

    const socs = Object.keys(states).filter((id) =>
      id.startsWith("sensor.") && states[id].attributes.device_class === "battery"
      && CAR.test(nameOf(id)));
    const powers = Object.keys(states).filter((id) =>
      states[id].attributes.device_class === "power" && (WALL.test(nameOf(id)) || CAR.test(nameOf(id))));

    const pick = (pool, re) => pool.find((id) => re.test(nameOf(id))) || null;
    const found = [];

    if (socs.length) {
      for (const soc of socs.slice(0, MAX_VEHICLES_JS)) {
        // Group everything whose name shares the car's leading word: that is
        // how integrations name a device's entities.
        const tag = (states[soc].attributes.friendly_name || soc).split(/[\s_]/)[0];
        const near = new RegExp("\\b" + tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        found.push({
          id: uid("ev"),
          name: (states[soc].attributes.friendly_name || "Auto elettrica")
            .replace(/\s*(batteria|battery|soc|stato di carica)\s*/i, "").trim() || "Auto elettrica",
          icon: "mdi:car-electric", color: "#06d6a0",
          battery: soc,
          charging: Object.keys(states).find((id) =>
            (id.startsWith("binary_sensor.") || id.startsWith("sensor.")) && near.test(nameOf(id))
            && /charg|carica/i.test(nameOf(id))) || null,
          power: powers.find((id) => near.test(nameOf(id))) || powers[0] || null,
          energy: Object.keys(states).find((id) =>
            states[id].attributes.device_class === "energy" && (WALL.test(nameOf(id)) || near.test(nameOf(id)))) || null,
          range: Object.keys(states).find((id) => near.test(nameOf(id)) && /autonom|range|km/i.test(nameOf(id))) || null,
          plugged: Object.keys(states).find((id) => id.startsWith("binary_sensor.")
            && near.test(nameOf(id)) && /plug|connect|collegat/i.test(nameOf(id))) || null,
          target: Object.keys(states).find((id) => (id.startsWith("number.") || id.startsWith("sensor."))
            && near.test(nameOf(id)) && /target|limit|obiettivo/i.test(nameOf(id))) || null,
          switch: Object.keys(states).find((id) => id.startsWith("switch.")
            && (near.test(nameOf(id)) || WALL.test(nameOf(id))) && /charg|carica/i.test(nameOf(id))) || null,
          current: Object.keys(states).find((id) => id.startsWith("number.")
            && (near.test(nameOf(id)) || WALL.test(nameOf(id))) && /current|corrente|ampere/i.test(nameOf(id))) || null,
          capacity: null,
        });
      }
    } else if (powers.length) {
      // A wallbox with no car integration: still worth showing, it is the
      // thing that tells you whether the car is charging at all.
      const wall = pick(powers, WALL) || powers[0];
      found.push({ id: uid("ev"), name: states[wall].attributes.friendly_name || "Colonnina",
        icon: "mdi:ev-station", color: "#06d6a0",
        battery: null, charging: null, power: wall, energy: null, range: null,
        plugged: null, target: null, switch: null, current: null, capacity: null });
    }
    return found;
  }

  // ------------------------------------------------------------ stanza ---

  /**
   * One room, with its devices grouped by what they do.
   *
   * Bound to a Home Assistant area rather than to a hand-picked list: an area
   * is the thing the user already maintains, and a device moved into it
   * appears here without anyone editing the dashboard. Diagnostic entities are
   * excluded, and anything explicitly hidden stays hidden — the same exclusion
   * list the 3D map uses, so a device silenced in one place is silenced in
   * both.
   */
  _roomCardEntities(item) {
    if (!this._registry) return [];
    const hidden = new Set(Array.isArray(item.hidden) ? item.hidden : []);
    const cat = this._registry.category || {};
    return (this._registry.byArea[item.area] || []).filter((id) => {
      if (hidden.has(id) || cat[id]) return false;
      const st = this._hass.states[id];
      return !!st && st.state !== "unavailable";
    });
  }

  _roomCardBody(item) {
    if (!this._registry && !this._registryLoading) this._loadRegistry();
    if (!item.area) {
      const areas = (this._registry && this._registry.areas) || [];
      return `<div class="ov-empty"><ha-icon icon="mdi:home-search-outline"></ha-icon>
        <span>Collega quest card a un'area di Home Assistant dall'editor.${
          areas.length ? ` Ne sono disponibili ${areas.length}.` : ""}</span></div>`;
    }
    const ids = this._roomCardEntities(item);
    if (!ids.length) {
      return `<div class="ov-empty"><ha-icon icon="mdi:home-outline"></ha-icon>
        <span>${this._registry ? "Nessun dispositivo in quest'area." : "Lettura del registro…"}</span></div>`;
    }

    // Readings go in the header strip, controls go in the body: a temperature
    // is something you look at, a light is something you press.
    // Cameras and alarm panels get their own buckets. They used to fall into
    // "Altro", which renders switch rows — and neither can be switched, so the
    // user got two lines that did nothing when tapped.
    const readings = [], lights = [], covers = [], climates = [], switches = [],
          cams = [], alarms = [], rest = [];
    for (const id of ids) {
      const d = domainOf(id);
      const st = this._hass.states[id];
      if (d === "light") lights.push(id);
      else if (d === "cover") covers.push(id);
      else if (d === "climate" || d === "fan" || d === "humidifier") climates.push(id);
      else if (d === "switch" || d === "input_boolean") switches.push(id);
      else if (d === "camera") cams.push(id);
      else if (d === "alarm_control_panel") alarms.push(id);
      else if (d === "sensor" || d === "binary_sensor") {
        if (d === "sensor" && Number.isFinite(parseFloat(st.state))) readings.push(id);
        else rest.push(id);
      } else rest.push(id);
    }
    const onLights = lights.filter((id) => this._hass.states[id].state === "on").length;

    // ?? and not ||: 0 is a legitimate choice ("no readings in the header")
    // and || would quietly turn it back into 4.
    const strip = readings.slice(0, item.max_readings ?? 4).map((id) => {
      const st = this._hass.states[id];
      const n = parseFloat(st.state);
      return `<button class="rc-read" data-more-info="${esc(id)}">
        <ha-icon icon="${esc(autoIcon(id, st))}"></ha-icon>
        <strong>${esc(Math.abs(n) >= 100 ? Math.round(n) : n.toFixed(1))}<i>${esc(st.attributes.unit_of_measurement || "")}</i></strong>
        <small>${esc(String(st.attributes.friendly_name || id).replace(/\s*\b(temperatura|umidit[àa]|potenza)\b\s*/i, "").trim() || (st.attributes.device_class || ""))}</small>
      </button>`;
    }).join("");

    const block = (title, icon, list, render) => list.length ? `<section class="rc-block">
        <header><ha-icon icon="${esc(icon)}"></ha-icon><strong>${esc(title)}</strong><em>${list.length}</em></header>
        ${list.map(render).join("")}
      </section>` : "";

    const toggleRow = (id) => {
      const st = this._hass.states[id];
      const on = ON_STATES.has(st.state);
      return this._deviceRow(id, st, on, "rc-row", item);
    };
    const coverRow = (id) => {
      const st = this._hass.states[id];
      const pos = st.attributes.current_position;
      return `<div class="rc-cover">
        <ha-icon icon="${esc(autoIcon(id, st))}"></ha-icon>
        <span>${esc(st.attributes.friendly_name || id)}</span>
        <small>${esc(pos !== undefined ? pos + "%" : stateWords(st.state, st.attributes.device_class))}</small>
        <button class="mini" data-cover-cmd="${esc(id)}|open_cover" title="Apri"><ha-icon icon="mdi:chevron-up"></ha-icon></button>
        <button class="mini" data-cover-cmd="${esc(id)}|stop_cover" title="Ferma"><ha-icon icon="mdi:stop"></ha-icon></button>
        <button class="mini" data-cover-cmd="${esc(id)}|close_cover" title="Chiudi"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
      </div>`;
    };
    /**
     * A camera in a room is a picture, not a line of text.
     *
     * "Videocamera salotto — INATTIVO" told the user nothing and did nothing
     * when tapped. What anybody wants from a camera listed under a room is to
     * see it, so the row shows the last frame and opens the live view. It also
     * puts the camera where the eye expects it — with the other things you
     * LOOK at — instead of in the catch-all bucket with the switches.
     */
    const cameraRow = (id) => {
      const st = this._hass.states[id];
      const url = cameraStill(id, st);
      const off = st.state === "unavailable" || !url;
      const tick = this._camTick || 0;
      this._scheduleCameraRefresh(item);
      return `<button class="rc-cam" data-cam-open="${esc(id)}" ${off ? "disabled" : ""}>
        ${off ? `<div class="cam-off"><ha-icon icon="mdi:cctv-off"></ha-icon></div>`
              : `<img class="cam-img" data-cam="${esc(id)}"
                   src="${esc(url)}${url.includes("?") ? "&" : "?"}_t=${tick}" alt=""
                   decoding="async">`}
        <span class="cam-bar">
          <ha-icon icon="mdi:cctv"></ha-icon>
          <em>${esc(st.attributes.friendly_name || id)}</em>
          <i class="cam-dot ${off ? "off" : ""}"></i>
        </span>
      </button>`;
    };
    const alarmRow = (id) => {
      // The panel's own card in one line: state, colour, and a tap that opens
      // the real controls. Never a switch — it has no toggle service at all.
      const st = this._hass.states[id];
      const phase = alarmPhase(st.state);
      return `<button class="rc-row alarm ${esc(phase)}" style="--al:${esc(ALARM_PHASE_COLOR[phase])}"
          data-more-info="${esc(id)}">
        <ha-icon icon="${esc(phase === "fire" ? "mdi:alarm-light"
          : phase === "armed" ? "mdi:shield-lock" : "mdi:shield-off-outline")}"></ha-icon>
        <span>${esc(st.attributes.friendly_name || id)}</span>
        <small>${esc(stateWords(st.state, null))}</small>
      </button>`;
    };
    const climateRow = (id) => {
      const st = this._hass.states[id];
      const cur = st.attributes.current_temperature;
      const set = st.attributes.temperature;
      const on = st.state !== "off" && st.state !== "unavailable";
      return `<button class="rc-row${on ? " on" : ""}" data-more-info="${esc(id)}">
        <ha-icon icon="${esc(autoIcon(id, st))}"></ha-icon>
        <span>${esc(st.attributes.friendly_name || id)}</span>
        <small>${esc([cur !== undefined ? cur + "°" : null, set !== undefined ? "→ " + set + "°" : null, stateWords(st.state)]
          .filter(Boolean).join(" "))}</small>
      </button>`;
    };

    return `<div class="rc">
      ${strip ? `<div class="rc-strip">${strip}</div>` : ""}
      ${lights.length ? `<section class="rc-block">
        <header><ha-icon icon="mdi:lightbulb-group"></ha-icon><strong>Luci</strong>
          <em>${onLights}/${lights.length}</em>
          <button class="act-off" data-room-lights-off="${esc(item.area)}" title="Spegni le luci"><ha-icon icon="mdi:power"></ha-icon></button>
        </header>
        ${lights.map((id) => this._lightRow(id, item)).join("")}
      </section>` : ""}
      ${block("Clima", "mdi:thermostat", climates, climateRow)}
      ${block("Aperture", "mdi:window-shutter", covers, coverRow)}
      ${block("Videocamere", "mdi:cctv", cams, cameraRow)}
      ${block("Prese e interruttori", "mdi:power-plug", switches, toggleRow)}
      ${block("Sicurezza", "mdi:shield-home", alarms, alarmRow)}
      ${item.show_others === false ? "" : block("Altro", "mdi:shape-outline", rest.slice(0, 8), toggleRow)}
    </div>`;
  }

  // --------------------------------------------------- confronto andamenti ---

  /**
   * Several histories on one set of axes.
   *
   * The single-entity chart card answers "what did this do"; this one answers
   * the question that actually gets asked — "is the bathroom colder than the
   * living room, and how do both track the outside". That comparison only
   * means anything on a shared vertical scale, so every series is drawn
   * against one min/max computed across all of them: normalising each line to
   * its own range would make a 2-degree wobble and a 20-degree swing look
   * identical.
   */
  /**
   * The lines of a comparison chart, resolved at render time.
   *
   * The card used to hold a fixed list of entities, chosen once. That is a
   * SNAPSHOT, and a snapshot cannot answer "oggi quattro stanze, domani
   * dieci": a sensor added next month never joins the chart, and nothing on
   * screen says why. So the list is now DERIVED unless the user explicitly
   * asked to write it himself:
   *
   *   manual  — the list he picked. Frozen on purpose.
   *   comfort — the same rooms the Temperature card discovers, outdoor probe
   *             included. Add a sensor to an area and the line appears.
   *   class   — every numeric entity of one device_class in the instance.
   *
   * Colours are assigned by POSITION for the derived modes rather than stored,
   * so a new room does not repaint every existing line: order is stable
   * because the discovery itself is stable (outdoor first, then areas in
   * registry order).
   */
  _trendSeries(item) {
    const cap = Math.max(1, Math.min(MAX_TREND_SERIES, Number(item.max_series) || 8));
    const source = item.source || "manual";
    const live = (id) => this._hass.states[id];

    if (source === "comfort") {
      // Both derived modes depend on the area registry, and the registry is
      // fetched lazily. Without this the card sat on "scegli le grandezze"
      // forever after a plain page load: nothing else on the page had asked
      // for the registry, so the discovery had nothing to discover.
      if (!this._registry && !this._registryLoading) this._loadRegistry();
      return this._comfortRooms({}).map((r, i) => ({
        entity: r.temperature, name: r.name,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      })).filter((r) => live(r.entity)).slice(0, cap);
    }

    if (source === "class") {
      const dc = item.device_class || "temperature";
      const cat = (this._registry && this._registry.category) || {};
      const area = (this._registry && this._registry.entityArea) || {};
      if (!this._registry && !this._registryLoading) this._loadRegistry();
      const ids = Object.keys(this._hass.states).filter((id) => {
        const st = this._hass.states[id];
        return st && !cat[id] && st.attributes.device_class === dc
          && Number.isFinite(parseFloat(st.state));
      });
      // Sort key, in order of importance:
      //   0  outdoor probes  — no area, but the reference every room is read
      //                        against. Sorting them with the other area-less
      //                        entities pushed them to the end, where the line
      //                        cap cut off precisely the line that matters most.
      //   1  entities in an area, alphabetically by area: a stable human order.
      //   2  everything else with no area.
      const rank = (id) => {
        const st = this._hass.states[id];
        const hay = (id + " " + ((st && st.attributes.friendly_name) || "")).toLowerCase();
        if (!area[id]) return OUTDOOR_RE.test(hay) ? 0 : 2;
        return 1;
      };
      ids.sort((a, b) => rank(a) - rank(b)
        || (area[a] || "").localeCompare(area[b] || "")
        || a.localeCompare(b));
      return ids.slice(0, cap).map((id, i) => ({
        entity: id,
        name: area[id] || (this._hass.states[id].attributes.friendly_name || id),
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      }));
    }

    const rows = Array.isArray(item.series) ? item.series : [];
    return rows.filter((r) => r && r.entity && live(r.entity)).slice(0, cap);
  }

  _loadTrend(item) {
    const series = this._trendSeries(item);
    const ids = series.map((r) => r.entity);
    const hours = Math.max(1, Math.min(720, item.hours || 24));
    const key = item.id + "|" + hours + "|" + ids.join(",");
    this._trend = this._trend || {};
    const cached = this._trend[key];
    // 5 minutes: long enough not to hammer the recorder while scrolling,
    // short enough that the chart is never visibly behind the card's own
    // live value.
    if (cached && Date.now() - cached.ts < 300000) return cached;
    if (this._trendPending === key) return cached || null;
    if (!ids.length) return null;

    this._trendPending = key;
    const end = new Date();
    const start = new Date(end.getTime() - hours * 3600000);
    this._hass.callWS({
      type: "history/history_during_period",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      entity_ids: ids,
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    }).then((res) => {
      const out = {};
      for (const id of ids) {
        const raw = (res && res[id]) || [];
        out[id] = raw.map((pt) => {
          const value = parseFloat(pt.s !== undefined ? pt.s : pt.state);
          // lu is the last-updated timestamp in seconds; the first sample of a
          // window carries the full state object instead
          const t = pt.lu !== undefined ? pt.lu * 1000
            : (pt.last_updated ? Date.parse(pt.last_updated) : NaN);
          return Number.isFinite(value) && Number.isFinite(t) ? [t, value] : null;
        }).filter(Boolean);
      }
      this._trend[key] = { ts: Date.now(), start: start.getTime(), end: end.getTime(), data: out };
      this._trendPending = null;
      this._touch(true);
    }).catch((err) => {
      this._trend[key] = { ts: Date.now(), error: true,
        message: (err && err.message) || "storico non disponibile" };
      this._trendPending = null;
      this._touch(true);
    });
    return null;
  }

  _trendBody(item) {
    const series = this._trendSeries(item);
    if (!series.length) {
      // Deliberately NOT a temperature example. This card compares any
      // quantity — the temperatures of four motors, the voltages of three
      // phases, the currents on a distribution board — and an example that
      // only ever says "soggiorno, bagno, soppalco" makes it read like a
      // domestic-climate widget, which is the wrong idea to give an installer.
      return `<div class="ov-empty"><ha-icon icon="mdi:chart-multiple"></ha-icon>
        <span>Nessuna grandezza scelta. Nell'editor puoi <strong>seguire le stanze</strong>, prendere <strong>tutte le grandezze di un tipo</strong> (temperature, tensioni, correnti, potenze…) oppure comporre l'elenco a mano.</span></div>`;
    }
    const data = this._loadTrend(item);
    if (!data) {
      return `<div class="ov-empty"><ha-icon icon="mdi:progress-clock"></ha-icon>
        <span>Lettura dello storico…</span></div>`;
    }
    if (data.error) {
      return `<div class="ov-empty"><ha-icon icon="mdi:database-alert-outline"></ha-icon>
        <span>${esc(data.message)}. Serve il recorder attivo sulle entità scelte.</span></div>`;
    }

    const W = 600, H = 220, PAD_L = 38, PAD_R = 10, PAD_T = 12, PAD_B = 22;
    let lo = Infinity, hi = -Infinity;
    for (const row of series) {
      for (const [, v] of (data.data[row.entity] || [])) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (!Number.isFinite(lo)) {
      return `<div class="ov-empty"><ha-icon icon="mdi:chart-line"></ha-icon>
        <span>Nessun dato registrato nel periodo scelto.</span></div>`;
    }
    // Number(null) is 0 and Number("") is 0, both of which are finite: testing
    // the coerced value treated "no manual bound" as a bound of zero and
    // collapsed the whole scale to +/-0.6, so no line was ever on screen.
    const bound = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))
      ? null : Number(v));
    const yMin = bound(item.y_min), yMax = bound(item.y_max);
    if (yMin !== null) lo = yMin;
    if (yMax !== null) hi = yMax;
    if (hi - lo < 0.5) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
    const pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;

    const x = (t) => PAD_L + ((t - data.start) / Math.max(1, data.end - data.start)) * (W - PAD_L - PAD_R);
    const y = (v) => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);

    const ticks = 4;
    const grid = Array.from({ length: ticks + 1 }, (_, i) => {
      const v = lo + ((hi - lo) * i) / ticks;
      const yy = y(v);
      return `<line class="tr-grid" x1="${PAD_L}" y1="${yy.toFixed(1)}" x2="${W - PAD_R}" y2="${yy.toFixed(1)}"/>
        <text class="tr-ylab" x="${PAD_L - 6}" y="${(yy + 3).toFixed(1)}">${esc(Math.abs(hi - lo) > 12 ? Math.round(v) : v.toFixed(1))}</text>`;
    }).join("");

    const hours = Math.max(1, Math.min(720, item.hours || 24));
    const xLabels = Array.from({ length: 5 }, (_, i) => {
      const t = data.start + ((data.end - data.start) * i) / 4;
      const d = new Date(t);
      const label = hours > 72
        ? `${d.getDate()}/${d.getMonth() + 1}`
        : String(d.getHours()).padStart(2, "0") + ":00";
      return `<text class="tr-xlab" x="${x(t).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${esc(label)}</text>`;
    }).join("");

    const paths = series.map((row, i) => {
      const pts = data.data[row.entity] || [];
      if (pts.length < 2) return "";
      const color = row.color || SERIES_COLORS[i % SERIES_COLORS.length];
      const d = pts.map((pt, j) => (j ? "L" : "M") + x(pt[0]).toFixed(1) + "," + y(pt[1]).toFixed(1)).join(" ");
      return `<path class="tr-line" data-series="${esc(row.entity)}" d="${d}" style="stroke:${esc(color)}"/>`;
    }).join("");

    // Geometry kept for the pointer handler. Hovering must not re-render: a
    // full repaint per mousemove would fight the pointer and lose.
    this._trendGeom = this._trendGeom || {};
    this._trendGeom[item.id] = {
      W, H, PAD_L, PAD_R, PAD_T, PAD_B, lo, hi,
      start: data.start, end: data.end,
      hours,
      series: series.map((row, i) => ({
        entity: row.entity,
        color: row.color || SERIES_COLORS[i % SERIES_COLORS.length],
        name: row.name || (this._hass.states[row.entity].attributes.friendly_name) || row.entity,
        unit: this._hass.states[row.entity].attributes.unit_of_measurement || "",
        pts: data.data[row.entity] || [],
      })).filter((r) => r.pts.length > 1),
    };

    // Drawn empty and filled in by the handler, so the markup does not change
    // shape between hovering and not hovering.
    const hoverLayer = `<g class="tr-hover" data-trend-hover>
        <line class="tr-cursor" x1="0" y1="${PAD_T}" x2="0" y2="${H - PAD_B}"/>
        ${series.map((row, i) => `<circle class="tr-pt" data-pt="${esc(row.entity)}" r="3.5"
          style="fill:${esc(row.color || SERIES_COLORS[i % SERIES_COLORS.length])}"/>`).join("")}
      </g>`;

    const legend = series.map((row, i) => {
      const st = this._hass.states[row.entity];
      const pts = data.data[row.entity] || [];
      const values = pts.map((pt) => pt[1]);
      const now = parseFloat(st.state);
      const unit = st.attributes.unit_of_measurement || "";
      const color = row.color || SERIES_COLORS[i % SERIES_COLORS.length];
      return `<button class="tr-leg" data-more-info="${esc(row.entity)}" style="--sc:${esc(color)}">
        <i></i>
        <span class="tr-leg-name">${esc(row.name || st.attributes.friendly_name || row.entity)}</span>
        <span class="tr-leg-now">${esc(Number.isFinite(now) ? (Math.abs(now) >= 100 ? Math.round(now) : now.toFixed(1)) + unit : st.state)}</span>
        <span class="tr-leg-range">${values.length
          ? esc(Math.min(...values).toFixed(1) + " / " + Math.max(...values).toFixed(1))
          : "—"}</span>
      </button>`;
    }).join("");

    return `<div class="tr">
      <div class="tr-tabs">${TREND_RANGES.map((r) =>
        `<button class="eco-tab ${r.h === hours ? "on" : ""}" data-trend-hours="${r.h}">${esc(r.l)}</button>`).join("")}</div>
      <div class="tr-plot">
        <svg class="tr-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
             data-trend-svg="${esc(item.id)}">
          ${grid}${xLabels}${paths}${hoverLayer}
        </svg>
        <div class="tr-read" data-trend-read hidden></div>
      </div>
      <div class="tr-legend">${legend}</div>
    </div>`;
  }

  // ------------------------------------------------------------- luci ---

  /**
   * What the Luci card shows.
   *
   * Not only the `light` domain. Plenty of real lighting is wired through a
   * relay or a smart plug and lands in Home Assistant as a `switch`: for the
   * person standing in the room that is a light, and refusing to list it
   * because of its domain is the dashboard being pedantic about someone else's
   * wiring. An explicit list therefore accepts any entity; the automatic list
   * stays with the light domain, which is the only safe guess.
   */
  _lightEntities(item) {
    const ids = Array.isArray(item.lights) && item.lights.length
      ? item.lights.filter((id) => this._hass.states[id])
      : Object.keys(this._hass.states).filter((id) => id.startsWith("light."));
    return ids.sort((a, b) => {
      const an = (this._hass.states[a].attributes.friendly_name || a);
      const bn = (this._hass.states[b].attributes.friendly_name || b);
      return an.localeCompare(bn);
    });
  }

  /** Lights bucketed by their Home Assistant area. */
  _lightsByArea(item) {
    const ids = this._lightEntities(item);
    const buckets = new Map();
    for (const id of ids) {
      const area = this._areaOf(id) || "Senza stanza";
      if (!buckets.has(area)) buckets.set(area, []);
      buckets.get(area).push(id);
    }
    // "Senza stanza" last: it is a leftovers bin, not a room.
    return Array.from(buckets.entries())
      .sort((a, b) => (a[0] === "Senza stanza") - (b[0] === "Senza stanza") || a[0].localeCompare(b[0]))
      .map(([area, list]) => ({ area, ids: list }));
  }

  /**
   * One light.
   *
   * Controls appear only where the fixture declares it can do the thing. The
   * expanded panel is per-light and lives in component state, not in the saved
   * dashboard: which lamp you last fiddled with is not configuration.
   */
  _lightRow(id, item) {
    const st = this._hass.states[id];
    if (!st) return "";
    const domain = domainOf(id);
    const isLight = domain === "light";
    const on = ON_STATES.has(st.state);
    // A relay has no brightness, no colour and no effects. lightCaps reads
    // supported_color_modes, which a switch does not have, so it degrades to
    // "nothing supported" on its own — but the row must still call the right
    // service to turn it on.
    const caps = isLight ? lightCaps(st)
      : { dimmable: false, color: false, temp: false, effects: false, minK: 2000, maxK: 6500 };
    const pct = brightnessPct(st);
    const hex = lightHex(st);
    const kelvin = Number(st.attributes.color_temp_kelvin) || null;
    const open = !!(this._lightOpen || {})[id];
    const name = st.attributes.friendly_name || id;
    const swatch = on ? (hex || (kelvin ? kelvinToHex(kelvin) : "#ffd166")) : "";
    const hasPanel = caps.dimmable || caps.color || caps.temp || caps.effects;

    const sub = !on ? (isLight ? "spenta" : "spento")
      : [pct !== null ? pct + "%" : null,
         kelvin ? kelvin + "K" : null,
         st.attributes.effect && st.attributes.effect !== "None" ? st.attributes.effect : null]
        .filter(Boolean).join(" · ") || (isLight ? "accesa" : "acceso");

    return `<div class="li-item${on ? " on" : ""}${open ? " open" : ""}" ${swatch ? `style="--lc:${esc(swatch)}"` : ""}>
      <div class="li-row">
        ${(() => {
          // The card exposed an "azione al tocco" setting that this row simply
          // ignored: whatever you chose, the name opened the details and the
          // bulb switched. A control that does nothing is worse than no
          // control, because it makes the user believe the feature is broken
          // everywhere else too. Now the setting is honoured here as well, and
          // as everywhere the icon does the opposite of the row.
          const toggleFirst = (item.row_action || "toggle") === "toggle";
          const bulb = `<button class="li-bulb" data-${toggleFirst ? `more-info="${esc(id)}"` : `light-toggle="${esc(id)}"`}
              title="${toggleFirst ? "Apri i dettagli" : (on ? "Spegni" : "Accendi") + " " + esc(name)}">
            <ha-icon icon="${esc(autoIcon(id, st))}"></ha-icon>
          </button>`;
          const label = `<button class="li-name" data-${toggleFirst ? `light-toggle="${esc(id)}"` : `more-info="${esc(id)}"`}>
            <strong>${esc(name)}</strong><small>${esc(sub)}</small>
          </button>`;
          return bulb + label;
        })()}
        ${caps.dimmable ? `<input class="li-dim" type="range" min="1" max="100" step="1"
          value="${pct === null ? (on ? 100 : 0) : pct}" data-light-bri="${esc(id)}"
          title="Intensità" ${on ? "" : "disabled"}>` : ""}
        ${hasPanel ? `<button class="li-more ${open ? "on" : ""}" data-light-open="${esc(id)}" title="Colore e opzioni">
          <ha-icon icon="${open ? "mdi:chevron-up" : "mdi:tune-variant"}"></ha-icon></button>` : ""}
      </div>
      ${open && hasPanel ? `<div class="li-panel">
        ${caps.color ? `<div class="li-block">
          <span class="li-lbl">COLORE</span>
          <div class="li-swatches">
            ${LIGHT_SWATCHES.map((sw) => `<button class="li-sw" style="--sw:${esc(sw.hex)}"
              data-light-color="${esc(id)}|${esc(sw.hex)}" title="${esc(sw.l)}"></button>`).join("")}
            <label class="li-sw custom" title="Colore personalizzato">
              <input type="color" value="${esc(hex || "#ffffff")}" data-light-pick="${esc(id)}">
            </label>
          </div>
        </div>` : ""}
        ${caps.temp ? `<div class="li-block">
          <span class="li-lbl">TEMPERATURA · ${kelvin ? kelvin + "K" : "—"}</span>
          <input class="li-kelvin" type="range" min="${caps.minK}" max="${caps.maxK}" step="50"
            value="${kelvin || Math.round((caps.minK + caps.maxK) / 2)}" data-light-temp="${esc(id)}"
            style="--kg:linear-gradient(90deg,${esc(kelvinToHex(caps.minK))},${esc(kelvinToHex(Math.round((caps.minK + caps.maxK) / 2)))},${esc(kelvinToHex(caps.maxK))})">
          <div class="li-presets">${WHITE_PRESETS.filter((w) => w.k >= caps.minK && w.k <= caps.maxK).map((w) =>
            `<button class="li-preset" data-light-kelvin="${esc(id)}|${w.k}" style="--sw:${esc(kelvinToHex(w.k))}">${esc(w.l)}</button>`).join("")}</div>
        </div>` : ""}
        ${caps.effects ? `<div class="li-block">
          <span class="li-lbl">EFFETTO</span>
          <select data-light-effect="${esc(id)}">
            ${st.attributes.effect_list.slice(0, 60).map((e) =>
              `<option value="${esc(e)}" ${st.attributes.effect === e ? "selected" : ""}>${esc(e)}</option>`).join("")}
          </select>
        </div>` : ""}
        <div class="li-block">
          <span class="li-lbl">ORARI</span>
          ${this._scheduleRows(id)}
          <button class="mini wide" data-sched-add="${esc(id)}"><ha-icon icon="mdi:clock-plus-outline"></ha-icon> AGGIUNGI UN ORARIO</button>
        </div>
      </div>` : ""}
    </div>`;
  }

  _lightsBody(item) {
    if (!this._registry && !this._registryLoading) this._loadRegistry();
    this._loadSchedule();
    const groups = item.group_by_area === false
      ? [{ area: "", ids: this._lightEntities(item) }]
      : this._lightsByArea(item);
    const all = groups.reduce((n, g) => n + g.ids.length, 0);
    if (!all) {
      return `<div class="ov-empty"><ha-icon icon="mdi:lightbulb-off-outline"></ha-icon>
        <span>Nessuna luce trovata in Home Assistant. Quando ne aggiungerai — comprese quelle RGB — compariranno qui con i loro comandi.</span></div>`;
    }
    const onCount = groups.reduce((n, g) =>
      n + g.ids.filter((id) => ON_STATES.has(this._hass.states[id].state)).length, 0);

    return `<div class="li">
      <div class="li-head">
        <div class="li-count"><strong>${onCount}</strong><span>di ${all} accese</span></div>
        <div class="li-actions">
          <button class="li-all" data-lights-all="on"><ha-icon icon="mdi:lightbulb-on"></ha-icon> TUTTE</button>
          <button class="li-all" data-lights-all="off"><ha-icon icon="mdi:lightbulb-off"></ha-icon> SPEGNI</button>
        </div>
      </div>
      ${groups.map((g) => `<section class="li-group">
        ${g.area ? `<header><ha-icon icon="mdi:door-open"></ha-icon><strong>${esc(g.area)}</strong>
          <em>${g.ids.filter((id) => ON_STATES.has(this._hass.states[id].state)).length}/${g.ids.length}</em>
          <button class="act-off" data-lights-area="${esc(g.area)}" title="Spegni le luci di questa stanza"><ha-icon icon="mdi:power"></ha-icon></button>
        </header>` : ""}
        ${g.ids.map((id) => this._lightRow(id, item)).join("")}
      </section>`).join("")}
    </div>`;
  }

  // ------------------------------------------------------ irrigazione ---

  _irrigationZones(item) {
    const zones = Array.isArray(item.zones) ? item.zones : [];
    return zones.filter((z) => z && z.entity);
  }

  /** The countdown still running on an entity, if any. */
  _timerFor(entityId) {
    const timers = (this._schedule && this._schedule.timers) || [];
    return timers.find((t) => t.entity_id === entityId) || null;
  }

  _zoneRow(zone, item) {
    const st = this._hass.states[zone.entity];
    const name = zone.name || (st && st.attributes.friendly_name) || zone.entity;
    if (!st) {
      return `<div class="irr-zone missing">
        <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
        <div class="irr-txt"><strong>${esc(name)}</strong><small>${esc(zone.entity)} non esiste in Home Assistant</small></div>
      </div>`;
    }
    const open = ["on", "open", "opening"].includes(st.state);
    const timer = this._timerFor(zone.entity);
    const ends = timer ? Date.parse(timer.ends_at) : null;
    const left = ends ? Math.max(0, Math.round((ends - Date.now()) / 60000)) : null;
    const moisture = zone.moisture && this._hass.states[zone.moisture];
    const minutes = Number(zone.minutes) || 10;

    return `<div class="irr-zone${open ? " running" : ""}">
      <div class="irr-row">
        <button class="irr-icon" data-zone-toggle="${esc(zone.entity)}" title="${open ? "Chiudi" : "Apri"} ${esc(name)}">
          <ha-icon icon="${esc(zone.icon || (open ? "mdi:sprinkler-variant" : "mdi:sprinkler"))}"></ha-icon>
        </button>
        <div class="irr-txt">
          <strong>${esc(name)}</strong>
          <small>${esc(open
            ? (left !== null ? `in irrigazione · ancora ${left} min` : "in irrigazione")
            : "chiusa")}${moisture ? esc(" · terreno " + moisture.state + (moisture.attributes.unit_of_measurement || "%")) : ""}</small>
        </div>
        ${open
          ? `<button class="irr-stop" data-zone-stop="${esc(zone.entity)}"><ha-icon icon="mdi:stop"></ha-icon> FERMA</button>`
          : `<div class="irr-runs">
              ${(Array.isArray(item.presets) && item.presets.length ? item.presets : RUN_PRESETS)
                .map((m) => `<button class="irr-run${m === minutes ? " main" : ""}" data-zone-run="${esc(zone.entity)}|${m}">${m}′</button>`).join("")}
            </div>`}
      </div>
      ${moisture && Number.isFinite(parseFloat(moisture.state)) ? `<div class="irr-moist">
        <i style="width:${Math.max(2, Math.min(100, parseFloat(moisture.state)))}%"></i>
      </div>` : ""}
      ${this._scheduleRows(zone.entity)}
      <button class="mini wide" data-sched-add="${esc(zone.entity)}"><ha-icon icon="mdi:clock-plus-outline"></ha-icon> PROGRAMMA UN ORARIO</button>
    </div>`;
  }

  _irrigationBody(item) {
    this._loadSchedule();
    const zones = this._irrigationZones(item);
    if (!zones.length) {
      const candidates = Object.keys(this._hass.states)
        .filter((id) => IRRIGATION_DOMAINS.includes(domainOf(id)) && /irrig|sprinkl|valvol|valve|giardin|orto|goccia/i.test(id)).length;
      return `<div class="ov-empty"><ha-icon icon="mdi:sprinkler-variant"></ha-icon>
        <span>Nessuna zona configurata. Aggiungi le elettrovalvole dall'editor: ogni zona avrà avvio a tempo garantito da Home Assistant — non dal browser — e i suoi programmi settimanali.${
          candidates ? ` ${candidates} entità dal nome compatibile già presenti.` : ""}</span></div>`;
    }
    const running = zones.filter((z) => {
      const st = this._hass.states[z.entity];
      return st && ["on", "open", "opening"].includes(st.state);
    });
    const rain = item.rain_sensor && this._hass.states[item.rain_sensor];
    const raining = rain && (ON_STATES.has(rain.state) || parseFloat(rain.state) > 0);

    return `<div class="irr">
      <div class="irr-head">
        <div class="act-count"><strong>${running.length}</strong><span>zone attive</span></div>
        ${rain ? `<div class="irr-rain${raining ? " wet" : ""}">
          <ha-icon icon="${raining ? "mdi:weather-pouring" : "mdi:weather-sunny"}"></ha-icon>
          <span>${esc(raining ? "Sta piovendo: valuta di rimandare" : "Nessuna pioggia")}</span>
        </div>` : ""}
        ${running.length ? `<button class="irr-stop" data-zones-stop><ha-icon icon="mdi:stop-circle-outline"></ha-icon> FERMA TUTTO</button>` : ""}
      </div>
      ${zones.map((z) => this._zoneRow(z, item)).join("")}
    </div>`;
  }

  // ------------------------------------------------- orari programmati ---

  /**
   * Timed jobs for one entity, read from the integration's scheduler.
   *
   * The list is deliberately not part of the dashboard document: a schedule is
   * something Home Assistant must run whether or not anybody has this panel
   * open, so it lives in the integration and is only edited from here.
   */
  _scheduleRows(entityId) {
    const jobs = ((this._schedule && this._schedule.jobs) || [])
      .filter((j) => j.entity_id === entityId);
    if (!jobs.length) return "";
    const dayNames = { mon: "L", tue: "M", wed: "M", thu: "G", fri: "V", sat: "S", sun: "D" };
    return `<div class="sched-list">${jobs.map((j) => `
      <div class="sched-row${j.enabled ? "" : " off"}">
        <ha-icon icon="${j.action === "on" ? "mdi:weather-sunset-up" : "mdi:weather-night"}"></ha-icon>
        <input class="sched-time" type="time" value="${esc(j.at)}" data-sched-prop="${esc(j.id)}|at">
        <select class="sched-act" data-sched-prop="${esc(j.id)}|action">
          <option value="on" ${j.action === "on" ? "selected" : ""}>accende</option>
          <option value="off" ${j.action === "off" ? "selected" : ""}>spegne</option>
        </select>
        <em>${["mon","tue","wed","thu","fri","sat","sun"].map((d) =>
          `<button class="${j.days.includes(d) ? "on" : ""}" data-sched-day="${esc(j.id)}|${d}">${dayNames[d]}</button>`).join("")}</em>
        <button class="mini" data-sched-toggle="${esc(j.id)}" title="${j.enabled ? "Sospendi" : "Riattiva"}">
          <ha-icon icon="${j.enabled ? "mdi:pause" : "mdi:play"}"></ha-icon></button>
        <button class="mini danger" data-sched-remove="${esc(j.id)}"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>`).join("")}</div>`;
  }

  /** Pull jobs and running countdowns once per session. */
  _loadSchedule() {
    if (this._schedule || this._schedulePending) return;
    this._schedulePending = true;
    this._hass.callWS({ type: "cyborg_dashboard/schedule" })
      .then((res) => {
        this._schedule = { jobs: (res && res.jobs) || [], timers: (res && res.timers) || [] };
        this._schedulePending = false;
        this._touch(true);
      })
      .catch(() => {
        // An older integration has no scheduler: the cards still control
        // everything live, they just cannot show or edit programmes.
        this._schedule = { jobs: [], timers: [], unavailable: true };
        this._schedulePending = false;
        this._touch(true);
      });
  }

  /** Stop a running countdown, optionally closing the valve as well. */
  _cancelRun(entityId, turnOff) {
    this._hass.callWS({ type: "cyborg_dashboard/run_for/cancel", entity_id: entityId, turn_off: !!turnOff })
      .then(() => {
        this._schedule = { ...(this._schedule || { jobs: [] }),
          timers: ((this._schedule && this._schedule.timers) || []).filter((t) => t.entity_id !== entityId) };
        this._touch(true);
      })
      .catch(() => { /* the entity was switched off anyway; nothing to report */ });
  }

  /** Push the whole job list back and re-arm the listeners in Home Assistant. */
  _saveSchedule(jobs) {
    this._schedule = { ...(this._schedule || { timers: [] }), jobs };
    this._touch(true);
    this._hass.callWS({ type: "cyborg_dashboard/schedule/set", jobs })
      .then((res) => {
        this._schedule = { ...(this._schedule || { timers: [] }), jobs: (res && res.jobs) || jobs };
        this._touch(true);
      })
      .catch(() => {
        this._error = "Impossibile salvare gli orari: pianificatore non disponibile";
        this._touch(true);
      });
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

  // ------------------------------------------------------ monitoraggio ---

  /** Readings for one diagnostic group, auto-discovered by device_class. */
  _monitorRows(group, item) {
    const limits = monitorLimits(group, item);
    const manual = item.entities && item.entities[group.key];
    const ids = Array.isArray(manual) && manual.length
      ? manual
      : Object.keys(this._hass.states).filter((id) =>
          this._hass.states[id].attributes.device_class === group.key
          && !id.startsWith("update."));
    const rows = [];
    for (const id of ids) {
      const st = this._hass.states[id];
      if (!st) continue;
      const n = parseFloat(st.state);
      if (!Number.isFinite(n)) continue;
      // The power factor is judged on magnitude: -0.95 is as good as +0.95,
      // the sign only says whether the load is inductive or capacitive.
      const verdict = limitVerdict(group.key === "power_factor" ? Math.abs(n) : n, limits);
      const alarm = verdict === "alarm";
      const warn = verdict === "warn";
      rows.push({ id, st, n, warn, alarm,
        name: st.attributes.friendly_name || id,
        unit: st.attributes.unit_of_measurement || group.unit });
    }
    // anything out of tolerance floats to the top: on a dense diagnostic panel
    // the point is spotting the one bad reading, not reading all forty
    rows.sort((a, b) => (b.alarm - a.alarm) || (b.warn - a.warn) || a.name.localeCompare(b.name));
    return rows.slice(0, item.max_per_group || 8);
  }

  /** Semicircular gauge of the present draw against the contractual limit. */
  _gridGauge(item) {
    const limit = Math.max(500, item.limit_w || 3300);
    const st = item.grid_entity && this._hass.states[item.grid_entity];
    const raw = powerWatts(st);
    const draw = raw === null ? null : Math.max(0, raw);
    const pct = draw === null ? 0 : Math.min(1.25, draw / limit);
    const level = pct >= 1 ? "over" : pct >= 0.8 ? "warn" : "ok";
    const f = fmtPower(draw);
    const lf = fmtPower(limit);

    // 180deg sweep, radius 92 around (120,112)
    const R = 92, CX = 120, CY = 112;
    const pt = (frac) => {
      const a = Math.PI * (1 - Math.min(1, frac));
      return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
    };
    const arc = (from, to, cls, extra) => {
      const [x1, y1] = pt(from), [x2, y2] = pt(to);
      // SVG large-arc-flag means "sweep more than 180 degrees", and this gauge
      // is a 180 degree dial: frac 0..1 maps onto half a turn, so the sweep is
      // (to - from) * 180 and can never exceed 180. The old test was
      // (to - from) > 0.5, which flipped the flag as soon as the needle passed
      // half load and made the renderer take the long way round the circle —
      // 266 degrees instead of 94 — which is why the arc came out as two
      // detached blobs above 50%. Below 50% it happened to be right, which is
      // why it survived this long.
      const large = 0;
      return `<path class="mg-arc ${cls}" ${extra || ""} d="M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)}"/>`;
    };
    const [nx, ny] = pt(Math.min(1, pct));

    return `<div class="mg ${level}">
        <svg class="mg-svg" viewBox="0 0 240 132">
          ${arc(0, 1, "track")}
          ${(() => { const [tx, ty] = pt(0.8), [ix, iy] = [CX + (R - 11) * Math.cos(Math.PI * 0.2), CY - (R - 11) * Math.sin(Math.PI * 0.2)];
             return `<line class="mg-tick" x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}"/>
               <text class="mg-tickl" x="${(tx + 6).toFixed(1)}" y="${(ty - 6).toFixed(1)}">80%</text>`; })()}
          ${draw !== null && pct > 0.002 ? arc(0, Math.min(1, pct), "value") : ""}
          ${draw !== null ? `<circle class="mg-dot" cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="5"/>` : ""}
          <text class="mg-min" x="22" y="128">0</text>
          <text class="mg-max" x="218" y="128">${esc(lf.v + " " + lf.u)}</text>
        </svg>
        <div class="mg-read">
          <strong>${esc(f.v)}<i>${esc(f.u)}</i></strong>
          <span>${draw === null ? "sensore rete non collegato"
            : level === "over" ? `oltre il limite di ${esc(lf.v + " " + lf.u)}`
            : `${Math.round(pct * 100)}% del contatore · margine ${esc(fmtPower(Math.max(0, limit - draw)).v + " " + fmtPower(Math.max(0, limit - draw)).u)}`}</span>
        </div>
      </div>`;
  }

  _monitorBody(item) {
    const groups = MONITOR_GROUPS
      .filter((g) => !Array.isArray(item.groups) || !item.groups.length || item.groups.includes(g.key))
      .map((g) => ({ g, rows: this._monitorRows(g, item) }))
      .filter((x) => x.rows.length);

    const issues = groups.reduce((t, x) => t + x.rows.filter((r) => r.warn || r.alarm).length, 0);

    return `<div class="mon">
        ${this._gridGauge(item)}
        <div class="mon-status ${issues ? "bad" : "good"}">
          <ha-icon icon="${issues ? "mdi:alert-circle-outline" : "mdi:check-circle-outline"}"></ha-icon>
          <span>${issues ? `${issues} letture fuori tolleranza` : "Tutte le letture in tolleranza"}</span>
        </div>
        ${groups.length ? groups.map(({ g, rows }) => `
          <div class="mon-group">
            <div class="mon-head"><ha-icon icon="${esc(g.icon)}"></ha-icon><strong>${esc(g.label)}</strong>
              <em>${(() => {
                const custom = !!(item.limits && item.limits[g.key] && Object.keys(item.limits[g.key]).length);
                // The numbers in force always, and the standard they came from
                // when untouched: an installer needs to know he is being judged
                // against EN 50160 and not against somebody's preference.
                return esc(limitHint(g, monitorLimits(g, item)) + " · " + (custom ? "soglia personalizzata" : g.std));
              })()}</em>
              <span>${rows.length}</span></div>
            <div class="mon-rows">${rows.map((r) => `
              <button class="mon-row ${r.alarm ? "alarm" : r.warn ? "warn" : ""}" data-more-info="${esc(r.id)}">
                <span class="mon-name">${esc(r.name)}</span>
                <span class="mon-val">${esc(Math.abs(r.n) >= 100 ? r.n.toFixed(0) : r.n.toFixed(Math.abs(r.n) < 10 ? 2 : 1))}<i>${esc(r.unit)}</i></span>
              </button>`).join("")}</div>
          </div>`).join("")
        : `<div class="ov-empty"><ha-icon icon="mdi:gauge-empty"></ha-icon>
             <span>Nessun sensore diagnostico trovato. Servono entità con device_class tensione, corrente, temperatura, frequenza o fattore di potenza.</span></div>`}
      </div>`;
  }

  // ----------------------------------------------------------- camere ---

  _cameraIds(item) {
    if (Array.isArray(item.cameras) && item.cameras.length) {
      return item.cameras.filter((id) => this._hass.states[id]);
    }
    return Object.keys(this._hass.states).filter((id) => id.startsWith("camera."));
  }

  _cameraBody(item) {
    const ids = this._cameraIds(item);
    if (!ids.length) {
      return `<div class="ov-empty"><ha-icon icon="mdi:cctv-off"></ha-icon>
        <span>Nessuna videocamera in Home Assistant.</span></div>`;
    }
    // one cache-buster per refresh tick, shared by every thumbnail so they
    // update together instead of each pulling on its own timer
    const tick = this._camTick || 0;
    this._scheduleCameraRefresh(item);
    return `<div class="cams">${ids.map((id) => {
      const st = this._hass.states[id];
      const url = cameraStill(id, st);
      const off = st.state === "unavailable" || !url;
      const live = item.live === true;
      const src = live ? cameraStream(id, st) : url;
      return `<button class="cam" data-cam-open="${esc(id)}" ${off ? "disabled" : ""}>
          ${off ? `<div class="cam-off"><ha-icon icon="mdi:cctv-off"></ha-icon></div>`
                : `<img class="cam-img" data-cam="${esc(id)}"
                     src="${esc(src)}${src.includes("?") ? "&" : "?"}_t=${tick}" alt=""
                     loading="eager" decoding="async" fetchpriority="high">`}
          <span class="cam-bar">
            <ha-icon icon="mdi:cctv"></ha-icon>
            <em>${esc(st.attributes.friendly_name || id)}</em>
            ${off ? '<i class="cam-dot off"></i>' : '<i class="cam-dot"></i>'}
          </span>
        </button>`;
    }).join("")}</div>`;
  }

  /**
   * Keep the thumbnails fresh.
   *
   * The URL is rebuilt from the entity's *current* state on every tick rather
   * than patched onto the previous src. Home Assistant rotates a camera's
   * access_token periodically, and a token baked into the img element goes
   * stale: every request after the rotation returns 401 and the browser draws
   * its broken-image glyph, which is exactly the little "?" that appeared over
   * the camera tile. Re-reading the token each time makes the rotation a
   * non-event.
   *
   * A live camera (item.live) is an MJPEG stream that updates itself, so it is
   * left alone: reassigning its src would restart the stream every few seconds.
   */
  _scheduleCameraRefresh(item) {
    if (this._camTimer) return;
    const every = Math.max(5, item.refresh || 10) * 1000;
    if (item.live === true) return;
    this._camTimer = setInterval(() => {
      if (!this.isConnected) { clearInterval(this._camTimer); this._camTimer = null; return; }
      // swap the src in place: a full re-render would tear down every <img>
      // and make the whole wall of thumbnails flash
      this._camTick = (this._camTick || 0) + 1;
      for (const img of Array.from(this.querySelectorAll(".cam-img"))) {
        const id = img.getAttribute("data-cam");
        const fresh = id ? cameraStill(id, this._hass.states[id]) : null;
        if (!fresh) continue;
        img.src = fresh + (fresh.includes("?") ? "&" : "?") + "_t=" + this._camTick;
      }
    }, every);
  }

  // ---------------------------------------------------------- overlay ---

  _openOverlay(kind, entity) {
    this._overlay = { kind, entity };
    this._touch();
  }

  _renderOverlay() {
    const o = this._overlay;
    if (!o) return "";
    const st = this._hass.states[o.entity];
    if (!st) return "";
    const body = o.kind === "camera" ? this._cameraLive(o.entity, st) : this._weatherDetail(o.entity, st);
    return `<div class="ovl" data-overlay-close>
        <div class="ovl-panel" data-overlay-stop>
          <div class="ovl-head">
            <ha-icon icon="${esc(o.kind === "camera" ? "mdi:cctv" : "mdi:weather-partly-cloudy")}"></ha-icon>
            <div class="ovl-title"><strong>${esc(st.attributes.friendly_name || o.entity)}</strong>
              ${o.kind === "camera" ? "" : `<small>${esc(this._weatherPlace(st))}</small>`}</div>
            <button class="icon" data-overlay-close><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          ${body}
        </div>
      </div>`;
  }

  _cameraLive(entityId, st) {
    const url = cameraStream(entityId, st);
    return `<div class="ovl-body cam-live">
        ${url ? `<img src="${esc(url)}" alt="">`
              : '<div class="ov-empty"><ha-icon icon="mdi:cctv-off"></ha-icon><span>Flusso non disponibile.</span></div>'}
        <div class="cam-live-meta">
          <span><i class="cam-dot"></i> diretta</span>
          <span>${esc(stateWords(st.state, null))}</span>
          <button class="secondary" data-more-info="${esc(entityId)}"><ha-icon icon="mdi:information-outline"></ha-icon> DETTAGLI</button>
        </div>
      </div>`;
  }

  /**
   * Where the forecast is FOR, and who it comes from.
   *
   * The panel was titled with the entity's friendly name — "Forecast Casa
   * Oscar" — which is a label somebody typed, not a place. On a weather panel
   * the first question is "of where", and nothing on screen answered it.
   *
   * The coordinates come from Home Assistant's own configuration, so they are
   * the real position the forecast was requested for, not a guess from a name.
   * The provider comes from the entity's `attribution`, trimmed of its polite
   * wording: knowing it is met.no rather than a generic "weather" matters when
   * two entities disagree.
   */
  _weatherPlace(st) {
    const cfg = (this._hass && this._hass.config) || {};
    const bits = [];
    if (cfg.location_name) bits.push(cfg.location_name);
    if (Number.isFinite(cfg.latitude) && Number.isFinite(cfg.longitude)) {
      bits.push(cfg.latitude.toFixed(3) + ", " + cfg.longitude.toFixed(3));
    }
    const attribution = String((st.attributes && st.attributes.attribution) || "");
    const source = attribution
      .replace(/^.*?\bfrom\b\s*/i, "")
      .replace(/,.*$/, "")
      .trim();
    if (source) bits.push(source);
    return bits.join(" \u00b7 ") || "posizione non configurata";
  }

  _weatherDetail(id, st) {
    const a = st.attributes;
    const [icon, label] = WEATHER_CONDITIONS[st.state] || ["mdi:weather-cloudy", String(st.state)];
    const unit = a.temperature_unit || "°C";

    // bit 2 = hourly forecast; asking an entity that lacks it returns an error
    if (a.supported_features & 2) {
      this._subscribe("wxh:" + id,
        { type: "weather/subscribe_forecast", forecast_type: "hourly", entity_id: id },
        (ev) => { this._hourly = this._hourly || {}; this._hourly[id] = (ev && ev.forecast) || []; this._touch(); });
    }
    const hourly = ((this._hourly || {})[id] || []).slice(0, 12);
    const daily = ((this._forecast || {})[id] || []).slice(0, 7);

    const temps = hourly.map((h) => h.temperature).filter((n) => Number.isFinite(n));
    const spark = temps.length > 1
      ? hourlyChart(temps, hourly.map((h) => hhmm2(h.datetime)), unit,
          hourly.map((h) => {
            const [, cl] = WEATHER_CONDITIONS[h.condition] || ["", String(h.condition || "")];
            return { cond: cl,
              rain: num(h.precipitation_probability) !== null ? num(h.precipitation_probability) + "%" : null,
              mm: num(h.precipitation) !== null && num(h.precipitation) > 0 ? num(h.precipitation) + " mm" : null,
              wind: num(h.wind_speed) !== null ? Math.round(num(h.wind_speed)) + " " + (a.wind_speed_unit || "km/h") : null };
          })) : "";

    const sun = this._hass.states["sun.sun"];
    const hhmm = hhmm2;

    const facts = [
      a.temperature !== undefined ? ["mdi:thermometer", "Temperatura", Math.round(a.temperature * 10) / 10 + unit] : null,
      a.apparent_temperature !== undefined ? ["mdi:thermometer-lines", "Percepita", Math.round(a.apparent_temperature) + unit] : null,
      a.humidity !== undefined ? ["mdi:water-percent", "Umidità", Math.round(a.humidity) + "%"] : null,
      a.pressure !== undefined ? ["mdi:gauge", "Pressione", Math.round(a.pressure) + " " + (a.pressure_unit || "hPa")] : null,
      a.wind_speed !== undefined ? ["mdi:weather-windy", "Vento", Math.round(a.wind_speed) + " " + (a.wind_speed_unit || "km/h")] : null,
      a.wind_bearing !== undefined ? ["mdi:compass-outline", "Direzione", windRose(a.wind_bearing)] : null,
      a.visibility !== undefined ? ["mdi:eye-outline", "Visibilità", a.visibility + " " + (a.visibility_unit || "km")] : null,
      a.uv_index !== undefined ? ["mdi:weather-sunny-alert", "Indice UV", String(a.uv_index)] : null,
      sun ? ["mdi:weather-sunset-up", "Alba", hhmm(sun.attributes.next_rising)] : null,
      sun ? ["mdi:weather-sunset-down", "Tramonto", hhmm(sun.attributes.next_setting)] : null,
    ].filter(Boolean);

    return `<div class="ovl-body wxd">
        <div class="wxd-now">
          <ha-icon class="wxd-icon" icon="${esc(icon)}"></ha-icon>
          <div>
            <div class="wxd-temp">${esc(a.temperature !== undefined ? Math.round(a.temperature) : "—")}<span>${esc(unit)}</span></div>
            <div class="wxd-cond">${esc(label)}</div>
          </div>
        </div>

        ${hourly.length ? `<div class="wxd-block">
          <h4>Prossime ore</h4>
          ${spark ? `<div class="wxd-spark">${spark}</div>` : ""}
          <div class="wxd-hours">${hourly.map((h) => {
            const [hi] = WEATHER_CONDITIONS[h.condition] || ["mdi:weather-cloudy"];
            return `<div class="wxd-hour">
              <span>${esc(hhmm(h.datetime))}</span>
              <ha-icon icon="${esc(hi)}"></ha-icon>
              <strong>${esc(h.temperature !== undefined ? Math.round(h.temperature) + "°" : "—")}</strong>
              ${h.precipitation_probability !== undefined && h.precipitation_probability !== null
                ? `<em>${esc(Math.round(h.precipitation_probability))}%</em>` : ""}
            </div>`;
          }).join("")}</div>
        </div>` : ""}

        ${daily.length ? `<div class="wxd-block">
          <h4>Prossimi giorni</h4>
          <div class="wxd-days">${daily.map((d, di2) => {
            const dt = new Date(d.datetime);
            const [di, dlabel] = WEATHER_CONDITIONS[d.condition] || ["mdi:weather-cloudy", String(d.condition || "")];
            const open = (this._wxDay || {})[id] === di2;
            // Every field the forecast actually carries, and nothing invented:
            // met.no gives wind and cloud cover, other providers give humidity
            // or UV, and a row that always shows the same six labels would be
            // half empty dashes on most of them.
            const detail = [
              ["mdi:thermometer-high", "Massima", num(d.temperature) !== null ? num(d.temperature) + "°" : null],
              ["mdi:thermometer-low", "Minima", num(d.templow) !== null ? num(d.templow) + "°" : null],
              ["mdi:weather-pouring", "Pioggia", num(d.precipitation) !== null ? num(d.precipitation) + " mm" : null],
              ["mdi:umbrella-outline", "Probabilità", num(d.precipitation_probability) !== null ? num(d.precipitation_probability) + "%" : null],
              ["mdi:weather-windy", "Vento", num(d.wind_speed) !== null ? Math.round(num(d.wind_speed)) + " " + (a.wind_speed_unit || "km/h") : null],
              ["mdi:compass-outline", "Direzione", num(d.wind_bearing) !== null ? windRose(num(d.wind_bearing)) : null],
              ["mdi:water-percent", "Umidità", num(d.humidity) !== null ? Math.round(num(d.humidity)) + "%" : null],
              ["mdi:weather-cloudy", "Nuvolosità", num(d.cloud_coverage) !== null ? Math.round(num(d.cloud_coverage)) + "%" : null],
              ["mdi:weather-sunny-alert", "Indice UV", num(d.uv_index) !== null ? String(num(d.uv_index)) : null],
              ["mdi:gauge", "Pressione", num(d.pressure) !== null ? Math.round(num(d.pressure)) + " " + (a.pressure_unit || "hPa") : null],
            ].filter((row) => row[2] !== null);
            return `<div class="wxd-day-wrap ${open ? "open" : ""}">
              <button class="wxd-day" data-wx-day="${esc(id)}|${di2}">
                <span>${esc(WEEKDAYS[dt.getDay()] || "")}</span>
                <ha-icon icon="${esc(di)}"></ha-icon>
                <b>${esc(num(d.temperature) !== null ? Math.round(num(d.temperature)) + "°" : "—")}</b>
                <i>${esc(num(d.templow) !== null ? Math.round(num(d.templow)) + "°" : "")}</i>
                ${d.precipitation ? `<em>${esc(d.precipitation)} mm</em>` : ""}
                <ha-icon class="wxd-chev" icon="${open ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon>
              </button>
              ${open ? `<div class="wxd-day-detail">
                <div class="wxd-day-cond">${esc(dlabel)}${
                  dt ? " · " + esc(dt.getDate() + "/" + (dt.getMonth() + 1)) : ""}</div>
                <div class="wxd-facts">${detail.map(([ic, k, v]) => `
                  <div class="wxd-fact"><ha-icon icon="${esc(ic)}"></ha-icon>
                    <span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div>
              </div>` : ""}
            </div>`;
          }).join("")}</div>
        </div>` : ""}

        <div class="wxd-block">
          <h4>Condizioni attuali</h4>
          <div class="wxd-facts">${facts.map(([i, k, v]) => `
            <div class="wxd-fact"><ha-icon icon="${esc(i)}"></ha-icon>
              <span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div>
        </div>
      </div>`;
  }

  // ------------------------------------------------- analisi economica ---

  /**
   * Fetch kWh totals for the configured statistics over the chosen window.
   *
   * A statistic's `sum` is a monotonically increasing meter, so the energy in
   * a window is last minus first — not the sum of the buckets, which would
   * count the whole meter reading over and over.
   */
  _loadEconomy(item) {
    const period = ECONOMY_PERIODS.find((p) => p.key === (item.period || "month")) || ECONOMY_PERIODS[2];
    const devices = Array.isArray(item.devices) ? item.devices : [];
    const deviceIds = devices.map((d) => d.entity).filter(Boolean);
    // One statistics call for the meters and every device together: the
    // recorder query is the expensive part, and asking for twelve statistics
    // costs barely more than asking for three.
    const ids = ["grid_import", "grid_export", "solar"].map((k) => item[k])
      .filter(Boolean).concat(deviceIds);
    const key = item.id + "|" + period.key + "|" + ids.join(",");
    this._economy = this._economy || {};
    if (this._economy[key] && Date.now() - this._economy[key].ts < 300000) return this._economy[key];
    if (this._economyPending === key) return this._economy[key] || null;
    if (!ids.length) return null;

    this._economyPending = key;
    const end = new Date();
    const start = new Date(end.getTime() - period.days * 86400000);
    this._hass.callWS({
      type: "recorder/statistics_during_period",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: ids,
      period: period.bucket,
      types: ["sum"],
    }).then((res) => {
      const total = (id) => {
        const rows = (res && res[id]) || [];
        const sums = rows.map((r) => r.sum).filter((n) => Number.isFinite(n));
        if (sums.length < 2) return sums.length === 1 ? 0 : null;
        return Math.max(0, sums[sums.length - 1] - sums[0]);
      };
      const perDevice = {};
      for (const id of deviceIds) perDevice[id] = total(id);
      this._economy[key] = { ts: Date.now(), period: period.key,
        imported: item.grid_import ? total(item.grid_import) : null,
        exported: item.grid_export ? total(item.grid_export) : null,
        produced: item.solar ? total(item.solar) : null,
        devices: perDevice };
      this._economyPending = null;
      this._touch(true);
    }).catch((err) => {
      this._economy[key] = { ts: Date.now(), error: true,
        message: (err && err.message) || "statistiche non disponibili" };
      this._economyPending = null;
      this._touch(true);
    });
    return null;
  }

  _economyFigures(item, data) {
    const pIn = Number(item.price_import) || 0;
    const pOut = Number(item.price_export) || 0;
    const imported = data.imported || 0;
    const exported = data.exported || 0;
    const produced = data.produced || 0;
    // what the plant kept at home is production minus what went to the grid
    const selfUsed = Math.max(0, produced - exported);
    const cost = imported * pIn;
    const revenue = exported * pOut;
    // the counterfactual an installer is actually asked about: the same house
    // consumption billed entirely at the import tariff
    const withoutPv = (imported + selfUsed) * pIn;
    const net = cost - revenue;
    return { imported, exported, produced, selfUsed, cost, revenue, withoutPv, net,
      saved: withoutPv - net, hasPv: produced > 0 || exported > 0 };
  }

  _economyBody(item) {
    const period = ECONOMY_PERIODS.find((p) => p.key === (item.period || "month")) || ECONOMY_PERIODS[2];
    if (!item.grid_import && !item.solar) {
      return `<div class="ov-empty"><ha-icon icon="mdi:cash-remove"></ha-icon>
        <span>Collega almeno il contatore di energia prelevata dalla rete (kWh) nell'editor della card.</span></div>`;
    }
    const data = this._loadEconomy(item);
    if (!data) {
      return `<div class="ov-empty"><ha-icon icon="mdi:progress-clock"></ha-icon>
        <span>Lettura delle statistiche…</span></div>`;
    }
    if (data.error) {
      return `<div class="ov-empty"><ha-icon icon="mdi:database-alert-outline"></ha-icon>
        <span>${esc(data.message)}. Servono entità con statistiche a lungo termine (state_class: total_increasing).</span></div>`;
    }
    const f = this._economyFigures(item, data);
    const bar = (v, max) => `${max > 0 ? Math.max(2, Math.min(100, (v / max) * 100)) : 0}%`;
    const maxE = Math.max(f.imported, f.exported, f.selfUsed, 0.001);

    return `<div class="eco">
        <div class="eco-tabs">${ECONOMY_PERIODS.map((p) =>
          `<button class="eco-tab ${p.key === period.key ? "on" : ""}" data-eco-period="${p.key}">${esc(p.label)}</button>`).join("")}</div>

        <div class="eco-hero ${f.net < 0 ? "credit" : ""}">
          <span>SPESA NETTA · ${esc(period.label.toUpperCase())}</span>
          <strong>${esc(eur(f.net))}<i>€</i></strong>
          ${f.hasPv ? `<em>senza fotovoltaico: ${esc(eur(f.withoutPv))} €</em>` : ""}
        </div>

        ${f.hasPv ? `<div class="eco-saved">
          <ha-icon icon="mdi:piggy-bank-outline"></ha-icon>
          <div><strong>${esc(eur(f.saved))} €</strong><span>risparmiati grazie all'impianto</span></div>
        </div>` : ""}

        <div class="eco-rows">
          <div class="eco-row cost">
            <span class="eco-k"><ha-icon icon="mdi:transmission-tower-import"></ha-icon> Prelievo</span>
            <span class="eco-bar"><i style="width:${bar(f.imported, maxE)}"></i></span>
            <span class="eco-kwh">${esc(f.imported.toFixed(1))} kWh</span>
            <span class="eco-eur">${esc(eur(f.cost))} €</span>
          </div>
          ${f.selfUsed > 0 ? `<div class="eco-row self">
            <span class="eco-k"><ha-icon icon="mdi:home-lightning-bolt-outline"></ha-icon> Autoconsumo</span>
            <span class="eco-bar"><i style="width:${bar(f.selfUsed, maxE)}"></i></span>
            <span class="eco-kwh">${esc(f.selfUsed.toFixed(1))} kWh</span>
            <span class="eco-eur">+${esc(eur(f.selfUsed * (Number(item.price_import) || 0)))} €</span>
          </div>` : ""}
          ${f.exported > 0 ? `<div class="eco-row rev">
            <span class="eco-k"><ha-icon icon="mdi:transmission-tower-export"></ha-icon> Immissione</span>
            <span class="eco-bar"><i style="width:${bar(f.exported, maxE)}"></i></span>
            <span class="eco-kwh">${esc(f.exported.toFixed(1))} kWh</span>
            <span class="eco-eur">+${esc(eur(f.revenue))} €</span>
          </div>` : ""}
        </div>

        ${this._economyDevices(item, data)}

        <div class="eco-foot">
          <span>prelievo ${esc(eur(Number(item.price_import) || 0))} €/kWh</span>
          ${(Number(item.price_export) || 0) > 0 ? `<span>immissione ${esc(eur(Number(item.price_export) || 0))} €/kWh</span>` : ""}
          ${f.produced > 0 ? `<span>prodotti ${esc(f.produced.toFixed(1))} kWh</span>` : ""}
        </div>
      </div>`;
  }

  /**
   * Per-device detail: what each appliance consumed, and what each source
   * produced, over the selected window.
   *
   * The share is computed against the sum of the *measured* devices, not
   * against household consumption, and the gap between the two is shown
   * explicitly as "non misurato". Presenting six plugs as if they were 100%
   * of the bill would be flattering and wrong: in a normal house the metered
   * loads are a minority of the total, and the honest number is the one an
   * installer can defend in front of the customer.
   */
  _economyDevices(item, data) {
    const devices = Array.isArray(item.devices) ? item.devices : [];
    if (!devices.length) {
      return `<div class="eco-devices empty">
        <ha-icon icon="mdi:chart-donut"></ha-icon>
        <span>Nessun dispositivo nel dettaglio. Aggiungili dall'editor, oppure importali dalla Dashboard Energia di Home Assistant con un clic.</span>
      </div>`;
    }
    const kwh = (data && data.devices) || {};
    const pIn = Number(item.price_import) || 0;
    const pOut = Number(item.price_export) || 0;

    const rows = devices.map((d) => {
      const st = this._hass.states[d.entity];
      const value = Number.isFinite(kwh[d.entity]) ? kwh[d.entity] : null;
      const source = d.kind === "source";
      return {
        entity: d.entity,
        parent: this._parentOf(d.entity, d.parent),
        source,
        name: d.name || (st && st.attributes.friendly_name) || d.entity,
        icon: d.icon || (st ? autoIcon(d.entity, st) : (source ? "mdi:solar-power-variant" : "mdi:power-plug")),
        kwh: value,
        eur: value === null ? null : value * (source ? pOut : pIn),
      };
    }).filter((r) => r.kwh !== null);

    if (!rows.length) {
      return `<div class="eco-devices empty">
        <ha-icon icon="mdi:database-alert-outline"></ha-icon>
        <span>I dispositivi configurati non hanno statistiche a lungo termine nel periodo scelto. Servono sensori di energia in kWh con <code>state_class: total_increasing</code>.</span>
      </div>`;
    }

    const loads = rows.filter((r) => !r.source).sort((a, b) => b.kwh - a.kwh);
    const sources = rows.filter((r) => r.source).sort((a, b) => b.kwh - a.kwh);

    // Hierarchy. A load declared inside another one is already inside its
    // parent's meter reading, so adding both to the total counts those kWh
    // twice and inflates the bill. The child keeps its own figure — that is
    // the point of measuring it — but only the roots are summed, and the
    // parent additionally shows what is left of it once the children are
    // subtracted, which is the number an installer is actually asked for.
    const byEntity = Object.fromEntries(loads.map((r) => [r.entity, r]));
    for (const r of loads) {
      r.children = loads.filter((c) => c.parent === r.entity);
      r.childSum = r.children.reduce((n, c) => n + c.kwh, 0);
      r.own = Math.max(0, r.kwh - r.childSum);
      r.nested = !!(r.parent && byEntity[r.parent]);
    }
    const roots = loads.filter((r) => !r.nested);
    const measured = roots.reduce((n, r) => n + r.kwh, 0);
    const generated = sources.reduce((n, r) => n + r.kwh, 0);
    const houseTotal = (data.imported || 0) + Math.max(0, (data.produced || 0) - (data.exported || 0));
    const unmeasured = Math.max(0, houseTotal - measured);
    const maxRow = Math.max(measured, generated, 0.001);

    const line = (r, depth) => `<button class="eco-dev${r.source ? " src" : ""}${depth ? " child" : ""}"
        ${depth ? `style="--depth:${Math.min(4, depth)}"` : ""} data-more-info="${esc(r.entity)}">
        <ha-icon icon="${esc(r.icon)}"></ha-icon>
        <span class="ed-name">${esc(r.name)}${r.childSum > 0.05
          ? `<i class="ed-own" title="Al netto dei carichi che dipendono da questo">di cui propri ${r.own.toFixed(1)} kWh</i>` : ""}</span>
        <span class="ed-bar"><i style="width:${Math.max(2, Math.min(100, (r.kwh / maxRow) * 100)).toFixed(1)}%"></i></span>
        <span class="ed-kwh">${esc(r.kwh.toFixed(1))} kWh</span>
        <span class="ed-eur">${r.source ? "+" : ""}${esc(eur(r.eur))} €</span>
        ${houseTotal > 0 && !r.source ? `<span class="ed-pct">${Math.round((r.kwh / houseTotal) * 100)}%</span>` : '<span class="ed-pct"></span>'}
      </button>`;

    return `<div class="eco-devices">
      ${loads.length ? `<div class="eco-dev-head"><ha-icon icon="mdi:power-plug"></ha-icon>
          <strong>CONSUMI PER DISPOSITIVO</strong>
          <em>${esc(measured.toFixed(1))} kWh · ${esc(eur(measured * pIn))} €</em></div>
        ${(() => {
          // Recursive, not one level: a fryer on a kitchen socket on the FEM
          // board is three deep, and rendering only direct children would drop
          // the fryer from the list entirely while still subtracting its kWh
          // from its parent. Depth is capped because the data comes from a
          // stored document.
          const walk = (row, depth) => line(row, depth)
            + (depth < 4 ? row.children.map((c) => walk(c, depth + 1)).join("") : "");
          return roots.map((r) => walk(r, 0)).join("");
        })()}
        ${unmeasured > 0.05 ? `<div class="eco-dev unmeasured">
          <ha-icon icon="mdi:help-circle-outline"></ha-icon>
          <span class="ed-name">Non misurato</span>
          <span class="ed-bar"><i style="width:${Math.max(2, Math.min(100, (unmeasured / maxRow) * 100)).toFixed(1)}%"></i></span>
          <span class="ed-kwh">${esc(unmeasured.toFixed(1))} kWh</span>
          <span class="ed-eur">${esc(eur(unmeasured * pIn))} €</span>
          <span class="ed-pct">${houseTotal > 0 ? Math.round((unmeasured / houseTotal) * 100) + "%" : ""}</span>
        </div>` : ""}` : ""}
      ${sources.length ? `<div class="eco-dev-head src"><ha-icon icon="mdi:solar-power-variant"></ha-icon>
          <strong>PRODUZIONE PER SORGENTE</strong>
          <em>${esc(generated.toFixed(1))} kWh</em></div>
        ${sources.map(line).join("")}` : ""}
    </div>`;
  }

  _cardBody(item, st) {
    const type = item.type || "entity";
    if (type === "energyflow") return this._energyFlowBody(item);
    if (type === "weather") return this._weatherBody(item);
    if (type === "active") return this._activeBody(item);
    if (type === "notifications") return this._notificationsBody(item);
    if (type === "people") return this._peopleBody(item);
    if (type === "monitor") return this._monitorBody(item);
    if (type === "camera") return this._cameraBody(item);
    if (type === "economy") return this._economyBody(item);
    if (type === "comfort") return this._comfortBody(item);
    if (type === "thermostat") return this._thermostatBody(item);
    if (type === "ev") return this._evBody(item);
    if (type === "room") return this._roomCardBody(item);
    if (type === "trend") return this._trendBody(item);
    if (type === "lights") return this._lightsBody(item);
    if (type === "irrigation") return this._irrigationBody(item);
    const attrs = (st && st.attributes) || {};
    const state = st ? st.state : "unavailable";
    const unit = attrs.unit_of_measurement || "";
    const isOn = ON_STATES.has(state);

    // An alarm panel is never a switch, whatever card type it was dropped into.
    // Rendering the toggle anyway produced the control in the screenshot:
    // "Disarmato" next to an off switch, where "on" means nothing and half the
    // panel's real states cannot be shown at all. The card type is corrected
    // rather than obeyed — a card that cannot tell the truth about its entity
    // should not draw.
    if (domainOf(item.entity_id) === "alarm_control_panel"
        && (type === "control" || type === "status" || type === "entity" || type === "alarm")) {
      return this._alarmBody(item, st);
    }
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
    return `<article data-card-id="${esc(item.id)}" class="item${pulse}${missing}${isFlow ? " flow" : ""}${composite || item.type === "weather" ? " composite" : ""}${item.type === "weather" && item.entity_id ? " tappable" : ""}" style="${style}${glow ? `;box-shadow:0 0 26px color-mix(in srgb, ${esc(accent)} 16%, transparent)` : ""}"
        ${item.type === "weather" && item.entity_id ? `data-weather-open="${esc(item.entity_id)}" class-hint="clickable"` : ""}
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

    // Only the HEADER is draggable, not the whole section: making the
    // <section> draggable would also capture every card inside it, and the
    // cards have their own reordering. The header doubles as the grab handle
    // the same way a window title bar does.
    return `<section class="dash-section${selected ? " sec-selected" : ""}" style="--accent:${esc(accent)}" ${this._editing ? `data-sec-drop="${index}"` : ""}>
        <header class="sec-head${this._editing ? " draggable" : ""}" ${this._editing ? `draggable="true" data-sec-drag="${index}"` : ""}>
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
  /** Optional section: whether declared vehicles join the load sub-tree. */
  _flowVehicleOption(card) {
    const vehicles = this._vehicles().filter((v) => v.power);
    if (!vehicles.length) return "";
    return `<div class="section">
      <strong>AUTO ELETTRICHE NEL FLUSSO</strong>
      <span class="hint">${vehicles.length} auto con un sensore di potenza dichiarato. Compaiono come carichi con il loro stato di carica, senza doverle aggiungere una seconda volta qui.</span>
      <label class="check"><input type="checkbox" data-flow-vehicles ${(card.flow || {}).show_vehicles !== false ? "checked" : ""}> Mostra le auto nel sotto-albero dei consumi</label>
    </div>`;
  }

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
    if (card.type === "economy") {
      const energyStats = Object.keys(this._hass.states).filter((id) => {
        const st = this._hass.states[id];
        return st.attributes.device_class === "energy"
          && ["total", "total_increasing"].includes(st.attributes.state_class);
      });
      const pick = (key, label, hintRe) => {
        const ranked = energyStats.slice().sort((a, b) =>
          (hintRe.test(b) - hintRe.test(a)) || a.localeCompare(b));
        return `<label>${esc(label)}<select data-prop="${esc(key)}">
          <option value="">— non collegato —</option>
          ${ranked.map((id) => `<option value="${esc(id)}" ${card[key] === id ? "selected" : ""}>${
            esc(this._hass.states[id].attributes.friendly_name || id)}${hintRe.test(id) ? " ·" : ""}</option>`).join("")}
        </select></label>`;
      };
      return `<div class="section">
        <strong>CONTATORI DI ENERGIA</strong>
        <span class="hint">Servono entità in <strong>kWh</strong> con statistiche a lungo termine, non sensori di potenza. ${
          energyStats.length ? `Trovate ${energyStats.length} entità adatte.` : "Nessuna entità di energia trovata."}</span>
        ${pick("grid_import", "ENERGIA PRELEVATA DALLA RETE", /preliev|import|rete|grid|consum/i)}
        ${pick("grid_export", "ENERGIA IMMESSA IN RETE", /immess|immiss|export|vendut/i)}
        ${pick("solar", "ENERGIA PRODOTTA DAL FOTOVOLTAICO", /solar|fotovolt|\bpv\b|produz/i)}
        <button class="secondary wide" data-eco-detect><ha-icon icon="mdi:auto-fix"></ha-icon> RILEVA DALLA DASHBOARD ENERGIA</button>
      </div>
      <div class="section">
        <strong>TARIFFE</strong>
        <span class="hint">Il prezzo di prelievo è quello che paghi; quello di immissione è il ritiro dedicato o lo scambio riconosciuto.</span>
        <div class="two">
          <label>PRELIEVO €/kWh<input type="number" step="0.001" min="0" data-prop="price_import" value="${card.price_import ?? 0.25}"></label>
          <label>IMMISSIONE €/kWh<input type="number" step="0.001" min="0" data-prop="price_export" value="${card.price_export ?? 0.1}"></label>
        </div>
        <label>PERIODO PREDEFINITO<select data-prop="period">
          ${ECONOMY_PERIODS.map((p) => `<option value="${p.key}" ${(card.period || "month") === p.key ? "selected" : ""}>${esc(p.label)}</option>`).join("")}
        </select></label>
      </div>
      <div class="section">
        <strong>DETTAGLIO PER DISPOSITIVO</strong>
        <span class="hint">Ogni riga è un contatore di energia in kWh: quanto ha consumato quel dispositivo nel periodo, e quanto è costato. Un dispositivo marcato come <strong>produce</strong> viene valorizzato alla tariffa di immissione invece che a quella di prelievo.</span>
        <button class="secondary wide" data-eco-detect><ha-icon icon="mdi:import"></ha-icon> IMPORTA I DISPOSITIVI DALLA DASHBOARD ENERGIA</button>
        <div class="eco-dev-list" data-keep-scroll="eco-devices">${(card.devices || []).map((d, i) => {
          const st = this._hass.states[d.entity];
          return `<div class="eco-dev-edit">
            <ha-icon icon="${esc(d.icon || (st ? autoIcon(d.entity, st) : "mdi:power-plug"))}"></ha-icon>
            <div class="ede-txt">
              <strong>${esc(d.name || (st && st.attributes.friendly_name) || d.entity)}</strong>
              <small>${esc(d.entity)}${st ? "" : " · non presente in Home Assistant"}</small>
            </div>
            <button class="mini ${d.kind === "source" ? "on" : ""}" data-eco-dev-kind="${i}"
              title="${d.kind === "source" ? "Produce energia" : "Consuma energia"}">
              <ha-icon icon="${d.kind === "source" ? "mdi:solar-power-variant" : "mdi:power-plug"}"></ha-icon></button>
            <button class="mini danger" data-eco-dev-remove="${i}"><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          ${d.kind === "source" ? "" : `<label class="zone-moist">COMPRESO DENTRO
            <select data-eco-dev-parent="${i}">
              <option value="">— è un carico a sé —</option>
              ${(card.devices || []).filter((o, j) => j !== i && o.kind !== "source")
                .map((o) => `<option value="${esc(o.entity)}" ${d.parent === o.entity ? "selected" : ""}>${
                  esc(o.name || (this._hass.states[o.entity] && this._hass.states[o.entity].attributes.friendly_name) || o.entity)}</option>`).join("")}
            </select></label>`}`;
        }).join("") || '<div class="entity-result-empty">Nessun dispositivo nel dettaglio.</div>'}</div>
        <span class="hint">Se un contatore è a valle di un altro — la friggitrice sulla presa della cucina, la cucina sul quadro FEM — dichiaralo con <strong>compreso dentro</strong>: quei kWh vengono conteggiati una volta sola, e il carico padre mostra anche quanto consuma al netto dei figli.</span>
        <label>AGGIUNGI UN CONTATORE<select data-eco-dev-add>
          <option value="">— scegli un'entità di energia —</option>
          ${energyStats.filter((id) => !(card.devices || []).some((d) => d.entity === id))
            .map((id) => `<option value="${esc(id)}">${esc(this._hass.states[id].attributes.friendly_name || id)}</option>`).join("")}
        </select></label>
      </div>`;
    }
    if (card.type === "camera") {
      const all = Object.keys(this._hass.states).filter((id) => id.startsWith("camera."));
      const chosen = Array.isArray(card.cameras) && card.cameras.length ? card.cameras : all;
      return `<div class="section">
        <strong>VIDEOCAMERE</strong>
        <span class="hint">${all.length
          ? "Le anteprime sono fermi immagine aggiornati a intervalli; toccandone una si apre la diretta. Tenere otto flussi live aperti insieme saturerebbe un tablet da parete."
          : "Nessuna videocamera trovata in Home Assistant."}</span>
        <div class="dom-grid">${all.map((id) =>
          `<button type="button" class="dom-chip ${chosen.includes(id) ? "on" : ""}" data-camera-pick="${esc(id)}">
             <ha-icon icon="mdi:cctv"></ha-icon>${esc(this._hass.states[id].attributes.friendly_name || id)}</button>`).join("")}
        </div>
        <label>AGGIORNAMENTO ANTEPRIME (secondi)<input type="number" min="5" max="120" data-prop="refresh" value="${card.refresh || 10}"></label>
        <label class="check"><input type="checkbox" data-prop="live" ${card.live ? "checked" : ""}> Anteprime sempre in diretta</label>
        <span class="hint">In diretta l'immagine è immediata e non c'è nessun intervallo di aggiornamento, ma ogni riquadro tiene aperto un flusso video: con una o due videocamere è la scelta giusta, con otto satura un tablet da parete.</span>
      </div>`;
    }
    if (card.type === "monitor") {
      const chosen = Array.isArray(card.groups) && card.groups.length
        ? card.groups : MONITOR_GROUPS.map((g) => g.key);
      const gridSt = card.grid_entity && this._hass.states[card.grid_entity];
      return `<div class="section">
        <strong>LIMITE DI PRELIEVO</strong>
        <span class="hint">Il cursore misura la potenza assorbita adesso contro il limite del contatore. Zona ambra dall'80%, rossa oltre il limite.</span>
        <label>SENSORE DI POTENZA DELLA RETE<select data-prop="grid_entity">
          <option value="">— non collegato —</option>
          ${this._powerCandidates(/rete|grid|scambio|contator|preliev|fase/i).map((r) =>
            `<option value="${esc(r.id)}" ${card.grid_entity === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
        </select></label>
        ${gridSt ? `<span class="hint">Lettura attuale: <strong>${esc(fmtPower(powerWatts(gridSt)).v + " " + fmtPower(powerWatts(gridSt)).u)}</strong></span>` : ""}
        <label>POTENZA CONTRATTUALE (W)<input type="number" min="500" max="100000" step="100" data-prop="limit_w" value="${card.limit_w || 3300}"></label>
        <div class="dom-grid">${GRID_LIMIT_PRESETS.map((w) =>
          `<button type="button" class="dom-chip ${(card.limit_w || 3300) === w ? "on" : ""}" data-limit-preset="${w}">${esc(fmtPower(w).v + " " + fmtPower(w).u)}</button>`).join("")}</div>
      </div>
      <div class="section">
        <strong>GRUPPI DI LETTURE</strong>
        <span class="hint">Le entità vengono trovate da sole in base al loro <em>device_class</em>. Le letture fuori tolleranza salgono in cima.</span>
        <div class="dom-grid">${MONITOR_GROUPS.map((g) =>
          `<button type="button" class="dom-chip ${chosen.includes(g.key) ? "on" : ""}" data-monitor-group="${esc(g.key)}">
             <ha-icon icon="${esc(g.icon)}"></ha-icon>${esc(g.label)}</button>`).join("")}
        </div>
        <label>MASSIMO PER GRUPPO<input type="number" min="3" max="30" data-prop="max_per_group" value="${card.max_per_group || 8}"></label>
      </div>
      <div class="section">
        <strong>SOGLIE</strong>
        <span class="hint">I valori predefiniti sono norme — EN 50160 per tensione e frequenza, 0,90 per il fattore di potenza — ma un armadio server che sta a 78 °C non è un guasto e un inverter che declassa sopra i 60 °C lo è. Lascia vuoto per usare la norma.</span>
        ${MONITOR_GROUPS.filter((g) => !Array.isArray(card.groups) || !card.groups.length || card.groups.includes(g.key))
          .map((g) => {
            const cur = (card.limits && card.limits[g.key]) || {};
            const def = g.limits;
            return `<div class="lim-group">
              <div class="lim-head"><ha-icon icon="${esc(g.icon)}"></ha-icon><strong>${esc(g.label)}</strong>
                <em>${esc(g.std)}</em></div>
              <div class="lim-grid">${LIMIT_KEYS.map((k) => `
                <label>${esc(LIMIT_LABELS[k])}<input type="number" step="0.1"
                  data-limit="${esc(g.key)}|${esc(k)}"
                  value="${cur[k] === undefined || cur[k] === null ? "" : cur[k]}"
                  placeholder="${def[k] === undefined || def[k] === null ? "—" : def[k]}"></label>`).join("")}</div>
            </div>`;
          }).join("")}
        <button class="secondary wide" data-limits-reset><ha-icon icon="mdi:restore"></ha-icon> RIPRISTINA TUTTE LE SOGLIE DI NORMA</button>
      </div>`;
    }
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
        <span class="hint">Il limite è per gruppo: le voci vengono ripartite tra luci, prese, clima, aperture e media, così nessuna categoria sparisce del tutto.</span>
      </div>
      <div class="section">
        <strong>QUALI DISPOSITIVI</strong>
        <span class="hint">Scegli uno per uno cosa vedere. Un interruttore che in realtà è una funzione di una videocamera — luce infrarossa, registrazione, modalità silenziosa — è tecnicamente "acceso" ma non è un dispositivo di casa: toglilo e non torna più.</span>
        ${this._activeExcludeEditor(card)}
      </div>`;
    }
    if (card.type === "notifications") {
      const sent = (this._sentNotifs || []).length;
      return `<div class="section">
        <strong>CONTENUTO</strong>
        <label class="check"><input type="checkbox" data-prop="show_sent" ${card.show_sent !== false ? "checked" : ""}> Messaggi inviati da Home Assistant (Telegram, app, push)</label>
        <span class="hint">Home Assistant non conserva nulla di ciò che invia: Cyborg registra ogni chiamata ai servizi <code>notify</code> e <code>telegram_bot</code> e la ripropone qui, anche dopo un riavvio. ${
          sent ? `${sent} avvisi già in archivio.` : "Nessun avviso registrato per ora: comparirà il prossimo che parte."}</span>
        <label class="check"><input type="checkbox" data-prop="show_updates" ${card.show_updates !== false ? "checked" : ""}> Includi aggiornamenti disponibili</label>
        <label>MASSIMO IN ELENCO<input type="number" min="3" max="60" data-prop="max" value="${card.max || 8}"></label>
        <button class="secondary wide" data-notif-clear><ha-icon icon="mdi:notification-clear-all"></ha-icon> SVUOTA L'ARCHIVIO AVVISI</button>
      </div>`;
    }
    if (card.type === "thermostat") {
      const allUnits = Object.keys(this._hass.states).filter((id) => domainOf(id) === "climate");
      const chosen = Array.isArray(card.units) && card.units.length ? card.units : null;
      const chosenManual = this._thermoManual(card);
      const hints = this._thermoManualHints(card);
      const switchable = Object.keys(this._hass.states).filter((id) =>
        ["input_boolean", "switch"].includes(domainOf(id)));
      const name = (id) => (this._hass.states[id].attributes.friendly_name || id);
      const q3 = (this._entityQuery || "").trim().toLowerCase();
      const matches = switchable
        .filter((id) => !chosenManual.includes(id))
        .filter((id) => !q3 || (name(id) + " " + id).toLowerCase().includes(q3))
        .slice(0, 40);

      return `<div class="section">
        <strong>UNITÀ</strong>
        <span class="hint">${allUnits.length
          ? `${allUnits.length} fra termostati e condizionatori. I comandi compaiono da soli in base a cosa ogni unità dichiara di saper fare: ventola, programma e flusso appaiono solo su chi li ha, e i limiti della temperatura impostabile li detta l'unità, non la card.`
          : "Nessuna entità <code>climate</code> in Home Assistant."}</span>
        <div class="seg">
          <button class="${chosen ? "" : "active"}" data-thermo-mode-sel="auto">Tutte</button>
          <button class="${chosen ? "active" : ""}" data-thermo-mode-sel="manual">Scelte da me</button>
        </div>
        ${chosen ? `<div class="eco-dev-list">${chosen.map((id, i) => `<div class="eco-dev-edit">
            <ha-icon icon="mdi:thermostat-box"></ha-icon>
            <div class="ede-txt"><strong>${esc(name(id))}</strong><small>${esc(id)}</small></div>
            <button class="mini danger" data-thermo-drop="${i}"><ha-icon icon="mdi:close"></ha-icon></button>
          </div>`).join("")}</div>
          <label>AGGIUNGI UN'UNITÀ<select data-thermo-pick>
            <option value="">— scegli —</option>
            ${allUnits.filter((id) => !chosen.includes(id)).map((id) =>
              `<option value="${esc(id)}">${esc(name(id))}</option>`).join("")}
          </select></label>` : ""}
      </div>
      <div class="section">
        <strong>SOSPENSIONE DELLE AUTOMAZIONI</strong>
        <span class="hint">Gli interruttori che fermano le automazioni non sono dispositivi, sono uno <strong>stato dell'impianto</strong>: stanno in cima alla card, con scritto per esteso cosa comportano. <strong>Li scegli tu</strong>: qui sotto ci sono al massimo dei suggerimenti presi dal nome, e un nome non dice cosa fa davvero un'entità.</span>
        <label class="check"><input type="checkbox" data-prop="show_manual" ${card.show_manual !== false ? "checked" : ""}> Mostra la riga di sospensione</label>
        ${card.show_manual === false ? "" : `
        ${chosenManual.length ? `<div class="eco-dev-list">${chosenManual.map((id, i) => `<div class="eco-dev-edit">
            <ha-icon icon="mdi:hand-back-right"></ha-icon>
            <div class="ede-txt"><strong>${esc(name(id))}</strong><small>${esc(id)}</small></div>
            <button class="mini danger" data-thermo-man-drop="${i}"><ha-icon icon="mdi:close"></ha-icon></button>
          </div>`).join("")}</div>`
          : `<span class="hint">Nessun interruttore indicato: la riga non compare finché non ne scegli uno.</span>`}
        ${hints.length ? `<div class="th-hints">
          <span class="hint">Possibili candidati, trovati dal nome. <strong>Nessuno è attivo</strong> finché non lo aggiungi tu — il nome di un'entità è un indizio, non una dichiarazione di cosa fa.</span>
          ${hints.map((id) => `<button class="th-hint" data-thermo-man-add="${esc(id)}">
            <ha-icon icon="mdi:plus"></ha-icon>
            <span><strong>${esc(name(id))}</strong><small>${esc(id)}</small></span>
          </button>`).join("")}
        </div>` : ""}
        <input type="text" data-entity-search value="${esc(this._entityQuery)}" placeholder="cerca un interruttore..." autocomplete="off">
        <div class="entity-results">${matches.map((id) => `<div class="entity-result-row" data-thermo-man-add="${esc(id)}">
            <ha-icon icon="${esc(autoIcon(id, this._hass.states[id]))}"></ha-icon>
            <div class="err-text"><strong>${esc(name(id))}</strong><small>${esc(id)}</small></div>
            <span class="err-state">${esc(this._hass.states[id].state)}</span>
          </div>`).join("") || '<div class="entity-result-empty">Nessun risultato.</div>'}</div>`}
      </div>
      <div class="section">
        <strong>ORDINE NELLA CARD</strong>
        <span class="hint">Decidi tu cosa viene prima. Vale anche per la riga di sospensione: sopra le unità, in mezzo o in fondo. Quello che aggiungi domani entra in coda, senza rifare l'ordine.</span>
        ${this._thermoBlocks(card).map((key, i, arr) => {
          const isManual = key === "manual";
          const st = isManual ? null : this._hass.states[key];
          return `<div class="eco-dev-edit">
            <ha-icon icon="${esc(isManual ? "mdi:hand-back-right" : "mdi:thermostat-box")}"></ha-icon>
            <div class="ede-txt"><strong>${esc(isManual ? "Sospensione automazioni" : ((st && st.attributes.friendly_name) || key))}</strong>
              <small>${esc(isManual ? "riga in cima o dove vuoi tu" : key)}</small></div>
            <button class="mini" data-thermo-ord="${i}:-1" ${i === 0 ? "disabled" : ""} title="Sposta su"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
            <button class="mini" data-thermo-ord="${i}:1" ${i === arr.length - 1 ? "disabled" : ""} title="Sposta giù"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
          </div>`;
        }).join("") || '<div class="entity-result-empty">Niente da ordinare.</div>'}
      </div>
      <div class="section">
        <strong>DETTAGLI</strong>
        <label class="check"><input type="checkbox" data-prop="show_extras" ${card.show_extras !== false ? "checked" : ""}> Mostra ventola, programma e flusso</label>
        <label>LARGHEZZA DEI BLOCCHI
          <select data-prop="columns">
            <option value="auto" ${(card.columns || "auto") === "auto" ? "selected" : ""}>Automatica</option>
            <option value="1" ${card.columns === "1" ? "selected" : ""}>Una colonna</option>
            <option value="2" ${card.columns === "2" ? "selected" : ""}>Due colonne</option>
          </select>
          <span class="hint">Con una colonna sola l'ordine si legge dall'alto in basso, senza che i blocchi scivolino di fianco.</span>
        </label>
      </div>`;
    }
    if (card.type === "comfort") {
      const bands = comfortBands(card);
      const rooms = this._comfortRooms(card);
      const manual = Array.isArray(card.rooms) && card.rooms.length > 0;
      // Every numeric sensor of the right class, area or no area: the outdoor
      // probe belongs to no room and must still be selectable by hand.
      const pick = (dc) => Object.keys(this._hass.states).filter((id) => {
        const st = this._hass.states[id];
        return st && st.attributes.device_class === dc && Number.isFinite(parseFloat(st.state));
      }).sort();
      const opts = (list, sel, none) => `<option value="">${esc(none)}</option>` + list.map((id) =>
        `<option value="${esc(id)}" ${id === sel ? "selected" : ""}>${
          esc((this._hass.states[id].attributes.friendly_name || id))}</option>`).join("");
      const temps = pick("temperature");
      const hums = pick("humidity");

      const autoList = `${rooms.map((r) => `<div class="eco-dev-edit">
          <ha-icon icon="${esc(r.icon)}"></ha-icon>
          <div class="ede-txt"><strong>${esc(r.name)}${r.outdoor ? " · esterno" : ""}</strong>
            <small>${esc(r.temperature)}${r.humidity ? " · " + esc(r.humidity) : " · senza umidità"}</small></div>
        </div>`).join("")}
        <button class="secondary wide" data-comfort-customize><ha-icon icon="mdi:pencil-outline"></ha-icon> SCEGLI LE STANZE A MANO</button>`;

      const manualList = `${(card.rooms || []).map((r, i) => `<div class="cf-edit-row">
          <div class="two">
            <label>NOME<input type="text" data-comfort-room="${i}|name" value="${esc(r.name || "")}" placeholder="Soggiorno"></label>
            <label>ICONA<input type="text" data-comfort-room="${i}|icon" value="${esc(r.icon || "")}" placeholder="mdi:sofa-outline"></label>
          </div>
          <label>TEMPERATURA<select data-comfort-room="${i}|temperature">${opts(temps, r.temperature, "— scegli —")}</select></label>
          <label>UMIDITÀ<select data-comfort-room="${i}|humidity">${opts(hums, r.humidity, "— nessuna —")}</select></label>
          <div class="cf-edit-tools">
            <button class="mini" data-comfort-move="${i}:-1" ${i === 0 ? "disabled" : ""} title="Sposta su"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
            <button class="mini" data-comfort-move="${i}:1" ${i === (card.rooms || []).length - 1 ? "disabled" : ""} title="Sposta giù"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
            <button class="mini danger" data-comfort-remove="${i}" title="Togli"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
          </div>
        </div>`).join("")}
        <button class="secondary wide" data-comfort-add><ha-icon icon="mdi:plus"></ha-icon> AGGIUNGI UNA STANZA</button>
        <button class="secondary wide" data-comfort-auto><ha-icon icon="mdi:restore"></ha-icon> TORNA AL RILEVAMENTO AUTOMATICO</button>`;

      return `<div class="section">
        <strong>STANZE</strong>
        <span class="hint">${manual
          ? "Elenco scritto da te: queste righe valgono e il rilevamento automatico è sospeso. Puoi mettere qui qualsiasi sensore, anche uno che non appartiene a nessuna area — è così che entra la temperatura esterna."
          : rooms.length
            ? `${rooms.length} righe rilevate da sole. Ogni area con un sensore di temperatura diventa una riga e l'umidità della stessa area le viene abbinata; i sensori che parlano dell'esterno entrano in cima anche senza area. Se la scelta automatica non ti convince, prendi il comando.`
            : "Nessun sensore di temperatura trovato. Assegna i sensori alle aree in Home Assistant, oppure scegli le stanze a mano."}</span>
        ${manual ? manualList : autoList}
      </div>
      <div class="section">
        <strong>SOGLIE DI COMFORT</strong>
        <span class="hint">Sotto la prima è freddo, sopra la seconda è caldo. Con la temperatura in range, l'umidità decide fra comfort, secco e umido: una stanza a 22° col 75% di umidità comoda non è.</span>
        <div class="two">
          <label>FREDDO SOTTO °C<input type="number" step="0.5" data-comfort-band="cold" value="${bands.cold}"></label>
          <label>CALDO SOPRA °C<input type="number" step="0.5" data-comfort-band="warm" value="${bands.warm}"></label>
        </div>
        <div class="two">
          <label>SECCO SOTTO %<input type="number" step="1" data-comfort-band="dry" value="${bands.dry}"></label>
          <label>UMIDO SOPRA %<input type="number" step="1" data-comfort-band="humid" value="${bands.humid}"></label>
        </div>
        <button class="secondary wide" data-comfort-reset><ha-icon icon="mdi:restore"></ha-icon> RIPRISTINA I VALORI CONSIGLIATI</button>
      </div>`;
    }
    if (card.type === "ev") {
      const all = this._vehicles();
      const chosen = Array.isArray(card.vehicles) && card.vehicles.length ? card.vehicles : all.map((v) => v.id);
      const numeric = (test) => Object.keys(this._hass.states).filter(test);
      const field = (v, key, label, test, hint) => `<label>${esc(label)}
        <select data-veh-field="${esc(v.id)}|${esc(key)}">
          <option value="">— nessuno —</option>
          ${numeric(test).map((id) => `<option value="${esc(id)}" ${v[key] === id ? "selected" : ""}>${
            esc(this._hass.states[id].attributes.friendly_name || id)}</option>`).join("")}
        </select>${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</label>`;

      return `<div class="section">
        <strong>AUTO ELETTRICHE</strong>
        <span class="hint">Le auto si dichiarano una volta sola qui e valgono per tutta la dashboard: la card, il garage sulla mappa 3D e il flusso energetico leggono le stesse entità. ${
          all.length ? `${all.length} dichiarate.` : "Nessuna ancora."}</span>
        <button class="secondary wide" data-veh-detect><ha-icon icon="mdi:auto-fix"></ha-icon> CERCA LE AUTO IN HOME ASSISTANT</button>
        <button class="secondary wide" data-veh-add><ha-icon icon="mdi:plus"></ha-icon> AGGIUNGI A MANO</button>
        ${all.map((v) => {
          const st = vehicleState(v, this._hass.states);
          const open = (this._vehOpen || {})[v.id];
          return `<div class="veh-card">
            <div class="veh-head">
              <ha-icon icon="${esc(v.icon)}"></ha-icon>
              <div class="ede-txt"><strong>${esc(v.name)}</strong>
                <small>${esc(st.status)}${st.soc !== null ? " · " + Math.round(st.soc) + "%" : ""}</small></div>
              <button class="mini ${chosen.includes(v.id) ? "on" : ""}" data-veh-pick="${esc(v.id)}" title="Mostra in questa card">
                <ha-icon icon="${chosen.includes(v.id) ? "mdi:eye" : "mdi:eye-off"}"></ha-icon></button>
              <button class="mini" data-veh-open="${esc(v.id)}"><ha-icon icon="${open ? "mdi:chevron-up" : "mdi:tune-variant"}"></ha-icon></button>
              <button class="mini danger" data-veh-remove="${esc(v.id)}"><ha-icon icon="mdi:close"></ha-icon></button>
            </div>
            ${open ? `<div class="veh-body">
              <label>NOME<input data-veh-prop="${esc(v.id)}|name" value="${esc(v.name)}"></label>
              <label>ICONA<input data-veh-prop="${esc(v.id)}|icon" value="${esc(v.icon)}" placeholder="mdi:car-electric"></label>
              ${field(v, "battery", "PERCENTUALE BATTERIA", (id) => this._hass.states[id].attributes.device_class === "battery")}
              ${field(v, "power", "POTENZA ALLA COLONNINA", (id) => this._hass.states[id].attributes.device_class === "power")}
              ${field(v, "charging", "IN CARICA", (id) => id.startsWith("binary_sensor.") || id.startsWith("sensor.") || id.startsWith("switch."))}
              ${field(v, "plugged", "CAVO COLLEGATO", (id) => id.startsWith("binary_sensor."))}
              ${field(v, "range", "AUTONOMIA", (id) => id.startsWith("sensor."))}
              ${field(v, "target", "OBIETTIVO DI CARICA", (id) => id.startsWith("number.") || id.startsWith("sensor."))}
              ${field(v, "energy", "ENERGIA EROGATA (kWh)", (id) => this._hass.states[id].attributes.device_class === "energy")}
              ${field(v, "switch", "AVVIA / FERMA CARICA", (id) => id.startsWith("switch."))}
              ${field(v, "current", "LIMITE DI CORRENTE", (id) => id.startsWith("number."))}
              <label>CAPACITÀ UTILE kWh<input type="number" step="0.5" min="0" max="500"
                data-veh-prop="${esc(v.id)}|capacity" value="${v.capacity ?? ""}" placeholder="es. 58"></label>
              <span class="hint">Serve solo per stimare il tempo alla carica. Senza, il tempo non viene mostrato invece di essere inventato. La stima non tiene conto del rallentamento oltre l'80%.</span>
            </div>` : ""}
          </div>`;
        }).join("") || '<div class="entity-result-empty">Nessuna auto dichiarata.</div>'}
        <label class="check"><input type="checkbox" data-prop="show_controls" ${card.show_controls !== false ? "checked" : ""}> Mostra i comandi di ricarica</label>
      </div>`;
    }
    if (card.type === "room") {
      if (!this._registry && !this._registryLoading) this._loadRegistry();
      const areas = (this._registry && this._registry.areas) || [];
      const ids = card.area ? this._roomCardEntities(card) : [];
      const cat = (this._registry && this._registry.category) || {};
      const pool = card.area && this._registry ? (this._registry.byArea[card.area] || []).filter((id) => !cat[id]) : [];
      const hidden = new Set(Array.isArray(card.hidden) ? card.hidden : []);
      return `<div class="section">
        <strong>STANZA</strong>
        <label>AREA DI HOME ASSISTANT<select data-prop="area">
          <option value="">— scegli un'area —</option>
          ${areas.map((a) => `<option value="${esc(a.area_id)}" ${card.area === a.area_id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
        </select></label>
        <span class="hint">${areas.length
          ? "La card segue l'area: un dispositivo spostato in questa stanza in Home Assistant compare qui da solo, senza toccare la dashboard."
          : "Nessuna area configurata in Home Assistant. Creale in Impostazioni → Aree."}</span>
        ${card.area ? `<span class="hint">${ids.length} dispositivi visibili su ${pool.length} nell'area.</span>` : ""}
      </div>
      ${card.area ? `<div class="section">
        <strong>COSA MOSTRARE</strong>
        <span class="hint">Le entità di diagnostica e configurazione sono già escluse. Qui togli quelle che non ti interessano.</span>
        <div class="room-entities" data-keep-scroll="room-entities">${pool.map((id) => {
          const shown = !hidden.has(id);
          const st = this._hass.states[id];
          return `<div class="room-ent${shown ? "" : " hidden"}">
            <ha-icon icon="${esc(autoIcon(id, st))}"></ha-icon>
            <span>${esc((st && st.attributes.friendly_name) || id)}</span>
            <button class="mini" data-roomcard-vis="${esc(id)}" title="${shown ? "Nascondi" : "Mostra"}">
              <ha-icon icon="${shown ? "mdi:eye" : "mdi:eye-off"}"></ha-icon></button>
          </div>`;
        }).join("") || '<div class="entity-result-empty">Area vuota.</div>'}</div>
        <label>LETTURE IN TESTA<input type="number" min="0" max="8" data-prop="max_readings" value="${card.max_readings ?? 4}"></label>
        <label class="check"><input type="checkbox" data-prop="show_others" ${card.show_others !== false ? "checked" : ""}> Mostra anche il gruppo "Altro"</label>
      </div>` : ""}`;
    }
    if (card.type === "trend") {
      const numeric = Object.keys(this._hass.states).filter((id) => {
        const st = this._hass.states[id];
        return Number.isFinite(parseFloat(st.state)) && st.attributes.unit_of_measurement;
      });
      const chosen = Array.isArray(card.series) ? card.series : [];
      const dc = (id) => ((this._hass.states[id] && this._hass.states[id].attributes.device_class) || "");
      const sameKind = chosen.length ? dc(chosen[0].entity) : null;
      const source = card.source || "manual";
      const cap = Math.max(1, Math.min(MAX_TREND_SERIES, Number(card.max_series) || 8));
      const resolved = this._trendSeries(card);
      // Every device_class that actually exists here, with how many entities
      // carry it: offering the full Home Assistant list would mostly be
      // classes this house does not have.
      const classes = {};
      for (const id of Object.keys(this._hass.states)) {
        const st = this._hass.states[id];
        const k = st && st.attributes.device_class;
        if (!k || !Number.isFinite(parseFloat(st.state))) continue;
        classes[k] = (classes[k] || 0) + 1;
      }
      const classKeys = Object.keys(classes).sort();

      const modeBar = `<div class="seg">
          <button class="${source === "comfort" ? "active" : ""}" data-trend-source="comfort">Segui le stanze</button>
          <button class="${source === "class" ? "active" : ""}" data-trend-source="class">Tutte di un tipo</button>
          <button class="${source === "manual" ? "active" : ""}" data-trend-source="manual">Scelte da me</button>
        </div>`;

      if (source !== "manual") {
        return `<div class="section">
          <strong>GRANDEZZE A CONFRONTO</strong>
          <span class="hint">Le linee <strong>non</strong> sono un elenco fisso: vengono ricalcolate a ogni disegno. Aggiungi domani un sensore e la sua linea compare da sola, senza tornare qui.</span>
          ${modeBar}
          ${source === "comfort"
            ? `<span class="hint">Segue le stesse stanze della card Temperature — sonda esterna compresa — e ne disegna la temperatura. È la modalità giusta per «confronta tutte le stanze»: cambia le stanze lì e il grafico segue.</span>`
            : `<label>TIPO DI GRANDEZZA<select data-prop="device_class">
                 ${classKeys.map((k) => `<option value="${esc(k)}" ${(card.device_class || "temperature") === k ? "selected" : ""}>${esc(dcLabel(k))} · ${classes[k]} entità</option>`).join("")}
               </select><span class="hint">Ogni entità numerica di questo tipo diventa una linea, ordinata per stanza — temperature di quattro motori, tensioni di tre fasi, correnti di un quadro. Una sola unità di misura per grafico: mescolare °C e W su un asse solo non confronta niente.</span></label>`}
          <label>MASSIMO DI LINEE<input type="number" min="1" max="${MAX_TREND_SERIES}" step="1" data-prop="max_series" value="${cap}"></label>
          <span class="hint">${resolved.length} linee adesso${resolved.length >= cap ? " · limite raggiunto, le altre restano fuori" : ""}. Oltre le otto un piano cartesiano smette di confrontare e comincia a nascondere: il tetto è di ${MAX_TREND_SERIES}.</span>
          <div class="eco-dev-list">${resolved.map((row) => `<div class="eco-dev-edit">
            <i class="tr-dot" style="background:${esc(row.color)}"></i>
            <div class="ede-txt"><strong>${esc(row.name)}</strong><small>${esc(row.entity)}</small></div>
          </div>`).join("") || '<div class="entity-result-empty">Nessuna entità trovata per questa scelta.</div>'}</div>
        </div>
        <div class="section">
          <strong>PERIODO E SCALA</strong>
          <label>PERIODO<select data-prop="hours">
            ${TREND_RANGES.map((r) => `<option value="${r.h}" ${(card.hours || 24) === r.h ? "selected" : ""}>${esc(r.l)}</option>`).join("")}
          </select></label>
          <div class="two">
            <label>MINIMO<input type="number" step="0.5" data-prop="y_min" value="${card.y_min ?? ""}" placeholder="auto"></label>
            <label>MASSIMO<input type="number" step="0.5" data-prop="y_max" value="${card.y_max ?? ""}" placeholder="auto"></label>
          </div>
        </div>`;
      }

      return `<div class="section">
        <strong>GRANDEZZE A CONFRONTO</strong>
        <span class="hint">Elenco scritto da te: resta com'è finché non lo cambi. Se vuoi che il grafico segua le stanze da solo — oggi quattro, domani dieci — usa una delle altre due modalità. ${
          sameKind ? `Stai confrontando grandezze di tipo <strong>${esc(sameKind)}</strong>.` : ""}</span>
        ${modeBar}
        <div class="eco-dev-list" data-keep-scroll="eco-devices">${chosen.map((row, i) => {
          const st = this._hass.states[row.entity];
          const color = row.color || SERIES_COLORS[i % SERIES_COLORS.length];
          const mixed = sameKind && dc(row.entity) !== sameKind;
          return `<div class="eco-dev-edit">
            <i class="tr-dot" style="background:${esc(color)}"></i>
            <div class="ede-txt">
              <strong>${esc(row.name || (st && st.attributes.friendly_name) || row.entity)}</strong>
              <small>${esc(row.entity)}${st ? esc(" · " + (st.attributes.unit_of_measurement || "")) : " · non presente"}${
                mixed ? " · unità diversa dalle altre" : ""}</small>
            </div>
            <label class="tr-color"><input type="color" value="${esc(color)}" data-trend-color="${i}"></label>
            <button class="mini danger" data-trend-remove="${i}"><ha-icon icon="mdi:close"></ha-icon></button>
          </div>`;
        }).join("") || '<div class="entity-result-empty">Nessuna grandezza scelta.</div>'}</div>
        ${chosen.length >= MAX_TREND_SERIES ? `<span class="hint">Raggiunto il tetto di ${MAX_TREND_SERIES} linee.</span>` : `
        <label>AGGIUNGI IN BLOCCO
          <select data-trend-fill>
            <option value="">— tutte le grandezze di un tipo —</option>
            <option value="__rooms">Temperature delle stanze (coi nomi delle stanze)</option>
            ${classKeys.map((k) => `<option value="${esc(k)}">${esc(dcLabel(k))} · ${classes[k]} entità</option>`).join("")}
          </select>
          <span class="hint">Riempie l'elenco in un colpo solo. Resta comunque un elenco tuo: non si aggiorna da solo — per quello servono le altre due modalità.</span>
        </label>
        <label>AGGIUNGI UNA GRANDEZZA<select data-trend-add>
          <option value="">— scegli un'entità numerica —</option>
          ${numeric.filter((id) => !chosen.some((r) => r.entity === id))
            .map((id) => `<option value="${esc(id)}">${esc(this._hass.states[id].attributes.friendly_name || id)} · ${esc(this._hass.states[id].attributes.unit_of_measurement || "")}</option>`).join("")}
        </select></label>`}
      </div>
      <div class="section">
        <strong>PERIODO E SCALA</strong>
        <label>PERIODO<select data-prop="hours">
          ${TREND_RANGES.map((r) => `<option value="${r.h}" ${(card.hours || 24) === r.h ? "selected" : ""}>${esc(r.l)}</option>`).join("")}
        </select></label>
        <span class="hint">La scala verticale si adatta ai dati. Fissala solo se vuoi confrontare due grafici diversi con lo stesso metro.</span>
        <div class="two">
          <label>MINIMO<input type="number" step="0.5" data-prop="y_min" value="${card.y_min ?? ""}" placeholder="auto"></label>
          <label>MASSIMO<input type="number" step="0.5" data-prop="y_max" value="${card.y_max ?? ""}" placeholder="auto"></label>
        </div>
      </div>`;
    }
    if (card.type === "lights") {
      const lightsOnly = Object.keys(this._hass.states).filter((id) => id.startsWith("light."));
      const custom = Array.isArray(card.lights) && card.lights.length;
      const chosen = custom ? card.lights : lightsOnly;
      const rgb = lightsOnly.filter((id) => lightCaps(this._hass.states[id]).color).length;
      const dim = lightsOnly.filter((id) => lightCaps(this._hass.states[id]).dimmable).length;
      // Anything switchable can be a light: plenty of real lighting is wired
      // through a relay and arrives as a switch.
      const switchable = Object.keys(this._hass.states).filter((id) =>
        ["switch", "input_boolean", "fan", "light"].includes(domainOf(id)) && !chosen.includes(id));
      const q2 = (this._entityQuery || "").trim().toLowerCase();
      const matches = switchable.filter((id) => !q2
        || ((this._hass.states[id].attributes.friendly_name || "") + " " + id).toLowerCase().includes(q2));
      return `<div class="section">
        <strong>QUALI LUCI</strong>
        <span class="hint">${lightsOnly.length
          ? `${lightsOnly.length} luci nel dominio <code>light</code>: ${dim} dimmerabili, ${rgb} a colori. I comandi compaiono da soli in base a ciò che ogni corpo illuminante dichiara di saper fare, quindi le RGB che installerai avranno subito colore, temperatura ed effetti senza toccare nulla qui.`
          : "Nessuna entità <code>light</code> in Home Assistant."}</span>
        <div class="seg">
          <button class="${custom ? "" : "active"}" data-lights-mode="auto">Tutte le luci</button>
          <button class="${custom ? "active" : ""}" data-lights-mode="manual">Scelte da me</button>
        </div>
        <span class="hint">${custom
          ? `${chosen.length} entità scelte a mano. Puoi aggiungere <strong>qualsiasi</strong> interruttore o presa: se quella presa comanda una lampada, per te è una luce.`
          : "Passa a «Scelte da me» per aggiungere anche prese e relè che comandano lampade."}</span>
        ${custom ? `<div class="room-entities" data-keep-scroll="lights-chosen">
          ${chosen.map((id) => {
            const lst = this._hass.states[id];
            return `<div class="room-ent${lst ? "" : " hidden"}">
              <ha-icon icon="${esc(lst ? autoIcon(id, lst) : "mdi:help-circle-outline")}"></ha-icon>
              <span>${esc((lst && lst.attributes.friendly_name) || id)}</span>
              <em class="room-ent-pos">${esc(domainOf(id))}</em>
              <button class="mini danger" data-light-drop="${esc(id)}"><ha-icon icon="mdi:close"></ha-icon></button>
            </div>`;
          }).join("") || '<div class="entity-result-empty">Nessuna entità scelta.</div>'}
        </div>
        <label>AGGIUNGI UN'ENTITÀ<input type="text" data-entity-search value="${esc(this._entityQuery)}" placeholder="luce, presa, relè..." autocomplete="off"></label>
        <div class="entity-results" data-keep-scroll="lights-add">
          ${matches.slice(0, 25).map((id) => {
            const lst = this._hass.states[id];
            return `<div class="entity-result-row" data-light-add="${esc(id)}">
              <ha-icon icon="${esc(autoIcon(id, lst))}"></ha-icon>
              <div class="err-text"><strong>${esc(lst.attributes.friendly_name || id)}</strong><small>${esc(id)}</small></div>
              <span class="err-state">${esc(lst.state)}</span>
            </div>`;
          }).join("") || '<div class="entity-result-empty">Nessun risultato.</div>'}
        </div>` : ""}
        <label class="check"><input type="checkbox" data-prop="group_by_area" ${card.group_by_area !== false ? "checked" : ""}> Raggruppa per stanza</label>
        <span class="hint">Gli orari si impostano luce per luce, dal pannello che si apre toccando l'icona di regolazione sulla card. Vengono eseguiti da Home Assistant, non dal browser.</span>
      </div>`;
    }
    if (card.type === "irrigation") {
      const candidates = Object.keys(this._hass.states)
        .filter((id) => IRRIGATION_DOMAINS.includes(domainOf(id)))
        .sort((a, b) => (/irrig|sprinkl|valvol|valve|giardin|orto|goccia/i.test(b) - /irrig|sprinkl|valvol|valve|giardin|orto|goccia/i.test(a)) || a.localeCompare(b));
      const moist = Object.keys(this._hass.states).filter((id) => {
        const st = this._hass.states[id];
        return st.attributes.device_class === "moisture" || st.attributes.device_class === "humidity"
          || /umid|moist|terren/i.test(id);
      });
      return `<div class="section">
        <strong>ZONE</strong>
        <span class="hint">Ogni zona è un'elettrovalvola o un relè. L'avvio a tempo viene eseguito da Home Assistant: la valvola si chiude anche se chiudi il browser, blocchi il telefono o riavvii il sistema a metà ciclo.</span>
        <div class="eco-dev-list" data-keep-scroll="eco-devices">${(card.zones || []).map((z, i) => {
          const st = this._hass.states[z.entity];
          return `<div class="eco-dev-edit">
            <ha-icon icon="${esc(z.icon || "mdi:sprinkler")}"></ha-icon>
            <div class="ede-txt">
              <strong>${esc(z.name || (st && st.attributes.friendly_name) || z.entity)}</strong>
              <small>${esc(z.entity)}${st ? "" : " · non presente"}</small>
            </div>
            <input class="zone-min" type="number" min="1" max="720" value="${z.minutes || 10}" data-zone-prop="${i}|minutes" title="Durata predefinita (minuti)">
            <button class="mini danger" data-zone-remove="${i}"><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <label class="zone-moist">SENSORE DI UMIDITÀ DEL TERRENO
            <select data-zone-prop="${i}|moisture">
              <option value="">— nessuno —</option>
              ${moist.map((m) => `<option value="${esc(m)}" ${z.moisture === m ? "selected" : ""}>${esc(this._hass.states[m].attributes.friendly_name || m)}</option>`).join("")}
            </select></label>`;
        }).join("") || '<div class="entity-result-empty">Nessuna zona configurata.</div>'}</div>
        <label>AGGIUNGI UNA ZONA<select data-zone-add>
          <option value="">— scegli un'elettrovalvola o un relè —</option>
          ${candidates.filter((id) => !(card.zones || []).some((z) => z.entity === id))
            .map((id) => `<option value="${esc(id)}">${esc(this._hass.states[id].attributes.friendly_name || id)}</option>`).join("")}
        </select></label>
      </div>
      <div class="section">
        <strong>PIOGGIA</strong>
        <span class="hint">Se colleghi un sensore di pioggia, la card lo mostra in testa così sai se vale la pena irrigare.</span>
        <label>SENSORE DI PIOGGIA<select data-prop="rain_sensor">
          <option value="">— nessuno —</option>
          ${Object.keys(this._hass.states).filter((id) => {
            const st = this._hass.states[id];
            return st.attributes.device_class === "moisture" || /piogg|rain/i.test(id);
          }).map((id) => `<option value="${esc(id)}" ${card.rain_sensor === id ? "selected" : ""}>${esc(this._hass.states[id].attributes.friendly_name || id)}</option>`).join("")}
        </select></label>
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

    const hasCams = Object.keys(states).some((id) => id.startsWith("camera."));
    if (hasCams) top.push(mk("camera", { size: "lg", appearance: { icon: "mdi:cctv" }, refresh: 10 }));
    const alarm = first((id) => id.startsWith("alarm_control_panel."));
    if (alarm) {
      // A real alarm card, not a status badge: a badge says "disarmato" and
      // gives you no way to do anything about it.
      top.push(mk("alarm", { entity_id: alarm, size: "md",
        appearance: { icon: "mdi:shield-home" },
        actions: { tap: { action: "more-info" } } }));
    }

    const flowCard = mk("energyflow", { size: "lg",
      appearance: { icon: "mdi:transit-connection-variant" },
      flow: { grid: null, solar: null, battery: null, home: null, devices: [] } });

    // the grid sensor the flow uses is also what the gauge measures, so the
    // monitoring card is wired from the same detection instead of asking twice
    const monitorCard = mk("monitor", { size: "lg",
      appearance: { icon: "mdi:gauge-full" },
      grid_entity: null, limit_w: 3300, groups: [], max_per_group: 8 });

    const sections = [
      { id: uid("sec"), title: "Panoramica", icon: "mdi:view-dashboard-variant",
        accent: "#00e5ff", collapsed: false, items: top },
      { id: uid("sec"), title: "Energia", icon: "mdi:flash",
        accent: "#ffd166", collapsed: false, items: [flowCard] },
      { id: uid("sec"), title: "Monitoraggio", icon: "mdi:gauge-full",
        accent: "#8ecae6", collapsed: false, items: [monitorCard] },
    ];
    page.sections = sections;
    this._detectFlow(flowCard).then(() => {
      // reuse whatever the energy detection resolved for the grid
      if (flowCard.flow && flowCard.flow.grid && !monitorCard.grid_entity) {
        monitorCard.grid_entity = flowCard.flow.grid;
        this._touch();
      }
    });
    this._selected = null;
    this._touch();
  }

  /** Power sensors ranked with the ones whose name fits the question first. */
  _powerCandidates(re) {
    const rows = [];
    for (const id of Object.keys(this._hass.states)) {
      const st = this._hass.states[id];
      if (st.attributes.device_class !== "power") continue;
      const name = st.attributes.friendly_name || id;
      rows.push({ id, name, st, hit: re ? re.test(name + " " + id) : false });
    }
    rows.sort((a, b) => (b.hit - a.hit) || a.name.localeCompare(b.name));
    return rows;
  }

  _wizardBody(card) {
    const w = this._wizard;
    const flow = card.flow || (card.flow = {});
    const total = WIZARD_STEPS.length + 2;   // + loads + hierarchy

    // ---- slot steps
    if (w.step < WIZARD_STEPS.length) {
      const step = WIZARD_STEPS[w.step];
      const q = (this._entityQuery || "").trim().toLowerCase();
      let rows = this._powerCandidates(step.match);
      if (q) rows = rows.filter((r) => (r.name + " " + r.id).toLowerCase().includes(q));
      const current = flow[step.key];
      return `<div class="wiz-step">
          <div class="wiz-q">${esc(step.q)}</div>
          <div class="wiz-hint">${esc(step.hint)}</div>
          <input type="text" data-entity-search value="${esc(this._entityQuery)}" placeholder="filtra i sensori di potenza..." autocomplete="off">
          <div class="wiz-list" data-keep-scroll="wiz">${rows.length ? rows.slice(0, 40).map((r) => {
            const f = fmtPower(powerWatts(r.st));
            return `<button type="button" class="wiz-opt ${current === r.id ? "sel" : ""}" data-wiz-pick="${esc(r.id)}">
              <ha-icon icon="${esc(current === r.id ? "mdi:check-circle" : "mdi:flash")}"></ha-icon>
              <div><strong>${esc(r.name)}</strong><small>${esc(r.id)}</small></div>
              <span class="wiz-val">${esc(f.v)}<i>${esc(f.u)}</i></span>
              ${r.hit ? '<em class="wiz-tip">consigliato</em>' : ""}
            </button>`;
          }).join("") : `<div class="entity-result-empty">Nessun sensore di potenza${q ? " per questa ricerca" : " trovato in Home Assistant"}.</div>`}</div>
        </div>`;
    }

    // ---- loads
    if (w.step === WIZARD_STEPS.length) {
      const q = (this._entityQuery || "").trim().toLowerCase();
      const chosen = new Set((flow.devices || []).map((d) => d.entity));
      let rows = this._powerCandidates(null).filter((r) => !FLOW_SLOTS.some((sl) => flow[sl.key] === r.id));
      if (q) rows = rows.filter((r) => (r.name + " " + r.id).toLowerCase().includes(q));
      return `<div class="wiz-step">
          <div class="wiz-q">Quali carichi vuoi vedere nel dettaglio?</div>
          <div class="wiz-hint">Sono i rami che compaiono aprendo il nodo Casa. Selezionane quanti vuoi, fino a 8.</div>
          <input type="text" data-entity-search value="${esc(this._entityQuery)}" placeholder="filtra i carichi..." autocomplete="off">
          <div class="wiz-list" data-keep-scroll="wiz">${rows.slice(0, 40).map((r) => `
            <button type="button" class="wiz-opt ${chosen.has(r.id) ? "sel" : ""}" data-wiz-load="${esc(r.id)}">
              <ha-icon icon="${esc(chosen.has(r.id) ? "mdi:checkbox-marked" : "mdi:checkbox-blank-outline")}"></ha-icon>
              <div><strong>${esc(r.name)}</strong><small>${esc(r.id)}</small></div>
            </button>`).join("")}</div>
        </div>`;
    }

    // ---- hierarchy
    const devices = flow.devices || [];
    return `<div class="wiz-step">
        <div class="wiz-q">Gerarchia dei consumi</div>
        <div class="wiz-hint">Se un carico è già compreso dentro un altro — per esempio una presa a valle di un quadro che stai misurando — indicalo qui: non verrà contato due volte.</div>
        ${devices.length ? devices.map((d, i) => `
          <label class="wiz-parent">${esc(d.name || (this._hass.states[d.entity] && this._hass.states[d.entity].attributes.friendly_name) || d.entity)}
            <select data-wiz-parent="${i}">
              <option value="">— carico principale —</option>
              ${devices.map((o, j) => j === i ? "" :
                `<option value="${esc(o.entity)}" ${d.parent === o.entity ? "selected" : ""}>compreso in ${esc(o.name || o.entity)}</option>`).join("")}
            </select>
          </label>`).join("")
        : '<div class="entity-result-empty">Nessun carico selezionato al passo precedente.</div>'}
        <div class="wiz-hint" style="margin-top:14px">Se un segno risulta al contrario (immissione mostrata come prelievo, o carica come scarica) lo correggi dalla configurazione avanzata.</div>
      </div>`;
  }

  _wizardEditor(card) {
    const w = this._wizard;
    const total = WIZARD_STEPS.length + 2;
    const last = w.step >= total - 1;
    const step = WIZARD_STEPS[w.step];
    return `<div class="wiz">
        <div class="wiz-bar">${Array.from({ length: total }, (_, i) =>
          `<i class="${i < w.step ? "done" : i === w.step ? "now" : ""}"></i>`).join("")}</div>
        <div class="wiz-head">
          <span>PASSO ${w.step + 1} DI ${total}</span>
          <strong>${esc(step ? step.title : w.step === WIZARD_STEPS.length ? "Carichi monitorati" : "Gerarchia")}</strong>
        </div>
        ${this._wizardBody(card)}
        <div class="wiz-nav">
          ${w.step > 0 ? '<button class="secondary" data-wiz-back><ha-icon icon="mdi:chevron-left"></ha-icon> INDIETRO</button>' : ""}
          ${step ? `<button class="secondary" data-wiz-skip>${esc(step.skip)}</button>` : ""}
          <button data-wiz-next>${last ? "FINE" : "AVANTI"} <ha-icon icon="${last ? "mdi:check" : "mdi:chevron-right"}"></ha-icon></button>
        </div>
        <button class="wiz-advanced" data-wiz-exit>Configurazione avanzata</button>
      </div>`;
  }

  /** Prefill the economy card from the Home Assistant energy configuration. */
  /**
   * Fill the economy card from the Home Assistant energy configuration.
   *
   * Two grid formats coexist in core 2026.8.3: the unified GridSourceType
   * (stat_energy_from / stat_energy_to) and the deprecated legacy one, where
   * the same meters live inside flow_from[] / flow_to[] arrays. Reading only
   * the modern shape - which this did - finds nothing at all on an install
   * that has not been migrated, and reports "no meter configured" to a user
   * whose energy dashboard is plainly working.
   *
   * device_consumption is the list the energy dashboard calls "individual
   * devices": importing it is what turns the per-device breakdown from a
   * data-entry exercise into one click.
   */
  async _detectEconomy(card) {
    let prefs;
    try {
      prefs = await this._hass.callWS({ type: "energy/get_prefs" });
    } catch (err) {
      this._error = "Dashboard Energia non configurata in Home Assistant";
      this._touch(true);
      return;
    }
    let priceIn = null, priceOut = null;
    const solarStats = [];

    for (const src of (prefs.energy_sources || [])) {
      if (src.type === "grid") {
        // unified format
        if (!card.grid_import && src.stat_energy_from) card.grid_import = src.stat_energy_from;
        if (!card.grid_export && src.stat_energy_to) card.grid_export = src.stat_energy_to;
        // legacy format
        for (const flow of (src.flow_from || [])) {
          if (!card.grid_import && flow.stat_energy_from) card.grid_import = flow.stat_energy_from;
          if (typeof flow.number_energy_price === "number") {
            priceIn = priceIn === null ? flow.number_energy_price : Math.max(priceIn, flow.number_energy_price);
          }
        }
        for (const flow of (src.flow_to || [])) {
          if (!card.grid_export && flow.stat_energy_to) card.grid_export = flow.stat_energy_to;
          if (typeof flow.number_energy_price === "number") {
            priceOut = priceOut === null ? flow.number_energy_price : Math.max(priceOut, flow.number_energy_price);
          }
        }
        // several grid sources can each carry a price; the dearest is the one
        // that actually hurts, so it is the honest default to show
        if (typeof src.number_energy_price === "number") {
          priceIn = priceIn === null ? src.number_energy_price : Math.max(priceIn, src.number_energy_price);
        }
        if (typeof src.number_energy_price_export === "number") {
          priceOut = priceOut === null ? src.number_energy_price_export : Math.max(priceOut, src.number_energy_price_export);
        }
      }
      if (src.type === "solar" && src.stat_energy_from) {
        if (!card.solar) card.solar = src.stat_energy_from;
        solarStats.push({ stat: src.stat_energy_from, name: src.name || "" });
      }
    }
    if (priceIn !== null) card.price_import = priceIn;
    if (priceOut !== null) card.price_export = priceOut;

    // individual devices -> the per-device breakdown
    const existing = new Set((card.devices || []).map((d) => d.entity));
    const devices = Array.isArray(card.devices) ? card.devices.slice() : [];
    for (const dev of (prefs.device_consumption || [])) {
      const stat = dev.stat_consumption;
      if (!stat || existing.has(stat)) continue;
      // A device declared as included in another device's total would be
      // counted twice in the breakdown: HA models exactly this with
      // included_in_stat, so it is skipped rather than double-billed.
      if (dev.included_in_stat) continue;
      const st = this._hass.states[stat];
      devices.push({ entity: stat,
        name: dev.name || (st && st.attributes.friendly_name) || "",
        icon: "", kind: "load" });
      existing.add(stat);
      if (devices.length >= 24) break;
    }
    // more than one string / plant: the extra ones become production rows
    for (const solar of solarStats.slice(1)) {
      if (existing.has(solar.stat) || devices.length >= 24) continue;
      devices.push({ entity: solar.stat, name: solar.name, icon: "", kind: "source" });
      existing.add(solar.stat);
    }
    card.devices = devices;

    this._error = card.grid_import
      ? ""
      : "Nessun contatore di rete trovato nella Dashboard Energia";
    this._economy = {};
    this._touch();
  }

  _flowEditor(card) {
    if (this._wizard && this._wizard.cardId === card.id) return this._wizardEditor(card);
    const flow = card.flow || {};
    const evSection = this._flowVehicleOption(card);
    const devices = flow.devices || [];
    const configured = FLOW_SLOTS.some((sl) => flow[sl.key]);
    return `<div class="section">
      <strong>CONFIGURAZIONE GUIDATA</strong>
      <span class="hint">${configured
        ? "Ricomincia la procedura passo passo se vuoi rifare i collegamenti."
        : "Ti fa una domanda alla volta: fotovoltaico, batteria, rete, carichi. È il modo consigliato."}</span>
      <button class="wide" data-wiz-start><ha-icon icon="mdi:wizard-hat"></ha-icon> ${configured ? "RIFAI LA PROCEDURA" : "AVVIA CONFIGURAZIONE GUIDATA"}</button>
    </div>
    <div class="section">
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
              <div class="entity-results" data-entity-results data-keep-scroll="entities">${this._entityResults("power")}</div>` : ""}
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
        <div class="entity-results" data-entity-results data-keep-scroll="entities">${this._entityResults("power")}</div>` : ""}
    </div>
    ${evSection}`;
  }

  _renderCardEditor(card) {
    const st = this._hass.states[card.entity_id];
    const app = card.appearance || {};
    const state = st ? st.state : "unknown";
    const sections = this._sections();
    const currentIcon = app.icon || autoIcon(card.entity_id, st || { attributes: {} });
    const tap = (card.actions && card.actions.tap && card.actions.tap.action) || "more-info";

    return `<aside class="editor" data-keep-scroll="editor">
      ${this._editorHead("CARD", card.name || (COMPOSITE_META[card.type] && COMPOSITE_META[card.type][0])
        || (st && st.attributes.friendly_name) || card.entity_id || "Nuova card")}

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
        <div class="entity-results" data-entity-results data-keep-scroll="entities">${this._entityResults()}</div>
      </div>`}

      <div class="section">
        <strong>PRESENTAZIONE</strong>
        <label>TIPO<select data-prop="type">
          <optgroup label="Mostrano l'entità scelta">
            ${CARD_TYPES.filter((t) => !t.solo).map((t) =>
              `<option value="${esc(t.k)}" ${card.type === t.k ? "selected" : ""}>${esc(t.l)}</option>`).join("")}
          </optgroup>
          <optgroup label="Card autonome — non usano l'entità">
            ${CARD_TYPES.filter((t) => t.solo).map((t) =>
              `<option value="${esc(t.k)}" ${card.type === t.k ? "selected" : ""}>${esc(t.l)}</option>`).join("")}
          </optgroup>
        </select></label>
        <span class="hint type-hint">${esc(cardTypeInfo(card.type).d)}${
          cardTypeInfo(card.type).solo && card.entity_id
            ? " <strong>Questa card non usa l'entità collegata sopra.</strong>" : ""}</span>
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

      ${ROW_ACTION_TYPES.has(card.type) ? `<div class="section">
        <strong>AZIONE AL TOCCO</strong>
        <span class="hint">Cosa fa il tocco sulla riga di un dispositivo. <strong>L'icona fa sempre l'altra cosa</strong>, così comando e dettagli restano entrambi a un tocco.</span>
        <select data-prop="row_action">
          <option value="toggle" ${(card.row_action || "toggle") === "toggle" ? "selected" : ""}>Accendi / spegni · l'icona apre i dettagli</option>
          <option value="more-info" ${card.row_action === "more-info" ? "selected" : ""}>Apri i dettagli · l'icona accende e spegne</option>
        </select>
      </div>` : `
      <div class="section">
        <strong>AZIONE AL TOCCO</strong>
        <span class="hint">${(() => {
          const avail = actionsFor(card.entity_id);
          const controllable = avail.length > 2;
          if (!card.entity_id) return "Collega prima un'entità.";
          return controllable
            ? `Cosa succede toccando la card. Sono elencate solo le azioni che <strong>${esc(domainOf(card.entity_id))}</strong> supporta davvero.`
            : `Un'entità <strong>${esc(domainOf(card.entity_id))}</strong> non si comanda: si può solo aprirne i dettagli.`;
        })()}</span>
        <select data-prop="actions.tap.action">
          ${actionsFor(card.entity_id).map((a) =>
            `<option value="${esc(a.k)}" ${tap === a.k ? "selected" : ""}>${esc(a.l)}${
              a.s ? ` · ${esc(domainOf(card.entity_id))}.${esc(a.s)}` : ""}</option>`).join("")}
        </select>
      </div>`}

      <button class="delete" data-card-remove data-sec="${esc(this._selected.sectionId)}" data-item="${esc(card.id)}">ELIMINA CARD</button>
    </aside>`;
  }

  _renderSectionEditor(section) {
    return `<aside class="editor" data-keep-scroll="editor">
      ${this._editorHead("SEZIONE", section.title)}
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
      <div class="section">
        <strong>DOVE VIVE QUESTA SEZIONE</strong>
        <span class="hint">Una sezione può stare dentro una pagina insieme alle altre, oppure diventare una <strong>scheda tutta sua</strong> accanto a Dashboard e Mappa 3D. Decidi tu, sezione per sezione.</span>
        <select data-sec-page="${esc(section.id)}">
          ${this._dashboard.pages.map((pg, i) => pg.type === "floorplan" ? "" :
            `<option value="${i}" ${i === this._pageIndex ? "selected" : ""}>Dentro «${esc(pg.title || "Pagina " + (i + 1))}»</option>`).join("")}
          <option value="__own">In una scheda tutta sua</option>
        </select>
        ${this._sections().length === 1 ? '<span class="hint">È l\'unica sezione di questa pagina: spostandola, la pagina vuota viene rimossa.</span>' : ""}
      </div>
      <button class="delete" data-sec-remove data-sec="${esc(section.id)}">ELIMINA SEZIONE</button>
    </aside>`;
  }

  _renderPageEditor() {
    const p = this._page();
    return `<aside class="editor" data-keep-scroll="editor">
      ${this._editorHead("PAGINA", "Struttura")}
      <div class="section">
        <label>TITOLO<input data-page-prop="title" value="${esc(p.title || "")}" placeholder="Cyborg"></label>
        <label>ICONA${iconField("data-page-prop", "icon", p.icon || "mdi:hexagon-multiple-outline")}</label>
        <label>COLORE TEMA<input type="color" data-theme-prop="accent" value="${esc((this._dashboard.theme && this._dashboard.theme.accent) || "#00e5ff")}"></label>
      </div>
      ${this._pageManager()}
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

  /** Sheet chrome shared by every editor variant (handle + close). */
  _editorHead(label, title, closable) {
    return `<div class="editor-handle" data-close-editor></div>
      <div class="editor-title">
        <div><small>${esc(label)}</small><h2>${esc(title)}</h2></div>
        <button class="icon" data-close-editor><ha-icon icon="mdi:close"></ha-icon></button>
      </div>`;
  }

  _renderEditor() {
    if (this._isFloorplan()) {
      if (this._mapWizard) {
        return `<aside class="editor" data-keep-scroll="editor">${this._editorHead("MAPPA 3D", "Configurazione guidata")}${this._mapWizardEditor()}</aside>`;
      }
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

    // Every interaction rebuilds the DOM, which throws away scroll position:
    // on a phone each tap on a checkbox threw the user back to the top of the
    // page and of the sheet. Capture what is scrolled, restore it after.
    const scroller = this._scrollParent();
    const pageTop = scroller ? scroller.scrollTop : 0;
    // Every scrollable container declares a key, and all of them are restored.
    // The old version listed four selectors by hand, so scrolling half way
    // down a room's device list and tapping an eye threw the list back to the
    // top — which is what "quando clicco mi si abbassa la visuale" describes.
    // A declared key cannot be forgotten when a new list is added: the list
    // simply does not scroll independently until it declares one.
    const scrolls = {};
    for (const el of Array.from(this.querySelectorAll("[data-keep-scroll]"))) {
      if (el.scrollTop) scrolls[el.getAttribute("data-keep-scroll")] = el.scrollTop;
    }

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

    // The order of the top-level tabs is the user's decision, not a byproduct
    // of the order pages happened to be created in. Two ways to change it,
    // because one is not enough: drag a tab (fast, mouse) and arrows on the
    // active tab (works on a touch screen, where HTML5 drag events never
    // fire at all). The arrows are on the ACTIVE tab only — putting a pair on
    // every tab turns the bar into a row of chevrons and hides the titles.
    const tabs = pages.length > 1 ? `<nav class="page-tabs${this._editing ? " editing" : ""}">${pages.map((pg, i) => {
      const active = i === this._pageIndex;
      const tab = `<button class="page-tab ${active ? "active" : ""}" data-page-tab="${i}">
         <ha-icon icon="${esc(pg.icon || "mdi:view-dashboard-outline")}"></ha-icon>
         <span>${esc(pg.title || "Pagina " + (i + 1))}</span>
       </button>`;
      if (!this._editing) return tab;
      const nudges = active ? `
        <button class="pt-nudge" data-page-move="${i}:-1" ${i === 0 ? "disabled" : ""} title="Sposta a sinistra"><ha-icon icon="mdi:chevron-left"></ha-icon></button>` : "";
      const nudgesR = active ? `
        <button class="pt-nudge" data-page-move="${i}:1" ${i === pages.length - 1 ? "disabled" : ""} title="Sposta a destra"><ha-icon icon="mdi:chevron-right"></ha-icon></button>` : "";
      return `<div class="page-tab-wrap ${active ? "active" : ""}" draggable="true" data-page-drag="${i}">${nudges}${tab}${nudgesR}</div>`;
    }).join("")}${this._editing ? `<span class="pt-hint">trascina le schede per riordinarle</span>` : ""}</nav>` : "";

    const subtitle = floorplan
      ? `${this._rooms().length} STANZE · ${this._editing ? "MODIFICA ATTIVA" : "MAPPA 3D"}`
      : `${sections.length} SEZIONI · ${total} CARD · ${this._editing ? "MODIFICA ATTIVA" : "SISTEMA ONLINE"}`;
    // The running build, always visible: the fastest answer to "did my update
    // actually arrive" is being able to read the number on screen.
    const buildTag = CYBORG_BUILD ? ` · v${CYBORG_BUILD}` : "";

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
              <div class="sub">${subtitle}${buildTag}</div>
            </div>
          </div>
          <div class="tools">
            ${this._saved ? '<span class="status ok"><ha-icon icon="mdi:check"></ha-icon> SALVATO</span>' : ""}
            ${this._editing && this._dirty && !this._saved ? '<span class="status warn"><ha-icon icon="mdi:content-save-alert-outline"></ha-icon> MODIFICHE NON SALVATE</span>' : ""}
            ${this._error ? `<span class="status err">${esc(this._error)}</span>` : ""}
            ${this._staleBuild() ? `<span class="status err" title="Il browser sta eseguendo una copia vecchia del pannello">
              <ha-icon icon="mdi:reload-alert"></ha-icon> PANNELLO ${esc(CYBORG_BUILD)} · INTEGRAZIONE ${esc(this._serverVersion())} — SVUOTA LA CACHE</span>` : ""}
            ${this._editing ? `${floorplan
                 ? '<button class="secondary" data-add-room><ha-icon icon="mdi:plus-box-outline"></ha-icon> STANZA</button>'
                 : `<button class="secondary" data-add-rooms title="Una card per ogni area di Home Assistant"><ha-icon icon="mdi:home-group"></ha-icon> STANZE</button>
                    <button class="secondary" data-add-lights title="Tutte le luci della casa, per stanza"><ha-icon icon="mdi:lightbulb-group"></ha-icon> LUCI</button>
                    <button class="secondary" data-add-comfort title="Temperatura e umidità stanza per stanza"><ha-icon icon="mdi:home-thermometer"></ha-icon> TEMPERATURE</button>
                    <button class="secondary" data-add-thermostat title="Termostati e condizionatori, con i comandi"><ha-icon icon="mdi:thermostat-box"></ha-icon> CLIMA</button>
                    <button class="secondary" data-add-section><ha-icon icon="mdi:plus-box-outline"></ha-icon> SEZIONE</button>`}
               <button data-save class="${this._dirty ? "urgent" : ""}"><ha-icon icon="mdi:content-save"></ha-icon> SALVA</button>` : ""}
            <button class="secondary" data-toggle-edit>
              <ha-icon icon="${this._editing ? "mdi:eye-outline" : "mdi:pencil-outline"}"></ha-icon>
              ${this._editing ? "ESCI" : "MODIFICA"}
            </button>
          </div>
        </header>
        ${tabs}
        <div class="workspace ${this._editing ? "editing" : ""}">
          <main>${body}</main>
          ${this._editing ? `<div class="editor-backdrop" data-editor-backdrop></div>${this._renderEditor()}` : ""}
        </div>
        ${this._renderOverlay()}
      </div>`;

    // restore scroll synchronously, before the browser paints, so there is no
    // visible jump
    if (scroller && pageTop) scroller.scrollTop = pageTop;
    for (const key of Object.keys(scrolls)) {
      const el = this.querySelector(`[data-keep-scroll="${key}"]`);
      if (el) el.scrollTop = scrolls[key];
    }

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
    if (btn) btn.onclick = () => {
      if (this._editing && this._dirty) {
        // silently dropping edits is how "it won't let me delete" happens
        this._save();
        this._editing = false;
        this._selected = null;
        return;
      }
      this._editing = !this._editing;
      this._selected = null;
      this._touch();
    };
    const save = q("[data-save]");
    if (save) save.onclick = () => this._save();
    const secPage = q("[data-sec-page]");
    if (secPage) secPage.onchange = () =>
      this._moveSectionToPage(secPage.getAttribute("data-sec-page"), secPage.value);

    const addComfort = q("[data-add-comfort]");
    if (addComfort) addComfort.onclick = () => this._addComfortSection();
    const addThermo = q("[data-add-thermostat]");
    if (addThermo) addThermo.onclick = () => this._addThermostatSection();
    const addLights = q("[data-add-lights]");
    if (addLights) addLights.onclick = () => this._addLightSection();
    const addRooms = q("[data-add-rooms]");
    if (addRooms) addRooms.onclick = () => this._addRoomSection();
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

    // --- reordering sections by dragging their header
    all("[data-sec-drag]").forEach((el) => {
      const index = parseInt(el.getAttribute("data-sec-drag"), 10);
      el.ondragstart = (ev) => {
        this._dragSection = index;
        const host = el.closest(".dash-section");
        if (host) host.classList.add("dragging");
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          try { ev.dataTransfer.setData("text/plain", "sec:" + index); } catch (e) { /* ignore */ }
        }
      };
      el.ondragend = () => {
        this._dragSection = null;
        all(".dash-section").forEach((n) => n.classList.remove("dragging", "drop-above", "drop-below"));
      };
    });
    all("[data-sec-drop]").forEach((el) => {
      const index = parseInt(el.getAttribute("data-sec-drop"), 10);
      // Vertical stack, so the midpoint that decides above/below is on Y.
      const half = (ev) => {
        const box = el.getBoundingClientRect();
        return ev.clientY > box.top + box.height / 2;
      };
      el.ondragover = (ev) => {
        if (this._dragSection === null || this._dragSection === undefined || this._dragSection === index) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        const below = half(ev);
        el.classList.toggle("drop-above", !below);
        el.classList.toggle("drop-below", below);
      };
      el.ondragleave = () => el.classList.remove("drop-above", "drop-below");
      el.ondrop = (ev) => {
        ev.preventDefault();
        const from = this._dragSection;
        this._dragSection = null;
        if (from === null || from === undefined || from === index) return;
        let to = index + (half(ev) ? 1 : 0);
        if (from < to) to -= 1;
        this._reorderSection(from, to);
      };
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

    all("[data-close-editor]").forEach((el) => {
      el.onclick = () => {
        // On a phone the sheet covers the page, so closing it with nothing
        // selected has to leave edit mode entirely or the user is stuck.
        if (this._selected) this._selected = null; else this._editing = false;
        this._touch();
      };
    });
    const backdrop = q("[data-editor-backdrop]");
    if (backdrop) backdrop.onclick = () => { this._selected = null; this._touch(); };

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
      if (card.type === "lights") {
        const ls = q("[data-entity-search]");
        if (ls) ls.oninput = () => { this._entityQuery = ls.value; this._touch(true); };
      }
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

    // --- page management
    all("[data-add-page]").forEach((el) => {
      el.onclick = () => this._addPage(el.getAttribute("data-add-page"));
    });
    all("[data-page-remove]").forEach((el) => {
      el.onclick = () => this._removePage(parseInt(el.getAttribute("data-page-remove"), 10));
    });
    all("[data-page-move]").forEach((el) => {
      el.onclick = () => {
        const [i, d] = el.getAttribute("data-page-move").split(":").map(Number);
        this._movePage(i, d);
      };
    });

    // --- page tabs
    all("[data-page-tab]").forEach((el) => {
      el.onclick = () => {
        this._pageIndex = parseInt(el.getAttribute("data-page-tab"), 10) || 0;
        this._selected = null;
        this._focus = null;
        this._roomPicker = false;
        this._fitKey = null;
        this._touch(true);
      };
    });

    // --- reordering the tabs by dragging one onto another
    //
    // The drop index is computed from the pointer position relative to the
    // MIDPOINT of the tab under the cursor, not from the tab's index: dropping
    // on the left half means "before this one", on the right half "after". A
    // drop that ignores which half you released on lands one slot off roughly
    // half the time, and the user reads that as the feature not working.
    all("[data-page-drag]").forEach((el) => {
      const index = parseInt(el.getAttribute("data-page-drag"), 10);
      el.ondragstart = (ev) => {
        this._dragPage = index;
        el.classList.add("dragging");
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          // Firefox refuses to start a drag with an empty data payload.
          try { ev.dataTransfer.setData("text/plain", String(index)); } catch (e) { /* ignore */ }
        }
      };
      el.ondragend = () => {
        this._dragPage = null;
        all(".page-tab-wrap").forEach((n) => n.classList.remove("dragging", "drop-before", "drop-after"));
      };
      el.ondragover = (ev) => {
        if (this._dragPage === null || this._dragPage === undefined || this._dragPage === index) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        const box = el.getBoundingClientRect();
        const after = ev.clientX > box.left + box.width / 2;
        el.classList.toggle("drop-before", !after);
        el.classList.toggle("drop-after", after);
      };
      el.ondragleave = () => el.classList.remove("drop-before", "drop-after");
      el.ondrop = (ev) => {
        ev.preventDefault();
        const from = this._dragPage;
        this._dragPage = null;
        if (from === null || from === undefined || from === index) return;
        const box = el.getBoundingClientRect();
        const after = ev.clientX > box.left + box.width / 2;
        // Removing the dragged page first shifts every later index down by
        // one, so a drop to the RIGHT of its original position needs the
        // target index decremented — otherwise the page lands one slot too far.
        let to = index + (after ? 1 : 0);
        if (from < to) to -= 1;
        this._reorderPage(from, to);
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
    const viewTap = q("[data-view-tap]");
    if (viewTap) viewTap.onchange = () => {
      // Its own attribute rather than data-view-prop: that handler runs every
      // value through parseFloat, which would turn "more-info" into NaN.
      const view = this._page().view;
      if (view) { view.tap_action = viewTap.value; this._touch(); }
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
    all("[data-flow-toggle]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const id = el.getAttribute("data-flow-toggle");
        this._flowOpen[id] = !this._flowOpen[id];
        this._touch();
      };
    });
    const notifClear = q("[data-notif-clear]");
    if (notifClear) notifClear.onclick = () => {
      this._hass.callWS({ type: "cyborg_dashboard/notifications/clear" })
        .then(() => { this._sentNotifs = []; this._touch(true); })
        .catch(() => { this._error = "Archivio avvisi non disponibile"; this._touch(true); });
    };
    all("[data-thermo-ord]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        const [i, d] = el.getAttribute("data-thermo-ord").split(":").map(Number);
        // Materialise the order the first time it is touched: until then the
        // card has no stored order at all, it just renders the natural one.
        const order = this._thermoBlocks(card);
        const j = i + d;
        if (j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]];
        card.order = order;
        this._touch();
      };
    });
    all("[data-thermo-mode-sel]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        // "Tutte" is an EMPTY list, not a snapshot: the point of automatic is
        // that a unit installed next month joins on its own.
        card.units = el.getAttribute("data-thermo-mode-sel") === "manual"
          ? this._thermoUnits(card).slice() : [];
        this._touch();
      };
    });
    const thermoPick = q("[data-thermo-pick]");
    if (thermoPick && card) thermoPick.onchange = () => {
      if (!thermoPick.value) return;
      card.units = Array.isArray(card.units) ? card.units : [];
      if (!card.units.includes(thermoPick.value)) card.units.push(thermoPick.value);
      this._touch();
    };
    all("[data-thermo-drop]").forEach((el) => {
      el.onclick = () => {
        if (!card || !Array.isArray(card.units)) return;
        card.units.splice(Number(el.getAttribute("data-thermo-drop")), 1);
        this._touch();
      };
    });
    all("[data-thermo-man-add]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        card.manual = Array.isArray(card.manual) ? card.manual : [];
        const id = el.getAttribute("data-thermo-man-add");
        if (!card.manual.includes(id)) card.manual.push(id);
        this._touch();
      };
    });
    all("[data-thermo-man-drop]").forEach((el) => {
      el.onclick = () => {
        if (!card || !Array.isArray(card.manual)) return;
        card.manual.splice(Number(el.getAttribute("data-thermo-man-drop")), 1);
        this._touch();
      };
    });
    all("[data-thermo-power]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const id = el.getAttribute("data-thermo-power");
        const st = this._hass.states[id];
        if (!st) return;
        // climate.turn_on / turn_off exist and are the right call: toggling via
        // set_hvac_mode would need us to guess which mode "on" means.
        this._hass.callService("climate", st.state === "off" ? "turn_on" : "turn_off",
          { entity_id: id });
      };
    });
    all("[data-thermo-mode]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const [id, mode] = el.getAttribute("data-thermo-mode").split("|");
        this._hass.callService("climate", "set_hvac_mode", { entity_id: id, hvac_mode: mode });
      };
    });
    all("[data-thermo-step]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const [id, dir] = el.getAttribute("data-thermo-step").split("|");
        const st = this._hass.states[id];
        if (!st) return;
        const step = Number(st.attributes.target_temp_step) || 0.5;
        const cur = num(st.attributes.temperature);
        if (cur === null) return;
        this._thermoTemp(id, cur + step * Number(dir));
      };
    });
    all("[data-thermo-temp]").forEach((el) => {
      el.oninput = () => this._thermoTemp(el.getAttribute("data-thermo-temp"), Number(el.value));
      el.onclick = (ev) => ev.stopPropagation();
    });
    all("[data-thermo-set]").forEach((el) => {
      el.onchange = () => {
        const [id, key] = el.getAttribute("data-thermo-set").split("|");
        const service = { fan_mode: "set_fan_mode", preset_mode: "set_preset_mode",
                          swing_mode: "set_swing_mode" }[key];
        if (!service) return;
        this._hass.callService("climate", service, { entity_id: id, [key]: el.value });
      };
      el.onclick = (ev) => ev.stopPropagation();
    });
    all("[data-alarm-code]").forEach((el) => {
      el.oninput = () => {
        // Kept on the component, never in the document: see _alarmAct.
        this._alarmCode = this._alarmCode || {};
        this._alarmCode[el.getAttribute("data-alarm-code")] = el.value;
      };
      el.onclick = (ev) => ev.stopPropagation();
    });
    all("[data-alarm-act]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const [id, service] = el.getAttribute("data-alarm-act").split("|");
        this._alarmAct(id, service);
      };
    });
    all("[data-alarm-panic]").forEach((el) => {
      const id = el.getAttribute("data-alarm-panic");
      let timer = null, fired = false;
      const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
      // 1.2 s, not the 500 ms used elsewhere: this one starts a siren, and the
      // hold is the confirmation dialog. Long enough that it cannot happen by
      // accident, short enough to be usable in the moment you actually need it.
      el.onpointerdown = (ev) => {
        if (ev.pointerType === "mouse" && ev.button !== 0) return;
        fired = false;
        el.classList.add("holding");
        cancel();
        timer = setTimeout(() => {
          timer = null; fired = true;
          el.classList.remove("holding");
          this._alarmAct(id, "alarm_trigger");
        }, 1200);
      };
      const stop = () => { cancel(); el.classList.remove("holding"); };
      el.onpointerup = stop;
      el.onpointerleave = stop;
      el.onpointercancel = () => { stop(); fired = false; };
      el.onclick = (ev) => { ev.stopPropagation(); fired = false; };
      el.oncontextmenu = (ev) => ev.preventDefault();
    });
    all("[data-notif-filter]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        // The filter is a VIEW, kept on the component and not in the saved
        // document: which alerts you are looking at right now is not a
        // configuration change, and persisting it would mark the dashboard
        // dirty every time somebody glanced at the unread list.
        this._notifFilter = el.getAttribute("data-notif-filter") || "";
        this._touch(true);
      };
    });
    all("[data-notif-read]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        this._notifRead([el.getAttribute("data-notif-read")], el.getAttribute("data-read") !== "1");
      };
    });
    all("[data-notif-del]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        this._notifDelete([el.getAttribute("data-notif-del")], false);
      };
    });
    all("[data-notif-dismiss]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        // A persistent notification belongs to Home Assistant: the panel does
        // not own it and must not fake its removal locally.
        this._hass.callService("persistent_notification", "dismiss",
          { notification_id: el.getAttribute("data-notif-dismiss") });
      };
    });
    const notifReadAll = q("[data-notif-readall]");
    if (notifReadAll) notifReadAll.onclick = (ev) => {
      ev.stopPropagation();
      this._notifRead(null, true);
    };
    const notifPurge = q("[data-notif-purge]");
    if (notifPurge) notifPurge.onclick = (ev) => {
      ev.stopPropagation();
      this._notifDelete(null, true);
    };
    all("[data-comfort-filter]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const host = el.closest("[data-card-id]");
        const target = this._cardById(host && host.getAttribute("data-card-id"));
        if (!target) return;
        target.filter = el.getAttribute("data-comfort-filter");
        this._touch(true);   // a filter is a view, not a configuration change
      };
    });
    all("[data-comfort-band]").forEach((el) => {
      el.onchange = () => {
        if (!card) return;
        card.bands = card.bands || {};
        const key = el.getAttribute("data-comfort-band");
        if (el.value === "") delete card.bands[key];
        else card.bands[key] = Number(el.value);
        this._touch();
      };
    });
    const cfReset = q("[data-comfort-reset]");
    if (cfReset && card) cfReset.onclick = () => { card.bands = {}; this._touch(); };

    // --- l'elenco delle stanze scritto a mano
    //
    // "Personalizza" MATERIALIZZA il rilevamento automatico invece di partire
    // da un elenco vuoto: chi prende il comando quasi sempre vuole correggere
    // una riga su cinque, non riscriverle tutte. Partire dal vuoto gli
    // farebbe rifare a mano il lavoro che il sistema aveva già fatto bene.
    const cfCustom = q("[data-comfort-customize]");
    if (cfCustom && card) cfCustom.onclick = () => {
      card.rooms = this._comfortRooms(card).map((r) => ({
        temperature: r.temperature, humidity: r.humidity || null,
        name: r.name || "", icon: r.icon || "",
      }));
      if (!card.rooms.length) card.rooms = [{ temperature: "", humidity: null, name: "", icon: "" }];
      this._touch();
    };
    const cfAuto = q("[data-comfort-auto]");
    if (cfAuto && card) cfAuto.onclick = () => { card.rooms = []; this._touch(); };
    const cfAdd = q("[data-comfort-add]");
    if (cfAdd && card) cfAdd.onclick = () => {
      card.rooms = Array.isArray(card.rooms) ? card.rooms : [];
      const used = new Set(card.rooms.map((r) => r.temperature));
      const free = Object.keys(this._hass.states).find((id) => {
        const st = this._hass.states[id];
        return st && !used.has(id) && st.attributes.device_class === "temperature"
          && Number.isFinite(parseFloat(st.state));
      }) || "";
      const st = free && this._hass.states[free];
      card.rooms.push({ temperature: free, humidity: null,
        name: (st && st.attributes.friendly_name) || "", icon: "" });
      this._touch();
    };
    all("[data-comfort-room]").forEach((el) => {
      el.onchange = () => {
        if (!card || !Array.isArray(card.rooms)) return;
        const [i, key] = el.getAttribute("data-comfort-room").split("|");
        const row = card.rooms[Number(i)];
        if (!row) return;
        row[key] = el.value || (key === "humidity" ? null : "");
        this._touch();
      };
    });
    all("[data-comfort-move]").forEach((el) => {
      el.onclick = () => {
        if (!card || !Array.isArray(card.rooms)) return;
        const [i, d] = el.getAttribute("data-comfort-move").split(":").map(Number);
        const j = i + d;
        if (j < 0 || j >= card.rooms.length) return;
        [card.rooms[i], card.rooms[j]] = [card.rooms[j], card.rooms[i]];
        this._touch();
      };
    });
    all("[data-comfort-remove]").forEach((el) => {
      el.onclick = () => {
        if (!card || !Array.isArray(card.rooms)) return;
        card.rooms.splice(Number(el.getAttribute("data-comfort-remove")), 1);
        // An empty manual list would silently fall back to auto-detection and
        // look like the removal was ignored, so the last row taken out is an
        // explicit return to automatic.
        this._touch();
      };
    });

    // --- auto elettriche (definite a livello di dashboard)
    const flowVeh = q("[data-flow-vehicles]");
    if (flowVeh && card) flowVeh.onchange = () => {
      card.flow = card.flow || {};
      card.flow.show_vehicles = flowVeh.checked;
      this._touch();
    };
    const vehDetect = q("[data-veh-detect]");
    if (vehDetect) vehDetect.onclick = () => {
      const found = this._detectVehicles();
      if (!found.length) {
        this._error = "Nessuna auto elettrica riconosciuta in Home Assistant";
        this._touch(true);
        return;
      }
      this._dashboard.vehicles = Array.isArray(this._dashboard.vehicles) ? this._dashboard.vehicles : [];
      const known = new Set(this._dashboard.vehicles.map((v) => v.battery || v.power));
      let added = 0;
      for (const v of found) {
        if (known.has(v.battery || v.power)) continue;
        this._dashboard.vehicles.push(v);
        added += 1;
      }
      this._error = added ? "" : "Le auto trovate erano già dichiarate";
      this._touch();
    };
    const vehAdd = q("[data-veh-add]");
    if (vehAdd) vehAdd.onclick = () => {
      this._dashboard.vehicles = Array.isArray(this._dashboard.vehicles) ? this._dashboard.vehicles : [];
      const v = { id: uid("ev"), name: "Auto elettrica", icon: "mdi:car-electric", color: "#06d6a0",
        battery: null, charging: null, power: null, energy: null, range: null,
        plugged: null, target: null, switch: null, current: null, capacity: null };
      this._dashboard.vehicles.push(v);
      this._vehOpen = { ...(this._vehOpen || {}), [v.id]: true };
      this._touch();
    };
    all("[data-veh-open]").forEach((el) => {
      el.onclick = () => {
        const id = el.getAttribute("data-veh-open");
        this._vehOpen = { ...(this._vehOpen || {}) };
        this._vehOpen[id] = !this._vehOpen[id];
        this._touch(true);
      };
    });
    all("[data-veh-remove]").forEach((el) => {
      el.onclick = () => {
        const id = el.getAttribute("data-veh-remove");
        this._dashboard.vehicles = this._vehicles().filter((v) => v.id !== id);
        // A car removed from the dashboard must not leave a dangling id in a
        // room or a card, or the garage would keep an empty parking space.
        for (const page of this._dashboard.pages) {
          for (const room of (page.rooms || [])) {
            if (Array.isArray(room.vehicles)) room.vehicles = room.vehicles.filter((x) => x !== id);
          }
          for (const sec of (page.sections || [])) {
            for (const it of (sec.items || [])) {
              if (Array.isArray(it.vehicles)) it.vehicles = it.vehicles.filter((x) => x !== id);
            }
          }
        }
        this._touch();
      };
    });
    all("[data-veh-prop]").forEach((el) => {
      const commit = () => {
        const [id, key] = el.getAttribute("data-veh-prop").split("|");
        const v = this._vehicle(id);
        if (!v) return;
        v[key] = key === "capacity" ? (el.value === "" ? null : Number(el.value)) : el.value;
        this._touch();
      };
      el.onchange = commit;
    });
    all("[data-veh-field]").forEach((el) => {
      el.onchange = () => {
        const [id, key] = el.getAttribute("data-veh-field").split("|");
        const v = this._vehicle(id);
        if (!v) return;
        v[key] = el.value || null;
        this._touch();
      };
    });
    all("[data-veh-pick]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        const id = el.getAttribute("data-veh-pick");
        const all2 = this._vehicles().map((v) => v.id);
        const cur = Array.isArray(card.vehicles) && card.vehicles.length ? card.vehicles.slice() : all2.slice();
        card.vehicles = cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat([id]);
        this._touch();
      };
    });
    all("[data-ev-switch]").forEach((el) => {
      el.onclick = () => this._hass.callService("switch", "toggle",
        { entity_id: el.getAttribute("data-ev-switch") });
    });
    all("[data-ev-current]").forEach((el) => {
      // onchange, not oninput: a repaint mid-drag replaces the slider and
      // aborts the gesture, and every step would be a service call besides.
      el.onchange = () => this._hass.callService("number", "set_value",
        { entity_id: el.getAttribute("data-ev-current"), value: Number(el.value) });
    });

    all("[data-active-vis]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        const id = el.getAttribute("data-active-vis");
        const cur = Array.isArray(card.exclude) ? card.exclude.slice() : [];
        card.exclude = cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat([id]);
        this._touch();
      };
    });
    all("[data-active-dev]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        const ids = el.getAttribute("data-active-dev").split("|");
        const cur = new Set(Array.isArray(card.exclude) ? card.exclude : []);
        const allHidden = ids.every((id) => cur.has(id));
        for (const id of ids) { if (allHidden) cur.delete(id); else cur.add(id); }
        card.exclude = Array.from(cur);
        this._touch();
      };
    });
    const activeVisAll = q("[data-active-vis-all]");
    if (activeVisAll && card) activeVisAll.onclick = () => { card.exclude = []; this._touch(); };

    all("[data-roomcard-vis]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        const id = el.getAttribute("data-roomcard-vis");
        const hidden = Array.isArray(card.hidden) ? card.hidden.slice() : [];
        card.hidden = hidden.includes(id) ? hidden.filter((x) => x !== id) : hidden.concat([id]);
        this._touch();
      };
    });
    all("[data-room-lights-off]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const area = el.getAttribute("data-room-lights-off");
        const ids = ((this._registry && this._registry.byArea[area]) || [])
          .filter((id) => domainOf(id) === "light" && this._hass.states[id]
            && this._hass.states[id].state === "on");
        if (ids.length) this._hass.callService("light", "turn_off", { entity_id: ids });
      };
    });
    all("[data-cover-cmd]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const [id, service] = el.getAttribute("data-cover-cmd").split("|");
        // cover has no turn_on/turn_off: open_cover / close_cover / stop_cover
        this._hass.callService("cover", service, { entity_id: id });
      };
    });
    all("[data-limit]").forEach((el) => {
      el.onchange = () => {
        if (!card) return;
        const [group, key] = el.getAttribute("data-limit").split("|");
        card.limits = card.limits || {};
        card.limits[group] = card.limits[group] || {};
        const raw = el.value.trim();
        // An empty field means "use the standard", not "no limit": deleting the
        // key is what makes the placeholder come back.
        if (raw === "") delete card.limits[group][key];
        else card.limits[group][key] = Number(raw);
        if (!Object.keys(card.limits[group]).length) delete card.limits[group];
        this._touch();
      };
    });
    const limReset = q("[data-limits-reset]");
    if (limReset && card) limReset.onclick = () => { card.limits = {}; this._touch(); };

    /**
     * Following a line with the pointer.
     *
     * Four lines crossing on one plane are unreadable the moment you need a
     * number off one of them. So: the nearest series is thickened and the
     * others fade, a vertical guide marks the instant under the pointer, a dot
     * sits on every curve at that instant, and the readout lists the values —
     * the focused one first and in its own colour.
     *
     * The DOM is touched directly, never re-rendered: repainting the card on
     * every pointermove would rebuild the SVG under the finger and the chart
     * would fight the cursor instead of following it.
     */
    all("[data-wx-day]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const [id, idx] = el.getAttribute("data-wx-day").split("|");
        this._wxDay = this._wxDay || {};
        // Same row again closes it: an accordion that only ever opens leaves
        // the user with no way back to the compact list.
        this._wxDay[id] = this._wxDay[id] === Number(idx) ? null : Number(idx);
        this._touch(true);
      };
    });

    /** Same pointer readout as the comparison chart, on the weather curve. */
    all("[data-wx-chart]").forEach((svg) => {
      let g;
      try { g = JSON.parse(svg.getAttribute("data-wx-chart")); } catch (e) { return; }
      if (!g || !g.points || g.points.length < 2) return;
      const plot = svg.closest(".wxc-plot");
      const read = plot && plot.querySelector(".wxc-read");
      const cursor = svg.querySelector(".wxc-cursor");
      const dot = svg.querySelector(".wxc-pt");
      if (!plot || !read || !cursor || !dot) return;

      const xOf = (i) => g.PAD_L + (i / (g.n - 1)) * (g.W - g.PAD_L - g.PAD_R);
      const yOf = (v) => g.PAD_T + (1 - (v - g.min) / (g.max - g.min)) * (g.H - g.PAD_T - g.PAD_B);

      const move = (ev) => {
        const box = svg.getBoundingClientRect();
        if (!box.width) return;
        const vx = ((ev.clientX - box.left) / box.width) * g.W;
        const frac = Math.max(0, Math.min(1, (vx - g.PAD_L) / Math.max(1, g.W - g.PAD_L - g.PAD_R)));
        // Snap to an actual forecast hour: the provider gives one value per
        // hour and inventing what lies between two of them would be fiction.
        const i = Math.round(frac * (g.n - 1));
        cursor.setAttribute("x1", xOf(i).toFixed(1));
        cursor.setAttribute("x2", xOf(i).toFixed(1));
        dot.setAttribute("cx", xOf(i).toFixed(1));
        dot.setAttribute("cy", yOf(g.points[i]).toFixed(1));
        const m = g.meta[i] || {};
        const bits = [`<b>${esc(Math.round(g.points[i] * 10) / 10)}${esc(g.unit)}</b>`];
        if (m.cond) bits.push(esc(m.cond));
        if (m.rain) bits.push("pioggia " + esc(m.rain));
        if (m.mm) bits.push(esc(m.mm));
        if (m.wind) bits.push("vento " + esc(m.wind));
        read.innerHTML = `<span class="wxc-read-t">${esc(g.labels[i] || "")}</span>` + bits.join(" · ");
        read.hidden = false;
        plot.classList.add("hovering");
      };
      const clear = () => { plot.classList.remove("hovering"); read.hidden = true; };
      svg.onpointermove = move;
      svg.onpointerdown = move;
      svg.onpointerleave = clear;
      svg.onpointercancel = clear;
    });

    all("[data-trend-svg]").forEach((svg) => {
      const geom = (this._trendGeom || {})[svg.getAttribute("data-trend-svg")];
      if (!geom || !geom.series.length) return;
      const plot = svg.closest(".tr-plot");
      const layer = plot && plot.querySelector("[data-trend-hover]");
      const cursor = layer && layer.querySelector(".tr-cursor");
      const read = plot && plot.querySelector("[data-trend-read]");
      if (!layer || !cursor || !read) return;

      const legendOf = (entity) => plot.parentElement
        && plot.parentElement.querySelector(`.tr-leg[data-more-info="${entity}"]`);
      const yOf = (v) => geom.PAD_T + (1 - (v - geom.lo) / (geom.hi - geom.lo))
        * (geom.H - geom.PAD_T - geom.PAD_B);
      const fmt = (v, unit) => (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)) + unit;

      const clear = () => {
        plot.classList.remove("hovering");
        read.hidden = true;
        svg.querySelectorAll(".tr-line").forEach((l) => l.classList.remove("focus", "dim"));
        plot.parentElement.querySelectorAll(".tr-leg").forEach((l) => l.classList.remove("focus"));
      };

      const move = (ev) => {
        const box = svg.getBoundingClientRect();
        if (!box.width) return;
        // preserveAspectRatio="none" means the viewBox maps linearly onto the
        // box on each axis independently, so this is a plain rescale.
        const vx = ((ev.clientX - box.left) / box.width) * geom.W;
        const vy = ((ev.clientY - box.top) / box.height) * geom.H;
        const inner = Math.max(1, geom.W - geom.PAD_L - geom.PAD_R);
        const frac = Math.max(0, Math.min(1, (vx - geom.PAD_L) / inner));
        const t = geom.start + (geom.end - geom.start) * frac;

        let best = null;
        const rows = geom.series.map((row) => {
          // Nearest sample in time, not interpolation: the readout must show a
          // value the recorder actually stored, not one invented between two.
          let pick = row.pts[0];
          let dist = Math.abs(pick[0] - t);
          for (const pt of row.pts) {
            const d2 = Math.abs(pt[0] - t);
            if (d2 < dist) { dist = d2; pick = pt; }
          }
          const py = yOf(pick[1]);
          const dy = Math.abs(py - vy);
          if (!best || dy < best.dy) best = { entity: row.entity, dy };
          return { row, value: pick[1], time: pick[0], py };
        });

        const px = geom.PAD_L + frac * inner;
        cursor.setAttribute("x1", px.toFixed(1));
        cursor.setAttribute("x2", px.toFixed(1));
        for (const r of rows) {
          const dot = layer.querySelector(`[data-pt="${r.row.entity}"]`);
          if (dot) { dot.setAttribute("cx", px.toFixed(1)); dot.setAttribute("cy", r.py.toFixed(1)); }
        }

        svg.querySelectorAll(".tr-line").forEach((l) => {
          const on = l.getAttribute("data-series") === best.entity;
          l.classList.toggle("focus", on);
          l.classList.toggle("dim", !on);
        });
        plot.parentElement.querySelectorAll(".tr-leg").forEach((l) => l.classList.remove("focus"));
        const leg = legendOf(best.entity);
        if (leg) leg.classList.add("focus");

        const when = new Date(rows[0] ? rows[0].time : t);
        const stamp = geom.hours > 72
          ? `${when.getDate()}/${when.getMonth() + 1} ${String(when.getHours()).padStart(2, "0")}:00`
          : String(when.getHours()).padStart(2, "0") + ":" + String(when.getMinutes()).padStart(2, "0");
        const ordered = rows.slice().sort((a, b) =>
          (b.row.entity === best.entity) - (a.row.entity === best.entity) || b.value - a.value);
        read.innerHTML = `<span class="tr-read-t">${esc(stamp)}</span>`
          + ordered.map((r) => `<span class="tr-read-v ${r.row.entity === best.entity ? "on" : ""}"
              style="--sc:${esc(r.row.color)}"><i></i>${esc(r.row.name)} <b>${esc(fmt(r.value, r.row.unit))}</b></span>`).join("");
        read.hidden = false;
        plot.classList.add("hovering");
      };

      svg.onpointermove = move;
      svg.onpointerdown = move;
      svg.onpointerleave = clear;
      svg.onpointercancel = clear;
    });
    all("[data-trend-source]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        const next = el.getAttribute("data-trend-source");
        // Switching to "scelte da me" MATERIALISES whatever is on screen, so
        // the chart the user is looking at does not empty itself the moment
        // he asks to take control of it.
        if (next === "manual" && (card.source || "manual") !== "manual") {
          card.series = this._trendSeries(card).map((r) => ({
            entity: r.entity, name: r.name || "", color: r.color || "" }));
        }
        card.source = next;
        this._trend = {};
        this._touch();
      };
    });
    const trendFill = q("[data-trend-fill]");
    if (trendFill && card) trendFill.onchange = () => {
      const pick = trendFill.value;
      if (!pick) return;
      card.series = Array.isArray(card.series) ? card.series : [];
      const have = new Set(card.series.map((r) => r.entity));
      const push = (entity, name) => {
        if (card.series.length >= MAX_TREND_SERIES || have.has(entity)) return;
        card.series.push({ entity, name: name || "",
          color: SERIES_COLORS[card.series.length % SERIES_COLORS.length] });
        have.add(entity);
      };
      if (pick === "__rooms") {
        // The only class that gets special treatment, and for a real reason:
        // room temperatures are worth labelling with the ROOM name rather than
        // "Sensore T&U Bagno Temperatura". Everything else is filled generically.
        for (const room of this._comfortRooms({})) push(room.temperature, room.name);
      } else {
        const area = (this._registry && this._registry.entityArea) || {};
        const cat = (this._registry && this._registry.category) || {};
        const ids = Object.keys(this._hass.states).filter((id) => {
          const st = this._hass.states[id];
          return st && !cat[id] && st.attributes.device_class === pick
            && Number.isFinite(parseFloat(st.state));
        }).sort((a, b) => (area[a] || "").localeCompare(area[b] || "") || a.localeCompare(b));
        for (const id of ids) push(id, area[id] ? "" : "");
      }
      trendFill.value = "";
      this._trend = {};
      this._touch();
    };
    const trendAdd = q("[data-trend-add]");
    if (trendAdd && card) trendAdd.onchange = () => {
      if (!trendAdd.value) return;
      card.series = Array.isArray(card.series) ? card.series : [];
      if (card.series.length < MAX_TREND_SERIES && !card.series.some((r) => r.entity === trendAdd.value)) {
        card.series.push({ entity: trendAdd.value, name: "",
          color: SERIES_COLORS[card.series.length % SERIES_COLORS.length] });
      }
      this._trend = {};   // the cache key includes the entity list
      this._touch();
    };
    all("[data-trend-remove]").forEach((el) => {
      el.onclick = () => {
        if (!card || !Array.isArray(card.series)) return;
        card.series.splice(parseInt(el.getAttribute("data-trend-remove"), 10), 1);
        this._trend = {};
        this._touch();
      };
    });
    all("[data-trend-color]").forEach((el) => {
      el.onchange = () => {
        if (!card || !Array.isArray(card.series)) return;
        const row = card.series[parseInt(el.getAttribute("data-trend-color"), 10)];
        if (row) { row.color = el.value; this._touch(); }
      };
    });
    all("[data-trend-hours]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const host = el.closest("[data-card-id]");
        const target = this._cardById(host && host.getAttribute("data-card-id"));
        if (!target) return;
        target.hours = parseInt(el.getAttribute("data-trend-hours"), 10);
        this._touch();
      };
    });
    all("[data-lights-mode]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        // Switching to manual freezes the current automatic list so the user
        // starts from what is already on screen instead of an empty card.
        card.lights = el.getAttribute("data-lights-mode") === "auto"
          ? []
          : Object.keys(this._hass.states).filter((x) => x.startsWith("light."));
        this._entityQuery = "";
        this._touch();
      };
    });
    all("[data-light-add]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        const id = el.getAttribute("data-light-add");
        card.lights = Array.isArray(card.lights) ? card.lights.slice() : [];
        if (!card.lights.includes(id)) card.lights.push(id);
        this._touch();
      };
    });
    all("[data-light-drop]").forEach((el) => {
      el.onclick = () => {
        if (!card || !Array.isArray(card.lights)) return;
        const id = el.getAttribute("data-light-drop");
        card.lights = card.lights.filter((x) => x !== id);
        this._touch();
      };
    });
    const zoneAdd = q("[data-zone-add]");
    if (zoneAdd && card) zoneAdd.onchange = () => {
      if (!zoneAdd.value) return;
      card.zones = Array.isArray(card.zones) ? card.zones : [];
      if (!card.zones.some((z) => z.entity === zoneAdd.value)) {
        card.zones.push({ entity: zoneAdd.value, name: "", icon: "", minutes: 10, moisture: null });
      }
      this._touch();
    };
    all("[data-zone-remove]").forEach((el) => {
      el.onclick = () => {
        if (!card || !Array.isArray(card.zones)) return;
        card.zones.splice(parseInt(el.getAttribute("data-zone-remove"), 10), 1);
        this._touch();
      };
    });
    all("[data-zone-prop]").forEach((el) => {
      el.onchange = () => {
        if (!card || !Array.isArray(card.zones)) return;
        const [i, key] = el.getAttribute("data-zone-prop").split("|");
        const zone = card.zones[parseInt(i, 10)];
        if (!zone) return;
        zone[key] = key === "minutes" ? Math.max(1, Math.min(720, parseInt(el.value, 10) || 10))
          : (el.value || null);
        this._touch();
      };
    });

    // --- luci
    all("[data-light-toggle]").forEach((el) => {
      // Through the entity's own domain: a light wired to a relay is a switch,
      // and light.toggle on a switch does nothing at all and reports nothing.
      el.onclick = () => this._toggleEntity(el.getAttribute("data-light-toggle"));
    });
    all("[data-light-open]").forEach((el) => {
      el.onclick = () => {
        const id = el.getAttribute("data-light-open");
        this._lightOpen = { ...(this._lightOpen || {}) };
        this._lightOpen[id] = !this._lightOpen[id];
        this._touch(true);
      };
    });
    all("[data-light-bri]").forEach((el) => {
      // onchange, not oninput: a repaint on every pixel of the drag would
      // replace the slider under the finger and abort the gesture. The live
      // feedback is the light itself.
      el.onchange = () => this._hass.callService("light", "turn_on",
        { entity_id: el.getAttribute("data-light-bri"), brightness_pct: parseInt(el.value, 10) });
    });
    all("[data-light-color]").forEach((el) => {
      el.onclick = () => {
        const [id, hex] = el.getAttribute("data-light-color").split("|");
        const rgb = hexToRgb(hex);
        if (rgb) this._hass.callService("light", "turn_on", { entity_id: id, rgb_color: rgb });
      };
    });
    all("[data-light-pick]").forEach((el) => {
      el.onchange = () => {
        const rgb = hexToRgb(el.value);
        if (rgb) this._hass.callService("light", "turn_on",
          { entity_id: el.getAttribute("data-light-pick"), rgb_color: rgb });
      };
    });
    all("[data-light-temp]").forEach((el) => {
      el.onchange = () => this._hass.callService("light", "turn_on",
        { entity_id: el.getAttribute("data-light-temp"), color_temp_kelvin: parseInt(el.value, 10) });
    });
    all("[data-light-kelvin]").forEach((el) => {
      el.onclick = () => {
        const [id, k] = el.getAttribute("data-light-kelvin").split("|");
        this._hass.callService("light", "turn_on", { entity_id: id, color_temp_kelvin: parseInt(k, 10) });
      };
    });
    all("[data-light-effect]").forEach((el) => {
      el.onchange = () => this._hass.callService("light", "turn_on",
        { entity_id: el.getAttribute("data-light-effect"), effect: el.value });
    });
    all("[data-lights-all]").forEach((el) => {
      el.onclick = () => {
        const host = el.closest("[data-card-id]");
        const card = this._cardById(host && host.getAttribute("data-card-id"));
        const ids = this._lightEntities(card || {});
        if (!ids.length) return;
        const service = el.getAttribute("data-lights-all") === "on" ? "turn_on" : "turn_off";
        // Grouped by domain: homeassistant.turn_on works for everything, but
        // sending a mixed list to light.turn_on silently drops the switches.
        const byDomain = {};
        for (const id of ids) (byDomain[domainOf(id)] = byDomain[domainOf(id)] || []).push(id);
        for (const [d, list] of Object.entries(byDomain)) {
          this._hass.callService(d === "light" ? "light" : "homeassistant", service, { entity_id: list });
        }
      };
    });
    all("[data-lights-area]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const area = el.getAttribute("data-lights-area");
        const host = el.closest("[data-card-id]");
        const card = this._cardById(host && host.getAttribute("data-card-id"));
        const ids = this._lightEntities(card || {})
          .filter((id) => (this._areaOf(id) || "Senza stanza") === area
            && ON_STATES.has(this._hass.states[id].state));
        const byDomain = {};
        for (const id of ids) (byDomain[domainOf(id)] = byDomain[domainOf(id)] || []).push(id);
        for (const [d, list] of Object.entries(byDomain)) {
          this._hass.callService(d === "light" ? "light" : "homeassistant", "turn_off", { entity_id: list });
        }
      };
    });

    // --- irrigazione
    all("[data-zone-toggle]").forEach((el) => {
      el.onclick = () => {
        const id = el.getAttribute("data-zone-toggle");
        const st = this._hass.states[id];
        if (!st) return;
        const open = ["on", "open", "opening"].includes(st.state);
        const d = domainOf(id);
        // valve and cover do not have turn_on/turn_off at all; calling those
        // would silently do nothing, which on a valve is indistinguishable
        // from a broken solenoid.
        if (d === "valve") this._hass.callService("valve", open ? "close_valve" : "open_valve", { entity_id: id });
        else if (open) this._hass.callService(d === "light" ? "light" : "homeassistant", "turn_off", { entity_id: id });
        else this._hass.callService(d === "light" ? "light" : "homeassistant", "turn_on", { entity_id: id });
        if (open) this._cancelRun(id, false);
      };
    });
    all("[data-zone-run]").forEach((el) => {
      el.onclick = () => {
        const [id, minutes] = el.getAttribute("data-zone-run").split("|");
        this._hass.callWS({ type: "cyborg_dashboard/run_for", entity_id: id, minutes: Number(minutes) })
          .then((res) => {
            const timers = ((this._schedule && this._schedule.timers) || [])
              .filter((t) => t.entity_id !== id).concat([res.timer]);
            this._schedule = { ...(this._schedule || { jobs: [] }), timers };
            this._touch(true);
          })
          .catch(() => {
            this._error = "Avvio a tempo non disponibile: riavvia Home Assistant dopo l'aggiornamento";
            this._touch(true);
          });
      };
    });
    all("[data-zone-stop]").forEach((el) => {
      el.onclick = () => this._cancelRun(el.getAttribute("data-zone-stop"), true);
    });
    const zonesStop = q("[data-zones-stop]");
    if (zonesStop) zonesStop.onclick = () => {
      const cardEl = zonesStop.closest("[data-card]");
      const card = this._cardById(cardEl && cardEl.getAttribute("data-card"));
      for (const z of this._irrigationZones(card || {})) {
        const st = this._hass.states[z.entity];
        if (st && ["on", "open", "opening"].includes(st.state)) this._cancelRun(z.entity, true);
      }
    };

    // --- orari
    all("[data-sched-add]").forEach((el) => {
      el.onclick = () => {
        const entity = el.getAttribute("data-sched-add");
        const jobs = ((this._schedule && this._schedule.jobs) || []).slice();
        jobs.push({ id: uid("job"), entity_id: entity, action: "on", at: "07:00",
          days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], enabled: true, label: "", data: {} });
        this._saveSchedule(jobs);
      };
    });
    all("[data-sched-remove]").forEach((el) => {
      el.onclick = () => this._saveSchedule(
        ((this._schedule && this._schedule.jobs) || []).filter((j) => j.id !== el.getAttribute("data-sched-remove")));
    });
    all("[data-sched-toggle]").forEach((el) => {
      el.onclick = () => {
        const id = el.getAttribute("data-sched-toggle");
        this._saveSchedule(((this._schedule && this._schedule.jobs) || [])
          .map((j) => j.id === id ? { ...j, enabled: !j.enabled } : j));
      };
    });
    all("[data-sched-prop]").forEach((el) => {
      el.onchange = () => {
        const [id, key] = el.getAttribute("data-sched-prop").split("|");
        this._saveSchedule(((this._schedule && this._schedule.jobs) || [])
          .map((j) => j.id === id ? { ...j, [key]: el.value } : j));
      };
    });
    all("[data-sched-day]").forEach((el) => {
      el.onclick = () => {
        const [id, day] = el.getAttribute("data-sched-day").split("|");
        this._saveSchedule(((this._schedule && this._schedule.jobs) || []).map((j) => {
          if (j.id !== id) return j;
          const days = j.days.includes(day) ? j.days.filter((d) => d !== day) : j.days.concat([day]);
          return { ...j, days };
        }));
      };
    });

    all("[data-act-off]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const card = this._cardById(el.getAttribute("data-act-card"))
          || this._selectedCard();
        const group = ACTIVE_GROUPS.find((g) => g.k === el.getAttribute("data-act-off"));
        if (!group || !group.off) return;
        const ids = this._activeEntities(card || {})
          .filter((r) => group.domains.includes(domainOf(r.id)))
          .map((r) => r.id);
        if (!ids.length) return;
        // One call with the whole list, not one per entity: a bulk service
        // call is a single round trip and Home Assistant fans it out itself.
        this._hass.callService(group.off.domain, group.off.service, { entity_id: ids });
      };
    });
    all("[data-fp-badge-alt]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        this._badgeTap(el.getAttribute("data-fp-badge-alt"), true);
      };
    });
    all("[data-fp-badge]").forEach((el) => {
      const id = el.getAttribute("data-fp-badge");
      let timer = null, fired = false, startX = 0, startY = 0;
      const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
      // 500 ms is the usual long-press threshold and it is what Home
      // Assistant's own cards use, so the gesture is already in the user's
      // hands. The pointer is allowed to wander 10 px: a finger never holds
      // perfectly still, and cancelling on the first pixel would make the
      // gesture feel broken rather than precise.
      el.onpointerdown = (ev) => {
        if (ev.pointerType === "mouse" && ev.button !== 0) return;
        fired = false; startX = ev.clientX; startY = ev.clientY;
        cancel();
        timer = setTimeout(() => {
          timer = null; fired = true;
          this._badgeTap(id, true);
        }, 500);
      };
      el.onpointermove = (ev) => {
        if (!timer) return;
        if (Math.abs(ev.clientX - startX) > 10 || Math.abs(ev.clientY - startY) > 10) cancel();
      };
      el.onpointerup = cancel;
      el.onpointercancel = () => { cancel(); fired = false; };
      el.onpointerleave = cancel;
      el.onclick = (ev) => {
        ev.stopPropagation();
        // The click that follows a long press must not ALSO run the short
        // action, or a hold would both open the details and flip the switch.
        if (fired) { fired = false; return; }
        this._badgeTap(id);
      };
      // Holding on a touch screen otherwise pops the browser's own context
      // menu over the map, which eats the gesture.
      el.oncontextmenu = (ev) => ev.preventDefault();
    });
    all("[data-room-prop]").forEach((el) => {
      el.onchange = () => {
        const room = this._room(this._selected && this._selected.roomId);
        if (!room) return;
        const key = el.getAttribute("data-room-prop");
        const numeric = ["x", "y", "w", "h", "level", "rotation"].includes(key);
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
    // --- storey, shape, focus and device management
    all("[data-pick-room]").forEach((el) => {
      el.onclick = () => {
        this._selected = { kind: "room", roomId: el.getAttribute("data-pick-room") };
        this._roomPicker = false;
        this._entityQuery = "";
        this._touch(true);
      };
    });
    all("[data-level-pick]").forEach((el) => {
      el.onclick = () => {
        const raw = el.getAttribute("data-level-pick");
        const view = this._page().view;
        view.active_level = raw === "all" ? null : parseInt(raw, 10);
        this._touch();
      };
    });
    all("[data-room-level]").forEach((el) => {
      el.onclick = () => {
        const room = this._room(this._selected && this._selected.roomId);
        if (!room) return;
        const next = Math.max(-3, Math.min(8, (room.level || 0) + parseInt(el.getAttribute("data-room-level"), 10)));
        room.level = next;
        // Following the room to its new storey: leaving the view filtered on
        // the old floor would make the room the user just moved disappear.
        const view = this._page().view;
        if (view.active_level !== null && view.active_level !== undefined) view.active_level = next;
        if (this._focus && this._focus.roomId === room.id) this._focusRoom(room.id);
        else this._touch();
      };
    });
    all("[data-wall-type]").forEach((el) => {
      el.onchange = () => {
        const room = this._room(this._selected && this._selected.roomId);
        if (!room) return;
        const i = parseInt(el.getAttribute("data-wall-type"), 10);
        const count = roomEdges(room).length;
        // The array is materialised to the full side count on first edit, so a
        // later reshape never leaves a hole that silently reads as "wall".
        const walls = Array.from({ length: count }, (_, j) =>
          (Array.isArray(room.walls) && room.walls[j]) || "wall");
        walls[i] = el.value;
        room.walls = walls;
        this._touch();
      };
    });
    const wallsReset = q("[data-walls-reset]");
    if (wallsReset) wallsReset.onclick = () => {
      const room = this._room(this._selected && this._selected.roomId);
      if (!room) return;
      room.walls = [];
      this._touch();
    };
    all("[data-room-shape]").forEach((el) => {
      el.onclick = () => {
        const room = this._room(this._selected && this._selected.roomId);
        if (!room) return;
        const preset = SHAPE_PRESETS.find((sp) => sp.k === el.getAttribute("data-room-shape"));
        if (!preset) return;
        room.points = preset.points ? preset.points.map((pt) => pt.slice()) : null;
        this._touch();
      };
    });
    all("[data-vertex-remove]").forEach((el) => {
      el.onclick = () => {
        const room = this._room(this._selected && this._selected.roomId);
        if (!room || !Array.isArray(room.points) || room.points.length <= 3) return;
        room.points.splice(parseInt(el.getAttribute("data-vertex-remove"), 10), 1);
        this._touch();
      };
    });
    all("[data-room-mode]").forEach((el) => {
      el.onclick = () => {
        const room = this._room(this._selected && this._selected.roomId);
        if (!room) return;
        // Switching to manual freezes whatever the area currently yields, so
        // the user starts from a populated list instead of an empty one.
        room.entities = el.getAttribute("data-room-mode") === "auto" ? null : this._roomAllEntities(room).slice();
        this._touch();
      };
    });
    all("[data-room-add-device]").forEach((el) => {
      el.onclick = () => {
        const room = this._room(el.getAttribute("data-room-add-device"));
        if (!room) return;
        if (!Array.isArray(room.entities)) room.entities = this._roomAllEntities(room).slice();
        this._selected = { kind: "room", roomId: room.id };
        this._roomPicker = true;
        this._entityQuery = "";
        this._touch();
      };
    });
    const pickerClose = q("[data-room-picker-close]");
    if (pickerClose) pickerClose.onclick = () => { this._roomPicker = false; this._entityQuery = ""; this._touch(true); };
    all("[data-room-focus]").forEach((el) => {
      el.onclick = (ev) => { ev.stopPropagation(); this._focusRoom(el.getAttribute("data-room-focus")); };
    });
    all("[data-room-focus-btn]").forEach((el) => {
      el.onclick = () => this._focusRoom(el.getAttribute("data-room-focus-btn"));
    });
    const focusExit = q("[data-focus-exit]");
    if (focusExit) focusExit.onclick = () => this._exitFocus();

    all("[data-room-veh]").forEach((el) => {
      el.onclick = () => {
        const room = this._room(this._selected && this._selected.roomId);
        if (!room) return;
        const id = el.getAttribute("data-room-veh");
        const cur = Array.isArray(room.vehicles) ? room.vehicles.slice() : [];
        room.vehicles = cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat([id]);
        this._touch();
      };
    });
    all("[data-room-vis]").forEach((el) => {
      el.onclick = () => {
        const room = this._room(this._selected && this._selected.roomId);
        if (!room) return;
        const id = el.getAttribute("data-room-vis");
        const hidden = Array.isArray(room.hidden) ? room.hidden.slice() : [];
        room.hidden = hidden.includes(id) ? hidden.filter((x) => x !== id) : hidden.concat([id]);
        this._touch();
      };
    });
    const visAll = q("[data-room-vis-all]");
    if (visAll) visAll.onclick = () => {
      const room = this._room(this._selected && this._selected.roomId);
      if (!room) return;
      room.hidden = [];
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
    this._bindMapGestures();
    const fitBtn = q("[data-view-fit]");
    if (fitBtn) fitBtn.onclick = () => this._fitPlan(true);
    if (this._isFloorplan() && this._rooms().length) {
      // Auto-fit once per page visit and again whenever the breakpoint
      // changes, so opening the map on a phone shows the whole house instead
      // of one corner of it, without overriding a zoom the user then chose.
      const w = typeof window !== "undefined" ? window.innerWidth : 0;
      const key = this._pageIndex + "@" + (w < 700 ? "s" : w < 1200 ? "m" : "l");
      if (this._fitKey !== key) {
        this._fitKey = key;
        this._fitPlan(false);
      }
    }

    // --- overlay (dettaglio meteo, camera live)
    all("[data-cam-open]").forEach((el) => {
      el.onclick = () => this._openOverlay("camera", el.getAttribute("data-cam-open"));
    });
    all(".cam-img").forEach((img) => {
      img.onerror = () => {
        // The browser's broken-image glyph is not a status message. Replace the
        // tile with an explicit offline state; the next refresh tick retries
        // with a freshly read token and brings it back on its own.
        img.classList.add("failed");
        const host = img.closest(".cam");
        if (host && !host.querySelector(".cam-off")) {
          const ph = document.createElement("div");
          ph.className = "cam-off";
          ph.innerHTML = '<ha-icon icon="mdi:cctv-off"></ha-icon><small>immagine non disponibile</small>';
          host.insertBefore(ph, host.firstChild);
        }
      };
      img.onload = () => {
        img.classList.remove("failed");
        const host = img.closest(".cam");
        const ph = host && host.querySelector(".cam-off");
        if (ph) ph.remove();
      };
    });
    all("[data-weather-open]").forEach((el) => {
      el.onclick = (ev) => {
        if (ev.target.closest("[data-more-info],[data-toggle-entity]")) return;
        this._openOverlay("weather", el.getAttribute("data-weather-open"));
      };
    });
    const ovl = q(".ovl");
    if (ovl) {
      ovl.onclick = (ev) => {
        // only a hit on the backdrop itself dismisses; clicks inside the panel
        // bubble up here too and must be ignored
        if (ev.target !== ovl) return;
        this._overlay = null;
        this._touch();
      };
    }
    all(".ovl-head [data-overlay-close]").forEach((el) => {
      el.onclick = (ev) => { ev.stopPropagation(); this._overlay = null; this._touch(); };
    });

    // --- overview cards
    all("[data-row-act]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const id = el.getAttribute("data-row-act");
        const row = el.closest("[data-toggle-entity],[data-more-info]");
        // The icon is deliberately the *other* action: whatever the row does,
        // the icon does the opposite, so details and control are both one tap
        // away without a menu.
        if (row && row.hasAttribute("data-toggle-entity")) {
          this.dispatchEvent(new CustomEvent("hass-more-info", {
            detail: { entityId: id }, bubbles: true, composed: true }));
        } else {
          this._toggleEntity(id);
        }
      };
    });
    // A device row had to become a div so the icon inside it can be its own
    // button — HTML forbids a button inside a button. A div with role="button"
    // brings no keyboard activation of its own, so it is added here; without
    // it the rows stop working for anyone driving the panel from a keyboard.
    const activate = (el, run) => {
      el.onclick = run;
      if (el.getAttribute("role") !== "button") return;
      el.onkeydown = (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        run();
      };
    };
    all("[data-toggle-entity]").forEach((el) => {
      activate(el, () => this._toggleEntity(el.getAttribute("data-toggle-entity")));
    });
    all("[data-more-info]").forEach((el) => {
      activate(el, () => this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: el.getAttribute("data-more-info") }, bubbles: true, composed: true })));
    });
    all("[data-eco-period]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        card.period = el.getAttribute("data-eco-period");
        this._touch();
      };
    });
    // live view: the period tabs must work without entering edit mode
    all("[data-eco-period]").forEach((el) => {
      if (card) return;
      el.onclick = () => {
        const target = el.closest(".item");
        const id = target && target.getAttribute("data-card-id");
        for (const sec of this._sections()) {
          const it = sec.items.find((x) => x.id === id);
          if (it) { it.period = el.getAttribute("data-eco-period"); this._touch(true); return; }
        }
      };
    });
    const ecoDetect = q("[data-eco-detect]");
    if (ecoDetect && card) ecoDetect.onclick = () => this._detectEconomy(card);
    const ecoAdd = q("[data-eco-dev-add]");
    if (ecoAdd && card) ecoAdd.onchange = () => {
      if (!ecoAdd.value) return;
      card.devices = Array.isArray(card.devices) ? card.devices : [];
      if (!card.devices.some((d) => d.entity === ecoAdd.value)) {
        card.devices.push({ entity: ecoAdd.value, name: "", icon: "", kind: "load" });
      }
      this._economy = {};   // the cache key changes with the device list
      this._touch();
    };
    all("[data-eco-dev-remove]").forEach((el) => {
      el.onclick = () => {
        if (!card || !Array.isArray(card.devices)) return;
        card.devices.splice(parseInt(el.getAttribute("data-eco-dev-remove"), 10), 1);
        this._economy = {};
        this._touch();
      };
    });
    all("[data-eco-dev-parent]").forEach((el) => {
      el.onchange = () => {
        if (!card || !Array.isArray(card.devices)) return;
        const d = card.devices[parseInt(el.getAttribute("data-eco-dev-parent"), 10)];
        if (!d) return;
        d.parent = el.value || null;
        // Declared once, honoured everywhere: the flow diagram reads the same
        // map, so the hierarchy no longer has to be entered twice.
        this._setParent(d.entity, d.parent);
        this._touch();
      };
    });
    all("[data-eco-dev-kind]").forEach((el) => {
      el.onclick = () => {
        if (!card || !Array.isArray(card.devices)) return;
        const d = card.devices[parseInt(el.getAttribute("data-eco-dev-kind"), 10)];
        if (!d) return;
        d.kind = d.kind === "source" ? "load" : "source";
        this._touch();
      };
    });
    all("[data-camera-pick]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        const id = el.getAttribute("data-camera-pick");
        const allC = Object.keys(this._hass.states).filter((x) => x.startsWith("camera."));
        const cur = Array.isArray(card.cameras) && card.cameras.length ? card.cameras.slice() : allC;
        const i = cur.indexOf(id);
        if (i >= 0) cur.splice(i, 1); else cur.push(id);
        card.cameras = cur;
        this._touch();
      };
    });
    all("[data-monitor-group]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        const k = el.getAttribute("data-monitor-group");
        const cur = Array.isArray(card.groups) && card.groups.length ? card.groups.slice() : MONITOR_GROUPS.map((g) => g.key);
        const i = cur.indexOf(k);
        if (i >= 0) cur.splice(i, 1); else cur.push(k);
        card.groups = cur;
        this._touch();
      };
    });
    all("[data-limit-preset]").forEach((el) => {
      el.onclick = () => {
        if (!card) return;
        card.limit_w = parseInt(el.getAttribute("data-limit-preset"), 10);
        this._touch();
      };
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

    // --- guided 3D map wizard
    all("[data-mw-start]").forEach((el) => { el.onclick = () => this._startMapWizard(); });
    const mwExit = q("[data-mw-exit]");
    if (mwExit) mwExit.onclick = () => { this._mapWizard = null; this._entityQuery = ""; this._touch(); };
    const mwBack = q("[data-mw-back]");
    if (mwBack) mwBack.onclick = () => {
      this._mapWizard.step = Math.max(0, this._mapWizard.step - 1);
      this._entityQuery = "";
      this._touch();
    };
    const mwNext = q("[data-mw-next]");
    if (mwNext) mwNext.onclick = () => {
      const total = this._mapWizardRooms().length + 2;
      if (this._mapWizard.step >= total - 1) { this._finishMapWizard(); return; }
      this._mapWizard.step += 1;
      this._entityQuery = "";
      this._touch();
    };
    all("[data-mw-room]").forEach((el) => {
      el.onclick = () => {
        const r = this._mapWizard.rooms[parseInt(el.getAttribute("data-mw-room"), 10)];
        if (r) r.on = !r.on;
        this._touch();
      };
    });
    const mwNew = q("[data-mw-newroom]");
    all("[data-mw-level]").forEach((el) => {
      el.onclick = () => {
        const room = this._mapWizardRooms()[this._mapWizard.step - 1];
        if (!room) return;
        room.level = Math.max(-3, Math.min(8, (room.level || 0) + parseInt(el.getAttribute("data-mw-level"), 10)));
        this._touch();
      };
    });
    if (mwNew) mwNew.oninput = () => { this._mapWizard.newRoom = mwNew.value; };
    const mwAdd = q("[data-mw-addroom]");
    if (mwAdd) mwAdd.onclick = () => {
      const name = (this._mapWizard.newRoom || "").trim();
      if (!name) return;
      this._mapWizard.rooms.push({
        area_id: null, title: name, icon: roomIconFor(name), level: 0,
        color: ROOM_COLORS[this._mapWizard.rooms.length % ROOM_COLORS.length],
        on: true, entities: [],
      });
      this._mapWizard.newRoom = "";
      this._touch();
    };
    const mwAuto = q("[data-mw-auto]");
    if (mwAuto) mwAuto.onchange = () => {
      const room = this._mapWizardRooms()[this._mapWizard.step - 1];
      if (!room) return;
      // turning automatic off freezes what the area yields right now, so the
      // user edits a populated list instead of starting from nothing
      room.entities = mwAuto.checked ? null
        : this._roomEntities({ area_id: room.area_id, entities: null }).slice();
      this._touch();
    };
    all("[data-mw-ent]").forEach((el) => {
      el.onclick = () => {
        const room = this._mapWizardRooms()[this._mapWizard.step - 1];
        if (!room) return;
        if (room.entities === null) room.entities = this._roomEntities({ area_id: room.area_id, entities: null }).slice();
        const id = el.getAttribute("data-mw-ent");
        const i = room.entities.indexOf(id);
        if (i >= 0) room.entities.splice(i, 1); else room.entities.push(id);
        this._touch();
      };
    });
    if (this._mapWizard) {
      const ms = q("[data-entity-search]");
      if (ms) ms.oninput = () => { this._entityQuery = ms.value; this._touch(); };
    }

    // --- guided energy wizard
    const wizStart = q("[data-wiz-start]");
    if (wizStart && card) wizStart.onclick = () => {
      this._wizard = { cardId: card.id, step: 0 };
      this._entityQuery = "";
      this._touch();
    };
    const wizExit = q("[data-wiz-exit]");
    if (wizExit) wizExit.onclick = () => { this._wizard = null; this._entityQuery = ""; this._touch(); };
    const wizBack = q("[data-wiz-back]");
    if (wizBack) wizBack.onclick = () => {
      this._wizard.step = Math.max(0, this._wizard.step - 1);
      this._entityQuery = "";
      this._touch();
    };
    const wizNext = q("[data-wiz-next]");
    if (wizNext && card) wizNext.onclick = () => {
      const total = WIZARD_STEPS.length + 2;
      if (this._wizard.step >= total - 1) {
        // Leaving the wizard is the natural moment to persist: the user has
        // just answered every question and expects it to stick.
        this._wizard = null;
        this._save();
        return;
      }
      this._wizard.step += 1;
      this._entityQuery = "";
      this._touch();
    };
    const wizSkip = q("[data-wiz-skip]");
    if (wizSkip && card) wizSkip.onclick = () => {
      const step = WIZARD_STEPS[this._wizard.step];
      if (step) { card.flow = card.flow || {}; card.flow[step.key] = null; }
      this._wizard.step += 1;
      this._entityQuery = "";
      this._touch();
    };
    all("[data-wiz-pick]").forEach((el) => {
      el.onclick = () => {
        const step = WIZARD_STEPS[this._wizard.step];
        card.flow = card.flow || {};
        const id = el.getAttribute("data-wiz-pick");
        // tapping the selected one again clears it, so a mistake is undoable
        card.flow[step.key] = card.flow[step.key] === id ? null : id;
        this._touch();
      };
    });
    all("[data-wiz-load]").forEach((el) => {
      el.onclick = () => {
        const id = el.getAttribute("data-wiz-load");
        card.flow = card.flow || {};
        const devices = card.flow.devices = card.flow.devices || [];
        const i = devices.findIndex((d) => d.entity === id);
        if (i >= 0) {
          devices.splice(i, 1);
          // a removed load can no longer be anyone's parent
          for (const d of devices) if (d.parent === id) d.parent = null;
        } else if (devices.length < 8) {
          const st = this._hass.states[id];
          devices.push({ entity: id, name: (st && st.attributes.friendly_name) || "", icon: "", parent: null });
        }
        this._touch();
      };
    });
    all("[data-wiz-parent]").forEach((el) => {
      el.onchange = () => {
        const i = parseInt(el.getAttribute("data-wiz-parent"), 10);
        const devices = (card.flow && card.flow.devices) || [];
        if (!devices[i]) return;
        devices[i].parent = el.value || null;
        this._setParent(devices[i].entity, devices[i].parent);
        // a cycle would make the "unmeasured" maths meaningless
        const seen = new Set();
        let node = devices[i], guard = 0;
        while (node && node.parent && guard++ < 10) {
          if (seen.has(node.parent)) { devices[i].parent = null; break; }
          seen.add(node.parent);
          node = devices.find((d) => d.entity === node.parent);
          if (node === devices[i]) { devices[i].parent = null; break; }
        }
        this._touch();
      };
    });
    if (this._wizard) {
      const ws = q("[data-entity-search]");
      if (ws) ws.oninput = () => { this._entityQuery = ws.value; this._touch(); };
    }

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
          if (!room) return;
          // Picking a device implies "I want this one here", so a room still on
          // automatic is converted rather than refusing the click: the old
          // behaviour silently did nothing unless you first found and unticked
          // a checkbox, which is exactly the dead end being reported.
          if (!Array.isArray(room.entities)) room.entities = this._roomAllEntities(room).slice();
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
    if (!this._isFloorplan()) return;
    const view = this._page().view;
    const un = (sdx, sdy) => unprojectDelta(sdx, sdy, view.yaw, view.pitch,
      this._focus ? this._focus.zoom : view.zoom);

    // Devices are draggable even outside edit mode's room selection, so
    // positioning a room's contents does not require hunting for the room in
    // the sidebar first.
    if (this._editing) this._bindSpotDrag(un);
    if (!this._editing) return;

    Array.from(this.querySelectorAll(".fp-room.editable")).forEach((el) => {
      el.onpointerdown = (ev) => {
        if (ev.target.closest("[data-fp-badge],[data-resize],[data-vertex],[data-vertex-add],[data-spot],[data-room-focus]")) return;
        const room = this._room(el.getAttribute("data-room"));
        if (!room) return;
        ev.preventDefault();
        el.setPointerCapture(ev.pointerId);
        const start = { x: ev.clientX, y: ev.clientY, rx: room.x, ry: room.y, moved: false };

        el.onpointermove = (mv) => {
          const sdx = mv.clientX - start.x, sdy = mv.clientY - start.y;
          if (!start.moved && Math.hypot(sdx, sdy) < 4) return;
          start.moved = true;
          const d = un(sdx, sdy);
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
          this._roomPicker = false;
          this._entityQuery = "";
          this._touch();
        };
      };
    });

    this._bindResize(un);
    this._bindVertexDrag(un);
    this._bindRotate(un);
  }

  /**
   * Turn a room in the floor plane.
   *
   * The angle is taken from the pointer's position relative to the room's
   * centre *in plan space*, not on screen: the scene is rotated and tilted, so
   * a screen-space angle would make the room turn faster on one side of the
   * view than the other and backwards past 90 degrees of camera yaw. Both
   * points go through the same inverse projection the drag uses, and the
   * difference between them is the rotation.
   */
  _bindRotate(un) {
    Array.from(this.querySelectorAll("[data-rotate]")).forEach((h) => {
      h.onpointerdown = (ev) => {
        const el = h.closest(".fp-room");
        const room = el && this._room(el.getAttribute("data-rotate"));
        if (!room) return;
        ev.preventDefault();
        ev.stopPropagation();
        h.setPointerCapture(ev.pointerId);

        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const start = un(ev.clientX - cx, ev.clientY - cy);
        const a0 = Math.atan2(start.dy, start.dx);
        const r0 = Number(room.rotation) || 0;
        el.classList.add("resizing");

        h.onpointermove = (mv) => {
          const d = un(mv.clientX - cx, mv.clientY - cy);
          if (Math.hypot(d.dx, d.dy) < 8) return;
          let deg = r0 + ((Math.atan2(d.dy, d.dx) - a0) * 180) / Math.PI;
          // 5 degree snap unless shift is held: a plan wants square corners
          // far more often than it wants 37.4 degrees.
          if (!mv.shiftKey) deg = Math.round(deg / 5) * 5;
          room.rotation = ((deg % 360) + 360) % 360;
          el.style.transform = el.style.transform.replace(/ rotateZ\([^)]*\)/, "")
            + (room.rotation ? ` rotateZ(${room.rotation}deg)` : "");
        };

        h.onpointerup = () => {
          h.onpointermove = null; h.onpointerup = null;
          try { h.releasePointerCapture(ev.pointerId); } catch (e) { /* already released */ }
          el.classList.remove("resizing");
          this._touch();
        };
      };
    });
  }

  /**
   * Resize a room by its eight grips.
   *
   * During the gesture only the room box is written; the walls are hidden by
   * the .resizing class instead of being recomputed on every pointermove. The
   * floor and its outline are inset:0 with percentage geometry, so they follow
   * the box for free and any footprint - rectangle or polygon - stays correct
   * without a single recalculation. Everything is rebuilt once, on release.
   */
  _bindResize(un) {
    Array.from(this.querySelectorAll("[data-resize]")).forEach((h) => {
      h.onpointerdown = (ev) => {
        const el = h.closest(".fp-room");
        const room = el && this._room(el.getAttribute("data-room"));
        if (!room) return;
        ev.preventDefault();
        ev.stopPropagation();
        h.setPointerCapture(ev.pointerId);
        const k = h.getAttribute("data-resize");
        const s0 = { x: ev.clientX, y: ev.clientY, rx: room.x, ry: room.y, rw: room.w, rh: room.h };
        el.classList.add("resizing");

        h.onpointermove = (mv) => {
          const raw = un(mv.clientX - s0.x, mv.clientY - s0.y);
          // A rotated room's "west" handle no longer points west on the plan,
          // so the plan-space delta is turned back into the room's own frame
          // before it is split into x/y. Without this, dragging the side of a
          // turned room moves it diagonally.
          const rad = (-(Number(room.rotation) || 0) * Math.PI) / 180;
          const d = { dx: raw.dx * Math.cos(rad) - raw.dy * Math.sin(rad),
                      dy: raw.dx * Math.sin(rad) + raw.dy * Math.cos(rad) };
          const snap = (v) => Math.round(v / 5) * 5;
          let x = s0.rx, y = s0.ry, w = s0.rw, hh = s0.rh;
          if (k.includes("w")) { const nx = snap(s0.rx + d.dx); w = Math.max(40, s0.rx + s0.rw - nx); x = s0.rx + s0.rw - w; }
          if (k.includes("e")) { w = Math.max(40, snap(s0.rw + d.dx)); }
          if (k.includes("n")) { const ny = snap(s0.ry + d.dy); hh = Math.max(40, s0.ry + s0.rh - ny); y = s0.ry + s0.rh - hh; }
          if (k.includes("s")) { hh = Math.max(40, snap(s0.rh + d.dy)); }
          room.x = x; room.y = y; room.w = w; room.h = hh;
          el.style.left = x + "px"; el.style.top = y + "px";
          el.style.width = w + "px"; el.style.height = hh + "px";
        };

        h.onpointerup = () => {
          h.onpointermove = null; h.onpointerup = null;
          try { h.releasePointerCapture(ev.pointerId); } catch (e) { /* already released */ }
          el.classList.remove("resizing");
          this._touch();
        };
      };
    });
  }

  /** Drag one polygon vertex, or split an edge by its midpoint marker. */
  _bindVertexDrag(un) {
    Array.from(this.querySelectorAll("[data-vertex-add]")).forEach((h) => {
      h.onclick = (ev) => {
        ev.stopPropagation();
        const el = h.closest(".fp-room");
        const room = el && this._room(el.getAttribute("data-room"));
        if (!room || !Array.isArray(room.points) || room.points.length >= 24) return;
        const i = parseInt(h.getAttribute("data-vertex-add"), 10);
        const a = room.points[i], b = room.points[(i + 1) % room.points.length];
        room.points.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        this._touch();
      };
    });

    Array.from(this.querySelectorAll("[data-vertex]")).forEach((h) => {
      h.onpointerdown = (ev) => {
        const el = h.closest(".fp-room");
        const room = el && this._room(el.getAttribute("data-room"));
        if (!room || !Array.isArray(room.points)) return;
        ev.preventDefault();
        ev.stopPropagation();
        h.setPointerCapture(ev.pointerId);
        const i = parseInt(h.getAttribute("data-vertex"), 10);
        const p0 = room.points[i].slice();
        const s0 = { x: ev.clientX, y: ev.clientY };
        const floor = el.querySelector(".fp-floor");
        const poly = el.querySelector(".fp-outline polygon");
        el.classList.add("resizing");

        h.onpointermove = (mv) => {
          const d = unrotate(un(mv.clientX - s0.x, mv.clientY - s0.y), room.rotation);
          const fx = Math.min(1, Math.max(0, p0[0] + d.dx / room.w));
          const fy = Math.min(1, Math.max(0, p0[1] + d.dy / room.h));
          room.points[i] = [Math.round(fx * 1000) / 1000, Math.round(fy * 1000) / 1000];
          const pts = roomPoints(room);
          if (floor) floor.style.clipPath = `polygon(${pointsToCss(pts)})`;
          if (poly) poly.setAttribute("points", pointsToSvg(pts));
          h.style.left = (fx * 100) + "%";
          h.style.top = (fy * 100) + "%";
        };

        h.onpointerup = () => {
          h.onpointermove = null; h.onpointerup = null;
          try { h.releasePointerCapture(ev.pointerId); } catch (e) { /* already released */ }
          el.classList.remove("resizing");
          this._touch();
        };
      };
    });
  }

  /**
   * Place a device inside its room.
   *
   * The drop point is rejected if it falls outside the footprint: on an
   * L-shaped room the bounding box contains a notch that is not part of the
   * room, and a lamp floating in that notch would be plainly wrong.
   */
  _bindSpotDrag(un) {
    Array.from(this.querySelectorAll(".fp-spot.movable, .fp-car.movable")).forEach((h) => {
      h.onpointerdown = (ev) => {
        if (ev.target.closest("[data-fp-badge]") && ev.pointerType === "mouse" && ev.button !== 0) return;
        const el = h.closest(".fp-room");
        const room = el && this._room(el.getAttribute("data-room"));
        if (!room) return;
        const id = h.getAttribute("data-spot");
        ev.preventDefault();
        ev.stopPropagation();
        h.setPointerCapture(ev.pointerId);
        const p0 = [parseFloat(h.style.left) / 100, parseFloat(h.style.top) / 100];
        const s0 = { x: ev.clientX, y: ev.clientY, moved: false };

        h.onpointermove = (mv) => {
          const sdx = mv.clientX - s0.x, sdy = mv.clientY - s0.y;
          if (!s0.moved && Math.hypot(sdx, sdy) < 5) return;
          s0.moved = true;
          const d = unrotate(un(sdx, sdy), room.rotation);
          const fx = Math.min(1, Math.max(0, p0[0] + d.dx / room.w));
          const fy = Math.min(1, Math.max(0, p0[1] + d.dy / room.h));
          h.style.left = (fx * 100) + "%";
          h.style.top = (fy * 100) + "%";
          h.dataset.fx = fx; h.dataset.fy = fy;
        };

        h.onpointerup = () => {
          h.onpointermove = null; h.onpointerup = null;
          try { h.releasePointerCapture(ev.pointerId); } catch (e) { /* already released */ }
          if (!s0.moved) { this._badgeTap(id); return; }
          const fx = parseFloat(h.dataset.fx), fy = parseFloat(h.dataset.fy);
          const pts = roomPoints(room);
          if (!pointInPolygon(pts, fx, fy) && room.points) {
            this._error = "Il dispositivo deve restare dentro la stanza";
            this._touch(true);
            return;
          }
          room.spots = room.spots || {};
          room.spots[id] = [Math.round(fx * 1000) / 1000, Math.round(fy * 1000) / 1000];
          this._touch();
        };
      };
    });
  }

  /**
   * Tapping a device on the 3D map.
   *
   * This used to switch the device unconditionally: there was NO way to
   * inspect something from the map without operating it. Tapping "luci scale"
   * to see what it was turned it off. The same defect was already fixed on the
   * card rows in 0.21.0 and survived here, because the map has its own tap
   * path that never went through `row_action`.
   *
   * Now the page decides (``view.tap_action``), and a LONG PRESS always does
   * the other thing. Long press rather than a second button because a map pin
   * is a 38 px circle floating over a wall: there is no room for a companion
   * control, and adding one would make the map unreadable at the exact zoom
   * levels where it is most useful.
   */
  _badgeTap(entityId, other) {
    const st = this._hass.states[entityId];
    if (!st) return;
    const kind = this._badgeKind(entityId);
    const domain = domainOf(entityId);
    const wantToggle = ((this._page().view || {}).tap_action || "toggle") === "toggle";
    const doToggle = other ? !wantToggle : wantToggle;
    // canToggle as well as the badge kind: the kind table says what a domain
    // usually is, canToggle says what THIS entity can actually do. A camera
    // that does not declare ON_OFF must open its details even if some future
    // entry in the table calls cameras toggleable.
    if (doToggle && canToggle(entityId, st)
        && (kind === "toggle" || (kind === "binary" && domain === "lock"))) {
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
    const entry = actionsFor(card.entity_id).find((a) => a.k === action);
    if (!entry || !entry.s) {
      // an action saved before this table existed may not apply to this domain
      // (a cover with "turn_on"); opening the details beats calling a service
      // that does not exist and failing silently
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: card.entity_id }, bubbles: true, composed: true,
      }));
      return;
    }
    this._hass.callService(domain, entry.s, { entity_id: card.entity_id });
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

.dash-section{--accent:#00e5ff;position:relative}
.dash-section.dragging{opacity:.4}
/* Insertion marker on the section stack. Pseudo-element for the same reason as
   the tabs: a real node would push the target away from the pointer. */
.dash-section.drop-above::before,.dash-section.drop-below::after{content:"";position:absolute;left:0;right:0;height:3px;border-radius:3px;background:var(--accent);box-shadow:0 0 10px var(--accent)}
.dash-section.drop-above::before{top:-9px}
.dash-section.drop-below::after{bottom:-9px}
.sec-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.sec-head.draggable{cursor:grab}
.sec-head.draggable:active{cursor:grabbing}
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
.hint strong{opacity:1;color:var(--accent);font-weight:700}
.type-hint{margin-top:6px;padding:8px 10px;border-radius:9px;background:color-mix(in srgb,var(--accent) 7%,transparent);opacity:.75}
.editor optgroup{font:700 10px ui-monospace,monospace;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent);background:#02050a}
.editor optgroup option{font:inherit;font-size:13px;letter-spacing:0;text-transform:none;color:var(--primary-text-color)}
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

.act{margin-top:12px;display:flex;flex-direction:column;gap:11px}
.act-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.act-count{display:flex;align-items:baseline;gap:6px}
.act-count strong{font-size:28px;font-weight:750;color:var(--accent);line-height:1}
.act-count span{font:10px ui-monospace,monospace;letter-spacing:2px;opacity:.5;text-transform:uppercase}
.act-chips{display:flex;gap:5px;flex-wrap:wrap}
.act-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:99px;font-size:11px;font-weight:700;
  color:var(--gc);background:color-mix(in srgb,var(--gc) 14%,transparent);border:1px solid color-mix(in srgb,var(--gc) 32%,transparent)}
.act-chip ha-icon{--mdc-icon-size:13px}
.act-group{display:flex;flex-direction:column;gap:3px}
.act-group>header{display:flex;align-items:center;gap:7px;padding:0 2px 4px}
.act-group>header ha-icon{--mdc-icon-size:15px;color:var(--gc)}
.act-group>header strong{flex:1;font:10px ui-monospace,monospace;letter-spacing:1.4px;text-transform:uppercase;opacity:.72}
.act-group>header em{font-style:normal;font-size:11px;font-weight:750;color:var(--gc)}
.act-off{padding:3px 5px;border-radius:7px;background:transparent;border:1px solid color-mix(in srgb,var(--gc) 30%,transparent);color:var(--gc);opacity:.6}
.act-off:hover{opacity:1;background:color-mix(in srgb,var(--gc) 16%,transparent)}
.act-off ha-icon{--mdc-icon-size:13px;display:block}
.act-icon{display:grid;place-items:center;width:28px;height:28px;flex-shrink:0;padding:0;border-radius:8px;background:transparent;border:1px solid transparent;color:inherit}
.act-icon:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.18)}
.act-icon ha-icon{--mdc-icon-size:17px;display:block}
.act-row.info,.rc-row.info{cursor:help}
.act-row{display:flex;align-items:center;gap:9px;width:100%;padding:7px 9px;border-radius:9px;cursor:pointer;
  background:color-mix(in srgb,var(--gc,var(--accent)) 7%,transparent);border:1px solid transparent;
  color:var(--primary-text-color);text-align:left;letter-spacing:0}
.act-row:hover{border-color:color-mix(in srgb,var(--gc,var(--accent)) 42%,transparent);background:color-mix(in srgb,var(--gc,var(--accent)) 14%,transparent)}
.act-row .act-icon{color:var(--gc,var(--accent))}
.act-txt{flex:1;min-width:0}
.act-txt strong{display:block;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.act-txt small{display:block;margin-top:1px;font-size:10px;opacity:.55;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.act-since{flex-shrink:0;font:9.5px ui-monospace,monospace;letter-spacing:.5px;opacity:.42;white-space:nowrap}
.act-row.alert{background:color-mix(in srgb,#ff3d71 18%,transparent);border-color:color-mix(in srgb,#ff3d71 45%,transparent);animation:cyPulse 1.4s ease-in-out infinite}
@keyframes cyPulse{0%,100%{opacity:1}50%{opacity:.6}}
.act-more{font:10px ui-monospace,monospace;letter-spacing:1px;opacity:.4;padding-left:4px}

/* Controllo temperatura */
.th{margin-top:12px}
/* The automation bypass is a MODE of the house, not a device: it gets the top
   of the card and a full sentence, never a nameless toggle in a list. */
.th-manual{display:flex;flex-direction:column;gap:6px;margin-bottom:11px;padding:9px;border-radius:12px;
  border:1px dashed rgba(255,255,255,.12)}
.th-manual.on{border-style:solid;border-color:rgba(255,146,76,.5);background:rgba(255,146,76,.1)}
.th-man-row{display:flex;align-items:center;gap:9px;width:100%;padding:7px 8px;border-radius:9px;
  border:1px solid transparent;background:transparent;color:var(--primary-text-color);text-align:left}
.th-man-row>ha-icon{--mdc-icon-size:18px;color:#8ea3b8;flex-shrink:0}
.th-man-row.on>ha-icon{color:#ff924c}
.th-man-row span{flex:1;min-width:0}
.th-man-row strong{display:block;font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.th-man-row small{display:block;margin-top:2px;font:9px ui-monospace,monospace;letter-spacing:.7px;text-transform:uppercase;opacity:.5}
.th-man-row.on small{color:#ffb37a;opacity:.9}
.th-sw{width:32px;height:18px;border-radius:9px;background:rgba(255,255,255,.12);position:relative;flex-shrink:0;transition:background .18s}
.th-sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .18s}
.th-sw.on{background:#ff924c}
.th-sw.on::after{transform:translateX(14px)}
.th-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}
.th-grid.one{grid-template-columns:1fr}
.th-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
/* The suspension row spans the full width wherever it lands, so moving it
   between two units does not leave a half-width orphan. */
.th-block.manual{grid-column:1/-1}
.th-block.manual .th-manual{margin-bottom:0}
.th-unit{padding:12px;border-radius:14px;border:1px solid var(--divider-color);background:rgba(255,255,255,.02)}
.th-unit.on{border-color:color-mix(in srgb,var(--th) 42%,transparent);background:color-mix(in srgb,var(--th) 8%,transparent)}
.th-head{display:flex;align-items:center;gap:9px}
.th-head>ha-icon{--mdc-icon-size:21px;color:var(--th,#8ea3b8);flex-shrink:0}
.th-name{flex:1;min-width:0}
.th-name strong{display:block;font-size:12.5px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.th-name small{display:block;margin-top:2px;font:9px ui-monospace,monospace;letter-spacing:.8px;text-transform:uppercase;opacity:.5}
.th-power{width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;
  border-radius:9px;border:1px solid var(--divider-color);background:transparent;color:#8ea3b8}
.th-power ha-icon{--mdc-icon-size:17px}
.th-power.on{color:var(--th);border-color:color-mix(in srgb,var(--th) 55%,transparent);background:color-mix(in srgb,var(--th) 14%,transparent)}
.th-set{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:11px}
.th-step{width:38px;height:38px;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;
  border-radius:11px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color)}
.th-step ha-icon{--mdc-icon-size:19px}
.th-step:hover:not(:disabled){border-color:var(--th);color:var(--th)}
.th-step:disabled{opacity:.25}
.th-val{text-align:center;line-height:1}
.th-val strong{font-size:31px;font-weight:750;letter-spacing:-1px}
.th-val i{font-style:normal;font-size:14px;opacity:.5;margin-left:1px}
.th-val small{display:block;margin-top:4px;font:8.5px ui-monospace,monospace;letter-spacing:1px;text-transform:uppercase;opacity:.4}
.th-range{width:100%;margin-top:8px;accent-color:var(--th)}
.th-modes{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}
.th-mode{display:flex;align-items:center;gap:5px;padding:6px 9px;border-radius:9px;font-size:10px;
  border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);opacity:.6}
.th-mode ha-icon{--mdc-icon-size:14px}
.th-mode:hover{opacity:1}
.th-mode.on{opacity:1;color:var(--tm);border-color:color-mix(in srgb,var(--tm) 55%,transparent);background:color-mix(in srgb,var(--tm) 13%,transparent)}
.th-extras{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:7px;margin-top:10px}
.th-pick{font:8.5px ui-monospace,monospace;letter-spacing:1px;text-transform:uppercase;opacity:.75}
.th-pick select{width:100%;margin-top:3px;font-size:11px;text-transform:none;letter-spacing:0}
.th-na{margin-top:9px;font-size:11px;opacity:.45}
.th-noset{margin-top:10px;padding:8px 10px;border-radius:9px;font-size:10.5px;opacity:.5;
  border:1px dashed var(--divider-color)}
/* Suggestions look like an offer, not like a setting that is already on. */
.th-hints{margin-top:8px;padding:9px;border-radius:11px;border:1px dashed rgba(255,255,255,.12)}
.th-hint{display:flex;align-items:center;gap:8px;width:100%;margin-top:6px;padding:7px 9px;border-radius:9px;
  border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);text-align:left}
.th-hint ha-icon{--mdc-icon-size:15px;opacity:.6;flex-shrink:0}
.th-hint span{min-width:0;flex:1}
.th-hint strong{display:block;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.th-hint small{display:block;font:9px ui-monospace,monospace;opacity:.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.th-hint:hover{border-color:var(--accent);color:var(--accent)}

/* Centrale di allarme */
.al-head{display:flex;align-items:center;gap:11px;margin-top:12px;padding:11px 12px;border-radius:13px;
  background:color-mix(in srgb,var(--al) 11%,transparent);border:1px solid color-mix(in srgb,var(--al) 34%,transparent)}
.al-head>ha-icon{--mdc-icon-size:26px;color:var(--al);flex-shrink:0}
.al-txt{min-width:0}
.al-txt strong{display:block;font-size:15px;font-weight:700;letter-spacing:.3px;color:var(--al)}
.al-txt small{display:block;margin-top:2px;font:9.5px ui-monospace,monospace;letter-spacing:.9px;text-transform:uppercase;opacity:.5}
/* A countdown and a live alarm must be impossible to mistake for a steady
   state, so they are the only two things on the card that move. */
.al-head.moving{animation:al-breathe 1.6s ease-in-out infinite}
.al-head.fire{animation:al-flash .9s steps(1,end) infinite}
@keyframes al-breathe{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes al-flash{0%,100%{background:color-mix(in srgb,var(--al) 11%,transparent)}
  50%{background:color-mix(in srgb,var(--al) 34%,transparent)}}
.al-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px}
.al-btn{display:flex;align-items:center;gap:9px;padding:11px 12px;border-radius:12px;text-align:left;
  border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color)}
.al-btn ha-icon{--mdc-icon-size:20px;flex-shrink:0;opacity:.75}
.al-btn strong{display:block;font-size:12px;font-weight:650}
.al-btn small{display:block;margin-top:2px;font:9px ui-monospace,monospace;letter-spacing:.6px;text-transform:uppercase;opacity:.45}
.al-btn:hover:not(:disabled){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 9%,transparent)}
.al-btn.primary{border-color:color-mix(in srgb,#06d6a0 55%,transparent);background:color-mix(in srgb,#06d6a0 12%,transparent)}
.al-btn.primary ha-icon{color:#06d6a0;opacity:1}
/* The mode already in force is shown, not offered: disabled and marked, so the
   card answers "what is it doing" and "what can I do" at the same time. */
.al-btn.current{border-color:color-mix(in srgb,#4cc9f0 55%,transparent);background:color-mix(in srgb,#4cc9f0 12%,transparent);opacity:1}
.al-btn.current ha-icon{color:#4cc9f0;opacity:1}
.al-btn:disabled{cursor:default}
.al-btn.off:disabled{opacity:.35}
.al-code{display:block;margin-top:10px}
.al-code input{width:100%;letter-spacing:5px;font:16px ui-monospace,monospace;text-align:center}
.al-panic{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;margin-top:9px;padding:9px;
  border-radius:11px;font:9.5px ui-monospace,monospace;letter-spacing:1.1px;
  border:1px dashed rgba(255,61,113,.45);background:transparent;color:#ff8091}
.al-panic ha-icon{--mdc-icon-size:15px}
.al-panic.holding{background:rgba(255,61,113,.22);border-style:solid;color:#fff}
.al-note{margin-top:10px;font-size:11px;opacity:.55}
.al-by{display:block;margin-top:8px;font:9px ui-monospace,monospace;letter-spacing:.7px;opacity:.35;text-transform:uppercase}

.notif{margin-top:12px;display:flex;flex-direction:column;gap:6px}
.notif-row{display:flex;gap:9px;padding:9px 10px;border-radius:10px;
  background:color-mix(in srgb,var(--nc,#ffd166) 9%,transparent);border:1px solid color-mix(in srgb,var(--nc,#ffd166) 24%,transparent)}
.notif-row>ha-icon{--mdc-icon-size:17px;color:var(--nc,#ffd166);flex-shrink:0}
.notif-txt{min-width:0;flex:1}
.notif-txt strong{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.notif-txt small{display:block;margin-top:2px;font-size:10.5px;opacity:.62;line-height:1.45}
.notif-txt em{display:block;margin-top:3px;font:9px ui-monospace,monospace;font-style:normal;letter-spacing:.9px;text-transform:uppercase;opacity:.38}
.notif-when{flex-shrink:0;font:9.5px ui-monospace,monospace;letter-spacing:.4px;opacity:.4;white-space:nowrap}
/* An inbound message is somebody talking to the house, not the house talking
   to somebody: dashed border so the direction reads at a glance. */
.notif-row.in{border-style:dashed;background:transparent}
.notif-row.upd{--nc:#8ecae6}
/* Read alerts stay in the list but stop competing for attention: fading is
   enough, hiding them would make "where did it go" the next question. */
.notif-row.read{opacity:.5;background:transparent}
.notif-row.read:hover{opacity:.8}
.notif-row.unread{box-shadow:inset 2px 0 0 var(--nc,#ffd166)}
.notif-row [data-notif-read]{cursor:pointer}
.notif-dot{display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:var(--nc,#ffd166);vertical-align:middle;box-shadow:0 0 7px var(--nc,#ffd166)}
.notif-x{flex-shrink:0;align-self:flex-start;width:22px;height:22px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--primary-text-color);opacity:.35}
.notif-x ha-icon{--mdc-icon-size:14px}
.notif-x:hover{opacity:1;color:#ff6b6b;border-color:color-mix(in srgb,#ff6b6b 45%,transparent)}
.notif-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;justify-content:space-between;margin-bottom:2px}
.notif-acts{display:flex;gap:6px;flex-wrap:wrap}
.notif-acts .mini{font-size:9.5px}

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

.item.tappable{cursor:pointer}
.item.tappable:hover{border-color:color-mix(in srgb,var(--accent) 55%,transparent)}
.cams{margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:8px}
.cam{position:relative;padding:0;border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);border-radius:12px;overflow:hidden;background:#05090f;aspect-ratio:16/9;cursor:pointer;letter-spacing:0}
.cam:hover{border-color:var(--accent)}
.cam:disabled{cursor:default;opacity:.5}
.cam-img{width:100%;height:100%;object-fit:cover;display:block}
.cam-off{width:100%;height:100%;display:grid;place-items:center}
.cam-off ha-icon{--mdc-icon-size:26px;opacity:.35}
.cam-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:6px;padding:7px 9px;background:linear-gradient(0deg,rgba(3,7,12,.92),transparent)}
.cam-bar ha-icon{--mdc-icon-size:13px;color:var(--accent);flex-shrink:0}
.cam-bar em{flex:1;min-width:0;font-style:normal;font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.cam-dot{width:7px;height:7px;border-radius:50%;background:#06d6a0;box-shadow:0 0 8px #06d6a0;flex-shrink:0;animation:camPulse 2s ease-in-out infinite}
.cam-dot.off{background:#8d99ae;box-shadow:none;animation:none}
@keyframes camPulse{0%,100%{opacity:1}50%{opacity:.35}}

.ovl{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,12,.72);backdrop-filter:blur(4px);animation:ovlIn .18s ease}
@keyframes ovlIn{from{opacity:0}to{opacity:1}}
.ovl-panel{width:min(720px,100%);max-height:88vh;overflow-y:auto;overscroll-behavior:contain;border-radius:20px;background:linear-gradient(168deg,color-mix(in srgb,var(--accent) 7%,var(--card-background-color)),var(--card-background-color));border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);box-shadow:0 30px 80px rgba(0,0,0,.6)}
.ovl-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:15px 17px;background:inherit;border-bottom:1px solid color-mix(in srgb,var(--accent) 16%,transparent)}
.ovl-head ha-icon{--mdc-icon-size:20px;color:var(--accent)}
.ovl-head strong{flex:1;min-width:0;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ovl-body{padding:16px 17px 20px}
.cam-live img{width:100%;border-radius:13px;display:block;background:#05090f}
.cam-live-meta{display:flex;align-items:center;gap:12px;margin-top:11px;font:10px ui-monospace,monospace;letter-spacing:1.4px;text-transform:uppercase;opacity:.6}
.cam-live-meta span{display:inline-flex;align-items:center;gap:6px}
.cam-live-meta button{margin-left:auto;text-transform:none;letter-spacing:.04em}
.wxd-now{display:flex;align-items:center;gap:16px;margin-bottom:6px}
.wxd-icon{--mdc-icon-size:58px;color:var(--accent);filter:drop-shadow(0 0 16px color-mix(in srgb,var(--accent) 50%,transparent))}
.wxd-temp{font:750 44px Inter,system-ui,sans-serif;letter-spacing:-.04em;line-height:1;color:var(--accent)}
.wxd-temp span{font-size:18px;font-weight:600;opacity:.5;margin-left:3px}
.wxd-cond{margin-top:5px;font-size:13px;opacity:.65}
.wxd-block{margin-top:18px;padding-top:14px;border-top:1px solid color-mix(in srgb,var(--accent) 15%,transparent)}
.wxd-block h4{margin:0 0 10px;font:700 10px ui-monospace,monospace;letter-spacing:2px;text-transform:uppercase;color:var(--accent);opacity:.75}
.wxd-spark{margin-bottom:6px}
.wxd-spark .spark{height:60px}
.wxd-hours{display:flex;gap:5px;overflow-x:auto;padding-bottom:4px}
.wxd-hour{flex:0 0 auto;width:56px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 3px;border-radius:11px;background:color-mix(in srgb,var(--accent) 7%,transparent)}
.wxd-hour span{font:9px ui-monospace,monospace;opacity:.5}
.wxd-hour ha-icon{--mdc-icon-size:19px;color:var(--accent);opacity:.85}
.wxd-hour strong{font-size:13px;font-weight:750}
.wxd-hour em{font-style:normal;font:9px ui-monospace,monospace;color:#8ecae6;opacity:.8}
.wxd-days{display:flex;flex-direction:column;gap:4px}
.wxd-day{display:grid;grid-template-columns:46px 30px 1fr 44px auto;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--accent) 6%,transparent)}
.wxd-day span{font:10px ui-monospace,monospace;letter-spacing:1px;opacity:.55;text-transform:uppercase}
.wxd-day ha-icon{--mdc-icon-size:18px;color:var(--accent);opacity:.85}
.wxd-day b{font-size:14px;font-weight:750}
.wxd-day i{font-style:normal;font-size:12px;opacity:.45;text-align:right}
.wxd-day em{font-style:normal;font:9px ui-monospace,monospace;color:#8ecae6;opacity:.75}
.wxd-facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:5px}
.wxd-fact{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:10px;background:color-mix(in srgb,var(--accent) 6%,transparent)}
.wxd-fact ha-icon{--mdc-icon-size:16px;color:var(--accent);opacity:.8;flex-shrink:0}
.wxd-fact span{flex:1;min-width:0;font-size:11px;opacity:.6}
.wxd-fact strong{font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums}
.eco{margin-top:12px;display:flex;flex-direction:column;gap:12px}
.eco-tabs{display:flex;gap:4px}
.eco-tab{flex:1;padding:7px 4px;border-radius:9px;font-size:10.5px;font-weight:700;letter-spacing:.04em;background:transparent;border:1px solid var(--divider-color);color:var(--primary-text-color);opacity:.5}
.eco-tab.on{opacity:1;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 50%,transparent);background:color-mix(in srgb,var(--accent) 12%,transparent)}
.eco-hero{text-align:center;padding:6px 0 2px}
.eco-hero>span{display:block;font:10px ui-monospace,monospace;letter-spacing:2px;opacity:.45}
.eco-hero>strong{display:block;margin-top:4px;font:750 40px Inter,system-ui,sans-serif;letter-spacing:-.04em;line-height:1;color:#ffd166}
.eco-hero.credit>strong{color:#06d6a0}
.eco-hero>strong i{font-style:normal;font-size:18px;font-weight:600;opacity:.55;margin-left:4px}
.eco-hero>em{display:block;margin-top:6px;font-style:normal;font-size:11px;opacity:.5}
.eco-saved{display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:12px;background:rgba(6,214,160,.1);border:1px solid rgba(6,214,160,.28)}
.eco-saved ha-icon{--mdc-icon-size:22px;color:#06d6a0;flex-shrink:0}
.eco-saved strong{display:block;font:750 19px Inter,system-ui,sans-serif;color:#06d6a0;line-height:1}
.eco-saved span{display:block;margin-top:2px;font-size:11px;opacity:.6}
.eco-rows{display:flex;flex-direction:column;gap:6px}
.eco-row{display:grid;grid-template-columns:130px 1fr 74px 66px;align-items:center;gap:9px}
.eco-k{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;opacity:.75}
.eco-k ha-icon{--mdc-icon-size:15px;flex-shrink:0}
.eco-bar{height:7px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}
.eco-bar i{display:block;height:100%;border-radius:99px;transition:width .4s ease}
.eco-row.cost .eco-bar i,.eco-row.cost .eco-k ha-icon{background:#ff8fa3;color:#ff8fa3}
.eco-row.self .eco-bar i,.eco-row.self .eco-k ha-icon{background:#06d6a0;color:#06d6a0}
.eco-row.rev .eco-bar i,.eco-row.rev .eco-k ha-icon{background:#ffd166;color:#ffd166}
.eco-kwh{font:11px ui-monospace,monospace;opacity:.5;text-align:right}
.eco-eur{font:750 13px Inter,system-ui,sans-serif;text-align:right;font-variant-numeric:tabular-nums}
.eco-row.cost .eco-eur{color:#ff8fa3}
.eco-row.self .eco-eur,.eco-row.rev .eco-eur{color:#06d6a0}
/* ---------------------------------------------------------------- luci -- */
.li{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.li-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.li-count{display:flex;align-items:baseline;gap:6px}
.li-count strong{font-size:28px;font-weight:750;color:#ffd166;line-height:1}
.li-count span{font:10px ui-monospace,monospace;letter-spacing:1.6px;opacity:.5;text-transform:uppercase}
.li-actions{margin-left:auto;display:flex;gap:6px}
.li-all{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:9px;font-size:10px;letter-spacing:.1em;
  background:color-mix(in srgb,#ffd166 12%,transparent);border:1px solid color-mix(in srgb,#ffd166 30%,transparent);color:#ffd166}
.li-all ha-icon{--mdc-icon-size:14px}
.li-group{display:flex;flex-direction:column;gap:4px}
.li-group>header{display:flex;align-items:center;gap:7px;padding:6px 2px 3px}
.li-group>header ha-icon{--mdc-icon-size:14px;opacity:.5}
.li-group>header strong{flex:1;font:10px ui-monospace,monospace;letter-spacing:1.4px;text-transform:uppercase;opacity:.7}
.li-group>header em{font-style:normal;font:10px ui-monospace,monospace;opacity:.45}
.li-group>header .act-off{--gc:#ffd166}
.li-item{border-radius:11px;border:1px solid transparent;background:rgba(255,255,255,.03);transition:background .2s,border-color .2s}
.li-item.on{background:color-mix(in srgb,var(--lc,#ffd166) 11%,transparent);border-color:color-mix(in srgb,var(--lc,#ffd166) 30%,transparent)}
.li-item.open{border-color:color-mix(in srgb,var(--lc,#ffd166) 45%,transparent)}
.li-row{display:flex;align-items:center;gap:9px;padding:7px 9px}
.li-bulb{display:grid;place-items:center;width:34px;height:34px;flex-shrink:0;border-radius:50%;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#93a3b5;transition:all .2s}
.li-item.on .li-bulb{background:var(--lc,#ffd166);border-color:var(--lc,#ffd166);color:#0a1017;
  box-shadow:0 0 18px color-mix(in srgb,var(--lc,#ffd166) 55%,transparent)}
.li-bulb ha-icon{--mdc-icon-size:19px}
.li-name{flex:1;min-width:0;text-align:left;background:none;border:0;color:var(--primary-text-color);padding:0}
.li-name strong{display:block;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.li-name small{display:block;font:9.5px ui-monospace,monospace;letter-spacing:.5px;opacity:.5;text-transform:uppercase}
.li-dim{width:110px;flex-shrink:0}
.li-more{padding:6px;border-radius:8px;background:transparent;border:1px solid rgba(255,255,255,.12);color:#93a3b5;flex-shrink:0}
.li-more.on{color:var(--lc,#ffd166);border-color:color-mix(in srgb,var(--lc,#ffd166) 45%,transparent)}
.li-more ha-icon{--mdc-icon-size:15px;display:block}
.li-panel{display:flex;flex-direction:column;gap:11px;padding:4px 11px 12px;animation:cySheet .2s ease}
.li-block{display:flex;flex-direction:column;gap:6px}
.li-lbl{font:9px ui-monospace,monospace;letter-spacing:1.5px;opacity:.42}
.li-swatches{display:flex;flex-wrap:wrap;gap:6px}
.li-sw{width:26px;height:26px;padding:0;border-radius:50%;background:var(--sw);border:2px solid rgba(255,255,255,.16);cursor:pointer}
.li-sw:hover{transform:scale(1.15);border-color:#fff}
.li-sw.custom{display:grid;place-items:center;overflow:hidden;background:conic-gradient(#ff595e,#ffca3a,#8ac926,#00e5ff,#4361ee,#c77dff,#ff595e)}
.li-sw.custom input{opacity:0;width:100%;height:100%;cursor:pointer;border:0;padding:0}
.li-kelvin{width:100%}
.li-kelvin::-webkit-slider-runnable-track{background:var(--kg);height:8px;border-radius:99px}
.li-kelvin::-moz-range-track{background:var(--kg);height:8px;border-radius:99px}
.li-presets{display:flex;flex-wrap:wrap;gap:5px}
.li-preset{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:99px;font-size:10px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:var(--primary-text-color)}
.li-preset::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--sw)}
.li-preset:hover{border-color:var(--sw)}

/* --------------------------------------------------------- irrigazione -- */
.irr{margin-top:12px;display:flex;flex-direction:column;gap:8px}
.irr-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.irr-rain{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:99px;font-size:10.5px;
  background:color-mix(in srgb,#8ecae6 10%,transparent);border:1px solid color-mix(in srgb,#8ecae6 26%,transparent);color:#8ecae6}
.irr-rain.wet{background:color-mix(in srgb,#4361ee 18%,transparent);border-color:#4361ee;color:#a8c0ff}
.irr-rain ha-icon{--mdc-icon-size:15px}
.irr-stop{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:9px;font-size:10px;letter-spacing:.1em;
  background:color-mix(in srgb,#ff3d71 15%,transparent);border:1px solid color-mix(in srgb,#ff3d71 45%,transparent);color:#ff8fab}
.irr-stop ha-icon{--mdc-icon-size:14px}
.irr-zone{border-radius:11px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);padding:4px 4px 6px}
.irr-zone.running{border-color:color-mix(in srgb,#06d6a0 45%,transparent);background:color-mix(in srgb,#06d6a0 10%,transparent)}
.irr-zone.missing{display:flex;align-items:center;gap:9px;padding:9px;opacity:.5}
.irr-row{display:flex;align-items:center;gap:9px;padding:5px 7px}
.irr-icon{display:grid;place-items:center;width:34px;height:34px;flex-shrink:0;border-radius:10px;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#8ecae6}
.irr-zone.running .irr-icon{background:#06d6a0;border-color:#06d6a0;color:#04231a;box-shadow:0 0 18px rgba(6,214,160,.5)}
.irr-icon ha-icon{--mdc-icon-size:19px}
.irr-txt{flex:1;min-width:0}
.irr-txt strong{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.irr-txt small{display:block;font:9.5px ui-monospace,monospace;letter-spacing:.5px;opacity:.55;text-transform:uppercase}
.irr-runs{display:flex;gap:4px;flex-shrink:0}
.irr-run{padding:5px 8px;border-radius:8px;font:10.5px ui-monospace,monospace;font-weight:700;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:var(--primary-text-color)}
.irr-run.main{color:#06d6a0;border-color:color-mix(in srgb,#06d6a0 45%,transparent);background:color-mix(in srgb,#06d6a0 12%,transparent)}
.irr-run:hover{border-color:#06d6a0}
.irr-zone .irr-stop{margin-left:0}
.irr-moist{height:4px;margin:0 9px 4px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden}
.irr-moist i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#c9a227,#06d6a0,#4361ee)}
.zone-min{width:56px;flex-shrink:0;text-align:center}
.zone-moist{display:block;margin:-2px 0 6px;font:9px ui-monospace,monospace;letter-spacing:1.2px;opacity:.45}

/* ------------------------------------------------------------- orari --- */
.sched-list{display:flex;flex-direction:column;gap:4px;margin:2px 0}
.sched-row{display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.035)}
.sched-row.off{opacity:.42}
.sched-row>ha-icon{--mdc-icon-size:14px;color:var(--accent);flex-shrink:0}
.sched-time{width:74px;padding:3px 5px;font:11px ui-monospace,monospace}
.sched-act{width:auto;padding:3px 5px;font-size:10.5px}
.sched-row em{display:flex;gap:2px;margin-left:auto;font-style:normal}
.sched-row em button{width:17px;height:17px;padding:0;border-radius:4px;font:8.5px ui-monospace,monospace;font-weight:700;
  background:rgba(255,255,255,.05);border:1px solid transparent;color:#6f7f92}
.sched-row em button.on{background:color-mix(in srgb,var(--accent) 24%,transparent);color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,transparent)}
.eco-devices{display:flex;flex-direction:column;gap:3px;padding-top:10px;margin-top:2px;border-top:1px solid color-mix(in srgb,var(--accent) 14%,transparent)}
.eco-devices.empty{flex-direction:row;align-items:center;gap:9px;font-size:11px;opacity:.5;line-height:1.45}
.eco-devices.empty ha-icon{--mdc-icon-size:19px;flex-shrink:0}
.eco-dev-head{display:flex;align-items:baseline;gap:7px;padding:8px 2px 5px}
.eco-dev-head ha-icon{--mdc-icon-size:14px;color:#ffd166;align-self:center}
.eco-dev-head strong{flex:1;font:9.5px ui-monospace,monospace;letter-spacing:1.5px;opacity:.55}
.eco-dev-head em{font-style:normal;font:10px ui-monospace,monospace;opacity:.45}
.eco-dev-head.src ha-icon{color:#06d6a0}
.eco-dev{display:grid;grid-template-columns:18px minmax(0,1fr) 1.1fr 62px 60px 34px;align-items:center;gap:8px;
  width:100%;padding:6px 8px;border-radius:8px;background:transparent;border:1px solid transparent;color:var(--primary-text-color);text-align:left}
.eco-dev:hover{background:color-mix(in srgb,var(--accent) 8%,transparent);border-color:color-mix(in srgb,var(--accent) 22%,transparent)}
.eco-dev>ha-icon{--mdc-icon-size:16px;color:#ffd166;opacity:.85}
.eco-dev.src>ha-icon{color:#06d6a0}
.eco-dev.unmeasured{opacity:.5}
.eco-dev.unmeasured>ha-icon{color:#8d99ae}
.ed-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px}
.ed-bar{height:6px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden}
.ed-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#ffd166,#ff9f43)}
.eco-dev.src .ed-bar i{background:linear-gradient(90deg,#06d6a0,#00e5ff)}
.eco-dev.unmeasured .ed-bar i{background:#4a5568}
.ed-kwh{font:10.5px ui-monospace,monospace;opacity:.6;text-align:right}
.ed-eur{font:11px ui-monospace,monospace;font-weight:700;text-align:right}
.eco-dev.src .ed-eur{color:#06d6a0}
.ed-pct{font:9.5px ui-monospace,monospace;opacity:.38;text-align:right}
.eco-dev.child{padding-left:calc(8px + var(--depth,1) * 18px);position:relative}
.eco-dev.child::before{content:"";position:absolute;left:calc(var(--depth,1) * 18px - 6px);top:0;bottom:50%;width:8px;
  border-left:1px solid rgba(255,255,255,.14);border-bottom:1px solid rgba(255,255,255,.14);border-bottom-left-radius:5px}
.eco-dev.child .ed-name{opacity:.82;font-size:11px}
.ed-own{display:block;font:9px ui-monospace,monospace;font-style:normal;opacity:.42;letter-spacing:.4px}
@media(max-width:640px){
  .eco-dev{grid-template-columns:18px minmax(0,1fr) 56px 56px}
  .eco-dev .ed-bar,.eco-dev .ed-pct{display:none}
}
.eco-dev-list{display:flex;flex-direction:column;gap:4px;margin-top:8px}
.eco-dev-edit{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:9px;
  background:color-mix(in srgb,var(--accent) 6%,transparent);border:1px solid color-mix(in srgb,var(--accent) 16%,transparent)}
.cf-edit-row{padding:10px;margin-bottom:8px;border-radius:12px;border:1px solid var(--divider-color);background:color-mix(in srgb,var(--card-background-color) 70%,transparent)}
.cf-edit-tools{display:flex;gap:6px;justify-content:flex-end;margin-top:8px}
.eco-dev-edit>ha-icon{--mdc-icon-size:16px;color:var(--accent);flex-shrink:0}
.ede-txt{flex:1;min-width:0}
.ede-txt strong{display:block;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ede-txt small{display:block;font:9px ui-monospace,monospace;opacity:.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.eco-dev-edit .mini.on{color:#06d6a0;border-color:color-mix(in srgb,#06d6a0 45%,transparent)}
.eco-foot{display:flex;flex-wrap:wrap;gap:12px;padding-top:9px;border-top:1px solid color-mix(in srgb,var(--accent) 14%,transparent);font:10px ui-monospace,monospace;letter-spacing:.5px;opacity:.4}
@media(max-width:560px){.eco-row{grid-template-columns:1fr 62px 60px}.eco-bar{display:none}}
.mon{margin-top:12px;display:flex;flex-direction:column;gap:12px}
.mg{display:flex;flex-direction:column;align-items:center;gap:2px}
.mg-svg{width:100%;max-width:280px;height:auto;display:block}
.mg-arc{fill:none;stroke-linecap:round}
.mg-arc.track{stroke:rgba(255,255,255,.07);stroke-width:13}
.mg-tick{stroke:#ffd166;stroke-width:2;opacity:.55}
.mg-tickl{fill:#ffd166;opacity:.5;font:700 8px ui-monospace,monospace}
.mg-arc.value{stroke:var(--accent);stroke-width:13;filter:drop-shadow(0 0 8px color-mix(in srgb,var(--accent) 65%,transparent));transition:stroke .3s}
.mg.warn .mg-arc.value,.mg.warn .mg-dot{stroke:#ffd166;fill:#ffd166}
.mg.over .mg-arc.value,.mg.over .mg-dot{stroke:#ff3d71;fill:#ff3d71}
.mg-dot{fill:var(--accent);stroke:#0a1119;stroke-width:2}
.mg-min,.mg-max{fill:currentColor;opacity:.35;font:600 9px ui-monospace,monospace}
.mg-max{text-anchor:end}
.mg-read{text-align:center;margin-top:-16px}
.mg-read strong{display:block;font:750 30px Inter,system-ui,sans-serif;letter-spacing:-.03em;color:var(--accent);line-height:1}
.mg.warn .mg-read strong{color:#ffd166}
.mg.over .mg-read strong{color:#ff3d71}
.mg-read strong i{font-style:normal;font-size:13px;font-weight:600;opacity:.55;margin-left:3px}
.mg-read span{display:block;margin-top:5px;font:10px ui-monospace,monospace;letter-spacing:.8px;opacity:.5}
.mon-status{display:flex;align-items:center;gap:7px;padding:8px 11px;border-radius:10px;font-size:11.5px;font-weight:600}
.mon-status ha-icon{--mdc-icon-size:16px}
.mon-status.good{background:rgba(6,214,160,.1);border:1px solid rgba(6,214,160,.26);color:#06d6a0}
.mon-status.bad{background:rgba(255,209,102,.1);border:1px solid rgba(255,209,102,.3);color:#ffd166}
.mon-group{border-top:1px solid color-mix(in srgb,var(--accent) 14%,transparent);padding-top:10px}
.mon-head{display:flex;align-items:center;gap:7px;margin-bottom:7px}
.mon-head ha-icon{--mdc-icon-size:15px;color:var(--accent);opacity:.8}
.mon-head strong{font:700 10px ui-monospace,monospace;letter-spacing:1.8px;text-transform:uppercase;color:var(--accent)}
.lim-group{margin-top:9px;padding:9px 10px;border-radius:10px;background:color-mix(in srgb,var(--accent) 5%,transparent);border:1px solid color-mix(in srgb,var(--accent) 14%,transparent)}
.lim-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.lim-head ha-icon{--mdc-icon-size:14px;color:var(--accent)}
.lim-head strong{font-size:11.5px}
.lim-head em{flex-basis:100%;font-style:normal;font:9px ui-monospace,monospace;opacity:.4;letter-spacing:.6px}
.lim-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}
.lim-grid label{font-size:8.5px;letter-spacing:.9px}
.mon-head em{font-style:normal;font-size:9.5px;opacity:.35;letter-spacing:.3px}
.mon-head span{margin-left:auto;font:10px ui-monospace,monospace;opacity:.35}
.mon-rows{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:4px}
.mon-row{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;background:color-mix(in srgb,var(--accent) 6%,transparent);border:1px solid transparent;color:var(--primary-text-color);text-align:left;font-weight:500;letter-spacing:0}
.mon-row:hover{border-color:color-mix(in srgb,var(--accent) 34%,transparent)}
.mon-name{flex:1;min-width:0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.75}
.mon-val{flex-shrink:0;font:750 13px Inter,system-ui,sans-serif;color:var(--accent);font-variant-numeric:tabular-nums}
.mon-val i{font-style:normal;font-size:9px;font-weight:600;opacity:.55;margin-left:2px}
.mon-row.warn{background:rgba(255,209,102,.12);border-color:rgba(255,209,102,.34)}
.mon-row.warn .mon-val{color:#ffd166}
.mon-row.alarm{background:rgba(255,61,113,.14);border-color:rgba(255,61,113,.4)}
.mon-row.alarm .mon-val{color:#ff8091}
.dom-grid{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}
.dom-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:99px;font-size:10.5px;font-weight:600;letter-spacing:.02em;background:transparent;border:1px solid var(--divider-color);color:var(--primary-text-color);opacity:.5}
.dom-chip ha-icon{--mdc-icon-size:13px}
.dom-chip.on{opacity:1;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 50%,transparent);background:color-mix(in srgb,var(--accent) 13%,transparent)}

.item.flow .value{display:none}
.ef{margin-top:10px;display:flex;flex-direction:column;gap:10px;max-width:560px;margin-left:auto;margin-right:auto;width:100%}
.ef-stage{position:relative;width:100%;max-width:560px;margin:0 auto}
/* Without fill:none an SVG path is filled with the default black, which drew
   the connections as solid tapering wedges instead of lines. */
.ef-path{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.ef-path.idle{stroke:currentColor;stroke-width:1.5;opacity:.1;stroke-dasharray:4 6}
.ef-path.active{stroke:var(--nc);opacity:.32}
.ef-dot{fill:var(--nc);stroke:none;filter:drop-shadow(0 0 5px var(--nc))}
.ef-svg{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}
.ef-nodes{position:absolute;inset:0;pointer-events:none;container-type:inline-size}
.ef-n{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;width:max-content;padding:0;border:0;background:none;color:var(--primary-text-color);letter-spacing:0;font:inherit;pointer-events:auto}
.ef-n-lab{font:700 9px ui-monospace,SFMono-Regular,monospace;letter-spacing:2px;text-transform:uppercase;opacity:.45;white-space:nowrap}
.ef-n-disc{position:relative;display:grid;place-items:center;width:var(--r);height:var(--r);border-radius:50%;background:radial-gradient(circle at 50% 35%,color-mix(in srgb,var(--nc) 26%,#0a1119),color-mix(in srgb,var(--nc) 9%,#070d14));border:1.5px solid color-mix(in srgb,var(--nc) 75%,transparent);box-shadow:0 0 18px color-mix(in srgb,var(--nc) 26%,transparent),inset 0 0 14px color-mix(in srgb,var(--nc) 12%,transparent);transition:box-shadow .2s,border-color .2s}
.ef-n-disc ha-icon{--mdc-icon-size:calc(var(--r) * .40);color:var(--nc);filter:drop-shadow(0 0 6px color-mix(in srgb,var(--nc) 55%,transparent))}
.ef-n.inside .ef-n-disc{flex-direction:column;display:flex;align-items:center;justify-content:center;gap:1px}
.ef-n.inside .ef-n-disc ha-icon{--mdc-icon-size:calc(var(--r) * .26);margin-top:2px}
.ef-n-in{font:750 calc(var(--r) * .21) Inter,system-ui,sans-serif;color:var(--nc);line-height:1;letter-spacing:-.02em;white-space:nowrap}
.ef-n-in i{font-style:normal;font-size:calc(var(--r) * .12);font-weight:600;opacity:.6;margin-left:1px}
.ef-n-val{font:750 15px Inter,system-ui,sans-serif;color:var(--nc);white-space:nowrap;letter-spacing:-.02em;line-height:1}
.ef-n-val i{font-style:normal;font-size:9px;font-weight:600;opacity:.55;margin-left:2px}
.ef-n-sub{font:700 8px ui-monospace,monospace;letter-spacing:1.4px;text-transform:uppercase;opacity:.45;white-space:nowrap}
.ef-n.export .ef-n-disc{border-style:dashed}
.ef-n.home{cursor:pointer}
.ef-n.home .ef-n-disc{border-width:2px}
.ef-n.home:hover .ef-n-disc,.ef-n.home:focus-visible .ef-n-disc{box-shadow:0 0 26px color-mix(in srgb,var(--nc) 55%,transparent);border-color:var(--nc)}
.ef-n.home .ef-n-sub{color:var(--nc);opacity:.7}
.ef-n.home.open .ef-n-disc{border-style:dashed}
.ef-n.leaf{cursor:pointer}
.ef-n.leaf .ef-n-lab{order:3;opacity:.7;font:600 10px Inter,system-ui,sans-serif;letter-spacing:.01em;text-transform:none;max-width:min(104px,var(--lw,104px));overflow:hidden;text-overflow:ellipsis}
.ef-n.leaf .ef-n-val{order:2;font-size:13px}
.ef-n.leaf.child .ef-n-val{font-size:11.5px}
.ef-n.leaf.child .ef-n-lab{font-size:9px;max-width:min(88px,var(--lw,88px))}
.ef-n.leaf.ev .ef-n-disc{border-color:color-mix(in srgb,#06d6a0 70%,transparent)}
.ef-n.leaf.ev.charging .ef-n-disc{animation:evPulse 1.9s ease-in-out infinite}
.ef-n.leaf.ev .ef-n-sub{color:#06d6a0;opacity:.9;font-weight:700}
.ef-n.leaf.other .ef-n-disc{border-style:dashed;opacity:.8}
.ef-n.leaf:hover .ef-n-disc{border-color:var(--nc);box-shadow:0 0 22px color-mix(in srgb,var(--nc) 45%,transparent)}
.ef-subhint{fill:currentColor;opacity:.4;font:600 11px Inter,system-ui,sans-serif;text-anchor:middle}
.ef.open .ef-stage{max-width:640px}
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
.wiz{display:flex;flex-direction:column;gap:12px}
.wiz-bar{display:flex;gap:4px}
.wiz-bar i{flex:1;height:3px;border-radius:99px;background:rgba(255,255,255,.12)}
.wiz-bar i.done{background:color-mix(in srgb,var(--accent) 55%,transparent)}
.wiz-bar i.now{background:var(--accent);box-shadow:0 0 8px var(--accent)}
.wiz-head span{display:block;font:10px ui-monospace,monospace;letter-spacing:2px;color:var(--accent);opacity:.7}
.wiz-head strong{display:block;margin-top:3px;font-size:17px}
.wiz-q{font-size:14px;font-weight:650;line-height:1.4}
.wiz-hint{font-size:11.5px;line-height:1.55;opacity:.55}
.wiz-step input[type=text]{width:100%;box-sizing:border-box;margin-top:2px;padding:10px;border-radius:9px;border:1px solid var(--divider-color);background:color-mix(in srgb,var(--card-background-color) 60%,#000);color:var(--primary-text-color);font:inherit;font-size:13px}
.wiz-step input[type=text]:focus{outline:0;border-color:var(--accent)}
.wiz-list{display:flex;flex-direction:column;gap:4px;max-height:44vh;overflow-y:auto;padding-right:2px}
.wiz-opt{position:relative;display:flex;align-items:center;gap:9px;width:100%;padding:13px 10px 9px;border-radius:10px;background:color-mix(in srgb,var(--accent) 6%,transparent);border:1px solid transparent;color:var(--primary-text-color);text-align:left;font-weight:500;letter-spacing:0}
.wiz-opt:hover{border-color:color-mix(in srgb,var(--accent) 35%,transparent)}
.wiz-opt.sel{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent)}
.wiz-opt>ha-icon{--mdc-icon-size:18px;color:var(--accent);flex-shrink:0;opacity:.75}
.wiz-opt.sel>ha-icon{opacity:1}
.wiz-opt>div{flex:1;min-width:0}
.wiz-opt strong{display:block;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wiz-opt small{display:block;opacity:.45;font:10px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wiz-val{flex-shrink:0;font:750 13px Inter,system-ui,sans-serif;color:var(--accent)}
.wiz-val i{font-style:normal;font-size:9px;opacity:.55;margin-left:2px}
.wiz-tip{position:absolute;top:4px;right:8px;font-style:normal;font:700 8px ui-monospace,monospace;letter-spacing:1px;text-transform:uppercase;padding:2px 6px;border-radius:99px;background:var(--accent);color:#03131a}
.mw-add{display:flex;gap:7px;align-items:center;margin-top:4px}
.mw-add input{flex:1;min-width:0;box-sizing:border-box;padding:10px;border-radius:9px;border:1px solid var(--divider-color);background:color-mix(in srgb,var(--card-background-color) 60%,#000);color:var(--primary-text-color);font:inherit;font-size:13px}
.mw-add input:focus{outline:0;border-color:var(--accent)}
.mw-add button{flex-shrink:0;padding:10px 12px}
.wiz-parent{display:block;margin-top:11px;font-size:12px;font-weight:600}
.wiz-parent select{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:9px;border-radius:9px;border:1px solid var(--divider-color);background:color-mix(in srgb,var(--card-background-color) 60%,#000);color:var(--primary-text-color);font:inherit;font-size:12.5px}
.wiz-nav{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.wiz-nav button{flex:1;justify-content:center;min-width:110px}
.wiz-advanced{background:none;border:0;color:var(--primary-text-color);opacity:.4;font-size:11px;font-weight:500;letter-spacing:0;text-decoration:underline;padding:4px;align-self:center}
.wiz-advanced:hover{opacity:.8}
.flow-slot{margin-top:9px;padding:10px;border-radius:11px;background:color-mix(in srgb,var(--nc) 8%,transparent);border:1px solid color-mix(in srgb,var(--nc) 26%,transparent)}
.flow-slot.active{border-color:var(--nc)}
.flow-slot-head{display:flex;align-items:center;gap:9px}
.flow-slot-head>ha-icon{--mdc-icon-size:19px;color:var(--nc);flex-shrink:0}
.flow-slot-head>div{flex:1;min-width:0}
.flow-slot-head strong{display:block;font-size:12px}
.flow-slot-head small{display:block;opacity:.5;font:10px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.flow-slot .check{margin-top:8px;font-size:10.5px}
.flow-slot input[type=text]{margin-top:8px}

.status.warn{color:#ffd166;background:rgba(255,209,102,.13)}
button.urgent{animation:saveNudge 2.2s ease-in-out infinite}
@keyframes saveNudge{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 45%,transparent)}50%{box-shadow:0 0 0 6px transparent}}
.page-list{display:flex;flex-direction:column;gap:4px;margin-top:9px}
.page-row{display:flex;align-items:center;gap:8px;padding:8px 9px;border-radius:10px;background:color-mix(in srgb,var(--accent) 6%,transparent);border:1px solid transparent}
.page-row.current{border-color:color-mix(in srgb,var(--accent) 45%,transparent);background:color-mix(in srgb,var(--accent) 12%,transparent)}
.page-row>ha-icon{--mdc-icon-size:17px;color:var(--accent);flex-shrink:0}
.page-row>div{flex:1;min-width:0}
.page-row strong{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.page-row small{display:block;font:10px ui-monospace,monospace;opacity:.45}
.page-tabs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:20px}
.page-tab{padding:9px 14px;border-radius:11px;background:transparent;border:1px solid var(--divider-color);color:var(--primary-text-color);opacity:.55;font-size:11px}
.page-tab ha-icon{--mdc-icon-size:16px}
.page-tab:hover{opacity:.85}
.page-tab.active{opacity:1;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 55%,transparent);background:color-mix(in srgb,var(--accent) 12%,transparent)}
.page-tabs.editing{align-items:center}
.page-tab-wrap{display:flex;align-items:center;gap:3px;padding:2px;border-radius:13px;border:1px dashed transparent;position:relative;cursor:grab}
.page-tab-wrap.active{border-color:color-mix(in srgb,var(--accent) 30%,transparent)}
.page-tab-wrap.dragging{opacity:.35;cursor:grabbing}
/* The drop marker is a pseudo-element so that inserting it cannot reflow the
   bar: a real element between the tabs would shift everything sideways as the
   pointer moves, and the target would run away from the cursor. */
.page-tab-wrap.drop-before::before,.page-tab-wrap.drop-after::after{content:"";position:absolute;top:2px;bottom:2px;width:3px;border-radius:3px;background:var(--accent);box-shadow:0 0 9px var(--accent)}
.page-tab-wrap.drop-before::before{left:-5px}
.page-tab-wrap.drop-after::after{right:-5px}
.pt-nudge{display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:8px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);opacity:.7}
.pt-nudge ha-icon{--mdc-icon-size:16px}
.pt-nudge:hover:not(:disabled){opacity:1;border-color:var(--accent);color:var(--accent)}
.pt-nudge:disabled{opacity:.2}
.pt-hint{font:10px ui-monospace,monospace;opacity:.4;letter-spacing:.5px;align-self:center}
@media (max-width:700px){.pt-hint{display:none}}

.fp-viewport{position:relative;height:min(74vh,760px);min-height:420px;border-radius:20px;overflow:hidden;touch-action:none;border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);background:radial-gradient(120% 90% at 50% 15%,color-mix(in srgb,var(--accent) 9%,#0b1119) 0%,#080d14 70%);perspective:var(--persp,1900px);perspective-origin:50% 42%}
.fp-stage{position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d}
.fp-world{position:absolute;transform-style:preserve-3d;transform:scale(var(--zoom)) rotateX(var(--pitch)) rotateZ(var(--yaw));transition:transform .28s cubic-bezier(.4,0,.2,1)}
/* While a finger or the mouse is turning the house the easing has to go, or
   the scene lags a third of a second behind the pointer and overshoots when it
   stops. The HUD buttons keep their animation. */
.fp-viewport.dragging .fp-world{transition:none}
.fp-viewport.dragging{cursor:grabbing}
.fp-viewport{cursor:grab}
.fp-viewport.editing{cursor:default}
.fp-ground.deck{background:none;border:1px dashed rgba(255,255,255,.16);box-shadow:none}
.fp-ground{position:absolute;border-radius:14px;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 40px),repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 40px),rgba(255,255,255,.02);box-shadow:0 0 70px rgba(0,0,0,.6)}
/* The room box is transparent to the pointer; the floor — which carries the
   clip-path of the real footprint — is what receives clicks. Two consequences,
   both of them the point: the notch of an L-shaped room is not clickable
   (because it is not part of the room), and a click landing outside a room's
   footprint falls through to whatever is actually underneath instead of being
   swallowed by an invisible rectangle. */
.fp-room{position:absolute;transform-style:preserve-3d;pointer-events:none}
.fp-floor{pointer-events:auto}
.fp-handle,.fp-vertex,.fp-rotate,.fp-spot.movable,.fp-car.movable,
.fp-label,.fp-badges,.fp-spot-btn{pointer-events:auto}
/* The room being edited floats above its neighbours so its handles are always
   reachable, whatever order the rooms happen to be drawn in. */
.fp-room.selected{z-index:20}
.fp-room.focused{z-index:15}
.fp-room.editable{cursor:grab}
.fp-room.editable:active{cursor:grabbing}
/* The floor is three layers: the material, the room's own tint, and the light
   actually falling on it. --lit is 0..1 and comes from the real bulbs, so a
   dimmer at 30% really does light the room at 30%. */
.fp-floor{position:absolute;inset:0;
  background:var(--mat, linear-gradient(135deg,color-mix(in srgb,var(--rc) 26%,#0d141d),color-mix(in srgb,var(--rc) 9%,#0b111a)));
  background-size:cover;
  box-shadow:inset 0 0 40px color-mix(in srgb,var(--rc) 14%,transparent),
             inset 0 0 22px rgba(0,0,0,.55);
  filter:brightness(calc(0.52 + 0.75 * var(--lit,0)))}
/* The pool of light itself, thrown from above and fading outwards. Its own
   layer so it can sit over the material without washing the pattern away. */
.fp-floor::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse 78% 72% at 50% 38%,
    color-mix(in srgb,var(--lc,#ffd7a3) 58%,transparent) 0%,
    color-mix(in srgb,var(--lc,#ffd7a3) 20%,transparent) 45%,
    transparent 78%);
  opacity:calc(var(--lit,0) * .85);mix-blend-mode:screen;transition:opacity .5s ease}
/* Contact shadow: without this the volumes float and the whole scene reads as
   flat coloured shapes, which is most of what made it look like a diagram. */
.fp-room::after{content:"";position:absolute;left:4%;right:4%;top:8%;bottom:-2%;
  border-radius:14px;background:rgba(0,0,0,.5);filter:blur(11px);
  transform:translateZ(-2px);pointer-events:none;z-index:-1}
/* The floor outline is an SVG polygon rather than a CSS border: a border is
   clipped away by clip-path, so a non-rectangular room would lose its edge. */
.fp-outline{position:absolute;inset:0;overflow:visible;pointer-events:none}
.fp-outline polygon{fill:none;stroke:color-mix(in srgb,var(--rc) 60%,transparent);stroke-width:1;vector-effect:non-scaling-stroke}
.fp-room.selected .fp-outline polygon{stroke:#fff;stroke-width:2}
.fp-room.selected .fp-floor{background:linear-gradient(135deg,color-mix(in srgb,var(--rc) 52%,#0d141d),color-mix(in srgb,var(--rc) 26%,#0b111a));box-shadow:inset 0 0 60px color-mix(in srgb,var(--rc) 45%,transparent),0 0 40px color-mix(in srgb,var(--rc) 70%,transparent)}
.fp-room.selected .fp-wall{border-color:#fff}
/* Each kind of side reads differently at a glance: glazing is transparent with
   a frame, a railing is waist-high with posts, a garage door has its ribs. */
.fp-wall.glass{background:linear-gradient(180deg,color-mix(in srgb,var(--rc) 22%,transparent),color-mix(in srgb,#bfe9ff 18%,transparent));
  border:1px solid color-mix(in srgb,#bfe9ff 60%,transparent);box-shadow:inset 0 0 18px color-mix(in srgb,#bfe9ff 22%,transparent)}
.fp-wall.window{background:repeating-linear-gradient(180deg,color-mix(in srgb,#bfe9ff 16%,transparent) 0 46%,transparent 46% 54%,color-mix(in srgb,#bfe9ff 16%,transparent) 54% 100%);
  border:1px solid color-mix(in srgb,#bfe9ff 55%,transparent)}
.fp-wall.railing{background:repeating-linear-gradient(90deg,color-mix(in srgb,var(--rc) 65%,transparent) 0 2px,transparent 2px 14px);
  border-top:2px solid color-mix(in srgb,var(--rc) 85%,transparent);border-bottom:0}
.fp-wall.stairs{background:repeating-linear-gradient(0deg,color-mix(in srgb,var(--rc) 40%,transparent) 0 4px,transparent 4px 9px);
  border:1px solid color-mix(in srgb,var(--rc) 45%,transparent)}
.fp-wall.garage{background:repeating-linear-gradient(0deg,color-mix(in srgb,var(--rc) 34%,transparent) 0 5px,color-mix(in srgb,#0b1119 40%,transparent) 5px 10px);
  border:1px solid color-mix(in srgb,var(--rc) 60%,transparent)}
.fp-wall.door{background:linear-gradient(180deg,color-mix(in srgb,var(--rc) 34%,transparent),color-mix(in srgb,var(--rc) 16%,transparent));
  border:1px solid color-mix(in srgb,var(--rc) 70%,transparent);border-radius:3px 3px 0 0}
.wall-list{display:flex;flex-direction:column;gap:5px;margin-top:8px}
.wall-row{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:9px;
  background:color-mix(in srgb,var(--accent) 5%,transparent);border:1px solid color-mix(in srgb,var(--accent) 14%,transparent)}
.wall-row>ha-icon{--mdc-icon-size:16px;color:var(--accent);flex-shrink:0}
.wall-txt{flex:1;min-width:0}
.wall-txt strong{display:block;font-size:11.5px}
.wall-txt small{display:block;font:9px ui-monospace,monospace;opacity:.4;text-transform:uppercase;letter-spacing:.8px}
.wall-row select{width:auto;min-width:120px;padding:4px 6px;font-size:11px}
.fp-room{transition:opacity .3s ease}
.fp-room.ghost{opacity:.09;pointer-events:none}
.fp-room.dim{opacity:.1;pointer-events:none}
.fp-room.focused .fp-floor{box-shadow:inset 0 0 90px color-mix(in srgb,var(--rc) 30%,transparent)}
/* Open-dollhouse presentation: the walls stay as spatial reference but stop
   occluding the devices standing inside the room, which is the entire point
   of zooming in. */
.fp-room.focused .fp-wall{opacity:.24}
.fp-room.focused .fp-outline polygon{stroke-width:2}
.fp-room.resizing .fp-wall,.fp-room.resizing .fp-anchor,.fp-room.resizing .fp-spots{opacity:0}

/* Grips live in the floor plane so they stay attached to the geometry they
   move; the counter-rotation trick used for labels would detach them. */
.fp-handle{position:absolute;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;padding:0;border-radius:3px;
  background:#fff;border:1.5px solid color-mix(in srgb,var(--rc) 80%,#000);box-shadow:0 0 0 1px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.6);z-index:3}
.fp-handle:hover{background:var(--rc);transform:scale(1.25)}
.fp-rotate{position:absolute;left:50%;top:-34px;transform:translateX(-50%);display:grid;place-items:center;
  width:26px;height:26px;padding:0;border-radius:50%;background:#fff;color:#0a1017;
  border:1.5px solid color-mix(in srgb,var(--rc) 80%,#000);box-shadow:0 2px 10px rgba(0,0,0,.6);z-index:5;cursor:grab;touch-action:none}
.fp-rotate:active{cursor:grabbing}
.fp-rotate:hover{background:var(--rc);color:#fff;transform:translateX(-50%) scale(1.15)}
.fp-rotate ha-icon{--mdc-icon-size:16px;display:block}
@media(max-width:700px){.fp-rotate{width:32px;height:32px;top:-42px}.fp-rotate ha-icon{--mdc-icon-size:19px}}
.fp-vertex{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;padding:0;border-radius:50%;
  background:var(--rc);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.6);z-index:4;cursor:move}
.fp-vertex.add{background:transparent;border-style:dashed;border-color:rgba(255,255,255,.7);width:12px;height:12px;margin:-6px 0 0 -6px;cursor:copy}
.fp-vertex:hover{transform:scale(1.3)}

.fp-spots{position:absolute;inset:0;transform-style:preserve-3d}
.fp-spot{position:absolute;width:0;height:0;transform-style:preserve-3d}
.fp-spot.movable{cursor:move;pointer-events:auto}
.fp-spot-pin{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:4px;width:max-content;transform-origin:0 0}
.fp-spot-btn{display:grid;place-items:center;width:38px;height:38px;margin-left:-19px;padding:0;border-radius:50%;
  background:rgba(8,14,22,.9);border:1.5px solid color-mix(in srgb,var(--rc) 60%,transparent);color:#cfe6f5;
  box-shadow:0 6px 18px rgba(0,0,0,.55);backdrop-filter:blur(6px);transition:transform .18s,box-shadow .18s}
.fp-spot-btn ha-icon{--mdc-icon-size:20px}
.fp-spot.on .fp-spot-btn{background:linear-gradient(180deg,#ffd98a,#ffc247);border-color:#ffdb8f;color:#0a1017;box-shadow:0 6px 22px rgba(255,194,71,.5)}
.fp-spot-btn:hover{transform:translateY(-3px) scale(1.06)}
.fp-spot-tip{transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;padding:3px 9px;border-radius:9px;
  background:rgba(6,12,20,.9);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(6px);white-space:nowrap;line-height:1.25}
.fp-spot-tip strong{font-size:10.5px;font-weight:650;color:#e8f4ff;max-width:132px;overflow:hidden;text-overflow:ellipsis}
.fp-spot-tip span{font:9.5px ui-monospace,monospace;opacity:.62;letter-spacing:.04em;text-transform:uppercase}

.fp-focus-bar{position:absolute;left:14px;right:14px;top:14px;display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:14px;
  background:rgba(8,14,22,.86);border:1px solid color-mix(in srgb,var(--accent) 28%,transparent);backdrop-filter:blur(10px);
  box-shadow:0 12px 34px rgba(0,0,0,.5);animation:cyFocusIn .26s cubic-bezier(.32,.72,0,1)}
@keyframes cyFocusIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
.fp-focus-bar>ha-icon{--mdc-icon-size:22px;color:var(--accent);flex-shrink:0}
.ffb-text{flex:1;min-width:0}
.ffb-text strong{display:block;font-size:13px;letter-spacing:.04em}
.ffb-text small{display:block;font:10px ui-monospace,monospace;opacity:.5;letter-spacing:.06em}
.ffb-add{display:inline-flex;align-items:center;gap:5px;padding:7px 11px;border-radius:9px;font-size:10.5px;letter-spacing:.08em;
  background:color-mix(in srgb,var(--accent) 16%,transparent);border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);color:var(--accent)}
.ffb-add ha-icon{--mdc-icon-size:15px}
.ffb-exit{padding:7px;border-radius:9px;background:transparent;border:1px solid rgba(255,255,255,.14);color:#cfe6f5}
.ffb-exit:hover{background:rgba(255,255,255,.09)}
.fp-levels{position:absolute;right:14px;bottom:14px;display:flex;flex-direction:column;gap:5px;padding:6px;border-radius:13px;
  background:rgba(8,14,22,.8);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(8px)}
.fp-levels .fp-hud-btn{min-width:32px;font:11px ui-monospace,monospace;font-weight:700}

.level-picker{display:flex;align-items:center;gap:10px;margin-top:8px}
.level-picker .mini{flex-shrink:0}
.level-now{flex:1;text-align:center;padding:7px;border-radius:9px;background:color-mix(in srgb,var(--accent) 8%,transparent);border:1px solid color-mix(in srgb,var(--accent) 20%,transparent)}
.level-now strong{display:block;font-size:12px}
.level-now small{display:block;font:9.5px ui-monospace,monospace;opacity:.5}
.room-list{display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:300px;overflow-y:auto;overscroll-behavior:contain}
.room-list-row{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:9px;text-align:left;
  background:color-mix(in srgb,var(--rc) 7%,transparent);border:1px solid color-mix(in srgb,var(--rc) 18%,transparent);color:var(--primary-text-color)}
.room-list-row.on{border-color:var(--rc);background:color-mix(in srgb,var(--rc) 18%,transparent)}
.room-list-row>ha-icon{--mdc-icon-size:17px;color:var(--rc);flex-shrink:0}
.rl-txt{flex:1;min-width:0}
.rl-txt strong{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rl-txt small{display:block;font:9px ui-monospace,monospace;opacity:.45;text-transform:uppercase;letter-spacing:.7px}
.rl-dot{width:8px;height:8px;border-radius:50%;background:var(--rc);flex-shrink:0;opacity:.7}
.level-rows{display:flex;flex-direction:column;gap:5px;margin-top:8px}
.level-row{display:flex;align-items:baseline;gap:8px;padding:8px 10px;border-radius:9px;text-align:left;
  background:color-mix(in srgb,var(--accent) 6%,transparent);border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);color:var(--primary-text-color)}
.level-row.active{border-color:color-mix(in srgb,var(--accent) 60%,transparent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
.level-row strong{flex:1;font-size:12px}
.level-row small{font:10px ui-monospace,monospace;opacity:.5}

.shape-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}
.shape-btn{display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 4px;border-radius:10px;
  background:color-mix(in srgb,var(--accent) 6%,transparent);border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);color:var(--primary-text-color)}
.shape-btn.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent)}
.shape-prev{display:block;width:34px;height:26px;background:color-mix(in srgb,var(--accent) 62%,transparent)}
.shape-btn small{font-size:9.5px;letter-spacing:.03em;opacity:.75;text-align:center;line-height:1.15}
.vertex-list{display:flex;flex-direction:column;gap:4px;margin-top:8px}
.vertex-row{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.03);font-size:11px}
.vertex-row span{font-weight:700;color:var(--accent);width:26px}
.vertex-row em{flex:1;font:10px ui-monospace,monospace;opacity:.55;font-style:normal}

.seg{display:flex;gap:0;margin-top:8px;border-radius:10px;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 22%,transparent)}
.seg button{flex:1;padding:9px 6px;font-size:10.5px;letter-spacing:.05em;background:transparent;border:0;color:var(--primary-text-color);opacity:.55}
.seg button.active{opacity:1;color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent)}
.entity-result-head{font:9.5px ui-monospace,monospace;letter-spacing:.14em;opacity:.45;padding:8px 4px 4px}
.room-ent-pos{color:var(--accent);font-size:9px;flex-shrink:0}
.room-ent.hidden{opacity:.35}
.room-ent.hidden span{text-decoration:line-through}
.room-vis-head{display:flex;align-items:center;gap:8px;margin-top:8px}
.room-vis-head span{flex:1;font:9.5px ui-monospace,monospace;letter-spacing:1.2px;opacity:.45}
.room-entities{max-height:340px;overflow-y:auto;overscroll-behavior:contain}
.dev-group-head{display:flex;align-items:center;gap:8px;padding:9px 4px 3px;margin-top:3px;border-top:1px solid rgba(255,255,255,.06)}
.dev-group-head strong{flex:1;font:9px ui-monospace,monospace;letter-spacing:1.3px;text-transform:uppercase;opacity:.42;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cam-off small{display:block;margin-top:4px;font:9px ui-monospace,monospace;letter-spacing:.8px;opacity:.55}
/* Walls: dark at the base (ambient occlusion where they meet the floor),
   brighter towards the top where the light is, and tinted by the light in the
   room like the floor is. */
.fp-wall{position:absolute;
  background:linear-gradient(to top,
    color-mix(in srgb,var(--rc) 34%,#070b11) 0%,
    color-mix(in srgb,var(--rc) 12%,#0a1017) 55%,
    color-mix(in srgb,var(--rc) 26%,#0a1017) 100%);
  border:1px solid color-mix(in srgb,var(--rc) 42%,transparent);border-bottom:0;
  filter:brightness(calc((0.7 + 0.55 * var(--lit,0)) * var(--face,1)))}
.fp-wall::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(to top,
    color-mix(in srgb,var(--lc,#ffd7a3) 34%,transparent) 0%,
    color-mix(in srgb,var(--lc,#ffd7a3) 8%,transparent) 60%, transparent 100%);
  opacity:calc(var(--lit,0) * .8);mix-blend-mode:screen;transition:opacity .5s ease}
/* A lit room spills light past its own walls, which is what stops the rooms
   reading as separate coloured tiles.
   NOT on .fp-room: a filter there flattens the preserve-3d subtree and the
   whole scene collapses. On the floor, which is a leaf. */
.fp-room.lit .fp-floor{box-shadow:inset 0 0 40px color-mix(in srgb,var(--rc) 14%,transparent),
  inset 0 0 22px rgba(0,0,0,.45),
  0 0 30px color-mix(in srgb,var(--lc,#ffd7a3) calc(var(--lit,0) * 48%),transparent)}
/* --face is the geometric shading of that wall's own orientation, set inline
   per wall; the stylesheet multiplies it by the light in the room. */
.fp-anchor{position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d;pointer-events:none}
.fp-tag{position:absolute;left:0;top:0;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:5px;width:max-content}
.fp-label{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:99px;background:rgba(6,12,20,.82);border:1px solid color-mix(in srgb,var(--rc) 50%,transparent);backdrop-filter:blur(6px);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--rc);white-space:nowrap}
.fp-label ha-icon{--mdc-icon-size:15px}
.fp-label{pointer-events:auto;cursor:zoom-in;transition:transform .16s,box-shadow .16s}
.fp-label:hover{transform:scale(1.07);box-shadow:0 0 22px color-mix(in srgb,var(--rc) 55%,transparent)}
.fp-lv{font-style:normal;font-size:9px;padding:1px 5px;border-radius:99px;background:color-mix(in srgb,var(--rc) 26%,transparent);opacity:.9}
.fp-viewport.focusing .fp-label{cursor:zoom-out}
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

/* --------------------------------------------------------- auto elettrica -- */
/* ------------------------------------------------------------- comfort -- */
.cf{margin-top:12px;display:flex;flex-direction:column;gap:12px}
.cf-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:3px;overscroll-behavior-x:contain;scrollbar-width:none}
.cf-chips::-webkit-scrollbar{display:none}
.cf-chip{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;padding:8px 13px;border-radius:99px;font-size:12px;font-weight:650;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);color:var(--primary-text-color)}
.cf-chip.on{background:color-mix(in srgb,var(--accent) 16%,transparent);border-color:var(--accent);color:var(--accent)}
.cf-chip ha-icon{--mdc-icon-size:16px}
.cf-chip em{font-style:normal;font:10px ui-monospace,monospace;opacity:.55;padding:1px 6px;border-radius:99px;background:rgba(255,255,255,.08)}
.cf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
/* The card decides its own layout from its own width, not the window's: five
   of these in a row on a wide screen are each as narrow as one on a phone, and
   at that width two value columns collide — the temperature ran straight into
   the "UMIDITÀ" label. */
.cf-room{container-type:inline-size;position:relative;padding:13px 14px 0;border-radius:14px;overflow:hidden;
  background:color-mix(in srgb,var(--cc) 7%,transparent);border:1px solid color-mix(in srgb,var(--cc) 22%,transparent)}
.cf-room>header{display:flex;align-items:center;gap:9px;margin-bottom:11px}
.cf-ico{display:grid;place-items:center;width:34px;height:34px;flex-shrink:0;border-radius:10px;
  background:color-mix(in srgb,var(--cc) 16%,transparent);border:1px solid color-mix(in srgb,var(--cc) 30%,transparent);color:var(--cc)}
.cf-ico ha-icon{--mdc-icon-size:19px}
.cf-room>header strong{flex:1;min-width:0;font-size:15px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cf-badge{font-style:normal;font:9.5px ui-monospace,monospace;letter-spacing:1.2px;padding:4px 10px;border-radius:99px;
  color:var(--cc);background:color-mix(in srgb,var(--cc) 13%,transparent);border:1px solid color-mix(in srgb,var(--cc) 40%,transparent)}
.cf-vals{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding-bottom:13px}
@container (max-width: 300px){
  .cf-vals{grid-template-columns:minmax(0,1fr)}
  .cf-h{border-left:0;padding-left:0;border-top:1px solid rgba(255,255,255,.08);padding-top:10px}
}
.cf-t,.cf-h{text-align:left;background:none;border:0;padding:0;color:var(--primary-text-color);min-width:0}
.cf-h{border-left:1px solid rgba(255,255,255,.08);padding-left:12px}
.cf-t small,.cf-h small{display:flex;align-items:center;gap:4px;font:9px ui-monospace,monospace;letter-spacing:1.3px;opacity:.45;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cf-h small ha-icon{--mdc-icon-size:12px;color:#4cc9f0;opacity:.8}
.cf-t b,.cf-h b{display:block;margin-top:3px;font-size:clamp(22px,7cqw,31px);font-weight:750;line-height:1;white-space:nowrap}
.cf-t b i,.cf-h b i{font-size:15px;font-style:normal;opacity:.5;margin-left:1px}
.cf-hbar{display:block;margin-top:7px;height:4px;border-radius:99px;background:rgba(255,255,255,.09);overflow:hidden}
.cf-hbar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#4cc9f0,#4361ee)}
/* One fixed scale for every room — 12 to 34 degrees — so the markers can be
   compared across rooms. A per-room scale would put a cellar and a balcony in
   the same place and destroy exactly the comparison this card is for. */
.cf-scale{position:absolute;left:0;right:0;bottom:0;height:4px;
  background:linear-gradient(90deg,#4cc9f0 0%,#06d6a0 27%,#8ac926 45%,#ffd166 64%,#ff924c 82%,#ff3d71 100%)}
.cf-scale i{position:absolute;top:-2px;width:3px;height:8px;margin-left:-1.5px;border-radius:99px;background:#fff;
  box-shadow:0 0 6px rgba(0,0,0,.8)}
@media(max-width:640px){
  .cf-grid{grid-template-columns:1fr}
  .cf-t b,.cf-h b{font-size:27px}
}

.ev{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.ev-car{padding:12px;border-radius:14px;background:color-mix(in srgb,var(--ec) 7%,transparent);
  border:1px solid color-mix(in srgb,var(--ec) 22%,transparent)}
.ev-car.charging{border-color:color-mix(in srgb,var(--ec) 55%,transparent);
  box-shadow:0 0 26px color-mix(in srgb,var(--ec) 16%,transparent)}
.ev-top{display:flex;align-items:center;gap:14px}
.ev-ring{flex-shrink:0}
.ev-ring-bg{fill:none;stroke:rgba(255,255,255,.07);stroke-width:7}
.ev-ring-arc{fill:none;stroke-width:7;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%;
  transition:stroke-dashoffset .6s cubic-bezier(.4,0,.2,1),stroke .4s}
/* The ring breathes only while charging: a static ring is a reading, a moving
   one is an event, and the difference has to be visible from the doorway. */
.ev-ring.charging .ev-ring-arc{animation:evPulse 1.9s ease-in-out infinite}
@keyframes evPulse{0%,100%{opacity:1}50%{opacity:.55}}
.ev-ring-val{fill:currentColor;font:700 23px Inter,system-ui,sans-serif;text-anchor:middle}
.ev-ring-pct{fill:currentColor;opacity:.45;font:600 9px ui-monospace,monospace;text-anchor:middle}
.ev-ring-bolt{fill:var(--ec);font-size:13px;text-anchor:middle}
.ev-id{flex:1;min-width:0}
.ev-name{display:flex;align-items:center;gap:7px;padding:0;background:none;border:0;color:var(--primary-text-color)}
.ev-name ha-icon{--mdc-icon-size:20px;color:var(--ec)}
.ev-name strong{font-size:15px;font-weight:650}
.ev-status{display:block;margin-top:2px;font:10px ui-monospace,monospace;letter-spacing:1.2px;text-transform:uppercase;opacity:.55}
.ev-target{position:relative;height:5px;margin-top:9px;border-radius:99px;background:rgba(255,255,255,.07);overflow:visible}
.ev-target i{display:block;height:100%;border-radius:99px;background:var(--ec)}
/* The target is a mark on the bar, not a second bar: it is a destination. */
.ev-target b{position:absolute;top:-3px;width:2px;height:11px;border-radius:99px;background:#fff;opacity:.7}
.ev-rows{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:4px;margin-top:11px}
.ev-row{display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:9px;background:rgba(255,255,255,.03)}
.ev-row ha-icon{--mdc-icon-size:15px;color:var(--ec);opacity:.8;flex-shrink:0}
.ev-row span{flex:1;font:9.5px ui-monospace,monospace;letter-spacing:.9px;text-transform:uppercase;opacity:.5}
.ev-row strong{font:12px ui-monospace,monospace;font-weight:700}
.ev-ctl{display:flex;align-items:center;gap:11px;margin-top:11px;flex-wrap:wrap}
.ev-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:10px;font-size:11px;letter-spacing:.1em;
  background:color-mix(in srgb,var(--ec) 14%,transparent);border:1px solid color-mix(in srgb,var(--ec) 40%,transparent);color:var(--ec)}
.ev-btn.on{background:color-mix(in srgb,#ff3d71 15%,transparent);border-color:color-mix(in srgb,#ff3d71 45%,transparent);color:#ff8fab}
.ev-btn ha-icon{--mdc-icon-size:15px}
.ev-amp{flex:1;min-width:150px;font:9px ui-monospace,monospace;letter-spacing:1.1px;opacity:.6}
.veh-card{margin-top:7px;border-radius:11px;background:color-mix(in srgb,var(--accent) 5%,transparent);
  border:1px solid color-mix(in srgb,var(--accent) 15%,transparent)}
.veh-head{display:flex;align-items:center;gap:8px;padding:8px 10px}
.veh-head>ha-icon{--mdc-icon-size:18px;color:var(--accent);flex-shrink:0}
.veh-head .mini.on{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,transparent)}
.veh-body{display:flex;flex-direction:column;gap:7px;padding:2px 10px 11px}
.room-cars{margin-top:10px;display:flex;flex-wrap:wrap;gap:5px}
.room-cars strong,.room-cars .hint{flex-basis:100%}
.room-cars strong{font:9.5px ui-monospace,monospace;letter-spacing:1.5px;opacity:.55}

/* la macchina sulla mappa 3D */
.fp-cars{position:absolute;inset:0;transform-style:preserve-3d}
.fp-car{position:absolute;width:0;height:0;transform-style:preserve-3d}
.fp-car.movable{cursor:move;touch-action:none;pointer-events:auto}
.fp-car-body{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:3px;
  width:max-content;transform-origin:0 0}
.fp-car-icon{position:relative;display:grid;place-items:center;width:46px;height:34px;margin-left:-23px;border-radius:10px;
  background:linear-gradient(180deg,color-mix(in srgb,var(--ec) 30%,#0b1119),#0b1119);
  border:1.5px solid color-mix(in srgb,var(--ec) 65%,transparent);color:var(--ec);
  box-shadow:0 6px 18px rgba(0,0,0,.55)}
.fp-car-icon ha-icon{--mdc-icon-size:24px}
.fp-car.charging .fp-car-icon{box-shadow:0 6px 22px color-mix(in srgb,var(--ec) 55%,transparent);
  animation:evPulse 1.9s ease-in-out infinite}
.fp-car-bolt{position:absolute;right:-7px;top:-7px;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;
  background:#ffd166;color:#0a1017;box-shadow:0 0 12px rgba(255,209,102,.7)}
.fp-car-bolt ha-icon{--mdc-icon-size:12px}
.fp-car-soc{width:46px;margin-left:-23px;height:4px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden}
.fp-car-soc span{display:block;height:100%;border-radius:99px;background:var(--ec);transition:width .6s ease}
.fp-car-tag{display:flex;flex-direction:column;align-items:center;transform:translateX(-50%);padding:2px 8px;border-radius:8px;
  background:rgba(6,12,20,.9);border:1px solid rgba(255,255,255,.12);white-space:nowrap;line-height:1.25}
.fp-car-tag strong{font-size:10px;font-weight:650}
.fp-car-tag small{font:9px ui-monospace,monospace;opacity:.6;letter-spacing:.4px}
@media(max-width:700px){.fp-car-tag{display:none}}

.rc{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.rc-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(74px,1fr));gap:6px}
.rc-read{display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 5px;border-radius:10px;
  background:color-mix(in srgb,var(--accent) 7%,transparent);border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);color:var(--primary-text-color)}
.rc-read ha-icon{--mdc-icon-size:15px;color:var(--accent);opacity:.8}
.rc-read strong{font-size:16px;font-weight:700;line-height:1.1}
.rc-read strong i{font-size:9px;font-style:normal;opacity:.5;margin-left:1px}
.rc-read small{font:8.5px ui-monospace,monospace;letter-spacing:.6px;opacity:.42;text-transform:uppercase;
  max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rc-block{display:flex;flex-direction:column;gap:3px}
.rc-block>header{display:flex;align-items:center;gap:7px;padding:4px 2px 2px}
.rc-block>header ha-icon{--mdc-icon-size:14px;opacity:.5}
.rc-block>header strong{flex:1;font:10px ui-monospace,monospace;letter-spacing:1.4px;text-transform:uppercase;opacity:.68}
.rc-block>header em{font-style:normal;font:10px ui-monospace,monospace;opacity:.45}
.rc-block>header .act-off{--gc:var(--accent)}
.rc-row{display:flex;align-items:center;gap:9px;width:100%;padding:7px 9px;border-radius:9px;text-align:left;
  background:rgba(255,255,255,.03);border:1px solid transparent;color:var(--primary-text-color)}
.rc-row.on{background:color-mix(in srgb,var(--accent) 11%,transparent);border-color:color-mix(in srgb,var(--accent) 28%,transparent)}
.rc-row:hover{border-color:color-mix(in srgb,var(--accent) 45%,transparent)}
.rc-row .act-icon{color:#93a3b5}
.rc-row{cursor:pointer}
.rc-row.on .act-icon{color:var(--accent)}
.rc-row span{flex:1;min-width:0;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rc-row small{font:9.5px ui-monospace,monospace;letter-spacing:.5px;opacity:.5;text-transform:uppercase;flex-shrink:0}
/* A row with nothing to switch: the icon is flat, not a button, so nothing on
   it looks pressable except the row itself (which opens the details). */
.rc-row.plain .act-icon-flat,.act-row.plain .act-icon-flat{--mdc-icon-size:17px;color:#93a3b5;flex-shrink:0;margin:0 4px}
.rc-row.alarm{--accent:var(--al)}
.rc-row.alarm>ha-icon{--mdc-icon-size:17px;color:var(--al);flex-shrink:0}
.rc-row.alarm small{color:var(--al);opacity:.85}
.rc-row.alarm.armed,.rc-row.alarm.fire{background:color-mix(in srgb,var(--al) 12%,transparent);border-color:color-mix(in srgb,var(--al) 30%,transparent)}
/* A camera in a room is shown, not described. */
.rc-cam{position:relative;display:block;width:100%;padding:0;overflow:hidden;border-radius:11px;
  border:1px solid rgba(255,255,255,.08);background:#05080d;aspect-ratio:16/9}
.rc-cam .cam-img{width:100%;height:100%;object-fit:cover;display:block}
.rc-cam .cam-off{display:grid;place-items:center;width:100%;height:100%;opacity:.3}
.rc-cam .cam-off ha-icon{--mdc-icon-size:30px}
.rc-cam .cam-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:6px;
  padding:6px 8px;background:linear-gradient(180deg,transparent,rgba(3,6,10,.85))}
.rc-cam .cam-bar ha-icon{--mdc-icon-size:13px;color:#ff3d71}
.rc-cam .cam-bar em{flex:1;min-width:0;font-style:normal;font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rc-cam:hover{border-color:color-mix(in srgb,var(--accent) 45%,transparent)}
.rc-cover{display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:9px;background:rgba(255,255,255,.03)}
.rc-cover>ha-icon{--mdc-icon-size:17px;color:#8ecae6;flex-shrink:0}
.rc-cover span{flex:1;min-width:0;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rc-cover small{font:9.5px ui-monospace,monospace;opacity:.5;flex-shrink:0}
@media(max-width:640px){.rc-strip{grid-template-columns:repeat(auto-fit,minmax(66px,1fr))}}

.tr{margin-top:12px;display:flex;flex-direction:column;gap:9px}
.tr-tabs{display:flex;gap:4px;flex-wrap:wrap}
.tr-svg{width:100%;height:auto;max-height:240px;display:block;overflow:visible}
.tr-grid{stroke:rgba(255,255,255,.07);stroke-width:1}
.tr-ylab{fill:currentColor;opacity:.35;font:9px ui-monospace,monospace;text-anchor:end}
.tr-xlab{fill:currentColor;opacity:.3;font:9px ui-monospace,monospace}
.tr-line{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;
  filter:drop-shadow(0 0 5px color-mix(in srgb,currentColor 40%,transparent))}
.tr-plot{position:relative}
.tr-svg{touch-action:pan-y}
/* Following one line among four: the one under the pointer gets thicker and
   keeps its glow, the others step back. Dimming rather than hiding, so the
   crossings you were reading are still there. */
.tr-line{transition:opacity .12s,stroke-width .12s}
.tr-line.dim{opacity:.22;filter:none}
.tr-line.focus{stroke-width:3.2}
.tr-hover{opacity:0;transition:opacity .12s;pointer-events:none}
.tr-plot.hovering .tr-hover{opacity:1}
.tr-cursor{stroke:currentColor;opacity:.35;stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}
.tr-pt{stroke:var(--card-background-color,#111a24);stroke-width:2;vector-effect:non-scaling-stroke}
.tr-read{display:flex;flex-wrap:wrap;align-items:center;gap:5px 12px;margin-top:6px;padding:7px 9px;
  border-radius:10px;background:color-mix(in srgb,var(--card-background-color) 82%,transparent);
  border:1px solid var(--divider-color)}
.tr-read-t{font:10px ui-monospace,monospace;letter-spacing:1px;opacity:.5}
.tr-read-v{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;opacity:.55}
.tr-read-v i{width:9px;height:3px;border-radius:99px;background:var(--sc);flex-shrink:0}
.tr-read-v b{font:11px ui-monospace,monospace;font-weight:700;color:var(--sc)}
.tr-read-v.on{opacity:1;font-weight:600}
.tr-leg.focus{border-color:color-mix(in srgb,var(--sc) 60%,transparent);background:color-mix(in srgb,var(--sc) 13%,transparent)}
/* Weather: the hourly curve, with its scale */
.wxc{width:100%;height:auto;display:block;max-height:150px}
.wxc-grid{stroke:rgba(255,255,255,.07);stroke-width:1}
.wxc-lab{fill:currentColor;opacity:.35;font:9px ui-monospace,monospace;text-anchor:end}
.wxc-lab.x{text-anchor:middle;opacity:.3}
.wxc-unit{fill:var(--accent);opacity:.55;font:8px ui-monospace,monospace}
.wxc-area{fill:color-mix(in srgb,var(--accent) 15%,transparent)}
.wxc-line{fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.wxc-dot{stroke:var(--card-background-color,#111a24);stroke-width:2;vector-effect:non-scaling-stroke}
.wxc-dot.hi{fill:#ff924c}
.wxc-dot.lo{fill:#4cc9f0}
.wxc-mark{font:9px ui-monospace,monospace;font-weight:700}
.wxc-mark.hi{fill:#ff924c}
.wxc-mark.lo{fill:#4cc9f0}
.wxc-plot{position:relative}
.wxc{touch-action:pan-y}
.wxc-hover{opacity:0;transition:opacity .12s;pointer-events:none}
.wxc-plot.hovering .wxc-hover{opacity:1}
.wxc-cursor{stroke:var(--accent);opacity:.5;stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}
.wxc-pt{fill:var(--accent);stroke:var(--card-background-color,#111a24);stroke-width:2;vector-effect:non-scaling-stroke}
.wxc-read{display:flex;flex-wrap:wrap;align-items:center;gap:4px 9px;margin-top:6px;padding:7px 9px;
  border-radius:10px;font-size:10.5px;background:color-mix(in srgb,var(--card-background-color) 82%,transparent);
  border:1px solid var(--divider-color)}
.wxc-read b{font:12px ui-monospace,monospace;font-weight:700;color:var(--accent)}
.wxc-read-t{font:10px ui-monospace,monospace;letter-spacing:1px;opacity:.5}
/* Giorni apribili */
.wxd-day-wrap{border-radius:11px;overflow:hidden;background:rgba(255,255,255,.03)}
.wxd-day-wrap.open{background:color-mix(in srgb,var(--accent) 8%,transparent);
  border:1px solid color-mix(in srgb,var(--accent) 26%,transparent)}
.wxd-day{width:100%;background:transparent;border:0;color:inherit;text-align:left}
.wxd-chev{--mdc-icon-size:15px;opacity:.4;flex-shrink:0}
.wxd-day-detail{padding:2px 11px 11px}
.wxd-day-cond{font:9.5px ui-monospace,monospace;letter-spacing:1px;text-transform:uppercase;opacity:.5;margin-bottom:8px}
.ovl-title{flex:1;min-width:0}
.ovl-title strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ovl-title small{display:block;margin-top:2px;font:9px ui-monospace,monospace;letter-spacing:.7px;opacity:.45;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tr-legend{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px}
.tr-leg{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;text-align:left;
  background:rgba(255,255,255,.03);border:1px solid transparent;color:var(--primary-text-color)}
.tr-leg:hover{border-color:color-mix(in srgb,var(--sc) 45%,transparent);background:color-mix(in srgb,var(--sc) 9%,transparent)}
.tr-leg i{width:11px;height:3px;border-radius:99px;background:var(--sc);flex-shrink:0;box-shadow:0 0 7px var(--sc)}
.tr-leg-name{flex:1;min-width:0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tr-leg-now{font:11.5px ui-monospace,monospace;font-weight:700;color:var(--sc)}
.tr-leg-range{font:8.5px ui-monospace,monospace;opacity:.3;white-space:nowrap}
.tr-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
.tr-color input{width:26px;height:26px;padding:0;border:0;background:none;cursor:pointer}
@media(max-width:640px){
  .tr-legend{grid-template-columns:1fr}
  .tr-leg-range{display:none}
}

.fp-wrap{display:flex;flex-direction:column;gap:10px}
.fp-devices{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:5px}
.fp-dev{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:10px;text-align:left;
  background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);color:var(--primary-text-color)}
.fp-dev:hover{border-color:color-mix(in srgb,var(--accent) 40%,transparent);background:color-mix(in srgb,var(--accent) 9%,transparent)}
.fp-dev>ha-icon{--mdc-icon-size:18px;color:#93a3b5;flex-shrink:0}
.fp-dev.on>ha-icon{color:#ffd166}
.fp-dev span{min-width:0;flex:1}
/* The row is now two controls, not one button: the icon does the opposite of
   whatever the row does, so command and details are both one tap away. */
.fp-dev-alt{display:flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;flex-shrink:0;
  border-radius:9px;border:1px solid rgba(255,255,255,.09);background:transparent;color:#93a3b5}
.fp-dev-alt ha-icon{--mdc-icon-size:18px}
.fp-dev.on .fp-dev-alt{color:#ffd166;border-color:rgba(255,209,102,.3)}
.fp-dev-alt:hover{border-color:var(--accent);color:var(--accent)}
.fp-dev-main{display:flex;align-items:center;min-width:0;flex:1;padding:0;border:0;background:transparent;
  color:inherit;text-align:left;font:inherit;letter-spacing:0}
.fp-dev strong{display:block;font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp-dev small{display:block;font:9.5px ui-monospace,monospace;letter-spacing:.5px;opacity:.5;text-transform:uppercase}

/* The map on a phone.
   The viewport was a fixed 420px-minimum box with a 9-button HUD laid over it
   and a plan scaled for a desktop panel: on a 390px screen the house fell off
   every edge and the HUD covered what was left. Everything here is about
   giving the scene the screen and keeping the controls out of its way. */
@media(max-width:700px){
  .fp-viewport{height:min(62vh,520px);min-height:300px;border-radius:16px}
  .fp-hud{left:8px;right:8px;bottom:8px;justify-content:center;padding:4px;gap:2px;border-radius:11px}
  .fp-hud-btn{padding:8px 7px}
  .fp-hud-btn ha-icon{--mdc-icon-size:16px}
  .fp-levels{right:8px;bottom:66px;flex-direction:row;padding:4px;gap:3px}
  .fp-levels .fp-hud-btn{min-width:28px;padding:6px 5px}
  /* The hint sits where the HUD now is; on a phone it is noise. */
  .fp-hint{display:none}
  .fp-focus-bar{left:8px;right:8px;top:8px;padding:7px 9px;gap:8px}
  .ffb-text strong{font-size:12px}
  .ffb-add span{display:none}
  /* Bigger grab targets: a 15px handle is not a touch target. */
  .fp-handle{width:22px;height:22px;margin:-11px 0 0 -11px}
  .fp-vertex{width:20px;height:20px;margin:-10px 0 0 -10px}
  .fp-vertex.add{width:17px;height:17px;margin:-8.5px 0 0 -8.5px}
  .fp-spot-btn{width:34px;height:34px;margin-left:-17px}
  .fp-tag{max-width:min(70vw,240px)}
  .fp-label span{max-width:34vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  /* Inside a room the names and values live in the list below the map, not on
     the pins: at this width eight labelled pins overlap into a single blob. */
  .fp-spot-tip{display:none}
  .fp-spot-btn{width:30px;height:30px;margin-left:-15px}
  .fp-spot-btn ha-icon{--mdc-icon-size:17px}
  .fp-devices{grid-template-columns:1fr}
  /* Pinch does this better than a button, and dropping the two zoom steps is
     what keeps the whole control bar on one row at 390px. */
  .fp-hud-btn.zoomable{display:none}
}
/* Every element that owns a gesture must claim it, or the page scroller wins
   and the room simply cannot be dragged with a finger. */
.fp-room.editable,.fp-handle,.fp-vertex,.fp-spot.movable{touch-action:none}
.room-entities{margin-top:8px;display:flex;flex-direction:column;gap:4px}
.room-ent{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;background:color-mix(in srgb,var(--accent) 7%,transparent);border:1px solid color-mix(in srgb,var(--accent) 18%,transparent);font-size:11.5px}
.room-ent ha-icon{--mdc-icon-size:16px;color:var(--accent);flex-shrink:0}
.room-ent span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.editor input[type=range]{padding:0;height:26px;background:transparent;border:0;accent-color:var(--accent)}

.editor-backdrop{display:none}
.editor-handle{display:none}
@media(max-width:1200px){
  .workspace.editing{grid-template-columns:minmax(0,1fr)}
  /* Below this width the editor used to flow to the bottom of the document,
     several screens under the cards: tapping CONFIGURA selected the card but
     the panel opened where nobody would ever scroll. It is a sheet now. */
  .editor-backdrop{display:block;position:fixed;inset:0;background:rgba(2,6,12,.6);backdrop-filter:blur(2px);z-index:40}
  .editor{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:41;max-height:86vh;overflow-y:auto;overscroll-behavior:contain;border-radius:22px 22px 0 0;border-bottom:0;padding:8px 16px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -24px 60px rgba(0,0,0,.6);animation:cySheet .24s cubic-bezier(.32,.72,0,1)}
  .editor-handle{display:block;width:42px;height:4px;margin:6px auto 10px;border-radius:99px;background:color-mix(in srgb,var(--accent) 45%,transparent);cursor:pointer}
  .editor-title{position:sticky;top:0;z-index:2;margin:0 -16px 4px;padding:6px 16px 12px;background:linear-gradient(180deg,var(--card-background-color) 78%,transparent)}
}
@keyframes cySheet{from{transform:translateY(100%)}to{transform:translateY(0)}}
@media(max-width:820px){.shell{padding:14px 14px 40px}.grid{grid-template-columns:repeat(6,minmax(0,1fr))}.item{grid-column:span 6!important}.top{align-items:flex-start}}
`;
  }
}

if (!customElements.get("cyborg-dashboard")) {
  customElements.define("cyborg-dashboard", CyborgDashboard);
}

/**
 * The very same component, also published as a Lovelace card.
 *
 * A custom panel and a Lovelace dashboard are different objects in Home
 * Assistant, and only a Lovelace dashboard can be chosen as the default
 * dashboard. Registering the component as a card lets the user create a normal
 * Lovelace dashboard containing this one card in panel mode and set *that* as
 * default — without maintaining a second implementation.
 */
class CyborgDashboardCard extends CyborgDashboard {
  setConfig(config) {
    this._cardConfig = config || {};
    if (Number.isInteger(this._cardConfig.page)) this._pageIndex = this._cardConfig.page;
  }
  getCardSize() { return 12; }
  static getStubConfig() { return { type: "custom:cyborg-dashboard-card" }; }
}

if (!customElements.get("cyborg-dashboard-card")) {
  customElements.define("cyborg-dashboard-card", CyborgDashboardCard);
}

// The card picker registry only exists in a browser; guard it so the module
// can also be loaded by the test harness.
/**
 * Which build is actually running.
 *
 * The module is loaded from a URL carrying ?v=<version>, so it can tell the
 * panel which build the browser really executed. That matters because a custom
 * element can only be defined once: if an older copy of this file is still in
 * the browser cache and gets loaded first — from a Lovelace resource without a
 * version in its URL, say — it wins the name, and every later copy is silently
 * ignored. The dashboard then keeps running old code while the integration
 * reports the new version, which looks exactly like "the changes were not
 * applied".
 *
 * Recording the build here lets the panel compare and say so out loud instead
 * of leaving the user to guess.
 */
/**
 * The build baked into this file, bumped with every release.
 *
 * A custom element can only be defined once per page. If an older copy of this
 * file is still in the browser cache and loads first — from a Lovelace
 * resource whose URL carries no version, say — it wins the element name and
 * every later copy is silently ignored. The dashboard then keeps running old
 * code while the integration reports the new version, which looks exactly like
 * "the changes were not applied" and gives the user nothing to go on.
 *
 * The panel compares this constant with the version the integration reports
 * and says so out loud when they disagree. A literal, not a URL parse:
 * document.currentScript is null for modules and import.meta is a syntax error
 * outside one, so neither survives both loading paths and the test harness.
 */
const CYBORG_BUILD = "0.35.0";

if (typeof window !== "undefined") {
  // First copy to load wins the element name; record which one that was.
  if (!window.__CYBORG_BUILD__) window.__CYBORG_BUILD__ = CYBORG_BUILD;
}

if (typeof window !== "undefined") {
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "cyborg-dashboard-card")) {
    window.customCards.push({
      type: "cyborg-dashboard-card",
      name: "Cyborg Dashboard",
      description: "La dashboard Cyborg completa dentro una dashboard Lovelace, così può essere impostata come predefinita.",
      preview: false,
    });
  }
}
