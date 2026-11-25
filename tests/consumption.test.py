"""Card «Consumi per dispositivo» (0.77.0), lato schema.

Le costanti esistono due volte, in Python e in JavaScript: la stessa regola
scritta in due posti diverge sempre, quindi qui si leggono anche dal sorgente
del pannello e si confrontano.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "custom_components" / "cyborg_dashboard"))

from core import schema  # noqa: E402

PASS = 0
FAIL = 0


def ok(nome: str, cond: bool, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok  " + nome)
    else:
        FAIL += 1
        print("  FAIL " + nome + ("  -> " + extra if extra else ""))


card = schema.normalize_item({
    "id": "c", "type": "consumption", "total": "sensor.generale", "hours": "72",
    "loads": [
        {"entity": "sensor.a", "name": "A" * 80},
        {"entity": "sensor.a"},
        {"entity": "sensor.generale"},
        {"entity": "nonvalida"},
        "spazzatura",
        *[{"entity": f"sensor.x{i}"} for i in range(20)],
    ],
}, 0)
ok("il generale resta", card["total"] == "sensor.generale")
ok("doppioni, il generale fra i carichi e id non validi via",
   [r["entity"] for r in card["loads"]][:2] == ["sensor.a", "sensor.x0"], str(card["loads"][:3]))
ok("al massimo MAX_CONS_LOADS carichi", len(card["loads"]) == schema.MAX_CONS_LOADS)
ok("nomi tagliati a 60", len(card["loads"][0]["name"]) == 60)
ok("periodo dal testo", card["hours"] == 72)

vuota = schema.normalize_item({"id": "d", "type": "consumption", "hours": 5, "total": 3, "loads": "x"}, 0)
ok("valori assurdi diventano i default",
   vuota["total"] == "" and vuota["loads"] == [] and vuota["hours"] == 24, str(vuota))

js = (ROOT / "custom_components/cyborg_dashboard/www/cyborg-dashboard.js").read_text(encoding="utf8")
m = re.search(r"const MAX_CONS_LOADS = (\d+);", js)
ok("MAX_CONS_LOADS uguale in Python e JavaScript", m and int(m.group(1)) == schema.MAX_CONS_LOADS)
blocco = js[js.index("const CONS_RANGES = ["):js.index("];", js.index("const CONS_RANGES = ["))]
ore = tuple(int(h) for h in re.findall(r"h: (\d+)", blocco))
ok("periodi uguali in Python e JavaScript", ore == schema.CONS_HOURS, str(ore))

print(f"\n{PASS} passati, {FAIL} falliti")
sys.exit(1 if FAIL else 0)
