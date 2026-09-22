"""Le funzioni pure di websocket.py, senza Home Assistant.

websocket.py non si puo' importare qui (tira dentro homeassistant), quindi le
tre funzioni sotto esame vengono estratte dal sorgente vero con `ast` ed
eseguite verbatim: il test fallisce se il codice spedito cambia, e non puo'
scivolare a testare una copia. Stesso metodo di panel.test.py.
"""
from __future__ import annotations

import ast
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
WS = ROOT / "custom_components" / "cyborg_dashboard" / "websocket.py"

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


source = WS.read_text(encoding="utf-8")
tree = ast.parse(source)
wanted = {"_repo_from_url", "_clean_tag", "_cache_fresh"}
funcs = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted]
consts = [n for n in tree.body if isinstance(n, ast.Assign)
          and any(getattr(t, "id", "") in {"RELEASE_TTL", "RELEASE_TTL_ERRORE"} for t in n.targets)]
ok("le tre funzioni esistono ancora in websocket.py", len(funcs) == 3,
   str(sorted(f.name for f in funcs)))

ns: dict = {"re": __import__("re"), "Any": object}
exec(compile(ast.Module(body=consts + funcs, type_ignores=[]), str(WS), "exec"), ns)
_repo_from_url = ns["_repo_from_url"]
_clean_tag = ns["_clean_tag"]
_cache_fresh = ns["_cache_fresh"]
TTL = ns["RELEASE_TTL"]
TTL_ERR = ns["RELEASE_TTL_ERRORE"]

print("\n== IL REPOSITORY SI LEGGE DAL MANIFEST ==")
ok("da un URL di progetto",
   _repo_from_url("https://github.com/thesoftairteam85/Dashboard-Cyborg-HA")
   == "thesoftairteam85/Dashboard-Cyborg-HA")
ok("anche dall'URL delle issue",
   _repo_from_url("https://github.com/thesoftairteam85/Dashboard-Cyborg-HA/issues")
   == "thesoftairteam85/Dashboard-Cyborg-HA")
ok("il suffisso .git non fa parte del nome",
   _repo_from_url("https://github.com/tizio/Progetto.git") == "tizio/Progetto")
# Chi fa un fork non deve ritrovarsi il pannello che interroga il repository
# di qualcun altro: per questo l'indirizzo si legge e non si scrive nel codice.
ok("un fork interroga il proprio repository",
   _repo_from_url("https://github.com/altrotizio/Dashboard-Cyborg-HA")
   == "altrotizio/Dashboard-Cyborg-HA")
ok("un indirizzo che non e' GitHub non produce niente",
   _repo_from_url("https://gitlab.com/tizio/progetto") == "")
ok("e nemmeno il vuoto o il nulla",
   _repo_from_url("") == "" and _repo_from_url(None) == "")

print("\n== v0.60.0 E 0.60.0 SONO LA STESSA VERSIONE ==")
ok("la v iniziale si toglie", _clean_tag("v0.60.0") == "0.60.0")
ok("la V maiuscola pure", _clean_tag("V1.2.3") == "1.2.3")
ok("un numero resta com'e'", _clean_tag("0.60.0") == "0.60.0")
# Una "v" che non introduce un numero e' parte del nome, non un prefisso.
ok("uno sha non viene mutilato", _clean_tag("c494284") == "c494284")
ok("gli spazi intorno non contano", _clean_tag("  v2.0.0  ") == "2.0.0")
ok("niente diventa stringa vuota", _clean_tag(None) == "")

print("\n== LA CACHE: GLI ERRORI SCADONO MOLTO PRIMA ==")
ok("una risposta appena presa vale", _cache_fresh({"checked": 1000.0, "tag": "1.0.0"}, 1000.0))
ok("e vale ancora poco prima della scadenza",
   _cache_fresh({"checked": 1000.0, "tag": "1.0.0"}, 1000.0 + TTL - 1))
ok("oltre la scadenza si va a richiedere",
   not _cache_fresh({"checked": 1000.0, "tag": "1.0.0"}, 1000.0 + TTL + 1))
# Restare incollati a un guasto di rete per dieci minuti vorrebbe dire dire
# "non lo so" a lungo dopo che la linea e' tornata.
ok("un errore scade molto prima di una risposta buona", TTL_ERR < TTL,
   "%d vs %d" % (TTL_ERR, TTL))
ok("un errore appena preso vale, per non martellare GitHub",
   _cache_fresh({"checked": 1000.0, "error": "giu'"}, 1000.0 + 1))
ok("ma dopo un minuto si riprova",
   not _cache_fresh({"checked": 1000.0, "error": "giu'"}, 1000.0 + TTL_ERR + 1))
ok("una cache che non c'e' non e' fresca",
   not _cache_fresh(None, 1000.0) and not _cache_fresh("boh", 1000.0))
ok("e nemmeno una senza istante", not _cache_fresh({"tag": "1.0.0"}, 1000.0))

print("\n== IL COMANDO E' REGISTRATO ==")
ok("cyborg_dashboard/release e' fra i comandi registrati",
   "_ws_release" in source and "async_register_command(hass, _ws_release)" in source)
ok("e accetta `force` per saltare la cache", 'vol.Optional("force"): bool' in source)

print("\n" + "=" * 46)
print("%d passati, %d falliti" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
