"""Cyborg Impianti — il registro e la vitalita'.

Si importa `core/fleet.py` con dei finti al posto di Home Assistant, perche'
quello che va verificato qui sono funzioni PURE: la vitalita', la regola della
linea mia, la normalizzazione dello snapshot e la sanificazione degli
identificativi. Nessuna rete, nessun broker, nessun Home Assistant acceso.

Il motivo per cui questa suite esiste: un pannello di monitoraggio che sbaglia
non si limita a essere brutto, dice che una casa sta bene mentre e' giu'.
"""
from __future__ import annotations

import datetime
import pathlib
import sys
import types

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "custom_components" / "cyborg_dashboard"))

# --- finti di Home Assistant, quel tanto che basta a importare il modulo ----
ha = types.ModuleType("homeassistant")
core = types.ModuleType("homeassistant.core")
core.HomeAssistant = object
helpers = types.ModuleType("homeassistant.helpers")
storage = types.ModuleType("homeassistant.helpers.storage")


class _Store:
    def __init__(self, hass, version, key):
        self.version, self.key, self._dati = version, key, None

    async def async_load(self):
        return self._dati

    async def async_save(self, dati):
        self._dati = dati


storage.Store = _Store
sys.modules.update({
    "homeassistant": ha, "homeassistant.core": core,
    "homeassistant.helpers": helpers, "homeassistant.helpers.storage": storage,
})

from core import fleet  # noqa: E402

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


ADESSO = datetime.datetime(2026, 10, 3, 12, 0, 0, tzinfo=datetime.timezone.utc)


def fa(secondi: float) -> str:
    return (ADESSO - datetime.timedelta(seconds=secondi)).isoformat()


print("== 1. VITALITA' ==")
ok("appena visto -> ok", fleet.vitalita(fa(10), ADESSO) == "ok")
ok("due minuti -> ok", fleet.vitalita(fa(120), ADESSO) == "ok")
# I confini si guardano esattamente: una soglia che "piu' o meno" funziona e'
# una soglia che sbaglia proprio nel caso che qualcuno verra' a contestare.
ok("a tre minuti netti non e' piu' ok", fleet.vitalita(fa(180), ADESSO) == "incerto")
ok("mezz'ora meno un secondo e' ancora incerto",
   fleet.vitalita(fa(1799), ADESSO) == "incerto")
ok("a mezz'ora netta e' giu'", fleet.vitalita(fa(1800), ADESSO) == "giu")
ok("un giorno fa e' giu'", fleet.vitalita(fa(86400), ADESSO) == "giu")

# Il quarto stato. Un impianto che pubblica senza dire QUANDO non e' vivo e
# non e' morto: e' configurato male. Contarlo come `ok` sarebbe la bugia piu'
# comoda del pannello, perche' nessuno andrebbe mai a guardarlo.
ok("senza orologio non e' 'ok': e' 'senza orologio'",
   fleet.vitalita(None, ADESSO) == "senza_orologio")
ok("e nemmeno una stringa che non e' un istante",
   fleet.vitalita("boh", ADESSO) == "senza_orologio")
ok("una data impossibile non diventa un istante",
   fleet.vitalita("2026-13-45T00:00:00Z", ADESSO) == "senza_orologio")
# Un sito col fuso sbagliato manda un'ora nel futuro. Non e' piu' vivo del
# vivo, ma soprattutto non deve diventare "giu'" per colpa di un segno meno.
ok("un orologio avanti non rende l'impianto morto",
   fleet.vitalita((ADESSO + datetime.timedelta(minutes=30)).isoformat(), ADESSO) == "ok")
# Un istante senza fuso orario si legge come UTC invece di far esplodere il
# confronto: e' il caso di chi scrive l'ora a mano in un'automazione.
ok("un istante senza fuso vale come UTC, non come errore",
   fleet.vitalita("2026-10-03T11:59:00", ADESSO) == "ok")
ok("la 'Z' finale e' accettata", fleet.vitalita("2026-10-03T11:59:00Z", ADESSO) == "ok")

print("\n== 2. LA LINEA E' MIA? ==")
def giu(secondi):
    return {"vivo": "giu", "visto_alle": fa(secondi)}


def vivo(secondi=10):
    return {"vivo": "ok", "visto_alle": fa(secondi)}


# Dieci su venti caduti nello stesso quarto d'ora: e' la nostra linea.
caduti_insieme = [giu(3600 + i * 20) for i in range(10)] + [vivo() for _ in range(10)]
ok("dieci su venti caduti insieme: il problema è qui",
   fleet.linea_mia(caduti_insieme, ADESSO) is True)

# Gli STESSI dieci, ma caduti in settimane diverse: sono dieci clienti da
# richiamare, non un guasto nostro. E' la meta' che conta meno del QUANDO.
caduti_sparsi = [giu(3600 + i * 86400) for i in range(10)] + [vivo() for _ in range(10)]
ok("gli stessi dieci, caduti in giorni diversi: sono dieci guasti loro",
   fleet.linea_mia(caduti_sparsi, ADESSO) is False)

ok("un impianto solo giù non è mai 'la linea è mia'",
   fleet.linea_mia([giu(3600), vivo(), vivo()], ADESSO) is False)
ok("due su due caduti insieme sì",
   fleet.linea_mia([giu(3600), giu(3620)], ADESSO) is True)
ok("ma due su dieci no: non sono la metà",
   fleet.linea_mia([giu(3600), giu(3620)] + [vivo() for _ in range(8)], ADESSO) is False)
ok("con un impianto solo non si può concludere niente",
   fleet.linea_mia([giu(3600)], ADESSO) is False)
ok("con la lista vuota nemmeno", fleet.linea_mia([], ADESSO) is False)
ok("un elenco che non è un elenco non fa esplodere niente",
   fleet.linea_mia("boh", ADESSO) is False)
# Un caduto senza orologio non si puo' collocare nel tempo: senza sapere
# QUANDO e' caduto non si puo' dire che e' caduto con gli altri.
ok("un caduto senza orologio non fa scattare la regola",
   fleet.linea_mia([{"vivo": "giu", "visto_alle": None}, giu(3600)], ADESSO) is False)
# Esattamente sul confine della finestra: dentro, non fuori.
ok("la finestra è inclusiva: cinque minuti netti contano",
   fleet.linea_mia([giu(3600), giu(3600 + fleet.FINESTRA_LINEA_MIA)], ADESSO) is True)
ok("cinque minuti e un secondo no",
   fleet.linea_mia([giu(3600), giu(3601 + fleet.FINESTRA_LINEA_MIA)], ADESSO) is False)

print("\n== 3. IL REGISTRO ==")
reg = fleet.normalizza_registro({"impianti": [
    {"id": "maria", "nome": "Villa Maria", "cliente": "M. Rossi", "trasporto": "mqtt"},
    {"id": "luigi", "nome": "Luigi", "trasporto": "ha", "ha_url": "https://1.2.3.4:8123/"},
]})
ok("due impianti entrano interi", len(reg["impianti"]) == 2)
ok("la barra finale dell'URL si toglie",
   reg["impianti"][1]["ha_url"] == "https://1.2.3.4:8123", reg["impianti"][1]["ha_url"])
ok("il prefisso MQTT si costruisce da solo",
   reg["impianti"][0]["mqtt_prefix"] == "cyborg/impianti/maria")
ok("un trasporto sconosciuto ripiega su mqtt",
   fleet.normalizza_impianto({"id": "x", "trasporto": "piccione"})["trasporto"] == "mqtt")
ok("senza nome si usa l'identificativo invece di 'None'",
   fleet.normalizza_impianto({"id": "x"})["nome"] == "x")

# I caratteri jolly di MQTT dentro un identificativo non sono un nome brutto:
# `+` e `#` sono wildcard, e un impianto che si chiamasse "casa/#" leggerebbe
# i messaggi di TUTTI gli altri. Si sanifica una volta sola, qui.
ok("un '#' nell'identificativo non diventa un jolly MQTT",
   fleet.normalizza_impianto({"id": "casa/#"})["id"] == "casa",
   fleet.normalizza_impianto({"id": "casa/#"})["id"])
ok("e nemmeno un '+'", "+" not in fleet.normalizza_impianto({"id": "a+b"})["id"])
ok("gli spazi diventano trattini",
   fleet.normalizza_impianto({"id": "Villa Maria"})["id"] == "villa-maria")
ok("un identificativo che resta vuoto scarta l'impianto",
   fleet.normalizza_impianto({"id": "///"}) is None)
ok("una riga che non è un dizionario non entra", fleet.normalizza_impianto("boh") is None)

# Due impianti con lo stesso identificativo renderebbero ambiguo ogni
# messaggio in arrivo sul prefisso: il secondo si scarta.
doppi = fleet.normalizza_registro({"impianti": [
    {"id": "maria", "nome": "Prima"}, {"id": "maria", "nome": "Seconda"}]})
ok("un identificativo doppio non entra due volte",
   len(doppi["impianti"]) == 1 and doppi["impianti"][0]["nome"] == "Prima")
ok("un documento vuoto dà un registro vuoto, non un errore",
   fleet.normalizza_registro(None)["impianti"] == [])
ok("normalizzare due volte non cambia niente",
   fleet.normalizza_registro(reg) == reg)

print("\n== 4. LO SNAPSHOT ==")
s = fleet.normalizza_snapshot({
    "visto_alle": fa(30),
    "allarmi": ["inverter offline", {"gravita": "critico", "testo": "Isolamento", "da": fa(600)}],
    "energia": {"ora_w": "3200", "oggi_kwh": 14.2, "batteria_pct": 88, "spazzatura": 1},
    "previsione": {"oggi_kwh": 18, "domani_kwh": "21.5"},
    "clima": [{"nome": "Soggiorno", "c": "21.4"}],
    "versione": {"ha": "2026.9.2", "aggiornamenti_pendenti": 3},
})
ok("una stringa fra gli allarmi diventa un avviso", s["allarmi"][0]["gravita"] == "avviso")
ok("e la gravità dichiarata si rispetta", s["allarmi"][1]["gravita"] == "critico")
ok("i numeri arrivano anche come stringhe", s["energia"]["ora_w"] == 3200.0)
ok("le chiavi che non conosciamo non entrano", "spazzatura" not in s["energia"])
# Un numero che non sta in piedi NON si mostra affatto. Uno zero al suo posto
# entrerebbe nelle somme e nei grafici come se fosse una misura vera: e' lo
# stesso difetto gia' pagato sullo script delle temperature dei dischi.
rotto = fleet.normalizza_snapshot({"energia": {"ora_w": "boh", "oggi_kwh": 3}})
ok("una lettura illeggibile sparisce invece di diventare zero",
   "ora_w" not in rotto["energia"] and rotto["energia"]["oggi_kwh"] == 3.0)
ok("la previsione si arrotonda a due decimali", s["previsione"]["domani_kwh"] == 21.5)
ok("il clima tiene nome e gradi", s["clima"][0] == {"nome": "Soggiorno", "c": 21.4})
ok("gli aggiornamenti pendenti sono un numero", s["versione"]["aggiornamenti_pendenti"] == 3)
vuoto = fleet.normalizza_snapshot(None)
ok("uno snapshot assente non è 'tutto a posto'", vuoto["vivo"] == "giu")
ok("e non ha un orologio inventato", vuoto["visto_alle"] is None)
# Il campo e' quello scritto dal SITO. Se chi riceve ci mettesse la propria
# ora, al riaggancio dopo un riavvio ogni impianto sembrerebbe appena visto e
# il monitoraggio mentirebbe nel momento in cui serve.
senza_ts = fleet.normalizza_snapshot({"energia": {"ora_w": 1000}})
ok("un messaggio senza ora non ne riceve una da noi", senza_ts["visto_alle"] is None)
ok("e quindi la vitalità lo dichiara senza orologio",
   fleet.vitalita(senza_ts["visto_alle"], ADESSO) == "senza_orologio")
ok("il campo 'ts' è accettato come sinonimo di 'visto_alle'",
   fleet.normalizza_snapshot({"ts": fa(5)})["visto_alle"] is not None)

print("\n" + "=" * 46)
print(f"{PASS} passati, {FAIL} falliti")
sys.exit(1 if FAIL else 0)
