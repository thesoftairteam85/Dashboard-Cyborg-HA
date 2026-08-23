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

  console.log("\n" + (errors.length ? "ERRORS:\n" + errors.join("\n") : "nessun errore console/pagina"));
  console.log(pass + " passati, " + fail + " falliti");
  await browser.close();
  process.exitCode = fail || errors.length ? 1 : 0;
})();
