# Aroundle — koliko poznaješ svoj kraj?

Nekomercijalni sajt otvorenog koda. Izabereš bilo koje mesto na svetu, a sajt u pregledaču napravi
10 pitanja o tom kraju: ulice, škole, parkovi, spomenici, majstori i radnje, linije gradskog prevoza,
klima, ptice, istorija. Pitanja prave šabloni u JavaScriptu (bez AI), i to samo kad je odgovor stvarno nađen u izvoru.

- **Pokaži na mapi**: klikneš gde misliš da je objekat.
- **Duel sa komšijom**: ista pitanja idu u link (#duel=…), bez servera.
- Pitanja: ulice, škole, vrtići, parkovi, spomenici, stajališta i linije, majstori i radnje (koliko ih ima, šta je najbliže), „po kome je nazvano“, Vikipedija, ptice, nadmorska visina, strana sveta, pokaži na mapi.
- Statičan sajt (HTML/CSS/JS), bez build koraka i bez ključeva.
- Jezici: srpski, hrvatski, bosanski, engleski, nemački, francuski, španski i ruski (po jeziku pregledača, uz ručni izbor). Novi jezik = jedan fajl u `js/lang/`, sa istim ključevima kao `sr.js`.

## Izvori podataka i licence

| Izvor | Šta | Licenca |
|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) preko [OpenFreeMap](https://openfreemap.org/) pločica | ulice, škole, parkovi, radnje | ODbL |
| [Overture Maps](https://overturemaps.org/) Places | zanatlije i radnje | CDLA Permissive 2.0 |
| [Transitous](https://transitous.org/sources/) | linije gradskog prevoza (GTFS) | po izvorima prevoznika |
| [Wikipedia](https://www.wikipedia.org/) / [Wikidata](https://www.wikidata.org/) | članci, godine, „nazvano po“ | CC BY-SA / CC0 |
| [Open-Meteo](https://open-meteo.com/) | klima 1991–2020 | CC BY 4.0 |
| [GBIF](https://www.gbif.org/) | ptice (samo CC0 i CC BY zapisi) | CC0 / CC BY |
| [Nominatim](https://nominatim.org/) | pretraga mesta, granice opština | ODbL |

## Pokretanje lokalno

Bilo koji statički server u ovom folderu, npr. `python -m http.server`, pa otvori `http://localhost:8000`.

## Licenca

Kod: [MIT](LICENSE). Podaci pripadaju svojim izvorima (tabela iznad).
Pitanja i predlozi: [GitHub Issues](https://github.com/podsmokvom/aroundle/issues).

## Ime i logo

Ime **Aroundle**, oznaka **KHM?** i logo (devojka koja upitno kašljuca, `assets/logo.svg`) **nisu** pod MIT licencom.
Sva prava zadržana © 2026 YT3MD. Kod slobodno koristi po MIT licenci, ali svoj sajt nazovi drugačije i koristi svoj logo.
