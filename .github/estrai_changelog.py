#!/usr/bin/env python3
"""
Estrae dal CHANGELOG.md la voce di UNA versione, per usarla come testo della
GitHub Release.

Perche' non scrivere le note a mano al momento della release: una nota scritta
due volte diverge sempre. Il CHANGELOG e' gia' l'unico posto dove la versione
e' raccontata; la release ne e' una copia automatica, e se la voce manca il
processo si ferma invece di pubblicare una release vuota.

Uso:  python3 .github/estrai_changelog.py 0.60.0 [percorso/CHANGELOG.md]
Esce con 1 e un messaggio su stderr se la voce non c'e'.
"""
import re
import sys


def estrai(testo: str, versione: str) -> str:
    # L'intestazione e' "## [0.60.0] - 2026-09-22". Si cattura tutto fino
    # all'intestazione successiva dello STESSO livello: le sezioni interne
    # ("### Verifiche") devono restare dentro.
    inizio = re.search(r"^## \[" + re.escape(versione) + r"\][^\n]*\n", testo, re.M)
    if not inizio:
        return ""
    resto = testo[inizio.end():]
    fine = re.search(r"^## \[", resto, re.M)
    return (resto[: fine.start()] if fine else resto).strip()


def main(argv):
    if len(argv) < 2:
        print("uso: estrai_changelog.py <versione> [CHANGELOG.md]", file=sys.stderr)
        return 2
    versione = argv[1]
    percorso = argv[2] if len(argv) > 2 else "CHANGELOG.md"
    with open(percorso, encoding="utf-8") as fh:
        corpo = estrai(fh.read(), versione)
    if not corpo:
        print("Nel CHANGELOG non c'e' nessuna voce per la %s." % versione, file=sys.stderr)
        return 1
    sys.stdout.write(corpo + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
