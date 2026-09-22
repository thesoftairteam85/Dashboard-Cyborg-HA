#!/usr/bin/env python3
"""
Coerenza di un rilascio. Gira in locale e in CI, e quando fallisce la release
NON viene pubblicata.

Tre cose che, sbagliate, si scoprono sempre troppo tardi:

1. `CYBORG_BUILD` nel javascript e `version` nel manifest devono combaciare.
   Se divergono, il pannello dichiara in testata una versione che non e'
   quella installata, e la diagnosi di qualunque altro problema parte da un
   dato falso. E' gia' costato un giro.
2. La versione deve avere la sua voce nel CHANGELOG: le note della GitHub
   Release sono una copia di quella voce, e una release senza note e' una
   release che nessuno sa cosa contiene.
3. La voce piu' in alto nel CHANGELOG dev'essere quella della versione
   corrente: un CHANGELOG in cui l'ultima versione non e' in cima e' un
   CHANGELOG che qualcuno leggera' al contrario.
"""
import json
import os
import re
import sys

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RADICE, ".github"))

import estrai_changelog  # noqa: E402

passati = 0
falliti = 0


def ok(nome, condizione, extra=""):
    global passati, falliti
    if condizione:
        passati += 1
        print("  ok  " + nome)
    else:
        falliti += 1
        print("  FAIL " + nome + ("  -> " + str(extra) if extra else ""))


MANIFEST = os.path.join(RADICE, "custom_components", "cyborg_dashboard", "manifest.json")
PANNELLO = os.path.join(RADICE, "custom_components", "cyborg_dashboard", "www", "cyborg-dashboard.js")
CHANGELOG = os.path.join(RADICE, "CHANGELOG.md")

with open(MANIFEST, encoding="utf-8") as fh:
    manifest = json.load(fh)
versione = manifest.get("version", "")

with open(PANNELLO, encoding="utf-8") as fh:
    sorgente = fh.read()
trovato = re.search(r'const CYBORG_BUILD = "([^"]+)"', sorgente)
build = trovato.group(1) if trovato else ""

with open(CHANGELOG, encoding="utf-8") as fh:
    changelog = fh.read()

print("\n== RILASCIO: la versione e' una sola ==")
ok("il manifest dichiara una versione", bool(versione), versione)
ok("il numero e' X.Y.Z", bool(re.match(r"^\d+\.\d+\.\d+$", versione)), versione)
ok("il javascript dichiara la sua", bool(build), build)
ok("e sono la stessa", versione == build, versione + " vs " + build)

voce = estrai_changelog.estrai(changelog, versione)
ok("il CHANGELOG ha la voce di questa versione", bool(voce), versione)
ok("e non e' vuota", len(voce) > 80, str(len(voce)) + " caratteri")
ok("la voce si ferma prima della versione precedente",
   "## [" not in voce, voce[-60:] if voce else "")

prima = re.search(r"^## \[([^\]]+)\]", changelog, re.M)
ok("la versione corrente e' la prima del CHANGELOG",
   bool(prima) and prima.group(1) == versione,
   prima.group(1) if prima else "nessuna voce")

ok("una versione che non esiste non produce note",
   estrai_changelog.estrai(changelog, "99.99.99") == "")

# Il lavoro che fa la CI, fatto anche qui: una release si chiama vX.Y.Z.
ok("il tag della release si costruisce dal manifest, non a mano",
   "v" + versione == "v" + manifest["version"])

print("\n" + "=" * 46)
print("%d passati, %d falliti" % (passati, falliti))
sys.exit(1 if falliti else 0)
