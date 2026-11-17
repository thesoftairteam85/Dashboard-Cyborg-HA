// 0.74: stanze trovate per nome, termostato con entita' sparite, pianta di
// fondo, schermi avvisati dopo una rinomina. Stesso caricamento di
// frontend.test.js: il sorgente vero, eseguito con il minimo indispensabile.
const fs = require("fs");
const path = "custom_components/cyborg_dashboard/www/cyborg-dashboard.js";
const src = fs.readFileSync(path, "utf8");

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

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  -> " + extra : "")); } }
function S(state, attrs) { return { state, attributes: attrs || {} }; }

// --- le parole di una stanza ------------------------------------------------
console.log("\n== LE PAROLE DI UNA STANZA ==");
ok("Salotto & Cucina -> due parole",
   JSON.stringify(roomNameTokens("Salotto & Cucina")) === '["salotto","cucina"]',
   JSON.stringify(roomNameTokens("Salotto & Cucina")));
ok("parole corte e numeri fuori", JSON.stringify(roomNameTokens("Bagno 2 di su")) === '["bagno"]');
ok("accenti tolti", JSON.stringify(roomNameTokens("Càmera")) === '["camera"]');

const bb = roomMatcher("Bagno brutto");
ok("Bagno brutto riconosce «T & H Bagno brutto»", matchesRoomName("T & H Bagno brutto Temperatura", bb));
// C'e' anche un Bagno bello: «bagno» da solo non basta.
ok("ma non «Presa Bagno bello»", !matchesRoomName("Presa Bagno bello", bb));
ok("e non «bagnoschiuma» (parola intera)", !matchesRoomName("Bagnoschiuma brutto", bb));
const sc = roomMatcher("Salotto & Cucina");
ok("una stanza composta basta per meta': «Presa Cucina»", matchesRoomName("Presa Elettrodomestici Cucina", sc));
ok("e «Videocamera salotto»", matchesRoomName("Videocamera salotto", sc));
ok("ma non «Videocamera» per «Camera da letto»", !matchesRoomName("Videocamera Salotto", roomMatcher("Camera da letto")));
ok("Studio & Yoga riconosce «Sensore Ambiente Studio»", matchesRoomName("Sensore Ambiente Studio", roomMatcher("Studio & Yoga")));
ok("niente parole, niente riconoscimento", !matchesRoomName("qualunque", roomMatcher("Il 2")));

// --- candidati di una stanza -------------------------------------------------
console.log("\n== CANDIDATI DI UNA STANZA ==");
const states = {
  "sensor.t_h_bagno_brutto_temperatura": S("21", { friendly_name: "T & H Bagno brutto Temperatura" }),
  "sensor.t_h_bagno_brutto_umidita": S("60", { friendly_name: "T & H Bagno brutto Umidità" }),
  "switch.presa_bagno_bello": S("on", { friendly_name: "Presa Bagno bello" }),
  "sensor.lavatrice_potenza": S("0", { friendly_name: "Lavatrice Potenza" }),
  "switch.presa_x": S("off", { friendly_name: "Presa X" }),
  "sensor.presa_x_firmware": S("1", { friendly_name: "Presa X firmware" }),
  "climate.vecchio": undefined,
};
delete states["climate.vecchio"];
const el = new Cls();
el._hass = { states, callWS: () => Promise.resolve({}), callService: () => {} };
el._registry = {
  areas: [{ area_id: "bagno_brutto", name: "Bagno brutto" }, { area_id: "bagno_bello", name: "Bagno Bello" }],
  byArea: { bagno_bello: ["switch.presa_bagno_bello"], bagno_brutto: ["sensor.lavatrice_potenza"] },
  entityArea: {}, category: { "sensor.presa_x_firmware": "diagnostic" },
  entityDevice: { "sensor.t_h_bagno_brutto_temperatura": "d1", "sensor.t_h_bagno_brutto_umidita": "d1",
                  "switch.presa_x": "d2", "sensor.presa_x_firmware": "d2" },
  deviceEntities: { d1: ["sensor.t_h_bagno_brutto_temperatura", "sensor.t_h_bagno_brutto_umidita"] },
  deviceName: { d1: "T & H Bagno brutto", d2: "Presa X" }, orphans: [],
};
const card = { id: "r", type: "room", area: "bagno_brutto", states: {} };
const sugg = el._roomCardCandidates(card, "");
ok("un suggerimento per apparecchio, non per entita'", sugg.length === 1 && sugg[0].ids.length === 2,
   JSON.stringify(sugg.map((g) => [g.label, g.ids.length])));
ok("e' il sensore T&H, senza stanza", sugg[0].label === "T & H Bagno brutto" && sugg[0].area === "");
ok("chi e' gia' nella stanza non si ripropone",
   !el._roomCardCandidates(card, "lavatrice").length);
const found = el._roomCardCandidates(card, "presa");
ok("la ricerca trova anche cio' che sta in un'altra stanza, e lo dice",
   found.some((g) => g.label === "Presa Bagno bello" && g.area === "Bagno Bello"),
   JSON.stringify(found));
ok("la diagnostica non si propone", !found.some((g) => g.ids.includes("sensor.presa_x_firmware")));
const rows = el._roomCandidateRows(card, sugg);
ok("la riga ha il pulsante che assegna l'area in HA", /data-orphan-assign="sensor\.t_h_bagno_brutto/.test(rows));
el._dashboard = { hierarchy: {}, pages: [{ id: "p", sections: [{ id: "s", title: "S", items: [card] }] }] };
el._selected = { pageId: "p", sectionId: "s", cardId: "r" };
const ed = el._renderCardEditor(card);
ok("l'editor della stanza mostra i suggeriti e la ricerca",
   /SUGGERITI DAL NOME · 1/.test(ed) && /data-room-find/.test(ed));
ok("nessun suggerimento senza area", el._roomCardCandidates({ type: "room", area: "" }, "").length === 0);

// --- termostato con entita' sparite -----------------------------------------
console.log("\n== TERMOSTATO CON ENTITA' SPARITE ==");
const th = { id: "th", type: "thermostat", states: {}, units: ["climate.vecchio"],
             manual: ["input_boolean.sparito", "switch.presa_x"] };
el._dashboard.pages[0].sections[0].items.push(th);
el._selected = { pageId: "p", sectionId: "s", cardId: "th" };
let html = "";
let threw = null;
try { html = el._renderCardEditor(th); } catch (e) { threw = e; }
// Prima della 0.74 qui si leggeva .attributes di un'entita' che non c'e':
// l'editor intero non si apriva.
ok("l'editor si apre anche se un'unita' scelta non esiste piu'", !threw, threw && threw.message);
ok("l'unita' sparita si vede, con scritto perche'",
   /climate\.vecchio · non esiste più/.test(html));
ok("anche l'interruttore sparito si vede",
   /input_boolean\.sparito · non esiste più/.test(html));
ok("le X portano l'id, non la posizione",
   /data-thermo-man-drop="input_boolean\.sparito"/.test(html)
   && /data-thermo-man-drop="switch\.presa_x"/.test(html)
   && /data-thermo-drop="climate\.vecchio"/.test(html));

// --- pianta di fondo ----------------------------------------------------------
console.log("\n== PIANTA DI FONDO ==");
states["image.negro_mappa"] = S("2026-11-18T00:00:00", { friendly_name: "Negro Mappa",
  entity_picture: "/api/image_proxy/image.negro_mappa?token=abc" });
ok("nessuna pianta, nessun markup", el._underlayMarkup({ underlay: null }) === "");
const und = el._underlayMarkup({ underlay: { entity: "image.negro_mappa", opacity: 0.4, x: 10, y: -5, width: 800, rotate: 90 } });
ok("immagine dal suo entity_picture", /src="\/api\/image_proxy\/image\.negro_mappa\?token=abc"/.test(und), und);
ok("posizione, misura, opacita' e rotazione", /left:10px;top:-5px;width:800px;opacity:0\.4/.test(und)
   && /rotate\(90deg\)/.test(und));
ok("sotto il terreno del piano terra", /translateZ\(-2px\)/.test(und));
ok("un'entita' sparita non disegna niente", el._underlayMarkup({ underlay: { entity: "image.altro" } }) === "");

// --- avviso dal server dopo una rinomina ---------------------------------------
console.log("\n== AVVISO DAL SERVER ==");
(async () => {
  const calls = [];
  const el2 = new Cls();
  el2.render = () => {};
  el2._hass = { states, callWS: (m) => { calls.push(m.type); return Promise.resolve({ dashboard: { revision: 9, pages: [] } }); } };
  el2._dashboard = { revision: 8, pages: [] };
  el2._registry = { areas: [] };
  el2._dirty = false;
  await el2._onServerRevision(8);
  ok("una revisione non piu' nuova si ignora", calls.length === 0 && el2._registry !== null);
  await el2._onServerRevision(9);
  ok("una revisione nuova si rilegge", calls.length === 1 && el2._dashboard.revision === 9, JSON.stringify(calls));
  ok("e la cache del registro si butta", el2._registry === null);
  el2._dashboard = { revision: 9, pages: [], mio: true };
  el2._dirty = true;
  await el2._onServerRevision(10);
  // Con modifiche in sospeso non si rilegge: ci pensera' il conflitto al
  // salvataggio, che prende la versione del server e non perde il lavoro.
  ok("con modifiche in sospeso non si sovrascrive niente", calls.length === 1 && el2._dashboard.mio === true);

  console.log("\n" + "=".repeat(46));
  console.log(pass + " passati, " + fail + " falliti");
  process.exit(fail ? 1 : 0);
})();
