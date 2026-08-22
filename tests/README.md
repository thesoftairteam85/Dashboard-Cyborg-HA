# Test

    python3 tests/schema.test.py       # schema + migrazioni v2->v3->v4
    node    tests/frontend.test.js     # logica pannello (102 asserzioni)
    (cd tests/visual && python3 -m http.server 8899 &) && node tests/visual/shoot.js

`tests/visual/shoot.js` renderizza il pannello in Chromium headless con un
Home Assistant simulato, salva gli screenshot in `tests/visual/*.png` e misura
la geometria della mappa 3D. `tests/visual/panel.js` è una copia del pannello
aggiornata dallo script di test.
