"""Raccolta rifiuti: le regole valutate lato integrazione.

Perche' esiste una SECONDA implementazione
-------------------------------------------
La stessa logica sta gia' nel frontend (`wasteDayKinds`). Duplicarla e' la cosa
che di solito e' giusto rifiutare: la stessa condizione scritta in due posti
diversi diverge sempre.

Qui non si puo' evitare. L'avviso della sera prima deve partire alle 20:00
anche se nessuno ha il pannello aperto, e un browser chiuso non calcola
niente. L'alternativa sarebbe non avere l'avviso, cioe' non avere la funzione.

La divergenza non si evita: si rende RUMOROSA. Le due implementazioni sono
verificate contro lo **stesso campione** — `tests/fixtures/raccolta.json`, che
porta sei mesi di calendario vero giorno per giorno. Se una delle due si
discosta, una delle due suite cade e lo dice. Chi tocca una delle due e non
l'altra se ne accorge subito invece che fra sei mesi.
"""
from __future__ import annotations

import datetime
from typing import Any

#: Lunedi = 0, come `datetime.date.weekday()` e come il frontend. `getDay()`
#: in JavaScript mette la domenica a 0, che in Italia non e' il primo giorno
#: della settimana: la conversione sta nel frontend, qui non serve.


def _giorno(valore: Any) -> datetime.date | None:
    """Una data vera, o None."""
    testo = str(valore or "").strip()
    if len(testo) != 10:
        return None
    try:
        return datetime.date.fromisoformat(testo)
    except ValueError:
        return None


def _settimana(d: datetime.date) -> int:
    """Indice della settimana che contiene la data, contato dal suo lunedi.

    NON la settimana ISO. Il 2026 ha 53 settimane ISO: la 53 e la 1 del 2027
    sono entrambe dispari, quindi una cadenza alterna scritta sulla parita'
    ISO darebbe lo stesso rifiuto due volte di fila a cavallo d'anno e poi
    resterebbe sfasata per sempre. Qui si contano i giorni da un'origine
    unica, che di confini d'anno non ne ha.
    """
    return (d.toordinal() - d.weekday()) // 7


def regola_scatta(regola: Any, d: datetime.date) -> bool:
    """Questa regola produce un ritiro in questa data?"""
    if not isinstance(regola, dict):
        return False
    giorni = regola.get("days")
    if not isinstance(giorni, list) or d.weekday() not in giorni:
        return False
    iso = d.isoformat()
    inizio = str(regola.get("from") or "")
    fine = str(regola.get("to") or "")
    # Confronto fra stringhe ISO: e' lecito perche' il formato e' ordinabile
    # lessicograficamente, ed e' quello che fa anche il frontend. Gli estremi
    # sono compresi: "valida dal 1 luglio" comprende il 1 luglio.
    if inizio and iso < inizio:
        return False
    if fine and iso > fine:
        return False
    try:
        ogni = int(regola.get("every") or 1)
    except (TypeError, ValueError):
        ogni = 1
    if ogni <= 1:
        return True
    ancora = _giorno(regola.get("anchor"))
    # Cadenza alterna senza ancora: non si sa in quale delle due settimane si
    # sta. Si degrada a "ogni settimana", cioe' si espone il bidone piu'
    # spesso del necessario invece di saltare un ritiro. Sbagliare per eccesso
    # costa un viaggio in cortile; per difetto costa il ritiro.
    if ancora is None:
        return True
    return (_settimana(d) - _settimana(ancora)) % ogni == 0


def rifiuti_del_giorno(card: Any, d: datetime.date) -> list[str]:
    """Le sigle dei rifiuti che escono in questa data."""
    if not isinstance(card, dict):
        return []
    iso = d.isoformat()
    eccezioni = card.get("exceptions")
    # Una data presente fra le eccezioni vince SEMPRE sulle regole, anche
    # quando porta una lista vuota: lista vuota vuol dire "quel giorno non si
    # raccoglie niente", ed e' diverso dall'assenza della data, che vuol dire
    # "vale la regola". Due cose diverse, due esiti diversi.
    if isinstance(eccezioni, dict) and iso in eccezioni:
        valore = eccezioni[iso]
        return [str(x) for x in valore if isinstance(x, str)] if isinstance(valore, list) else []
    fuori: list[str] = []
    regole = card.get("rules")
    for regola in regole if isinstance(regole, list) else []:
        if not regola_scatta(regola, d):
            continue
        for sigla in regola.get("kinds") or []:
            if isinstance(sigla, str) and sigla not in fuori:
                fuori.append(sigla)
    return fuori


def etichette(card: Any, sigle: list[str]) -> list[str]:
    """I nomi leggibili dei rifiuti, nell'ordine in cui escono.

    Una sigla che non corrisponde piu' a nessun bidone (perche' il bidone e'
    stato cancellato) si tiene come e': meglio un avviso che dice una parola
    strana di un avviso che tace su un ritiro che c'e' davvero.
    """
    mappa = {}
    for riga in card.get("kinds") or [] if isinstance(card, dict) else []:
        if isinstance(riga, dict) and isinstance(riga.get("k"), str):
            mappa[riga["k"]] = str(riga.get("l") or riga["k"])
    return [mappa.get(s, s) for s in sigle]


def trova_card_raccolta(dashboard: Any) -> list[dict[str, Any]]:
    """Tutte le card Raccolta della dashboard, con dove stanno.

    Il "dove" serve all'avviso: una notifica che nomina un ritiro deve poter
    portare alla card che lo mostra. Senza queste coordinate il collegamento
    sarebbe una ricerca per somiglianza, cioe' una scommessa che ogni tanto
    apre la card sbagliata.
    """
    fuori: list[dict[str, Any]] = []
    pagine = dashboard.get("pages") if isinstance(dashboard, dict) else None
    for i, pagina in enumerate(pagine if isinstance(pagine, list) else []):
        if not isinstance(pagina, dict):
            continue
        for sezione in pagina.get("sections") or []:
            if not isinstance(sezione, dict):
                continue
            for item in sezione.get("items") or []:
                if isinstance(item, dict) and item.get("type") == "waste":
                    fuori.append({
                        "card": item,
                        "page": i,
                        "section": sezione.get("id"),
                        "item": item.get("id"),
                    })
    return fuori


def avviso_di_domani(card: Any, oggi: datetime.date) -> dict[str, Any] | None:
    """Il testo dell'avviso della sera prima, o None se domani non esce nulla.

    None e' un esito legittimo e frequente: nella maggior parte delle sere non
    c'e' niente da esporre, e mandare "domani niente" tutti i giorni e'
    il modo piu' rapido per far disattivare le notifiche.
    """
    if not isinstance(card, dict) or card.get("remind") is False:
        return None
    domani = oggi + datetime.timedelta(days=1)
    sigle = rifiuti_del_giorno(card, domani)
    if not sigle:
        return None
    nomi = etichette(card, sigle)
    return {
        "data": domani.isoformat(),
        "kinds": sigle,
        "titolo": "Domani esce " + " e ".join(nomi).lower(),
        # Il foglio del comune dice che i rifiuti vanno esposti entro le 06:00
        # del giorno del ritiro: l'informazione utile non e' "domani passano",
        # e' "stasera devi metterlo fuori".
        "messaggio": "Da esporre stasera, entro le 6 di domattina.",
    }
