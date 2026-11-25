// 0.77: la card «Consumi per dispositivo» fotografata e MISURATA in Chromium.
// La notte del 24/11/2026 (numeri veri del recorder, 01:30-04:30) dentro una
// giornata ricostruita: base del frigo, la cena delle 17-21 senza prese, il
// ciclo dell'asciugatrice, lo spunto di 2,26 kW alle 03:05.
//   (cd tests/visual && python3 -m http.server 8899 &) && node tests/visual/consumi.js
const path = require("path");
const fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (_) { ({ chromium } = require("/opt/npm-tools/node_modules/playwright")); }

fs.writeFileSync(path.resolve(__dirname, "panel.js"),
  fs.readFileSync(path.resolve(__dirname, "../../custom_components/cyborg_dashboard/www/cyborg-dashboard.js"), "utf8"));

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + x : "")); } };

const DASH = {
  version: 5, revision: 0, theme: { accent: "#00e5ff", gap: 16, radius: 16 }, hierarchy: {},
  pages: [{ id: "home", type: "sections", title: "Cyborg", icon: "mdi:hexagon-multiple-outline", sections: [
    { id: "sec-en", title: "Energia", icon: "mdi:flash", accent: "#ffd166", collapsed: false, items: [
      { id: "cons", type: "consumption", entity_id: "", name: "", size: "xl", appearance: {}, states: {}, actions: {},
        hours: 24, total: "sensor.contatore_generale_potenza",
        loads: [{ entity: "sensor.presa_asciugatrice_potenza" }, { entity: "sensor.lavastoviglie_potenza" },
                { entity: "sensor.presa_bagno_brutto_potenza" }, { entity: "sensor.presa_shelly_phon_capelli_potenza" },
                { entity: "sensor.presa_elettrodomestici_sx_potenza" }] },
    ] }] }],
};

(async () => {
  const exe = ["/opt/pw-browsers/chromium-1243/chrome-linux/chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2,
    timezoneId: "Europe/Rome", locale: "it-IT" });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("CONSOLE: " + m.text()); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push("HTTP " + r.status() + " " + r.url()); });
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });

  await page.evaluate(() => {
    const M = 60000, H = 3600000;
    const T0 = Date.parse("2026-11-24T00:30:00Z");          // 01:30 in Italia
    const TOT = [[128.8,526.2],[187.1,719.9],[475.6,781.3],[688.0,719.8],[726.9,781.3],[757.6,772.1],[787.9,806.2],[784.3,847.4],[759.6,786.5],[796.4,936.2],[817.2,835.2],[838.8,846.5],[844.6,1180.1],[838.2,855.4],[851.0,882.5],[863.8,870.6],[588.5,879.6],[652.3,860.2],[844.3,855.7],[912.8,2260.0],[940.3,950.9],[936.6,948.1],[932.4,1264.4],[918.3,931.1],[911.5,934.0],[875.6,923.4],[824.0,840.4],[820.1,942.2],[823.6,830.5],[663.9,852.0],[148.7,326.8],[150.2,629.4],[120.9,310.1],[121.1,288.3],[127.1,659.1],[127.6,286.4]];
    const ASC = [[5.8,189.2],[9.4,259.2],[265.6,444.6],[476.8,504.7],[519.3,556.4],[551.8,569.7],[582.5,604.3],[615.1,636.4],[638.5,661.5],[673.1,714.7],[697.0,718.0],[717.7,721.7],[722.1,747.4],[718.7,723.4],[728.4,762.4],[744.5,748.5],[481.6,749.5],[521.9,729.1],[729.5,741.6],[733.6,769.9],[736.9,745.3],[734.7,736.7],[731.3,762.3],[719.6,723.9],[714.0,740.1],[711.9,717.9],[710.5,718.4],[710.1,730.0],[708.6,709.8],[556.4,747.5],[41.6,274.4],[28.5,276.1],[8.7,279.3],[9.3,274.1],[7.1,232.9],[14.8,313.5]];
    const D0 = Date.parse("2026-11-23T23:00:00Z");          // mezzanotte del 24
    const S5 = {}; const ids = ["sensor.contatore_generale_potenza", "sensor.presa_asciugatrice_potenza",
      "sensor.lavastoviglie_potenza", "sensor.presa_bagno_brutto_potenza", "sensor.presa_shelly_phon_capelli_potenza",
      "sensor.presa_elettrodomestici_sx_potenza"];
    for (const id of ids) S5[id] = [];
    for (let k = 0; k < 288; k++) {
      const t = D0 + k * 5 * M, hh = (t - D0) / H;
      const j = Math.round((t - T0) / (5 * M));
      const frigo = 120 + (k % 9 < 3 ? 90 : 0);
      let asc = [3, 3], lav = [0, 0], phon = [0.4, 0.6], sx = [0, 0], tot;
      const bag = [24.6, 25.1];
      if (j >= 0 && j < 36) { asc = ASC[j]; tot = TOT[j]; }
      else {
        let extra = 0;
        if (hh >= 7 && hh < 7.25) { phon = [1450, 1820]; }
        if (hh >= 12.5 && hh < 13.2) { sx = [880, 1650]; }
        if (hh >= 17.2 && hh < 20.8) extra = 1700 + 900 * Math.sin((hh - 17.2) * 1.7);   // cena: forno e piano, nessuna presa
        if (hh >= 21 && hh < 22.6) { lav = [hh < 21.3 || hh > 22.3 ? 1900 : 95, 2100]; }
        const m = frigo + extra + asc[0] + lav[0] + bag[0] + phon[0] + sx[0];
        tot = [m, m + (k % 13 === 0 ? 1200 : 60)];
      }
      const push = (id, v) => S5[id].push({ start: t, end: t + 5 * M, mean: v[0], max: v[1] });
      push(ids[0], tot); push(ids[1], asc); push(ids[2], lav); push(ids[3], bag); push(ids[4], phon); push(ids[5], sx);
    }
    // grezzo: i 5 minuti come gradini, piu' lo spunto vero di 8 secondi alle 03:05
    const RAW = {};
    for (const id of ids) {
      RAW[id] = [];
      for (const r of S5[id]) {
        RAW[id].push({ lu: r.start / 1000, s: String(r.mean) });
        if (id === ids[0] && r.max > r.mean * 1.6) RAW[id].push({ lu: (r.start + 140000) / 1000, s: String(r.max) }, { lu: (r.start + 148000) / 1000, s: String(r.mean) });
      }
    }
    const P = (n, v) => ({ state: String(v), attributes: { friendly_name: n, device_class: "power", unit_of_measurement: "W", state_class: "measurement" } });
    const H2 = window.__EL__ ? null : null; void H2;
    window.__CONS = { S5, RAW, D0 };
    window.__CONS_STATES = {
      "sensor.contatore_generale_potenza": P("Contatore generale Potenza", 112.8),
      "sensor.presa_asciugatrice_potenza": P("Asciugatrice", 0),
      "sensor.lavastoviglie_potenza": P("Lavastoviglie", 0),
      "sensor.presa_bagno_brutto_potenza": P("Presa Bagno brutto", 25),
      "sensor.presa_shelly_phon_capelli_potenza": P("Phon capelli", 0.6),
      "sensor.presa_elettrodomestici_sx_potenza": P("Cucina SX", 0),
    };
  });

  const mount = async (opts) => {
    await page.evaluate(async ([dash, opts]) => {
      await window.__mount(JSON.parse(JSON.stringify(dash)), { pageIndex: 0 });
      const el = window.__EL__;
      Object.assign(el._hass.states, window.__CONS_STATES);
      const orig = el._hass.callWS.bind(el._hass);
      el._hass.callWS = (m) => {
        if (m.type === "recorder/statistics_during_period" && (m.statistic_ids || []).includes("sensor.contatore_generale_potenza")) {
          const a = Date.parse(m.start_time), b = Date.parse(m.end_time), out = {};
          for (const id of m.statistic_ids) out[id] = (window.__CONS.S5[id] || []).filter((r) => r.start >= a && r.start < b);
          return Promise.resolve(out);
        }
        if (m.type === "history/history_during_period" && (m.entity_ids || []).includes("sensor.contatore_generale_potenza")) {
          const a = Date.parse(m.start_time) / 1000, b = Date.parse(m.end_time) / 1000, out = {};
          for (const id of m.entity_ids) {
            const all = window.__CONS.RAW[id] || [];
            const first = all.filter((p) => p.lu <= a).pop();
            out[id] = (first ? [first] : []).concat(all.filter((p) => p.lu > a && p.lu < b));
          }
          return Promise.resolve(out);
        }
        return orig(m);
      };
      el._consEnd = { cons: window.__CONS.D0 + 24 * 3600000 };
      if (opts.zoom) el._consZoom = { cons: opts.zoom };
      if (opts.width) document.body.style.width = opts.width + "px";
      if (opts.edit) { el._editing = true; el._selected = { kind: "card", sectionId: "sec-en", itemId: "cons" }; }
      el._signature = ""; el.render();
    }, [DASH, opts]);
    await page.waitForFunction(() => {
      const s = document.querySelector("cyborg-dashboard [data-cons-svg]");
      return s && Math.abs(s.getBoundingClientRect().width - Number(s.getAttribute("viewBox").split(" ")[2])) < 7;
    }, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(250);
  };
  const shotCard = async (name) => {
    const card = await page.$("cyborg-dashboard [data-cons-svg]");
    const art = await card.evaluateHandle((n) => n.closest("article"));
    await art.asElement().screenshot({ path: path.resolve(__dirname, name + ".png") });
  };
  const measure = () => page.evaluate(() => {
    const svg = document.querySelector("cyborg-dashboard [data-cons-svg]");
    const r = svg.getBoundingClientRect();
    const vb = svg.getAttribute("viewBox").split(" ").map(Number);
    const lab = svg.querySelector(".cs-ylab");
    return { w: r.width, h: r.height, vbw: vb[2], vbh: vb[3],
      font: lab ? getComputedStyle(lab).fontSize : null,
      labelH: lab ? lab.getBoundingClientRect().height : null,
      ylabels: Array.from(svg.querySelectorAll(".cs-ylab")).map((t) => t.textContent),
      xlabels: Array.from(svg.querySelectorAll(".cs-xlab")).map((t) => t.textContent),
      chips: Array.from(document.querySelectorAll("cyborg-dashboard .cs-chip")).map((c) => c.textContent.replace(/\s+/g, " ").trim()),
      legend: Array.from(document.querySelectorAll("cyborg-dashboard .cs-leg")).map((c) => c.textContent.replace(/\s+/g, " ").trim()),
      layers: svg.querySelectorAll(".cs-layer").length,
      nan: /NaN|undefined/.test(svg.outerHTML) };
  });

  // --- 1. la giornata del 24/11 -------------------------------------------
  console.log("\n== GIORNATA ==");
  await mount({});
  let m = await measure();
  ok("SVG alla larghezza vera (niente testo stirato)", Math.abs(m.w - m.vbw) < 2 && Math.abs(m.h - m.vbh) < 2, JSON.stringify([m.w, m.vbw, m.h, m.vbh]));
  ok("etichette a 10 px veri", m.font === "10px" && m.labelH < 14, m.font + " " + m.labelH);
  ok("asse delle potenze tondo, decimali dal passo", m.ylabels[0] === "0" && m.ylabels.every((l) => /^(0|\d+(,\d)? kW|\d+ W)$/.test(l)), m.ylabels.join(" | "));
  ok("asse del tempo in ore tonde", m.xlabels.length >= 4 && m.xlabels.every((l) => /^\d\d:00$|^[a-z]{3} \d+$/.test(l)), m.xlabels.join(" | "));
  ok("asciugatrice fra gli eventi", m.chips.some((c) => /Asciugatrice.*01:40.*04:0\d.*kWh/.test(c)), m.chips.join(" || "));
  ok("picco non misurato fra gli eventi", m.chips.some((c) => /Picco non misurato/.test(c)), m.chips.join(" || "));
  ok("strati disegnati", m.layers >= 5, m.layers);
  ok("niente NaN", !m.nan);
  await shotCard("90-consumi-giorno");

  // il mirino alle 03:05
  const box = await page.$eval("cyborg-dashboard [data-cons-svg]", (s) => { const r = s.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const g = await page.evaluate(() => { const g = window.__EL__._consGeom.cons; return { sx: g.sx, dx: g.dx, W: g.W, t0: g.t0, t1: g.t1 }; });
  const tAt = Date.parse("2026-11-24T02:07:30Z");
  const px = box.x + (g.sx + (g.W - g.sx - g.dx) * (tAt - g.t0) / (g.t1 - g.t0)) * box.w / g.W;
  await page.mouse.move(px, box.y + box.h / 2);
  await page.waitForTimeout(120);
  const tip = await page.evaluate(() => {
    const t = document.querySelector("cyborg-dashboard .cs-tip");
    const p = t.closest(".cs-plot").getBoundingClientRect(), r = t.getBoundingClientRect();
    return { hidden: t.hidden, text: t.textContent.replace(/\s+/g, " "), inside: r.left >= p.left - 1 && r.right <= p.right + 1 };
  });
  ok("il mirino si apre", !tip.hidden);
  ok("dice chi consumava alle 03:05", /Asciugatrice\s*734 W/.test(tip.text) && /Non misurato/.test(tip.text) && /2,26 kW/.test(tip.text), tip.text);
  ok("il dettaglio non esce dal riquadro", tip.inside);
  await shotCard("91-consumi-mirino");

  // trascinare = zoom
  const xa = box.x + (g.sx + (g.W - g.sx - g.dx) * (Date.parse("2026-11-24T00:15:00Z") - g.t0) / (g.t1 - g.t0)) * box.w / g.W;
  const xb = box.x + (g.sx + (g.W - g.sx - g.dx) * (Date.parse("2026-11-24T03:30:00Z") - g.t0) / (g.t1 - g.t0)) * box.w / g.W;
  await page.mouse.move(xa, box.y + box.h / 2);
  await page.mouse.down();
  await page.mouse.move((xa + xb) / 2, box.y + box.h / 2, { steps: 4 });
  await page.mouse.move(xb, box.y + box.h / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__EL__._consZoom && window.__EL__._consZoom.cons, { timeout: 3000 }).catch(() => {});
  const z = await page.evaluate(() => window.__EL__._consZoom && window.__EL__._consZoom.cons);
  ok("trascinare imposta lo zoom", !!z && Math.abs(z[0] - Date.parse("2026-11-24T00:15:00Z")) < 10 * 60000, JSON.stringify(z));

  // --- 2. lo zoom sulla notte: storico grezzo --------------------------------
  console.log("\n== ZOOM ==");
  await mount({ zoom: [Date.parse("2026-11-24T00:15:00Z"), Date.parse("2026-11-24T03:30:00Z")] });
  await page.waitForTimeout(300);
  m = await measure();
  const zt = await page.evaluate(() => (document.querySelector("cyborg-dashboard .cs-zoombar") || {}).textContent);
  ok("barra dello zoom con l'intervallo", /Zoom/.test(zt || "") && /01:15/.test(zt || ""), zt);
  ok("tacche a quarti d'ora tondi", m.xlabels.every((l) => /:(00|15|30|45)$/.test(l)), m.xlabels.join(" | "));
  const res = await page.evaluate(() => window.__EL__._consGeom.cons.res);
  ok("3 ore e 15: medie di 5 minuti (sopra le 3 ore)", res === "5minute", res);
  await shotCard("92-consumi-zoom");
  await mount({ zoom: [Date.parse("2026-11-24T01:50:00Z"), Date.parse("2026-11-24T02:20:00Z")] });
  await page.waitForTimeout(300);
  const raw = await page.evaluate(() => ({ res: window.__EL__._consGeom.cons.res,
    peak: Math.max(...window.__EL__._consGeom.cons.stack.map((b) => b.totalMax)) }));
  ok("mezz'ora: storico grezzo, lo spunto vero c'e'", raw.res === "raw" && raw.peak > 2200, JSON.stringify(raw));
  await shotCard("93-consumi-grezzo");

  // --- 3. telefono -----------------------------------------------------------
  console.log("\n== TELEFONO ==");
  await page.setViewportSize({ width: 390, height: 900 });
  await mount({});
  m = await measure();
  ok("a 390 px resta alla larghezza vera", Math.abs(m.w - m.vbw) < 2, JSON.stringify([m.w, m.vbw]));
  ok("a 390 px poche tacche, niente sovrapposte", m.xlabels.length <= 5, m.xlabels.join(" | "));
  const over = await page.evaluate(() => {
    const ts = Array.from(document.querySelectorAll("cyborg-dashboard .cs-xlab")).map((t) => t.getBoundingClientRect());
    for (let i = 1; i < ts.length; i++) if (ts[i].left < ts[i - 1].right) return true;
    return false;
  });
  ok("etichette del tempo non sovrapposte", !over);
  await shotCard("94-consumi-telefono");

  // --- 4. editor -------------------------------------------------------------
  await page.setViewportSize({ width: 1280, height: 1100 });
  await mount({ edit: true });
  await page.waitForTimeout(200);
  const ed = await page.evaluate(() => {
    const a = document.querySelector("cyborg-dashboard aside.editor");
    return a ? { total: !!a.querySelector("[data-cons-total]"), rows: a.querySelectorAll("[data-cons-load]").length,
      checked: a.querySelectorAll("[data-cons-load]:checked").length } : null;
  });
  ok("editor: generale e dispositivi", ed && ed.total && ed.rows >= 5 && ed.checked === 5, JSON.stringify(ed));
  const aside = await page.$("cyborg-dashboard aside.editor");
  if (aside) await aside.screenshot({ path: path.resolve(__dirname, "95-consumi-editor.png") });

  ok("nessun errore nella pagina", !errors.length, errors.join(" | "));
  await browser.close();
  console.log(`\n${pass} passati, ${fail} falliti`);
  process.exit(fail ? 1 : 0);
})();
