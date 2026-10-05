"""Raccolta rifiuti, lato integrazione.

Il punto di questa suite non e' che il codice Python funzioni: e' che funzioni
**come quello JavaScript**. L'avviso della sera prima deve partire anche con
il pannello chiuso, quindi le regole sono valutate in due posti. La stessa
condizione scritta due volte diverge sempre — qui la divergenza si rende
rumorosa facendo leggere a tutte e due lo **stesso campione**,
`tests/fixtures/raccolta.json`: 187 giorni di calendario vero, scritti a mano
dal PDF del gestore e non generati dal codice che devono verificare.
"""
from __future__ import annotations

import datetime
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "custom_components" / "cyborg_dashboard"))

from core import waste  # noqa: E402

PASS = 0
FAIL = 0


def ok(nome: str, cond: bool, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok  " + nome)
    else:
        FAIL += 1
        print("  FAIL " + nome + ("  -> " + str(extra) if extra else ""))


FIX = json.loads((ROOT / "tests" / "fixtures" / "raccolta.json").read_text(encoding="utf-8"))
CARD = FIX["card"]
ATTESO = FIX["atteso"]

print("== 1. IL CALENDARIO VERO, GIORNO PER GIORNO ==")
sbagliati = []
for iso, voluto in ATTESO.items():
    avuto = waste.rifiuti_del_giorno(CARD, datetime.date.fromisoformat(iso))
    if avuto != voluto:
        sbagliati.append(f"{iso}: {avuto} invece di {voluto}")
ok(f"tutti i {len(ATTESO)} giorni del campione tornano",
   not sbagliati, " | ".join(sbagliati[:5]))

print("\n== 2. LE DUE TRAPPOLE ==")
# Il 2026 ha 53 settimane ISO: la 53 e la 1 del 2027 sono entrambe dispari.
# Una cadenza scritta sulla parita' ISO darebbe carta due giovedi di fila.
ok("31/12 carta, 7/1 plastica: l'alternanza regge il cavallo d'anno",
   waste.rifiuti_del_giorno(CARD, datetime.date(2026, 12, 31)) == ["carta"]
   and waste.rifiuti_del_giorno(CARD, datetime.date(2027, 1, 7)) == ["plastica", "vetro"],
   str(waste.rifiuti_del_giorno(CARD, datetime.date(2027, 1, 7))))
ok("e anche la settimana dopo",
   waste.rifiuti_del_giorno(CARD, datetime.date(2027, 1, 14)) == ["carta"])
# Il sabato dell'organico finisce il 12 settembre, non il 30: quest'ultima e'
# la data in cui cambia l'orario del centro di raccolta, scritta sullo stesso
# foglio. Confonderle sbaglia di tre settimane.
ok("l'ultimo sabato dell'organico è il 12 settembre",
   waste.rifiuti_del_giorno(CARD, datetime.date(2026, 9, 12)) == ["organico"]
   and waste.rifiuti_del_giorno(CARD, datetime.date(2026, 9, 19)) == [])

print("\n== 3. CASI LIMITE ==")
ok("una card che non è un dizionario non fa esplodere niente",
   waste.rifiuti_del_giorno("boh", datetime.date(2026, 10, 6)) == [])
ok("senza regole non esce niente",
   waste.rifiuti_del_giorno({"rules": []}, datetime.date(2026, 10, 6)) == [])
# Un'eccezione con lista VUOTA vince sulla regola: "quel giorno niente".
con_ecc = dict(CARD, exceptions={"2026-10-06": [], "2026-10-07": ["carta"]})
ok("un'eccezione vuota annulla il ritiro",
   waste.rifiuti_del_giorno(con_ecc, datetime.date(2026, 10, 6)) == [])
ok("e una con una lista sostituisce la regola invece di sommarsi",
   waste.rifiuti_del_giorno(con_ecc, datetime.date(2026, 10, 7)) == ["carta"])
ok("le altre date restano sulle regole",
   waste.rifiuti_del_giorno(con_ecc, datetime.date(2026, 10, 8)) == ["carta"])
# Degradazione prudente
senza_ancora = {"rules": [{"kinds": ["carta"], "days": [3], "every": 2, "anchor": ""}]}
ok("una cadenza alterna senza data di partenza non salta mai un ritiro",
   all(waste.rifiuti_del_giorno(senza_ancora, datetime.date.fromisoformat(g)) == ["carta"]
       for g in ("2026-07-02", "2026-07-09", "2026-07-16")))
ok("gli estremi della finestra di validità sono compresi",
   waste.regola_scatta({"kinds": ["x"], "days": [0, 1, 2, 3, 4, 5, 6],
                        "from": "2026-07-01", "to": "2026-07-03"}, datetime.date(2026, 7, 1))
   and waste.regola_scatta({"kinds": ["x"], "days": [0, 1, 2, 3, 4, 5, 6],
                            "from": "2026-07-01", "to": "2026-07-03"}, datetime.date(2026, 7, 3)))
ok("e fuori non scatta",
   not waste.regola_scatta({"kinds": ["x"], "days": [0, 1, 2, 3, 4, 5, 6],
                            "from": "2026-07-01", "to": "2026-07-03"}, datetime.date(2026, 7, 4)))

print("\n== 4. L'AVVISO DELLA SERA PRIMA ==")
# Il 5 ottobre 2026 e' un lunedi: domani, martedi, esce l'organico.
a = waste.avviso_di_domani(CARD, datetime.date(2026, 10, 5))
ok("la sera prima di un ritiro c'è un avviso", a is not None)
ok("e nomina il bidone con il suo nome, non con la sigla",
   "organico" in a["titolo"].lower() and "Organico" in waste.etichette(CARD, ["organico"]),
   a["titolo"])
# Il messaggio dice la cosa che cambia il comportamento: non "domani passano"
# ma "stasera devi metterlo fuori". Il foglio del comune dice entro le 06:00.
ok("il messaggio dice di esporlo stasera, non che domani passano",
   "stasera" in a["messaggio"].lower(), a["messaggio"])
ok("e porta la data del ritiro", a["data"] == "2026-10-06")

# La sera prima di un giorno senza ritiri NON si manda niente. "Domani niente"
# tutte le sere e' il modo piu' rapido per far disattivare le notifiche.
ok("la sera prima di un giorno vuoto non si manda niente",
   waste.avviso_di_domani(CARD, datetime.date(2026, 10, 9)) is None)
ok("con l'avviso spento non si manda niente comunque",
   waste.avviso_di_domani(dict(CARD, remind=False), datetime.date(2026, 10, 5)) is None)
# Due bidoni insieme si leggono come una frase, non come un elenco di sigle.
b = waste.avviso_di_domani(CARD, datetime.date(2026, 10, 6))
ok("due bidoni insieme si leggono come una frase",
   b is not None and " e " in b["titolo"], b["titolo"] if b else "")

print("\n== 5. DOVE STA LA CARD ==")
dash = {"pages": [{"sections": [{"id": "s1", "items": [{"id": "c1", "type": "entity"}]}]},
                  {"sections": [{"id": "s9", "items": [
                      {"id": "c8", "type": "waste", "rules": []},
                      {"id": "c9", "type": "shifts"}]}]}]}
trovate = waste.trova_card_raccolta(dash)
ok("si trova la card Raccolta ovunque stia", len(trovate) == 1)
# Il "dove" serve all'avviso: una notifica che nomina un ritiro deve poter
# portare alla card che lo mostra. Senza coordinate il collegamento sarebbe
# una ricerca per somiglianza, cioe' una scommessa.
ok("e si sa su che pagina e in che sezione",
   trovate[0]["page"] == 1 and trovate[0]["section"] == "s9" and trovate[0]["item"] == "c8",
   str(trovate[0]))
ok("una dashboard senza card Raccolta non ne trova", waste.trova_card_raccolta({"pages": []}) == [])
ok("una dashboard malformata non fa esplodere niente", waste.trova_card_raccolta(None) == [])

print("\n" + "=" * 46)
print(f"{PASS} passati, {FAIL} falliti")
sys.exit(1 if FAIL else 0)
