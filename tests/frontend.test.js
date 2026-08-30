// Harness: load the panel class with minimal shims, then exercise the real logic.
const fs = require("fs");
const path = "custom_components/cyborg_dashboard/www/cyborg-dashboard.js";
let src = fs.readFileSync(path, "utf8");

const registry = {};
global.customElements = { get: (n) => registry[n], define: (n, c) => { registry[n] = c; } };
global.HTMLElement = class { constructor(){ this._html=""; }
  set innerHTML(v){ this._html = v; } get innerHTML(){ return this._html; }
  querySelector(){ return null; } querySelectorAll(){ return []; }
  dispatchEvent(){ return true; } closest(){ return null; }
  addEventListener(){} removeEventListener(){} };
global.CustomEvent = class { constructor(t,o){ this.type=t; Object.assign(this,o); } };
global.Event = class { constructor(t){ this.type=t; } };

eval(src);
const Cls = registry["cyborg-dashboard"];
if (!Cls) { console.error("FAIL: custom element never registered"); process.exit(1); }

// ---- realistic hass mirroring Oscar's actual install -----------------------
function S(state, attrs) { return { state, attributes: attrs || {} }; }
const states = {
  "alarm_control_panel.allarme": S("disarmed", { friendly_name: "Allarme🚨" }),
  "alarm_control_panel.ezviz_alarm": S("disarmed", { friendly_name: "EZVIZ Alarm" }),
  "siren.camera_soppalco_siren": S("off", { friendly_name: "Camera Soppalco Siren" }),
  "camera.videocamera_salotto": S("idle", { friendly_name: "Videocamera salotto" }),
  "binary_sensor.sensore_porta_di_ingresso_porta": S("off", { friendly_name: "Sensore porta di ingresso", device_class: "door" }),
  "binary_sensor.videocamera_ty1_movimento": S("off", { friendly_name: "Videocamera TY1 Movimento", device_class: "motion" }),
  "sensor.asciugatrice_potenza": S("0.0", { friendly_name: " Asciugatrice  Potenza", device_class: "power", unit_of_measurement: "W" }),
  "sensor.interruttore_fem_luci_potenza_di_fase_a": S("0.316", { friendly_name: "Interruttore FEM + LUCI Potenza di fase A", device_class: "power", unit_of_measurement: "kW" }),
  "sensor.presa_friggitrice_ad_aria_potenza": S("23.4", { friendly_name: "Presa Elettrodomestici Cucina Potenza", device_class: "power", unit_of_measurement: "W" }),
  "sensor.rete_potenza_attiva_totale": S("unknown", { friendly_name: "Rete Potenza Attiva Totale", device_class: "power" }),
  "sensor.potenza_induttiva": S("unavailable", { friendly_name: "Potenza Induttiva", device_class: "power" }),
  "sensor.energia_totale": S("1234.5", { friendly_name: "Energia Totale", device_class: "energy", unit_of_measurement: "kWh" }),
  "climate.thermostat": S("heat_cool", { friendly_name: "thermostat", current_temperature: 22.4, temperature: 21 }),
  "climate.cdz_storm": S("dry", { friendly_name: "CDZ Storm", current_temperature: 26.1, temperature: 24 }),
  "weather.casa_oscar": S("partlycloudy", { friendly_name: "Casa Oscar" }),
  "sensor.t_u_bagno_temperatura": S("24.8", { friendly_name: "T&U Bagno Temperatura", device_class: "temperature", unit_of_measurement: "°C" }),
  "switch.interruttore_fem_luci_interruttore": S("on", { friendly_name: "Interruttore FEM + LUCI Interruttore" }),
  "switch.luci_scale": S("off", { friendly_name: "Luci scale Interruttore" }),
  "switch.cantinetta_socket_1": S("on", { friendly_name: "Cantinetta Socket 1" }),
  "person.oscar": S("home", { friendly_name: "Oscar " }),
  "person.lilly_bonny": S("not_home", { friendly_name: "Lilly Bonny" }),
  "device_tracker.iphone_di_oscar": S("home", { friendly_name: "iPhone di Oscar" }),
  "sensor.system_monitor_processor_temperature": S("52.1", { friendly_name: "System Monitor Processor temperature", device_class: "temperature", unit_of_measurement: "°C" }),
  "update.cyborg_dashboard_update": S("off", { friendly_name: "Cyborg Dashboard Update" }),
  "event.backup_backup_automatico": S("2026-08-22T03:29:40.495+00:00", { friendly_name: "Backup Backup automatico" }),
  "automation.esco_di_casa_allarme_on": S("on", { friendly_name: "Esco di casa --> Allarme ON" }),
};
for (let i = 0; i < 60; i++) states["sensor.rumore_" + i] = S("unavailable", { friendly_name: "Rumore " + i });

const wsCalls = [];
const hass = { states, callWS: (m) => { wsCalls.push(m); return Promise.resolve({ dashboard: null }); },
  callService: (d, s, data) => { wsCalls.push({ service: d + "." + s, data }); } };

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  -> " + extra : "")); } }

const el = new Cls();
el._hass = hass;
// const declarations do not escape a direct eval; read the build straight from
// the source so the test cannot drift from the file it is testing
const CYBORG_BUILD_TEST = (/const CYBORG_BUILD = "([^"]+)"/.exec(src) || [, ""])[1];
// const declarations do not escape a direct eval, so the group table is
// reconstructed here from the same default limits the panel ships.
const MONITOR_GROUPS_TEST = [
  { key: "voltage", label: "Tensioni", icon: "mdi:sine-wave", unit: "V",
    limits: { warnLow: 207, warnHigh: 253, alarmLow: 195, alarmHigh: 265 }, std: "EN 50160: 230 V ±10%" },
  { key: "current", label: "Correnti", icon: "mdi:current-ac", unit: "A",
    limits: { warnHigh: null, alarmHigh: null }, std: "nessuna soglia predefinita" },
  { key: "temperature", label: "Temperature", icon: "mdi:thermometer", unit: "°C",
    limits: { warnHigh: 70, alarmHigh: 85 }, std: "soglia 70 / 85 °C" },
  { key: "power_factor", label: "Fattore di potenza", icon: "mdi:angle-acute", unit: "",
    limits: { warnLow: 0.9, alarmLow: 0.8 }, std: "sotto 0,90" },
];
el._dashboard = { version: 3, revision: 0, theme: { accent: "#00e5ff" },
  pages: [{ id: "home", title: "Cyborg", icon: "mdi:hexagon-multiple-outline", sections: [] }] };

console.log("\n== 1. AUTO-COMPOSIZIONE ==");
el._autoCompose(true);
const secs = el._sections();
ok("crea sezioni", secs.length >= 5, secs.length + " sezioni");
console.log("     " + secs.map(s => s.title + "(" + s.items.length + ")").join("  "));

const allEntities = secs.flatMap(s => s.items.map(i => i.entity_id)).filter(Boolean);
ok("nessun duplicato tra sezioni", new Set(allEntities).size === allEntities.length);
ok("esclude unavailable/unknown",
  !allEntities.some(e => ["unavailable","unknown"].includes(states[e].state)),
  allEntities.filter(e => ["unavailable","unknown"].includes(states[e].state)).join(","));

const byTitle = Object.fromEntries(secs.map(s => [s.title, s]));
ok("allarme -> Sicurezza", byTitle.Sicurezza && byTitle.Sicurezza.items.some(i => i.entity_id === "alarm_control_panel.allarme"));
ok("potenza -> Energia", byTitle.Energia && byTitle.Energia.items.filter(i => i.entity_id)
  .every(i => /power|energy|current|voltage/.test(states[i.entity_id].attributes.device_class || "")));
ok("climate -> Clima", byTitle.Clima && byTitle.Clima.items.some(i => i.entity_id === "climate.thermostat"));
ok("switch 'Luci scale' -> Illuminazione", byTitle.Illuminazione && byTitle.Illuminazione.items.some(i => i.entity_id === "switch.luci_scale"));
ok("person -> Presenza", byTitle.Presenza && byTitle.Presenza.items.some(i => i.entity_id === "person.oscar"));
ok("cpu temp -> Sistema (non Clima)", byTitle.Sistema && byTitle.Sistema.items.some(i => i.entity_id === "sensor.system_monitor_processor_temperature"));
ok("climate card = tipo climate", byTitle.Clima.items.find(i=>i.entity_id==="climate.thermostat").type === "climate");
ok("power card = tipo sensor", byTitle.Energia.items.filter(i => i.entity_id)[0].type === "sensor");
ok("luce card = tipo control", byTitle.Illuminazione.items[0].type === "control");
ok("ogni card ha id univoco", new Set(secs.flatMap(s=>s.items.map(i=>i.id))).size === secs.flatMap(s=>s.items).length);
ok("ogni card ha icona", secs.every(s => s.items.every(i => i.appearance.icon && i.appearance.icon.startsWith("mdi:"))));
const energiaSec = secs.find(s => s.title === "Energia");
ok("la sezione Energia guida con il flusso energetico", energiaSec && energiaSec.items[0].type === "energyflow");
ok("il flusso non conta come entita duplicata", !allEntities.includes(""));

console.log("\n== 2. RENDERING CARD PER TIPO ==");
const sec = { id: "s1", title: "Test", icon: "mdi:x", accent: "#ff0000", items: [] };
for (const [type, entity] of [["sensor","sensor.asciugatrice_potenza"],["control","switch.luci_scale"],
    ["status","alarm_control_panel.allarme"],["climate","climate.thermostat"],
    ["gauge","sensor.t_u_bagno_temperatura"],["entity","person.oscar"],["chart","sensor.energia_totale"]]) {
  const html = el._renderCard({ id:"c", type, entity_id: entity, name:"", size:"md", appearance:{}, states:{}, actions:{} }, sec);
  ok(type + " produce markup", html.length > 80);
  ok(type + " senza [object Object]", !html.includes("[object"));
  ok(type + " senza undefined", !/>undefined</.test(html));
}
const ctrlOn = el._renderCard({id:"c",type:"control",entity_id:"switch.interruttore_fem_luci_interruttore",appearance:{},states:{},actions:{}}, sec);
ok("control ON mostra switch attivo", ctrlOn.includes('class="switch on"'));
const ctrlOff = el._renderCard({id:"c",type:"control",entity_id:"switch.luci_scale",appearance:{},states:{},actions:{}}, sec);
ok("control OFF non attivo", ctrlOff.includes('class="switch "'));
ok("chart richiede storico", wsCalls.some(c => c.type === "history/history_during_period"));

console.log("\n== 3. ICONE E ESCAPING ==");
ok("icona da device_class", el.constructor && /mdi:flash/.test(el._renderCard({id:"c",type:"sensor",entity_id:"sensor.asciugatrice_potenza",appearance:{},states:{},actions:{}}, sec)));
const xss = { id:"c", type:"sensor", entity_id:"sensor.asciugatrice_potenza", name:'<img src=x onerror=alert(1)>"', size:"md", appearance:{}, states:{}, actions:{} };
const xssHtml = el._renderCard(xss, sec);
ok("XSS nel nome neutralizzato", !xssHtml.includes("<img src=x") && xssHtml.includes("&lt;img"));

console.log("\n== 4. MUTAZIONI ==");
el._dashboard.pages[0].sections = [ {id:"a",title:"A",icon:"mdi:x",accent:null,collapsed:false,items:[{id:"i1",type:"entity",entity_id:"person.oscar",appearance:{},states:{},actions:{}}]},
                                    {id:"b",title:"B",icon:"mdi:y",accent:null,collapsed:false,items:[]} ];
el._selected = {kind:"card",sectionId:"a",itemId:"i1"};
el._reassignCard("a","i1","b");
ok("sposta card tra sezioni", el._section("a").items.length===0 && el._section("b").items.length===1);
ok("selezione segue la card", el._selected.sectionId === "b");
el._moveSection("b",-1);
ok("riordina sezioni", el._sections()[0].id === "b");
el._addSection({title:"Nuova",icon:"mdi:z",accent:"#fff"});
ok("aggiunge sezione", el._sections().length === 3);
el._removeSection("a");
ok("elimina sezione", !el._section("a"));
el._addCard("b");
ok("aggiunge card", el._section("b").items.length === 2);
el._set(el._card("b", el._selected.itemId), "appearance.accent", "#123456");
ok("_set su path annidato", el._card("b", el._selected.itemId).appearance.accent === "#123456");

console.log("\n== 5. SIGNATURE (anti re-render) ==");
el._autoCompose(true);
const s1 = el._buildSignature();
const s2 = el._buildSignature();
ok("signature stabile", s1 === s2);
states["person.oscar"].state = "not_home";
ok("signature cambia se cambia un'entità usata", el._buildSignature() !== s1);
states["sensor.rumore_5"].state = "99";
const s3 = el._buildSignature();
states["sensor.rumore_5"].state = "98";
ok("signature ignora entità non usate", el._buildSignature() === s3);

console.log("\n== 6. RENDER COMPLETO ==");
el._editing = false; el._selected = null;
el.render();
const out = el.innerHTML;
ok("render produce html", out.length > 4000, out.length + " char");
ok("contiene le sezioni", ["Sicurezza","Energia","Clima"].every(t => out.includes(t)));
ok("nessun undefined nel markup", !/>undefined</.test(out) && !out.includes("undefined%"));
ok("nessun [object Object]", !out.includes("[object"));
ok("tag bilanciati (section)", (out.match(/<section/g)||[]).length === (out.match(/<\/section>/g)||[]).length);
ok("tag bilanciati (article)", (out.match(/<article/g)||[]).length === (out.match(/<\/article>/g)||[]).length);
ok("tag bilanciati (div)", (out.match(/<div/g)||[]).length === (out.match(/<\/div>/g)||[]).length);
el._editing = true; el._selected = null;
el.render();
ok("editor pagina renderizza", el.innerHTML.includes("COMPOSIZIONE AUTOMATICA"));
el._selected = {kind:"section", sectionId: el._sections()[0].id};
el.render();
ok("editor sezione renderizza", el.innerHTML.includes("ELIMINA SEZIONE"));
el._selected = {kind:"card", sectionId: el._sections()[0].id, itemId: el._sections()[0].items[0].id};
el.render();
ok("editor card renderizza", el.innerHTML.includes("ELIMINA CARD") && el.innerHTML.includes("AZIONE AL TOCCO"));
ok("editor card ha selettore sezione", el.innerHTML.includes("data-move-section"));
ok("editor card ha tutti i tipi", ["climate","gauge","chart"].every(t=>el.innerHTML.includes('value="'+t+'"')));
const div2 = el.innerHTML;
ok("editor: div bilanciati", (div2.match(/<div/g)||[]).length === (div2.match(/<\/div>/g)||[]).length);

console.log("\n== 7. RICERCA ENTITÀ ==");
el._entityQuery = "potenza";
const res = el._entityResults();
ok("ricerca trova risultati", res.includes("data-pick-entity"));
ok("ricerca mostra entity_id", res.includes("sensor.asciugatrice_potenza"));
el._entityQuery = "zzzznon esiste";
ok("nessun risultato gestito", el._entityResults().includes("Nessun risultato"));
el._entityQuery = "";
ok("query vuota gestita", el._entityResults().includes("Digita almeno"));

console.log("\n== 8. TAP ACTIONS ==");
wsCalls.length = 0;
const tapSec = el._sections()[0];
el._dashboard.pages[0].sections[0].items[0].actions = {tap:{action:"toggle"}};
el._dashboard.pages[0].sections[0].items[0].entity_id = "switch.luci_scale";
el._tap(tapSec.id, tapSec.items[0].id);
ok("toggle chiama switch.toggle", wsCalls.some(c => c.service === "switch.toggle"), JSON.stringify(wsCalls));

console.log("\n== 9. SPARKLINE ==");
const sp = sparkline([1,5,3,9,2], 200, 50);
ok("sparkline produce svg", sp.includes("<svg") && sp.includes("spark-line"));
ok("sparkline path valido", /d="M0\.0,[\d.]+ L[\d.]+,[\d.]+/.test(sp), sp.match(/d="[^"]{0,60}/));
ok("sparkline valori costanti non crasha", sparkline([5,5,5],200,50).includes("<svg"));
ok("sparkline 1 punto -> vuoto", sparkline([5],200,50) === "");

console.log("\n== 10. MAPPA 3D ==");
el._dashboard = { version: 4, revision: 0, theme: { accent: "#00e5ff" }, pages: [
  { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] },
  { id: "map", type: "floorplan", title: "Mappa 3D", icon: "mdi:floor-plan",
    view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true, show_labels: true },
    rooms: [] }]};
el._pageIndex = 1; el._selected = null; el._editing = false;
ok("pagina floorplan riconosciuta", el._isFloorplan());
el._registry = { areas: [
  { area_id: "soggiorno", name: "Soggiorno", icon: null },
  { area_id: "bagno", name: "Bagno", icon: "mdi:toilet" },
  { area_id: "camera_da_letto", name: "Camera da letto", icon: null }],
  byArea: {
    soggiorno: ["light.soggiorno", "climate.cdz_storm", "sensor.soggiorno_temp", "switch.interruttore_fem_luci_interruttore", "sensor.asciugatrice_potenza", "automation.esco_di_casa_allarme_on", "sensor.rumore_1"],
    bagno: ["sensor.t_u_bagno_temperatura"],
    camera_da_letto: [] } };
states["light.soggiorno"] = S("on", { friendly_name: "Luce Soggiorno" });
states["sensor.soggiorno_temp"] = S("26.3", { friendly_name: "Temp Soggiorno", device_class: "temperature", unit_of_measurement: "\u00b0C" });

el._autoRooms();
const rooms = el._rooms();
ok("una stanza per area", rooms.length === 3, String(rooms.length));
ok("stanze non sovrapposte", (() => {
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false;
  } return true; })());
ok("icona dedotta dal nome area", rooms[0].icon === "mdi:sofa", rooms[0].icon);
ok("icona dell'area HA ha precedenza", rooms[1].icon === "mdi:toilet", rooms[1].icon);
ok("colori distinti", new Set(rooms.map(r => r.color)).size === 3);
ok("area collegata", rooms[0].area_id === "soggiorno");

const ents = el._roomEntities(rooms[0]);
const MAXB = parseInt(/MAX_BADGES_PER_ROOM\s*=\s*(\d+)/.exec(src)[1], 10);
ok("badge limitati a " + MAXB, ents.length <= MAXB && ents.length > 0, String(ents.length));
ok("automation esclusa dai badge", !ents.includes("automation.esco_di_casa_allarme_on"));
ok("unavailable escluso dai badge", !ents.includes("sensor.rumore_1"));
ok("climate ha priorita massima", ents[0] === "climate.cdz_storm", ents.join(","));
ok("stanza senza entita -> lista vuota", el._roomEntities(rooms[2]).length === 0);
rooms[0].entities = ["light.soggiorno"];
ok("override manuale rispettato", el._roomEntities(rooms[0]).join() === "light.soggiorno");
rooms[0].entities = null;

const bm = el._badgeMarkup("light.soggiorno", rooms[0]);
ok("badge ON evidenziato", bm.includes('class="fp-badge on"'), bm.slice(0, 60));
ok("badge senza undefined", !bm.includes("undefined"));
ok("badge sensore con unita", el._badgeMarkup("sensor.soggiorno_temp", rooms[0]).includes("26.3 \u00b0C"));

el.render();
const fp = el.innerHTML;
ok("render 3D contiene le stanze", (fp.match(/class="fp-room/g) || []).length === 3);
ok("render 3D contiene 4 muri per stanza", (fp.match(/class="fp-wall/g) || []).length === 12);
ok("controrotazione anti-camera sulle targhette", fp.includes("rotateZ(calc(var(--yaw) * -1))"));
ok("tab pagine presenti", fp.includes("data-page-tab"));
ok("div bilanciati (3D)", (fp.match(/<div/g) || []).length === (fp.match(/<\/div>/g) || []).length);
ok("nessun undefined nel markup 3D", !/>undefined</.test(fp));

el._page().view.show_walls = false;
el.render();
ok("toggle muri rimuove i muri", !el.innerHTML.includes('class="fp-wall'));
el._page().view.show_walls = true;

el._editing = true; el._selected = { kind: "room", roomId: rooms[0].id };
el.render();
ok("editor stanza renderizza", el.innerHTML.includes("ELIMINA STANZA") && el.innerHTML.includes("AREA HOME ASSISTANT"));
ok("editor elenca le aree HA", el.innerHTML.includes('value="camera_da_letto"'));
el._selected = null; el.render();
ok("editor pagina mappa renderizza", el.innerHTML.includes("RIGENERA DALLE AREE") && el.innerHTML.includes("CAMERA"));

// un-projection must invert the world transform, otherwise dragging drifts
const cases = [[32, 56, 1], [0, 0, 1], [212, 30, 1.7], [90, 75, 0.6]];
let unprojOK = true;
for (const [yaw, pitch, zoom] of cases) {
  for (const [wx, wy] of [[100, 0], [0, 100], [-40, 70]]) {
    const y = yaw * Math.PI / 180, cP = Math.cos(pitch * Math.PI / 180);
    const sx = zoom * (Math.cos(y) * wx - Math.sin(y) * wy);
    const sy = zoom * (cP * Math.sin(y) * wx + cP * Math.cos(y) * wy);
    const back = unprojectDelta(sx, sy, yaw, pitch, zoom);
    if (Math.abs(back.dx - wx) > 0.01 || Math.abs(back.dy - wy) > 0.01) unprojOK = false;
  }
}
ok("unprojectDelta inverte esattamente la trasformazione", unprojOK);

wsCalls.length = 0;
el._badgeTap("light.soggiorno");
ok("tap badge luce -> light.toggle", wsCalls.some(c => c.service === "light.toggle"), JSON.stringify(wsCalls));
wsCalls.length = 0;
el._badgeTap("sensor.soggiorno_temp");
ok("tap badge sensore non chiama servizi", wsCalls.length === 0);

el._pageIndex = 0; el._editing = false; el._selected = null;
el.render();
ok("ritorno alla pagina sezioni", !el.innerHTML.includes(String.fromCharCode(34) + "fp-viewport"));

console.log("\n== 10b. WIZARD MAPPA 3D ==");
el._dashboard = { version: 4, revision: 0, theme: { accent: "#00e5ff" }, pages: [
  { id: "map", type: "floorplan", title: "Mappa 3D", icon: "mdi:floor-plan",
    view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true, show_labels: true },
    rooms: [] }]};
el._pageIndex = 0; el._editing = true; el._selected = null; el._mapWizard = null;
el._registry = { areas: [
  { area_id: "soggiorno", name: "Soggiorno", icon: null },
  { area_id: "bagno", name: "Bagno", icon: "mdi:toilet" },
  { area_id: "camera_da_letto", name: "Camera da letto", icon: null }],
  byArea: {
    soggiorno: ["light.soggiorno", "climate.cdz_storm", "sensor.soggiorno_temp"],
    bagno: ["sensor.t_u_bagno_temperatura"],
    camera_da_letto: [] } };

el.render();
ok("mappa vuota offre la procedura guidata", el.innerHTML.includes("data-mw-start"));

el._startMapWizard();
ok("wizard mappa: una voce per area HA", el._mapWizard.rooms.length === 3, String(el._mapWizard.rooms.length));
ok("wizard mappa: tutte selezionate all'inizio", el._mapWizardRooms().length === 3);
el.render();
ok("passo 1 chiede quante stanze", el.innerHTML.includes("Quante stanze"));
ok("passo 1 elenca le aree", el.innerHTML.includes("Soggiorno") && el.innerHTML.includes("Bagno"));
ok("passo 1 permette di aggiungerne a mano", el.innerHTML.includes("data-mw-addroom"));
ok("progressione: 3 stanze + 2 = 5 passi", el.innerHTML.includes("PASSO 1 DI 5"), "atteso 5");

// deselecting a room must shorten the wizard
el._mapWizard.rooms[1].on = false;
el.render();
ok("deselezionare una stanza accorcia la procedura", el.innerHTML.includes("PASSO 1 DI 4"));
el._mapWizard.rooms[1].on = true;

// a room typed by hand, for homes with no areas configured
el._mapWizard.newRoom = "Taverna";
el._mapWizard.rooms.push({ area_id: null, title: "Taverna", icon: roomIconFor("Taverna"),
  color: "#fff", on: true, entities: [] });
ok("stanza manuale accettata", el._mapWizardRooms().length === 4);
ok("icona dedotta dal nome della stanza manuale", roomIconFor("Taverna") === "mdi:stairs-down", roomIconFor("Taverna"));

el._mapWizard.step = 1;
el.render();
ok("passo stanza chiede cosa c'e' dentro", el.innerHTML.includes("Cosa c'\u00e8 in Soggiorno"));
ok("stanza con area: automatico proposto", el.innerHTML.includes("data-mw-auto"));
ok("automatico elenca le entita' dell'area", el.innerHTML.includes("light.soggiorno"));

// the hand-made room has no area, so entities must be pickable
el._mapWizard.step = 4;
el.render();
ok("stanza manuale: scelta entita' a mano", el.innerHTML.includes("data-mw-ent"));
ok("stanza manuale: nessun automatico", !el.innerHTML.includes("data-mw-auto"));

el._mapWizard.step = 5;
el.render();
ok("ultimo passo riepiloga", el.innerHTML.includes("Tutto pronto"));
ok("ultimo passo conclude", el.innerHTML.includes("CREA LA MAPPA"));

el._mapWizard.rooms = el._mapWizard.rooms.slice(0, 3);
el._mapWizard.step = 4;
let saved = null;
el._hass.callWS = async (m) => { if (m.type === "cyborg_dashboard/save") { saved = m.dashboard; return { saved: true, revision: 1 }; } return {}; };
el._finishMapWizard();
const mr = el._rooms();
ok("fine wizard: una stanza per selezione", mr.length === 3, String(mr.length));
ok("fine wizard: stanze non sovrapposte", (() => {
  for (let i = 0; i < mr.length; i++) for (let j = i + 1; j < mr.length; j++) {
    const a = mr[i], b = mr[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false;
  } return true; })());
ok("fine wizard: area collegata", mr[0].area_id === "soggiorno");
ok("fine wizard: entita' automatiche (null, non lista vuota)", mr[0].entities === null);
ok("fine wizard: icona area rispettata", mr[1].icon === "mdi:toilet");
ok("fine wizard: il wizard si chiude", el._mapWizard === null);
// restore a sections-type dashboard: the following sections exercise the card
// editor, which is only reachable when the current page is not a floorplan
el._dashboard = { version: 4, revision: 0, theme: { accent: "#00e5ff" },
  pages: [{ id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }] };
el._pageIndex = 0; el._editing = false; el._selected = null; el._mapWizard = null;
ok("stato di test ripristinato su pagina a sezioni", !el._isFloorplan());

console.log("\n== 11. FLUSSO ENERGETICO ==");
el._pageIndex = 0; el._editing = false; el._selected = null;
states["sensor.pv"]   = S("2840", { friendly_name: "Fotovoltaico", device_class: "power", unit_of_measurement: "W" });
states["sensor.rete"] = S("-1120",{ friendly_name: "Rete", device_class: "power", unit_of_measurement: "W" });
states["sensor.batt"] = S("-450", { friendly_name: "Batteria", device_class: "power", unit_of_measurement: "W" });
states["sensor.lav"]  = S("820",  { friendly_name: "Lavatrice", device_class: "power", unit_of_measurement: "W" });

let v = el._flowValues({ solar: "sensor.pv", grid: "sensor.rete", battery: "sensor.batt" });
ok("solare letto", v.solar === 2840);
ok("rete negativa = immissione", v.gridOut === 1120 && v.gridIn === 0);
ok("batteria negativa = in carica", v.battIn === 450 && v.battOut === 0);
ok("casa calcolata = 2840-1120-450", v.home === 1270, String(v.home));

v = el._flowValues({ solar: "sensor.pv", grid: "sensor.rete", battery: "sensor.batt", invert_grid: true, invert_battery: true });
ok("invert rete -> prelievo", v.gridIn === 1120 && v.gridOut === 0);
ok("invert batteria -> scarica", v.battOut === 450);
ok("casa con segni invertiti = 2840+1120+450", v.home === 4410, String(v.home));

v = el._flowValues({ solar: "sensor.pv", grid: "sensor.rete", home: "sensor.lav" });
ok("sensore casa esplicito ha precedenza", v.home === 820, String(v.home));
v = el._flowValues({ grid: "sensor.non_esiste" });
ok("entita mancante non rompe il calcolo", v.home === 0 && v.grid === null);
v = el._flowValues({});
ok("configurazione vuota -> casa 0", v.home === 0);

ok("fmtPower W sotto 1000", fmtPower(760).u === "W" && fmtPower(760).v === "760");
ok("fmtPower kW sopra 1000", fmtPower(2840).u === "kW" && fmtPower(2840).v === "2.84");
ok("fmtPower null -> trattino", fmtPower(null).v === "\u2014");
ok("fmtPower negativo usa il valore assoluto per la scala", fmtPower(-1120).v === "-1.12");

const flowCard = { id: "f", type: "energyflow", entity_id: "", name: "", size: "lg",
  appearance: {}, states: {}, actions: {},
  flow: { solar: "sensor.pv", grid: "sensor.rete", battery: "sensor.batt",
          devices: [{ entity: "sensor.lav", name: "Lavatrice" }] } };
const fsec = { id: "s", title: "Energia", icon: "mdi:flash", accent: "#ffd166", items: [flowCard] };
const fhtml = el._renderCard(flowCard, fsec);
ok("4 nodi disegnati", (fhtml.match(/class="ef-n /g) || []).length === 4, String((fhtml.match(/class="ef-n /g) || []).length));
ok("i nodi hanno icone vere (traliccio, casa)", fhtml.includes("mdi:transmission-tower") && fhtml.includes('icon="mdi:home"'));
ok("dimensione dei nodi proporzionale alla potenza", (() => {
  // Il raggio non e' piu' in pixel fissi ma in frazione del riquadro (cqw):
  // e' quella la misura che scala col disegno, ed e' quella da leggere.
  const rs = [...fhtml.matchAll(/--r:max\([\d.]+px, ([\d.]+)cqw\)/g)].map(m => +m[1]);
  return rs.length === 4 && new Set(rs).size > 1;
})(), fhtml.match(/--r:\d+px/g) + "");
ok("3 percorsi attivi", (fhtml.match(/class="ef-path active"/g) || []).length === 3);
ok("particelle animate", fhtml.includes("animateMotion") && fhtml.includes("<mpath"));
ok("immissione etichettata", fhtml.includes("immissione"));
ok("batteria in carica etichettata", fhtml.includes("in carica"));
ok("carico elencato con quota", fhtml.includes("ef-dev-bar") && fhtml.includes("Lavatrice"));
ok("nessun tap sull'intero diagramma", !fhtml.includes("data-tap"));
ok("flow: nessun undefined", !/>undefined</.test(fhtml) && !fhtml.includes("[object"));
ok("flow: div bilanciati", (fhtml.match(/<div/g) || []).length === (fhtml.match(/<\/div>/g) || []).length);

const empty = el._renderCard({ id: "e", type: "energyflow", entity_id: "", appearance: {}, states: {}, actions: {}, flow: {} }, fsec);
ok("flow non configurato -> messaggio, non card rotta", empty.includes("non configurato") && !empty.includes("missing"));

el._editing = true;
el._dashboard.pages[0].sections = [fsec];
el._selected = { kind: "card", sectionId: "s", itemId: "f" };
el.render();
// quattro sorgenti (solare, rete, batteria, casa) piu' il contatore generale
ok("editor flusso: 5 slot", (el.innerHTML.match(/class="flow-slot-head"/g) || []).length === 5,
   String((el.innerHTML.match(/class="flow-slot-head"/g) || []).length));
ok("editor flusso: si puo' dichiarare il contatore generale",
   el.innerHTML.includes('data-flow-pick="main"') && /CONTATORE GENERALE/.test(el.innerHTML));
ok("editor flusso: rilevamento automatico", el.innerHTML.includes("data-detect-flow"));
ok("editor flusso: inverti segno", el.innerHTML.includes("data-flow-invert"));
ok("editor flusso: nessun picker entita singola", !el.innerHTML.includes("ENTIT\u00c0 SELEZIONATA"));
el._editing = false; el._selected = null;

console.log("\n== 11a. UNITA DI MISURA ==");
ok("W restano W", powerWatts(S("246", { unit_of_measurement: "W" })) === 246);
ok("kW convertiti in W", powerWatts(S("0.2", { unit_of_measurement: "kW" })) === 200);
ok("kW maiuscolo/minuscolo", powerWatts(S("1.5", { unit_of_measurement: "kw" })) === 1500);
ok("MW convertiti", powerWatts(S("1", { unit_of_measurement: "MW" })) === 1e6);
ok("senza unita si assume W", powerWatts(S("42", {})) === 42);
ok("unita sconosciuta non moltiplica", powerWatts(S("7", { unit_of_measurement: "pippo" })) === 7);
ok("stato non numerico -> null", powerWatts(S("unavailable", { unit_of_measurement: "kW" })) === null);
ok("entita assente -> null", powerWatts(null) === null);

// the exact failure from the field: house in kW, loads in W
states["sensor.casa_kw"] = S("0.2", { friendly_name: "Casa", device_class: "power", unit_of_measurement: "kW" });
states["sensor.lav_w"]   = S("246", { friendly_name: "Lavatrice", device_class: "power", unit_of_measurement: "W" });
states["sensor.fri_w"]   = S("24.8", { friendly_name: "Friggitrice", device_class: "power", unit_of_measurement: "W" });
const mixed = { home: "sensor.casa_kw", devices: [
  { entity: "sensor.lav_w", name: "Lavatrice" }, { entity: "sensor.fri_w", name: "Friggitrice" }] };
const mv = el._flowValues(mixed);
ok("casa in kW letta come 200 W, non 0.2", mv.home === 200, String(mv.home));
const ml = el._flowLoads(mixed, mv.home);
ok("carichi in W sommati correttamente", Math.round(ml.reduce((t, l) => t + l.watts, 0)) === 271, JSON.stringify(ml.map(l => l.watts)));
ok("nessun nodo 'non misurato' se i carichi superano la casa", !ml.some(l => l.other));

console.log("\n== 11b. SOTTO-ALBERO DEI CARICHI ==");
states["sensor.lav"]  = S("820", { friendly_name: "Lavatrice", device_class: "power", unit_of_measurement: "W" });
states["sensor.asc"]  = S("310", { friendly_name: "Asciugatrice", device_class: "power", unit_of_measurement: "W" });
states["sensor.nas"]  = S("64",  { friendly_name: "NAS", device_class: "power", unit_of_measurement: "W" });
states["sensor.zero"] = S("0",   { friendly_name: "Spento", device_class: "power", unit_of_measurement: "W" });
const treeFlow = { solar: "sensor.pv", grid: "sensor.rete", battery: "sensor.batt",
  devices: [{ entity: "sensor.nas", name: "NAS" }, { entity: "sensor.lav", name: "Lavatrice" },
            { entity: "sensor.asc", name: "Asciugatrice" }, { entity: "sensor.zero", name: "Spento" }] };
const treeCard = { id: "tree", type: "energyflow", entity_id: "", name: "", size: "lg",
  appearance: {}, states: {}, actions: {}, flow: treeFlow };
const tsec = { id: "ts", title: "Energia", icon: "mdi:flash", accent: "#ffd166", items: [treeCard] };

let loads = el._flowLoads(treeFlow, 1270);
ok("carichi ordinati dal piu' assorbente", loads.map(l => l.name).slice(0, 3).join() === "Lavatrice,Asciugatrice,NAS", loads.map(l => l.name).join());
ok("carico a 0 W escluso", !loads.some(l => l.name === "Spento"));
ok("resto non misurato calcolato", loads[3] && loads[3].other && loads[3].watts === 76, JSON.stringify(loads[3]));
ok("somma carichi + resto = casa", Math.round(loads.reduce((t, l) => t + l.watts, 0)) === 1270);

// remainder below the noise floor must not become a phantom load
loads = el._flowLoads(treeFlow, 1194 + 10);
ok("resto sotto soglia non mostrato", !loads.some(l => l.other), JSON.stringify(loads.map(l => l.name)));
loads = el._flowLoads({ devices: [] }, 900);
ok("nessun carico configurato -> nessun nodo", loads.length === 0);

el._flowOpen = {};
let treeClosed = el._renderCard(treeCard, tsec);
ok("chiuso: nessuna foglia", !treeClosed.includes("ef-leaf"));
ok("chiuso: elenco piatto visibile", treeClosed.includes("ef-dev-bar"));
ok("chiuso: invito con il numero di carichi", treeClosed.includes("4 carichi"), "atteso 4 (3 attivi + non misurato)");
ok("chiuso: nodo casa cliccabile", treeClosed.includes('data-flow-toggle="tree"'));

el._flowOpen.tree = true;
const treeOpened = el._renderCard(treeCard, tsec);
ok("aperto: una foglia per carico", (treeOpened.match(/class="ef-n leaf/g) || []).length === 4, String((treeOpened.match(/class="ef-n leaf/g) || []).length));
ok("aperto: nodo non misurato distinto", treeOpened.includes("ef-n leaf other"));
ok("aperto: nessuna percentuale (la dimensione dice la proporzione)", !/\d+%<\/span>/.test(treeOpened) && !treeOpened.includes("ef-leaf-share"));
ok("aperto: la foglia piu' grossa ha il raggio maggiore", (() => {
  const blocks = treeOpened.split('class="ef-n leaf').slice(1);
  const lav = blocks.find(b => b.includes("Lavatrice")), nas = blocks.find(b => b.includes("NAS"));
  const r = (b) => +(/--r:max\([\d.]+px, ([\d.]+)cqw\)/.exec(b) || [])[1];
  return lav && nas && r(lav) > r(nas);
})());
ok("aperto: elenco piatto nascosto (niente doppioni)", !treeOpened.includes("ef-dev-bar"));
ok("aperto: viewBox esteso", /viewBox="0 0 600 566"/.test(treeOpened), (treeOpened.match(/viewBox="[^"]+"/) || [])[0]);
ok("aperto: i dischi sono in frazione del riquadro, non in pixel",
   /--r:max\([\d.]+px, [\d.]+cqw\)/.test(treeOpened) && !/--r:\d+px/.test(treeOpened),
   (treeOpened.match(/--r:[^;]*/) || [])[0]);
ok("aperto: l'altezza del riquadro e' dichiarata come variabile, non inline",
   treeOpened.includes('style="--vb:566"') && !treeOpened.includes("aspect-ratio:600/566"),
   (treeOpened.match(/class="ef-stage"[^>]*/) || [])[0]);
ok("aperto: le foglie reali sono cliccabili", treeOpened.includes('data-fp-badge="sensor.lav"'));
ok("aperto: il nodo non misurato non e' cliccabile", !/ef-leaf other[^>]*data-fp-badge/.test(treeOpened));
ok("aperto: nessun undefined", !/>undefined</.test(treeOpened) && !treeOpened.includes("[object"));

// the sub-tree must react to a load changing, not freeze until something else does
el._dashboard.pages[0].sections = [tsec];
el._pageIndex = 0;
const sigA = el._buildSignature();
states["sensor.lav"] = S("120", { friendly_name: "Lavatrice", device_class: "power", unit_of_measurement: "W" });
ok("la firma segue i carichi del flusso", el._buildSignature() !== sigA);
states["sensor.lav"] = S("820", { friendly_name: "Lavatrice", device_class: "power", unit_of_measurement: "W" });

// expansion is runtime state: clicking must never dirty the saved dashboard
const before = JSON.stringify(el._dashboard);
el._flowOpen.tree = false; el._flowOpen.tree = true;
ok("l'apertura non sporca la configurazione salvata", JSON.stringify(el._dashboard) === before);
el._flowOpen = {};

console.log("\n== 11c. GERARCHIA E WIZARD ==");
states["sensor.quadro"] = S("1000", { friendly_name: "Quadro cucina", device_class: "power", unit_of_measurement: "W" });
states["sensor.forno"]  = S("600",  { friendly_name: "Forno", device_class: "power", unit_of_measurement: "W" });
states["sensor.piano"]  = S("300",  { friendly_name: "Piano induzione", device_class: "power", unit_of_measurement: "W" });
const hFlow = { grid: "sensor.rete", devices: [
  { entity: "sensor.quadro", name: "Quadro cucina" },
  { entity: "sensor.forno",  name: "Forno", parent: "sensor.quadro" },
  { entity: "sensor.piano",  name: "Piano induzione", parent: "sensor.quadro" }] };
let hl = el._flowLoads(hFlow, 1270);
ok("solo i carichi radice al primo livello", hl.filter(l => !l.other).length === 1, JSON.stringify(hl.map(l => l.name)));
ok("i figli sono appesi al genitore", hl[0].children.length === 2);
ok("figli ordinati per assorbimento", hl[0].children.map(c => c.name).join() === "Forno,Piano induzione");
ok("i figli NON gonfiano il misurato (non misurato = 1270-1000)",
   hl.find(l => l.other) && hl.find(l => l.other).watts === 270,
   JSON.stringify(hl.map(l => [l.name, l.watts])));

// --- il contatore generale: una dichiarazione invece di venti
//
// Il difetto: chi ha un interruttore generale misurato vedeva il generale e la
// lavatrice come due rami paralleli della casa — un impianto che non esiste —
// finche' non dichiarava a mano, carico per carico, "questo sta sotto quello".
states["sensor.generale"] = S("2180", { friendly_name: "Interruttore generale",
  device_class: "power", unit_of_measurement: "W" });
states["sensor.lavatrice_w"] = S("2010", { friendly_name: "Lavatrice",
  device_class: "power", unit_of_measurement: "W" });
{
  const flat = { devices: [
    { entity: "sensor.generale", name: "Generale" },
    { entity: "sensor.lavatrice_w", name: "Lavatrice" }] };
  const before = el._flowLoads(flat, 2180);
  ok("senza generale dichiarato restano due rami affiancati",
     before.filter((l) => !l.other).length === 2,
     JSON.stringify(before.map((l) => l.name)));

  const withMain = Object.assign({ main: "sensor.generale" }, flat);
  const after = el._flowLoads(withMain, 2180);
  const roots = after.filter((l) => !l.other);
  ok("dichiarato il generale, resta un ramo solo",
     roots.length === 1 && roots[0].entity === "sensor.generale",
     JSON.stringify(after.map((l) => l.name)));
  ok("e la lavatrice ci sta sotto",
     roots[0].children.some((c) => c.entity === "sensor.lavatrice_w"),
     JSON.stringify(roots[0].children.map((c) => c.name)));
  ok("il generale non diventa figlio di se stesso",
     roots[0].parent === null || roots[0].parent === undefined, String(roots[0].parent));
  ok("quello che il generale legge e i figli non spiegano viene detto",
     roots[0].children.some((c) => c.other && Math.abs(c.watts - 170) < 1),
     JSON.stringify(roots[0].children.map((c) => [c.name, c.watts])));

  // Una parentela gia' dichiarata vince: il generale risponde solo per chi
  // non ha ancora una risposta.
  const nested = { main: "sensor.generale", devices: [
    { entity: "sensor.generale", name: "Generale" },
    { entity: "sensor.quadro", name: "Quadro cucina" },
    { entity: "sensor.forno", name: "Forno", parent: "sensor.quadro" }] };
  const nl = el._flowLoads(nested, 2180)[0];
  ok("il forno resta sotto il quadro, non sotto il generale",
     nl.children.some((c) => c.entity === "sensor.quadro"
       && c.children.some((g) => g.entity === "sensor.forno")),
     JSON.stringify(nl.children.map((c) => [c.name, c.children.map((g) => g.name)])));

  // Il generale non deve essere per forza fra i carichi elencati: e' il tronco.
  const implied = { main: "sensor.generale", devices: [
    { entity: "sensor.lavatrice_w", name: "Lavatrice" }] };
  const il = el._flowLoads(implied, 2180).filter((l) => !l.other);
  ok("il generale compare anche se non e' fra i carichi elencati",
     il.length === 1 && il[0].entity === "sensor.generale",
     JSON.stringify(il.map((l) => l.name)));

  // Un generale che non esiste, o senza lettura di potenza, non deve
  // inghiottire i carichi in un ramo invisibile.
  const bogus = { main: "sensor.non_esiste", devices: [
    { entity: "sensor.lavatrice_w", name: "Lavatrice" }] };
  ok("un generale inesistente lascia i carichi dove sono",
     el._flowLoads(bogus, 2180).filter((l) => !l.other).length === 1
     && el._flowLoads(bogus, 2180)[0].entity === "sensor.lavatrice_w");
}
delete states["sensor.generale"]; delete states["sensor.lavatrice_w"];

// a parent that is not itself a monitored load must not swallow its child
const orphan = { devices: [{ entity: "sensor.forno", name: "Forno", parent: "sensor.inesistente" }] };
ok("genitore inesistente -> il figlio resta radice", el._flowLoads(orphan, 900).filter(l => !l.other).length === 1);

const hCard = { id: "h", type: "energyflow", entity_id: "", appearance: {}, states: {}, actions: {}, flow: hFlow };
const hSec = { id: "hs", title: "E", icon: "mdi:flash", accent: "#ffd166", items: [hCard] };
el._flowOpen = { h: true };
const hHtml = el._renderCard(hCard, hSec);
ok("albero a due livelli renderizzato", (hHtml.match(/class="ef-n leaf child/g) || []).length === 2, String((hHtml.match(/class="ef-n leaf child/g) || []).length));
ok("viewBox esteso per il secondo livello", /viewBox="0 0 600 706"/.test(hHtml), (hHtml.match(/viewBox="[^"]+"/) || [])[0]);
ok("il figlio maggiore e' disegnato piu' grande", (() => {
  const b = hHtml.split('class="ef-n leaf child').slice(1);
  const r = (x) => +(/--r:max\([\d.]+px, ([\d.]+)cqw\)/.exec(x) || [])[1];
  const forno = b.find(x => x.includes("Forno")), piano = b.find(x => x.includes("Piano"));
  return forno && piano && r(forno) > r(piano);
})());
el._flowOpen = {};

// wizard
el._editing = true;
el._dashboard.pages[0].sections = [hSec];
el._selected = { kind: "card", sectionId: "hs", itemId: "h" };
el._wizard = null;
el.render();
ok("editor flusso offre la procedura guidata", el.innerHTML.includes("data-wiz-start"));
el._wizard = { cardId: "h", step: 0 };
el.render();
ok("wizard passo 1: fotovoltaico", el.innerHTML.includes("produzione fotovoltaica") || el.innerHTML.includes("fotovoltaico"));
ok("wizard mostra solo sensori di potenza", !el.innerHTML.includes("light.soggiorno"));
ok("wizard evidenzia i suggeriti", el.innerHTML.includes("consigliato"));
ok("wizard ha barra di avanzamento", el.innerHTML.includes("wiz-bar"));
ok("wizard: 6 passi", (el.innerHTML.match(/PASSO 1 DI 6/)) !== null, "atteso 4 slot + carichi + gerarchia");
ok("wizard: si puo saltare", el.innerHTML.includes("data-wiz-skip"));
ok("wizard: uscita verso avanzata", el.innerHTML.includes("data-wiz-exit"));
el._wizard = { cardId: "h", step: 4 };
el.render();
ok("wizard passo carichi: selezione multipla", el.innerHTML.includes("data-wiz-load"));
el._wizard = { cardId: "h", step: 5 };
el.render();
ok("wizard passo gerarchia: menu genitore", el.innerHTML.includes("data-wiz-parent"));
ok("wizard gerarchia elenca i carichi scelti", el.innerHTML.includes("Quadro cucina"));
ok("wizard ultimo passo mostra FINE", el.innerHTML.includes("FINE"));
el._wizard = null; el._editing = false; el._selected = null;

console.log("\n== 11d. MONITORAGGIO ==");
states["sensor.v1"] = S("231.4", { friendly_name: "Tensione L1", device_class: "voltage", unit_of_measurement: "V" });
states["sensor.v2"] = S("256.0", { friendly_name: "Tensione L2", device_class: "voltage", unit_of_measurement: "V" });
states["sensor.i1"] = S("4.85",  { friendly_name: "Corrente L1", device_class: "current", unit_of_measurement: "A" });
states["sensor.t1"] = S("52.1",  { friendly_name: "CPU", device_class: "temperature", unit_of_measurement: "\u00b0C" });
states["sensor.t2"] = S("91.0",  { friendly_name: "Inverter", device_class: "temperature", unit_of_measurement: "\u00b0C" });
states["sensor.hz"] = S("50.01", { friendly_name: "Frequenza", device_class: "frequency", unit_of_measurement: "Hz" });
states["sensor.pf"] = S("0.82",  { friendly_name: "Cos phi", device_class: "power_factor", unit_of_measurement: "" });
states["sensor.gridw"] = S("2.7", { friendly_name: "Rete", device_class: "power", unit_of_measurement: "kW" });

const monCard = { id: "mon", type: "monitor", entity_id: "", appearance: {}, states: {}, actions: {},
  grid_entity: "sensor.gridw", limit_w: 3300, groups: [], max_per_group: 8 };
const monSec = { id: "ms", title: "Monitoraggio", icon: "mdi:gauge-full", accent: "#8ecae6", items: [monCard] };
const mh = el._renderCard(monCard, monSec);

ok("gauge disegnato", mh.includes("mg-svg") && mh.includes("mg-arc"));
ok("gauge legge il sensore in kW come 2.7 kW", mh.includes("2.70") || mh.includes("2.7"), "");
ok("gauge in zona ambra sopra l'80%", mh.includes('class="mg warn"'), (mh.match(/class="mg [a-z]+"/) || [])[0]);
ok("gauge mostra il margine residuo", mh.includes("margine"));
ok("tensione fuori EN 50160 segnalata", /mon-row warn[^>]*>[^<]*<span class="mon-name">Tensione L2/.test(mh.replace(/\s+/g, " ")) || mh.includes("mon-row warn"));
ok("temperatura oltre 85 in allarme", mh.includes("mon-row alarm"));
ok("frequenza in tolleranza non segnalata", (() => {
  const b = mh.split('class="mon-row').find(x => x.includes("Frequenza"));
  return b && !b.startsWith(" warn") && !b.startsWith(" alarm");
})());
ok("cos phi sotto 0.90 segnalato", (() => {
  const b = mh.split('class="mon-row').find(x => x.includes("Cos phi"));
  return b && b.startsWith(" warn");
})());
ok("le anomalie salgono in cima al gruppo", mh.indexOf("Tensione L2") < mh.indexOf("Tensione L1"));
ok("conteggio anomalie riportato", mh.includes("fuori tolleranza"));
ok("riferimento normativo mostrato", mh.includes("EN 50160"));
ok("ogni lettura apre i dettagli", mh.includes("data-more-info"));
ok("monitor: nessun undefined", !/>undefined</.test(mh) && !mh.includes("[object"));
ok("monitor: div bilanciati", (mh.match(/<div/g) || []).length === (mh.match(/<\/div>/g) || []).length);

monCard.groups = ["voltage"];
const only = el._renderCard(monCard, monSec);
ok("filtro gruppi rispettato", only.includes("Tensioni") && !only.includes("Temperature"));
monCard.groups = [];
monCard.grid_entity = null;
ok("senza sensore rete il gauge lo dice", el._renderCard(monCard, monSec).includes("non collegato"));
monCard.grid_entity = "sensor.gridw";

// over the contractual limit
states["sensor.gridw"] = S("3.9", { friendly_name: "Rete", device_class: "power", unit_of_measurement: "kW" });
ok("oltre il limite: stato rosso", el._renderCard(monCard, monSec).includes('class="mg over"'));
ok("oltre il limite: messaggio esplicito", el._renderCard(monCard, monSec).includes("oltre il limite"));
states["sensor.gridw"] = S("2.7", { friendly_name: "Rete", device_class: "power", unit_of_measurement: "kW" });

el._editing = true;
el._dashboard.pages[0].sections = [monSec];
el._selected = { kind: "card", sectionId: "ms", itemId: "mon" };
el.render();
ok("editor monitoraggio: preset di potenza", el.innerHTML.includes("data-limit-preset"));
ok("editor monitoraggio: gruppi", el.innerHTML.includes("data-monitor-group"));
ok("editor monitoraggio: scelta sensore rete", el.innerHTML.includes('data-prop="grid_entity"'));
el._editing = false; el._selected = null;

console.log("\n== 11e. VIDEOCAMERE E DETTAGLIO METEO ==");
states["camera.salotto"] = S("idle", { friendly_name: "Salotto", access_token: "tok123" });
states["camera.soppalco"] = S("idle", { friendly_name: "Soppalco",
  entity_picture: "/api/camera_proxy/camera.soppalco?token=abc" });
states["camera.rotta"] = S("unavailable", { friendly_name: "Guasta" });
states["sun.sun"] = S("above_horizon", { next_rising: "2026-08-23T06:34:00+02:00", next_setting: "2026-08-22T20:12:00+02:00" });

ok("still da access_token", cameraStill("camera.salotto", states["camera.salotto"]) === "/api/camera_proxy/camera.salotto?token=tok123",
   cameraStill("camera.salotto", states["camera.salotto"]));
ok("entity_picture ha precedenza", cameraStill("camera.soppalco", states["camera.soppalco"]).includes("token=abc"));
ok("stream MJPEG dall'endpoint verificato", cameraStream("camera.salotto", states["camera.salotto"]) === "/api/camera_proxy_stream/camera.salotto?token=tok123");
ok("camera senza token -> nessuno stream", cameraStream("camera.rotta", states["camera.rotta"]) === null);

const camCard = { id: "cam", type: "camera", entity_id: "", appearance: {}, states: {}, actions: {}, refresh: 10 };
const camSec = { id: "cs", title: "Sicurezza", icon: "mdi:shield-home", accent: "#ff3d71", items: [camCard] };
const ch = el._renderCard(camCard, camSec);
const camCount = Object.keys(states).filter(x => x.startsWith("camera.")).length;
ok("una anteprima per camera", (ch.match(/data-cam-open=/g) || []).length === camCount, String(camCount));
ok("le anteprime sono fermi immagine, non stream", ch.includes("camera_proxy/") && !ch.includes("camera_proxy_stream"));
ok("camera non disponibile disabilitata", ch.includes("disabled") && ch.includes("cam-off"));
ok("cache-buster condiviso", (ch.match(/_t=\d+/g) || []).length >= 2);
camCard.cameras = ["camera.salotto"];
ok("selezione camere rispettata", (el._renderCard(camCard, camSec).match(/data-cam-open=/g) || []).length === 1);
camCard.cameras = [];

el._overlay = { kind: "camera", entity: "camera.salotto" };
el.render();
ok("overlay camera: stream live", el.innerHTML.includes("camera_proxy_stream/camera.salotto"));
ok("overlay camera: indicatore diretta", el.innerHTML.includes("diretta"));
el._overlay = null;

// weather detail
states["weather.casa_oscar"] = S("sunny", { friendly_name: "Casa Oscar", temperature: 26.4,
  temperature_unit: "\u00b0C", humidity: 47, pressure: 1014, wind_speed: 4.1, wind_bearing: 142,
  supported_features: 3 });
el._forecast = { "weather.casa_oscar": [
  { datetime: "2026-08-22T12:00:00+02:00", condition: "sunny", temperature: 29, templow: 19 },
  { datetime: "2026-08-23T12:00:00+02:00", condition: "rainy", temperature: 24, templow: 18, precipitation: 6 }] };
el._hourly = { "weather.casa_oscar": [
  { datetime: "2026-08-22T16:00:00+02:00", condition: "sunny", temperature: 28, precipitation_probability: 5 },
  { datetime: "2026-08-22T17:00:00+02:00", condition: "cloudy", temperature: 27, precipitation_probability: 20 },
  { datetime: "2026-08-22T18:00:00+02:00", condition: "rainy", temperature: 25, precipitation_probability: 70 }] };
el._overlay = { kind: "weather", entity: "weather.casa_oscar" };
el.render();
const wd = el.innerHTML;
ok("dettaglio meteo: temperatura grande", wd.includes("wxd-temp") && wd.includes("26"));
ok("dettaglio meteo: condizione tradotta", wd.includes("Soleggiato"));
ok("dettaglio meteo: prossime ore", wd.includes("Prossime ore") && (wd.match(/wxd-hour"/g) || []).length === 3);
ok("dettaglio meteo: probabilita di pioggia", wd.includes("70%"));
ok("dettaglio meteo: prossimi giorni", wd.includes("Prossimi giorni"));
ok("dettaglio meteo: precipitazione giornaliera", wd.includes("6 mm"));
ok("dettaglio meteo: grafico orario", wd.includes("spark-line"));
ok("dettaglio meteo: alba e tramonto", wd.includes("Alba") && wd.includes("Tramonto")
   && (wd.match(/>\d{2}:\d{2}</g) || []).length >= 2, "orari formattati nel fuso del browser");
ok("dettaglio meteo: rosa dei venti", wd.includes("SE") && wd.includes("142"));
ok("dettaglio meteo: umidita e pressione", wd.includes("47%") && wd.includes("1014"));
ok("dettaglio meteo: nessun undefined", !/>undefined</.test(wd));
ok("dettaglio meteo: div bilanciati", (wd.match(/<div/g) || []).length === (wd.match(/<\/div>/g) || []).length);
el._overlay = null;

const wCard = { id: "w", type: "weather", entity_id: "weather.casa_oscar", appearance: {}, states: {}, actions: {} };
ok("la card meteo e' cliccabile", el._renderCard(wCard, camSec).includes("data-weather-open"));

console.log("\n== 12. LEGGIBILITA STATI ==");
ok("porta on -> Aperta", stateWords("on", "door") === "Aperta");
ok("porta off -> Chiusa", stateWords("off", "door") === "Chiusa");
ok("movimento on", stateWords("on", "motion") === "Movimento");
ok("vocabolario generico: heat_cool -> Automatico", stateWords("heat_cool", null) === "Automatico");
ok("vocabolario generico: disarmed -> Disarmato", stateWords("disarmed", null) === "Disarmato");
ok("vocabolario generico: playing -> In riproduzione", stateWords("playing", null) === "In riproduzione");
ok("device_class batte il vocabolario (porta on != Acceso)", stateWords("on", "door") === "Aperta" && stateWords("on", null) === "Acceso");
ok("stato sconosciuto resta leggibile", stateWords("qualcosa_di_strano", null) === "qualcosa di strano");
ok("descrittore non ripete il valore", cardDescriptor("sensor.pv", states["sensor.pv"]) === "Potenza");
ok("descrittore per dominio senza device_class", cardDescriptor("light.x", { attributes: {} }) === "Luce");
const dupe = el._renderCard({ id: "d", type: "sensor", entity_id: "sensor.pv", appearance: {}, states: {}, actions: {} }, fsec);
ok("card sensore non stampa il valore due volte", (dupe.match(/2840/g) || []).length === 1, String((dupe.match(/2840/g) || []).length));

console.log("\n== 13. PANORAMICA ==");
el._pageIndex = 0; el._editing = false; el._selected = null;
el._dashboard.pages = [{ id: "overview", type: "sections", title: "Panoramica", icon: "mdi:x", sections: [] }];
states["weather.casa_oscar"] = S("sunny", { friendly_name: "Casa Oscar", temperature: 26.4, temperature_unit: "\u00b0C", wind_speed: 4.1, supported_features: 3 });
states["person.oscar"] = S("home", { friendly_name: "Oscar" });
states["person.lilly"] = S("not_home", { friendly_name: "Lilly" });
states["update.u1"] = S("on", { friendly_name: "Aggiornamento 1" });
states["media_player.tv"] = S("playing", { friendly_name: "TV" });
states["cover.tap"] = S("open", { friendly_name: "Tapparella" });
el._hass.connection = { subscribeMessage: () => Promise.resolve(() => {}) };

el._composeOverview();
const osec = el._sections();
ok("panoramica: tre sezioni", osec.length === 3, String(osec.length));
ok("panoramica include il monitoraggio", osec[2].items[0].type === "monitor");
const types = osec[0].items.map(i => i.type);
ok("meteo presente", types.includes("weather"));
ok("presenze presenti", types.includes("people"));
ok("notifiche presenti", types.includes("notifications"));
ok("attivi presenti", types.includes("active"));
ok("flusso energetico in sezione Energia", osec[1].items[0].type === "energyflow");
ok("meteo collegato a un'entita reale", osec[0].items.find(i => i.type === "weather").entity_id === "weather.casa_oscar");

const wsec = osec[0];
const wcard = wsec.items.find(i => i.type === "weather");
const whtml = el._renderCard(wcard, wsec);
ok("meteo: condizione tradotta", whtml.includes("Soleggiato"));
ok("meteo: temperatura mostrata", whtml.includes("26"));
ok("meteo: nessun undefined", !/>undefined</.test(whtml));

const acard = wsec.items.find(i => i.type === "active");
const ahtml = el._renderCard(acard, wsec);
ok("attivi: conta i dispositivi accesi", /class="act-count"/.test(ahtml));
ok("attivi: media player in riproduzione incluso", ahtml.includes("TV"));
ok("attivi: tapparella aperta inclusa", ahtml.includes("Tapparella"));
ok("attivi: automation NON considerata attiva", !ahtml.includes("Esco di casa"));
ok("attivi: ogni riga e cliccabile", ahtml.includes("data-toggle-entity"));
acard.domains = ["light"];
const aLight = el._renderCard(acard, wsec);
ok("attivi: filtro per dominio rispettato", !aLight.includes("TV") && !aLight.includes("Tapparella"));
acard.domains = [];

const pcard = wsec.items.find(i => i.type === "people");
const phtml = el._renderCard(pcard, wsec);
ok("presenze: chi e in casa evidenziato", (phtml.match(/ppl-row home/g) || []).length === 1);
ok("presenze: stato tradotto", phtml.includes("In casa") && phtml.includes("Fuori"));

const ncard = wsec.items.find(i => i.type === "notifications");
const nhtml = el._renderCard(ncard, wsec);
ok("notifiche: aggiornamenti pendenti contati", nhtml.includes("1 aggiornamento disponibile"));
ncard.show_updates = false;
ok("notifiche: aggiornamenti disattivabili", !el._renderCard(ncard, wsec).includes("aggiornamento disponibile"));
ncard.show_updates = true;

ok("card composite non hanno data-tap", !ahtml.includes("data-tap") && !phtml.includes("data-tap") && !nhtml.includes("data-tap"));
ok("card composite non sono marcate come non configurate", !ahtml.includes("missing") && !nhtml.includes("missing"));
ok("panoramica: div bilanciati", [whtml, ahtml, phtml, nhtml].every(h =>
  (h.match(/<div/g) || []).length === (h.match(/<\/div>/g) || []).length));

el._editing = true;
el._selected = { kind: "card", sectionId: wsec.id, itemId: acard.id };
el.render();
ok("editor attivi: chip dei domini", el.innerHTML.includes("data-active-domain"));
el._selected = { kind: "card", sectionId: wsec.id, itemId: pcard.id };
el.render();
ok("editor presenze: selezione persone", el.innerHTML.includes("data-person"));
el._editing = false; el._selected = null;

// subscriptions must be opened once and closed on teardown
let opened = 0, closed = 0;
el._subs = {};
el._hass.connection = { subscribeMessage: () => { opened++; return Promise.resolve(() => { closed++; }); } };
el._subscribe("k", { type: "x" }, () => {});
el._subscribe("k", { type: "x" }, () => {});
ok("sottoscrizione aperta una sola volta", opened === 1, String(opened));
setTimeout(() => {}, 0);

console.log("\n== 14. PAGINE E ANALISI ECONOMICA ==");
el._dashboard = { version: 4, revision: 0, theme: { accent: "#00e5ff" }, pages: [
  { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }] };
el._pageIndex = 0; el._editing = true; el._selected = null; el._dirty = false; el._overlay = null;

el.render();
ok("l'editor pagina offre la gestione pagine", el.innerHTML.includes("data-add-page"));
ok("propone la Mappa 3D quando manca", el.innerHTML.includes('data-add-page="floorplan"'));
el._addPage("floorplan");
ok("pagina mappa aggiunta", el._dashboard.pages.length === 2 && el._dashboard.pages[1].type === "floorplan");
ok("si passa subito alla nuova pagina", el._pageIndex === 1 && el._isFloorplan());
ok("aggiungere una pagina marca le modifiche", el._dirty === true);
el._pageIndex = 0; el.render();
ok("non ripropone la mappa se c'e' gia'", !el.innerHTML.includes('data-add-page="floorplan"'));

el._addPage("sections");
ok("pagina vuota aggiunta", el._dashboard.pages.length === 3);
el._movePage(2, -1);
ok("riordino pagine", el._dashboard.pages[1].type === "sections" && el._dashboard.pages[2].type === "floorplan");
el._removePage(2);
ok("eliminazione pagina", el._dashboard.pages.length === 2 && !el._dashboard.pages.some(p => p.type === "floorplan"));
el._dashboard.pages = [el._dashboard.pages[0]];
el._pageIndex = 0;
el._removePage(0);
ok("non si puo' restare senza pagine", el._dashboard.pages.length === 1 && el._error.includes("almeno una"));
el._error = "";

// dirty state: the reason "non mi fa eliminare" looked like a bug
el._dirty = false;
el._dashboard.pages[0].sections = [{ id: "s", title: "T", icon: "mdi:x", accent: null, collapsed: false,
  items: [{ id: "i1", type: "entity", entity_id: "light.soggiorno", appearance: {}, states: {}, actions: {} }] }];
el._removeCard("s", "i1");
ok("eliminare una card la rimuove davvero", el._section("s").items.length === 0);
ok("eliminare marca le modifiche non salvate", el._dirty === true);
el.render();
ok("l'avviso 'non salvate' e' visibile", el.innerHTML.includes("MODIFICHE NON SALVATE"));
// _touch(true) is how background refreshes repaint without claiming the user
// changed something; getting this wrong would show "non salvate" forever
el._dirty = false;
el._touch(true);
ok("un ridisegno di sfondo non finge modifiche", el._dirty === false);
el._touch();
ok("una mutazione marca le modifiche", el._dirty === true);

// economy
// Una finestra fissa e chiusa: i conti delle quote fisse e delle fasce non
// devono cambiare risultato a seconda del giorno in cui gira la suite.
const winTest = (key) => ({ key: key || "month", bucket: key === "year" ? "month" : "day",
  label: "Mese", offset: 0,
  start: new Date(2026, 7, 1), end: new Date(2026, 8, 1), stop: new Date(2026, 8, 1),
  title: "Agosto 2026", short: "AGO", days: 30, running: false });
globalThis.winTest = winTest;
const ecoCard = { id: "eco", type: "economy", entity_id: "", appearance: {}, states: {}, actions: {},
  grid_import: "sensor.imp", grid_export: "sensor.exp", solar: "sensor.pvkwh",
  price_import: 0.25, price_export: 0.10, period: "month" };
const ecoSec = { id: "es", title: "Economia", icon: "mdi:cash", accent: "#ffd166", items: [ecoCard] };
const fig = el._economyFigures(ecoCard, { imported: 100, exported: 40, produced: 150 }, winTest());
ok("autoconsumo = produzione - immissione", fig.selfUsed === 110, String(fig.selfUsed));
ok("costo = prelievo x tariffa", fig.cost === 25, String(fig.cost));
ok("ricavo = immissione x tariffa", Math.abs(fig.revenue - 4) < 1e-9, String(fig.revenue));
ok("netto = costo - ricavo", Math.abs(fig.net - 21) < 1e-9, String(fig.net));
ok("senza fotovoltaico = (prelievo + autoconsumo) x tariffa", Math.abs(fig.withoutPv - 52.5) < 1e-9, String(fig.withoutPv));
ok("risparmio = senza PV - netto", Math.abs(fig.saved - 31.5) < 1e-9, String(fig.saved));
const noPv = el._economyFigures(ecoCard, { imported: 100, exported: 0, produced: 0 }, winTest());
ok("senza impianto nessun risparmio dichiarato", noPv.hasPv === false && noPv.saved === 0);
ok("prezzi a zero non rompono il calcolo", el._economyFigures({}, { imported: 10, exported: 1, produced: 5 }, winTest()).net === 0);

// --- la batteria chiude il bilancio di casa
const battCard = Object.assign({}, ecoCard, { battery_in: "sensor.bin", battery_out: "sensor.bout" });
const battFig = el._economyFigures(battCard,
  { imported: 100, exported: 40, produced: 150, battIn: 30, battOut: 27 }, winTest());
ok("con la batteria l'autoconsumo aggiunge la scarica e toglie la carica",
   Math.abs(battFig.selfUsed - (150 + 27 - 30 - 40)) < 1e-9, String(battFig.selfUsed));
ok("il consumo di casa e' prelievo piu' autoconsumo",
   Math.abs(battFig.consumption - (100 + 107)) < 1e-9, String(battFig.consumption));
ok("la perdita di ciclo e' dichiarata, non nascosta",
   Math.abs(battFig.battLoss - 3) < 1e-9, String(battFig.battLoss));
ok("e la card sa di avere una batteria", battFig.hasBattery === true);
ok("senza contatori di batteria il calcolo resta quello di prima",
   el._economyFigures(ecoCard, { imported: 100, exported: 40, produced: 150, battIn: 30, battOut: 27 },
     winTest()).selfUsed === 110);
ok("i contatori dichiarati ma fermi non accendono la riga batteria",
   el._economyFigures(battCard, { imported: 100, exported: 0, produced: 0, battIn: 0, battOut: 0 },
     winTest()).hasBattery === false);

el._economy = { }; el._economyPending = null;
el._hass.callWS = async () => ({});
const ecoEmpty = el._renderCard({ id: "e2", type: "economy", entity_id: "", appearance: {}, states: {}, actions: {} }, ecoSec);
ok("senza contatori spiega cosa collegare", ecoEmpty.includes("prelevata dalla rete"));

el._economy = { [ecoCard.id + "|month|0|sensor.imp,sensor.exp,sensor.pvkwh"]:
  { ts: Date.now(), imported: 100, exported: 40, produced: 150 } };
const ecoHtml = el._renderCard(ecoCard, ecoSec);
ok("mostra la spesa netta", ecoHtml.includes("SPESA NETTA") && ecoHtml.includes("21,00"));
ok("mostra il confronto senza fotovoltaico", ecoHtml.includes("senza fotovoltaico") && ecoHtml.includes("52,50"));
ok("mostra il risparmio", ecoHtml.includes("31,50") && ecoHtml.includes("risparmiati"));
ok("mostra le tre voci", ecoHtml.includes("Prelievo") && ecoHtml.includes("Autoconsumo") && ecoHtml.includes("Immissione"));
ok("selettore di periodo", (ecoHtml.match(/data-eco-period=/g) || []).length === 4);
ok("e la navigazione avanti/indietro nel tempo",
   (ecoHtml.match(/data-eco-step=/g) || []).length === 2);
ok("al periodo corrente non si puo' andare avanti", /data-eco-step="-1" disabled/.test(ecoHtml));
ok("il periodo mostrato e' scritto per esteso, non un numero di giorni",
   /class="eco-nav">[\s\S]*?<strong>[A-Z][a-z]+/.test(ecoHtml));
ok("economia: nessun undefined", !/>undefined</.test(ecoHtml) && !ecoHtml.includes("[object"));
ok("economia: div bilanciati", (ecoHtml.match(/<div/g) || []).length === (ecoHtml.match(/<\/div>/g) || []).length);
ok("valuta in formato italiano", ecoHtml.includes(",") && !ecoHtml.includes("21.00"));

el._editing = false; el._selected = null; el._dirty = false;

console.log("\n== 15. AZIONI AL TOCCO E TIPI DI CARD ==");
states["cover.tapp"] = S("open", { friendly_name: "Tapparella" });
states["lock.porta"] = S("locked", { friendly_name: "Serratura" });
states["scene.notte"] = S("unknown", { friendly_name: "Notte" });
states["sensor.temp_x"] = S("21.5", { friendly_name: "Temp", device_class: "temperature" });

const keys = (id) => actionsFor(id).map(a => a.k);
ok("sensore: solo dettagli e nessuna", keys("sensor.temp_x").join() === "more-info,none", keys("sensor.temp_x").join());
ok("meteo non comandabile", keys("weather.casa_oscar").join() === "more-info,none");
ok("luce: accendi/spegni disponibili", keys("light.soggiorno").includes("toggle") && keys("light.soggiorno").includes("turn_on"));
ok("tapparella: apri/chiudi/ferma, NON accendi", keys("cover.tapp").includes("open") && keys("cover.tapp").includes("stop")
   && !keys("cover.tapp").includes("turn_on"), keys("cover.tapp").join());
ok("serratura: blocca/sblocca, NIENTE toggle", keys("lock.porta").join() === "more-info,unlock,lock,none", keys("lock.porta").join());
ok("scena: si attiva", keys("scene.notte").includes("activate"));
ok("i servizi dichiarati esistono davvero", (() => {
  const svc = (id, k) => actionsFor(id).find(a => a.k === k).s;
  return svc("cover.tapp", "open") === "open_cover" && svc("cover.tapp", "close") === "close_cover"
      && svc("lock.porta", "lock") === "lock" && svc("scene.notte", "activate") === "turn_on"
      && svc("light.soggiorno", "toggle") === "toggle";
})());

// execution
const tapSec2 = { id: "tp", title: "T", icon: "mdi:x", accent: null, collapsed: false, items: [] };
el._dashboard.pages = [{ id: "p", type: "sections", title: "P", icon: "mdi:x", sections: [tapSec2] }];
el._pageIndex = 0;
const runTap = (entity, action) => {
  tapSec2.items = [{ id: "t1", type: "entity", entity_id: entity, appearance: {}, states: {},
    actions: { tap: { action } } }];
  wsCalls.length = 0;
  el._tap("tp", "t1");
  return wsCalls.map(c => c.service).join();
};
ok("luce + toggle -> light.toggle", runTap("light.soggiorno", "toggle") === "light.toggle");
ok("tapparella + apri -> cover.open_cover", runTap("cover.tapp", "open") === "cover.open_cover");
ok("tapparella + ferma -> cover.stop_cover", runTap("cover.tapp", "stop") === "cover.stop_cover");
ok("serratura + blocca -> lock.lock", runTap("lock.porta", "lock") === "lock.lock");
ok("scena + attiva -> scene.turn_on", runTap("scene.notte", "activate") === "scene.turn_on");
ok("azione obsoleta su tapparella non chiama servizi inesistenti", runTap("cover.tapp", "turn_on") === "",
   "prima chiamava cover.turn_on, che non esiste");
ok("sensore + accendi non chiama servizi", runTap("sensor.temp_x", "turn_on") === "");
ok("nessuna azione non chiama servizi", runTap("light.soggiorno", "none") === "");

// editor
el._editing = true;
tapSec2.items = [{ id: "t1", type: "entity", entity_id: "cover.tapp", appearance: {}, states: {},
  actions: { tap: { action: "open" } } }];
el._selected = { kind: "card", sectionId: "tp", itemId: "t1" };
el.render();
ok("editor: la tapparella non offre Accendi", !el.innerHTML.includes('value="turn_on"'));
ok("editor: mostra il servizio reale accanto all'azione", el.innerHTML.includes("cover.open_cover"));
tapSec2.items[0].entity_id = "sensor.temp_x";
el.render();
ok("editor: spiega che un sensore non si comanda", el.innerHTML.includes("non si comanda"));

// card types
ok("tipi divisi in due gruppi", el.innerHTML.includes("Card autonome"));
ok("il tipo selezionato viene spiegato", el.innerHTML.includes("type-hint"));
tapSec2.items[0].type = "economy";
el.render();
ok("avvisa che una card autonoma ignora l'entita", el.innerHTML.includes("non usa l'entit"));
tapSec2.items[0].type = "entity";
// const declarations do not escape a direct eval; the helpers do
const ALL_TYPES = ["entity","sensor","control","status","climate","gauge","chart",
  "energyflow","weather","active","notifications","people","monitor","camera","economy"];
ok("ogni tipo ha una descrizione", ALL_TYPES.every(k => (cardTypeInfo(k).d || "").length > 12),
   ALL_TYPES.filter(k => (cardTypeInfo(k).d || "").length <= 12).join());
ok("i tipi autonomi sono marcati", ALL_TYPES.filter(k => cardTypeInfo(k).solo).sort().join() ===
   "active,camera,economy,energyflow,monitor,notifications,people",
   ALL_TYPES.filter(k => cardTypeInfo(k).solo).sort().join());
ok("un tipo sconosciuto non rompe l'editor", cardTypeInfo("inesistente").k === "entity");
el._editing = false; el._selected = null;

console.log("\n== 16. MAPPA 3D: PIANI, FORMA, DISPOSITIVI ==");

// -- geometry helpers (function declarations DO escape a direct eval) --------
ok("stanza senza poligono = rettangolo", JSON.stringify(roomPoints({})) === "[[0,0],[1,0],[1,1],[0,1]]");
const L = [[0,0],[1,0],[1,0.5],[0.5,0.5],[0.5,1],[0,1]];
ok("poligono valido conservato", JSON.stringify(roomPoints({points:L})) === JSON.stringify(L));
ok("poligono con 2 vertici -> rettangolo", roomPoints({points:[[0,0],[1,1]]}).length === 4);
ok("poligono spazzatura -> rettangolo", roomPoints({points:"boh"}).length === 4);
ok("vertici fuori scala vengono limitati",
   JSON.stringify(roomPoints({points:[[-5,0],[1,0],[1,9]]})) === "[[0,0],[1,0],[1,1]]");

// The four generated walls must be identical to the four that were hard-coded
// while the map could only draw rectangles: this is the regression guard for
// the whole polygon rewrite.
const rectEdges = roomEdges({ w: 200, h: 160 });
ok("rettangolo -> 4 muri", rectEdges.length === 4, String(rectEdges.length));
ok("muro nord: lungo quanto la stanza, angolo 0",
   Math.abs(rectEdges[0].len - 200) < 0.01 && Math.abs(rectEdges[0].angle) < 0.01,
   rectEdges[0].len + "@" + rectEdges[0].angle);
ok("muro est: parte da x=w, angolo 90",
   Math.abs(rectEdges[1].x - 200) < 0.01 && Math.abs(rectEdges[1].angle - 90) < 0.01 && Math.abs(rectEdges[1].len - 160) < 0.01,
   JSON.stringify(rectEdges[1]));
ok("muro sud: angolo 180", Math.abs(Math.abs(rectEdges[2].angle) - 180) < 0.01, String(rectEdges[2].angle));
ok("muro ovest: angolo -90", Math.abs(rectEdges[3].angle + 90) < 0.01, String(rectEdges[3].angle));
ok("i muri paralleli hanno la stessa luce",
   Math.abs(rectEdges[0].shade - rectEdges[2].shade) < 1e-9 && rectEdges[0].shade > rectEdges[1].shade,
   rectEdges.map(e => e.shade.toFixed(3)).join());
ok("i muri perpendicolari hanno luce diversa", Math.abs(rectEdges[0].shade - rectEdges[1].shade) > 0.15);
ok("la L genera 6 muri", roomEdges({ w: 200, h: 160, points: L }).length === 6);
ok("nessun muro di lunghezza zero",
   roomEdges({ w: 200, h: 160, points: [[0,0],[0,0],[1,0],[1,1],[0,1]] }).every(e => e.len > 0.5));
ok("muri di una stanza minima restano calcolabili",
   roomEdges({ w: 40, h: 40 }).every(e => Number.isFinite(e.len) && Number.isFinite(e.angle)));

const cR = polygonCentroid(roomPoints({}));
ok("baricentro del rettangolo al centro", Math.abs(cR[0]-0.5) < 1e-6 && Math.abs(cR[1]-0.5) < 1e-6, cR.join());
const cL = polygonCentroid(L);
ok("baricentro della L dentro la L", pointInPolygon(L, cL[0], cL[1]), cL.map(n=>n.toFixed(3)).join());
ok("l'incavo della L e' fuori dalla stanza", !pointInPolygon(L, 0.8, 0.8));
ok("il pieno della L e' dentro", pointInPolygon(L, 0.2, 0.8) && pointInPolygon(L, 0.8, 0.2));
ok("baricentro di un poligono degenere non produce NaN",
   polygonCentroid([[0.5,0.5],[0.5,0.5],[0.5,0.5]]).every(Number.isFinite));

// -- fit zoom ---------------------------------------------------------------
ok("zoom di dettaglio: stanza piccola -> piu' zoom",
   fitZoom(100, 100, 32, 56, 900, 560, 0.6) > fitZoom(400, 400, 32, 56, 900, 560, 0.6));
ok("zoom di dettaglio limitato a 3x", fitZoom(1, 1, 32, 56, 900, 560, 0.6) === 3);
ok("zoom di dettaglio limitato a 0.3x", fitZoom(90000, 90000, 32, 56, 900, 560, 0.6) === 0.3);
// with the camera flat and unrotated the projection is the identity, so the
// fit is exactly the margin times the smaller ratio - anything else means the
// projected bounding box is being computed wrongly
ok("a camera piatta il fit e' esatto",
   Math.abs(fitZoom(200, 200, 0, 0, 800, 400, 0.6) - (400/200)*0.6) < 1e-9,
   String(fitZoom(200, 200, 0, 0, 800, 400, 0.6)));
ok("ruotando di 90 gradi il fit resta sensato",
   fitZoom(300, 100, 90, 56, 900, 560, 0.6) > 0.3 && fitZoom(300, 100, 90, 56, 900, 560, 0.6) < 3);
ok("il fit non esplode con pitch 85", Number.isFinite(fitZoom(200, 200, 32, 85, 900, 560, 0.6)));

// -- auto placement + storey names ------------------------------------------
ok("posizioni automatiche dentro la stanza",
   [0,1,2,3,4,5,6].every(i => { const s2 = autoSpot(i, 7); return s2[0] > 0 && s2[0] < 1 && s2[1] > 0 && s2[1] < 1; }));
ok("posizioni automatiche tutte diverse",
   new Set([0,1,2,3,4,5,6].map(i => autoSpot(i,7).join())).size === 7);
ok("un solo dispositivo finisce al centro", autoSpot(0,1).join() === "0.5,0.5");
ok("nomi dei piani", levelName(0) === "Piano terra" && levelName(1) === "Piano 1"
   && levelName(-1) === "Seminterrato" && levelName(-2) === "Interrato 2");

// -- rendering --------------------------------------------------------------
el._dashboard = { version: 5, revision: 0, theme: { accent: "#00e5ff" }, pages: [
  { id: "map", type: "floorplan", title: "Mappa 3D", icon: "mdi:floor-plan",
    view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true,
            show_labels: true, level_gap: 150, active_level: null },
    rooms: [
      { id: "r-terra", area_id: "soggiorno", title: "Soggiorno", icon: "mdi:sofa", color: "#00e5ff",
        x: 0, y: 0, w: 240, h: 180, level: 0, points: null, spots: {}, entities: null },
      { id: "r-sopra", area_id: "camera_da_letto", title: "Camera", icon: "mdi:bed", color: "#c77dff",
        x: 0, y: 0, w: 240, h: 180, level: 1, points: L.map(p => p.slice()), spots: {}, entities: ["light.soggiorno"] }]}]};
el._pageIndex = 0; el._editing = false; el._selected = null; el._focus = null; el._roomPicker = false;
el.render();
let html = el.innerHTML;
ok("il piano terra non viene sollevato", html.includes("translateZ(0.00px)"));
ok("il primo piano viene sollevato di un interpiano", html.includes("translateZ(150.00px)"));
ok("due piani -> selettore dei piani", html.includes('data-level-pick="1"') && html.includes('data-level-pick="all"'));
ok("il pavimento e' ritagliato sulla forma", html.includes("clip-path:polygon("));
ok("il contorno e' un poligono svg", html.includes("fp-outline") && html.includes("<polygon"));
ok("la stanza a L ha 6 muri",
   (html.split('data-room="r-sopra"')[1] || "").split("fp-wall").length - 1 === 6,
   String((html.split('data-room="r-sopra"')[1] || "").split("fp-wall").length - 1));
ok("il nome della stanza porta dentro la stanza", html.includes('data-room-focus="r-terra"'));
ok("il piano e' scritto sull'etichetta", html.includes('fp-lv">+1'));
ok("senza selezione non ci sono maniglie", !html.includes("data-resize="));

el._page().view.active_level = 0;
el.render(); html = el.innerHTML;
ok("isolando un piano gli altri diventano fantasma", html.includes("fp-room ghost") || / class="fp-room[^"]*ghost/.test(html));
ok("il piano isolato resta pieno", /data-room="r-terra"/.test(html) && !/fp-room[^"]*ghost[^"]*"\s*\n?\s*data-room="r-terra"/.test(html));
el._page().view.active_level = null;

el._editing = true; el._selected = { kind: "room", roomId: "r-terra" };
el.render(); html = el.innerHTML;
ok("la stanza selezionata ha 8 maniglie", (html.match(/data-resize="/g) || []).length === 8,
   String((html.match(/data-resize="/g) || []).length));
ok("le maniglie coprono angoli e lati",
   ["nw","n","ne","e","se","s","sw","w"].every(k => html.includes(`data-resize="${k}"`)));
ok("una stanza rettangolare non mostra vertici", !html.includes('data-vertex="'));
ok("l'editor stanza offre le forme pronte", html.includes('data-room-shape="l"') && html.includes('data-room-shape="rect"'));
ok("l'editor stanza offre il cambio piano", html.includes('data-room-level="1"') && html.includes('data-room-level="-1"'));
ok("l'editor stanza offre di aggiungere un dispositivo", html.includes('data-room-add-device="r-terra"'));

el._selected = { kind: "room", roomId: "r-sopra" };
el.render(); html = el.innerHTML;
ok("la stanza poligonale mostra i suoi vertici", (html.match(/data-vertex="/g) || []).length === 6,
   String((html.match(/data-vertex="/g) || []).length));
ok("ogni lato offre di aggiungere un vertice", (html.match(/data-vertex-add="/g) || []).length === 6);
ok("l'elenco dei vertici e' nell'editor", html.includes("vertex-list") && html.includes('data-vertex-remove="0"'));

// -- mutations --------------------------------------------------------------
const rSopra = el._room("r-sopra");
rSopra.points.splice(1, 0, [1, 0.25]);
ok("un vertice aggiunto e' subito parte della forma", roomPoints(rSopra).length === 7);
rSopra.points = null;
ok("tornare rettangolo azzera i vertici", roomPoints(rSopra).length === 4 && rSopra.points === null);

const rTerra = el._room("r-terra");
// r-sopra is on level 1 throughout, so the storey list is the union of both
rTerra.level = 2;
ok("una stanza puo' salire di piano", el._levels().join() === "0,1,2", el._levels().join());
rTerra.level = -1;
ok("una stanza puo' scendere sotto il piano terra", el._levels().join() === "-1,0,1", el._levels().join());
rTerra.level = 0;
ok("il piano terra c'e' sempre", el._levels().includes(0));

// devices in a room, from the map
rTerra.entities = null;
ok("in automatico la stanza pesca dall'area", el._roomAllEntities(rTerra).length > 0);
ok("la mappa mostra al massimo 6 targhette", el._roomEntities(rTerra).length <= 6);
ok("dentro la stanza si vede tutto",
   el._roomAllEntities(rTerra).length >= el._roomEntities(rTerra).length);
rTerra.entities = ["light.soggiorno"];
rTerra.entities.push("switch.luci_scale");
ok("un dispositivo aggiunto compare nella stanza", el._roomAllEntities(rTerra).length === 2);
ok("un dispositivo inesistente non viene mostrato",
   (rTerra.entities.push("light.fantasma"), el._roomAllEntities(rTerra).length === 2));
rTerra.entities = ["light.soggiorno", "switch.luci_scale"];

ok("senza posizione salvata il dispositivo si dispone da solo",
   el._spotFor(rTerra, "light.soggiorno", 0, 2).join() === autoSpot(0, 2).join());
rTerra.spots = { "light.soggiorno": [0.2, 0.8] };
ok("la posizione salvata vince sull'automatico", el._spotFor(rTerra, "light.soggiorno", 0, 2).join() === "0.2,0.8");
ok("gli altri restano automatici", el._spotFor(rTerra, "switch.luci_scale", 1, 2).join() === autoSpot(1, 2).join());

// -- focus ------------------------------------------------------------------
el._editing = false; el._selected = null;
el._focusRoom("r-terra");
ok("entrando nella stanza si calcola una camera dedicata",
   el._focus && el._focus.roomId === "r-terra" && el._focus.zoom > 0.3);
ok("la camera si sposta sulla stanza",
   Math.abs(el._focus.dx - (el._planBounds().w/2 - (rTerra.x + rTerra.w/2))) < 1e-9);
ok("la camera segue anche il piano", el._focus.dz === -((rTerra.level || 0) * 150));
ok("lo zoom salvato della pagina non viene toccato", el._page().view.zoom === 1);
el.render(); html = el.innerHTML;
ok("la stanza aperta mostra i dispositivi posizionati", (html.match(/data-spot="/g) || []).length === 2,
   String((html.match(/data-spot="/g) || []).length));
ok("la posizione salvata finisce nel DOM", html.includes("left:20.000%"));
ok("compare la barra della stanza", html.includes("fp-focus-bar") && html.includes("data-focus-exit"));
ok("le altre stanze sfumano", html.includes("fp-room dim") || /class="fp-room[^"]*dim/.test(html));
ok("la vista e' traslata sulla stanza", html.includes("translate3d("));
el._focusRoom("r-terra");
ok("ritoccare il nome esce dalla stanza", el._focus === null);
el._focusRoom("r-inesistente");
ok("una stanza inesistente non apre nulla", el._focus === null);
el._focus = null; el._editing = false; el._selected = null;

// restore the sections dashboard so later assertions are unaffected
el._dashboard = { version: 5, revision: 0, theme: { accent: "#00e5ff" }, pages: [
  { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
el._pageIndex = 0;
ok("stato ripristinato per i test successivi", !el._isFloorplan());

console.log("\n== 17. ATTIVI ORA, AVVISI, DETTAGLIO ENERGIA ==");

// -- helpers ----------------------------------------------------------------
const T0 = Date.parse("2026-08-23T12:00:00Z");
ok("meno di 90 secondi -> 'ora'", sinceWords(T0 - 40000, T0) === "ora");
ok("minuti", sinceWords(T0 - 12 * 60000, T0) === "da 12 min");
ok("ore", sinceWords(T0 - 135 * 60000, T0) === "da 2 h 15", sinceWords(T0 - 135 * 60000, T0));
ok("ore tonde senza minuti", sinceWords(T0 - 120 * 60000, T0) === "da 2 h", sinceWords(T0 - 120 * 60000, T0));
ok("ieri", sinceWords(T0 - 26 * 3600000, T0) === "da ieri");
ok("giorni", sinceWords(T0 - 72 * 3600000, T0) === "da 3 giorni");
ok("timestamp assente non produce testo", sinceWords(0, T0) === "");
// Date.parse(0) coerces the number to the string "0" and yields the year
// 2000, so an entity with no last_changed used to render "da 9731 giorni"
states["light.senza_storia"] = S("on", { friendly_name: "Luce senza storia" });
delete states["light.senza_storia"].last_changed;
{
  const rows = el._activeEntities({ domains: ["light"] });
  const orphan = rows.find(r => r.id === "light.senza_storia");
  ok("un'entita' senza last_changed non finge di essere accesa dal 2000",
     orphan && orphan.since === 0 && sinceWords(orphan.since, T0) === "",
     orphan ? String(orphan.since) : "riga assente");
}
delete states["light.senza_storia"];
ok("avviso appena arrivato", agoWords(new Date(T0 - 20000).toISOString(), T0) === "adesso");
ok("avviso di un'ora fa", agoWords(new Date(T0 - 3700000).toISOString(), T0) === "1 h fa");
ok("data non valida non rompe nulla", agoWords("non-una-data", T0) === "");
ok("canale sconosciuto ha comunque icona e colore",
   !!notifChannel("marziano").icon && !!notifChannel("marziano").color);
ok("telegram ha il suo canale", notifChannel("telegram").l === "Telegram");

// -- grouping ---------------------------------------------------------------
states["light.cucina_faretti"] = S("on", { friendly_name: "Faretti Cucina", brightness: 128 });
states["light.piantana"] = S("on", { friendly_name: "Piantana", brightness: 255, color_temp_kelvin: 2700 });
states["cover.tapparella_salotto"] = S("open", { friendly_name: "Tapparella Salotto", current_position: 60 });
states["media_player.tv"] = S("playing", { friendly_name: "TV Salotto", media_title: "Il Padrino" });
states["vacuum.robot"] = S("cleaning", { friendly_name: "Robot", battery_level: 72 });
states["siren.camera_soppalco_siren"].state = "on";

el._dashboard = { version: 5, revision: 0, theme: { accent: "#00e5ff" }, pages: [
  { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [
    { id: "s1", title: "Casa", icon: "mdi:home", accent: "#00e5ff", items: [
      { id: "actcard", type: "active", entity_id: "", name: "", size: "lg",
        appearance: {}, states: {}, actions: {}, domains: [], max: 12 }]}]}]};
el._pageIndex = 0; el._editing = false; el._selected = null;
el._registry = { areas: [{ area_id: "cucina", name: "Cucina" }],
  byArea: { cucina: ["light.cucina_faretti"] },
  entityArea: { "light.cucina_faretti": "Cucina", "light.piantana": "Soggiorno" } };

const actCard = el._sections()[0].items[0];
const grouped = el._activeGroups(actCard);
const gk = grouped.map(g => g.group.k);
ok("i gruppi seguono un ordine fisso", gk.join() === gk.slice().sort((a,b) =>
   ["luci","carichi","clima","aperture","media","pulizia","allarmi"].indexOf(a) -
   ["luci","carichi","clima","aperture","media","pulizia","allarmi"].indexOf(b)).join(), gk.join());
const luciRows = (grouped.find(g => g.group.k === "luci") || {rows:[]}).rows.map(r => r.id);
ok("le luci finiscono nel gruppo luci",
   luciRows.includes("light.cucina_faretti") && luciRows.includes("light.piantana")
   && luciRows.every(id => id.startsWith("light.")), luciRows.join());
ok("le tapparelle non finiscono fra le luci",
   (grouped.find(g => g.group.k === "aperture") || {rows:[]}).rows.some(r => r.id === "cover.tapparella_salotto"));
ok("il media player ha il suo gruppo",
   (grouped.find(g => g.group.k === "media") || {rows:[]}).rows.length === 1);
ok("la sirena e' un gruppo di allarme",
   (grouped.find(g => g.group.k === "allarmi") || {}).group.alert === true);
ok("ogni gruppo sa come spegnersi", grouped.every(g => g.group.off && g.group.off.service));
ok("i servizi di spegnimento esistono nel dominio giusto",
   grouped.every(g => ["light","homeassistant","cover","media_player","vacuum","siren"].includes(g.group.off.domain)));

const lucGroup = grouped.find(g => g.group.k === "luci");
ok("una luce dimmerata mostra la percentuale",
   lucGroup.group.detail(states["light.cucina_faretti"]) === "50%",
   lucGroup.group.detail(states["light.cucina_faretti"]));
ok("una luce con temperatura mostra i kelvin",
   lucGroup.group.detail(states["light.piantana"]).includes("2700K"));
const apeGroup = grouped.find(g => g.group.k === "aperture");
ok("una tapparella mostra quanto e' aperta",
   apeGroup.group.detail(states["cover.tapparella_salotto"]) === "aperta al 60%");
const medGroup = grouped.find(g => g.group.k === "media");
ok("il media mostra cosa sta suonando",
   medGroup.group.detail(states["media_player.tv"]) === "Il Padrino");
const climaGroup = grouped.find(g => g.group.k === "clima");
ok("il clima mostra temperatura attuale e impostata",
   climaGroup.group.detail(states["climate.thermostat"]).includes("22.4°")
   && climaGroup.group.detail(states["climate.thermostat"]).includes("21°"),
   climaGroup.group.detail(states["climate.thermostat"]));

el.render();
let a17 = el.innerHTML;
ok("la card mostra i gruppi", a17.includes("act-group") && a17.includes("Luci accese"));
ok("ogni gruppo ha un pulsante di spegnimento", (a17.match(/data-act-off="/g) || []).length >= 5);
ok("l'area della luce compare accanto al nome", a17.includes("Cucina · 50%"));
ok("il tempo di accensione compare", /act-since/.test(a17));
ok("le pastiglie riassuntive ci sono", (a17.match(/act-chip/g) || []).length >= 5);
ok("la sirena viene evidenziata", a17.includes("act-row alert"));
ok("nessun gruppo sparisce del tutto per il limite",
   grouped.every(g => a17.includes(g.group.l)));

// the old card never repainted when a light changed: composite cards carry no
// entity_id, so nothing about them was in the signature
const sigBefore = el._buildSignature();
states["light.piantana"] = S("off", { friendly_name: "Piantana" });
ok("spegnere una luce cambia la firma della card attivi", el._buildSignature() !== sigBefore);
states["light.piantana"] = S("on", { friendly_name: "Piantana", brightness: 255, color_temp_kelvin: 2700 });

// -- notifications ----------------------------------------------------------
el._sections()[0].items = [{ id: "ntcard", type: "notifications", entity_id: "", name: "", size: "md",
  appearance: {}, states: {}, actions: {}, show_updates: true, show_sent: true, max: 8 }];
el._notifs = {};
el._sentNotifs = [
  { id: "cy-3", ts: new Date(T0 - 120000).toISOString(), source: "sent", channel: "telegram",
    channel_label: "Telegram", title: "Allarme", message: "Movimento rilevato in salotto", service: "notify.send_message" },
  { id: "cy-2", ts: new Date(T0 - 7200000).toISOString(), source: "received", channel: "telegram",
    channel_label: "Telegram", title: "Oscar", message: "/stato", service: "telegram_command" },
];
el._sentPending = false;
el.render();
let n17 = el.innerHTML;
ok("gli avvisi Telegram compaiono nella card", n17.includes("Movimento rilevato in salotto"));
ok("si distingue inviato da ricevuto", n17.includes("inviato via Telegram") && n17.includes("ricevuto da Telegram"));
ok("un messaggio in arrivo e' marcato", n17.includes("notif-row in"));
ok("gli aggiornamenti disponibili restano", n17.includes("aggiornament"));
ok("il tempo relativo compare", n17.includes("notif-when"));
el._sections()[0].items[0].show_sent = false;
el.render();
ok("si possono escludere i messaggi inviati", !el.innerHTML.includes("Movimento rilevato in salotto"));
el._sections()[0].items[0].show_sent = true;
// an update fixture from an earlier section is still pending, and a pending
// update is itself an alert: switch updates off to reach the empty state
el._sections()[0].items[0].show_updates = false;
el._sentNotifs = []; el._sentPending = false;
el.render();
ok("senza avvisi la card dice che e' tutto a posto", el.innerHTML.includes("Sistema in ordine"));
el._sentNotifs = null; el._sentPending = true;
el.render();
ok("durante il caricamento non dice che non c'e' niente", el.innerHTML.includes("Lettura degli avvisi"));
el._sentPending = false; el._sentNotifs = [];
el._sections()[0].items[0].show_updates = true;

// -- economy per-device -----------------------------------------------------
states["sensor.energia_lavatrice"] = S("120", { friendly_name: "Lavatrice", device_class: "energy", state_class: "total_increasing", unit_of_measurement: "kWh" });
states["sensor.energia_pdc"] = S("400", { friendly_name: "Pompa di calore", device_class: "energy", state_class: "total_increasing", unit_of_measurement: "kWh" });
states["sensor.energia_stringa2"] = S("90", { friendly_name: "Stringa 2", device_class: "energy", state_class: "total_increasing", unit_of_measurement: "kWh" });
const eco17 = { id: "eco", type: "economy", entity_id: "", name: "", size: "lg",
  appearance: {}, states: {}, actions: {},
  grid_import: "sensor.energia_totale", grid_export: null, solar: null,
  price_import: 0.30, price_export: 0.10, period: "month",
  devices: [
    { entity: "sensor.energia_lavatrice", name: "Lavatrice", icon: "", kind: "load" },
    { entity: "sensor.energia_pdc", name: "Pompa di calore", icon: "", kind: "load" },
    { entity: "sensor.energia_stringa2", name: "Stringa 2", icon: "", kind: "source" }] };
const ecoD17 = { imported: 300, exported: 0, produced: 0,
  devices: { "sensor.energia_lavatrice": 30, "sensor.energia_pdc": 120, "sensor.energia_stringa2": 45 } };
const ecoH17 = el._economyDevices(eco17, ecoD17);
ok("il dettaglio elenca ogni dispositivo",
   ecoH17.includes("Lavatrice") && ecoH17.includes("Pompa di calore") && ecoH17.includes("Stringa 2"));
ok("i consumi sono ordinati dal maggiore",
   ecoH17.indexOf("Pompa di calore") < ecoH17.indexOf("Lavatrice"));
ok("il costo usa la tariffa di prelievo", ecoH17.includes("36,00"), ecoH17.match(/ed-eur">[^<]*/g).join());
ok("chi produce usa la tariffa di immissione e ha il segno piu'",
   ecoH17.includes(">+4,50"), (ecoH17.match(/ed-eur">[^<]*/g) || []).join());
ok("produzione e consumo sono separati",
   ecoH17.includes("CONSUMI PER DISPOSITIVO") && ecoH17.includes("PRODUZIONE PER SORGENTE"));
ok("il totale misurato e' la somma dei carichi", ecoH17.includes("150.0 kWh"));
// 300 imported - 150 measured = 150 unaccounted; hiding it would make six
// plugs look like the whole bill
ok("il non misurato viene dichiarato", ecoH17.includes("Non misurato") && ecoH17.includes("150.0 kWh"));
ok("le percentuali sono sul consumo di casa, non sul misurato",
   ecoH17.includes(">40%"), (ecoH17.match(/ed-pct">[^<]*/g) || []).join());
ok("una sorgente non viene conteggiata come costo", !ecoH17.includes(">13,50"));
ok("un dispositivo senza statistiche viene omesso, non mostrato a zero",
   !el._economyDevices(eco17, { imported: 300, devices: {} }).includes("Lavatrice"));
ok("senza dispositivi il dettaglio spiega cosa fare",
   el._economyDevices({ devices: [] }, ecoD17).includes("Dashboard Energia"));

el._sections()[0].items = [];
el._notifs = {}; el._sentNotifs = null;
states["siren.camera_soppalco_siren"].state = "off";
delete states["light.cucina_faretti"]; delete states["light.piantana"];
delete states["cover.tapparella_salotto"]; delete states["media_player.tv"]; delete states["vacuum.robot"];
ok("stato ripristinato dopo la sezione 17", el._activeEntities({}).length >= 0);

console.log("\n== 18. GAUGE DEL CONTATORE ==");
{
  const mon = { id: "mon", type: "monitor", entity_id: "", name: "", size: "lg",
    appearance: {}, states: {}, actions: {}, groups: [], max_per_group: 8,
    grid_entity: "sensor.gauge_test", limit_w: 3300 };
  const arcOf = (html) => {
    // the value arc is the second .mg-arc; the first is the track
    const paths = html.match(/<path class="mg-arc [^"]*"[^>]*d="[^"]*"/g) || [];
    const value = paths.find(p => p.includes("mg-arc value"));
    if (!value) return null;
    const m = /d="M([\d.-]+),([\d.-]+) A92,92 0 (\d) 1 ([\d.-]+),([\d.-]+)"/.exec(value);
    return m ? { x1: +m[1], y1: +m[2], large: +m[3], x2: +m[4], y2: +m[5] } : null;
  };
  const at = (watts) => {
    states["sensor.gauge_test"] = S(String(watts), { device_class: "power", unit_of_measurement: "W" });
    return arcOf(el._gridGauge(mon));
  };

  const low = at(660);      // 20%
  const half = at(1650);    // 50%
  const past = at(1716);    // 52% - the reading in the phone screenshot
  const high = at(2970);    // 90%
  ok("il gauge disegna l'arco del valore", !!low && !!past && !!high);
  // The dial is a half turn: the sweep can never exceed 180 degrees, so the
  // large-arc flag must be 0 at every reading. It used to flip past 50% and
  // the renderer took the long way round the circle.
  ok("l'arco non prende mai la strada lunga",
     [low, half, past, high].every(a => a.large === 0),
     [low, half, past, high].map(a => a.large).join());
  ok("l'arco parte sempre da sinistra", [low, past, high].every(a => Math.abs(a.x1 - 28) < 1));
  // 52% of a half turn is 93.6 degrees: the end point must be just past the
  // top of the dial, not back down the far side
  ok("al 52% l'arco finisce appena oltre la cima",
     past.x2 > 120 && past.x2 < 140 && past.y2 < 30,
     past.x2.toFixed(1) + "," + past.y2.toFixed(1));
  ok("al 90% l'arco arriva quasi a destra", high.x2 > 195, high.x2.toFixed(1));
  ok("al 20% l'arco resta nella metà sinistra", low.x2 < 120, low.x2.toFixed(1));
  ok("l'arco cresce in modo monotono", low.x2 < past.x2 && past.x2 < high.x2);
  ok("il gauge dichiara la percentuale giusta", el._gridGauge(mon).includes("90% del contatore"));
  ok("oltre il limite lo dice", (states["sensor.gauge_test"] = S("4000", { device_class: "power", unit_of_measurement: "W" }),
     el._gridGauge(mon).includes("oltre il limite")));
  ok("senza sensore non inventa un valore",
     el._gridGauge({ ...mon, grid_entity: null }).includes("non collegato"));
  delete states["sensor.gauge_test"];
}

console.log("\n== 19. GERARCHIA DEI CARICHI E VISIBILITA' NELLE STANZE ==");
{
  states["sensor.e_quadro"] = S("900", { friendly_name: "Quadro FEM", device_class: "energy", state_class: "total_increasing", unit_of_measurement: "kWh" });
  states["sensor.e_cucina"] = S("300", { friendly_name: "Presa cucina", device_class: "energy", state_class: "total_increasing", unit_of_measurement: "kWh" });
  states["sensor.e_frigg"] = S("80", { friendly_name: "Friggitrice", device_class: "energy", state_class: "total_increasing", unit_of_measurement: "kWh" });
  const card = { id: "eco2", type: "economy", entity_id: "", price_import: 0.30, price_export: 0.10,
    grid_import: "sensor.energia_totale", period: "month",
    devices: [
      { entity: "sensor.e_quadro", name: "Quadro FEM", icon: "", kind: "load", parent: null },
      { entity: "sensor.e_cucina", name: "Presa cucina", icon: "", kind: "load", parent: "sensor.e_quadro" },
      { entity: "sensor.e_frigg", name: "Friggitrice", icon: "", kind: "load", parent: "sensor.e_cucina" }] };
  const data = { imported: 400, exported: 0, produced: 0,
    devices: { "sensor.e_quadro": 200, "sensor.e_cucina": 60, "sensor.e_frigg": 20 } };
  const html = el._economyDevices(card, data);
  // 200 + 60 + 20 = 280 would bill the same kilowatt-hours three times over;
  // only the root is a real total
  ok("il totale conta solo i carichi radice", html.includes("200.0 kWh · 60,00"),
     (html.match(/eco-dev-head[^]*?<\/div>/) || [""])[0].slice(0, 160));
  ok("i figli sono comunque elencati",
     html.includes("Presa cucina") && html.includes("Friggitrice"));
  ok("i figli sono annidati visivamente", (html.match(/eco-dev[^"]* child/g) || []).length === 2,
     String((html.match(/eco-dev[^"]* child/g) || []).length));
  ok("il padre dichiara quanto consuma al netto dei figli", html.includes("di cui propri 140.0 kWh"),
     (html.match(/di cui propri [^<]*/g) || []).join());
  ok("il figlio intermedio scala a sua volta il proprio figlio", html.includes("di cui propri 40.0 kWh"));
  // 400 imported - 200 root = 200 unaccounted, not 400 - 280
  ok("il non misurato usa il totale corretto", html.includes("Non misurato") && html.includes("200.0 kWh"));
  ok("un carico foglia non dichiara quote proprie",
     (html.match(/di cui propri/g) || []).length === 2);

  // a dangling or circular parent must not break the card
  const bad = JSON.parse(JSON.stringify(card));
  bad.devices[0].parent = "sensor.inesistente";
  ok("un padre inesistente non fa sparire il carico",
     el._economyDevices(bad, data).includes("Quadro FEM"));
  delete states["sensor.e_quadro"]; delete states["sensor.e_cucina"]; delete states["sensor.e_frigg"];
}
{
  // room visibility
  el._registry = { areas: [{ area_id: "sala", name: "Sala" }],
    byArea: { sala: ["light.sala_1", "sensor.sala_temp", "sensor.sala_rssi", "button.sala_restart", "sensor.sala_giu"] },
    entityArea: {}, category: { "sensor.sala_rssi": "diagnostic", "button.sala_restart": "config" } };
  states["light.sala_1"] = S("on", { friendly_name: "Luce sala" });
  states["sensor.sala_temp"] = S("21.5", { friendly_name: "Temp sala", device_class: "temperature", unit_of_measurement: "°C" });
  states["sensor.sala_rssi"] = S("-62", { friendly_name: "RSSI", device_class: "signal_strength" });
  states["button.sala_restart"] = S("unknown", { friendly_name: "Riavvia" });
  states["sensor.sala_giu"] = S("unavailable", { friendly_name: "Sensore rotto" });

  const room = { id: "r", area_id: "sala", entities: null, hidden: [] };
  const visible = el._roomAllEntities(room);
  ok("le entità di diagnostica non entrano nella stanza", !visible.includes("sensor.sala_rssi"));
  ok("le entità di configurazione non entrano nella stanza", !visible.includes("button.sala_restart"));
  ok("le entità non disponibili non entrano nella stanza", !visible.includes("sensor.sala_giu"));
  ok("quelle utili restano", visible.includes("light.sala_1") && visible.includes("sensor.sala_temp"),
     visible.join());
  room.hidden = ["sensor.sala_temp"];
  ok("nascondere un dispositivo lo toglie dalla stanza",
     !el._roomAllEntities(room).includes("sensor.sala_temp"));
  ok("resta però fra i candidati, per poterlo riattivare",
     el._roomCandidates(room).includes("sensor.sala_temp"));
  room.entities = ["light.sala_1", "sensor.sala_rssi"];
  room.hidden = [];
  ok("una lista scelta a mano non viene filtrata",
     el._roomAllEntities(room).includes("sensor.sala_rssi"));
  delete states["light.sala_1"]; delete states["sensor.sala_temp"];
  delete states["sensor.sala_rssi"]; delete states["button.sala_restart"]; delete states["sensor.sala_giu"];
  el._registry = null;
}

console.log("\n== 20. SOGLIE CONFIGURABILI ==");
{
  const vGroup = MONITOR_GROUPS_TEST.find(g => g.key === "voltage");
  const tGroup = MONITOR_GROUPS_TEST.find(g => g.key === "temperature");
  const cGroup = MONITOR_GROUPS_TEST.find(g => g.key === "current");
  ok("senza personalizzazioni valgono le norme",
     JSON.stringify(monitorLimits(vGroup, {})) === JSON.stringify({warnLow:207,warnHigh:253,alarmLow:195,alarmHigh:265}),
     JSON.stringify(monitorLimits(vGroup, {})));
  ok("una soglia personalizzata sostituisce la norma",
     monitorLimits(vGroup, { limits: { voltage: { warnLow: 210 } } }).warnLow === 210);
  ok("le altre soglie dello stesso gruppo restano di norma",
     monitorLimits(vGroup, { limits: { voltage: { warnLow: 210 } } }).warnHigh === 253);
  ok("un campo svuotato torna alla norma",
     monitorLimits(vGroup, { limits: { voltage: { warnLow: "" } } }).warnLow === 207);
  ok("un valore non numerico non diventa una soglia",
     monitorLimits(tGroup, { limits: { temperature: { warnHigh: "caldo" } } }).warnHigh === 70);
  ok("un gruppo senza soglie predefinite resta senza",
     monitorLimits(cGroup, {}).warnHigh === null);

  const L = monitorLimits(vGroup, {});
  ok("in tolleranza", limitVerdict(230, L) === "ok");
  ok("sotto la soglia di avviso", limitVerdict(205, L) === "warn");
  ok("sopra la soglia di avviso", limitVerdict(255, L) === "warn");
  ok("sotto la soglia di allarme", limitVerdict(190, L) === "alarm");
  ok("sopra la soglia di allarme", limitVerdict(270, L) === "alarm");
  ok("l'allarme vince sull'avviso", limitVerdict(190, L) !== "warn");
  ok("un valore non numerico non genera allarmi", limitVerdict(NaN, L) === "ok");
  ok("senza soglie non si allarma mai",
     limitVerdict(9999, monitorLimits(cGroup, {})) === "ok");

  // real readings from the phone screenshot: 234-240 V, all inside tolerance
  ok("le tensioni reali dell'impianto sono in tolleranza",
     [239, 240, 236, 238, 234].every(v => limitVerdict(v, L) === "ok"));

  ok("l'intestazione dichiara le soglie in vigore",
     limitHint(vGroup, L) === "avviso < 207 o > 253 V", limitHint(vGroup, L));
  ok("un gruppo senza soglie lo dice",
     limitHint(cGroup, monitorLimits(cGroup, {})) === "nessuna soglia");
  ok("con soglia solo alta l'intestazione non inventa quella bassa",
     limitHint(tGroup, monitorLimits(tGroup, {})) === "avviso > 70 °C",
     limitHint(tGroup, monitorLimits(tGroup, {})));

  // the card must judge against the custom limit, not the standard
  states["sensor.arm_temp"] = S("78", { friendly_name: "Armadio server", device_class: "temperature", unit_of_measurement: "°C" });
  const base = { id: "m2", type: "monitor", entity_id: "", name: "", size: "lg",
    appearance: {}, states: {}, actions: {}, groups: ["temperature"], max_per_group: 8,
    entities: { temperature: ["sensor.arm_temp"] } };
  const strict = el._monitorRows(tGroup, base);
  ok("78 gradi supera la soglia di norma", strict[0].warn === true);
  const relaxed = el._monitorRows(tGroup, { ...base, limits: { temperature: { warnHigh: 85, alarmHigh: 95 } } });
  ok("alzando la soglia la stessa lettura torna normale",
     relaxed[0].warn === false && relaxed[0].alarm === false);
  const tight = el._monitorRows(tGroup, { ...base, limits: { temperature: { alarmHigh: 60 } } });
  ok("abbassando la soglia di allarme la lettura diventa allarme", tight[0].alarm === true);
  delete states["sensor.arm_temp"];

  // power factor is judged on magnitude, not sign
  states["sensor.pf_neg"] = S("-0.95", { friendly_name: "Cosphi export", device_class: "power_factor", unit_of_measurement: "" });
  const pfGroup = MONITOR_GROUPS_TEST.find(g => g.key === "power_factor");
  const pf = el._monitorRows(pfGroup, { entities: { power_factor: ["sensor.pf_neg"] }, max_per_group: 8 });
  ok("un fattore di potenza negativo non è un guasto", pf[0].warn === false && pf[0].alarm === false,
     JSON.stringify({ warn: pf[0].warn, alarm: pf[0].alarm }));
  delete states["sensor.pf_neg"];
}

console.log("\n== 21. CARD STANZA ==");
{
  el._registry = {
    areas: [{ area_id: "soggiorno", name: "Soggiorno", icon: "mdi:sofa" },
            { area_id: "bagno", name: "Bagno", icon: null }],
    byArea: { soggiorno: ["light.sog_1", "light.sog_2", "climate.sog", "cover.sog_tap",
                          "switch.sog_presa", "sensor.sog_t", "sensor.sog_h",
                          "sensor.sog_rssi", "binary_sensor.sog_porta"],
              bagno: [] },
    entityArea: {}, category: { "sensor.sog_rssi": "diagnostic" } };
  states["light.sog_1"] = S("on", { friendly_name: "Faretti", supported_color_modes: ["brightness"], brightness: 180 });
  states["light.sog_2"] = S("off", { friendly_name: "Piantana", supported_color_modes: ["hs"] });
  states["climate.sog"] = S("heat", { friendly_name: "Termostato", current_temperature: 21.4, temperature: 22 });
  states["cover.sog_tap"] = S("open", { friendly_name: "Tapparella", current_position: 70 });
  states["switch.sog_presa"] = S("on", { friendly_name: "Presa TV" });
  states["sensor.sog_t"] = S("21.4", { friendly_name: "Soggiorno Temperatura", device_class: "temperature", unit_of_measurement: "°C" });
  states["sensor.sog_h"] = S("47", { friendly_name: "Soggiorno Umidità", device_class: "humidity", unit_of_measurement: "%" });
  states["sensor.sog_rssi"] = S("-58", { friendly_name: "RSSI" });
  states["binary_sensor.sog_porta"] = S("off", { friendly_name: "Porta", device_class: "door" });

  const card = { id: "rc1", type: "room", entity_id: "", name: "Soggiorno", size: "md",
    appearance: {}, states: {}, actions: {}, area: "soggiorno", hidden: [], max_readings: 4,
    show_others: true, grouping: "domain" };
  const h = el._roomCardBody(card);
  ok("la card raccoglie i dispositivi dell'area", el._roomCardEntities(card).length === 8,
     String(el._roomCardEntities(card).length));
  ok("le entità di diagnostica restano fuori", !el._roomCardEntities(card).includes("sensor.sog_rssi"));
  ok("le letture numeriche vanno in testa", h.includes("rc-strip") && h.includes("21.4"));
  ok("le luci hanno il loro blocco con il conteggio acceso", h.includes("Luci") && h.includes(">1/2<"),
     (h.match(/<em>[^<]*<\/em>/g) || []).join());
  ok("il clima mostra attuale e impostata", h.includes("21.4°") && h.includes("22°"));
  ok("la tapparella ha apri, ferma e chiudi",
     h.includes("open_cover") && h.includes("stop_cover") && h.includes("close_cover"));
  ok("la tapparella non usa turn_on", !h.includes("cover|turn_on"));
  ok("la posizione della tapparella è mostrata", h.includes("70%"));
  ok("le prese sono comandabili", h.includes("data-toggle-entity=\"switch.sog_presa\""));
  ok("c'è lo spegnimento delle luci della stanza", h.includes('data-room-lights-off="soggiorno"'));
  ok("una luce dimmerabile ha il cursore", h.includes('data-light-bri="light.sog_1"'));
  ok("una luce a colori offre il pannello", h.includes('data-light-open="light.sog_2"'));

  card.hidden = ["switch.sog_presa", "light.sog_2"];
  const h2 = el._roomCardBody(card);
  ok("nascondere un dispositivo lo toglie dalla card", !h2.includes("Presa TV") && !h2.includes("Piantana"));
  ok("gli altri restano", h2.includes("Faretti"));
  card.hidden = [];

  card.show_others = false;
  ok("il gruppo Altro si può togliere", !el._roomCardBody(card).includes("Altro"));
  card.show_others = true;

  card.max_readings = 0;
  ok("le letture in testa si possono azzerare", !el._roomCardBody(card).includes("rc-strip"));
  card.max_readings = 4;

  ok("un'area vuota lo dice", el._roomCardBody({ ...card, area: "bagno" }).includes("Nessun dispositivo"));
  ok("senza area la card spiega cosa fare", el._roomCardBody({ ...card, area: null }).includes("Collega quest"));
  ok("card stanza: nessun undefined", !/>undefined</.test(h) && !h.includes("[object"));

  for (const id of ["light.sog_1","light.sog_2","climate.sog","cover.sog_tap","switch.sog_presa",
                    "sensor.sog_t","sensor.sog_h","sensor.sog_rssi","binary_sensor.sog_porta"]) delete states[id];
  el._registry = null;
}

console.log("\n== 22. AUTO ELETTRICA ==");
{
  states["sensor.auto_batteria"] = S("62", { friendly_name: "Model 3 Batteria", device_class: "battery", unit_of_measurement: "%" });
  states["sensor.wallbox_potenza"] = S("7.4", { friendly_name: "Wallbox Potenza", device_class: "power", unit_of_measurement: "kW" });
  states["binary_sensor.auto_in_carica"] = S("on", { friendly_name: "Model 3 In carica" });
  states["binary_sensor.auto_collegata"] = S("on", { friendly_name: "Model 3 Collegata" });
  states["sensor.auto_autonomia"] = S("312", { friendly_name: "Model 3 Autonomia", unit_of_measurement: "km" });
  states["number.auto_obiettivo"] = S("80", { friendly_name: "Model 3 Obiettivo", unit_of_measurement: "%" });
  states["switch.wallbox_carica"] = S("on", { friendly_name: "Wallbox Carica" });
  states["number.wallbox_corrente"] = S("16", { friendly_name: "Wallbox Corrente", min: 6, max: 32, step: 1 });

  const car = { id: "ev1", name: "Model 3", icon: "mdi:car-electric", color: "#06d6a0",
    battery: "sensor.auto_batteria", charging: "binary_sensor.auto_in_carica",
    power: "sensor.wallbox_potenza", energy: null, range: "sensor.auto_autonomia",
    plugged: "binary_sensor.auto_collegata", target: "number.auto_obiettivo",
    switch: "switch.wallbox_carica", current: "number.wallbox_corrente", capacity: 60 };

  const vs = vehicleState(car, states);
  ok("legge lo stato di carica", vs.soc === 62);
  // 7.4 kW in a kW-unit sensor: the unit-aware reader is what stops this
  // being 7.4 W and the whole estimate being nonsense
  ok("la potenza rispetta l'unità di misura", vs.powerW === 7400, String(vs.powerW));
  ok("sa che sta caricando", vs.charging === true);
  ok("sa che è collegata", vs.plugged === true);
  ok("legge l'autonomia", vs.rangeKm === 312);
  ok("legge l'obiettivo", vs.target === 80);
  // 60 kWh * (80-62)/100 = 10.8 kWh a 7.4 kW = 87.5 min
  ok("stima il tempo alla carica", vs.etaMin === 88, String(vs.etaMin));
  ok("lo stato è leggibile", vs.status === "in carica");

  const noCap = vehicleState({ ...car, capacity: null }, states);
  ok("senza capacità non inventa un tempo", noCap.etaMin === null);
  const full = vehicleState({ ...car }, { ...states, "sensor.auto_batteria": S("80", {}) });
  ok("arrivata all'obiettivo non c'è più tempo residuo", full.etaMin === null);
  const slow = vehicleState({ ...car }, { ...states,
    "sensor.wallbox_potenza": S("0.3", { device_class: "power", unit_of_measurement: "kW" }) });
  ok("una carica lentissima non stampa un conto alla rovescia assurdo", slow.etaMin === null,
     String(slow.etaMin));

  // no dedicated charging entity: inferred from power, with a threshold that
  // rejects a charger idling
  const inferred = vehicleState({ ...car, charging: null }, states);
  ok("senza sensore dedicato la carica si deduce dalla potenza", inferred.charging === true);
  const idle = vehicleState({ ...car, charging: null },
    { ...states, "sensor.wallbox_potenza": S("120", { device_class: "power", unit_of_measurement: "W" }) });
  ok("una colonnina a riposo non risulta in carica", idle.charging === false);

  const bare = vehicleState({ id: "x", name: "Colonnina", power: "sensor.wallbox_potenza" }, states);
  ok("una colonnina senza auto funziona lo stesso", bare.powerW === 7400 && bare.soc === null);
  ok("una batteria sconosciuta resta sconosciuta, non zero",
     vehicleState({ id: "y", name: "N", power: "sensor.wallbox_potenza" }, states).soc === null);

  ok("il colore segue lo stato di carica",
     socColor(5) !== socColor(50) && socColor(50) !== socColor(90) && socColor(null) === "#8d99ae");
  ok("i tempi sono leggibili", etaWords(45) === "45 min" && etaWords(88) === "1 h 28" && etaWords(120) === "2 h");

  // -- la card --
  el._dashboard = { version: 6, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [car], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [
      { id: "s1", title: "Auto", icon: "mdi:car", accent: "#06d6a0", items: [
        { id: "evcard", type: "ev", entity_id: "", name: "", size: "lg",
          appearance: {}, states: {}, actions: {}, vehicles: [], show_controls: true }]}]}]};
  el._pageIndex = 0; el._editing = false; el._selected = null;
  el.render();
  const eh = el.innerHTML;
  ok("la card mostra l'anello di carica", eh.includes("ev-ring") && eh.includes(">62<"));
  ok("l'anello pulsa mentre carica", eh.includes("ev-ring charging"));
  ok("mostra la potenza in kW", eh.includes("7.4") || eh.includes("7,4"), (eh.match(/ev-row[^]{0,120}/) || [""])[0]);
  ok("mostra l'autonomia", eh.includes("312 km"));
  ok("mostra il tempo alla carica", eh.includes("1 h 28"));
  ok("mostra l'obiettivo come tacca sulla barra", eh.includes("ev-target"));
  ok("offre di fermare la carica", eh.includes('data-ev-switch="switch.wallbox_carica"') && eh.includes("FERMA"));
  ok("offre il limite di corrente", eh.includes('data-ev-current="number.wallbox_corrente"'));
  ok("card auto: nessun undefined", !/>undefined</.test(eh) && !eh.includes("[object"));

  // an empty dashboard must explain itself, not break
  el._dashboard.vehicles = [];
  el.render();
  ok("senza auto la card spiega cosa fare", el.innerHTML.includes("Nessuna auto elettrica configurata"));
  el._dashboard.vehicles = [car];

  // -- rilevamento --
  const found = el._detectVehicles();
  ok("riconosce l'auto in Home Assistant", found.length >= 1, String(found.length));
  ok("aggancia la batteria giusta", found[0].battery === "sensor.auto_batteria", String(found[0].battery));
  ok("aggancia la potenza della colonnina", found[0].power === "sensor.wallbox_potenza");

  // -- nel flusso energetico --
  const flow = { grid: "sensor.rete_potenza_attiva_totale", devices: [] };
  const loads = el._flowLoads(flow, 9000);
  const evLoad = loads.find((l) => l.vehicle);
  ok("l'auto entra da sola nel flusso", !!evLoad);
  ok("nel flusso porta con sé lo stato di carica", evLoad && evLoad.soc === 62 && evLoad.charging === true);
  ok("nel flusso pesa quanto assorbe davvero", evLoad && evLoad.watts === 7400, evLoad && String(evLoad.watts));
  // adding the wallbox by hand as well must not count it twice
  const dup = el._flowLoads({ devices: [{ entity: "sensor.wallbox_potenza", name: "Wallbox" }] }, 9000);
  ok("aggiungerla a mano non la conta due volte",
     dup.filter((l) => l.entity === "sensor.wallbox_potenza").length === 1,
     String(dup.filter((l) => l.entity === "sensor.wallbox_potenza").length));
  ok("si può escludere dal flusso",
     !el._flowLoads({ devices: [], show_vehicles: false }, 9000).some((l) => l.vehicle));

  // -- nel garage sulla mappa --
  el._dashboard.pages.push({ id: "map", type: "floorplan", title: "Mappa 3D", icon: "mdi:floor-plan",
    view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true, show_labels: true,
            level_gap: 150, active_level: null },
    rooms: [{ id: "garage", area_id: null, title: "Garage", icon: "mdi:garage", color: "#8ecae6",
              x: 0, y: 0, w: 240, h: 200, level: 0, points: null, spots: {}, hidden: [],
              walls: [], entities: [], vehicles: ["ev1"] },
            { id: "salotto", area_id: null, title: "Salotto", icon: "mdi:sofa", color: "#00e5ff",
              x: 260, y: 0, w: 240, h: 200, level: 0, points: null, spots: {}, hidden: [],
              walls: [], entities: [], vehicles: [] }] });
  el._pageIndex = 1; el._focus = null;
  el.render();
  const mh2 = el.innerHTML;
  ok("l'auto compare nel garage", mh2.includes('data-spot="vehicle:ev1"'));
  ok("il garage mostra la percentuale", mh2.includes("62%"));
  ok("l'auto in carica è marcata sulla mappa", mh2.includes("fp-car charging"));
  ok("una stanza senza auto non ne disegna",
     (mh2.split('data-room="salotto"')[1] || "").split("fp-car")[0].indexOf("fp-cars") === -1);
  ok("la mappa mostra l'auto anche senza entrare nella stanza", !el._focus);

  states["binary_sensor.auto_in_carica"] = S("off", { friendly_name: "Model 3 In carica" });
  el._signature = ""; el.render();
  ok("finita la carica il fulmine sparisce", !el.innerHTML.includes("fp-car charging"));

  for (const id of ["sensor.auto_batteria","sensor.wallbox_potenza","binary_sensor.auto_in_carica",
                    "binary_sensor.auto_collegata","sensor.auto_autonomia","number.auto_obiettivo",
                    "switch.wallbox_carica","number.wallbox_corrente"]) delete states[id];
  el._dashboard = { version: 6, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
  el._pageIndex = 0;
  ok("stato ripristinato dopo la sezione 22", !el._isFloorplan());
}

console.log("\n== 23. AZIONE AL TOCCO, ROTAZIONE, SEZIONI-PAGINA ==");
{
  states["switch.caldaia"] = S("on", { friendly_name: "Caldaia" });
  states["light.studio"] = S("on", { friendly_name: "Luce studio", supported_color_modes: ["onoff"] });
  el._registry = { areas: [{ area_id: "studio", name: "Studio" }],
    byArea: { studio: ["switch.caldaia", "light.studio"] },
    entityArea: { "switch.caldaia": "Studio", "light.studio": "Studio" },
    category: {}, entityDevice: { "switch.caldaia": "d1", "light.studio": "d1" },
    deviceName: { d1: "Quadro" } };

  // -- il bug: la riga ignorava l'azione scelta --
  const rowToggle = el._deviceRow("switch.caldaia", states["switch.caldaia"], true, "rc-row", { row_action: "toggle" });
  const rowInfo = el._deviceRow("switch.caldaia", states["switch.caldaia"], true, "rc-row", { row_action: "more-info" });
  ok("di default la riga accende e spegne", rowToggle.includes('data-toggle-entity="switch.caldaia"'));
  ok("scegliendo i dettagli la riga NON commuta più",
     !rowInfo.includes("data-toggle-entity") && rowInfo.includes('data-more-info="switch.caldaia"'));
  ok("l'icona resta sempre disponibile per l'altra azione",
     rowToggle.includes('data-row-act="switch.caldaia"') && rowInfo.includes('data-row-act="switch.caldaia"'));
  ok("senza impostazione il comportamento è quello storico",
     el._deviceRow("switch.caldaia", states["switch.caldaia"], true, "rc-row", {}).includes("data-toggle-entity"));

  // and end to end through the card
  const roomCard = { id: "rc9", type: "room", entity_id: "", name: "", size: "md",
    appearance: {}, states: {}, actions: {}, area: "studio", hidden: [], max_readings: 4,
    show_others: true, row_action: "more-info" };
  const rh = el._roomCardBody(roomCard);
  ok("la card stanza rispetta i dettagli", !rh.includes("data-toggle-entity"), 
     (rh.match(/data-toggle-entity="[^"]*"/g) || []).join());
  roomCard.row_action = "toggle";
  ok("e torna a commutare quando lo chiedi", el._roomCardBody(roomCard).includes("data-toggle-entity"));

  const actCard = { id: "ac9", type: "active", entity_id: "", name: "", size: "lg",
    appearance: {}, states: {}, actions: {}, domains: [], max: 12, exclude: [], row_action: "more-info" };
  ok("anche attivi ora rispetta i dettagli",
     !el._activeBody(actCard).includes("data-toggle-entity"));

  // -- esclusione per entità --
  actCard.row_action = "toggle";
  const before = el._activeEntities(actCard).length;
  actCard.exclude = ["switch.caldaia"];
  ok("un'entità esclusa sparisce dagli attivi",
     el._activeEntities(actCard).length === before - 1 &&
     !el._activeEntities(actCard).some(r => r.id === "switch.caldaia"));
  const ed = el._activeExcludeEditor(actCard);
  ok("l'editor elenca i candidati", ed.includes("switch.caldaia") && ed.includes("light.studio"));
  ok("l'editor raggruppa per dispositivo", ed.includes("Quadro") && ed.includes("data-active-dev"));
  ok("l'entità esclusa è marcata", /room-ent hidden[^]*?switch\.caldaia|switch\.caldaia[^]*?room-ent hidden/.test(ed)
     || ed.includes("room-ent hidden"));
  ok("l'editor dice quanti sono visibili", ed.includes("visibili su"));
  actCard.exclude = [];

  // -- rotazione della stanza --
  el._dashboard = { version: 6, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "map", type: "floorplan", title: "Mappa", icon: "mdi:floor-plan",
      view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true, show_labels: true,
              level_gap: 150, active_level: null },
      rooms: [{ id: "r1", area_id: null, title: "Sala", icon: "mdi:sofa", color: "#00e5ff",
                x: 0, y: 0, w: 200, h: 160, level: 0, points: null, spots: {}, hidden: [],
                walls: [], entities: [], vehicles: [], rotation: 0 }] }]};
  el._pageIndex = 0; el._editing = true; el._selected = { kind: "room", roomId: "r1" }; el._focus = null;
  el.render();
  ok("senza rotazione non compare nessun rotateZ sulla stanza",
     !/data-room="r1"[^]*?rotateZ/.test(el.innerHTML.split("data-room=\"r1\"")[1].slice(0, 400)));
  ok("compare la maniglia di rotazione", el.innerHTML.includes('data-rotate="r1"'));
  el._room("r1").rotation = 30;
  el._signature = ""; el.render();
  ok("con la rotazione la stanza viene girata", el.innerHTML.includes("rotateZ(30deg)"));
  ok("l'editor mostra il cursore di rotazione", el.innerHTML.includes('data-room-prop="rotation"'));

  // a delta must be turned back into the room's own frame, or dragging the
  // side of a rotated room moves it diagonally
  const straight = unrotate({ dx: 10, dy: 0 }, 0);
  ok("senza rotazione il delta non viene toccato", straight.dx === 10 && straight.dy === 0);
  const turned = unrotate({ dx: 10, dy: 0 }, 90);
  ok("a 90 gradi un movimento orizzontale diventa verticale",
     Math.abs(turned.dx) < 1e-9 && Math.abs(turned.dy + 10) < 1e-9,
     turned.dx.toFixed(3) + "," + turned.dy.toFixed(3));
  const back = unrotate(unrotate({ dx: 7, dy: -3 }, 37), -37);
  ok("ruotare e tornare indietro riporta al punto di partenza",
     Math.abs(back.dx - 7) < 1e-9 && Math.abs(back.dy + 3) < 1e-9);

  // -- sezione in una scheda propria --
  el._editing = true;
  el._dashboard = { version: 6, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:home", layout: {}, sections: [
      { id: "s-energia", title: "Energia", icon: "mdi:flash", accent: "#ffd166", collapsed: false, items: [] },
      { id: "s-sicur", title: "Sicurezza", icon: "mdi:shield", accent: "#ff3d71", collapsed: false, items: [] }]},
    { id: "map", type: "floorplan", title: "Mappa 3D", icon: "mdi:floor-plan",
      view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true, show_labels: true,
              level_gap: 150, active_level: null }, rooms: [] }]};
  el._pageIndex = 0; el._selected = { kind: "section", sectionId: "s-energia" };
  el._moveSectionToPage("s-energia", "__own");
  ok("la sezione diventa una pagina a sé", el._dashboard.pages.length === 3);
  ok("la nuova pagina prende nome e icona della sezione",
     el._dashboard.pages[1].title === "Energia" && el._dashboard.pages[1].icon === "mdi:flash");
  ok("la nuova scheda sta accanto a quella di origine, non in fondo",
     el._dashboard.pages[1].sections[0].id === "s-energia" && el._dashboard.pages[2].type === "floorplan");
  ok("la sezione non è più nella pagina di partenza",
     !el._dashboard.pages[0].sections.some(x => x.id === "s-energia"));
  ok("la pagina di partenza resta perché ha ancora una sezione",
     el._dashboard.pages[0].sections.length === 1);
  ok("ci si ritrova sulla pagina nuova", el._pageIndex === 1);

  // and back again
  el._moveSectionToPage("s-energia", "0");
  ok("si può rimetterla dentro un'altra pagina",
     el._dashboard.pages[0].sections.some(x => x.id === "s-energia"));
  ok("la pagina rimasta vuota viene rimossa", el._dashboard.pages.length === 2,
     el._dashboard.pages.map(p2 => p2.id).join());
  ok("la mappa 3D non viene mai eliminata", el._dashboard.pages.some(p2 => p2.type === "floorplan"));

  // moving the only section of the only page must not delete the last page
  el._dashboard.pages = [{ id: "solo", type: "sections", title: "Solo", icon: "mdi:home", layout: {},
    sections: [{ id: "s1", title: "Uno", icon: "mdi:x", accent: "#fff", collapsed: false, items: [] }] }];
  el._pageIndex = 0;
  el._moveSectionToPage("s1", "__own");
  ok("non resta mai zero pagine", el._dashboard.pages.length >= 1);
  ok("la sezione è comunque su una pagina",
     el._dashboard.pages.some(p2 => (p2.sections || []).some(x => x.id === "s1")));

  el._editing = false; el._selected = null;
  delete states["switch.caldaia"]; delete states["light.studio"];
  el._registry = null;
  el._dashboard = { version: 6, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
  el._pageIndex = 0;
  ok("stato ripristinato dopo la sezione 23", !el._isFloorplan());
}

console.log("\n== 24. VERSIONE IN ESECUZIONE ==");
{
  // A custom element can only be defined once. An old cached copy loading
  // first wins the name and every later copy is ignored, so the panel keeps
  // running old code while the integration reports the new version — exactly
  // what "non vedo le modifiche applicate" looks like from the outside.
  el._dashboard = { version: 6, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
  el._pageIndex = 0; el._editing = false; el._selected = null;
  el.panel = undefined; el._cardConfig = undefined;
  el.render();
  ok("la build in esecuzione è sempre scritta nell'intestazione",
     el.innerHTML.includes("v" + CYBORG_BUILD_TEST), CYBORG_BUILD_TEST);
  ok("senza versione dal server non si accusa nessuno", !el._staleBuild());

  el.panel = { config: { version: CYBORG_BUILD_TEST } };
  el.render();
  ok("versioni allineate: nessun avviso", !el._staleBuild() && !el.innerHTML.includes("SVUOTA LA CACHE"));

  el.panel = { config: { version: "9.9.9" } };
  el._signature = ""; el.render();
  ok("versioni diverse: l'avviso compare", el._staleBuild());
  ok("l'avviso dice tutte e due le versioni",
     el.innerHTML.includes("SVUOTA LA CACHE") && el.innerHTML.includes("9.9.9")
     && el.innerHTML.includes(CYBORG_BUILD_TEST));
  el.panel = undefined;
  el._signature = ""; el.render();
  ok("tolta la discrepanza l'avviso sparisce", !el.innerHTML.includes("SVUOTA LA CACHE"));
}

console.log("\n== 25. LUCI LIBERE, COMFORT, STANZE SELEZIONABILI ==");
{
  // -- luci comandate da prese --
  states["light.sala_dim"] = S("on", { friendly_name: "Faretti sala", supported_color_modes: ["brightness"], brightness: 200 });
  states["switch.piantana"] = S("on", { friendly_name: "Piantana su presa" });
  states["input_boolean.scena"] = S("off", { friendly_name: "Scena notte" });

  const lightsCard = { id: "lc", type: "lights", entity_id: "", name: "", size: "xl",
    appearance: {}, states: {}, actions: {}, lights: [], group_by_area: true, row_action: "toggle" };
  ok("in automatico prende solo il dominio light",
     el._lightEntities(lightsCard).every(id => id.startsWith("light.")));
  lightsCard.lights = ["light.sala_dim", "switch.piantana", "input_boolean.scena"];
  ok("scelte a mano accetta qualsiasi entità",
     el._lightEntities(lightsCard).length === 3, String(el._lightEntities(lightsCard).length));

  const rowSwitch = el._lightRow("switch.piantana", lightsCard);
  const rowLight = el._lightRow("light.sala_dim", lightsCard);
  ok("una presa è comandabile dalla card", rowSwitch.includes('data-light-toggle="switch.piantana"'));
  // a relay has no brightness: offering a slider that does nothing would be a lie
  ok("una presa non mostra il cursore di intensità", !rowSwitch.includes("data-light-bri"));
  ok("una luce dimmerabile lo mostra", rowLight.includes('data-light-bri="light.sala_dim"'));
  ok("una presa non mostra il pannello colore", !rowSwitch.includes("data-light-open"));
  ok("il testo di una presa è al maschile", rowSwitch.includes("acceso"));
  ok("il testo di una luce è al femminile", rowLight.includes("%"));

  // the toggle must go through the entity's own domain
  wsCalls.length = 0;
  el._toggleEntity("switch.piantana");
  ok("una presa viene commutata dal suo dominio",
     wsCalls.some(c => c.service === "switch.toggle"), JSON.stringify(wsCalls));
  wsCalls.length = 0;
  el._toggleEntity("light.sala_dim");
  ok("una luce viene commutata dal dominio light", wsCalls.some(c => c.service === "light.toggle"));
  wsCalls.length = 0;

  const body = el._lightsBody(lightsCard);
  ok("la card conta accese anche le prese", /3<\/span>|di 3/.test(body), body.slice(body.indexOf("li-count"), body.indexOf("li-count") + 140));

  // -- comfort --
  el._registry = {
    areas: [{ area_id: "cucina", name: "Cucina", icon: "mdi:silverware" },
            { area_id: "balcone", name: "Balcone OVEST", icon: "mdi:balcony" },
            { area_id: "ripostiglio", name: "Ripostiglio", icon: null }],
    byArea: { cucina: ["sensor.cu_t", "sensor.cu_h", "sensor.cu_rssi"],
              balcone: ["sensor.ba_t", "sensor.ba_h"],
              ripostiglio: ["light.rip"] },
    entityArea: {}, category: { "sensor.cu_rssi": "diagnostic" },
    entityDevice: {}, deviceName: {} };
  states["sensor.cu_t"] = S("24.6", { friendly_name: "Cucina T", device_class: "temperature", unit_of_measurement: "°C" });
  states["sensor.cu_h"] = S("25", { friendly_name: "Cucina H", device_class: "humidity", unit_of_measurement: "%" });
  states["sensor.cu_rssi"] = S("-60", { friendly_name: "RSSI", device_class: "temperature" });
  states["sensor.ba_t"] = S("26.7", { friendly_name: "Balcone T", device_class: "temperature", unit_of_measurement: "°C" });
  states["sensor.ba_h"] = S("27", { friendly_name: "Balcone H", device_class: "humidity", unit_of_measurement: "%" });
  states["light.rip"] = S("off", { friendly_name: "Luce ripostiglio" });

  const cf = { id: "cf", type: "comfort", entity_id: "", name: "", size: "xl",
    appearance: {}, states: {}, actions: {}, rooms: [], bands: {}, filter: "" };
  const cfRooms = el._comfortRooms(cf);
  ok("una riga per area con la temperatura", cfRooms.length === 2, String(cfRooms.length));
  ok("l'umidità della stessa area viene abbinata",
     cfRooms[0].humidity === "sensor.cu_h" && cfRooms[1].humidity === "sensor.ba_h");
  ok("un'area senza temperatura non compare", !cfRooms.some(r => r.name === "Ripostiglio"));
  ok("le entità di diagnostica non vengono scambiate per sensori di stanza",
     cfRooms[0].temperature === "sensor.cu_t");

  const B = comfortBands({});
  ok("i valori consigliati sono quelli", B.cold === 18 && B.warm === 26 && B.dry === 30 && B.humid === 60);
  ok("una soglia personalizzata vince", comfortBands({ bands: { warm: 28 } }).warm === 28);
  ok("una soglia illeggibile torna al consigliato", comfortBands({ bands: { warm: "caldo" } }).warm === 26);

  ok("24.6 con 25% di umidità è secco, non comfort",
     comfortVerdict(24.6, 25, B).k === "dry", comfortVerdict(24.6, 25, B).k);
  ok("22 con 45% è comfort", comfortVerdict(22, 45, B).k === "ok");
  ok("22 con 75% è umido", comfortVerdict(22, 75, B).k === "humid");
  ok("26.7 è caldo", comfortVerdict(26.7, 27, B).k === "hot");
  ok("15 è freddo", comfortVerdict(15, 45, B).k === "cold");
  ok("senza temperatura il giudizio è N/D", comfortVerdict(null, 45, B).k === "na");
  ok("senza umidità e in range resta comfort", comfortVerdict(22, null, B).k === "ok");
  // alzando la soglia il balcone smette di essere caldo
  ok("le soglie cambiano davvero il giudizio",
     comfortVerdict(26.7, 27, comfortBands({ bands: { warm: 28 } })).k === "dry");

  // the scale is fixed so rooms are comparable
  ok("la scala è la stessa per tutti", comfortPosition(12) === 0 && comfortPosition(34) === 100);
  ok("una temperatura fuori scala viene limitata, non esce dal riquadro",
     comfortPosition(45) === 100 && comfortPosition(-5) === 0);
  ok("il balcone sta più a destra della cucina",
     comfortPosition(26.7) > comfortPosition(24.6));
  ok("senza temperatura non c'è marcatore", comfortPosition(null) === null);

  const cfh = el._comfortBody(cf);
  ok("la card mostra una scheda per stanza", (cfh.match(/class="cf-room"/g) || []).length === 2);
  ok("mostra il giudizio", cfh.includes("SECCO") && cfh.includes("CALDO"));
  ok("mostra temperatura e umidità", cfh.includes("24.6") && cfh.includes("27"));
  ok("c'è il filtro per stanza", cfh.includes('data-comfort-filter="cucina"') && cfh.includes("TUTTE"));
  ok("c'è la scala colore con il marcatore", cfh.includes("cf-scale") && cfh.includes("left:"));
  cf.filter = "cucina";
  ok("il filtro mostra una sola stanza",
     (el._comfortBody(cf).match(/class="cf-room"/g) || []).length === 1);
  cf.filter = "";
  ok("comfort: nessun undefined", !/>undefined</.test(cfh) && !cfh.includes("[object"));

  // -- stanze tutte selezionabili sulla mappa --
  el._dashboard = { version: 6, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "map", type: "floorplan", title: "Mappa", icon: "mdi:floor-plan",
      view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true, show_labels: true,
              level_gap: 150, active_level: null },
      rooms: ["Balcone", "Cucina", "Soggiorno"].map((t, i) => ({
        id: "r" + i, area_id: null, title: t, icon: "mdi:home", color: "#00e5ff",
        // deliberately overlapping, which is what made some rooms unreachable
        x: i * 40, y: i * 30, w: 220, h: 180, level: 0, points: null, spots: {},
        hidden: [], walls: [], entities: [], vehicles: [], rotation: 0 })) }]};
  el._pageIndex = 0; el._editing = true; el._selected = null; el._focus = null;
  el.render();
  const mh3 = el.innerHTML;
  ok("ogni stanza è raggiungibile dall'elenco nel pannello",
     ["r0", "r1", "r2"].every(id => mh3.includes(`data-pick-room="${id}"`)));
  ok("l'elenco mostra i nomi veri",
     mh3.includes("Balcone") && mh3.includes("Cucina") && mh3.includes("Soggiorno"));
  // The badge strips floated over the neighbouring rooms and swallowed their
  // clicks, which is why some rooms could not be selected at all. Match the
  // markup, not the class name — the stylesheet is inlined in innerHTML and
  // mentions .fp-badges too.
  states["light.strip_test"] = S("on", { friendly_name: "Luce test" });
  el._rooms().forEach(r => { r.entities = ["light.strip_test"]; });
  el._signature = ""; el.render();
  ok("in modifica nessuna stanza mostra le targhette di stato",
     !el.innerHTML.includes('<div class="fp-badges">'));
  ok("il pavimento è ciò che riceve il clic, non il rettangolo",
     el.innerHTML.includes('class="fp-floor"'));
  el._editing = false;
  el._signature = ""; el.render();
  ok("fuori modifica le targhette tornano",
     el.innerHTML.includes('<div class="fp-badges">'));
  delete states["light.strip_test"];

  for (const id of ["light.sala_dim","switch.piantana","input_boolean.scena","sensor.cu_t","sensor.cu_h",
                    "sensor.cu_rssi","sensor.ba_t","sensor.ba_h","light.rip"]) delete states[id];
  el._registry = null;
  el._dashboard = { version: 6, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
  el._pageIndex = 0; el._editing = false; el._selected = null;
  ok("stato ripristinato dopo la sezione 25", !el._isFloorplan());
}

console.log("\n== 26. ORDINE DECISO DALL'UTENTE: PAGINE E SEZIONI ==");
{
  const P = (id, title) => ({ id, type: "sections", title, icon: "mdi:x", sections: [] });
  el._registry = null;
  el._dashboard = { version: 6, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    P("a", "Dashboard"), P("b", "Mappa 3D"), P("c", "Energia"), P("d", "Luci")] };
  el._pageIndex = 0; el._editing = true; el._selected = null; el._focus = null;
  const titles = () => el._dashboard.pages.map(p => p.title);

  // A drop is an insertion, not a swap: moving Energia to the front must slide
  // the others right, not trade places with Dashboard.
  el._reorderPage(2, 0);
  ok("trascinare una pagina la inserisce, non la scambia",
     titles().join(">") === "Energia>Dashboard>Mappa 3D>Luci", titles().join(">"));

  // The user was on "Dashboard" (index 0). After the move it is index 1, and
  // they must still be looking at Dashboard.
  ok("dopo il riordino resti sulla pagina che stavi guardando",
     el._dashboard.pages[el._pageIndex].title === "Dashboard",
     el._dashboard.pages[el._pageIndex].title);

  el._reorderPage(0, 3);
  ok("una pagina può finire in fondo",
     titles().join(">") === "Dashboard>Mappa 3D>Luci>Energia", titles().join(">"));
  ok("l'indice corrente segue ancora la stessa pagina",
     el._dashboard.pages[el._pageIndex].title === "Dashboard");

  const before = titles().join(">");
  el._reorderPage(1, 1);
  ok("lasciare cadere una pagina su se stessa non fa niente", titles().join(">") === before);
  el._reorderPage(9, 0);
  ok("un indice fuori intervallo viene ignorato", titles().join(">") === before);

  // The arrows still work and are what a touch screen has: HTML5 drag events
  // never fire on a phone.
  el._pageIndex = 3;
  el._movePage(3, -1);
  ok("le frecce spostano la pagina attiva",
     titles().join(">") === "Dashboard>Mappa 3D>Energia>Luci", titles().join(">"));
  ok("la freccia porta con sé la pagina attiva",
     el._dashboard.pages[el._pageIndex].title === "Energia", el._dashboard.pages[el._pageIndex].title);

  el._pageIndex = 0;
  el.render();
  const h = el.innerHTML;
  // Scope every assertion to the <nav>: the stylesheet is inlined in innerHTML
  // and mentions .pt-nudge, and the PAGINE side panel emits its own
  // data-page-move buttons for every page. Matching the whole document would
  // pass (or fail) for the wrong reason.
  const nav = (html) => (html.match(/<nav class="page-tabs[\s\S]*?<\/nav>/) || [""])[0];
  const bar = nav(h);
  ok("in modifica ogni scheda è trascinabile",
     bar.length > 0 && [0,1,2,3].every(i => bar.includes(`data-page-drag="${i}"`)));
  ok("solo la scheda attiva mostra le frecce",
     (bar.match(/data-page-move="0:/g) || []).length === 2
     && !bar.includes('data-page-move="1:'));
  ok("la prima scheda non può andare più a sinistra",
     bar.includes('data-page-move="0:-1" disabled'));

  el._editing = false; el._signature = ""; el.render();
  const bar2 = nav(el.innerHTML);
  ok("fuori modifica la barra torna pulita",
     bar2.length > 0 && !bar2.includes("data-page-drag") && !bar2.includes("pt-nudge"));
  ok("ma le schede restano cliccabili", bar2.includes('data-page-tab="2"'));

  // -- sections inside a page --
  el._editing = true;
  const S2 = (id, title) => ({ id, title, icon: "mdi:x", accent: null, collapsed: true, items: [] });
  el._dashboard.pages[0].sections = [S2("s1", "Clima"), S2("s2", "Sicurezza"), S2("s3", "Energia")];
  el._pageIndex = 0; el._signature = ""; el.render();
  const st = () => el._dashboard.pages[0].sections.map(s => s.title);
  el._reorderSection(2, 0);
  ok("anche le sezioni si riordinano trascinandole",
     st().join(">") === "Energia>Clima>Sicurezza", st().join(">"));
  el._reorderSection(0, 2);
  ok("una sezione può scendere in fondo",
     st().join(">") === "Clima>Sicurezza>Energia", st().join(">"));
  el._moveSection("s3", -1);
  ok("le frecce della sezione funzionano ancora",
     st().join(">") === "Clima>Energia>Sicurezza", st().join(">"));

  el._signature = ""; el.render();
  const hs = el.innerHTML;
  ok("l'intestazione della sezione è la maniglia",
     hs.includes('data-sec-drag="0"') && hs.includes('data-sec-drop="0"'));
  ok("le card dentro la sezione non sono trascinabili",
     !hs.includes('<article class="item editor-item" draggable'));

  el._editing = false; el._signature = ""; el.render();
  ok("fuori modifica le sezioni non sono trascinabili",
     !el.innerHTML.includes("data-sec-drag"));

  el._dashboard = { version: 6, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
  el._pageIndex = 0; el._editing = false; el._selected = null;
  ok("stato ripristinato dopo la sezione 26", el._dashboard.pages.length === 1);
}

console.log("\n== 27. TEMPERATURE: SENSORE GIUSTO, ESTERNO COMPRESO, ELENCO A MANO ==");
{
  // The real layout of Oscar's house, faithfully: an outdoor probe with no
  // area at all, a bathroom whose area also contains a Shelly plug that
  // reports its own chip temperature, and a bedroom with TWO temperature
  // sensors (a wall sensor and the air conditioner).
  states["sensor.temperatura_esterna"] = S("24.0", { friendly_name: "Temperatura esterna", device_class: "temperature" });
  states["sensor.system_monitor_processor_temperature"] = S("54.0", { friendly_name: "Processor temperature", device_class: "temperature" });
  states["sensor.sensore_t_h_salotto_temperatura"] = S("24.5", { friendly_name: "Salotto temperatura", device_class: "temperature" });
  states["sensor.sensore_t_h_salotto_umidita"] = S("49.0", { friendly_name: "Salotto umidità", device_class: "humidity" });
  states["sensor.t_u_bagno_temperatura"] = S("24.8", { friendly_name: "Bagno temperatura", device_class: "temperature" });
  states["sensor.t_u_bagno_umidita"] = S("51.0", { friendly_name: "Bagno umidità", device_class: "humidity" });
  states["sensor.shellyplusplugs_e465b8b19f24_temperature"] = S("46.2", { friendly_name: "Shelly Plug S temperature", device_class: "temperature" });
  states["sensor.camera_soppalco_temperatura"] = S("24.8", { friendly_name: "Soppalco temperatura", device_class: "temperature" });
  states["sensor.camera_soppalco_umidita"] = S("49.0", { friendly_name: "Soppalco umidità", device_class: "humidity" });
  states["sensor.condizionatore_dati_ambientali_temperatura"] = S("24.1", { friendly_name: "Condizionatore temperatura", device_class: "temperature" });

  el._registry = {
    areas: [{ area_id: "soggiorno", name: "Soggiorno", icon: null },
            { area_id: "bagno", name: "Bagno", icon: "mdi:toilet" },
            { area_id: "camera", name: "Camera da letto", icon: null }],
    byArea: {
      soggiorno: ["sensor.sensore_t_h_salotto_temperatura", "sensor.sensore_t_h_salotto_umidita"],
      // the plug is listed FIRST on purpose: registry order must not decide
      bagno: ["sensor.shellyplusplugs_e465b8b19f24_temperature",
              "sensor.t_u_bagno_temperatura", "sensor.t_u_bagno_umidita"],
      camera: ["sensor.condizionatore_dati_ambientali_temperatura",
               "sensor.camera_soppalco_temperatura", "sensor.camera_soppalco_umidita"] },
    entityArea: {}, category: {},
    entityDevice: {
      "sensor.sensore_t_h_salotto_temperatura": "d_salotto",
      "sensor.sensore_t_h_salotto_umidita": "d_salotto",
      "sensor.t_u_bagno_temperatura": "d_bagno",
      "sensor.t_u_bagno_umidita": "d_bagno",
      "sensor.shellyplusplugs_e465b8b19f24_temperature": "d_plug",
      "sensor.camera_soppalco_temperatura": "d_soppalco",
      "sensor.camera_soppalco_umidita": "d_soppalco",
      "sensor.condizionatore_dati_ambientali_temperatura": "d_cdz" },
    deviceName: {} };

  const cc = { id: "cf", type: "comfort", entity_id: "", name: "", size: "xl",
    appearance: {}, states: {}, actions: {}, rooms: [], bands: {}, filter: "" };
  const found = el._comfortRooms(cc);
  const byName = (n) => found.find(r => r.name === n);

  ok("la temperatura esterna entra anche senza area", !!byName("Temperatura esterna"));
  ok("l'esterno sta in cima, è il riferimento", found[0].name === "Temperatura esterna", found[0].name);
  ok("l'esterno è marcato come tale", found[0].outdoor === true);
  ok("la CPU del server non è una stanza",
     !found.some(r => /processor/i.test(r.temperature)), found.map(r => r.temperature).join());

  // The regression that made the card lie: first-match-wins picked the plug.
  ok("il bagno legge il sensore a muro, non il chip della presa",
     byName("Bagno").temperature === "sensor.t_u_bagno_temperatura",
     byName("Bagno").temperature);
  ok("il bagno abbina l'umidità dello stesso dispositivo",
     byName("Bagno").humidity === "sensor.t_u_bagno_umidita", String(byName("Bagno").humidity));
  ok("la camera preferisce il sensore che misura anche l'umidità",
     byName("Camera da letto").temperature === "sensor.camera_soppalco_temperatura",
     byName("Camera da letto").temperature);
  ok("il soggiorno resta corretto",
     byName("Soggiorno").temperature === "sensor.sensore_t_h_salotto_temperatura");
  ok("quattro righe in tutto: esterno più tre stanze", found.length === 4, String(found.length));

  // -- taking over by hand --
  el._selected = null;
  cc.rooms = [
    { temperature: "sensor.temperatura_esterna", humidity: null, name: "Esterno", icon: "mdi:sun-thermometer-outline" },
    { temperature: "sensor.t_u_bagno_temperatura", humidity: "sensor.t_u_bagno_umidita", name: "Bagno", icon: "" }];
  const manual = el._comfortRooms(cc);
  ok("l'elenco scritto a mano ha la precedenza", manual.length === 2, String(manual.length));
  ok("l'ordine scritto a mano è rispettato",
     manual.map(r => r.name).join(">") === "Esterno>Bagno", manual.map(r => r.name).join(">"));
  ok("una riga a mano senza umidità è ammessa", manual[0].humidity === null);

  const body = el._comfortBody(cc);
  ok("il corpo disegna solo le righe scelte",
     (body.match(/class="cf-room/g) || []).length === 2,
     String((body.match(/class="cf-room/g) || []).length));
  ok("l'esterno compare col suo nome", body.includes("Esterno"));

  // an empty manual list must fall back, not show an empty card
  cc.rooms = [];
  ok("svuotare l'elenco torna al rilevamento automatico", el._comfortRooms(cc).length === 4);

  for (const id of ["sensor.temperatura_esterna","sensor.system_monitor_processor_temperature",
      "sensor.sensore_t_h_salotto_temperatura","sensor.sensore_t_h_salotto_umidita",
      "sensor.t_u_bagno_temperatura","sensor.t_u_bagno_umidita",
      "sensor.shellyplusplugs_e465b8b19f24_temperature","sensor.camera_soppalco_temperatura",
      "sensor.camera_soppalco_umidita","sensor.condizionatore_dati_ambientali_temperatura"]) delete states[id];
  el._registry = null;
  ok("stato ripristinato dopo la sezione 27", el._registry === null);
}

console.log("\n== 28. GRAFICO CHE SEGUE LE STANZE ==");
{
  states["sensor.temperatura_esterna"] = S("24.0", { friendly_name: "Temperatura esterna", device_class: "temperature" });
  states["sensor.sog_t"] = S("24.5", { friendly_name: "Soggiorno T", device_class: "temperature" });
  states["sensor.sog_h"] = S("49.0", { friendly_name: "Soggiorno H", device_class: "humidity" });
  states["sensor.bag_t"] = S("24.8", { friendly_name: "Bagno T", device_class: "temperature" });
  states["sensor.bag_h"] = S("51.0", { friendly_name: "Bagno H", device_class: "humidity" });
  states["sensor.cam_t"] = S("21.8", { friendly_name: "Camera T", device_class: "temperature" });
  el._registry = {
    areas: [{ area_id: "sog", name: "Soggiorno" }, { area_id: "bag", name: "Bagno" },
            { area_id: "cam", name: "Camera" }],
    byArea: { sog: ["sensor.sog_t", "sensor.sog_h"], bag: ["sensor.bag_t", "sensor.bag_h"],
              cam: ["sensor.cam_t"] },
    entityArea: { "sensor.sog_t": "Soggiorno", "sensor.sog_h": "Soggiorno",
                  "sensor.bag_t": "Bagno", "sensor.bag_h": "Bagno", "sensor.cam_t": "Camera" },
    category: {},
    entityDevice: { "sensor.sog_t": "d1", "sensor.sog_h": "d1", "sensor.bag_t": "d2",
                    "sensor.bag_h": "d2", "sensor.cam_t": "d3" },
    deviceName: {} };

  const tc = { id: "tr", type: "trend", entity_id: "", name: "", size: "xl", appearance: {},
    states: {}, actions: {}, source: "comfort", device_class: "temperature", max_series: 8,
    series: [], hours: 24, y_min: null, y_max: null };

  let lines = el._trendSeries(tc);
  ok("il grafico segue le stanze senza elenco fisso", lines.length === 4, String(lines.length));
  ok("tutte e quattro su un piano solo, colori distinti",
     new Set(lines.map(l => l.color)).size === 4, lines.map(l => l.color).join());
  ok("l'esterno è la prima linea", lines[0].name === "Temperatura esterna", lines[0].name);

  // THE point: a sensor that did not exist when the card was made must appear
  // by itself. This is what a frozen list could never do.
  states["sensor.sop_t"] = S("23.1", { friendly_name: "Soppalco T", device_class: "temperature" });
  states["sensor.sop_h"] = S("47.0", { friendly_name: "Soppalco H", device_class: "humidity" });
  el._registry.areas.push({ area_id: "sop", name: "Soppalco" });
  el._registry.byArea.sop = ["sensor.sop_t", "sensor.sop_h"];
  el._registry.entityDevice["sensor.sop_t"] = "d4";
  el._registry.entityDevice["sensor.sop_h"] = "d4";
  lines = el._trendSeries(tc);
  ok("una stanza aggiunta domani entra da sola nel grafico",
     lines.length === 5 && lines.some(l => l.name === "Soppalco"), lines.map(l => l.name).join());

  // adding a room must not repaint the lines that were already there
  ok("le linee esistenti non cambiano colore",
     lines[0].color === "#00e5ff" && lines[1].name === "Soggiorno",
     lines.slice(0, 2).map(l => l.name + "=" + l.color).join());

  tc.max_series = 3;
  ok("il tetto delle linee è rispettato", el._trendSeries(tc).length === 3);
  tc.max_series = 99;
  ok("il tetto assoluto è dodici, non di più", el._trendSeries(tc).length === 5);
  tc.max_series = 8;

  // -- follow a whole device_class --
  tc.source = "class"; tc.device_class = "humidity";
  const hums = el._trendSeries(tc);
  ok("seguire una classe prende tutte le entità di quel tipo",
     hums.length === 3, hums.map(h => h.entity).join());
  ok("le linee di una classe non mescolano unità diverse",
     hums.every(h => states[h.entity].attributes.device_class === "humidity"));
  ok("le linee di una classe portano il nome della stanza",
     hums.some(h => h.name === "Bagno"), hums.map(h => h.name).join());

  tc.device_class = "temperature";
  const temps = el._trendSeries(tc);
  ok("cambiando tipo cambiano le linee",
     temps.some(l => l.entity === "sensor.sog_t") && temps.some(l => l.entity === "sensor.sop_t")
     && !temps.some(l => l.entity === "sensor.bag_h"),
     temps.map(l => l.entity).join());
  // The outdoor probe has no area. Sorting it with the other area-less
  // entities pushed it past the line cap and cut off the one line the whole
  // comparison exists for.
  ok("l'esterno non viene tagliato via dal tetto delle linee",
     temps[0].entity === "sensor.temperatura_esterna", temps.map(l => l.entity).join());
  ok("il tetto vale anche seguendo una classe", temps.length <= 8, String(temps.length));

  // -- manual stays frozen, on purpose --
  tc.source = "manual";
  tc.series = [{ entity: "sensor.sog_t", name: "Solo questo", color: "#fff" }];
  ok("l'elenco scritto a mano resta com'è", el._trendSeries(tc).length === 1);
  states["sensor.nuovo_t"] = S("20.0", { friendly_name: "Nuovo", device_class: "temperature" });
  ok("e non si allarga da solo", el._trendSeries(tc).length === 1);
  // an entity that has disappeared must not draw a phantom line
  tc.series.push({ entity: "sensor.sparito", name: "Sparito", color: "#000" });
  ok("un'entità sparita non disegna una linea fantasma", el._trendSeries(tc).length === 1);

  const ed = el._editing;
  el._editing = true;
  el._dashboard = { version: 7, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x",
      sections: [{ id: "s1", title: "Temperature", icon: "mdi:x", accent: null, collapsed: false,
        items: [tc] }] }]};
  el._pageIndex = 0;
  tc.source = "comfort";
  el._selected = { kind: "card", sectionId: "s1", itemId: "tr" };
  el._signature = ""; el.render();
  const h = el.innerHTML;
  ok("l'editor offre le tre modalità",
     h.includes('data-trend-source="comfort"') && h.includes('data-trend-source="class"')
     && h.includes('data-trend-source="manual"'));
  ok("in automatico non chiede di aggiungere le linee a mano", !h.includes("data-trend-add"));
  ok("in automatico mostra le linee risolte", h.includes("Soppalco"));
  tc.source = "manual";
  el._signature = ""; el.render();
  ok("a mano compare il riempimento in un colpo solo",
     el.innerHTML.includes("data-trend-fill"));
  el._editing = ed;

  for (const id of ["sensor.temperatura_esterna","sensor.sog_t","sensor.sog_h","sensor.bag_t",
      "sensor.bag_h","sensor.cam_t","sensor.sop_t","sensor.sop_h","sensor.nuovo_t"]) delete states[id];
  el._registry = null;
  el._dashboard = { version: 7, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
  el._pageIndex = 0; el._selected = null; el._editing = false;
  ok("stato ripristinato dopo la sezione 28", el._registry === null);
}

console.log("\n== 29. AVVISI: LETTI, DA LEGGERE, ELIMINATI ==");
{
  const sent = [
    { id: "cy-1", title: "Lavatrice", message: "Ciclo terminato.", channel: "telegram",
      channel_label: "Telegram", source: "sent", ts: new Date(Date.now() - 3600e3).toISOString(), read: false },
    { id: "cy-2", title: "Allarme", message: "Porta aperta.", channel: "telegram",
      channel_label: "Telegram", source: "sent", ts: new Date(Date.now() - 7200e3).toISOString(), read: true },
    { id: "cy-3", title: "Ciao", message: "Accendi le luci", channel: "telegram",
      channel_label: "Telegram", source: "received", ts: new Date(Date.now() - 60e3).toISOString(), read: false },
  ];
  el._sentNotifs = JSON.parse(JSON.stringify(sent));
  el._sentPending = false;
  el._notifs = {};
  el._notifFilter = "";

  const card = { id: "nc", type: "notifications", entity_id: "", name: "", size: "lg",
    appearance: {}, states: {}, actions: {}, max: 8 };
  let body = el._notificationsBody(card);

  ok("ogni avviso ha il suo pulsante di eliminazione",
     ["cy-1", "cy-2", "cy-3"].every(id => body.includes(`data-notif-del="${id}"`)));
  ok("ogni avviso si può segnare letto o da leggere",
     ["cy-1", "cy-2", "cy-3"].every(id => body.includes(`data-notif-read="${id}"`)));
  ok("il già letto è marcato come tale", body.includes('data-notif-read="cy-2" data-read="1"'));
  ok("i non letti portano il pallino", (body.match(/notif-dot/g) || []).length === 2,
     String((body.match(/notif-dot/g) || []).length));
  ok("il contatore dei da leggere è giusto", body.includes("DA LEGGERE · 2"), body.slice(0, 0) || "");
  ok("c'è il filtro e le azioni di gruppo",
     body.includes('data-notif-filter="unread"') && body.includes("data-notif-readall")
     && body.includes("data-notif-purge"));

  // -- filter --
  el._notifFilter = "unread";
  body = el._notificationsBody(card);
  ok("il filtro mostra solo i da leggere",
     body.includes('data-notif-del="cy-1"') && !body.includes('data-notif-del="cy-2"'));
  ok("il filtro non cancella niente", el._sentNotifs.length === 3);
  el._notifFilter = "";

  // -- marking read: local first, server after --
  const calls = [];
  const realWS = el._hass.callWS;
  el._hass.callWS = (m) => { calls.push(m); return Promise.resolve({}); };

  el._notifRead(["cy-1"], true);
  ok("segnare letto aggiorna subito la copia locale",
     el._sentNotifs.find(n => n.id === "cy-1").read === true);
  ok("e lo dice al server, non al browser",
     calls.some(c => c.type === "cyborg_dashboard/notifications/read"
       && c.ids && c.ids[0] === "cy-1" && c.read === true), JSON.stringify(calls));

  el._notifRead(["cy-1"], false);
  ok("si può rimettere fra i da leggere",
     el._sentNotifs.find(n => n.id === "cy-1").read === false);

  calls.length = 0;
  el._notifRead(null, true);
  ok("segna tutti letti li prende tutti", el._sentNotifs.every(n => n.read));
  ok("e manda ids nullo, non l'elenco",
     calls[0].type === "cyborg_dashboard/notifications/read" && calls[0].ids === null);

  // -- delete one --
  el._sentNotifs = JSON.parse(JSON.stringify(sent));
  calls.length = 0;
  el._notifDelete(["cy-2"], false);
  ok("eliminare toglie solo quello indicato",
     el._sentNotifs.map(n => n.id).join() === "cy-1,cy-3", el._sentNotifs.map(n => n.id).join());
  ok("l'eliminazione passa dal server",
     calls[0].type === "cyborg_dashboard/notifications/delete" && calls[0].ids[0] === "cy-2");

  // -- purge only the read ones: the one nobody has seen must survive --
  el._sentNotifs = JSON.parse(JSON.stringify(sent));
  calls.length = 0;
  el._notifDelete(null, true);
  ok("pulisci i letti non tocca i da leggere",
     el._sentNotifs.map(n => n.id).join() === "cy-1,cy-3", el._sentNotifs.map(n => n.id).join());
  ok("la pulizia dichiara read_only al server", calls[0].read_only === true);

  // -- everything read and filtered: an explicit empty, not a blank card --
  el._sentNotifs.forEach(n => { n.read = true; });
  el._notifFilter = "unread";
  body = el._notificationsBody(card);
  ok("con tutto letto il filtro spiega perché è vuoto",
     body.includes("Nessun avviso da leggere"));
  ok("ma la barra resta per tornare a TUTTE", body.includes('data-notif-filter=""'));
  el._notifFilter = "";

  // -- persistent notifications are Home Assistant's: dismiss, not delete --
  el._notifs = { n1: { notification_id: "n1", title: "Matter", message: "Nuovo dispositivo" } };
  body = el._notificationsBody(card);
  ok("le notifiche persistenti hanno il tasto per eliminarle",
     body.includes('data-notif-dismiss="n1"'));
  ok("ma non fingono uno stato di lettura che non hanno",
     !body.includes('data-notif-read="n1"'));

  el._hass.callWS = realWS;
  el._notifs = {}; el._sentNotifs = null; el._sentPending = false; el._notifFilter = "";
  ok("stato ripristinato dopo la sezione 29", el._sentNotifs === null);
}

console.log("\n== 30. GUARDARE SENZA TOCCARE ==");
{
  states["light.luci_scale"] = S("on", { friendly_name: "Luci scale", supported_color_modes: ["onoff"] });
  states["sensor.scale_t"] = S("22.0", { friendly_name: "Scale T", device_class: "temperature" });
  el._dashboard = { version: 8, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "map", type: "floorplan", title: "Mappa 3D", icon: "mdi:floor-plan",
      view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true,
              show_labels: true, level_gap: 150, active_level: null, tap_action: "toggle" },
      rooms: [{ id: "r1", area_id: null, title: "Scale", icon: "mdi:stairs", color: "#00e5ff",
        x: 0, y: 0, w: 200, h: 160, level: 0, points: null, spots: {}, hidden: [],
        walls: [], entities: ["light.luci_scale", "sensor.scale_t"], vehicles: [], rotation: 0 }] }]};
  el._pageIndex = 0; el._editing = false; el._selected = null;

  const called = [];
  const info = [];
  const realSvc = el._hass.callService;
  el._hass.callService = (d, sv, data) => { called.push(d + "." + sv + ":" + (data && data.entity_id)); };
  // The harness element has no real event target, so the details request is
  // observed where it is actually made: dispatchEvent.
  const realDispatch = el.dispatchEvent;
  el.dispatchEvent = (ev) => {
    if (ev && ev.type === "hass-more-info") info.push(ev.detail.entityId);
    return true;
  };

  // This is the reported bug: a tap on the map switched the light off with no
  // way to ask for the details instead.
  el._badgeTap("light.luci_scale");
  ok("con l'impostazione «accendi/spegni» il tocco comanda",
     called.length === 1 && !info.length, called.join());

  called.length = 0;
  el._badgeTap("light.luci_scale", true);
  ok("tenendo premuto si aprono i dettagli invece",
     !called.length && info[0] === "light.luci_scale", info.join());

  info.length = 0;
  el._page().view.tap_action = "more-info";
  el._badgeTap("light.luci_scale");
  ok("scegliendo «apri i dettagli» il tocco non tocca niente",
     !called.length && info[0] === "light.luci_scale", called.join() + "|" + info.join());

  info.length = 0;
  el._badgeTap("light.luci_scale", true);
  ok("e tenendo premuto si comanda", called.length === 1 && !info.length, called.join());

  // A thermometer has nothing to switch: both ways must open the details
  // rather than calling a service that does not exist for it.
  called.length = 0; info.length = 0;
  el._page().view.tap_action = "toggle";
  el._badgeTap("sensor.scale_t");
  ok("un sensore apre sempre i dettagli, non c'è niente da accendere",
     !called.length && info[0] === "sensor.scale_t", called.join());

  // the device list under the map
  // built by the panel, not by hand: the focus object carries the camera
  // offsets the renderer needs
  el._focusRoom("r1");
  el._signature = ""; el.render();
  let h = el.innerHTML;
  ok("nell'elenco sotto la mappa la luce ha il tasto opposto",
     h.includes('data-fp-badge-alt="light.luci_scale"'));
  ok("il sensore non finge di avere un interruttore",
     !h.includes('data-fp-badge-alt="sensor.scale_t"'));
  ok("il corpo della riga porta l'azione principale",
     h.includes('data-fp-badge="light.luci_scale"'));

  el._editing = true;
  el._signature = ""; el.render();
  ok("l'impostazione è raggiungibile dall'editor della mappa",
     el.innerHTML.includes("data-view-tap"));
  el._editing = false; el._focus = null;

  // -- the lighting card's setting was dead: now it works both ways --
  const lightsCard = { id: "lc", type: "lights", entity_id: "", name: "", size: "xl",
    appearance: {}, states: {}, actions: {}, lights: ["light.luci_scale"],
    group_by_area: false, row_action: "more-info" };
  let row = el._lightRow("light.luci_scale", lightsCard);
  ok("sulla card luci il nome apre i dettagli",
     /class="li-name" data-more-info="light\.luci_scale"/.test(row), row.slice(0, 0) || "");
  ok("e la lampadina accende e spegne",
     /class="li-bulb" data-light-toggle="light\.luci_scale"/.test(row));

  lightsCard.row_action = "toggle";
  row = el._lightRow("light.luci_scale", lightsCard);
  ok("scegliendo «accendi/spegni» il nome comanda",
     /class="li-name" data-light-toggle="light\.luci_scale"/.test(row));
  ok("e l'icona fa l'altra cosa",
     /class="li-bulb" data-more-info="light\.luci_scale"/.test(row));

  el.dispatchEvent = realDispatch;
  el._hass.callService = realSvc;
  delete states["light.luci_scale"]; delete states["sensor.scale_t"];
  el._dashboard = { version: 8, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
  el._pageIndex = 0;
  ok("stato ripristinato dopo la sezione 30", !el._isFloorplan());
}

console.log("\n== 31. CENTRALE DI ALLARME, NON UN INTERRUTTORE ==");
{
  // supported_features 11 = ARM_HOME(1) + ARM_AWAY(2) + TRIGGER(8): exactly
  // what the real panel in this house declares.
  states["alarm_control_panel.allarme"] = S("disarmed", {
    friendly_name: "Allarme", supported_features: 11,
    code_format: null, code_arm_required: false, changed_by: null });

  const card = { id: "ac", type: "control", entity_id: "alarm_control_panel.allarme",
    name: "", size: "md", appearance: {}, states: {}, actions: {} };
  let body = el._cardBody(card, states["alarm_control_panel.allarme"]);

  // The reported defect: a card type that cannot express the entity was
  // drawing a toggle anyway.
  ok("una centrale non disegna mai un interruttore",
     !body.includes('class="switch') && !body.includes("control-row"), body.slice(0, 80));
  ok("dice lo stato a parole", body.includes("Disarmato"));

  ok("c'è un pulsante per «in casa»", body.includes("alarm_arm_home"));
  ok("c'è un pulsante per «fuori casa»", body.includes("alarm_arm_away"));
  // the panel does NOT declare night or vacation: offering them would be a
  // button that silently does nothing
  ok("non offre modalità che la centrale non ha",
     !body.includes("alarm_arm_night") && !body.includes("alarm_arm_vacation")
     && !body.includes("alarm_arm_custom_bypass"), body.slice(0, 0) || "");
  ok("il disarmo c'è ma è spento quando è già disarmato",
     /data-alarm-act="alarm_control_panel\.allarme\|alarm_disarm"[^>]*disabled/.test(body));
  ok("il pulsante antipanico c'è perché la centrale dichiara TRIGGER",
     body.includes("data-alarm-panic"));

  // -- a panel with more modes shows more --
  states["alarm_control_panel.allarme"].attributes.supported_features = 1 + 2 + 4 + 32;
  body = el._cardBody(card, states["alarm_control_panel.allarme"]);
  ok("una centrale con più modalità le mostra tutte",
     body.includes("alarm_arm_night") && body.includes("alarm_arm_vacation"));
  ok("senza TRIGGER non compare l'antipanico", !body.includes("data-alarm-panic"));
  states["alarm_control_panel.allarme"].attributes.supported_features = 11;

  // -- armed: disarm becomes the primary action and the active mode is shown --
  states["alarm_control_panel.allarme"] = S("armed_away", {
    friendly_name: "Allarme", supported_features: 11,
    code_format: null, code_arm_required: false, changed_by: "Oscar" });
  body = el._cardBody(card, states["alarm_control_panel.allarme"]);
  ok("da armato il disarmo diventa l'azione principale",
     body.includes('class="al-btn off primary"'));
  ok("la modalità in corso è mostrata, non offerta",
     /alarm_arm_away"[^>]*disabled/.test(body) && body.includes("al-btn current"));
  ok("dice chi l'ha cambiato", body.includes("Oscar"));

  // -- transitional states have nowhere to go on a toggle; here they do --
  states["alarm_control_panel.allarme"] = S("arming", {
    friendly_name: "Allarme", supported_features: 11, code_format: null });
  body = el._cardBody(card, states["alarm_control_panel.allarme"]);
  ok("il conto alla rovescia ha un suo stato visibile",
     body.includes("al-head moving") && body.includes("In attivazione"), body.slice(0, 0) || "");

  states["alarm_control_panel.allarme"] = S("triggered", {
    friendly_name: "Allarme", supported_features: 11, code_format: null });
  body = el._cardBody(card, states["alarm_control_panel.allarme"]);
  ok("l'allarme in corso si vede subito",
     body.includes("al-head fire") && body.includes("Allarme in corso"));
  ok("e da lì si disarma in un tocco", body.includes("al-btn off primary"));

  // -- the code --
  const calls = [];
  const realSvc = el._hass.callService;
  el._hass.callService = (d, sv, data) => calls.push({ d, sv, data });

  states["alarm_control_panel.allarme"] = S("disarmed", {
    friendly_name: "Allarme", supported_features: 11,
    code_format: "number", code_arm_required: true });
  body = el._cardBody(card, states["alarm_control_panel.allarme"]);
  ok("se la centrale vuole un codice compare il tastierino",
     body.includes("data-alarm-code"));
  ok("e per un PIN chiede una tastiera numerica", body.includes('inputmode="numeric"'));

  el._alarmCode = {};
  el._alarmAct("alarm_control_panel.allarme", "alarm_arm_away");
  ok("senza codice non chiama il servizio", calls.length === 0);
  ok("e lo dice invece di fallire in silenzio", /codice/i.test(el._error || ""), el._error);

  el._alarmCode = { "alarm_control_panel.allarme": "1234" };
  el._alarmAct("alarm_control_panel.allarme", "alarm_arm_away");
  ok("col codice chiama il servizio giusto",
     calls.length === 1 && calls[0].d === "alarm_control_panel"
     && calls[0].sv === "alarm_arm_away", JSON.stringify(calls));
  ok("e passa il codice", calls[0].data.code === "1234");
  ok("il codice non resta in memoria dopo l'uso",
     !(el._alarmCode || {})["alarm_control_panel.allarme"]);

  // A code must never end up in the saved document.
  el._alarmCode = { "alarm_control_panel.allarme": "9999" };
  ok("il codice non finisce mai nel documento salvato",
     !JSON.stringify(el._dashboard).includes("9999"));

  // no code demanded: the call must go through untouched
  calls.length = 0;
  states["alarm_control_panel.allarme"] = S("disarmed", {
    friendly_name: "Allarme", supported_features: 11, code_format: null, code_arm_required: false });
  el._alarmCode = {};
  el._alarmAct("alarm_control_panel.allarme", "alarm_arm_home");
  ok("senza codice richiesto il comando parte comunque",
     calls.length === 1 && calls[0].sv === "alarm_arm_home" && !("code" in calls[0].data),
     JSON.stringify(calls));

  el._hass.callService = realSvc;
  el._alarmCode = {}; el._error = "";
  delete states["alarm_control_panel.allarme"];
  ok("stato ripristinato dopo la sezione 31", !states["alarm_control_panel.allarme"]);
}

console.log("\n== 32. NIENTE COMANDI CHE NON COMANDANO ==");
{
  // The real entities from the report: a camera that only declares STREAM
  // (supported_features 2, no ON_OFF) and an alarm panel, both of which had
  // landed in the room card's "Altro" bucket as switch rows.
  states["camera.salotto"] = S("idle", { friendly_name: "Videocamera salotto",
    supported_features: 2, access_token: "tok", entity_picture: "/api/camera_proxy/camera.salotto?token=tok" });
  states["camera.ingresso"] = S("idle", { friendly_name: "Videocamera ingresso",
    supported_features: 3, access_token: "tok2", entity_picture: "/api/camera_proxy/camera.ingresso?token=tok2" });
  states["alarm_control_panel.casa"] = S("armed_home", { friendly_name: "Allarme",
    supported_features: 11 });
  states["switch.presa_tv"] = S("on", { friendly_name: "Presa TV" });
  states["sensor.lux_salotto"] = S("42", { friendly_name: "Luce ambiente", device_class: "illuminance" });

  ok("una centrale non si può commutare",
     canToggle("alarm_control_panel.casa", states["alarm_control_panel.casa"]) === false);
  ok("una videocamera senza ON_OFF nemmeno",
     canToggle("camera.salotto", states["camera.salotto"]) === false);
  ok("una che invece lo dichiara sì",
     canToggle("camera.ingresso", states["camera.ingresso"]) === true);
  ok("un sensore non si comanda", canToggle("sensor.lux_salotto", states["sensor.lux_salotto"]) === false);
  ok("una presa sì", canToggle("switch.presa_tv", states["switch.presa_tv"]) === true);

  // the row must not offer a switch it cannot operate
  const item = { id: "rc", type: "room", area: "Salotto", row_action: "toggle" };
  const camRow = el._deviceRow("camera.salotto", states["camera.salotto"], false, "rc-row", item);
  ok("la riga di una videocamera non finge di essere un interruttore",
     !camRow.includes("data-toggle-entity") && !camRow.includes("data-row-act"), camRow.slice(0, 90));
  ok("e apre i dettagli", camRow.includes('data-more-info="camera.salotto"'));
  ok("«inattivo» non è una diagnosi: dice che è in linea",
     camRow.includes("In linea") && !/INATTIVO/i.test(camRow), camRow.slice(0, 0) || "");

  const alRow = el._deviceRow("alarm_control_panel.casa", states["alarm_control_panel.casa"], true, "rc-row", item);
  ok("nemmeno la centrale",
     !alRow.includes("data-toggle-entity") && alRow.includes('data-more-info="alarm_control_panel.casa"'));

  const swRow = el._deviceRow("switch.presa_tv", states["switch.presa_tv"], true, "rc-row", item);
  ok("una presa invece resta comandabile", swRow.includes('data-toggle-entity="switch.presa_tv"'));

  ok("una videocamera che dichiara ON_OFF resta comandabile",
     el._deviceRow("camera.ingresso", states["camera.ingresso"], false, "rc-row", item)
       .includes('data-toggle-entity="camera.ingresso"'));

  // entityWords
  ok("una videocamera che registra lo dice",
     entityWords("camera.salotto", S("recording", {})) === "Sta registrando");
  ok("una videocamera irraggiungibile lo dice",
     entityWords("camera.salotto", S("unavailable", {})) === "Non raggiungibile");

  // -- the room card must not put them in "Altro" any more --
  el._registry = { areas: [{ area_id: "salotto", name: "Salotto" }],
    byArea: { salotto: ["camera.salotto", "alarm_control_panel.casa", "switch.presa_tv", "sensor.lux_salotto"] },
    entityArea: {}, category: {}, entityDevice: {}, deviceName: {} };
  const roomCard = { id: "rc2", type: "room", entity_id: "", name: "", size: "xl",
    appearance: {}, states: {}, actions: {}, area: "salotto", row_action: "toggle",
    max_readings: 4, hidden: [], show_others: true };
  const rb = el._roomBody ? el._roomBody(roomCard) : el._cardBody(roomCard, null);
  ok("la videocamera ha il suo blocco con l'anteprima",
     rb.includes("VIDEOCAMERE") || /Videocamere/i.test(rb), rb.slice(0, 0) || "");
  ok("e l'anteprima è un'immagine vera, non una riga di testo",
     rb.includes('data-cam-open="camera.salotto"') && rb.includes("cam-img"));
  ok("la centrale ha il suo blocco sicurezza",
     /Sicurezza/i.test(rb) && rb.includes("rc-row alarm"));
  ok("«Altro» non le contiene più",
     !/Altro[\s\S]{0,400}data-toggle-entity="camera\.salotto"/.test(rb));

  // the map must not switch them either
  const called = [], info = [];
  const realSvc = el._hass.callService;
  const realDispatch = el.dispatchEvent;
  el._hass.callService = (d, sv, data) => called.push(d + "." + sv);
  el.dispatchEvent = (ev) => {
    if (ev && ev.type === "hass-more-info") info.push(ev.detail.entityId);
    return true;
  };
  el._dashboard = { version: 8, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "map", type: "floorplan", title: "Mappa", icon: "mdi:x",
      view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true,
              show_labels: true, level_gap: 150, active_level: null, tap_action: "toggle" },
      rooms: [] }]};
  el._pageIndex = 0;
  el._badgeTap("camera.salotto");
  ok("sulla mappa una videocamera apre la vista, non prova a spegnersi",
     !called.length && info[0] === "camera.salotto", called.join() + "|" + info.join());
  el._badgeTap("alarm_control_panel.casa");
  ok("e la centrale apre i suoi comandi", called.length === 0, called.join());

  el._hass.callService = realSvc;
  el.dispatchEvent = realDispatch;
  for (const id of ["camera.salotto","camera.ingresso","alarm_control_panel.casa",
                    "switch.presa_tv","sensor.lux_salotto"]) delete states[id];
  el._registry = null;
  el._dashboard = { version: 8, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
  el._pageIndex = 0;
  ok("stato ripristinato dopo la sezione 32", !el._isFloorplan());
}

console.log("\n== 33. IL CONFRONTO NON È SOLO TEMPERATURE ==");
{
  // An installer comparing four motor temperatures, three phase voltages or a
  // board's currents must not have to fight a card that assumes "casa".
  states["sensor.motore1_t"] = S("68.0", { friendly_name: "Motore 1 temperatura", device_class: "temperature" });
  states["sensor.motore2_t"] = S("71.5", { friendly_name: "Motore 2 temperatura", device_class: "temperature" });
  states["sensor.l1_v"] = S("238", { friendly_name: "L1 tensione", device_class: "voltage" });
  states["sensor.l2_v"] = S("237", { friendly_name: "L2 tensione", device_class: "voltage" });
  states["sensor.l3_v"] = S("239", { friendly_name: "L3 tensione", device_class: "voltage" });
  states["sensor.quadro_a"] = S("12.4", { friendly_name: "Quadro corrente", device_class: "current" });
  el._registry = { areas: [], byArea: {}, entityArea: {}, category: {},
    entityDevice: {}, deviceName: {} };

  const tc = { id: "tr2", type: "trend", entity_id: "", name: "", size: "xl", appearance: {},
    states: {}, actions: {}, source: "class", device_class: "voltage", max_series: 8,
    series: [], hours: 24, y_min: null, y_max: null };

  const volts = el._trendSeries(tc);
  ok("seguendo «tensione» arrivano le tensioni",
     ["sensor.l1_v", "sensor.l2_v", "sensor.l3_v"].every(id => volts.some(v => v.entity === id))
     && volts.every(v => states[v.entity].attributes.device_class === "voltage"),
     volts.map(v => v.entity).join());
  tc.device_class = "current";
  const amps = el._trendSeries(tc);
  ok("cambiando tipo arrivano le correnti",
     amps.some(v => v.entity === "sensor.quadro_a")
     && amps.every(v => states[v.entity].attributes.device_class === "current")
     && !amps.some(v => /_v$/.test(v.entity)),
     amps.map(v => v.entity).join());

  // the editor must speak Italian and must not be temperature-flavoured
  el._dashboard = { version: 8, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x",
      sections: [{ id: "s1", title: "Monitoraggio", icon: "mdi:x", accent: null,
        collapsed: false, items: [tc] }] }]};
  el._pageIndex = 0; el._editing = true;
  el._selected = { kind: "card", sectionId: "s1", itemId: "tr2" };
  el._signature = ""; el.render();
  let h = el.innerHTML;
  ok("il tipo è scritto in italiano, non in inglese",
     h.includes("Tensione") && h.includes("Corrente"), "");
  ok("il suggerimento non parla solo di stanze",
     /motori|fasi|quadro/i.test(h));

  // the manual mode's bulk fill offers every type, not just temperature
  tc.source = "manual"; tc.series = [];
  el._signature = ""; el.render();
  h = el.innerHTML;
  ok("il riempimento in blocco è una scelta, non un pulsante temperatura",
     h.includes("data-trend-fill") && !/AGGIUNGI TUTTE LE TEMPERATURE/i.test(h), "");
  ok("fra le opzioni ci sono i tipi reali dell'impianto",
     h.includes('value="voltage|V"') && h.includes('value="current|A"'), "");
  // Il difetto: il tipo era la sola device_class, e Home Assistant mette sotto
  // data_rate sia i MB/s di un disco sia i Mbit/s di una scheda di rete. Su un
  // asse solo non si confrontano, ed erano una voce unica.
  states["sensor.disco_rw"] = S("1.5", { friendly_name: "Disco scrittura",
    device_class: "data_rate", unit_of_measurement: "MB/s", state_class: "measurement" });
  states["sensor.rete_rx"] = S("12.5", { friendly_name: "Rete RX",
    device_class: "data_rate", unit_of_measurement: "Mbit/s", state_class: "measurement" });
  // E una lettura senza nessuna device_class - il carico di una CPU e' un
  // "%" e basta - prima non compariva affatto nell'elenco.
  states["sensor.cpu_carico"] = S("7.5", { friendly_name: "Carico CPU",
    unit_of_measurement: "%", state_class: "measurement" });
  el._signature = ""; el.render();
  h = el.innerHTML;
  ok("dischi e rete sono due tipi diversi, non uno",
     h.includes('value="data_rate|MB/s"') && h.includes('value="data_rate|Mbit/s"'), "");
  ok("e l'etichetta dice l'unità, così si capisce quale è quale",
     /Mbit\/s · 1 entità/.test(h), "");
  ok("una lettura senza device_class non è più invisibile",
     h.includes('value="|%"'), "");
  ok("il carico della CPU è cercabile per nome",
     el._trendMatches(["sensor.cpu_carico", "sensor.rete_rx"], "carico cpu").join() === "sensor.cpu_carico",
     JSON.stringify(el._trendMatches(["sensor.cpu_carico", "sensor.rete_rx"], "carico cpu")));
  ok("la ricerca vuole tutte le parole, in qualunque ordine",
     el._trendMatches(["sensor.cpu_carico"], "cpu carico").length === 1
     && el._trendMatches(["sensor.cpu_carico"], "cpu memoria").length === 0);
  ok("e sceglie fra le grandezze anche solo dall'unità",
     el._trendMatches(["sensor.disco_rw", "sensor.rete_rx"], "mbit").join() === "sensor.rete_rx",
     JSON.stringify(el._trendMatches(["sensor.disco_rw", "sensor.rete_rx"], "mbit")));
  ok("c'è un campo di ricerca, non solo una tendina da mille voci",
     h.includes("data-trend-find"));
  delete states["sensor.disco_rw"]; delete states["sensor.rete_rx"];
  delete states["sensor.cpu_carico"];
  el._signature = ""; el.render(); h = el.innerHTML;
  ok("e resta la scorciatoia delle stanze, che dà nomi migliori",
     h.includes('value="__rooms"'));

  tc.series = [];

  const emptyBody = el._trendBody(tc);
  ok("a vuoto la card non promette un grafico di temperature",
     !/soggiorno|bagno|soppalco/i.test(emptyBody), emptyBody.slice(0, 0) || "");
  ok("e spiega le tre strade",
     /stanze/i.test(emptyBody) && /tipo/i.test(emptyBody) && /mano/i.test(emptyBody));

  for (const id of ["sensor.motore1_t","sensor.motore2_t","sensor.l1_v","sensor.l2_v",
                    "sensor.l3_v","sensor.quadro_a"]) delete states[id];
  el._registry = null; el._editing = false; el._selected = null;
  el._dashboard = { version: 8, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
  el._pageIndex = 0;
  ok("stato ripristinato dopo la sezione 33", el._registry === null);
}

console.log("\n== 34. UNA SEZIONE PER STANZA ==");
{
  el._registry = { areas: [
      { area_id: "sog", name: "Soggiorno", icon: null },
      { area_id: "bag", name: "Bagno", icon: "mdi:toilet" },
      { area_id: "cam", name: "Camera", icon: null }],
    byArea: {}, entityArea: {}, category: {}, entityDevice: {}, deviceName: {} };
  el._dashboard = { version: 8, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
  el._pageIndex = 0; el._editing = true; el._selected = null; el._error = "";

  el._addRoomSection();
  let secs = el._dashboard.pages[0].sections;
  ok("una sezione per stanza, non una sola per tutte", secs.length === 3, String(secs.length));
  ok("ogni sezione porta il nome della stanza",
     secs.map(s2 => s2.title).join(">") === "Soggiorno>Bagno>Camera", secs.map(s2 => s2.title).join(">"));
  ok("ogni sezione contiene la sua stanza e basta",
     secs.every(s2 => s2.items.length === 1 && s2.items[0].type === "room"));
  ok("ognuna punta all'area giusta",
     secs.map(s2 => s2.items[0].area).join() === "sog,bag,cam");
  // opening the page on a wall of expanded rooms is the problem being solved
  ok("solo la prima è aperta", secs[0].collapsed === false
     && secs.slice(1).every(s2 => s2.collapsed === true),
     secs.map(s2 => s2.collapsed).join());
  ok("l'icona dell'area è rispettata quando c'è",
     secs[1].icon === "mdi:toilet", secs[1].icon);

  // future rooms: run it again and only what is new is added
  el._registry.areas.push({ area_id: "sop", name: "Soppalco", icon: null });
  el._addRoomSection();
  secs = el._dashboard.pages[0].sections;
  ok("rilanciando aggiunge solo le stanze nuove", secs.length === 4, String(secs.length));
  ok("e la nuova è quella giusta", secs[3].title === "Soppalco");
  ok("niente doppioni delle vecchie",
     new Set(secs.map(s2 => s2.items[0].area)).size === 4);

  el._addRoomSection();
  ok("senza stanze nuove non fa niente e lo dice",
     el._dashboard.pages[0].sections.length === 4 && /già/i.test(el._error), el._error);

  // a room moved to its own page must not be re-created here
  el._error = "";
  const moved = el._dashboard.pages[0].sections.pop();
  el._dashboard.pages.push({ id: "p2", type: "sections", title: "Soppalco",
    icon: "mdi:x", sections: [moved] });
  el._pageIndex = 0;
  el._addRoomSection();
  ok("una stanza spostata in un'altra pagina non torna come doppione",
     el._dashboard.pages[0].sections.length === 3, String(el._dashboard.pages[0].sections.length));

  el._registry = null; el._editing = false; el._error = "";
  el._dashboard = { version: 8, revision: 0, theme: { accent: "#00e5ff" }, vehicles: [], pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:x", sections: [] }]};
  el._pageIndex = 0;
  ok("stato ripristinato dopo la sezione 34", el._registry === null);
}

console.log("\n== 35. CONTROLLO TEMPERATURA ==");
{
  // The two real units: an air conditioner (953 = target temp + fan + preset +
  // swing + on/off + horizontal swing) and a thermostat (385 = target temp +
  // on/off) whose range is 1-7 in halves, not 16-28 in whole degrees.
  states["climate.cdz_storm"] = S("cool", { friendly_name: "CDZ Storm",
    supported_features: 953, hvac_modes: ["auto","cool","dry","fan_only","heat","off"],
    min_temp: 8, max_temp: 30, target_temp_step: 1, current_temperature: 26, temperature: 24,
    fan_modes: ["auto","low","high"], fan_mode: "low",
    preset_modes: ["eco","boost","none"], preset_mode: "none",
    swing_modes: ["default","full_swing"], swing_mode: "default" });
  states["climate.termo"] = S("heat_cool", { friendly_name: "Termostato",
    supported_features: 385, hvac_modes: ["off","heat_cool"],
    min_temp: 1, max_temp: 7, target_temp_step: 0.5, current_temperature: 46, temperature: 4 });
  states["input_boolean.automazioni_cdz_disattivate"] = S("off",
    { friendly_name: "Automazioni CDZ Disattivate" });

  const card = { id: "th", type: "thermostat", entity_id: "", name: "", size: "xl",
    appearance: {}, states: {}, actions: {}, units: [], manual: [],
    show_manual: true, show_extras: true };

  const auto = el._thermoUnits(card);
  ok("in automatico prende tutte le unità clima",
     auto.includes("climate.cdz_storm") && auto.includes("climate.termo")
     && auto.every(id => id.startsWith("climate.")), auto.join());
  // A name is not a declaration of what an entity does. "Scale - Override
  // Manuale" is a staircase lighting override and was landing in a climate
  // card purely because the word "Manuale" is in it.
  states["input_boolean.scale_override_manuale"] = S("off",
    { friendly_name: "Scale - Override Manuale" });
  ok("nessun interruttore entra da solo nella card",
     el._thermoManual(card).length === 0, el._thermoManual(card).join());
  const hints = el._thermoManualHints(card);
  ok("ma i candidati vengono proposti",
     hints.includes("input_boolean.automazioni_cdz_disattivate"), hints.join());
  ok("anche quelli sbagliati restano solo proposte",
     hints.includes("input_boolean.scale_override_manuale"), hints.join());
  // the domain name itself contains "automation", so testing the whole
  // entity_id matched every automation in the house
  ok("e nessuna automazione viene scambiata per un interruttore",
     !hints.some(id => id.startsWith("automation.")), hints.join());
  card.manual = ["input_boolean.automazioni_cdz_disattivate"];
  const manual = el._thermoManual(card);
  ok("una volta scelto, vale", manual.length === 1
     && manual[0] === "input_boolean.automazioni_cdz_disattivate", manual.join());
  ok("e sparisce dai suggerimenti",
     !el._thermoManualHints(card).includes("input_boolean.automazioni_cdz_disattivate"));

  card.manual = ["input_boolean.automazioni_cdz_disattivate"];
  let body = el._thermostatBody(card);
  ok("la sospensione automazioni è il primo blocco e spiegata a parole",
     body.indexOf("th-block manual") < body.indexOf("data-thermo-power")
     && /automazioni sono attive/i.test(body));
  card.manual = [];
  ok("senza interruttori scelti la riga non c'è",
     !el._thermostatBody(card).includes("th-manual"));
  card.manual = ["input_boolean.automazioni_cdz_disattivate"];
  body = el._thermostatBody(card);
  ok("ogni unità ha il suo tasto di accensione",
     body.includes('data-thermo-power="climate.cdz_storm"')
     && body.includes('data-thermo-power="climate.termo"'));
  ok("la temperatura impostata si regola",
     body.includes('data-thermo-step="climate.cdz_storm|1"')
     && body.includes('data-thermo-temp="climate.cdz_storm"'));

  // the bounds must come from the entity, never from a hardcoded range
  ok("i limiti li detta l'unità, non la card",
     /data-thermo-temp="climate\.termo"/.test(body)
     && /min="1" max="7"\s+step="0.5"/.test(body.replace(/\n\s*/g, " ")),
     (body.match(/min="[^"]*" max="[^"]*"[^>]*data-thermo-temp="climate\.termo"/) || [""])[0]);

  // controls appear only where the feature bit is present
  ok("il condizionatore mostra la ventola",
     body.includes('data-thermo-set="climate.cdz_storm|fan_mode"'));
  ok("il termostato non mostra una ventola che non ha",
     !body.includes('data-thermo-set="climate.termo|fan_mode"'));
  ok("il condizionatore mostra programma e flusso",
     body.includes("|preset_mode") && body.includes("|swing_mode"));
  ok("le modalità offerte sono quelle dichiarate, «off» escluso",
     body.includes('data-thermo-mode="climate.cdz_storm|cool"')
     && body.includes('data-thermo-mode="climate.cdz_storm|dry"')
     && !body.includes('data-thermo-mode="climate.cdz_storm|off"'));
  ok("il termostato offre solo le sue due",
     body.includes('data-thermo-mode="climate.termo|heat_cool"')
     && !body.includes('data-thermo-mode="climate.termo|cool"'));

  // manual mode banner
  states["input_boolean.automazioni_cdz_disattivate"] = S("on",
    { friendly_name: "Automazioni CDZ Disattivate" });
  body = el._thermostatBody(card);
  ok("con le automazioni sospese si vede",
     body.includes("th-manual on") && /NON intervengono/.test(body));

  // an unavailable unit says so instead of drawing dead controls
  states["climate.termo"] = S("unavailable", { friendly_name: "Termostato" });
  body = el._thermostatBody(card);
  ok("un'unità non raggiungibile non disegna comandi finti",
     body.includes("Non raggiungibile") && !body.includes('data-thermo-step="climate.termo|1"'));
  states["climate.termo"] = S("off", { friendly_name: "Termostato",
    supported_features: 385, hvac_modes: ["off","heat_cool"],
    min_temp: 1, max_temp: 7, target_temp_step: 0.5, current_temperature: 46, temperature: 4 });

  // -- commands --
  const calls = [];
  const realSvc = el._hass.callService;
  el._hass.callService = (d, sv, data) => calls.push({ d, sv, data });

  el._thermoTemp("climate.cdz_storm", 24.4);
  ok("la temperatura è arrotondata al passo dell'unità",
     states["climate.cdz_storm"].attributes.temperature === 24,
     String(states["climate.cdz_storm"].attributes.temperature));
  el._thermoTemp("climate.cdz_storm", 99);
  ok("e non supera il massimo dichiarato",
     states["climate.cdz_storm"].attributes.temperature === 30,
     String(states["climate.cdz_storm"].attributes.temperature));
  el._thermoTemp("climate.termo", -5);
  ok("né scende sotto il minimo",
     states["climate.termo"].attributes.temperature === 1,
     String(states["climate.termo"].attributes.temperature));
  // trascinare il cursore non deve inondare il condizionatore di chiamate
  ok("trascinare non manda una chiamata per pixel", calls.length === 0, JSON.stringify(calls));

  // chosen units freeze the list
  card.units = ["climate.termo"];
  ok("scegliendo le unità a mano vale l'elenco",
     el._thermoUnits(card).join() === "climate.termo", el._thermoUnits(card).join());
  card.units = [];

  card.show_manual = false;
  ok("e la riga si può togliere",
     !el._thermostatBody(card).includes("th-manual"));
  card.show_manual = true;

  card.show_extras = false;
  ok("ventola e programma si possono nascondere",
     !el._thermostatBody(card).includes("data-thermo-set"));
  card.show_extras = true;

  // A stopped unit still takes a setpoint: TARGET_TEMPERATURE is declared, and
  // nothing in it says "only while running". Setting the target and then
  // switching on is how a thermostat is normally used.
  body = el._thermostatBody(card);
  ok("la temperatura si regola anche a unità spenta",
     /data-thermo-step="climate\.termo\|1"(?![^>]*disabled)/.test(body)
     && /data-thermo-temp="climate\.termo"(?![^>]*disabled)/.test(body));
  ok("ma la card dice che l'unità è spenta", /unità spenta/.test(body));

  // -- the order inside the card is the user's --
  card.manual = ["input_boolean.automazioni_cdz_disattivate"];
  card.units = ["climate.termo", "climate.cdz_storm"];
  card.order = [];
  ok("senza ordine scelto vale quello naturale",
     el._thermoBlocks(card).join(">") === "manual>climate.termo>climate.cdz_storm",
     el._thermoBlocks(card).join(">"));
  card.order = ["climate.cdz_storm", "manual", "climate.termo"];
  ok("l'ordine scelto viene rispettato",
     el._thermoBlocks(card).join(">") === "climate.cdz_storm>manual>climate.termo",
     el._thermoBlocks(card).join(">"));
  body = el._thermostatBody(card);
  ok("e si vede nel disegno",
     body.indexOf("climate.cdz_storm") < body.indexOf("th-block manual"), "");
  // a unit added later must not require rewriting the order
  card.units = ["climate.termo", "climate.cdz_storm", "climate.nuovo"];
  states["climate.nuovo"] = S("off", { friendly_name: "Nuovo", supported_features: 385,
    hvac_modes: ["off", "heat_cool"], min_temp: 5, max_temp: 30, target_temp_step: 0.5 });
  ok("quello che arriva dopo entra in coda",
     el._thermoBlocks(card).join(">") === "climate.cdz_storm>manual>climate.termo>climate.nuovo",
     el._thermoBlocks(card).join(">"));
  // an order naming things that are gone must not resurrect them
  card.order = ["climate.sparito", "manual"];
  ok("un ordine che cita blocchi spariti non li fa comparire",
     !el._thermoBlocks(card).includes("climate.sparito"), el._thermoBlocks(card).join(">"));
  delete states["climate.nuovo"];
  card.order = []; card.units = [];

  // a stopped unit reporting temperature: null must not claim a setpoint of 0
  states["climate.termo"] = S("off", { friendly_name: "Termostato", supported_features: 385,
    hvac_modes: ["off", "heat_cool"], min_temp: 1, max_temp: 7, target_temp_step: 0.5,
    current_temperature: null, temperature: null });
  const nullBody = el._thermostatBody(card);
  ok("nessun «0 °C impostata» inventato da un valore nullo",
     !/>0<\/strong>/.test(nullBody) && /Nessuna temperatura impostata/.test(nullBody), "");
  ok("né un «ora null°»", !/null°/.test(nullBody), "");

  el._hass.callService = realSvc;
  for (const id of ["climate.cdz_storm","climate.termo","input_boolean.automazioni_cdz_disattivate",
                    "input_boolean.scale_override_manuale"]) delete states[id];
  ok("stato ripristinato dopo la sezione 35", !states["climate.cdz_storm"]);
}

console.log("\n== 36. MATERIALI E LUCE VERA ==");
{
  ok("il pavimento viene dedotto dal nome della stanza",
     guessMaterial("Bagno") === "piastrelle" && guessMaterial("Camera da letto") === "parquet"
     && guessMaterial("Giardino") === "prato" && guessMaterial("Garage") === "cemento",
     [guessMaterial("Bagno"), guessMaterial("Camera da letto")].join());
  ok("un nome sconosciuto non inventa un materiale",
     guessMaterial("Zona X") === "neutro");
  ok("ogni materiale produce un disegno diverso",
     new Set(["parquet","piastrelle","cemento","tappeto","prato"].map(materialLayers)).size === 5);
  ok("il materiale neutro non impone niente", materialLayers("neutro") === "");

  // -- la luce vera --
  states["light.sala_a"] = S("off", { friendly_name: "Sala A", supported_color_modes: ["brightness"] });
  states["light.sala_b"] = S("off", { friendly_name: "Sala B", supported_color_modes: ["brightness"] });
  const room = { id: "r1", title: "Soggiorno", color: "#00e5ff", x: 0, y: 0, w: 200, h: 160,
    level: 0, points: null, spots: {}, hidden: [], walls: [], rotation: 0,
    entities: ["light.sala_a", "light.sala_b"], vehicles: [] };

  ok("con tutto spento la stanza è al buio", el._roomLight(room).lit === 0);

  states["light.sala_a"] = S("on", { friendly_name: "Sala A", brightness: 255,
    supported_color_modes: ["brightness"] });
  const half = el._roomLight(room);
  ok("una luce accesa su due illumina, ma non del tutto",
     half.lit > 0.5 && half.lit < 1, String(half.lit));

  states["light.sala_b"] = S("on", { friendly_name: "Sala B", brightness: 255,
    supported_color_modes: ["brightness"] });
  const full = el._roomLight(room);
  ok("accese tutte e due illumina di più", full.lit > half.lit, half.lit + " -> " + full.lit);

  // the point a rendered image can never do: the dimmer moves the picture
  states["light.sala_a"] = S("on", { friendly_name: "Sala A", brightness: 26,
    supported_color_modes: ["brightness"] });
  states["light.sala_b"] = S("on", { friendly_name: "Sala B", brightness: 26,
    supported_color_modes: ["brightness"] });
  const dim = el._roomLight(room);
  ok("abbassando il dimmer la stanza si abbassa davvero",
     dim.lit < full.lit * 0.5, full.lit + " -> " + dim.lit);
  ok("ma non arriva mai a zero mentre è accesa", dim.lit > 0);

  states["light.sala_a"] = S("on", { friendly_name: "Sala A", brightness: 255,
    color_temp_kelvin: 2700, supported_color_modes: ["color_temp"] });
  ok("il colore della luce viene dalla lampadina",
     /^#/.test(el._roomLight(room).color || ""), String(el._roomLight(room).color));

  // a boiler in the room is not a lamp
  states["switch.caldaia"] = S("on", { friendly_name: "Caldaia" });
  room.entities = ["switch.caldaia"];
  ok("un interruttore qualsiasi non fa luce", el._roomLight(room).lit === 0);
  room.entities = ["light.sala_a", "light.sala_b"];

  for (const id of ["light.sala_a","light.sala_b","switch.caldaia"]) delete states[id];
  ok("stato ripristinato dopo la sezione 36", !states["light.sala_a"]);
}

console.log("\n== 37. DISPOSITIVI SENZA AREA ==");
{
  // Oscar's real case: a Tuya DIN-rail plug named "Interruttore Piano
  // Induzione" whose switch is on, but which Home Assistant has filed in no
  // area at all - neither on the entity nor on the device. Nothing in the
  // dashboard could put it in the kitchen, and it simply vanished.
  states["switch.induzione"] = S("on", { friendly_name: "Interruttore Piano Induzione" });
  states["sensor.induzione_potenza"] = S("2100", { friendly_name: "Induzione Potenza",
    device_class: "power", unit_of_measurement: "W" });
  states["switch.induzione_blocco"] = S("off", { friendly_name: "Blocco bambini" });
  states["light.lampada_cucina"] = S("on", { friendly_name: "Lampada <cucina>" });
  states["switch.senza_apparecchio"] = S("off", { friendly_name: "Presa <orfana>" });
  states["binary_sensor.porta"] = S("off", { friendly_name: "Contatto porta", device_class: "door" });

  const areasWS = [{ area_id: "cucina", name: "Cucina" }, { area_id: "bagno", name: "Bagno" }];
  const devicesWS = [
    { id: "dev_induzione", name: "Interruttore Piano Induzione", area_id: null },
    { id: "dev_lampada", name: "Lampada cucina", area_id: "cucina" },
  ];
  const entitiesWS = [
    { entity_id: "switch.induzione", device_id: "dev_induzione", area_id: null },
    { entity_id: "sensor.induzione_potenza", device_id: "dev_induzione", area_id: null },
    { entity_id: "switch.induzione_blocco", device_id: "dev_induzione", area_id: null,
      entity_category: "config" },
    { entity_id: "light.lampada_cucina", device_id: "dev_lampada", area_id: null },
    { entity_id: "switch.senza_apparecchio", device_id: null, area_id: null },
    { entity_id: "binary_sensor.porta", device_id: null, area_id: null },
    { entity_id: "automation.esco_di_casa_allarme_on", device_id: null, area_id: null },
    { entity_id: "person.oscar", device_id: null, area_id: null },
    { entity_id: "device_tracker.iphone_di_oscar", device_id: null, area_id: null },
    { entity_id: "switch.luci_scale", device_id: null, area_id: "bagno" },
  ];
  const regWS = (m) => {
    if (m.type === "config/area_registry/list") return Promise.resolve(areasWS);
    if (m.type === "config/device_registry/list") return Promise.resolve(devicesWS);
    if (m.type === "config/entity_registry/list") return Promise.resolve(entitiesWS);
    return Promise.resolve({});
  };
  const savedWS = el._hass.callWS;
  const savedRegistry = el._registry;
  el._hass.callWS = regWS;
  el._registry = null;
  el._registryLoading = false;

  (async () => {
    await el._loadRegistry();

    // --- the registry itself
    ok("l'entità senza area non finisce in nessuna area",
       !Object.values(el._registry.byArea).some((ids) => ids.includes("switch.induzione")),
       JSON.stringify(el._registry.byArea));
    ok("ma viene registrata come senza area",
       el._registry.orphans.includes("switch.induzione"),
       JSON.stringify(el._registry.orphans));
    ok("l'entità la cui area sta sull'apparecchio non è orfana",
       !el._registry.orphans.includes("light.lampada_cucina")
       && (el._registry.byArea.cucina || []).includes("light.lampada_cucina"));
    ok("le entità di configurazione restano fuori dall'elenco",
       !el._registry.orphans.includes("switch.induzione_blocco"));

    // --- what the user is actually shown
    const list = el._orphans();
    ok("automazioni, persone e telefoni non compaiono",
       !list.includes("automation.esco_di_casa_allarme_on")
       && !list.includes("person.oscar")
       && !list.includes("device_tracker.iphone_di_oscar"), JSON.stringify(list));
    ok("gli interruttori vengono prima dei sensori",
       list.indexOf("switch.induzione") < list.indexOf("sensor.induzione_potenza"),
       JSON.stringify(list));
    ok("un contatto porta è comunque proposto",
       list.includes("binary_sensor.porta"), JSON.stringify(list));

    // --- the block
    const blk = el._orphanBlock("cucina", new Set(), "pick");
    ok("il blocco dichiara quanti sono", /SENZA AREA IN HOME ASSISTANT · 4/.test(blk), blk.slice(0, 120));
    ok("e dice a quale area li archivierebbe", /<strong>Cucina<\/strong>/.test(blk));
    ok("e avverte che tocca Home Assistant, non solo la dashboard",
       /cambia Home Assistant/.test(blk));
    ok("ogni riga ha il pulsante di assegnazione",
       (blk.match(/data-orphan-assign=/g) || []).length === 4,
       String((blk.match(/data-orphan-assign=/g) || []).length));
    ok("in modalità pick le righe si possono anche aggiungere a mano",
       (blk.match(/data-pick-entity=/g) || []).length === 4);
    ok("il nome viene messo in sicurezza",
       blk.includes("Presa &lt;orfana&gt;") && !blk.includes("Presa <orfana>"));
    ok("compare anche l'apparecchio, per capire di cosa si tratta",
       blk.includes("Interruttore Piano Induzione · switch.induzione"));

    const assign = el._orphanBlock("cucina", new Set(), "assign");
    ok("in modalità assign non si aggiunge nulla a mano",
       !/data-pick-entity=/.test(assign) && /data-orphan-assign=/.test(assign));

    ok("chi è già nella stanza non viene riproposto",
       !el._orphanBlock("cucina", new Set(["switch.induzione"]), "pick")
          .includes('data-orphan-assign="switch.induzione"'));

    // --- the regression that hid it: the area block used to return early
    const room = { id: "r1", area_id: "bagno", entities: null, hidden: [] };
    el._entityQuery = "";
    const res = el._roomEntityResults(room);
    ok("con l'area esaurita si vedono comunque i senza-area",
       /SENZA AREA IN HOME ASSISTANT/.test(res), res.slice(0, 160));
    const room2 = { id: "r2", area_id: "cucina", entities: [], hidden: [] };
    ok("e li si vede anche quando l'area ha ancora dispositivi liberi",
       /DALL'AREA DI QUESTA STANZA/.test(el._roomEntityResults(room2))
       && /SENZA AREA IN HOME ASSISTANT/.test(el._roomEntityResults(room2)));

    // --- assigning
    const sent = [];
    el._hass.callWS = (m) => { sent.push(m); return regWS(m); };
    await el._assignArea("switch.induzione", "cucina");
    const upd = sent.filter((m) => /registry\/update$/.test(m.type));
    ok("assegnare sposta l'apparecchio, non la singola entità",
       upd.length === 1 && upd[0].type === "config/device_registry/update"
       && upd[0].device_id === "dev_induzione" && upd[0].area_id === "cucina",
       JSON.stringify(upd));
    ok("e rilegge le anagrafiche invece di indovinare il nuovo stato",
       sent.some((m) => m.type === "config/entity_registry/list"));

    sent.length = 0;
    await el._assignArea("switch.senza_apparecchio", "cucina");
    const upd2 = sent.filter((m) => /registry\/update$/.test(m.type));
    ok("senza apparecchio si aggiorna l'entità",
       upd2.length === 1 && upd2[0].type === "config/entity_registry/update"
       && upd2[0].entity_id === "switch.senza_apparecchio" && upd2[0].area_id === "cucina",
       JSON.stringify(upd2));

    sent.length = 0;
    await el._assignArea("switch.induzione", "");
    ok("senza un'area di destinazione non parte nessuna chiamata",
       sent.length === 0, JSON.stringify(sent));

    // --- a rejection must be reported, not swallowed
    el._registry = null;
    await el._loadRegistry();
    el._hass.callWS = (m) => (/registry\/update$/.test(m.type)
      ? Promise.reject(new Error("area_id non valida")) : regWS(m));
    el._error = "";
    await el._assignArea("switch.induzione", "cucina");
    ok("un rifiuto di Home Assistant viene detto, non ingoiato",
       /area_id non valida/.test(el._error || ""), String(el._error));

    // --- the cap
    el._hass.callWS = regWS;
    for (let i = 0; i < 30; i++) {
      states["switch.finto_" + i] = S("off", { friendly_name: "Finto " + i });
      entitiesWS.push({ entity_id: "switch.finto_" + i, device_id: null, area_id: null });
    }
    el._registry = null;
    await el._loadRegistry();
    const big = el._orphanBlock("cucina", new Set(), "pick");
    ok("l'elenco si ferma a venti righe",
       (big.match(/data-orphan-assign=/g) || []).length === 20,
       String((big.match(/data-orphan-assign=/g) || []).length));
    ok("ma dichiara quanti ne restano fuori", /…e altri 14\./.test(big),
       big.slice(-200));

    ok("senza orfani il blocco non occupa spazio",
       el._orphanBlock("cucina", new Set(el._orphans()), "pick") === "");

    // --- stale build outside the panel
    const savedPanel = el.panel;
    el.panel = undefined;
    el._hass.panels = { "cyborg-dashboard": { config: { version: "9.9.9" } } };
    ok("montata come card la versione del server si legge lo stesso",
       el._serverVersion() === "9.9.9", el._serverVersion());
    ok("e la copia vecchia viene segnalata anche lì", el._staleBuild() === true);
    el._hass.panels = { "cyborg-dashboard": { config: { version: CYBORG_BUILD_TEST } } };
    ok("mentre una copia aggiornata non allarma nessuno", el._staleBuild() === false);
    delete el._hass.panels;
    el.panel = savedPanel;

    // --- cleanup
    for (let i = 0; i < 30; i++) delete states["switch.finto_" + i];
    for (const id of ["switch.induzione", "sensor.induzione_potenza", "switch.induzione_blocco",
      "light.lampada_cucina", "switch.senza_apparecchio", "binary_sensor.porta"]) delete states[id];
    el._hass.callWS = savedWS;
    el._registry = savedRegistry;
    el._error = "";
    ok("stato ripristinato dopo la sezione 37", !states["switch.induzione"]);

    console.log("\n== 38. ACCESI E SPENTI ==");
    {
      // What a wall tablet is actually asked: what is running, and what do I
      // switch on. Turning something off has to move it, by itself, into the
      // section where it can be switched back on.
      el._registry = { areas: [{ area_id: "sala", name: "Sala" }],
        byArea: { sala: ["light.sa_1", "light.sa_2", "climate.sa", "cover.sa_tap",
                         "switch.sa_presa", "input_boolean.sa_vacanza",
                         "camera.sa_cam", "sensor.sa_t", "binary_sensor.sa_porta"] },
        entityArea: {}, category: {}, entityDevice: {}, deviceName: {}, orphans: [] };
      states["light.sa_1"] = S("on", { friendly_name: "Faretti", supported_color_modes: ["brightness"], brightness: 200 });
      states["light.sa_2"] = S("off", { friendly_name: "Piantana", supported_color_modes: ["brightness"] });
      states["climate.sa"] = S("off", { friendly_name: "Condizionatore", current_temperature: 26 });
      states["cover.sa_tap"] = S("open", { friendly_name: "Tapparella", current_position: 0 });
      states["switch.sa_presa"] = S("on", { friendly_name: "Presa TV" });
      states["input_boolean.sa_vacanza"] = S("off", { friendly_name: "Modalità vacanza" });
      states["camera.sa_cam"] = S("idle", { friendly_name: "Telecamera sala" });
      states["sensor.sa_t"] = S("26.0", { friendly_name: "Sala Temperatura", device_class: "temperature", unit_of_measurement: "°C" });
      states["binary_sensor.sa_porta"] = S("on", { friendly_name: "Porta", device_class: "door" });

      const rc = { id: "rc2", type: "room", entity_id: "", name: "Sala", size: "md",
        appearance: {}, states: {}, actions: {}, area: "sala", hidden: [],
        max_readings: 4, show_others: true, grouping: "state" };
      const body = el._roomCardBody(rc);
      const sect = (name) => {
        const i = body.indexOf(">" + name + "<");
        if (i < 0) return "";
        const end = body.indexOf("</section>", i);
        return body.slice(i, end < 0 ? body.length : end);
      };
      ok("la card ha le due sezioni", /Accesi/.test(body) && /Spenti/.test(body),
         body.slice(0, 120));
      const acc = sect("Accesi"), spe = sect("Spenti");
      ok("una luce accesa sta fra gli accesi", acc.includes("Faretti") && !spe.includes("Faretti"));
      ok("una luce spenta sta fra gli spenti", spe.includes("Piantana") && !acc.includes("Piantana"));
      ok("una presa accesa sta fra gli accesi", acc.includes("Presa TV") && !spe.includes("Presa TV"));
      ok("un input boolean spento sta fra gli spenti",
         spe.includes("Modalità vacanza") && !acc.includes("Modalità vacanza"));
      // "open" con posizione 0 è la trappola: lo stato dice aperta, la
      // posizione dice chiusa, e la posizione è quella che si vede
      ok("una tapparella a zero è spenta anche se lo stato dice aperta",
         spe.includes("Tapparella") && !acc.includes("Tapparella"));
      ok("un clima in off è spento", spe.includes("Condizionatore") && !acc.includes("Condizionatore"));
      ok("i conteggi dicono il vero", /<strong>Accesi<\/strong><em>2<\/em>/.test(body)
         && /<strong>Spenti<\/strong><em>4<\/em>/.test(body),
         (body.match(/<strong>(Accesi|Spenti)<\/strong><em>\d+<\/em>/g) || []).join());

      // things that are neither on nor off must not be sorted as if they were
      ok("la telecamera non finisce fra gli spenti",
         !spe.includes("Telecamera sala") && !acc.includes("Telecamera sala")
         && body.includes("Videocamere"));
      ok("un contatto porta non è un carico da accendere",
         !acc.includes(">Porta<") && !spe.includes(">Porta<"));
      ok("la lettura resta in testa", body.includes("rc-strip") && body.includes("26.0"));

      // the move itself: spegnere un carico lo sposta, senza toccare la config
      states["switch.sa_presa"] = S("off", { friendly_name: "Presa TV" });
      const after = el._roomCardBody(rc);
      const acc2 = (() => { const i = after.indexOf(">Accesi<");
        return i < 0 ? "" : after.slice(i, after.indexOf("</section>", i)); })();
      const spe2 = (() => { const i = after.indexOf(">Spenti<");
        return i < 0 ? "" : after.slice(i, after.indexOf("</section>", i)); })();
      ok("spegnendo un carico si sposta da solo nella sezione sotto",
         spe2.includes("Presa TV") && !acc2.includes("Presa TV"));
      ok("e da lì si può riaccendere",
         spe2.includes('data-toggle-entity="switch.sa_presa"'));
      states["switch.sa_presa"] = S("on", { friendly_name: "Presa TV" });

      // il proprietario decide cosa si vede, in entrambe le sezioni
      rc.hidden = ["input_boolean.sa_vacanza"];
      const hid = el._roomCardBody(rc);
      ok("un'entità nascosta non compare né fra gli accesi né fra gli spenti",
         !hid.includes("Modalità vacanza"));
      ok("le altre restano", hid.includes("Faretti") && hid.includes("Presa TV"));
      rc.hidden = [];

      // il raggruppamento per tipo resta disponibile per chi lo preferisce
      rc.grouping = "domain";
      const dom = el._roomCardBody(rc);
      ok("per tipo torna ai blocchi di prima",
         dom.includes("Luci") && dom.includes("Aperture") && !/>Accesi</.test(dom));
      ok("e la telecamera resta al suo posto anche lì", dom.includes("Videocamere"));
      rc.grouping = "state";

      ok("solo la sezione accesi offre lo spegnimento luci",
         acc.includes('data-room-lights-off="sala"') && !spe.includes("data-room-lights-off"));
      ok("card accesi/spenti: nessun undefined",
         !/>undefined</.test(body) && !body.includes("[object"));

      // deviceOn da solo, sui casi limite
      ok("una tapparella a metà è accesa",
         deviceOn("cover.x", { state: "open", attributes: { current_position: 40 } }));
      ok("senza posizione vale lo stato",
         deviceOn("cover.x", { state: "open", attributes: {} })
         && !deviceOn("cover.x", { state: "closed", attributes: {} }));
      ok("un clima non disponibile non è acceso",
         !deviceOn("climate.x", { state: "unavailable", attributes: {} }));
      ok("un media player in standby non è acceso",
         !deviceOn("media_player.x", { state: "standby", attributes: {} })
         && deviceOn("media_player.x", { state: "playing", attributes: {} }));
      ok("nessuno stato non esplode", !deviceOn("light.x", null));

      for (const id of ["light.sa_1","light.sa_2","climate.sa","cover.sa_tap","switch.sa_presa",
        "input_boolean.sa_vacanza","camera.sa_cam","sensor.sa_t","binary_sensor.sa_porta"]) delete states[id];
      el._registry = savedRegistry;
      ok("stato ripristinato dopo la sezione 38", !states["light.sa_1"]);
    }

    console.log("\n== 39. GERARCHIA FRA POTENZA ED ENERGIA ==");
    {
      // Il caso reale: la gerarchia e' dichiarata nell'analisi economica, che
      // ragiona in kWh, e il flusso energetico disegna watt. Stessa presa,
      // stesso cavo, due entity_id diversi: il diagramma metteva la friggitrice
      // ACCANTO alla presa che la alimenta invece che sotto.
      const savedReg = el._registry, savedDash = el._dashboard;
      states["sensor.frigg_potenza"] = S("28", { friendly_name: "Friggitrice Potenza", device_class: "power", unit_of_measurement: "W" });
      states["sensor.frigg_energia"] = S("134", { friendly_name: "Friggitrice Energia", device_class: "energy", unit_of_measurement: "kWh" });
      states["sensor.presa_potenza"] = S("120", { friendly_name: "Presa Potenza", device_class: "power", unit_of_measurement: "W" });
      states["sensor.presa_energia"] = S("400", { friendly_name: "Presa Energia", device_class: "energy", unit_of_measurement: "kWh" });
      states["sensor.quadro_potenza"] = S("1400", { friendly_name: "Quadro Potenza", device_class: "power", unit_of_measurement: "W" });
      states["sensor.quadro_energia"] = S("1548", { friendly_name: "Quadro Energia", device_class: "energy", unit_of_measurement: "kWh" });
      states["sensor.solo_energia"] = S("5", { friendly_name: "Solo energia", device_class: "energy", unit_of_measurement: "kWh" });

      el._registry = { areas: [], byArea: {}, entityArea: {}, category: {}, orphans: [],
        deviceName: {},
        entityDevice: { "sensor.frigg_potenza": "d_frigg", "sensor.frigg_energia": "d_frigg",
          "sensor.presa_potenza": "d_presa", "sensor.presa_energia": "d_presa",
          "sensor.quadro_potenza": "d_quadro", "sensor.quadro_energia": "d_quadro" },
        deviceEntities: { d_frigg: ["sensor.frigg_potenza", "sensor.frigg_energia"],
          d_presa: ["sensor.presa_potenza", "sensor.presa_energia"],
          d_quadro: ["sensor.quadro_potenza", "sensor.quadro_energia"] } };
      el._dashboard = { hierarchy: {
        "sensor.frigg_energia": "sensor.presa_energia",
        "sensor.presa_energia": "sensor.quadro_energia" } };

      ok("dichiarata sull'energia, la gerarchia vale anche per la potenza",
         el._parentOf("sensor.frigg_potenza", null) === "sensor.presa_potenza",
         String(el._parentOf("sensor.frigg_potenza", null)));
      ok("e regge su piu' livelli",
         el._parentOf("sensor.presa_potenza", null) === "sensor.quadro_potenza",
         String(el._parentOf("sensor.presa_potenza", null)));
      ok("sull'energia continua a valere direttamente",
         el._parentOf("sensor.frigg_energia", null) === "sensor.presa_energia");
      ok("un padre dichiarato sulla singola card vince ancora",
         el._parentOf("sensor.frigg_potenza", "sensor.quadro_potenza") === "sensor.quadro_potenza");
      ok("una radice non inventa un padre",
         el._parentOf("sensor.quadro_potenza", null) === null,
         String(el._parentOf("sensor.quadro_potenza", null)));
      ok("un'entita' senza apparecchio non eredita niente",
         el._parentOf("sensor.solo_energia", null) === null);

      // il padre deve essere della STESSA grandezza: W e kW sono la stessa
      // cosa fisica ma non lo stesso numero
      states["sensor.presa_potenza_kw"] = S("0.12", { friendly_name: "Presa Potenza kW", device_class: "power", unit_of_measurement: "kW" });
      el._registry.entityDevice["sensor.presa_potenza_kw"] = "d_presa";
      el._registry.deviceEntities.d_presa.push("sensor.presa_potenza_kw");
      ok("fra due sensori di potenza sceglie quello con la stessa unita'",
         el._parentOf("sensor.frigg_potenza", null) === "sensor.presa_potenza",
         String(el._parentOf("sensor.frigg_potenza", null)));

      // mai se stesso, mai un anello
      el._dashboard.hierarchy["sensor.presa_energia"] = "sensor.frigg_energia";
      const p = el._parentOf("sensor.frigg_potenza", null);
      ok("non si prende come padre da solo", p !== "sensor.frigg_potenza", String(p));
      el._dashboard.hierarchy["sensor.presa_energia"] = "sensor.quadro_energia";

      // senza anagrafiche non deve esplodere: e' il caso del primo render
      el._registry = null;
      ok("senza anagrafiche caricate non esplode e non inventa",
         el._parentOf("sensor.frigg_potenza", null) === null);

      el._registry = savedReg; el._dashboard = savedDash;
      for (const id of ["sensor.frigg_potenza","sensor.frigg_energia","sensor.presa_potenza",
        "sensor.presa_energia","sensor.quadro_potenza","sensor.quadro_energia",
        "sensor.presa_potenza_kw","sensor.solo_energia"]) delete states[id];
      ok("stato ripristinato dopo la sezione 39", !states["sensor.frigg_potenza"]);
    }

    console.log("\n== 40. DA QUANTO E' DAVVERO ACCESO ==");
    {
      // Verificato sull'impianto reale: dopo un riavvio cinque interruttori
      // portavano lo STESSO last_changed al millisecondo (10:24:10), mentre il
      // recorder sapeva che l'asciugatrice era partita alle 08:25 e la
      // cantinetta due giorni prima. last_changed misura da quando e' acceso
      // Home Assistant, non da quando e' acceso il carico.
      const savedWS = el._hass.callWS;
      const NOW = 1756200000000;              // istante fisso: niente Date.now nei test
      const restart = NOW - 2 * 3600000;      // "riavvio" due ore fa
      const vero = NOW - 5 * 3600000;         // acceso davvero cinque ore fa

      states["switch.asciug"] = { state: "on", attributes: { friendly_name: "Asciugatrice" },
        last_changed: new Date(restart).toISOString() };
      states["switch.cantin"] = { state: "on", attributes: { friendly_name: "Cantinetta" },
        last_changed: new Date(restart).toISOString() };

      let asked = null;
      el._hass.callWS = (m) => {
        if (m.type !== "history/history_during_period") return Promise.resolve({});
        asked = m;
        return Promise.resolve({
          "switch.asciug": [
            { s: "off", lu: (NOW - 9 * 3600000) / 1000 },
            { s: "on", lu: vero / 1000 },
          ],
          // blip di rete: 0,3 secondi di unavailable non spengono niente
          "switch.cantin": [
            { s: "on", lu: (NOW - 40 * 3600000) / 1000 },
            { s: "unavailable", lu: (NOW - 30 * 3600000) / 1000 },
            { s: "on", lu: (NOW - 30 * 3600000 + 300) / 1000 },
          ],
        });
      };

      el._since = null; el._sinceLoading = false;
      el._loadSince(["switch.asciug", "switch.cantin"]);
      setTimeout(() => {
        ok("chiede la storia di tutte le entita' in una volta sola",
           asked && asked.entity_ids.length === 2 && asked.minimal_response === true,
           JSON.stringify(asked && asked.entity_ids));
        ok("l'orario vero viene dal recorder, non dal riavvio",
           el._since["switch.asciug"].t === vero,
           new Date(el._since["switch.asciug"].t || 0).toISOString() + " vs " + new Date(vero).toISOString());
        ok("e non e' l'ora del riavvio",
           el._since["switch.asciug"].t !== restart);
        ok("un blip di rete non azzera il conteggio",
           el._since["switch.cantin"].t === NOW - 40 * 3600000,
           String(el._since["switch.cantin"].t));
        ok("lo spegnimento precedente non viene attraversato",
           el._since["switch.asciug"].t > NOW - 9 * 3600000);
        ok("si ricorda con quale last_changed ha risposto",
           el._since["switch.asciug"].stamp === states["switch.asciug"].last_changed);

        // il numero di ore che finisce a schermo
        ok("a schermo diventa cinque ore, non due",
           sinceWords(el._since["switch.asciug"].t, NOW) === "da 5 h",
           sinceWords(el._since["switch.asciug"].t, NOW));
        ok("e last_changed da solo avrebbe detto due",
           sinceWords(restart, NOW) === "da 2 h", sinceWords(restart, NOW));

        // un secondo giro non deve ripartire finche' niente e' cambiato
        asked = null;
        const rows = el._activeEntities({ domains: ["switch"], exclude: [] });
        const row = rows.find((r) => r.id === "switch.asciug");
        ok("la card usa l'orario corretto", row && row.since === vero,
           String(row && row.since));
        ok("e non richiede piu' la storia di quelle gia' lette",
           !asked || !asked.entity_ids.some((x) => x === "switch.asciug" || x === "switch.cantin"),
           JSON.stringify(asked && asked.entity_ids));

        // ma un vero cambio di stato la fa richiedere
        states["switch.asciug"] = { state: "on", attributes: { friendly_name: "Asciugatrice" },
          last_changed: new Date(NOW - 60000).toISOString() };
        el._sinceLoading = false;
        el._activeEntities({ domains: ["switch"], exclude: [] });
        ok("un cambio vero fa richiedere la storia", asked !== null,
           JSON.stringify(asked && asked.entity_ids));

        // senza recorder si torna a last_changed invece di non dire niente
        el._hass.callWS = () => Promise.reject(new Error("no recorder"));
        el._since = null; el._sinceLoading = false;
        el._loadSince(["switch.cantin"]);
        setTimeout(() => {
          ok("senza recorder non resta un buco",
             el._since["switch.cantin"] && el._since["switch.cantin"].t === null);
          const back = el._activeEntities({ domains: ["switch"], exclude: [] })
            .find((r) => r.id === "switch.cantin");
          ok("e la card ripiega su last_changed", back && back.since === restart,
             String(back && back.since));

          el._hass.callWS = savedWS;
          el._since = null; el._sinceLoading = false;
          delete states["switch.asciug"]; delete states["switch.cantin"];
          ok("stato ripristinato dopo la sezione 40", !states["switch.asciug"]);

          console.log("\n== 41. ZERO CHE NON E' UNO ZERO ==");
          {
            // Misurato sull'impianto: la presa dell'asciugatrice riporta 0.0 W
            // per una quarantina di secondi mentre la macchina gira - 11:18:59
            // zero, 11:19:41 di nuovo 172 W - e il contatore di energia sale
            // dritto per tutto il tempo. Il dato e' fresco, quindi nessun
            // controllo di obsolescenza lo prende: e' semplicemente falso.
            const savedReg = el._registry;
            states["sensor.asc_potenza"] = S("172", { friendly_name: "Asciugatrice Potenza", device_class: "power", unit_of_measurement: "W" });
            states["switch.asc_presa"] = S("on", { friendly_name: "Asciugatrice Presa" });
            el._registry = { areas: [], byArea: {}, entityArea: {}, category: {}, orphans: [], deviceName: {},
              entityDevice: { "sensor.asc_potenza": "d_asc", "switch.asc_presa": "d_asc" },
              deviceEntities: { d_asc: ["sensor.asc_potenza", "switch.asc_presa"] } };
            el._lastGood = {};

            ok("una lettura buona passa cosi' com'e'",
               el._bridge("sensor.asc_potenza", 172).watts === 172
               && el._bridge("sensor.asc_potenza", 172).bridged === false);
            const zero = el._bridge("sensor.asc_potenza", 0);
            ok("uno zero con la presa accesa mostra l'ultimo valore vero",
               zero.watts === 172 && zero.bridged === true, JSON.stringify(zero));
            ok("e la lettura successiva torna a comandare",
               el._bridge("sensor.asc_potenza", 165).watts === 165);

            // il limite che rende il ponte onesto: la presa spenta
            states["switch.asc_presa"] = S("off", { friendly_name: "Asciugatrice Presa" });
            const offNow = el._bridge("sensor.asc_potenza", 0);
            ok("a presa spenta lo zero e' vero e resta zero",
               offNow.watts === 0 && offNow.bridged === false, JSON.stringify(offNow));
            states["switch.asc_presa"] = S("on", { friendly_name: "Asciugatrice Presa" });

            // e il limite di tempo: un buco di due minuti non si copre
            el._lastGood["sensor.asc_potenza"] = { w: 172, t: Date.now() - 130000 };
            const old = el._bridge("sensor.asc_potenza", 0);
            ok("dopo due minuti non si inventa piu' niente",
               old.watts === 0 && old.bridged === false, JSON.stringify(old));

            // senza apparecchio non si sa se e' acceso: nessun ponte
            el._lastGood["sensor.solo.potenza"] = { w: 50, t: Date.now() };
            ok("senza un interruttore sullo stesso apparecchio non si copre niente",
               el._bridge("sensor.solo.potenza", 0).bridged === false);

            el._registry = savedReg; el._lastGood = {};
            delete states["sensor.asc_potenza"]; delete states["switch.asc_presa"];
            ok("stato ripristinato dopo la sezione 41", !states["sensor.asc_potenza"]);
          }

          console.log("\n== 42. QUALI LINEE VEDERE ==");
          {
            const savedDash = el._dashboard;
            for (const n of ["a", "b", "c", "d", "e"]) {
              states["sensor.t_" + n] = S("21", { friendly_name: "T " + n.toUpperCase(),
                device_class: "temperature", unit_of_measurement: "°C" });
            }
            const card = { id: "trc", type: "trend", entity_id: "", name: "Confronto", size: "xl",
              appearance: {}, states: {}, actions: {}, source: "manual", hours: 24, max_series: 8,
              hidden_series: [],
              series: ["a", "b", "c", "d", "e"].map((n) => ({ entity: "sensor.t_" + n, name: "T " + n, color: "" })) };
            el._dashboard = { pages: [{ id: "p", sections: [{ id: "s", items: [card] }] }] };

            ok("di default il grafico disegna tutte e cinque le linee",
               el._trendSeries(card).length === 5, String(el._trendSeries(card).length));
            ok("la card si ritrova dall'id", el._findCard("trc") === card);

            el._toggleSeries("trc", "sensor.t_b");
            el._toggleSeries("trc", "sensor.t_d");
            ok("spegnendone due ne restano tre",
               el._trendSeries(card).length === 3, String(el._trendSeries(card).length));
            ok("e sono proprio quelle giuste",
               el._trendSeries(card).map((r) => r.entity).join() === "sensor.t_a,sensor.t_c,sensor.t_e",
               el._trendSeries(card).map((r) => r.entity).join());
            ok("il selettore continua a elencarle tutte",
               el._trendAllSeries(card).length === 5);
            ok("la scelta viene salvata sulla card, non nella sessione",
               JSON.stringify(card.hidden_series) === JSON.stringify(["sensor.t_b", "sensor.t_d"]),
               JSON.stringify(card.hidden_series));
            ok("e la dashboard risulta da salvare", el._dirty === true);

            el._toggleSeries("trc", "sensor.t_b");
            ok("riaccenderla la riporta nel grafico",
               el._trendSeries(card).length === 4);

            // non si puo' restare senza niente sullo schermo
            card.hidden_series = ["sensor.t_b", "sensor.t_c", "sensor.t_d", "sensor.t_e"];
            el._toggleSeries("trc", "sensor.t_a");
            ok("l'ultima linea accesa non si puo' spegnere",
               el._trendSeries(card).length === 1
               && el._trendSeries(card)[0].entity === "sensor.t_a",
               JSON.stringify(card.hidden_series));

            // e una card con tutto spento da fuori non resta comunque vuota
            card.hidden_series = el._trendAllSeries(card).map((r) => r.entity);
            ok("con tutte spente il grafico non resta vuoto",
               el._trendSeries(card).length === 5);
            card.hidden_series = [];

            // il pannello di scelta
            el._seriesPicker = "trc";
            const html = el._trendPicker(card);
            ok("il pannello elenca tutte le linee",
               (html.match(/data-trend-pick="/g) || []).length === 5,
               String((html.match(/data-trend-pick="/g) || []).length));
            ok("e dice quante ne sono accese", /<em>5\/5<\/em>/.test(html), html.slice(0, 200));
            card.hidden_series = ["sensor.t_a"];
            ok("il conteggio segue le scelte", /<em>4\/5<\/em>/.test(el._trendPicker(card)));
            ok("la riga spenta si vede che e' spenta",
               /data-trend-pick="trc\|sensor\.t_a"/.test(el._trendPicker(card))
               && !/class="tr-pick-row on" style="--sc:[^"]*"\s*\n?\s*data-trend-pick="trc\|sensor\.t_a"/.test(el._trendPicker(card)));
            ok("c'e' il modo di riaccenderle tutte",
               /data-trend-pick-set="trc\|all"/.test(el._trendPicker(card)));
            ok("pannello scelta linee: nessun undefined",
               !/>undefined</.test(el._trendPicker(card)));
            el._seriesPicker = null;

            for (const n of ["a", "b", "c", "d", "e"]) delete states["sensor.t_" + n];
            el._dashboard = savedDash; el._dirty = false;
            ok("stato ripristinato dopo la sezione 42", !states["sensor.t_a"]);
          }

          console.log("\n== 43. LA GERARCHIA SI DICHIARA ANCHE DAL FLUSSO ==");
          {
            // L'editor del flusso non offriva la parentela: solo nome, icona e
            // cestino. Quello dell'analisi economica si'. Dichiararla di la' e
            // vederla applicata di qua funzionava (0.38.0), ma non c'era modo
            // di dichiararla QUI ne' di verificare che fosse arrivata.
            const savedDash = el._dashboard, savedReg = el._registry;
            states["sensor.q_potenza"] = S("1400", { friendly_name: "Quadro Potenza", device_class: "power", unit_of_measurement: "W" });
            states["sensor.p_potenza"] = S("120", { friendly_name: "Presa cucina Potenza", device_class: "power", unit_of_measurement: "W" });
            states["sensor.f_potenza"] = S("95", { friendly_name: "Friggitrice Potenza", device_class: "power", unit_of_measurement: "W" });
            states["sensor.p_energia"] = S("400", { friendly_name: "Presa cucina Energia", device_class: "energy", unit_of_measurement: "kWh" });
            states["sensor.f_energia"] = S("134", { friendly_name: "Friggitrice Energia", device_class: "energy", unit_of_measurement: "kWh" });
            states["sensor.x_potenza"] = S("60", { friendly_name: "Fuori card Potenza", device_class: "power", unit_of_measurement: "W" });

            el._registry = { areas: [], byArea: {}, entityArea: {}, category: {}, orphans: [], deviceName: {},
              entityDevice: { "sensor.p_potenza": "d_p", "sensor.p_energia": "d_p",
                "sensor.f_potenza": "d_f", "sensor.f_energia": "d_f" },
              deviceEntities: { d_p: ["sensor.p_potenza", "sensor.p_energia"],
                d_f: ["sensor.f_potenza", "sensor.f_energia"] } };

            const flowCard = { id: "fc", type: "energyflow", entity_id: "", name: "Flusso",
              size: "xl", appearance: {}, states: {}, actions: {},
              flow: { solar: null, grid: null, battery: null, home: null, devices: [
                { entity: "sensor.q_potenza", name: "Quadro", icon: "", parent: null },
                { entity: "sensor.p_potenza", name: "Presa cucina", icon: "", parent: null },
                { entity: "sensor.f_potenza", name: "Friggitrice", icon: "", parent: null }] } };
            el._dashboard = { hierarchy: {}, pages: [{ id: "p", sections: [{ id: "s", items: [flowCard] }] }] };

            const ed = () => el._flowEditor(flowCard);
            ok("ogni carico ha il suo «compreso dentro»",
               (ed().match(/data-flow-dev-parent="/g) || []).length === 3,
               String((ed().match(/data-flow-dev-parent="/g) || []).length));
            ok("un carico non puo' essere padre di se stesso",
               !/data-flow-dev-parent="2"[\s\S]{0,400}?value="sensor\.f_potenza"/.test(ed()));
            ok("all'inizio nessuno dipende da nessuno",
               !/già dichiarato/.test(ed()) && /— è un carico a sé —/.test(ed()));

            // il doppio controllo: dichiarata sull'ENERGIA nell'analisi
            // economica, deve risultare gia' scelta qui, sui watt
            el._dashboard.hierarchy["sensor.f_energia"] = "sensor.p_energia";
            const inh = ed();
            ok("la parentela dichiarata altrove risulta gia' scelta qui",
               /<option value="sensor\.p_potenza" selected>/.test(inh),
               (inh.match(/<option value="sensor\.p_potenza"[^>]*>/g) || []).join());
            ok("e viene detto che arriva dall'altra card",
               /già dichiarato nell'analisi economica/.test(inh));

            // un padre che non e' fra i carichi di QUESTA card va detto, non taciuto
            el._dashboard.hierarchy["sensor.q_potenza"] = "sensor.x_potenza";
            ok("un padre fuori dalla card viene segnalato",
               /che non è fra questi carichi/.test(ed()), ed().slice(0, 40));
            delete el._dashboard.hierarchy["sensor.q_potenza"];

            // scelta a mano: scrive sulla card E sulla mappa condivisa
            flowCard.flow.devices[1].parent = "sensor.q_potenza";
            el._setParent("sensor.p_potenza", "sensor.q_potenza");
            ok("scegliendo qui si scrive anche nella mappa condivisa",
               el._dashboard.hierarchy["sensor.p_potenza"] === "sensor.q_potenza");
            // il blocco della singola riga, non tutta la pagina: "Presa cucina"
            // compare anche fra le opzioni delle altre righe
            const blockOf = (label) => {
              const html = ed();
              const i = html.indexOf("<span>" + label + "</span>");
              if (i < 0) return "";
              const start = html.lastIndexOf('<div class="flow-dev">', i);
              const end = html.indexOf('<div class="flow-dev">', i);
              return html.slice(start, end < 0 ? html.length : end);
            };
            ok("e la scelta a mano non viene marcata come ereditata",
               !/già dichiarato/.test(blockOf("Presa cucina")),
               blockOf("Presa cucina").slice(0, 80));

            // divergenza: la scelta locale dice una cosa, la mappa un'altra
            // La voce diretta vincerebbe sempre: la divergenza esiste quando la
            // mappa condivisa risponde attraverso l'ALTRO sensore dello stesso
            // apparecchio, che e' esattamente il caso reale (kWh contro W).
            delete el._dashboard.hierarchy["sensor.p_potenza"];
            el._dashboard.hierarchy["sensor.p_energia"] = "sensor.f_energia";
            flowCard.flow.devices[1].parent = "sensor.q_potenza";
            const div = blockOf("Presa cucina");
            ok("una divergenza fra le due card viene mostrata",
               /altrove risulta dentro/.test(div) && /data-flow-dev-align="1"/.test(div),
               div.replace(/\s+/g, " ").slice(0, 160));
            delete el._dashboard.hierarchy["sensor.p_energia"];

            // e il diagramma disegna davvero l'albero
            flowCard.flow.devices[1].parent = null;
            flowCard.flow.devices[2].parent = null;
            el._dashboard.hierarchy = { "sensor.f_energia": "sensor.p_energia",
              "sensor.p_potenza": "sensor.q_potenza" };
            const loads = el._flowLoads(flowCard.flow, 1400);
            // _flowLoads restituisce le RADICI: i figli stanno dentro children,
            // che e' il modo in cui il diagramma li disegna incolonnati.
            const flat = [];
            (function walk(list) { for (const l of list) { flat.push(l); walk(l.children || []); } })(loads);
            const byId = Object.fromEntries(flat.map((l) => [l.entity, l]));
            ok("i tre carichi sono tutti nel diagramma",
               !!byId["sensor.q_potenza"] && !!byId["sensor.p_potenza"] && !!byId["sensor.f_potenza"],
               JSON.stringify(flat.map((l) => [l.entity, l.watts, l.parent])));
            ok("e solo il quadro e' una radice",
               loads.filter((l) => !l.other).length === 1
               && loads.filter((l) => !l.other)[0].entity === "sensor.q_potenza",
               JSON.stringify(loads.map((l) => l.entity)));
            ok("il diagramma mette la presa sotto il quadro",
               byId["sensor.p_potenza"].parent === "sensor.q_potenza",
               String(byId["sensor.p_potenza"].parent));
            ok("e la friggitrice sotto la presa, arrivando dai kWh",
               byId["sensor.f_potenza"].parent === "sensor.p_potenza",
               String(byId["sensor.f_potenza"].parent));
            ok("il quadro resta la radice", byId["sensor.q_potenza"].parent === null,
               String(byId["sensor.q_potenza"].parent));

            ok("editor flusso: nessun undefined",
               !/>undefined</.test(ed()) && !ed().includes("[object"));

            for (const id of ["sensor.q_potenza","sensor.p_potenza","sensor.f_potenza",
              "sensor.p_energia","sensor.f_energia","sensor.x_potenza"]) delete states[id];
            el._dashboard = savedDash; el._registry = savedReg;
            ok("stato ripristinato dopo la sezione 43", !states["sensor.q_potenza"]);
          }

          console.log("\n== 44. FASCE ORARIE E BOLLETTA ==");
          {
            // Definizione ARERA verificata su due fonti indipendenti, non a
            // memoria: F1 lun-ven 8-19; F2 lun-ven 7-8 e 19-23 piu' sabato
            // 7-23; F3 le notti lun-sab, la domenica e i festivi nazionali.
            const at = (y, m, d, h) => new Date(y, m - 1, d, h, 30);
            // 2026: 24 agosto lunedi, 29 sabato, 30 domenica
            ok("lunedi alle 10 e' F1", tariffBand(at(2026, 8, 24, 10)) === "f1", tariffBand(at(2026, 8, 24, 10)));
            ok("lunedi alle 7 e' F2", tariffBand(at(2026, 8, 24, 7)) === "f2");
            ok("lunedi alle 19 e' F2", tariffBand(at(2026, 8, 24, 19)) === "f2");
            ok("lunedi alle 18 e' ancora F1", tariffBand(at(2026, 8, 24, 18)) === "f1");
            ok("lunedi alle 23 e' F3", tariffBand(at(2026, 8, 24, 23)) === "f3");
            ok("lunedi alle 3 di notte e' F3", tariffBand(at(2026, 8, 24, 3)) === "f3");
            ok("venerdi alle 10 e' F1", tariffBand(at(2026, 8, 28, 10)) === "f1");
            ok("sabato alle 10 e' F2, non F1", tariffBand(at(2026, 8, 29, 10)) === "f2",
               tariffBand(at(2026, 8, 29, 10)));
            ok("sabato alle 23 e' F3", tariffBand(at(2026, 8, 29, 23)) === "f3");
            ok("sabato alle 6 e' F3", tariffBand(at(2026, 8, 29, 6)) === "f3");
            ok("domenica e' F3 tutto il giorno",
               [0, 8, 12, 18, 22].every((h) => tariffBand(at(2026, 8, 30, h)) === "f3"));

            // i festivi nazionali valgono F3 anche se cadono di mercoledi
            ok("Natale e' F3 anche a mezzogiorno", tariffBand(at(2026, 12, 25, 12)) === "f3");
            ok("Ferragosto e' F3", tariffBand(at(2026, 8, 15, 12)) === "f3");
            ok("il 25 aprile e' F3", tariffBand(at(2026, 4, 25, 10)) === "f3");
            ok("il 2 giugno e' F3", tariffBand(at(2026, 6, 2, 10)) === "f3");
            ok("un 25 marzo qualunque non e' festivo",
               tariffBand(at(2026, 3, 25, 10)) === "f1", tariffBand(at(2026, 3, 25, 10)));

            // Pasqua: l'unico festivo mobile. Pasqua 2026 = 5 aprile,
            // quindi Pasquetta = lunedi 6 aprile.
            const e26 = easterSunday(2026);
            ok("Pasqua 2026 e' il 5 aprile",
               e26.getMonth() === 3 && e26.getDate() === 5,
               e26.toDateString());
            ok("Pasqua 2027 e' il 28 marzo",
               easterSunday(2027).getMonth() === 2 && easterSunday(2027).getDate() === 28,
               easterSunday(2027).toDateString());
            ok("Pasqua 2024 e' il 31 marzo",
               easterSunday(2024).getMonth() === 2 && easterSunday(2024).getDate() === 31,
               easterSunday(2024).toDateString());
            ok("Pasquetta e' F3 anche se e' un lunedi lavorativo",
               tariffBand(at(2026, 4, 6, 10)) === "f3", tariffBand(at(2026, 4, 6, 10)));
            ok("il martedi dopo Pasquetta torna F1",
               tariffBand(at(2026, 4, 7, 10)) === "f1");

            // --- il calcolo della bolletta
            const savedWS = el._hass.callWS;
            const card = { id: "eco1", type: "economy", entity_id: "", name: "Economia", size: "xl",
              appearance: {}, states: {}, actions: {}, devices: [],
              grid_import: "sensor.rete_energia", grid_export: null, solar: null,
              price_import: 0.25, price_export: 0.10, period: "month",
              tariff_mode: "single", bands: { f1: 0.30, f2: 0.27, f3: 0.24 },
              fixed: [], vat: 0 };
            const data = { imported: 100, exported: 0, produced: 0, devices: {} };

            const W = globalThis.winTest();
            let fig = el._economyFigures(card, data, W);
            ok("monoraria: cento kWh a 0,25 fanno 25 euro", Math.abs(fig.cost - 25) < 0.001,
               String(fig.cost));
            ok("senza voci fisse e senza IVA il totale e' l'energia",
               Math.abs(fig.billed - 25) < 0.001, String(fig.billed));
            ok("e la card non mostra il riquadro bolletta", fig.hasBill === false);

            // voci fisse riproporzionate al periodo
            card.fixed = [{ label: "Canone RAI", amount: 90, every: "year" },
                          { label: "Quota fissa", amount: 12, every: "month" }];
            fig = el._economyFigures(card, data, W);
            const atteso = 90 / 365.2425 * 30 + 12 / 30.436875 * 30;
            ok("le voci fisse vengono riproporzionate ai trenta giorni",
               Math.abs(fig.fixed - atteso) < 0.01, fig.fixed.toFixed(3) + " vs " + atteso.toFixed(3));
            ok("il canone annuo su trenta giorni sono circa sette euro e mezzo",
               Math.abs(90 / 365.2425 * 30 - 7.39) < 0.05, String(90 / 365.2425 * 30));
            ok("e ora il riquadro bolletta compare", fig.hasBill === true);
            ok("il totale somma energia e quote fisse",
               Math.abs(fig.billed - (25 + atteso)) < 0.01, String(fig.billed));

            card.vat = 10;
            fig = el._economyFigures(card, data, W);
            ok("l'IVA si applica a energia e quote fisse",
               Math.abs(fig.billed - (25 + atteso) * 1.1) < 0.01, String(fig.billed));
            // l'immissione si sottrae DOPO l'IVA
            const dataPv = { imported: 100, exported: 40, produced: 60, devices: {} };
            fig = el._economyFigures(card, dataPv, W);
            ok("l'immissione viene sottratta dopo l'IVA, non tassata",
               Math.abs(fig.billed - ((25 + atteso) * 1.1 - 4)) < 0.01, String(fig.billed));
            card.vat = 0; card.fixed = [];

            // --- multifascia
            card.tariff_mode = "bands";
            el._bands = {};
            el._hass.callWS = (m) => {
              if (m.type !== "recorder/statistics_during_period") return Promise.resolve({});
              ok("chiede le statistiche ORA per ora", m.period === "hour", m.period);
              ok("e chiede anche il campo change, non solo sum",
                 Array.isArray(m.types) && m.types.includes("change"), JSON.stringify(m.types));
              // `change` e' l'energia passata DENTRO l'ora che comincia in
              // `start`. Niente `sum`: se il conto torna lo stesso, vuol dire
              // che il campo giusto viene letto e non la differenza fra due
              // letture consecutive.
              //
              // Le righe delle 7 e delle 8 di lunedi sono messe apposta: le 8
              // sono il confine fra F2 e F1. La 0.43.0 attribuiva l'energia
              // all'ora PRECEDENTE, e quei due kWh finivano in F2 invece che
              // in F1. Se qualcuno rimette quello sbaglio, questo test cade.
              const mk = (y, mo, d, h) => new Date(y, mo - 1, d, h, 0, 0).getTime();
              return Promise.resolve({ "sensor.rete_energia": [
                { start: mk(2026, 8, 24, 2), change: 28 },    // lun 02 -> F3
                { start: mk(2026, 8, 24, 7), change: 1 },     // lun 07 -> F2
                { start: mk(2026, 8, 24, 8), change: 2 },     // lun 08 -> F1
                { start: mk(2026, 8, 24, 10), change: 8 },    // lun 10 -> F1
                { start: mk(2026, 8, 24, 20), change: 19 },   // lun 20 -> F2
                { start: mk(2026, 8, 30, 12), change: 30 },   // dom 12 -> F3
                { start: mk(2026, 8, 30, 13), change: 12 },   // dom 13 -> F3
              ] });
            };
            ok("finche' non risponde la card lo dice invece di mentire",
               el._economyFigures(card, data, W).bandsPending === true);
            setTimeout(() => {
              const fb = el._economyFigures(card, data, W);
              ok("le fasce sono state riconosciute",
                 !!fb.byBand, JSON.stringify(fb.byBand && fb.byBand.map((b) => [b.key, b.kwh])));
              const kwh = Object.fromEntries(fb.byBand.map((b) => [b.key, b.kwh]));
              ok("dieci kWh finiscono in F1", Math.abs(kwh.f1 - 10) < 0.01, String(kwh.f1));
              ok("venti in F2", Math.abs(kwh.f2 - 20) < 0.01, String(kwh.f2));
              ok("settanta in F3", Math.abs(kwh.f3 - 70) < 0.01, String(kwh.f3));
              // 10*0.30 + 20*0.27 + 70*0.24 = 3 + 5.4 + 16.8 = 25.2
              ok("il costo e' la somma delle tre fasce, non il prezzo unico",
                 Math.abs(fb.cost - 25.2) < 0.01, String(fb.cost));
              ok("e il prezzo medio effettivo viene mostrato",
                 Math.abs(fb.pIn - 0.252) < 0.0001, String(fb.pIn));
              ok("che non e' il prezzo monorario", Math.abs(fb.pIn - 0.25) > 0.001);
              ok("i due kWh delle 8 stanno in F1, non nella fascia dell'ora prima",
                 Math.abs(kwh.f1 - 10) < 0.01 && Math.abs(kwh.f2 - 20) < 0.01,
                 kwh.f1 + "/" + kwh.f2);
              ok("e il conto torna senza aver letto nemmeno un `sum`",
                 Math.abs(kwh.f1 + kwh.f2 + kwh.f3 - 100) < 0.01,
                 String(kwh.f1 + kwh.f2 + kwh.f3));

              // un contatore che si azzera non deve diventare consumo negativo
              el._bands = {}; el._hass.callWS = (m) => {
                if (m.type !== "recorder/statistics_during_period") return Promise.resolve({});
                const mk = (y, mo, d, h) => new Date(y, mo - 1, d, h).getTime();
                return Promise.resolve({ "sensor.rete_energia": [
                  { start: mk(2026, 8, 24, 10), sum: 50 },
                  { start: mk(2026, 8, 24, 11), sum: 0 },   // reset del contatore
                  { start: mk(2026, 8, 24, 12), sum: 5 },
                ] });
              };
              el._economyFigures(card, data, W);
              setTimeout(() => {
                const fr = el._economyFigures(card, data, W);
                ok("un contatore azzerato non produce consumo negativo",
                   fr.byBand && fr.byBand.every((b) => b.kwh >= 0),
                   JSON.stringify(fr.byBand && fr.byBand.map((b) => b.kwh)));

                // se il recorder non risponde si torna al prezzo unico, dicendolo
                el._bands = {};
                el._hass.callWS = () => Promise.reject(new Error("niente statistiche"));
                el._economyFigures(card, data);
                setTimeout(() => {
                  const fe = el._economyFigures(card, data);
                  ok("senza statistiche orarie si ripiega sul prezzo unico",
                     fe.byBand === null && Math.abs(fe.cost - 25) < 0.001, String(fe.cost));
                  ok("e la card lo dichiara", fe.bandsError === true);

                  el._hass.callWS = savedWS; el._bands = {};
                  ok("stato ripristinato dopo la sezione 44", true);

                  console.log("\n== 45. QUALI LETTURE VEDERE NEL MONITORAGGIO ==");
                  {
                    // Il difetto: la card trovava le letture da sola in base al
                    // device_class e non c'era NESSUN modo di dire quali vedere.
                    // La lista a mano esisteva gia' nel codice, ma senza un
                    // comando che la scrivesse e senza che lo schema la salvasse.
                    for (let i = 0; i < 12; i++) {
                      states["sensor.temp_" + i] = S(String(20 + i), {
                        friendly_name: "Temp " + String.fromCharCode(65 + i),
                        device_class: "temperature", unit_of_measurement: "°C" });
                    }
                    states["sensor.volt_a"] = S("236", { friendly_name: "Tensione A",
                      device_class: "voltage", unit_of_measurement: "V" });
                    states["update.qualcosa"] = S("42", { friendly_name: "Update",
                      device_class: "temperature" });

                    const mon = { id: "mon1", type: "monitor", entity_id: "", name: "Monitoraggio",
                      size: "xl", appearance: {}, states: {}, actions: {},
                      grid_entity: null, limit_w: 3300, groups: ["temperature"],
                      max_per_group: 8, limits: {}, entities: {} };
                    const gTemp = MONITOR_GROUPS_TEST.find((g) => g.key === "temperature");

                    const cands = el._monitorCandidates(gTemp);
                    const mine = Array.from({ length: 12 }, (_, i) => "sensor.temp_" + i);
                    ok("i candidati comprendono tutte le letture di quel tipo",
                       mine.every((id) => cands.includes(id)),
                       JSON.stringify(mine.filter((id) => !cands.includes(id))));
                    ok("le entita' di aggiornamento restano fuori",
                       !cands.includes("update.qualcosa"));
                    ok("e sono in ordine di nome",
                       cands.indexOf("sensor.temp_0") < cands.indexOf("sensor.temp_1"));

                    // automatico: il tetto per gruppo taglia
                    let rows = el._monitorRows(gTemp, mon);
                    ok("in automatico il tetto per gruppo taglia l'elenco",
                       rows.length === 8, String(rows.length));

                    // scelte a mano: il tetto non deve nascondere niente
                    mon.entities = { temperature: cands.slice(0, 11) };
                    rows = el._monitorRows(gTemp, mon);
                    ok("scegliendole a mano il tetto non nasconde piu' niente",
                       rows.length === 11, String(rows.length));
                    ok("e sono proprio quelle scelte",
                       rows.every((r) => mon.entities.temperature.includes(r.id)));

                    mon.entities = { temperature: ["sensor.temp_3", "sensor.temp_7"] };
                    rows = el._monitorRows(gTemp, mon);
                    ok("due scelte danno due righe",
                       rows.length === 2 && rows.map((r) => r.id).sort().join() === "sensor.temp_3,sensor.temp_7",
                       JSON.stringify(rows.map((r) => r.id)));

                    // un gruppo scelto non tocca gli altri
                    const gVolt = MONITOR_GROUPS_TEST.find((g) => g.key === "voltage");
                    ok("l'altro gruppo resta automatico",
                       el._monitorRows(gVolt, mon).some((r2) => r2.id === "sensor.volt_a"),
                       JSON.stringify(el._monitorRows(gVolt, mon).map((r2) => r2.id)));

                    // lista vuota = automatico, non "niente"
                    mon.entities = { temperature: [] };
                    ok("una lista vuota vale automatico, non zero righe",
                       el._monitorRows(gTemp, mon).length === 8,
                       String(el._monitorRows(gTemp, mon).length));

                    // --- l'editor
                    const savedSel = el._selected, savedEditing = el._editing, savedDash = el._dashboard;
                    el._dashboard = { hierarchy: {}, pages: [{ id: "p", sections: [{ id: "s", items: [mon] }] }] };
                    mon.entities = {};
                    const edHtml = () => el._cardEditorBody
                      ? el._cardEditorBody(mon) : el._renderCardEditor(mon);
                    const html = edHtml();
                    ok("l'editor elenca ogni lettura del gruppo con il suo occhio",
                       (html.match(/data-mon-pick="temperature\|/g) || []).length === cands.length,
                       String((html.match(/data-mon-pick="temperature\|/g) || []).length));
                    ok("e dice che il gruppo e' in automatico",
                       /automatico<\/em>/.test(html), "manca la dicitura");
                    ok("in automatico non offre il pulsante per tornare automatico",
                       !/data-mon-auto="temperature"/.test(html));

                    // il primo tocco converte il gruppo in "scelto da me"
                    mon.entities = { temperature: cands.filter((x) => x !== "sensor.temp_5") };
                    const html2 = edHtml();
                    ok("spegnendone una il gruppo diventa scelto da te",
                       /scelte da te<\/em>/.test(html2));
                    ok("e compare il modo di tornare automatico",
                       /data-mon-auto="temperature"/.test(html2));
                    ok("la riga spenta si vede che e' spenta",
                       /room-ent hidden[\s\S]{0,220}?sensor\.temp_5/.test(html2)
                       || /sensor\.temp_5[\s\S]{0,80}?eye-off/.test(html2),
                       "riga non marcata");
                    ok("il conteggio dice quante su quante",
                       html2.includes((cands.length - 1) + " su " + cands.length),
                       (html2.match(/\d+ su \d+/) || [])[0]);

                    // un'entita' scelta che sparisce da HA resta togliibile
                    mon.entities = { temperature: ["sensor.temp_1", "sensor.sparita"] };
                    const html3 = edHtml();
                    ok("un'entita' sparita da Home Assistant resta nell'elenco",
                       /data-mon-pick="temperature\|sensor\.sparita"/.test(html3));
                    ok("ed e' marcata come assente", /assente/.test(html3));

                    ok("editor monitoraggio: nessun undefined",
                       !/>undefined</.test(html3) && !html3.includes("[object"));

                    el._selected = savedSel; el._editing = savedEditing; el._dashboard = savedDash;
                    for (let i = 0; i < 12; i++) delete states["sensor.temp_" + i];
                    delete states["sensor.volt_a"]; delete states["update.qualcosa"];
                    ok("stato ripristinato dopo la sezione 45", !states["sensor.temp_0"]);
                  }

                  console.log("\n== 46. CHIOSCO PER I TABLET A MURO ==");
                  {
                    const savedDash = el._dashboard, savedUser = el._hass.user;
                    const savedIdx = el._pageIndex, savedEditing = el._editing;
                    el._dashboard = {
                      theme: { accent: "#00e5ff" },
                      kiosk: { dim_after: 0, home_after: 0, hide_header: false },
                      hierarchy: {},
                      pages: [
                        { id: "casa", title: "Casa", icon: "mdi:home", type: "sections", kiosk: true,
                          sections: [
                            { id: "s1", title: "Luci", kiosk: true, items: [] },
                            { id: "s2", title: "Diagnostica", kiosk: false, items: [] }] },
                        { id: "tec", title: "Tecnica", icon: "mdi:cog", type: "sections", kiosk: false,
                          sections: [{ id: "s3", title: "Rete", kiosk: true, items: [] }] },
                      ] };
                    el._pageIndex = 0; el._editing = false; el._kioskPreview = false;

                    // --- chi e' in chiosco e chi no
                    delete el._hass.user;
                    ok("senza un utente dichiarato NON si va in chiosco",
                       el._isKiosk() === false);
                    el._hass.user = { name: "Oscar", is_admin: true };
                    ok("un amministratore non e' in chiosco", el._isKiosk() === false);
                    el._hass.user = { name: "Home User", is_admin: false };
                    ok("un utente non amministratore lo e'", el._isKiosk() === true);

                    // --- cosa vede
                    ok("vede solo le pagine abilitate",
                       el._visiblePages().map((p) => p.id).join() === "casa",
                       JSON.stringify(el._visiblePages().map((p) => p.id)));
                    ok("e solo le sezioni abilitate",
                       el._sections().map((x) => x.id).join() === "s1",
                       JSON.stringify(el._sections().map((x) => x.id)));
                    ok("la pagina corrente e' una di quelle abilitate",
                       el._page() && el._page().id === "casa");

                    el._hass.user = { name: "Oscar", is_admin: true };
                    ok("l'amministratore le vede tutte",
                       el._visiblePages().length === 2 && el._sections().length === 2,
                       el._visiblePages().length + "/" + el._sections().length);

                    // --- l'anteprima mostra esattamente quello che vede il tablet
                    el._kioskPreview = true;
                    ok("in anteprima l'amministratore vede quello che vede il tablet",
                       el._isKiosk() === true && el._visiblePages().length === 1
                       && el._sections().length === 1);
                    el._kioskPreview = false;
                    ok("uscendo dall'anteprima torna tutto", el._visiblePages().length === 2);

                    // --- il caso limite: nessuna pagina abilitata
                    el._hass.user = { name: "Home User", is_admin: false };
                    el._dashboard.pages.forEach((p) => { p.kiosk = false; });
                    ok("con nessuna pagina abilitata non resta una pagina fantasma",
                       el._visiblePages().length === 0 && el._page() === null);
                    el.render();
                    ok("e lo schermo lo dice invece di restare vuoto",
                       /Nessuna pagina abilitata al chiosco/.test(el.innerHTML),
                       el.innerHTML.slice(0, 90));
                    ok("senza offrire nessun comando di modifica",
                       !/data-toggle-edit/.test(el.innerHTML));
                    el._dashboard.pages[0].kiosk = true;

                    // --- niente editor per un non amministratore
                    el._editing = true;
                    el.render();
                    const kioskHtml = el.innerHTML;
                    ok("in chiosco non c'e' il pulsante MODIFICA",
                       !/data-toggle-edit/.test(kioskHtml));
                    ok("ne' il salvataggio", !/data-save/.test(kioskHtml));
                    ok("ne' il pannello di modifica", !/class="editor"/.test(kioskHtml));
                    ok("ma si dichiara come chiosco", /status kiosk/.test(kioskHtml));

                    el._hass.user = { name: "Oscar", is_admin: true };
                    el.render();
                    ok("per l'amministratore l'editor c'e'",
                       /data-toggle-edit/.test(el.innerHTML) && /class="editor"/.test(el.innerHTML));

                    // --- il velo dello spegnimento
                    el._hass.user = { name: "Home User", is_admin: false };
                    el._editing = false;
                    el.render();
                    ok("senza spegnimento richiesto non c'e' nessun velo",
                       !/data-kiosk-dim/.test(el.innerHTML));
                    el._dashboard.kiosk.dim_after = 5;
                    el.render();
                    ok("chiedendolo, il velo compare", /data-kiosk-dim/.test(el.innerHTML));
                    el._hass.user = { name: "Oscar", is_admin: true };
                    el.render();
                    ok("ma non per l'amministratore", !/data-kiosk-dim/.test(el.innerHTML));

                    // --- i comandi restano: e' il punto di tutta la scelta A
                    el._hass.user = { name: "Home User", is_admin: false };
                    states["light.sala"] = S("off", { friendly_name: "Luce sala",
                      supported_color_modes: ["brightness"] });
                    el._dashboard.pages[0].sections[0].items = [{ id: "c1", type: "entity",
                      entity_id: "light.sala", name: "", size: "sm", appearance: {},
                      states: {}, actions: {}, row_action: "toggle" }];
                    el.render();
                    ok("da un tablet la card della luce c'e' ancora",
                       /Luce sala/.test(el.innerHTML)
                       && /data-card-id="c1"/.test(el.innerHTML),
                       "la card non c'e'");
                    ok("ed e' toccabile, non solo mostrata",
                       /data-card-id="c1"[^>]*data-tap/.test(el.innerHTML),
                       (el.innerHTML.match(/<article data-card-id="c1"[^>]*/) || [])[0]);

                    delete states["light.sala"];
                    el._dashboard = savedDash; el._hass.user = savedUser;
                    el._pageIndex = savedIdx; el._editing = savedEditing;
                    el._kioskPreview = false;
                    if (savedUser === undefined) delete el._hass.user;
                    ok("stato ripristinato dopo la sezione 46", !states["light.sala"]);
                  }

                  console.log("\n== 47. L'ANALISI ECONOMICA NEL TEMPO ==");
                  {
                    const savedWS2 = el._hass.callWS;
                    const savedDash2 = el._dashboard;

                    // --- finestre di calendario, non di trenta giorni
                    const now = new Date();
                    const wm = economyWindow("month", 0);
                    ok("il mese comincia il primo, a mezzanotte locale",
                       wm.start.getDate() === 1 && wm.start.getHours() === 0
                       && wm.start.getMonth() === now.getMonth(),
                       wm.start.toString());
                    ok("e finisce il primo del mese dopo",
                       wm.end.getDate() === 1
                       && (wm.end.getMonth() === (now.getMonth() + 1) % 12));
                    ok("il mese in corso e' dichiarato in corso", wm.running === true);
                    ok("e si ferma adesso, non nel futuro", wm.stop <= new Date(Date.now() + 1000));
                    const wm1 = economyWindow("month", 1);
                    ok("un passo indietro e' il mese prima",
                       wm1.end.getTime() === wm.start.getTime(), wm1.title + " -> " + wm.title);
                    ok("un mese chiuso non e' in corso", wm1.running === false);
                    ok("il titolo e' il nome del mese in italiano, non una data",
                       /^[A-Z][a-zàèéìòù]+ \d{4}$/.test(wm1.title), wm1.title);
                    const wm13 = economyWindow("month", 12);
                    ok("dodici passi indietro sono lo stesso mese dell'anno prima",
                       wm13.start.getMonth() === wm.start.getMonth()
                       && wm13.start.getFullYear() === wm.start.getFullYear() - 1,
                       wm13.title);
                    ok("scavalcare gennaio non rompe l'anno",
                       economyWindow("month", now.getMonth() + 1).start.getFullYear()
                       === now.getFullYear() - 1);

                    const ww = economyWindow("week", 0);
                    ok("la settimana comincia di lunedi", ww.start.getDay() === 1, String(ww.start.getDay()));
                    ok("e dura sette giorni",
                       Math.round((ww.end - ww.start) / 86400000) === 7);
                    const wd = economyWindow("today", 1);
                    ok("un giorno indietro si chiama Ieri", wd.title === "Ieri", wd.title);
                    ok("e le sue ore si contano dalla mezzanotte", wd.start.getHours() === 0);
                    const wy = economyWindow("year", 0);
                    ok("l'anno comincia il primo gennaio",
                       wy.start.getMonth() === 0 && wy.start.getDate() === 1);
                    ok("un offset negativo non manda nel futuro",
                       economyWindow("month", -5).start.getTime() === wm.start.getTime());

                    // --- quanta energia dice una riga di statistica
                    const mkr = (h, ch, sum) => ({ start: new Date(2026, 7, 3, h).getTime(),
                      change: ch, sum });
                    const ser = statSeries([mkr(0, 2, 2), mkr(1, 3, 5), mkr(2, 4, 9)]);
                    ok("con `change` si legge anche il primo intervallo",
                       ser.length === 3 && ser[0].v === 2, JSON.stringify(ser.map((r) => r.v)));
                    ok("e il totale e' la somma dei tre",
                       ser.reduce((n, r) => n + r.v, 0) === 9);
                    const serSum = statSeries([{ start: 1, sum: 2 }, { start: 2, sum: 5 }, { start: 3, sum: 9 }]);
                    ok("senza `change` si ripiega sulle differenze fra i `sum`",
                       serSum.length === 2 && serSum[0].v === 3 && serSum[1].v === 4,
                       JSON.stringify(serSum.map((r) => r.v)));
                    const serReset = statSeries([{ start: 1, sum: 50 }, { start: 2, sum: 0 }, { start: 3, sum: 5 }]);
                    ok("un contatore azzerato vale zero, non un numero negativo",
                       serReset.every((r) => r.v >= 0), JSON.stringify(serReset.map((r) => r.v)));
                    ok("una riga senza istante valido viene scartata",
                       statSeries([{ start: "non una data", change: 9 }]).length === 0);
                    ok("un istante in ISO viene capito come uno epoch",
                       statSeries([{ start: "2026-08-03T00:00:00+00:00", change: 1 }]).length === 1);

                    // --- una sola interrogazione per due periodi
                    const card47 = { id: "eco47", type: "economy", entity_id: "", name: "Eco",
                      size: "xl", appearance: {}, states: {}, actions: {}, devices: [],
                      grid_import: "sensor.i47", grid_export: null, solar: "sensor.s47",
                      battery_in: null, battery_out: null,
                      price_import: 0.25, price_export: 0.10, period: "month",
                      tariff_mode: "single", bands: {}, fixed: [], vat: 0 };
                    el._dashboard = { theme: {}, hierarchy: {}, kiosk: {}, pages: [{ id: "p", title: "P",
                      icon: "mdi:home", type: "sections", sections: [{ id: "s47", title: "S",
                      items: [card47] }] }] };
                    el._pageIndex = 0;
                    el._economy = {}; el._economyPending = null; el._ecoOffset = {};
                    let asked = null;
                    const wcur = economyWindow("month", 0), wprev = economyWindow("month", 1);
                    el._hass.callWS = (m) => {
                      if (m.type !== "recorder/statistics_during_period") return Promise.resolve({});
                      asked = m;
                      const mid = (w, day) => new Date(w.start.getFullYear(), w.start.getMonth(), day).getTime();
                      return Promise.resolve({
                        "sensor.i47": [
                          { start: mid(wprev, 2), change: 40 },
                          { start: mid(wcur, 1), change: 10 },
                          { start: mid(wcur, 2), change: 15 },
                        ],
                        "sensor.s47": [
                          { start: mid(wprev, 2), change: 5 },
                          { start: mid(wcur, 1), change: 20 },
                        ] });
                    };
                    ok("finche' non risponde non inventa numeri", el._loadEconomy(card47) === null);
                    setTimeout(() => {
                      ok("una sola chiamata copre il periodo e quello prima",
                         asked && new Date(asked.start_time).getTime() === wprev.start.getTime(),
                         asked && asked.start_time);
                      ok("e chiede il campo change",
                         asked && asked.types.includes("change"), asked && JSON.stringify(asked.types));
                      ok("il bucket del mese e' il giorno", asked && asked.period === "day", asked && asked.period);
                      const d47 = el._loadEconomy(card47);
                      ok("il prelievo del periodo somma solo le sue righe",
                         d47 && Math.abs(d47.imported - 25) < 1e-9, d47 && String(d47.imported));
                      ok("quello del periodo prima resta separato",
                         Math.abs(d47.prev.imported - 40) < 1e-9, String(d47.prev.imported));
                      ok("e il confronto sa come si chiama il periodo prima",
                         d47.prev.title === wprev.title, d47.prev.title);
                      ok("la serie per bucket e' pronta per il grafico",
                         Array.isArray(d47.series["sensor.i47"]) && d47.series["sensor.i47"].length === 2,
                         JSON.stringify(d47.series["sensor.i47"]));

                      const f47 = el._economyFigures(card47, d47, wcur);
                      ok("il confronto col periodo precedente compare",
                         !!f47.cmp && Math.abs(f47.cmp.imported - (-37.5)) < 0.01,
                         f47.cmp && String(f47.cmp.imported));
                      const f47v = el._economyFigures(card47,
                        Object.assign({}, d47, { prev: { any: false } }), wcur);
                      ok("contro un periodo vuoto non si dichiara nessuna variazione",
                         f47v.cmp === null);

                      // --- il grafico
                      const svg = el._economyChart(card47, d47, wcur);
                      const buckets = el._ecoBuckets(wcur);
                      ok("c'e' una colonna per ogni giorno del periodo",
                         (svg.match(/data-eco-bar=/g) || []).length === buckets.length,
                         (svg.match(/data-eco-bar=/g) || []).length + " vs " + buckets.length);
                      ok("i giorni sono quelli veri del mese, non trenta fissi",
                         buckets.length === Math.round((wcur.stop - wcur.start) / 86400000)
                         || buckets.length === Math.ceil((wcur.stop - wcur.start) / 86400000),
                         String(buckets.length));
                      ok("le barre del prelievo ci sono", /class="ecb-grid"/.test(svg));
                      ok("e quelle della produzione", /class="ecb-prod"/.test(svg));
                      ok("la legenda spiega i colori",
                         /Dalla rete/.test(svg) && /Dal sole, in casa/.test(svg));
                      ok("il grafico non ha undefined", !/undefined/.test(svg));
                      ok("i div del grafico sono bilanciati",
                         (svg.match(/<div/g) || []).length === (svg.match(/<\/div>/g) || []).length);
                      const vuoto = el._economyChart(card47, { series: {} }, wcur);
                      ok("senza dati lo dice invece di disegnare il nulla",
                         /Nessuna statistica/.test(vuoto) && !/data-eco-bar/.test(vuoto));

                      // --- scendere di livello toccando una colonna
                      const wyy = economyWindow("year", 0);
                      const g = el._ecoDrill(wyy, new Date(wyy.start.getFullYear(), 2, 1));
                      ok("dall'anno si scende sul mese",
                         g && g.period === "month"
                         && g.offset === (new Date().getMonth() - 2), JSON.stringify(g));
                      const wmm = economyWindow("month", 1);
                      const g2 = el._ecoDrill(wmm, new Date(wmm.start.getFullYear(), wmm.start.getMonth(), 3));
                      ok("dal mese si scende sul giorno",
                         g2 && g2.period === "today" && g2.offset > 0, JSON.stringify(g2));
                      ok("dal giorno non si scende oltre",
                         el._ecoDrill(economyWindow("today", 0), new Date()) === null);
                      ok("una colonna nel futuro non e' navigabile",
                         el._ecoDrill(wyy, new Date(new Date().getFullYear() + 1, 0, 1)) === null);

                      // --- la navigazione
                      el._ecoOffset = { eco47: 2 };
                      ok("la card guarda il periodo che le e' stato chiesto",
                         el._ecoWindow(card47).offset === 2);
                      ok("e la navigazione NON finisce nel dashboard salvato",
                         card47.offset === undefined && el._dashboard.pages[0]
                           .sections[0].items[0].offset === undefined);
                      el._ecoOffset = {};

                      // --- le etichette sotto le colonne
                      ok("in un anno le colonne portano il mese",
                         el._ecoBucketLabel(wyy, new Date(2026, 0, 1)) === "GEN");
                      ok("in un mese portano il giorno",
                         el._ecoBucketLabel(wcur, new Date(2026, 7, 9)) === "9");
                      ok("in un giorno portano l'ora con due cifre",
                         el._ecoBucketLabel(economyWindow("today", 0), new Date(2026, 7, 9, 5)) === "05");

                      el._hass.callWS = savedWS2;
                      el._dashboard = savedDash2;
                      el._economy = {}; el._economyPending = null; el._ecoOffset = {};
                      ok("stato ripristinato dopo la sezione 47", el._hass.callWS === savedWS2);
                      console.log("\n" + "=".repeat(46));
                      console.log(pass + " passati, " + fail + " falliti");
                      process.exit(fail ? 1 : 0);
                    }, 0);
                  }
                }, 30);
              }, 30);
            }, 30);
          }
        }, 30);
      }, 30);
    }
  })();
}

