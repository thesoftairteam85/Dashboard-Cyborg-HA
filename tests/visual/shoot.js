const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

// The harness imports ./panel.js, which used to be a COPY refreshed by hand.
// A copy refreshed by hand is a copy that is eventually stale, and a stale
// copy makes the visual suite report green on code that is not the code being
// shipped — the single most expensive kind of false negative there is. So the
// copy is made here, every run, from the real source. If this ever fails the
// suite must not start.
{
  const SRC = path.resolve(__dirname, "../../custom_components/cyborg_dashboard/www/cyborg-dashboard.js");
  const DEST = path.resolve(__dirname, "panel.js");
  const code = fs.readFileSync(SRC, "utf8");
  fs.writeFileSync(DEST, code);
  const build = (code.match(/const CYBORG_BUILD = "([^"]+)"/) || [])[1] || "?";
  console.log("panel.js allineato al sorgente (build " + build + ", " + code.length + " byte)");
}

const DEFAULT_DASH = {
  version: 5, revision: 0, theme: { accent: "#00e5ff", gap: 16, radius: 16 },
  pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:hexagon-multiple-outline", sections: [] },
    { id: "map", type: "floorplan", title: "Mappa 3D", icon: "mdi:floor-plan",
      view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true,
              show_labels: true, level_gap: 150, active_level: null },
      rooms: [] },
  ],
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium/chrome-linux/chrome" }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });

  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);

  const shots = [
    ["10-sections",  { pageIndex: 0, autoCompose: true }],
    ["11-sect-edit", { pageIndex: 0, autoCompose: true, editing: true }],
    ["01-map-3d",    { pageIndex: 1, autoRooms: true }],
    ["02-map-edit",  { pageIndex: 1, autoRooms: true, editing: true }],
    ["03-map-room",  { pageIndex: 1, autoRooms: true, editing: true, selectRoom: true }],
    ["04-map-flat",  { pageIndex: 1, autoRooms: true, view: { pitch: 0, yaw: 0 } }],
    ["05-map-nowall",{ pageIndex: 1, autoRooms: true, view: { show_walls: false } }],
    ["06-map-levels", { pageIndex: 1, autoRooms: true, levels: [0, 1, -1] }],
    ["07-map-lshape", { pageIndex: 1, autoRooms: true, editing: true, selectRoom: true, lshape: true }],
    ["08-map-focus",  { pageIndex: 1, autoRooms: true, focusRoom: true }],
    ["09-map-focus-edit", { pageIndex: 1, autoRooms: true, editing: true, focusRoom: true }],
    ["12-map-walls",  { pageIndex: 1, autoRooms: true, balcony: true }],
    ["20-overview",   { pageIndex: 0, overview: true }],
    ["25-trend",      { pageIndex: 0, autoCompose: true, trend: true }],
    ["26-ev",         { pageIndex: 0, autoCompose: true, ev: true }],
    ["27-comfort",    { pageIndex: 0, autoCompose: true, comfort: true }],
    ["13-map-garage", { pageIndex: 1, autoRooms: true, garage: true }],
    ["15-flow-ev",    { pageIndex: 0, autoCompose: true, flowCard: true, openTree: true, ev: true }],
    ["22-economy",    { pageIndex: 0, autoCompose: true, economy: true }],
    ["23-economy-ed", { pageIndex: 0, autoCompose: true, economy: true, editing: true, selectEconomy: true }],
  ];
  for (const [name, opts] of shots) {
    // full reload per shot: __mount wipes document.body, which is fine once but
    // makes the page fragile across repeated mounts
    await page.goto("http://127.0.0.1:8899/harness.html");
    await page.waitForFunction("window.__ready === true", { timeout: 15000 });
    await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
    await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o), opts);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.resolve(__dirname, name + ".png") });
    console.log("shot " + name);
  }

  // geometry probe: are walls actually standing up out of the floor plane?
  const probe = await page.evaluate(() => {
    const room = document.querySelector(".fp-room");
    if (!room) return { error: "no room rendered" };
    const floor = room.querySelector(".fp-floor").getBoundingClientRect();
    const walls = Array.from(room.querySelectorAll(".fp-wall")).map((w) => {
      const r = w.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) };
    });
    const label = room.querySelector(".fp-label");
    const badges = room.querySelectorAll(".fp-badge");
    const lr = label && label.getBoundingClientRect();
    return {
      floor: { top: Math.round(floor.top), bottom: Math.round(floor.bottom), h: Math.round(floor.height), w: Math.round(floor.width) },
      walls, badgeCount: badges.length,
      label: lr ? { top: Math.round(lr.top), h: Math.round(lr.height), w: Math.round(lr.width) } : null,
      rooms: document.querySelectorAll(".fp-room").length,
      worldTransform: getComputedStyle(document.querySelector(".fp-world")).transform.slice(0, 60),
    };
  });
  console.log("PROBE " + JSON.stringify(probe, null, 1));

  // ---- geometry assertions (visual regression without eyeballing) ---------
  let pass = 0, fail = 0;
  const ok = (n, c, extra) => { if (c) { pass++; console.log("  ok  " + n); }
    else { fail++; console.log("  FAIL " + n + (extra ? " -> " + extra : "")); } };

  const geom = async (view) => {
    await page.goto("http://127.0.0.1:8899/harness.html");
    await page.waitForFunction("window.__ready === true", { timeout: 15000 });
    await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
    await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
      { pageIndex: 1, autoRooms: true, view });
    await page.waitForTimeout(500);
    return page.evaluate(() => {
      const room = document.querySelector(".fp-room");
      const f = room.querySelector(".fp-floor").getBoundingClientRect();
      const ws = Array.from(room.querySelectorAll(".fp-wall"));
      const floorMidY = (f.top + f.bottom) / 2;
      // a wall that rises out of the floor must extend ABOVE the floor centre
      const wallTops = ws.map((w) => w.getBoundingClientRect().top);
      const label = room.querySelector(".fp-label");
      const tag = room.querySelector(".fp-tag");
      return {
        fw: Math.round(f.width), fh: Math.round(f.height),
        floorTop: Math.round(f.top), floorMidY: Math.round(floorMidY),
        wallCount: ws.length, minWallTop: wallTops.length ? Math.round(Math.min(...wallTops)) : null,
        tagTop: tag ? Math.round(tag.getBoundingClientRect().top) : null,
        labelText: label ? label.textContent.trim() : null,
        badges: room.querySelectorAll(".fp-badge").length,
      };
    });
  };

  console.log("\n== GEOMETRIA ==");
  const iso = await geom({ pitch: 56, yaw: 32, zoom: 1, wall_height: 62, show_walls: true, show_labels: true });
  const flat = await geom({ pitch: 0, yaw: 0, zoom: 1, wall_height: 62, show_walls: true, show_labels: true });
  const nowall = await geom({ pitch: 56, yaw: 32, zoom: 1, wall_height: 62, show_walls: false, show_labels: true });

  ok("vista piana: nessuna deformazione prospettica (h == profondita 180)", Math.abs(flat.fh - 180) <= 2, "h=" + flat.fh);
  ok("vista piana: larghezza reale (w == 230)", Math.abs(flat.fw - 230) <= 2, "w=" + flat.fw);
  ok("vista isometrica: pavimento schiacciato rispetto alla pianta", iso.fh < flat.fh * 0.95, iso.fh + " vs " + flat.fh);
  ok("4 muri per stanza", iso.wallCount === 4, String(iso.wallCount));
  ok("i muri salgono sopra il pavimento (non pendono sotto)", iso.minWallTop < iso.floorMidY, "wallTop=" + iso.minWallTop + " floorMid=" + iso.floorMidY);
  ok("toggle muri funziona", nowall.wallCount === 0, String(nowall.wallCount));
  ok("targhetta sopra la stanza", iso.tagTop < iso.floorMidY, iso.tagTop + " vs " + iso.floorMidY);
  ok("nome stanza dall'area HA", iso.labelText === "Soggiorno", String(iso.labelText));
  ok("badge popolati dal registro aree", iso.badges >= 4 && iso.badges <= 6, String(iso.badges));

  // ---- storeys: a room one floor up must be measurably higher on screen ---
  const scene = async (opts) => {
    await page.goto("http://127.0.0.1:8899/harness.html");
    await page.waitForFunction("window.__ready === true", { timeout: 15000 });
    await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
    await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o), opts);
    await page.waitForTimeout(500);
    return page.evaluate(() => {
      const rooms = Array.from(document.querySelectorAll(".fp-room")).map((r) => {
        const f = r.querySelector(".fp-floor").getBoundingClientRect();
        return {
          id: r.getAttribute("data-room"), level: Number(r.getAttribute("data-level")),
          top: Math.round(f.top), left: Math.round(f.left),
          midY: Math.round((f.top + f.bottom) / 2), midX: Math.round((f.left + f.right) / 2),
          w: Math.round(f.width), h: Math.round(f.height),
          opacity: Number(getComputedStyle(r).opacity.slice(0, 5)),
          walls: r.querySelectorAll(".fp-wall").length,
          clip: (r.querySelector(".fp-floor").style.clipPath || "").slice(0, 20),
          handles: Array.from(r.querySelectorAll("[data-resize]")).map((h) => {
            const b = h.getBoundingClientRect();
            return { k: h.getAttribute("data-resize"), x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
          }),
          vertices: r.querySelectorAll("[data-vertex]").length,
          spots: Array.from(r.querySelectorAll(".fp-spot")).map((sp) => {
            const b = sp.querySelector(".fp-spot-btn").getBoundingClientRect();
            return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: Math.round(b.width) };
          }),
        };
      });
      const vp = document.querySelector("[data-fp-viewport]").getBoundingClientRect();
      return { rooms, focusBar: !!document.querySelector(".fp-focus-bar"),
        levelBtns: document.querySelectorAll("[data-level-pick]").length,
        vp: { w: Math.round(vp.width), h: Math.round(vp.height), midX: Math.round(vp.left + vp.width / 2), midY: Math.round(vp.top + vp.height / 2) } };
    });
  };

  console.log("\n== PIANI, FORMA, DETTAGLIO STANZA ==");
  const flatPlan = await scene({ pageIndex: 1, autoRooms: true });
  const stack = await scene({ pageIndex: 1, autoRooms: true, levels: [0, 1, -1] });

  const byLevel = (s2, lv) => s2.rooms.filter((r) => r.level === lv);
  ok("le stanze portano il proprio piano nel DOM",
     [0, 1, -1].every((lv) => byLevel(stack, lv).length), stack.rooms.map((r) => r.level).join());

  // Same room, three storeys: the vertical offset is the only variable, so any
  // difference measured here is the storey lift and nothing else.
  const up = await scene({ pageIndex: 1, autoRooms: true, levels: [1] });
  const down = await scene({ pageIndex: 1, autoRooms: true, levels: [-1] });
  const g0 = flatPlan.rooms[0], g1 = up.rooms[0], gm1 = down.rooms[0];
  // the vertical axis of the scene is tilted by the camera, so a storey of
  // 150 units must show up as a real, sizeable screen-space lift
  ok("il primo piano sta piu' in alto del piano terra", g1.midY < g0.midY - 40,
     "p1=" + g1.midY + " p0=" + g0.midY);
  ok("l'interrato sta piu' in basso del piano terra", gm1.midY > g0.midY + 40,
     "p-1=" + gm1.midY + " p0=" + g0.midY);
  // The scene has a real perspective camera, so a raised room legitimately
  // comes slightly closer and grows. What must not happen is that it grows a
  // lot, or drifts sideways more than it rises: that would be the camera
  // plane being approached, not depth being conveyed.
  const upJump = g0.midY - g1.midY, downJump = gm1.midY - g0.midY;
  ok("salire e scendere di un piano sono salti confrontabili",
     Math.abs(upJump - downJump) / Math.max(upJump, downJump) < 0.15,
     upJump + " vs " + downJump);
  ok("la prospettiva ingrandisce di poco il piano superiore",
     g1.w / g0.w > 1 && g1.w / g0.w < 1.12, (g1.w / g0.w).toFixed(3));
  ok("il piano inferiore rimpicciolisce di poco",
     gm1.w / g0.w < 1 && gm1.w / g0.w > 0.9, (gm1.w / g0.w).toFixed(3));
  ok("un piano solleva molto piu' di quanto sposti di lato",
     Math.abs(g1.midX - g0.midX) < upJump * 0.2 && Math.abs(gm1.midX - g0.midX) < downJump * 0.2,
     [g1.midX - g0.midX, upJump, gm1.midX - g0.midX, downJump].join());
  ok("nessun piano si rovescia (nessuna larghezza negativa o nulla)",
     g1.w > 10 && gm1.w > 10 && g1.h > 10 && gm1.h > 10, [g1.w, g1.h, gm1.w, gm1.h].join());
  ok("senza piani nulla si solleva",
     Math.max(...flatPlan.rooms.map((r) => r.midY)) - Math.min(...flatPlan.rooms.map((r) => r.midY)) < 400);
  ok("con piu' piani compare il selettore", stack.levelBtns >= 4, String(stack.levelBtns));
  ok("con un piano solo il selettore non c'e'", flatPlan.levelBtns === 0, String(flatPlan.levelBtns));

  const iso1 = await scene({ pageIndex: 1, autoRooms: true, levels: [0, 1, -1], view: { active_level: 0 } });
  const on0 = byLevel(iso1, 0)[0], off0 = byLevel(iso1, 1)[0];
  ok("isolando un piano gli altri sbiadiscono", off0.opacity < 0.2 && on0.opacity > 0.9,
     on0.opacity + " / " + off0.opacity);
  ok("il piano isolato tiene i suoi muri", on0.walls === 4 && off0.walls === 0,
     on0.walls + " / " + off0.walls);

  // ---- shape + resize handles --------------------------------------------
  const shaped = await scene({ pageIndex: 1, autoRooms: true, editing: true, selectRoom: true, lshape: true });
  const lr = shaped.rooms[0];
  ok("la stanza a L e' ritagliata", lr.clip.startsWith("polygon("), lr.clip);
  ok("la stanza a L ha 6 muri", lr.walls === 6, String(lr.walls));
  ok("la stanza a L ha 6 vertici trascinabili", lr.vertices === 6, String(lr.vertices));
  ok("la stanza selezionata ha 8 maniglie", lr.handles.length === 8, String(lr.handles.length));
  // the grips live in the floor plane, so nw/se must sit on opposite corners
  // of the projected parallelogram - if they collapsed onto each other the
  // resize gesture would be unusable
  const H = Object.fromEntries(lr.handles.map((h) => [h.k, h]));
  ok("le maniglie opposte sono distinte",
     Math.hypot(H.nw.x - H.se.x, H.nw.y - H.se.y) > 100,
     Math.round(Math.hypot(H.nw.x - H.se.x, H.nw.y - H.se.y)));
  ok("le maniglie di lato stanno a meta' fra gli angoli",
     Math.abs(H.n.x - (H.nw.x + H.ne.x) / 2) <= 4 && Math.abs(H.n.y - (H.nw.y + H.ne.y) / 2) <= 4,
     [H.n.x, (H.nw.x + H.ne.x) / 2, H.n.y, (H.nw.y + H.ne.y) / 2].join());
  ok("nessuna maniglia esce dal riquadro della mappa",
     lr.handles.every((h) => h.x > -40 && h.y > -40));

  // ---- room close-up ------------------------------------------------------
  const zoomed = await scene({ pageIndex: 1, autoRooms: true, focusRoom: true });
  const fr = zoomed.rooms.find((r) => r.spots.length) || zoomed.rooms[0];
  ok("entrando nella stanza compare la barra", zoomed.focusBar);
  ok("la stanza aperta e' molto piu' grande", fr.w > flatPlan.rooms[0].w * 1.8,
     fr.w + " vs " + flatPlan.rooms[0].w);
  ok("la stanza aperta sta al centro della vista",
     Math.abs(fr.midX - zoomed.vp.midX) < 90 && Math.abs(fr.midY - zoomed.vp.midY) < 120,
     [fr.midX, zoomed.vp.midX, fr.midY, zoomed.vp.midY].join());
  ok("la stanza aperta entra nella vista", fr.w < zoomed.vp.w && fr.h < zoomed.vp.h,
     [fr.w, fr.h, zoomed.vp.w, zoomed.vp.h].join());
  ok("i dispositivi sono posizionati dentro la stanza", fr.spots.length >= 3, String(fr.spots.length));
  ok("i dispositivi non sono tutti sullo stesso punto",
     new Set(fr.spots.map((sp) => sp.x + ":" + sp.y)).size === fr.spots.length);
  // billboarded markers must keep their real size despite the 3D transform,
  // otherwise the icons come out squashed like the floor
  ok("le icone dei dispositivi restano circolari e leggibili",
     fr.spots.every((sp) => sp.w >= 30 && sp.w <= 46), fr.spots.map((sp) => sp.w).join());
  ok("nella stanza aperta il nome non copre i dispositivi",
     await page.evaluate(() => !document.querySelector(".fp-room.focused .fp-label")));
  ok("le altre stanze si defilano",
     zoomed.rooms.filter((r) => r !== fr).every((r) => r.opacity < 0.2),
     zoomed.rooms.map((r) => r.opacity).join());

  // ---- una card per stanza ------------------------------------------------
  console.log("\n== CARD STANZA ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, rooms: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.resolve(__dirname, "24-rooms.png") });
  // Each room is now its OWN section, collapsed after the first: the previous
  // shape dumped the whole house on screen at once. So the structure is
  // measured per section, and the cards are counted after expanding them.
  const rcStruct = await page.evaluate(() => {
    const el = window.__EL__;
    const secs = el._sections();
    return { sections: secs.length, titles: secs.map((s2) => s2.title),
      oneCardEach: secs.every((s2) => s2.items.length === 1 && s2.items[0].type === "room"),
      collapsed: secs.map((s2) => !!s2.collapsed),
      visibleCards: document.querySelectorAll(".rc").length };
  });
  ok("una sezione per ogni area", rcStruct.sections === 5, String(rcStruct.sections));
  ok("ogni sezione contiene solo la sua stanza", rcStruct.oneCardEach);
  ok("solo la prima stanza è aperta",
     rcStruct.collapsed[0] === false && rcStruct.collapsed.slice(1).every(Boolean),
     rcStruct.collapsed.join());
  ok("e a pagina aperta si vede una stanza sola", rcStruct.visibleCards === 1,
     String(rcStruct.visibleCards));

  const rc = await page.evaluate(async () => {
    const el = window.__EL__;
    el._sections().forEach((s2) => { s2.collapsed = false; });
    el._signature = ""; el.render();
    await new Promise((r) => setTimeout(r, 250));
    const cards = Array.from(document.querySelectorAll(".rc"));
    return {
      count: cards.length,
      areas: Array.from(document.querySelectorAll("[data-room-lights-off]")).map((b) => b.getAttribute("data-room-lights-off")),
      withReadings: cards.filter((c) => c.querySelector(".rc-strip")).length,
      covers: document.querySelectorAll(".rc-cover").length,
      coverCmds: Array.from(document.querySelectorAll("[data-cover-cmd]")).map((b) => b.getAttribute("data-cover-cmd").split("|")[1]),
      overflow: cards.some((c) => c.scrollWidth > c.clientWidth + 1),
    };
  });
  ok("aprendole tutte c'è una card per ogni area", rc.count === 5, String(rc.count));
  ok("ogni stanza con luci ha lo spegnimento di gruppo", rc.areas.length >= 4, rc.areas.join());
  ok("le letture salgono in testa alla card", rc.withReadings >= 3, String(rc.withReadings));
  ok("le tapparelle hanno i tre comandi giusti",
     rc.covers > 0 && rc.coverCmds.every((c) => ["open_cover", "stop_cover", "close_cover"].includes(c)),
     rc.coverCmds.join());
  ok("nessuna card stanza deborda", !rc.overflow);

  // ---- confronto andamenti -----------------------------------------------
  console.log("\n== CONFRONTO ANDAMENTI ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, trend: true });
  await page.waitForTimeout(900);
  const tr = await page.evaluate(() => {
    const svg = document.querySelector(".tr-svg");
    if (!svg) return { lines: 0 };
    const box = svg.getBoundingClientRect();
    const lines = Array.from(svg.querySelectorAll(".tr-line")).map((p2) => {
      const b = p2.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height),
        top: Math.round(b.top - box.top), bottom: Math.round(b.bottom - box.top),
        stroke: getComputedStyle(p2).stroke };
    });
    const labels = Array.from(svg.querySelectorAll(".tr-ylab")).map((t) => t.textContent);
    return { lines, labels, boxH: Math.round(box.height),
      legend: Array.from(document.querySelectorAll(".tr-leg")).length };
  });
  ok("una linea per grandezza", tr.lines.length === 4, String(tr.lines.length));
  // the whole failure mode was an axis collapsed to +/-0.6 with every line off
  // screen: the labels must span the real temperatures
  ok("la scala verticale copre i valori veri",
     tr.labels.some((l) => parseFloat(l) > 18) && tr.labels.some((l) => parseFloat(l) < 34),
     tr.labels.join(","));
  ok("nessuna linea è fuori dal grafico",
     tr.lines.every((l) => l.top >= -2 && l.bottom <= tr.boxH + 2),
     JSON.stringify(tr.lines.map((l) => [l.top, l.bottom])));
  ok("le linee attraversano tutto il periodo",
     tr.lines.every((l) => l.w > 200), tr.lines.map((l) => l.w).join());
  ok("ogni linea ha un colore diverso",
     new Set(tr.lines.map((l) => l.stroke)).size === 4, tr.lines.map((l) => l.stroke).join(" "));
  ok("le linee non sono piatte", tr.lines.every((l) => l.h > 5), tr.lines.map((l) => l.h).join());
  ok("la legenda ha una voce per linea", tr.legend === 4, String(tr.legend));

  // ---- stanze sovrapposte: tutte cliccabili -------------------------------
  console.log("\n== STANZE SOVRAPPOSTE ==");
  await scene({ pageIndex: 1, autoRooms: true, editing: true, overlap: true });
  const reach = await page.evaluate(() => {
    const el = window.__EL__;
    const rooms = el._rooms();
    const out = [];
    for (const r of rooms) {
      const floor = document.querySelector(`[data-room="${r.id}"] .fp-floor`);
      const b = floor.getBoundingClientRect();
      // the centre of each room's own floor: what a finger would aim at
      const hit = document.elementFromPoint(Math.round(b.left + b.width / 2),
                                            Math.round(b.top + b.height / 2));
      const owner = hit && hit.closest(".fp-room");
      out.push({ id: r.id, title: r.title,
        hits: owner ? owner.getAttribute("data-room") : null,
        tag: hit ? hit.className : "" });
    }
    return out;
  });
  // Two rooms genuinely stacked on the plan cannot both own the same pixel —
  // the one on top does, and that is correct. What must hold is that every
  // room owns *some* visible pixel of its own floor, and that no click is
  // intercepted by a floating badge strip belonging to a different room.
  ok("nessun clic finisce su una targhetta di un'altra stanza",
     reach.every((r) => !String(r.tag).includes("fp-badge")),
     reach.map((r) => r.tag).join(" | "));
  const sampled = await page.evaluate(() => {
    const el = window.__EL__;
    return el._rooms().map((r) => {
      const floor = document.querySelector(`[data-room="${r.id}"] .fp-floor`);
      const b = floor.getBoundingClientRect();
      let own = 0, total = 0;
      for (let ix = 1; ix < 10; ix++) {
        for (let iy = 1; iy < 10; iy++) {
          const x = Math.round(b.left + (b.width * ix) / 10);
          const y = Math.round(b.top + (b.height * iy) / 10);
          const hit = document.elementFromPoint(x, y);
          const owner = hit && hit.closest(".fp-room");
          if (!owner) continue;
          total += 1;
          if (owner.getAttribute("data-room") === r.id) own += 1;
        }
      }
      return { title: r.title, own, total };
    });
  });
  ok("ogni stanza possiede una parte cliccabile del proprio pavimento",
     sampled.every((r) => r.own > 0), sampled.map((r) => `${r.title}:${r.own}/${r.total}`).join(" | "));

  const picked = await page.evaluate(() => {
    const el = window.__EL__;
    const ids = el._rooms().map((r) => r.id);
    const ok2 = [];
    for (const id of ids) {
      const btn = document.querySelector(`[data-pick-room="${id}"]`);
      if (!btn) { ok2.push(false); continue; }
      btn.click();
      ok2.push(el._selected && el._selected.roomId === id);
    }
    return ok2;
  });
  ok("ogni stanza si seleziona dall'elenco del pannello",
     picked.length > 1 && picked.every(Boolean), JSON.stringify(picked));

  // ---- rotazione della stanza e scorrimento -------------------------------
  console.log("\n== ROTAZIONE E SCORRIMENTO ==");
  const plain = await scene({ pageIndex: 1, autoRooms: true, editing: true, selectRoom: true });
  const spun = await scene({ pageIndex: 1, autoRooms: true, editing: true, selectRoom: true, rotate: true });
  const rotGeom = await page.evaluate(() => {
    const room = document.querySelector(".fp-room");
    const f = room.querySelector(".fp-floor").getBoundingClientRect();
    const rotHandle = room.querySelector("[data-rotate]");
    const walls = room.querySelectorAll(".fp-wall").length;
    return { w: Math.round(f.width), h: Math.round(f.height),
      handle: !!rotHandle,
      handleW: rotHandle ? Math.round(rotHandle.getBoundingClientRect().width) : 0,
      transform: room.style.transform };
  });
  ok("la stanza ruotata porta il rotateZ", /rotateZ\(35deg\)/.test(rotGeom.transform), rotGeom.transform);
  // rotating in the floor plane changes the projected bounding box; if it did
  // not, the rotation would be doing nothing visible
  ok("ruotare cambia davvero la proiezione a schermo",
     Math.abs(rotGeom.w - plain.rooms[0].w) > 10 || Math.abs(rotGeom.h - plain.rooms[0].h) > 10,
     `${plain.rooms[0].w}x${plain.rooms[0].h} -> ${rotGeom.w}x${rotGeom.h}`);
  ok("la maniglia di rotazione c'è ed è afferrabile",
     rotGeom.handle && rotGeom.handleW >= 24, String(rotGeom.handleW));
  ok("la stanza ruotata conserva i suoi muri", spun.rooms[0].walls === 4, String(spun.rooms[0].walls));

  // scrolling a long list in the editor must survive a click on it
  const keptScroll = await page.evaluate(async () => {
    const el = window.__EL__;
    el._selected = { kind: "room", roomId: el._rooms()[0].id };
    el._signature = ""; el.render();
    const box = document.querySelector('[data-keep-scroll="editor"]');
    if (!box) return { error: "no editor" };
    box.scrollTop = 220;
    const before = box.scrollTop;
    // any interaction re-renders the whole panel
    el._signature = ""; el.render();
    const after = document.querySelector('[data-keep-scroll="editor"]').scrollTop;
    return { before, after };
  });
  ok("il pannello non torna in cima a ogni clic",
     keptScroll.before > 0 && Math.abs(keptScroll.after - keptScroll.before) <= 2,
     JSON.stringify(keptScroll));

  // the orbit gesture must not be fighting a CSS transition
  const dragCss = await page.evaluate(() => {
    const vp = document.querySelector("[data-fp-viewport]");
    const world = vp.querySelector(".fp-world");
    const idle = getComputedStyle(world).transitionDuration;
    vp.classList.add("dragging");
    const dragging = getComputedStyle(world).transitionDuration;
    vp.classList.remove("dragging");
    return { idle, dragging };
  });
  ok("durante il trascinamento la scena non ha inerzia",
     parseFloat(dragCss.dragging) === 0 && parseFloat(dragCss.idle) > 0,
     dragCss.idle + " -> " + dragCss.dragging);

  // ---- temperature --------------------------------------------------------
  console.log("\n== TEMPERATURE ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, comfort: true });
  await page.waitForTimeout(900);
  const cfv = await page.evaluate(() => {
    const rooms = Array.from(document.querySelectorAll(".cf-room")).map((r) => {
      const mark = r.querySelector(".cf-scale i");
      const scale = r.querySelector(".cf-scale").getBoundingClientRect();
      const mb = mark ? mark.getBoundingClientRect() : null;
      const box = r.getBoundingClientRect();
      return {
        name: r.querySelector("strong").textContent.trim(),
        badge: r.querySelector(".cf-badge").textContent.trim(),
        temp: r.querySelector(".cf-t b").textContent.trim(),
        markPct: mb ? ((mb.left + mb.width / 2 - scale.left) / scale.width) * 100 : null,
        w: Math.round(box.width),
        overflow: r.scrollWidth > r.clientWidth + 1,
      };
    });
    const chips = Array.from(document.querySelectorAll(".cf-chip")).map((c) => c.textContent.trim());
    const grid = document.querySelector(".cf-grid");
    return { rooms, chips, gridW: grid ? Math.round(grid.getBoundingClientRect().width) : 0 };
  });
  ok("una scheda per ogni stanza con un sensore", cfv.rooms.length >= 3, String(cfv.rooms.length));
  ok("ogni scheda dichiara un giudizio",
     cfv.rooms.every((r) => r.badge.length > 1), cfv.rooms.map((r) => r.name + ":" + r.badge).join(" | "));
  ok("il balcone a 28.9 gradi è caldo",
     cfv.rooms.some((r) => /Balcone/i.test(r.name) && r.badge === "CALDO"),
     cfv.rooms.map((r) => r.name + "=" + r.badge).join(" | "));
  // the marker position is the whole point: it must track the temperature on
  // one shared scale, not a per-room one
  const warm = cfv.rooms.find((r) => /Balcone/i.test(r.name));
  const cool = cfv.rooms.find((r) => /Cucina/i.test(r.name));
  ok("il marcatore segue la temperatura sulla scala comune",
     warm && cool && warm.markPct > cool.markPct,
     warm && cool ? `${cool.name} ${cool.markPct.toFixed(1)}% < ${warm.name} ${warm.markPct.toFixed(1)}%` : "mancano");
  ok("il marcatore resta dentro la scala",
     cfv.rooms.every((r) => r.markPct === null || (r.markPct >= -1 && r.markPct <= 101)),
     cfv.rooms.map((r) => r.markPct && r.markPct.toFixed(1)).join());
  ok("ci sono i filtri per stanza, TUTTE compresa",
     cfv.chips.length === cfv.rooms.length + 1 && /TUTTE/.test(cfv.chips[0]), cfv.chips.join(" | "));
  ok("nessuna scheda deborda", cfv.rooms.every((r) => !r.overflow));

  // ---- auto elettrica -----------------------------------------------------
  console.log("\n== AUTO ELETTRICA ==");
  const garage = await scene({ pageIndex: 1, autoRooms: true, garage: true });
  const gar = await page.evaluate(() => {
    const cars = Array.from(document.querySelectorAll(".fp-car"));
    const vp = document.querySelector("[data-fp-viewport]").getBoundingClientRect();
    return {
      count: cars.length,
      charging: cars.filter((c) => c.className.includes("charging")).length,
      inView: cars.every((c) => {
        const b = c.querySelector(".fp-car-icon").getBoundingClientRect();
        return b.left >= vp.left - 4 && b.right <= vp.right + 4 && b.width > 20;
      }),
      iconW: cars.length ? Math.round(cars[0].querySelector(".fp-car-icon").getBoundingClientRect().width) : 0,
      socW: cars.length ? Math.round(cars[0].querySelector(".fp-car-soc span").getBoundingClientRect().width) : 0,
      barW: cars.length ? Math.round(cars[0].querySelector(".fp-car-soc").getBoundingClientRect().width) : 0,
      text: cars.length ? cars[0].querySelector(".fp-car-tag").textContent.replace(/\s+/g, " ").trim() : "",
    };
  });
  ok("l'auto è nel garage", gar.count === 1, String(gar.count));
  ok("il garage mostra che sta caricando", gar.charging === 1);
  ok("l'auto sta dentro il riquadro della mappa", gar.inView);
  // billboarded like the device pins: the 3D transform must not squash it
  ok("l'icona dell'auto non è deformata", gar.iconW >= 40 && gar.iconW <= 54, String(gar.iconW));
  // 62% of the bar, not a full or empty one
  ok("la barra di carica è proporzionale allo stato",
     Math.abs(gar.socW / gar.barW - 0.62) < 0.05, (gar.socW / gar.barW).toFixed(3));
  ok("la targhetta dice nome e percentuale", /Model 3/.test(gar.text) && /62%/.test(gar.text), gar.text);
  // At the garage's own wall height the near wall covered the marker and the
  // name came out half hidden. The fix lifts it into the same band as the room
  // label — the one thing on the map that is known to stay readable — and above
  // the floor's centre line, which is the test the walls themselves use.
  const clear = await page.evaluate(() => {
    const car = document.querySelector(".fp-car");
    const room = car.closest(".fp-room");
    const R = (el) => { const b = el.getBoundingClientRect(); return { t: b.top, b: b.bottom }; };
    const floor = R(room.querySelector(".fp-floor"));
    return { body: R(car.querySelector(".fp-car-body")), tag: R(room.querySelector(".fp-tag")),
      floorMid: (floor.t + floor.b) / 2 };
  });
  ok("l'auto galleggia sopra il pavimento, non dentro il muro",
     clear.body.b < clear.floorMid, Math.round(clear.body.b) + " vs " + Math.round(clear.floorMid));
  ok("l'auto sta nella stessa fascia leggibile del nome della stanza",
     clear.body.t <= clear.tag.b + 60 && clear.body.b >= clear.tag.t - 60,
     Math.round(clear.body.t) + ".." + Math.round(clear.body.b) + " vs " +
     Math.round(clear.tag.t) + ".." + Math.round(clear.tag.b));

  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, ev: true });
  await page.waitForTimeout(700);
  const evc = await page.evaluate(() => {
    const ring = document.querySelector(".ev-ring-arc");
    const car = document.querySelector(".ev-car");
    if (!ring || !car) return null;
    const cs = getComputedStyle(ring);
    const dash = parseFloat(cs.strokeDasharray);
    const off = parseFloat(cs.strokeDashoffset);
    const rows = Array.from(document.querySelectorAll(".ev-row")).map((r) => r.textContent.replace(/\s+/g, " ").trim());
    const box = car.getBoundingClientRect();
    return { pct: 1 - off / dash, rows, w: Math.round(box.width),
      parentW: Math.round(car.parentElement.getBoundingClientRect().width),
      charging: !!document.querySelector(".ev-ring.charging"),
      target: !!document.querySelector(".ev-target b") };
  });
  ok("la card auto disegna l'anello", !!evc);
  // the arc really is 62% of the circle, not a decoration
  ok("l'anello è al 62 per cento", evc && Math.abs(evc.pct - 0.62) < 0.02, evc && evc.pct.toFixed(3));
  ok("l'anello pulsa in carica", evc && evc.charging);
  ok("la tacca dell'obiettivo c'è", evc && evc.target);
  ok("le righe dicono potenza, autonomia, obiettivo e tempo",
     evc && evc.rows.length === 4 && evc.rows.join(" ").includes("312 km")
     && evc.rows.join(" ").includes("1 h 28"), evc && evc.rows.join(" | "));
  ok("la card auto non deborda", evc && evc.w <= evc.parentW + 1);

  // ---- sides of a room ----------------------------------------------------
  console.log("\n== LATI DELLA STANZA ==");
  const balc = await scene({ pageIndex: 1, autoRooms: true, balcony: true });
  const wallInfo = await page.evaluate(() => {
    const rooms = Array.from(document.querySelectorAll(".fp-room"));
    const last = rooms[rooms.length - 1];
    const walls = Array.from(last.querySelectorAll(".fp-wall")).map((w) => {
      const cs = getComputedStyle(w);
      return { cls: w.className, h: Math.round(parseFloat(cs.height)), op: Number(cs.opacity).toFixed(2) };
    });
    const plain = Array.from(rooms[0].querySelectorAll(".fp-wall")).map((w) => Math.round(parseFloat(getComputedStyle(w).height)));
    return { walls, plain };
  });
  // one wall + one glazed + two railings = three drawn sides plus the railing
  // pair; nothing is drawn for an "open" side
  ok("il balcone non ha quattro muri uguali",
     new Set(wallInfo.walls.map((w) => w.cls)).size >= 3,
     wallInfo.walls.map((w) => w.cls).join(" | "));
  ok("la ringhiera è più bassa del muro",
     wallInfo.walls.filter((w) => w.cls.includes("railing")).every((r) =>
       r.h < Math.max(...wallInfo.plain)), JSON.stringify(wallInfo.walls));
  ok("la porta finestra è trasparente",
     wallInfo.walls.filter((w) => w.cls.includes("glass")).every((g) => Number(g.op) < 0.6),
     wallInfo.walls.map((w) => w.op).join());
  ok("il muro pieno resta opaco",
     wallInfo.walls.filter((w) => w.cls === "fp-wall").every((g) => Number(g.op) > 0.9));
  ok("le altre stanze restano a quattro muri pieni", wallInfo.plain.length === 4);

  const openRoom = await page.evaluate(() => {
    const r = window.__EL__._rooms()[0];
    r.walls = ["open", "open", "wall", "wall"];
    window.__EL__._signature = ""; window.__EL__.render();
    return document.querySelector('[data-room="' + r.id + '"]').querySelectorAll(".fp-wall").length;
  });
  ok("un lato aperto non disegna niente", openRoom === 2, String(openRoom));

  // ---- phone: the map has to fit and stay usable at 390px ----------------
  console.log("\n== TELEFONO ==");
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  phone.on("pageerror", (e) => errors.push("PHONE PAGEERROR: " + e.message));
  await phone.goto("http://127.0.0.1:8899/harness.html");
  await phone.waitForFunction("window.__ready === true", { timeout: 15000 });
  await phone.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await phone.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 1, autoRooms: true });
  await phone.waitForTimeout(700);
  await phone.screenshot({ path: path.resolve(__dirname, "50-phone-map.png"), fullPage: false });

  const m = await phone.evaluate(() => {
    const vp = document.querySelector("[data-fp-viewport]").getBoundingClientRect();
    const rooms = Array.from(document.querySelectorAll(".fp-room .fp-floor")).map((f) => {
      const r = f.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
    const hud = document.querySelector(".fp-hud").getBoundingClientRect();
    return {
      vp: { l: Math.round(vp.left), r: Math.round(vp.right), t: Math.round(vp.top), b: Math.round(vp.bottom), w: Math.round(vp.width), h: Math.round(vp.height) },
      rooms, hud: { l: Math.round(hud.left), r: Math.round(hud.right), w: Math.round(hud.width) },
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      touchAction: getComputedStyle(document.querySelector("[data-fp-viewport]")).touchAction,
      zoom: Number(getComputedStyle(document.querySelector("[data-fp-viewport]")).getPropertyValue("--zoom")),
    };
  });
  ok("telefono: la pagina non scrolla in orizzontale", m.docW <= m.winW + 1, m.docW + " vs " + m.winW);
  ok("telefono: il riquadro della mappa sta nello schermo", m.vp.w <= m.winW, m.vp.w + " vs " + m.winW);
  // the whole point of the fit: every room inside the viewport, not one corner
  ok("telefono: tutte le stanze entrano nel riquadro",
     m.rooms.every((r) => r.left >= m.vp.l - 2 && r.right <= m.vp.r + 2 && r.top >= m.vp.t - 2 && r.bottom <= m.vp.b + 2),
     m.rooms.map((r) => `${r.left}..${r.right}`).join(" | ") + "  vp " + m.vp.l + ".." + m.vp.r);
  ok("telefono: la pianta non si riduce a un puntino",
     m.rooms.length && Math.max(...m.rooms.map((r) => r.right - r.left)) > 40,
     String(Math.max(...m.rooms.map((r) => r.right - r.left))));
  ok("telefono: la barra comandi non deborda", m.hud.r <= m.winW + 1 && m.hud.l >= -1, m.hud.l + ".." + m.hud.r);
  const hudRows = await phone.evaluate(() => {
    const tops = Array.from(document.querySelectorAll(".fp-hud .fp-hud-btn"))
      .filter((b) => getComputedStyle(b).display !== "none")
      .map((b) => Math.round(b.getBoundingClientRect().top));
    return { rows: new Set(tops).size, count: tops.length };
  });
  ok("telefono: i comandi stanno su una riga sola", hudRows.rows === 1,
     hudRows.count + " pulsanti su " + hudRows.rows + " righe");
  ok("telefono: il riquadro cattura i gesti", m.touchAction === "none", m.touchAction);
  ok("telefono: lo zoom è stato adattato", m.zoom > 0.29 && m.zoom < 3.01, String(m.zoom));

  // a room must be reachable by finger
  await phone.evaluate(() => window.__EL__._focusRoom(window.__EL__._rooms()[0].id));
  await phone.waitForTimeout(600);
  await phone.screenshot({ path: path.resolve(__dirname, "51-phone-room.png"), fullPage: false });
  const f = await phone.evaluate(() => {
    const bar = document.querySelector(".fp-focus-bar");
    const vp = document.querySelector("[data-fp-viewport]").getBoundingClientRect();
    const spots = Array.from(document.querySelectorAll(".fp-spot-btn")).map((s) => {
      const r = s.getBoundingClientRect();
      return { w: Math.round(r.width), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
    });
    return { bar: !!bar, barW: bar ? Math.round(bar.getBoundingClientRect().width) : 0,
      vpW: Math.round(vp.width), spots };
  });
  ok("telefono: entrando in una stanza compare la barra", f.bar && f.barW <= f.vpW, f.barW + " vs " + f.vpW);
  ok("telefono: le icone dei dispositivi sono toccabili",
     f.spots.length > 0 && f.spots.every((s) => s.w >= 28), f.spots.map((s) => s.w).join());
  const list = await phone.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".fp-dev")).map((r) => {
      const b = r.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height), t: Math.round(b.top), text: r.textContent.trim().slice(0, 30) };
    });
    const tip = document.querySelector(".fp-spot-tip");
    return { rows, tipDisplay: tip ? getComputedStyle(tip).display : "none-el",
      winW: window.innerWidth };
  });
  ok("telefono: sotto la mappa compare l'elenco dei dispositivi", list.rows.length >= 3, String(list.rows.length));
  ok("telefono: le targhette sui pin sono nascoste", list.tipDisplay === "none", list.tipDisplay);
  ok("telefono: l'elenco non deborda", list.rows.every((r) => r.w <= list.winW), list.rows.map((r) => r.w).join());
  ok("telefono: le righe dell'elenco non si sovrappongono",
     list.rows.every((r, i) => i === 0 || r.t >= list.rows[i - 1].t + list.rows[i - 1].h - 1));
  ok("telefono: ogni riga dice nome e valore", list.rows.every((r) => r.text.length > 3));
  await phone.close();

  console.log("\n== SEGUIRE UNA LINEA COL CURSORE ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, trend: true });
  await page.waitForTimeout(1100);

  const plot = await page.evaluate(() => {
    const svg = document.querySelector("[data-trend-svg]");
    if (!svg) return null;
    const b = svg.getBoundingClientRect();
    return { x: Math.round(b.left + b.width * 0.55), y: Math.round(b.top + b.height * 0.5),
      left: Math.round(b.left), top: Math.round(b.top),
      w: Math.round(b.width), h: Math.round(b.height),
      lines: svg.querySelectorAll(".tr-line").length,
      hoverHidden: getComputedStyle(svg.querySelector(".tr-hover")).opacity };
  });
  ok("il grafico è pronto con le sue linee", plot && plot.lines >= 4, JSON.stringify(plot));
  ok("a riposo non c'è nessun indicatore", Number(plot.hoverHidden) === 0, plot.hoverHidden);

  await page.mouse.move(plot.x, plot.y);
  await page.waitForTimeout(200);
  const hov = await page.evaluate(() => {
    const svg = document.querySelector("[data-trend-svg]");
    const lines = Array.from(svg.querySelectorAll(".tr-line")).map((l) => ({
      id: l.getAttribute("data-series"),
      focus: l.classList.contains("focus"), dim: l.classList.contains("dim"),
      w: getComputedStyle(l).strokeWidth, op: Number(getComputedStyle(l).opacity) }));
    const read = document.querySelector("[data-trend-read]");
    const dots = Array.from(svg.querySelectorAll(".tr-pt")).map((c) => ({
      cx: Number(c.getAttribute("cx")), cy: Number(c.getAttribute("cy")) }));
    const cur = svg.querySelector(".tr-cursor");
    const legFocus = Array.from(document.querySelectorAll(".tr-leg.focus")).length;
    return { lines, dots, legFocus,
      cursorX: Number(cur.getAttribute("x1")),
      hoverOpacity: Number(getComputedStyle(svg.querySelector(".tr-hover")).opacity),
      readHidden: read.hidden,
      readText: read.textContent.replace(/\s+/g, " ").trim() };
  });
  ok("una linea sola viene messa a fuoco",
     hov.lines.filter((l) => l.focus).length === 1, JSON.stringify(hov.lines.map((l) => l.focus)));
  ok("le altre si attenuano",
     hov.lines.filter((l) => l.dim).length === hov.lines.length - 1,
     JSON.stringify(hov.lines.map((l) => l.dim)));
  // "un colore più calcato": measurably thicker and measurably more opaque
  const foc = hov.lines.find((l) => l.focus);
  const others = hov.lines.filter((l) => !l.focus);
  ok("quella a fuoco è più marcata delle altre",
     parseFloat(foc.w) > parseFloat(others[0].w) && foc.op > others[0].op,
     foc.w + "/" + foc.op + " vs " + others[0].w + "/" + others[0].op);
  ok("compare la guida verticale sotto il puntatore",
     hov.hoverOpacity === 1 && hov.cursorX > 0, JSON.stringify({ o: hov.hoverOpacity, x: hov.cursorX }));
  ok("c'è un punto di riferimento su ogni linea",
     hov.dots.length >= 4 && hov.dots.every((d) => d.cy > 0), JSON.stringify(hov.dots));
  ok("tutti i punti stanno sullo stesso istante",
     new Set(hov.dots.map((d) => d.cx)).size === 1, JSON.stringify(hov.dots.map((d) => d.cx)));
  ok("la lettura mostra l'ora e i valori",
     !hov.readHidden && /\d{1,2}:\d{2}/.test(hov.readText) && /°C/.test(hov.readText),
     hov.readText.slice(0, 90));
  ok("e la voce di legenda corrispondente si accende", hov.legFocus === 1, String(hov.legFocus));

  // moving to a different height must pick a different line
  const other = await page.evaluate(() => {
    const svg = document.querySelector("[data-trend-svg]");
    return svg.querySelector(".tr-line.focus").getAttribute("data-series");
  });
  await page.mouse.move(plot.x, plot.top + Math.round(plot.h * 0.15));
  await page.waitForTimeout(180);
  const moved = await page.evaluate(() => {
    const f = document.querySelector("[data-trend-svg] .tr-line.focus");
    return { id: f ? f.getAttribute("data-series") : null,
      read: document.querySelector("[data-trend-read]").textContent.replace(/\s+/g, " ").trim() };
  });
  ok("spostandosi in verticale cambia la linea seguita", moved.id && moved.id !== other,
     other + " -> " + moved.id);
  ok("e la lettura si aggiorna", /°C/.test(moved.read), moved.read.slice(0, 60));

  await page.mouse.move(plot.left - 40, plot.top - 40);
  await page.waitForTimeout(200);
  const away = await page.evaluate(() => {
    const svg = document.querySelector("[data-trend-svg]");
    return { focus: svg.querySelectorAll(".tr-line.focus").length,
      dim: svg.querySelectorAll(".tr-line.dim").length,
      hidden: document.querySelector("[data-trend-read]").hidden,
      o: Number(getComputedStyle(svg.querySelector(".tr-hover")).opacity) };
  });
  ok("uscendo dal grafico tutto torna com'era",
     away.focus === 0 && away.dim === 0 && away.hidden && away.o === 0, JSON.stringify(away));

  console.log("\n== METEO: LUOGO E SCALA ==");
  const wx = await page.evaluate(async () => {
    const el = window.__EL__;
    el._hass.config = { location_name: "Casa Oscar", latitude: 45.568022, longitude: 9.765472 };
    el._forecast = el._forecast || {};
    el._forecast["weather.casa_oscar"] = [
      { datetime: "2026-08-24T12:00:00+02:00", condition: "sunny", temperature: 28, templow: 19,
        precipitation: 1.7, precipitation_probability: 20, wind_speed: 11, wind_bearing: 142,
        cloud_coverage: 12 },
      { datetime: "2026-08-25T12:00:00+02:00", condition: "partlycloudy", temperature: 26, templow: 18,
        precipitation: 5.4, precipitation_probability: 60, wind_speed: 18, wind_bearing: 210 },
      { datetime: "2026-08-26T12:00:00+02:00", condition: "rainy", temperature: 23, templow: 17 },
      { datetime: "2026-08-27T12:00:00+02:00", condition: "cloudy", temperature: 29, templow: 22,
        precipitation: 0, wind_speed: 7 },
      { datetime: "2026-08-28T12:00:00+02:00", condition: "sunny", temperature: 30, templow: 23,
        precipitation: 7.2, precipitation_probability: 80, wind_speed: 22, wind_bearing: 15 },
    ];
    el._openOverlay("weather", "weather.casa_oscar");
    await new Promise((r) => setTimeout(r, 400));
    const head = document.querySelector(".ovl-title");
    const svg = document.querySelector(".wxc");
    // value AND vertical position: "the scale is right" means a warmer number
    // sits higher on the chart, not that the labels happen to be sorted.
    const labs = svg ? Array.from(svg.querySelectorAll(".wxc-lab:not(.x)"))
      .map((t) => ({ txt: t.textContent, v: parseFloat(t.textContent), y: Number(t.getAttribute("y")) })) : [];
    const xlabs = svg ? Array.from(svg.querySelectorAll(".wxc-lab.x")).map((t) => t.textContent) : [];
    return { sub: head ? (head.querySelector("small") || {}).textContent : null,
      hasChart: !!svg, labs, xlabs,
      marks: svg ? svg.querySelectorAll(".wxc-mark").length : 0,
      unit: svg ? (svg.querySelector(".wxc-unit") || {}).textContent : null };
  });
  ok("il pannello meteo dice di che luogo parla", /Casa Oscar/.test(wx.sub || ""), wx.sub);
  ok("e mostra le coordinate reali di Home Assistant",
     /45\.568/.test(wx.sub || "") && /9\.765/.test(wx.sub || ""), wx.sub);
  ok("la curva delle prossime ore ha una scala verticale",
     wx.hasChart && wx.labs.length >= 4 && wx.labs.every((l) => /°$/.test(l.txt)),
     wx.labs.map((l) => l.txt).join(" "));
  ok("più caldo sta più in alto",
     wx.labs.length >= 2
     && wx.labs.every((l, i) => i === 0 || (l.v > wx.labs[i - 1].v) === (l.y < wx.labs[i - 1].y)),
     wx.labs.map((l) => l.txt + "@" + l.y).join(" "));
  ok("l'unità è dichiarata", /°/.test(wx.unit || ""), wx.unit);
  ok("ci sono le ore sull'asse orizzontale",
     wx.xlabs.length >= 3 && wx.xlabs.every((l) => /\d{1,2}:\d{2}/.test(l)), wx.xlabs.join(" "));
  ok("massimo e minimo sono etichettati", wx.marks >= 2, String(wx.marks));

  // the same pointer readout as the comparison chart
  const wxBox = await page.evaluate(() => {
    const svg = document.querySelector(".wxc");
    const b = svg.getBoundingClientRect();
    return { x: Math.round(b.left + b.width * 0.4), y: Math.round(b.top + b.height / 2),
      left: Math.round(b.left), top: Math.round(b.top) };
  });
  await page.mouse.move(wxBox.x, wxBox.y);
  await page.waitForTimeout(200);
  const wxHov = await page.evaluate(() => {
    const plot = document.querySelector(".wxc-plot");
    const read = plot.querySelector(".wxc-read");
    const dot = plot.querySelector(".wxc-pt");
    const cur = plot.querySelector(".wxc-cursor");
    return { hovering: plot.classList.contains("hovering"),
      hidden: read.hidden, text: read.textContent.replace(/\s+/g, " ").trim(),
      cx: Number(dot.getAttribute("cx")), cy: Number(dot.getAttribute("cy")),
      curX: Number(cur.getAttribute("x1")),
      o: Number(getComputedStyle(plot.querySelector(".wxc-hover")).opacity) };
  });
  ok("anche sul meteo il puntatore dà il dettaglio",
     wxHov.hovering && !wxHov.hidden && wxHov.o === 1, JSON.stringify(wxHov));
  ok("con ora e temperatura", /\d{1,2}:\d{2}/.test(wxHov.text) && /°/.test(wxHov.text),
     wxHov.text.slice(0, 70));
  ok("e il punto sta sulla curva, sotto la guida",
     wxHov.cy > 0 && Math.abs(wxHov.cx - wxHov.curX) < 0.5,
     JSON.stringify([wxHov.cx, wxHov.curX, wxHov.cy]));
  await page.mouse.move(wxBox.left - 40, wxBox.top - 60);
  await page.waitForTimeout(180);
  ok("e uscendo sparisce", await page.evaluate(() =>
     document.querySelector(".wxc-read").hidden));

  // days must open on the detail the provider actually sent
  const day = await page.evaluate(async () => {
    const rows = Array.from(document.querySelectorAll("[data-wx-day]"));
    const before = document.querySelectorAll(".wxd-day-detail").length;
    rows[1].click();
    await new Promise((r) => setTimeout(r, 250));
    const det = document.querySelector(".wxd-day-detail");
    const facts = det ? Array.from(det.querySelectorAll(".wxd-fact span")).map((x) => x.textContent) : [];
    const open = document.querySelectorAll(".wxd-day-wrap.open").length;
    return { rows: rows.length, before, facts, open };
  });
  ok("i giorni sono apribili", day.rows >= 5 && day.before === 0, JSON.stringify(day.rows));
  ok("aprendone uno compaiono i dettagli di quel giorno",
     day.open === 1 && day.facts.length >= 2, JSON.stringify(day.facts));
  ok("massima e minima sono fra i dettagli",
     day.facts.some((f) => /Massima/i.test(f)) && day.facts.some((f) => /Minima/i.test(f)),
     day.facts.join());
  // a provider that sends fewer fields must not produce a row of dashes
  const sparse = await page.evaluate(async () => {
    document.querySelectorAll("[data-wx-day]")[1].click();
    await new Promise((r) => setTimeout(r, 150));
    document.querySelectorAll("[data-wx-day]")[2].click();
    await new Promise((r) => setTimeout(r, 250));
    const det = document.querySelector(".wxd-day-detail");
    return { facts: Array.from(det.querySelectorAll(".wxd-fact")).map((f) => f.textContent),
      dashes: det.textContent.split("—").length - 1 };
  });
  ok("un giorno con meno dati mostra meno voci, non trattini",
     sparse.facts.length === 2 && sparse.dashes === 0, JSON.stringify(sparse));
  const closed = await page.evaluate(async () => {
    document.querySelectorAll("[data-wx-day]")[2].click();
    await new Promise((r) => setTimeout(r, 250));
    return document.querySelectorAll(".wxd-day-wrap.open").length;
  });
  ok("e si richiudono", closed === 0, String(closed));

  console.log("\n== CONTROLLO TEMPERATURA ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, thermostat: true });
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    const el = window.__EL__;
    window.__svc = [];
    el._hass.callService = (d, s2, data) => { window.__svc.push({ d, s: s2, data }); };
  });

  const th = await page.evaluate(() => {
    const wrap = document.querySelector(".th");
    const man = document.querySelector(".th-manual");
    const units = Array.from(document.querySelectorAll(".th-unit")).map((u) => {
      const r = u.getBoundingClientRect();
      const val = u.querySelector(".th-val strong");
      const range = u.querySelector("[data-thermo-temp]");
      return { top: Math.round(r.top), right: Math.round(r.right), h: Math.round(r.height),
        id: range ? range.getAttribute("data-thermo-temp") : null,
        min: range ? range.min : null, max: range ? range.max : null, step: range ? range.step : null,
        val: val ? val.textContent : null,
        modes: u.querySelectorAll("[data-thermo-mode]").length,
        extras: u.querySelectorAll("[data-thermo-set]").length,
        steppers: Array.from(u.querySelectorAll(".th-step")).map((b) => {
          const bb = b.getBoundingClientRect();
          return Math.min(Math.round(bb.width), Math.round(bb.height));
        }) };
    });
    return { hasWrap: !!wrap, units, winW: window.innerWidth,
      manTop: man ? Math.round(man.getBoundingClientRect().top) : null,
      manText: man ? man.textContent.replace(/\s+/g, " ").trim() : "",
      manOn: man ? man.classList.contains("on") : null,
      scrollW: document.documentElement.scrollWidth };
  });
  ok("la card di controllo esiste con le sue unità", th.hasWrap && th.units.length >= 2,
     String(th.units.length));
  ok("la sospensione automazioni sta sopra le unità",
     th.manTop !== null && th.units.every((u) => u.top >= th.manTop), th.manTop + " vs " + JSON.stringify(th.units.map((u) => u.top)));
  ok("e dice a parole cosa comporta", /automazioni sono attive/i.test(th.manText), th.manText.slice(0, 80));
  ok("con le automazioni attive non è in allarme", th.manOn === false);
  ok("i comandi +/- sono toccabili",
     th.units.every((u) => u.steppers.every((z) => z >= 36)),
     JSON.stringify(th.units.map((u) => u.steppers)));
  ok("niente deborda", th.units.every((u) => u.right <= th.winW + 1) && th.scrollW <= th.winW + 1);

  // the thermostat's own bounds, not a hardcoded range
  const termo = th.units.find((u) => u.id === "climate.termo_test");
  ok("i limiti del termostato vengono dall'unità",
     termo && termo.min === "1" && termo.max === "7" && termo.step === "0.5",
     JSON.stringify(termo));
  const cdz = th.units.find((u) => u.id === "climate.cdz_storm");
  ok("e quelli del condizionatore sono i suoi",
     !!cdz && cdz.min === "8" && cdz.max === "30" && cdz.step === "1", JSON.stringify(cdz));
  // the air conditioner declares fan + preset + swing; the thermostat declares
  // none of them, and must not be given selectors that would do nothing
  ok("il condizionatore mostra i controlli che ha, il termostato no",
     cdz.extras >= 3 && termo.extras === 0, cdz.extras + " vs " + termo.extras);
  ok("e più modalità, perché ne dichiara di più",
     cdz.modes > termo.modes, cdz.modes + " vs " + termo.modes);

  // pressing + must move the number on screen and send exactly one call
  const stepped = await page.evaluate(async () => {
    const el = window.__EL__;
    const before = el._hass.states["climate.termo_test"].attributes.temperature;
    document.querySelector('[data-thermo-step="climate.termo_test|1"]').click();
    await new Promise((r) => setTimeout(r, 120));
    const shown = document.querySelector('[data-thermo-temp="climate.termo_test"]');
    const mid = el._hass.states["climate.termo_test"].attributes.temperature;
    await new Promise((r) => setTimeout(r, 500));
    return { before, mid, shown: shown ? shown.value : null, calls: window.__svc.slice() };
  });
  ok("premere + alza la temperatura del passo dell'unità",
     stepped.mid === stepped.before + 0.5, stepped.before + " -> " + stepped.mid);
  ok("e il cursore segue subito", Number(stepped.shown) === stepped.mid, stepped.shown);
  ok("una sola chiamata a Home Assistant, non una per pixel",
     stepped.calls.length === 1 && stepped.calls[0].s === "set_temperature"
     && stepped.calls[0].data.temperature === stepped.mid, JSON.stringify(stepped.calls));

  // manual mode makes itself unmistakable
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, thermostat: true, manualOn: true });
  await page.waitForTimeout(600);
  const manOn = await page.evaluate(() => {
    const man = document.querySelector(".th-manual");
    return { on: man ? man.classList.contains("on") : false,
      text: man ? man.textContent.replace(/\s+/g, " ").trim() : "",
      border: man ? getComputedStyle(man).borderStyle : "" };
  });
  ok("con le automazioni sospese la riga cambia faccia",
     manOn.on && manOn.border === "solid", JSON.stringify(manOn).slice(0, 120));
  ok("e lo dice senza ambiguità", /NON intervengono/.test(manOn.text), manOn.text.slice(0, 90));

  // Nothing may enter the card from a name guess. "Scale - Override Manuale" is
  // a staircase lighting override; it belongs in the suggestions, never in the
  // card, and a suggestion must be one click away from being accepted.
  const hints = await page.evaluate(async () => {
    const el = window.__EL__;
    el._hass.states["input_boolean.scale_override_manuale"] =
      { entity_id: "input_boolean.scale_override_manuale", state: "off",
        attributes: { friendly_name: "Scale - Override Manuale" } };
    const card = el._sections().flatMap((s2) => s2.items).find((i) => i.type === "thermostat");
    card.manual = [];
    el._editing = true;
    el._selected = { kind: "card", sectionId: el._sections()[0].id, itemId: card.id };
    el._signature = ""; el.render();
    await new Promise((r) => setTimeout(r, 250));
    const rows = Array.from(document.querySelectorAll(".th-man-row"))
      .map((r) => r.textContent.replace(/\s+/g, " ").trim());
    const offered = Array.from(document.querySelectorAll("[data-thermo-man-add]"))
      .map((b) => b.getAttribute("data-thermo-man-add"));
    return { rows, offered, card: card.id };
  });
  ok("nessun interruttore entra nella card da solo", hints.rows.length === 0,
     JSON.stringify(hints.rows));
  ok("ma i candidati sono offerti, quello sbagliato compreso",
     hints.offered.includes("input_boolean.automazioni_cdz_disattivate")
     && hints.offered.includes("input_boolean.scale_override_manuale"),
     hints.offered.join());

  const accepted = await page.evaluate(async () => {
    document.querySelector('[data-thermo-man-add="input_boolean.automazioni_cdz_disattivate"]').click();
    await new Promise((r) => setTimeout(r, 250));
    const el = window.__EL__;
    const card = el._sections().flatMap((s2) => s2.items).find((i) => i.type === "thermostat");
    return { manual: card.manual.slice(),
      rows: document.querySelectorAll(".th-man-row").length,
      stillOffered: !!document.querySelector('[data-thermo-man-add="input_boolean.automazioni_cdz_disattivate"]') };
  });
  ok("accettare un suggerimento basta un clic",
     accepted.manual.length === 1 && accepted.rows === 1, JSON.stringify(accepted));
  ok("e quello accettato esce dai suggerimenti", !accepted.stillOffered);
  ok("l'altro non è mai entrato",
     !accepted.manual.includes("input_boolean.scale_override_manuale"), accepted.manual.join());

  // The editor's search results must use the shared row markup: an invented
  // class name has no CSS at all, and the rows lose their layout entirely —
  // name and entity_id running together on one centred line.
  const results = await page.evaluate(async () => {
    const el = window.__EL__;
    el._entityQuery = "in";
    el._signature = ""; el.render();
    await new Promise((r) => setTimeout(r, 250));
    const rows = Array.from(document.querySelectorAll("[data-thermo-man-add].entity-result-row"));
    if (!rows.length) return { rows: 0 };
    const r0 = rows[0].getBoundingClientRect();
    const strong = rows[0].querySelector(".err-text strong");
    const small = rows[0].querySelector(".err-text small");
    return { rows: rows.length, h: Math.round(r0.h || r0.height),
      align: getComputedStyle(rows[0]).textAlign,
      stacked: strong && small
        ? Math.round(small.getBoundingClientRect().top) > Math.round(strong.getBoundingClientRect().top)
        : false,
      strongDisplay: strong ? getComputedStyle(strong).display : null };
  });
  ok("i risultati della ricerca usano le righe standard", results.rows > 0, JSON.stringify(results));
  ok("nome e id sono incolonnati, non appiccicati", results.stacked, JSON.stringify(results));
  ok("le righe non sono centrate", results.align !== "center", results.align);
  ok("e non sono alte il doppio del necessario", results.h > 0 && results.h <= 60, String(results.h));

  // Order inside the card is the user's: moving a block must move it on screen.
  const ordered = await page.evaluate(async () => {
    const el = window.__EL__;
    el._entityQuery = "";
    const card = el._sections().flatMap((s2) => s2.items).find((i) => i.type === "thermostat");
    card.manual = ["input_boolean.automazioni_cdz_disattivate"];
    card.order = [];
    el._signature = ""; el.render();
    await new Promise((r) => setTimeout(r, 200));
    const before = Array.from(document.querySelectorAll(".th-block"))
      .map((b) => b.classList.contains("manual") ? "manual" : "unit");
    card.order = el._thermoBlocks(card).slice().reverse();
    el._signature = ""; el.render();
    await new Promise((r) => setTimeout(r, 200));
    const after = Array.from(document.querySelectorAll(".th-block"))
      .map((b) => b.classList.contains("manual") ? "manual" : "unit");
    return { before, after };
  });
  ok("di fabbrica la sospensione è il primo blocco",
     ordered.before[0] === "manual", ordered.before.join(">"));
  ok("spostandola finisce davvero in fondo",
     ordered.after[ordered.after.length - 1] === "manual", ordered.after.join(">"));

  const phoneTh = await browser.newPage({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  phoneTh.on("pageerror", (e) => errors.push("PHONE-THERMO: " + e.message));
  await phoneTh.goto("http://127.0.0.1:8899/harness.html");
  await phoneTh.waitForFunction("window.__ready === true", { timeout: 15000 });
  await phoneTh.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await phoneTh.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, thermostat: true });
  await phoneTh.waitForTimeout(700);
  const pth = await phoneTh.evaluate(() => {
    const units = Array.from(document.querySelectorAll(".th-unit")).map((u) => {
      const r = u.getBoundingClientRect();
      return { right: Math.round(r.right), w: Math.round(r.width) };
    });
    const steps = Array.from(document.querySelectorAll(".th-step")).map((b) => {
      const r = b.getBoundingClientRect();
      return Math.min(Math.round(r.width), Math.round(r.height));
    });
    return { units, steps, winW: window.innerWidth, scrollW: document.documentElement.scrollWidth };
  });
  ok("telefono: le unità restano nello schermo",
     pth.units.length >= 2 && pth.units.every((u) => u.right <= pth.winW + 1),
     JSON.stringify(pth.units));
  ok("telefono: i +/- restano toccabili", pth.steps.every((z) => z >= 36), pth.steps.join());
  ok("telefono: nessuno scorrimento orizzontale", pth.scrollW <= pth.winW + 1,
     pth.scrollW + " vs " + pth.winW);
  await phoneTh.close();

  console.log("\n== CONFRONTO DI QUALSIASI GRANDEZZA ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, trendFill: true });
  await page.waitForTimeout(700);

  const tf = await page.evaluate(() => {
    const sel = document.querySelector("[data-trend-fill]");
    const opts = sel ? Array.from(sel.options).map((o) => o.value) : [];
    const labels = sel ? Array.from(sel.options).map((o) => o.textContent.trim()) : [];
    return { opts, labels, has: !!sel };
  });
  ok("il riempimento in blocco esiste ed è una scelta", tf.has && tf.opts.length > 2,
     tf.opts.join());
  ok("offre più tipi, non solo la temperatura",
     tf.opts.filter((o) => o && o !== "__rooms").length >= 2, tf.opts.join());
  ok("i tipi sono scritti in italiano",
     tf.labels.some((l) => /Tensione|Potenza|Temperatura|Corrente/.test(l)), tf.labels.join(" | "));

  // pick a non-temperature class and check the chart really fills with it
  const filled = await page.evaluate(async () => {
    const el = window.__EL__;
    const sel = document.querySelector("[data-trend-fill]");
    const target = Array.from(sel.options)
      .filter((o) => o.value && o.value !== "__rooms" && o.value !== "temperature")
      .filter((o) => (parseInt((o.textContent.match(/(\d+)\s*entit/) || [])[1], 10) || 0) >= 2)
      .map((o) => o.value)[0];
    if (!target) return { skipped: true };
    sel.value = target;
    sel.onchange();
    await new Promise((r) => setTimeout(r, 200));
    const card = el._sections().flatMap((s2) => s2.items).find((i) => i.id === "tfcard");
    return { target, series: (card.series || []).map((r) => r.entity),
      classes: (card.series || []).map((r) => el._hass.states[r.entity].attributes.device_class),
      reset: sel.value };
  });
  ok("scegliendo un tipo l'elenco si riempie davvero",
     !filled.skipped && filled.series.length >= 2, JSON.stringify(filled));
  ok("e si riempie con quel tipo, non con le temperature",
     filled.classes.every((c) => c === filled.target), JSON.stringify(filled.classes));
  ok("il selettore torna a vuoto dopo l'uso", filled.reset === "", filled.reset);

  console.log("\n== CENTRALE DI ALLARME ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, alarm: true });
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    const el = window.__EL__;
    window.__svc = [];
    el._hass.callService = (d, s2, data) => { window.__svc.push({ d, s: s2, data }); };
  });

  const al = await page.evaluate(() => {
    // Scope to ONE alarm card: the page also carries the card autocompose
    // built, and a page-wide selector would count both (and would pick up
    // .control-row from unrelated switch cards).
    const head = document.querySelector(".al-head");
    const cardEl = head ? head.closest("article, .item, .card") || head.parentElement : null;
    const btns = Array.from((cardEl || document).querySelectorAll(".al-btn")).map((b) => {
      const r = b.getBoundingClientRect();
      return { act: b.getAttribute("data-alarm-act"), disabled: b.disabled,
        w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) };
    });
    const grid = (cardEl || document).querySelector(".al-grid");
    const gb = grid ? grid.getBoundingClientRect() : null;
    return { hasSwitch: !!(cardEl && cardEl.querySelector(".switch, .control-row")),
      head: head ? head.textContent.replace(/\s+/g, " ").trim() : null,
      btns, winW: window.innerWidth,
      gridRight: gb ? Math.round(gb.right) : 0,
      panic: !!(cardEl && cardEl.querySelector("[data-alarm-panic]")),
      keypad: !!(cardEl && cardEl.querySelector("[data-alarm-code]")) };
  });
  ok("la centrale non disegna un interruttore", !al.hasSwitch);
  ok("lo stato è scritto in chiaro", /Disarmato/i.test(al.head || ""), al.head);
  ok("ci sono i pulsanti delle modalità reali: in casa, fuori, disarma",
     al.btns.length === 3
     && al.btns.filter((b) => /arm_home|arm_away|disarm/.test(b.act || "")).length === 3,
     al.btns.map((b) => b.act).join(" "));
  ok("il disarmo è disattivato quando è già disarmato",
     al.btns.find((b) => /disarm/.test(b.act || "")).disabled);
  ok("i pulsanti sono grandi abbastanza per un dito",
     al.btns.every((b) => b.h >= 40 && b.w >= 120), al.btns.map((b) => b.w + "x" + b.h).join());
  ok("niente deborda", al.btns.every((b) => b.right <= al.winW + 1) && al.gridRight <= al.winW + 1);
  ok("l'antipanico c'è (la centrale dichiara TRIGGER)", al.panic);
  ok("senza codice richiesto non compare il tastierino", !al.keypad);

  // arming really calls the service, once
  await page.evaluate(() => {
    document.querySelector('[data-alarm-act$="alarm_arm_away"]').click();
  });
  await page.waitForTimeout(150);
  let alOut = await page.evaluate(() => window.__svc.slice());
  ok("armare chiama il servizio giusto una volta sola",
     alOut.length === 1 && alOut[0].d === "alarm_control_panel" && alOut[0].s === "alarm_arm_away",
     JSON.stringify(alOut));

  // the panic button must NOT fire on a plain tap
  await page.evaluate(() => { window.__svc = []; });
  const pb = await page.evaluate(() => {
    const b = document.querySelector("[data-alarm-panic]").getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  });
  await page.mouse.click(pb.x, pb.y);
  await page.waitForTimeout(200);
  alOut = await page.evaluate(() => window.__svc.slice());
  ok("un tocco non fa scattare la sirena", alOut.length === 0, JSON.stringify(alOut));

  // held long enough, it does
  await page.mouse.move(pb.x, pb.y);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForTimeout(200);
  alOut = await page.evaluate(() => window.__svc.slice());
  ok("tenuto premuto invece sì",
     alOut.length === 1 && alOut[0].s === "alarm_trigger", JSON.stringify(alOut));

  // a live alarm has to be unmistakable, and disarm has to be the first thing
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, alarm: true, alarmState: "triggered" });
  await page.waitForTimeout(600);
  const fire = await page.evaluate(() => {
    const head = document.querySelector(".al-head");
    const first = document.querySelector(".al-btn");
    return { fire: head ? head.classList.contains("fire") : false,
      text: head ? head.textContent.replace(/\s+/g, " ").trim() : "",
      firstAct: first ? first.getAttribute("data-alarm-act") : null,
      animated: head ? getComputedStyle(head).animationName : "none" };
  });
  ok("con l'allarme in corso la scheda cambia faccia", fire.fire, JSON.stringify(fire));
  ok("e lo dice a parole", /Allarme in corso/i.test(fire.text), fire.text);
  ok("il primo pulsante è disarma", /alarm_disarm/.test(fire.firstAct || ""), fire.firstAct);
  ok("l'allarme in corso è l'unica cosa che lampeggia",
     fire.animated !== "none", fire.animated);

  const phoneA = await browser.newPage({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  phoneA.on("pageerror", (e) => errors.push("PHONE-ALARM: " + e.message));
  await phoneA.goto("http://127.0.0.1:8899/harness.html");
  await phoneA.waitForFunction("window.__ready === true", { timeout: 15000 });
  await phoneA.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await phoneA.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, alarm: true });
  await phoneA.waitForTimeout(700);
  const pa = await phoneA.evaluate(() => {
    const head = document.querySelector(".al-head");
    const cardEl = head ? head.closest("article, .item, .card") || head.parentElement : document;
    const btns = Array.from(cardEl.querySelectorAll(".al-btn")).map((b) => {
      const r = b.getBoundingClientRect();
      return { top: Math.round(r.top), h: Math.round(r.height), right: Math.round(r.right),
        w: Math.round(r.width) };
    });
    return { btns, winW: window.innerWidth, scrollW: document.documentElement.scrollWidth };
  });
  ok("telefono: i pulsanti restano nello schermo",
     pa.btns.length === 3 && pa.btns.every((b) => b.right <= pa.winW + 1),
     JSON.stringify(pa.btns));
  ok("telefono: non si schiacciano", pa.btns.every((b) => b.h >= 40));
  ok("telefono: nessuno scorrimento orizzontale", pa.scrollW <= pa.winW + 1,
     pa.scrollW + " vs " + pa.winW);
  await phoneA.close();

  console.log("\n== GUARDARE SENZA TOCCARE ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 1, autoRooms: true, focusRoom: true });
  await page.waitForTimeout(600);

  // Instrument the two outcomes at their exit points, so what is measured is
  // what Home Assistant would actually receive.
  await page.evaluate(() => {
    const el = window.__EL__;
    window.__svc = []; window.__info = [];
    el._hass.callService = (d, s2, data) => { window.__svc.push(d + "." + s2 + ":" + (data && data.entity_id)); };
    const real = el.dispatchEvent.bind(el);
    el.dispatchEvent = (ev) => {
      if (ev && ev.type === "hass-more-info") window.__info.push(ev.detail.entityId);
      return real(ev);
    };
  });

  const pin = await page.evaluate(() => {
    const p2 = document.querySelector(".fp-spot-btn[data-fp-badge], .fp-dev-main[data-fp-badge]");
    if (!p2) return null;
    const b = p2.getBoundingClientRect();
    return { id: p2.getAttribute("data-fp-badge"),
      x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  });
  ok("c'è un dispositivo toccabile sulla mappa", !!pin, JSON.stringify(pin));

  // short tap -> the configured action (toggle by default)
  await page.mouse.click(pin.x, pin.y);
  await page.waitForTimeout(150);
  let out = await page.evaluate(() => ({ svc: window.__svc.slice(), info: window.__info.slice() }));
  ok("un tocco breve fa l'azione impostata", out.svc.length === 1 && out.info.length === 0,
     JSON.stringify(out));

  // long press -> the other one. Real pointer events, held for 700 ms.
  await page.evaluate(() => { window.__svc = []; window.__info = []; });
  await page.mouse.move(pin.x, pin.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(150);
  out = await page.evaluate(() => ({ svc: window.__svc.slice(), info: window.__info.slice() }));
  ok("tenendo premuto si aprono i dettagli", out.info.length === 1, JSON.stringify(out));
  // the click that follows the release must not ALSO fire the short action
  ok("il rilascio non esegue anche l'azione breve", out.svc.length === 0, JSON.stringify(out));

  // a press that drags is a pan of the map, not a long press
  await page.evaluate(() => { window.__svc = []; window.__info = []; });
  await page.mouse.move(pin.x, pin.y);
  await page.mouse.down();
  await page.mouse.move(pin.x + 60, pin.y + 40, { steps: 6 });
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(150);
  out = await page.evaluate(() => ({ svc: window.__svc.slice(), info: window.__info.slice() }));
  ok("trascinare non conta come pressione prolungata",
     out.info.length === 0, JSON.stringify(out));

  const alt = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".fp-dev"));
    const withAlt = rows.filter((r) => r.querySelector("[data-fp-badge-alt]"));
    const sizes = withAlt.map((r) => {
      const b = r.querySelector("[data-fp-badge-alt]").getBoundingClientRect();
      const rb = r.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height),
        inside: b.left >= rb.left - 1 && b.right <= rb.right + 1 };
    });
    return { rows: rows.length, withAlt: withAlt.length, sizes };
  });
  ok("le righe comandabili hanno il tasto opposto", alt.withAlt > 0, JSON.stringify(alt));
  ok("il tasto opposto è toccabile e sta nella riga",
     alt.sizes.every((z) => z.w >= 28 && z.h >= 28 && z.inside), JSON.stringify(alt.sizes));
  ok("non tutte le righe ce l'hanno: i sensori no", alt.withAlt < alt.rows,
     alt.withAlt + "/" + alt.rows);

  const phoneT = await browser.newPage({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  phoneT.on("pageerror", (e) => errors.push("PHONE-TAP: " + e.message));
  await phoneT.goto("http://127.0.0.1:8899/harness.html");
  await phoneT.waitForFunction("window.__ready === true", { timeout: 15000 });
  await phoneT.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await phoneT.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 1, autoRooms: true, focusRoom: true });
  await phoneT.waitForTimeout(700);
  const pt = await phoneT.evaluate(() => {
    const alts = Array.from(document.querySelectorAll("[data-fp-badge-alt]")).map((a) => {
      const b = a.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) };
    });
    const rows = Array.from(document.querySelectorAll(".fp-dev")).map((r) => {
      const b = r.getBoundingClientRect();
      return { right: Math.round(b.right), h: Math.round(b.height) };
    });
    return { alts, rows, winW: window.innerWidth, scrollW: document.documentElement.scrollWidth };
  });
  ok("telefono: il tasto opposto resta nello schermo",
     pt.alts.length > 0 && pt.alts.every((a) => a.right <= pt.winW + 1), JSON.stringify(pt.alts));
  ok("telefono: è abbastanza grande per un dito",
     pt.alts.every((a) => a.w >= 28 && a.h >= 28), pt.alts.map((a) => a.w + "x" + a.h).join());
  ok("telefono: le righe non debordano né si schiacciano",
     pt.rows.every((r) => r.right <= pt.winW + 1 && r.h >= 34), JSON.stringify(pt.rows.slice(0, 3)));
  ok("telefono: nessuno scorrimento orizzontale", pt.scrollW <= pt.winW + 1,
     pt.scrollW + " vs " + pt.winW);
  await phoneT.close();

  console.log("\n== AVVISI: LETTI ED ELIMINATI ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, overview: true });
  await page.waitForTimeout(900);

  const nf = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".notif-row")).map((r) => {
      const b = r.getBoundingClientRect();
      const x = r.querySelector(".notif-x");
      const xb = x ? x.getBoundingClientRect() : null;
      return { read: r.classList.contains("read"), unread: r.classList.contains("unread"),
        // the "updates available" row is derived from update.* entities, not a
        // stored alert: it correctly has nothing to delete
        upd: r.classList.contains("upd"),
        w: Math.round(b.width), right: Math.round(b.right), h: Math.round(b.height),
        opacity: Number(getComputedStyle(r).opacity),
        xw: xb ? Math.round(xb.width) : 0, xh: xb ? Math.round(xb.height) : 0,
        xInside: xb ? (xb.right <= b.right + 1 && xb.left >= b.left) : false };
    });
    return { rows, winW: window.innerWidth,
      filters: document.querySelectorAll("[data-notif-filter]").length,
      readAll: !!document.querySelector("[data-notif-readall]"),
      purge: !!document.querySelector("[data-notif-purge]") };
  });
  ok("gli avvisi hanno delle righe", nf.rows.length >= 3, String(nf.rows.length));
  const del = nf.rows.filter((r) => !r.upd);
  ok("ogni avviso porta il suo pulsante di eliminazione",
     del.length >= 3 && del.every((r) => r.xw > 0), del.map((r) => r.xw).join());
  ok("la riga degli aggiornamenti non finge di essere eliminabile",
     nf.rows.filter((r) => r.upd).every((r) => r.xw === 0));
  ok("il pulsante sta dentro la riga, non fuori",
     del.every((r) => r.xInside));
  ok("il letto è visibilmente più spento del da leggere",
     nf.rows.some((r) => r.read) && nf.rows.some((r) => r.unread)
     && Math.max(...nf.rows.filter((r) => r.read).map((r) => r.opacity))
        < Math.min(...nf.rows.filter((r) => r.unread).map((r) => r.opacity)),
     nf.rows.map((r) => (r.read ? "L" : "N") + r.opacity).join());
  ok("nessuna riga deborda", nf.rows.every((r) => r.right <= nf.winW + 1));
  ok("ci sono i due filtri e le azioni di gruppo",
     nf.filters === 2 && nf.readAll && nf.purge,
     nf.filters + "/" + nf.readAll + "/" + nf.purge);

  // Clicking the text toggles read; clicking the cross removes the row. Both
  // must act on the row they are on and no other.
  const acted = await page.evaluate(async () => {
    const before = Array.from(document.querySelectorAll("[data-notif-read]"))
      .map((n) => n.getAttribute("data-notif-read"));
    document.querySelector('[data-notif-read="cy-9"]').click();
    await new Promise((r) => setTimeout(r, 120));
    const nowRead = document.querySelector('[data-notif-read="cy-9"]').getAttribute("data-read");
    document.querySelector('[data-notif-del="cy-8"]').click();
    await new Promise((r) => setTimeout(r, 120));
    const after = Array.from(document.querySelectorAll("[data-notif-read]"))
      .map((n) => n.getAttribute("data-notif-read"));
    return { before, nowRead, after };
  });
  ok("toccare un avviso lo segna come letto", acted.nowRead === "1", acted.nowRead);
  ok("la croce elimina quello giusto e solo quello",
     !acted.after.includes("cy-8") && acted.after.includes("cy-9")
     && acted.after.length === acted.before.length - 1,
     acted.before.join() + " -> " + acted.after.join());

  const phoneN = await browser.newPage({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  phoneN.on("pageerror", (e) => errors.push("PHONE-NOTIF: " + e.message));
  await phoneN.goto("http://127.0.0.1:8899/harness.html");
  await phoneN.waitForFunction("window.__ready === true", { timeout: 15000 });
  await phoneN.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await phoneN.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, overview: true });
  await phoneN.waitForTimeout(900);
  const pn = await phoneN.evaluate(() => {
    const xs = Array.from(document.querySelectorAll(".notif-x")).map((x) => {
      const b = x.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) };
    });
    const bar = document.querySelector(".notif-bar");
    return { xs, winW: window.innerWidth,
      barRight: bar ? Math.round(bar.getBoundingClientRect().right) : 0,
      scrollW: document.documentElement.scrollWidth };
  });
  ok("telefono: le croci restano nello schermo",
     pn.xs.length > 0 && pn.xs.every((x) => x.right <= pn.winW + 1), String(pn.xs.length));
  ok("telefono: le croci sono toccabili", pn.xs.every((x) => x.w >= 20 && x.h >= 20),
     pn.xs.map((x) => x.w + "x" + x.h).join());
  ok("telefono: la barra dei filtri non deborda", pn.barRight <= pn.winW + 1,
     pn.barRight + " vs " + pn.winW);
  ok("telefono: la pagina non scrolla in orizzontale", pn.scrollW <= pn.winW + 1,
     pn.scrollW + " vs " + pn.winW);
  await phoneN.close();

  console.log("\n== GRAFICO CHE SEGUE LE STANZE ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, trend: true, trendSource: "comfort", selectTrend: true });
  await page.waitForTimeout(1200);

  const tr2 = await page.evaluate(() => {
    const svg = document.querySelector(".tr-chart, .trend svg, svg");
    const paths = Array.from(document.querySelectorAll("path.tr-line, .tr-line"));
    const box = svg ? svg.getBoundingClientRect() : null;
    const boxes = paths.map((p) => {
      const b = p.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom),
        left: Math.round(b.left), right: Math.round(b.right),
        stroke: getComputedStyle(p).stroke };
    });
    return { lines: paths.length, boxes,
      svgTop: box ? Math.round(box.top) : null, svgBottom: box ? Math.round(box.bottom) : null,
      svgLeft: box ? Math.round(box.left) : null, svgRight: box ? Math.round(box.right) : null,
      legend: document.querySelectorAll(".tr-leg, .tr-legend span, .tr-dot").length,
      modes: document.querySelectorAll("[data-trend-source]").length,
      manualAdd: document.querySelectorAll("[data-trend-add]").length };
  });
  ok("una linea per stanza, senza elenco scritto a mano", tr2.lines >= 4, String(tr2.lines));
  ok("i colori delle linee sono tutti diversi",
     tr2.boxes.length >= 4 && new Set(tr2.boxes.map((b) => b.stroke)).size === tr2.boxes.length,
     tr2.boxes.map((b) => b.stroke).join(" "));
  // "sono all'interno dello stesso piano cartesiano": every line must live
  // inside the SAME drawing box, not in a chart of its own.
  ok("tutte le linee stanno nello stesso piano cartesiano",
     tr2.boxes.length >= 4 && tr2.boxes.every((b) => b.top >= tr2.svgTop - 1 && b.bottom <= tr2.svgBottom + 1
       && b.left >= tr2.svgLeft - 1 && b.right <= tr2.svgRight + 1),
     JSON.stringify(tr2.boxes.slice(0, 2)));
  ok("le linee si sovrappongono in orizzontale, non sono affiancate",
     tr2.boxes.length >= 4 && tr2.boxes.every((b) => b.right > tr2.boxes[0].left && b.left < tr2.boxes[0].right));
  ok("c'è una legenda con una voce per linea",
     tr2.lines > 0 && tr2.legend >= tr2.lines, tr2.legend + " voci per " + tr2.lines + " linee");
  ok("l'editor mostra le tre modalità", tr2.modes === 3, String(tr2.modes));
  ok("in modalità automatica non si aggiungono linee a mano", tr2.manualAdd === 0);

  // Same card, following a whole device_class instead.
  const cls = await page.evaluate(() => {
    const el = window.__EL__;
    const card = el._sections()[0].items.find((i) => i.type === "trend");
    card.source = "class"; card.device_class = "humidity";
    el._trend = {}; el._signature = ""; el.render();
    return { series: el._trendSeries(card).map((s2) => s2.entity) };
  });
  ok("seguendo una classe il grafico cambia grandezza",
     cls.series.length >= 3 && cls.series.every((id) => /hum/i.test(id)), cls.series.join());

  console.log("\n== TEMPERATURE: ESTERNO E ELENCO A MANO ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, autoCompose: true, comfort: true, selectComfort: true, manualComfort: true });
  await page.waitForTimeout(500);

  const cf = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".cf-room")).map((c) => {
      const b = c.getBoundingClientRect();
      return { name: (c.querySelector(".cf-name") || c.querySelector("strong") || {}).textContent,
        w: Math.round(b.width), right: Math.round(b.right) };
    });
    const rows = Array.from(document.querySelectorAll(".cf-edit-row")).map((r) => {
      const b = r.getBoundingClientRect();
      return { w: Math.round(b.width), right: Math.round(b.right),
        selects: r.querySelectorAll("select").length,
        inputs: r.querySelectorAll("input").length };
    });
    const panel = document.querySelector(".editor, aside, .editor-panel");
    const tempOpts = rows.length
      ? Array.from(document.querySelectorAll('[data-comfort-room$="|temperature"]')[0].options).map((o) => o.value)
      : [];
    return { cards, rows, panelRight: panel ? Math.round(panel.getBoundingClientRect().right) : null,
      winW: window.innerWidth, tempOpts,
      hasAdd: !!document.querySelector("[data-comfort-add]"),
      hasAuto: !!document.querySelector("[data-comfort-auto]") };
  });
  ok("l'elenco a mano ha una riga per stanza", cf.rows.length >= 4, String(cf.rows.length));
  ok("ogni riga ha nome, icona, temperatura e umidità",
     cf.rows.every((r) => r.selects === 2 && r.inputs === 2),
     cf.rows.map((r) => r.selects + "/" + r.inputs).join());
  ok("le righe dell'editor non debordano",
     cf.rows.every((r) => r.w > 100 && r.right <= cf.winW + 1),
     cf.rows.map((r) => r.right).join() + " vs " + cf.winW);
  ok("si può aggiungere e tornare all'automatico", cf.hasAdd && cf.hasAuto);
  ok("il menù propone anche i sensori senza area",
     cf.tempOpts.includes("sensor.temperatura_esterna"), cf.tempOpts.join());
  ok("la temperatura esterna è fra le schede",
     cf.cards.some((c) => /esterna/i.test(c.name || "")), cf.cards.map((c) => c.name).join());
  ok("nessuna scheda temperatura deborda",
     cf.cards.every((c) => c.right <= cf.winW + 1), cf.cards.map((c) => c.right).join());

  console.log("\n== ORDINE DELLE SCHEDE ==");
  await page.goto("http://127.0.0.1:8899/harness.html");
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  await page.evaluate((d) => { window.__DEFAULT = d; }, DEFAULT_DASH);
  await page.evaluate((o) => window.__mount(JSON.parse(JSON.stringify(window.__DEFAULT)), o),
    { pageIndex: 0, editing: true, extraPages: ["Energia", "Luci"],
      manySections: ["Clima", "Sicurezza", "Consumi"] });
  await page.waitForTimeout(400);

  const barGeom = await page.evaluate(() => {
    const nav = document.querySelector("nav.page-tabs");
    const wraps = Array.from(document.querySelectorAll(".page-tab-wrap")).map((w) => {
      const b = w.getBoundingClientRect();
      return { title: (w.querySelector(".page-tab span") || {}).textContent,
        left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top),
        h: Math.round(b.height),
        nudges: w.querySelectorAll(".pt-nudge").length };
    });
    return { navW: nav ? Math.round(nav.getBoundingClientRect().width) : 0,
      bodyW: document.body.clientWidth, wraps };
  });
  ok("ogni pagina ha la sua scheda trascinabile", barGeom.wraps.length === 4,
     String(barGeom.wraps.length));
  ok("la barra non deborda", barGeom.navW <= barGeom.bodyW,
     barGeom.navW + " vs " + barGeom.bodyW);
  ok("le schede sono in fila, non impilate",
     new Set(barGeom.wraps.map((w) => w.top)).size === 1,
     barGeom.wraps.map((w) => w.top).join());
  ok("le schede non si sovrappongono",
     barGeom.wraps.every((w, i) => i === 0 || w.left >= barGeom.wraps[i - 1].right - 1),
     barGeom.wraps.map((w) => w.left + "-" + w.right).join(" "));
  ok("solo la scheda attiva porta le frecce",
     barGeom.wraps[0].nudges === 2 && barGeom.wraps.slice(1).every((w) => w.nudges === 0),
     barGeom.wraps.map((w) => w.nudges).join());
  ok("le frecce sono grandi abbastanza da toccarle",
     await page.evaluate(() => Array.from(document.querySelectorAll(".pt-nudge"))
       .every((n) => n.getBoundingClientRect().width >= 24)));

  // A real HTML5 drag: mouse simulation does not produce dragstart/drop in
  // Chromium via CDP, so the events are dispatched with a genuine DataTransfer.
  const dropped = await page.evaluate(() => {
    const wraps = Array.from(document.querySelectorAll(".page-tab-wrap"));
    const from = wraps[2];                       // "Energia"
    const target = wraps[0];                     // "Dashboard"
    const dt = new DataTransfer();
    const box = target.getBoundingClientRect();
    const fire = (node, type, x) => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, clientX: x,
        clientY: Math.round(box.top + box.height / 2), dataTransfer: dt });
      node.dispatchEvent(ev);
      return ev;
    };
    fire(from, "dragstart", 0);
    const leftHalf = Math.round(box.left + box.width * 0.25);
    const over = fire(target, "dragover", leftHalf);
    const marker = getComputedStyle(target, "::before").backgroundColor;
    const hasBefore = target.classList.contains("drop-before");
    fire(target, "drop", leftHalf);
    return { prevented: over.defaultPrevented, hasBefore, marker,
      order: Array.from(document.querySelectorAll(".page-tab span")).map((s) => s.textContent) };
  });
  ok("la scheda sotto il puntatore accetta il rilascio", dropped.prevented);
  ok("compare il segno di inserimento a sinistra", dropped.hasBefore);
  ok("il segno di inserimento è visibile",
     dropped.marker !== "rgba(0, 0, 0, 0)" && dropped.marker !== "transparent", dropped.marker);
  ok("rilasciare sulla metà sinistra porta la pagina davanti a tutte",
     dropped.order[0] === "Energia", dropped.order.join(">"));
  ok("le altre pagine scalano di uno, nessuna scambiata",
     dropped.order.join(">") === "Energia>Cyborg>Mappa 3D>Luci", dropped.order.join(">"));

  const secDrop = await page.evaluate(() => {
    const el = window.__EL__;
    el._pageIndex = el._dashboard.pages.findIndex((p) => p.title === "Cyborg");
    el._signature = ""; el.render();
    const heads = Array.from(document.querySelectorAll("[data-sec-drag]"));
    const hosts = Array.from(document.querySelectorAll("[data-sec-drop]"));
    if (heads.length < 3) return { heads: heads.length };
    const dt = new DataTransfer();
    const target = hosts[0];
    const box = target.getBoundingClientRect();
    const fire = (node, type, y) => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true,
        clientX: Math.round(box.left + 10), clientY: y, dataTransfer: dt });
      node.dispatchEvent(ev);
      return ev;
    };
    fire(heads[2], "dragstart", 0);
    const topHalf = Math.round(box.top + box.height * 0.25);
    const over = fire(target, "dragover", topHalf);
    const above = target.classList.contains("drop-above");
    fire(target, "drop", topHalf);
    return { heads: heads.length, prevented: over.defaultPrevented, above,
      order: Array.from(document.querySelectorAll(".dash-section h3")).map((h) => h.textContent) };
  });
  ok("l'intestazione di ogni sezione è una maniglia", secDrop.heads === 3, String(secDrop.heads));
  ok("la sezione bersaglio accetta il rilascio", secDrop.prevented);
  ok("compare il segno di inserimento sopra", secDrop.above);
  ok("la sezione trascinata sale in cima",
     secDrop.order.join(">") === "Consumi>Clima>Sicurezza", (secDrop.order || []).join(">"));

  const clean = await page.evaluate(() => {
    const el = window.__EL__;
    el._editing = false; el._signature = ""; el.render();
    return { drags: document.querySelectorAll("[data-page-drag]").length,
      nudges: document.querySelectorAll(".pt-nudge").length,
      secDrags: document.querySelectorAll("[data-sec-drag]").length,
      tabs: document.querySelectorAll("[data-page-tab]").length,
      grab: Array.from(document.querySelectorAll(".sec-head"))
        .every((h) => getComputedStyle(h).cursor !== "grab") };
  });
  ok("fuori modifica niente maniglie di trascinamento",
     clean.drags === 0 && clean.nudges === 0 && clean.secDrags === 0,
     [clean.drags, clean.nudges, clean.secDrags].join());
  ok("fuori modifica le schede restano navigabili", clean.tabs === 4, String(clean.tabs));
  ok("fuori modifica il cursore non promette un trascinamento", clean.grab);

  console.log("\n" + (errors.length ? "ERRORS:\n" + errors.join("\n") : "nessun errore console/pagina"));
  console.log(pass + " passati, " + fail + " falliti");
  await browser.close();
  process.exitCode = fail || errors.length ? 1 : 0;
})();
