// 0.77: card «Consumi per dispositivo». Stesso caricamento di frontend.test.js:
// il sorgente vero, eseguito con il minimo indispensabile. I numeri della
// notte del 24/11/2026 sono quelli VERI letti dal recorder di casa Oscar
// (statistiche a 5 minuti, 01:30-04:30): e' la domanda che ha fatto nascere
// la card, quindi e' la prova che deve passare.
process.env.TZ = "Europe/Rome";
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
const H = 3600000, M = 60000;

// --- la notte del 24/11 --------------------------------------------------------
// 36 bucket da 5 minuti a partire dalle 00:30Z (01:30 in Italia).
const T0 = Date.parse("2026-11-24T00:30:00Z");
const TOT = [[128.8,526.2],[187.1,719.9],[475.6,781.3],[688.0,719.8],[726.9,781.3],[757.6,772.1],[787.9,806.2],[784.3,847.4],[759.6,786.5],[796.4,936.2],[817.2,835.2],[838.8,846.5],[844.6,1180.1],[838.2,855.4],[851.0,882.5],[863.8,870.6],[588.5,879.6],[652.3,860.2],[844.3,855.7],[912.8,2260.0],[940.3,950.9],[936.6,948.1],[932.4,1264.4],[918.3,931.1],[911.5,934.0],[875.6,923.4],[824.0,840.4],[820.1,942.2],[823.6,830.5],[663.9,852.0],[148.7,326.8],[150.2,629.4],[120.9,310.1],[121.1,288.3],[127.1,659.1],[127.6,286.4]];
const ASC = [[5.8,189.2],[9.4,259.2],[265.6,444.6],[476.8,504.7],[519.3,556.4],[551.8,569.7],[582.5,604.3],[615.1,636.4],[638.5,661.5],[673.1,714.7],[697.0,718.0],[717.7,721.7],[722.1,747.4],[718.7,723.4],[728.4,762.4],[744.5,748.5],[481.6,749.5],[521.9,729.1],[729.5,741.6],[733.6,769.9],[736.9,745.3],[734.7,736.7],[731.3,762.3],[719.6,723.9],[714.0,740.1],[711.9,717.9],[710.5,718.4],[710.1,730.0],[708.6,709.8],[556.4,747.5],[41.6,274.4],[28.5,276.1],[8.7,279.3],[9.3,274.1],[7.1,232.9],[14.8,313.5]];
const rows = (arr) => arr.map(([mean, max], i) => ({ start: T0 + i * 5 * M, end: T0 + (i + 1) * 5 * M, mean, max }));
const flat = (v) => TOT.map((_, i) => ({ start: T0 + i * 5 * M, end: T0 + (i + 1) * 5 * M, mean: v, max: v }));
const STATS = {
  "sensor.contatore_generale_potenza": rows(TOT),
  "sensor.presa_asciugatrice_potenza": rows(ASC),
  "sensor.presa_bagno_brutto_potenza": flat(24.6),
  "sensor.presa_shelly_phon_capelli_potenza": flat(0.1),
  "sensor.lavastoviglie_potenza": flat(0),
};

// === RISOLUZIONE =================================================================
console.log("\n== RISOLUZIONE ==");
const now = Date.parse("2026-11-24T22:00:00Z");
ok("fino a 3 ore: storico grezzo (lo spunto di pochi secondi)", consResolution(3 * H, now - 3 * H, now) === "raw");
ok("24 ore recenti: medie di 5 minuti", consResolution(24 * H, now - 24 * H, now) === "5minute");
ok("24 ore di 20 giorni fa: orarie (le 5 minuti non esistono piu')",
   consResolution(24 * H, now - 20 * 24 * H, now) === "hour");
ok("rispetta keep_days dichiarato", consResolution(24 * H, now - 20 * 24 * H, now, 30) === "5minute");
ok("7 giorni: orarie", consResolution(168 * H, now - 168 * H, now) === "hour");
ok("90 giorni: giornaliere", consResolution(90 * 24 * H, now - 90 * 24 * H, now) === "day");

// === STATISTICHE E STORICO ======================================================
console.log("\n== BUCKET ==");
const sb = consBucketsFromStats([{ start: T0 + 2 * M, end: T0 + 3 * M, mean: 5, max: 9 }, { start: T0 + M, end: T0 + 2 * M, mean: null }, { start: new Date(T0).toISOString(), end: T0 + M, mean: 1 }]);
ok("una riga senza media e' un buco, non uno zero", sb.length === 2, JSON.stringify(sb));
ok("ordinate nel tempo, start ISO accettato", sb[0].t0 === T0 && sb[1].t0 === T0 + 2 * M, JSON.stringify(sb));
ok("secondi (core vecchi) riconosciuti", consBucketsFromStats([{ start: T0 / 1000, end: T0 / 1000 + 300, mean: 1 }])[0].t0 === T0);
ok("max assente = media", consBucketsFromStats([{ start: 0, end: 1, mean: 4 }])[0].max === 4);

// gradino: 100 W per 9 minuti, 2000 W per 1 minuto -> media 290 W su 10 minuti
const hb = consBucketsFromHistory([[-5 * M, 100], [9 * M, 2000]], 0, 10 * M, 1, 10 * M);
ok("media PESATA SUL TEMPO, non sui campioni", Math.abs(hb[0].mean - 290) < 1e-6, hb[0].mean);
ok("il massimo vede lo spunto", hb[0].max === 2000);
const many = [[0, 100]];
for (let k = 0; k < 50; k++) many.push([9 * M + k * 1000, 3000]);
many.push([9 * M + 50000, 100]);
const hb2 = consBucketsFromHistory(many, 0, 10 * M, 1, 10 * M);
ok("cinquanta letture durante uno spunto non pesano cinquanta volte",
   hb2[0].mean < 400 && hb2[0].mean > 300, hb2[0].mean);
const hb3 = consBucketsFromHistory([[0, 500]], 0, 10 * M, 10, 4 * M);
ok("oltre adesso non si inventa niente", hb3.length === 4, hb3.length);

// === LA PILA ======================================================================
console.log("\n== PILA ==");
const st1 = consStack([{ t0: 0, t1: 1, mean: 1000, max: 1200 }],
  [[{ t0: 0, mean: 600, max: 600 }], [{ t0: 0, mean: 150, max: 150 }], []]);
ok("resto = generale - carichi", st1[0].rest === 250, st1[0].rest);
ok("un carico senza dato e' null, non zero", st1[0].loads[2] === null);
const st2 = consStack([{ t0: 0, t1: 1, mean: 500, max: 500 }], [[{ t0: 0, mean: 800, max: 800 }]]);
ok("carichi oltre il generale: resto zero e lo si dice", st2[0].rest === 0 && st2[0].over === true);
const st3 = consStack([{ t0: 0, t1: 1, mean: 500, max: 500 }], [[{ t0: 0, mean: 530, max: 530 }]]);
ok("ma 30 W di differenza fra misuratori non e' un errore", st3[0].over === false);

// === GLI EVENTI DELLA NOTTE ========================================================
console.log("\n== LA NOTTE DEL 24/11 ==");
const night = consStack(consBucketsFromStats(STATS["sensor.contatore_generale_potenza"]),
  ["sensor.presa_asciugatrice_potenza", "sensor.presa_bagno_brutto_potenza"].map((id) => consBucketsFromStats(STATS[id])));
const ev = consEvents(night, ["Asciugatrice", "Bagno brutto"]);
const asc = ev.filter((e) => e.kind === "load" && e.name === "Asciugatrice");
ok("un ciclo solo dell'asciugatrice (le resistenze che staccano non lo spezzano)", asc.length === 1,
   JSON.stringify(ev.map((e) => [e.name, new Date(e.t0).toISOString(), new Date(e.t1).toISOString()])));
const hm = (t) => new Date(t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
ok("dalle 01:40 alle 04:00 (ora italiana; dopo restano 40 W di coda)", asc[0] && hm(asc[0].t0) === "01:40" && hm(asc[0].t1) === "04:00",
   asc[0] && hm(asc[0].t0) + "-" + hm(asc[0].t1));
ok("circa 1,5 kWh", asc[0] && asc[0].kwh > 1.4 && asc[0].kwh < 1.7, asc[0] && asc[0].kwh);
ok("la presa del bagno a 25 W fissi non e' un evento", !ev.some((e) => e.name === "Bagno brutto"));
const pk = ev.filter((e) => e.kind === "peak");
ok("il picco non misurato c'e', e uno solo", pk.length === 1, JSON.stringify(pk));
ok("alle 03:05", pk[0] && hm(pk[0].at) === "03:05", pk[0] && hm(pk[0].at));
ok("fino a ~1,5 kW che nessuna presa spiega", pk[0] && pk[0].peak > 1400 && pk[0].peak < 1600, pk[0] && pk[0].peak);
const kAsc = consKwh(night, (b) => b.loads[0]);
const kTot = consKwh(night, (b) => b.total);
ok("energia del generale nelle 3 ore ~2,0 kWh", kTot > 1.8 && kTot < 2.2, kTot);
ok("l'asciugatrice e' tre quarti della notte", kAsc / kTot > 0.7, kAsc / kTot);

// === SCALA E ASSE ================================================================
console.log("\n== SCALA ==");
ok("passo tondo per 2,26 kW: 1 kW", consNiceStep(2260) === 1000, consNiceStep(2260));
ok("passo 2,5: decimali dal passo (non «3 A, 5 A, 8 A» come Sentinella)",
   consAxisLabel(7.5, 2.5) === "7,5 W", consAxisLabel(7.5, 2.5));
ok("500 W in kW con un decimale", consAxisLabel(1500, 500) === "1,5 kW", consAxisLabel(1500, 500));
ok("passo intero in kW senza decimali", consAxisLabel(2000, 1000) === "2 kW", consAxisLabel(2000, 1000));
ok("zero e' zero", consAxisLabel(0, 1000) === "0");
ok("potenza leggibile", consWatts(2260) === "2,26 kW" && consWatts(734.2) === "734 W" && consWatts(0.6) === "0,6 W",
   [consWatts(2260), consWatts(734.2), consWatts(0.6)].join(" "));
const tk = consTimeTicks(Date.parse("2026-11-23T23:00:00Z"), Date.parse("2026-11-24T23:00:00Z"), 600);
ok("24 ore a 600 px: tacche ogni 3 o 6 ore, allineate all'ora", tk.length >= 4 && tk.length <= 9
   && tk.every((t) => new Date(t.t).getMinutes() === 0), tk.map((t) => t.label).join(","));
ok("la mezzanotte e' forte e porta il giorno", tk[0].strong && /24/.test(tk[0].label), JSON.stringify(tk[0]));
const tz = consTimeTicks(Date.parse("2026-11-24T00:40:00Z"), Date.parse("2026-11-24T03:15:00Z"), 600);
ok("zoom 01:40-04:15: mezz'ore o ore tonde", tz.length >= 3 && tz.every((t) => new Date(t.t).getMinutes() % 30 === 0),
   tz.map((t) => t.label).join(","));
const dst = consTimeTicks(Date.parse("2026-10-24T22:00:00Z"), Date.parse("2026-10-31T22:00:00Z"), 600);
ok("settimana del cambio d'ora: le tacche restano a mezzanotte", dst.every((t) => new Date(t.t).getHours() === 0),
   dst.map((t) => new Date(t.t).toString().slice(0, 21)).join(" | "));

// === LA CARD ======================================================================
console.log("\n== LA CARD ==");
const states = {
  "sensor.contatore_generale_potenza": S("112.8", { friendly_name: "Contatore generale Potenza", device_class: "power", unit_of_measurement: "W" }),
  "sensor.presa_asciugatrice_potenza": S("0", { friendly_name: "Presa Asciugatrice Potenza", device_class: "power", unit_of_measurement: "W" }),
  "sensor.presa_bagno_brutto_potenza": S("25", { friendly_name: "Presa Bagno brutto Potenza", device_class: "power", unit_of_measurement: "W" }),
  "sensor.presa_shelly_phon_capelli_potenza": S("0.6", { friendly_name: "Phon capelli Potenza", device_class: "power", unit_of_measurement: "W" }),
  "sensor.lavastoviglie_potenza": S("0", { friendly_name: "Lavastoviglie Potenza", device_class: "power", unit_of_measurement: "W" }),
  "sensor.inverter_kw": S("1.5", { friendly_name: "Inverter", unit_of_measurement: "kW" }),
  "sensor.temperatura": S("21", { device_class: "temperature", unit_of_measurement: "°C" }),
  "sensor.rete_potenza_attiva_totale": S("unavailable", { device_class: "power", unit_of_measurement: "W" }),
};
const calls = [];
const el = new Cls();
el._hass = { states, callService: () => {},
  callWS: (m) => { calls.push(m); return Promise.resolve(m.type === "recorder/statistics_during_period" ? STATS : {}); } };
el._dashboard = { pages: [{ sections: [{ items: [] }] }], hierarchy: {} };
el._registry = { category: {}, entityDevice: {}, deviceEntities: {} };
let touched = 0;
el._touch = () => { touched++; };

ok("sensori di potenza: W e kW, non temperature, non indisponibili",
   JSON.stringify(el._consPowerSensors().sort()) === JSON.stringify(["sensor.contatore_generale_potenza", "sensor.inverter_kw",
     "sensor.lavastoviglie_potenza", "sensor.presa_asciugatrice_potenza", "sensor.presa_bagno_brutto_potenza",
     "sensor.presa_shelly_phon_capelli_potenza"]), JSON.stringify(el._consPowerSensors()));
ok("il contatore generale e' il primo suggerito", el._consTotalCandidates()[0] === "sensor.contatore_generale_potenza",
   JSON.stringify(el._consTotalCandidates()));

const card = { id: "c1", type: "consumption", hours: 24, total: "", loads: [] };
el._dashboard.pages[0].sections[0].items.push(card);
let html = el._consBody(card);
ok("senza generale: lo chiede, con il suggerimento a un tocco (vincolo 7)",
   html.includes("data-cons-settotal=\"c1|sensor.contatore_generale_potenza\"") && !calls.length);

card.total = "sensor.contatore_generale_potenza";
card.loads = [{ entity: "sensor.presa_asciugatrice_potenza" }, { entity: "sensor.presa_bagno_brutto_potenza" },
  { entity: "sensor.presa_shelly_phon_capelli_potenza" }, { entity: "sensor.sparita" }];
el._consZoom = { c1: [T0, T0 + 3 * H] };
html = el._consBody(card);
ok("mentre legge lo dice", html.includes("Lettura dello storico"));
ok("3 ore di zoom = storico grezzo", calls.length === 1 && calls[0].type === "history/history_during_period", calls[0] && calls[0].type);

// 24 ore che contengono la notte: statistiche a 5 minuti in W
el._consZoom = {};
el._consEnd = { c1: T0 + 6 * H };
const realNow = Date.now;
Date.now = () => T0 + 10 * H;
calls.length = 0;
el._consBody(card);
ok("24 ore: statistiche a 5 minuti, media e massimo, convertite in W lato server",
   calls[0] && calls[0].type === "recorder/statistics_during_period" && calls[0].period === "5minute"
   && calls[0].units && calls[0].units.power === "W" && calls[0].types.join() === "mean,max", JSON.stringify(calls[0]));
ok("chiede il generale e i carichi vivi, non quelli spariti",
   calls[0] && calls[0].statistic_ids.length === 4 && !calls[0].statistic_ids.includes("sensor.sparita"));

(async () => {
  await new Promise((r) => setTimeout(r, 0));
  ok("arrivati i dati, si ridisegna", touched > 0);
  html = el._consBody(card);
  ok("il ciclo dell'asciugatrice e' un chip che porta lo zoom lì",
     /cs-chip[^>]*data-cons-zoomto="c1\|/.test(html) && html.includes("Presa Asciugatrice Potenza"));
  ok("e c'e' il picco non misurato", html.includes("Picco non misurato") && html.includes("fino a"));
  ok("legenda in kWh con la quota", /Presa Asciugatrice Potenza<\/span><b>1,5\d kWh<\/b><em>\d+%<\/em>/.test(html),
     (html.match(/Presa Asciugatrice Potenza<\/span><b>[^<]*<\/b><em>[^<]*/) || [])[0]);
  ok("«Non misurato» e' sempre in legenda", html.includes("Non misurato</span>"));
  ok("il dispositivo sparito si dichiara", html.includes("non esiste") && html.includes("più in Home Assistant"));
  ok("l'SVG e' alla larghezza vera, niente preserveAspectRatio none", /viewBox="0 0 640 250"/.test(html)
     && !/data-cons-svg[^>]*preserveAspectRatio/.test(html));
  ok("niente NaN nel disegno", !/NaN|undefined/.test(html), (html.match(/.{40}(NaN|undefined).{20}/) || [])[0]);
  const g = el._consGeom.c1;
  const b = g.stack.find((x) => hm(x.t0) === "03:05");
  const tip = el._consTipHtml(g, b);
  ok("il mirino alle 03:05 dice chi c'era", tip.includes("Presa Asciugatrice Potenza") && tip.includes("734 W")
     && tip.includes("Non misurato") && tip.includes("2,26 kW"), tip.replace(/\s+/g, " ").slice(0, 400));

  // gerarchia: il phon dentro la presa del bagno non si impila due volte
  el._dashboard.hierarchy = { "sensor.presa_shelly_phon_capelli_potenza": "sensor.presa_bagno_brutto_potenza" };
  const cfg = el._consConfig(card);
  ok("chi sta dentro un altro carico scelto non e' una radice",
     cfg.roots.length === 2 && cfg.loads.find((l) => l.entity.includes("phon")).parent === "sensor.presa_bagno_brutto_potenza");
  el._dashboard.hierarchy = { "sensor.presa_asciugatrice_potenza": "sensor.contatore_generale_potenza" };
  ok("un carico «sotto il generale» resta radice: il generale e' la cima, non un ramo",
     el._consConfig(card).roots.length === 3);
  el._dashboard.hierarchy = {};

  // ripiego: le 5 minuti non ci sono piu'
  el._cons = {}; el._consPending = {};
  el._hass.callWS = (m) => { calls.push(m); return Promise.resolve(m.period === "5minute" ? {} : STATS); };
  calls.length = 0;
  el._consBody(card);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  html = el._consBody(card);
  ok("5 minuti vuote: scende alle orarie e lo dice", calls.map((c) => c.period).join() === "5minute,hour"
     && html.includes("medie orarie"), calls.map((c) => c.period).join());

  // errore dal recorder: si dice, non si disegna il vuoto
  el._cons = {}; el._consPending = {};
  el._hass.callWS = () => Promise.reject(new Error("Unknown command"));
  el._consBody(card);
  await new Promise((r) => setTimeout(r, 0));
  html = el._consBody(card);
  ok("errore del recorder detto a parole", html.includes("Unknown command"));

  // sensore in kW nello storico grezzo
  el._cons = {}; el._consPending = {};
  const card2 = { id: "c2", type: "consumption", hours: 6, total: "sensor.inverter_kw", loads: [] };
  el._consZoom = { c2: [T0, T0 + H] };
  el._hass.callWS = () => Promise.resolve({ "sensor.inverter_kw": [{ s: "1.5", lu: (T0 - 60000) / 1000 }] });
  el._consBody(card2);
  await new Promise((r) => setTimeout(r, 0));
  const k2 = Object.keys(el._cons).find((k) => k.startsWith("c2|"));
  const d2 = el._cons[k2].data["sensor.inverter_kw"];
  ok("storico grezzo in kW convertito in W", d2.length > 0 && Math.abs(d2[0].mean - 1500) < 1e-6, d2[0] && d2[0].mean);
  html = el._consBody(card2);
  ok("senza dispositivi: tutto e' Non misurato, e propone le prese", html.includes("Aggiungi le") && html.includes("prese misurate"));

  Date.now = realNow;
  console.log("\n==============================================");
  console.log(pass + " passati, " + fail + " falliti");
  console.log("==============================================");
  process.exit(fail ? 1 : 0);
})();
