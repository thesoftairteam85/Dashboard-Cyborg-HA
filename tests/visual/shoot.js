const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const DEFAULT_DASH = {
  version: 4, revision: 0, theme: { accent: "#00e5ff", gap: 16, radius: 16 },
  pages: [
    { id: "home", type: "sections", title: "Cyborg", icon: "mdi:hexagon-multiple-outline", sections: [] },
    { id: "map", type: "floorplan", title: "Mappa 3D", icon: "mdi:floor-plan",
      view: { yaw: 32, pitch: 56, zoom: 1, wall_height: 62, show_walls: true, show_labels: true },
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

  console.log("\n" + (errors.length ? "ERRORS:\n" + errors.join("\n") : "nessun errore console/pagina"));
  console.log(pass + " passati, " + fail + " falliti");
  await browser.close();
  process.exitCode = fail || errors.length ? 1 : 0;
})();
