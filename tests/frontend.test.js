// Harness: load the panel class with minimal shims, then exercise the real logic.
const fs = require("fs");
const path = "custom_components/cyborg_dashboard/www/cyborg-dashboard.js";
let src = fs.readFileSync(path, "utf8");

const registry = {};
global.customElements = { get: (n) => registry[n], define: (n, c) => { registry[n] = c; } };
global.HTMLElement = class { constructor(){ this._html=""; }
  set innerHTML(v){ this._html = v; } get innerHTML(){ return this._html; }
  querySelector(){ return null; } querySelectorAll(){ return []; }
  dispatchEvent(){ return true; } closest(){ return null; } };
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
  const rs = [...fhtml.matchAll(/--r:(\d+)px/g)].map(m => +m[1]);
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
ok("editor flusso: 4 slot", (el.innerHTML.match(/class="flow-slot-head"/g) || []).length === 4,
   String((el.innerHTML.match(/class="flow-slot-head"/g) || []).length));
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
  const r = (b) => +(/--r:(\d+)px/.exec(b) || [])[1];
  return lav && nas && r(lav) > r(nas);
})());
ok("aperto: elenco piatto nascosto (niente doppioni)", !treeOpened.includes("ef-dev-bar"));
ok("aperto: viewBox esteso", /viewBox="0 0 600 566"/.test(treeOpened), (treeOpened.match(/viewBox="[^"]+"/) || [])[0]);
ok("aperto: proporzioni bloccate sullo stage", treeOpened.includes("aspect-ratio:600/566"));
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
  const r = (x) => +(/--r:(\d+)px/.exec(x) || [])[1];
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

console.log("\n" + "=".repeat(46));
console.log(pass + " passati, " + fail + " falliti");
process.exit(fail ? 1 : 0);
