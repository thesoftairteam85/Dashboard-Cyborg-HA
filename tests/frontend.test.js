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

const allEntities = secs.flatMap(s => s.items.map(i => i.entity_id));
ok("nessun duplicato tra sezioni", new Set(allEntities).size === allEntities.length);
ok("esclude unavailable/unknown",
  !allEntities.some(e => ["unavailable","unknown"].includes(states[e].state)),
  allEntities.filter(e => ["unavailable","unknown"].includes(states[e].state)).join(","));

const byTitle = Object.fromEntries(secs.map(s => [s.title, s]));
ok("allarme -> Sicurezza", byTitle.Sicurezza && byTitle.Sicurezza.items.some(i => i.entity_id === "alarm_control_panel.allarme"));
ok("potenza -> Energia", byTitle.Energia && byTitle.Energia.items.every(i => states[i.entity_id].attributes.device_class.match(/power|energy|current|voltage/)));
ok("climate -> Clima", byTitle.Clima && byTitle.Clima.items.some(i => i.entity_id === "climate.thermostat"));
ok("switch 'Luci scale' -> Illuminazione", byTitle.Illuminazione && byTitle.Illuminazione.items.some(i => i.entity_id === "switch.luci_scale"));
ok("person -> Presenza", byTitle.Presenza && byTitle.Presenza.items.some(i => i.entity_id === "person.oscar"));
ok("cpu temp -> Sistema (non Clima)", byTitle.Sistema && byTitle.Sistema.items.some(i => i.entity_id === "sensor.system_monitor_processor_temperature"));
ok("climate card = tipo climate", byTitle.Clima.items.find(i=>i.entity_id==="climate.thermostat").type === "climate");
ok("power card = tipo sensor", byTitle.Energia.items[0].type === "sensor");
ok("luce card = tipo control", byTitle.Illuminazione.items[0].type === "control");
ok("ogni card ha id univoco", new Set(secs.flatMap(s=>s.items.map(i=>i.id))).size === allEntities.length);
ok("ogni card ha icona", secs.every(s => s.items.every(i => i.appearance.icon && i.appearance.icon.startsWith("mdi:"))));

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

console.log("\n" + "=".repeat(46));
console.log(pass + " passati, " + fail + " falliti");
process.exit(fail ? 1 : 0);
