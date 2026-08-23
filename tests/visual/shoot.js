const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

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
  const rc = await page.evaluate(() => {
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
  ok("una card per ogni area", rc.count === 5, String(rc.count));
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

  console.log("\n" + (errors.length ? "ERRORS:\n" + errors.join("\n") : "nessun errore console/pagina"));
  console.log(pass + " passati, " + fail + " falliti");
  await browser.close();
  process.exitCode = fail || errors.length ? 1 : 0;
})();
