/* Aroundle — klasifikacija pitanja za analitiku (odluka korisnika i Groka, 2026-11-12).
   Svako pitanje dobija tri dimenzije; mogu se kombinovati:
   1) TEMA (7 čitljivih tema za pregled) — glavna + sporedna (npr. „udaljenost do apoteke“ = orijentacija + javne ustanove)
   2) KD 2010 (= EU NACE Rev. 2) šifra delatnosti objekta, sektor + oblast (npr. „G47.73“); null kad pitanje nije o delatnosti
      (ulice, toponimi, teren, orijentacija bez objekta). Napomena: apoteka je KD G (trgovina), verski objekti S 94.91.
   3) VRSTA ZNANJA (predlog Claude-a): šta pitanje meri — imena, brojnost, udaljenost, pravac, preciznost na mapi,
      godine (istorija), godine rođenja (ljudi po kojima su ulice nazvane), opis, prisustvo, najčešća vrsta, brendovi, teren.
   Ništa ovde ne opisuje igrača — samo sadržaj pitanja. */
(function (K) {
  'use strict';
  K.THEMES = ['ulice_toponimija', 'kultura_nasledje', 'javne_ustanove', 'komercijala_zanatstvo', 'saobracaj', 'priroda_teren', 'prostorna_orijentacija'];

  // vrsta objekta → [tema, KD]
  const KIND = {
    // zanati i popravke (S 95/96, F 43, G 45)
    shoemaker: ['komercijala_zanatstvo', 'S95.23'], tailor: ['komercijala_zanatstvo', 'S95.29'], locksmith: ['komercijala_zanatstvo', 'S95.29'],
    appliance: ['komercijala_zanatstvo', 'S95.22'], watches: ['komercijala_zanatstvo', 'S95.25'],
    hairdresser: ['komercijala_zanatstvo', 'S96.02'], beauty: ['komercijala_zanatstvo', 'S96.02'],
    dry_cleaning: ['komercijala_zanatstvo', 'S96.01'], laundry: ['komercijala_zanatstvo', 'S96.01'],
    plumber: ['komercijala_zanatstvo', 'F43.22'], hvac: ['komercijala_zanatstvo', 'F43.22'], electrician: ['komercijala_zanatstvo', 'F43.21'],
    carpenter: ['komercijala_zanatstvo', 'F43.32'], glazier: ['komercijala_zanatstvo', 'F43.34'],
    car_repair: ['komercijala_zanatstvo', 'G45.20'], tyres: ['komercijala_zanatstvo', 'G45.20'],
    // trgovina na malo (G 47)
    supermarket: ['komercijala_zanatstvo', 'G47.11'], greengrocer: ['komercijala_zanatstvo', 'G47.21'], kiosk: ['komercijala_zanatstvo', 'G47.62'],
    marketplace: ['komercijala_zanatstvo', 'G47.81'], paint: ['komercijala_zanatstvo', 'G47.52'], car_parts: ['komercijala_zanatstvo', 'G45.32'],
    photo: ['komercijala_zanatstvo', 'M74.20'], bakery: ['komercijala_zanatstvo', 'G47.24'], butcher: ['komercijala_zanatstvo', 'G47.22'],
    health_food: ['komercijala_zanatstvo', 'G47.29'], fuel: ['komercijala_zanatstvo', 'G47.30'], hardware: ['komercijala_zanatstvo', 'G47.52'],
    florist: ['komercijala_zanatstvo', 'G47.76'], jewelry: ['komercijala_zanatstvo', 'G47.77'], optician: ['komercijala_zanatstvo', 'G47.78'],
    pharmacy: ['javne_ustanove', 'G47.73'], // na tabli uz zdravstvo, a šifra je trgovina (KD)
    // smeštaj i ishrana (I)
    hotel: ['komercijala_zanatstvo', 'I55.10'], fast_food: ['komercijala_zanatstvo', 'I56.10'], ice_cream: ['komercijala_zanatstvo', 'I56.10'],
    restaurant: ['komercijala_zanatstvo', 'I56.10'], cafe: ['komercijala_zanatstvo', 'I56.30'], pub: ['komercijala_zanatstvo', 'I56.30'],
    // finansije (K)
    bank: ['komercijala_zanatstvo', 'K64.19'], atm: ['komercijala_zanatstvo', 'K64.19'], bureau_de_change: ['komercijala_zanatstvo', 'K66.12'],
    // veterina (M)
    vet: ['komercijala_zanatstvo', 'M75.00'],
    // državna uprava (O), obrazovanje (P), zdravstvo (Q)
    townhall: ['javne_ustanove', 'O84.11'], police: ['javne_ustanove', 'O84.24'],
    post_office: ['javne_ustanove', 'H53.10'], // pošta: na tabli uz javne ustanove, šifra je saobraćaj (KD H 53)
    school: ['javne_ustanove', 'P85.20'], kindergarten: ['javne_ustanove', 'P85.10'],
    hospital: ['javne_ustanove', 'Q86.10'], clinic: ['javne_ustanove', 'Q86.21'], dentist: ['javne_ustanove', 'Q86.23'],
    // kultura, zabava, rekreacija (R; bioskop je J 59.14)
    cinema: ['kultura_nasledje', 'J59.14'], theatre: ['kultura_nasledje', 'R90.04'], museum: ['kultura_nasledje', 'R91.02'], library: ['kultura_nasledje', 'R91.01'],
    monument: ['kultura_nasledje', 'R91.03'], church: ['kultura_nasledje', 'S94.91'],
    gym: ['komercijala_zanatstvo', 'R93.13'], kids_play: ['komercijala_zanatstvo', 'R93.29'],
    park: ['priroda_teren', 'R93.29'], playground: ['priroda_teren', 'R93.29'],
    // saobraćaj (H)
    stop: ['saobracaj', 'H49.31'],
    // bez delatnosti
    street: ['ulice_toponimija', null]
  };

  // tip pitanja → [glavna tema (ili null = po objektu), vrste znanja, KD bez objekta]
  const CAT = {
    street: ['ulice_toponimija', ['imena']],
    school: [null, ['imena']], kindergarten: [null, ['imena']], park: [null, ['imena']], monument: [null, ['imena']],
    stop: ['saobracaj', ['imena']],
    transit: ['saobracaj', ['linije'], 'H49.31'],
    svcCount: [null, ['brojnost']], svcMost: [null, ['najcesca_vrsta']], svcHave: [null, ['prisustvo']], svcName: [null, ['imena']],
    svcNear: ['prostorna_orijentacija', ['udaljenost']], svcDist: ['prostorna_orijentacija', ['udaljenost']],
    dir: ['prostorna_orijentacija', ['pravac']], mapPin: ['prostorna_orijentacija', ['preciznost_mape']],
    chain: ['komercijala_zanatstvo', ['brendovi'], 'G47'], cuisine: ['komercijala_zanatstvo', ['najcesca_vrsta'], 'I56.10'],
    wikiNear: ['kultura_nasledje', ['imena']], wikiText: ['kultura_nasledje', ['opis']], wikiYear: ['kultura_nasledje', ['godine']],
    oldest: ['kultura_nasledje', ['godine']],
    etym: ['ulice_toponimija', ['istorija_imena']], streetPeople: ['ulice_toponimija', ['godine_rodjenja']],
    birds: ['priroda_teren', ['vrste_prirode']], plants: ['priroda_teren', ['vrste_prirode']], elev: ['priroda_teren', ['teren']]
  };

  // → { theme, theme2, kd, skills: [] }
  K.classify = function (q) {
    const cat = q.cat || '';
    const c = CAT[cat] || [null, []];
    const kindKey = q.kind || (KIND[cat] ? cat : null);
    const byKind = kindKey && KIND[kindKey] ? KIND[kindKey] : null;
    // bez vrste objekta (npr. stari link izazova): pitanja o radnjama → komercijala, ostalo → kultura
    let theme = c[0] || (byKind && byKind[0]) || (/^svc/.test(cat) ? 'komercijala_zanatstvo' : 'kultura_nasledje');
    let theme2 = null;
    // kombinacija: orijentacija/saobraćaj + tema objekta (npr. „koliko je daleko apoteka“)
    if (c[0] && byKind && byKind[0] !== c[0]) theme2 = byKind[0];
    const kd = (byKind && byKind[1]) || c[2] || null;
    return { theme, theme2, kd, skills: c[1].slice() };
  };
})(globalThis.Kviz = globalThis.Kviz || {});
