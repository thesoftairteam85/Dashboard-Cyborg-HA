"""Tests for the panel's module URL cache key.

panel.py cannot be imported here (it pulls in homeassistant), so the two
functions under test are lifted out of the real source with ast and executed
verbatim. That keeps the test honest: it fails if the shipped code changes,
and it cannot drift into testing a copy.
"""
from __future__ import annotations

import ast
import hashlib
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "cyborg_dashboard" / "panel.py"

PASS = 0
FAIL = 0


def ok(name: str, cond: bool, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok  " + name)
    else:
        FAIL += 1
        print("  FAIL " + name + ("  -> " + extra if extra else ""))


source = PANEL.read_text(encoding="utf-8")
tree = ast.parse(source)
wanted = {"_cache_key", "_integration_version"}
funcs = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted]
ok("le due funzioni esistono ancora in panel.py", len(funcs) == 2,
   str(sorted(f.name for f in funcs)))


def build(tmp: pathlib.Path):
    """Execute the real function bodies against a throw-away integration dir."""
    ns = {"hashlib": hashlib, "json": __import__("json"), "Path": lambda *a: None}
    module = ast.Module(body=funcs, type_ignores=[])
    ast.fix_missing_locations(module)
    # __file__ inside the functions must resolve to the fake integration dir
    ns["__file__"] = str(tmp / "panel.py")

    ns["Path"] = pathlib.Path
    exec(compile(module, "panel.py", "exec"), ns)  # noqa: S102 - the code under test
    return ns


with tempfile.TemporaryDirectory() as td:
    tmp = pathlib.Path(td)
    (tmp / "www").mkdir()
    (tmp / "manifest.json").write_text('{"version": "1.2.3"}', encoding="utf-8")
    js = tmp / "www" / "cyborg-dashboard.js"
    js.write_text("const A = 1;\n", encoding="utf-8")

    ns = build(tmp)
    first = ns["_cache_key"]()
    ok("la chiave comincia con la versione del manifest",
       first.startswith("1.2.3-"), first)
    ok("e porta un'impronta del file, non la sola versione",
       len(first) == len("1.2.3-") + 10, first)

    ok("stesso file, stessa chiave: nessun download inutile",
       ns["_cache_key"]() == first)

    # the case a version bump alone does not cover: the file changes, the
    # manifest does not
    js.write_text("const A = 2;\n", encoding="utf-8")
    second = ns["_cache_key"]()
    ok("file diverso a parità di versione: chiave diversa", second != first,
       first + " / " + second)
    ok("e la versione resta leggibile nella chiave", second.startswith("1.2.3-"), second)

    # a version bump alone must also move the URL
    (tmp / "manifest.json").write_text('{"version": "1.2.4"}', encoding="utf-8")
    third = ns["_cache_key"]()
    ok("versione diversa a parità di file: chiave diversa", third != second,
       second + " / " + third)

    ok("l'impronta è davvero quella del file spedito",
       third.split("-")[1] == hashlib.sha256(js.read_bytes()).hexdigest()[:10], third)

    # a missing bundle must not take the integration down with it
    js.unlink()
    ok("senza il file la chiave ripiega sulla versione, senza esplodere",
       ns["_cache_key"]() == "1.2.4")

    (tmp / "manifest.json").write_text("{ not json", encoding="utf-8")
    js.write_text("const A = 3;\n", encoding="utf-8")
    ok("manifest illeggibile: chiave di ripiego, sempre senza esplodere",
       ns["_cache_key"]().startswith("0-"), ns["_cache_key"]())

# the URLs actually shipped must use the key, not the bare version
ok("il modulo del pannello usa la chiave",
   'module_url=f"{STATIC_PATH}/cyborg-dashboard.js?v={cache_key}"' in source)
ok("e anche lo script pubblicato su ogni pagina",
   'add_extra_js_url(hass, f"{STATIC_PATH}/cyborg-dashboard.js?v={cache_key}")' in source)
ok("nessuna URL usa ancora la sola versione",
   "cyborg-dashboard.js?v={version}" not in source)
ok("la versione pulita resta quella dichiarata al frontend",
   'config={"version": version}' in source)
ok("il calcolo della chiave non blocca il loop degli eventi",
   "async_add_executor_job(_cache_key)" in source)

print()
print("=" * 46)
print(f"{PASS} passati, {FAIL} falliti")
sys.exit(1 if FAIL else 0)
