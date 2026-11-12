/* Kviz — pravljenje kviza za lokaciju: krug 800 m -> opština -> grad, keš po kraju.
   Izvori: OSM pločice (OpenFreeMap), Overture Places, Vikipedija/Wikidata, Open-Meteo, GBIF. Bez Overpass-a. */
(function (K) {
  'use strict';
  const TARGET = 10;
  const CACHE_VER = 'kviz:v8:';
  const CACHE_DAYS = 30;

  // ---------------- Keš (localStorage) ----------------
  // kraj (za „jedan pokušaj dnevno“ i rang-liste) i tačka igrača zaokružena na ~100 m (za keš i seed)
  // ključ po lokalnim imenima (krajKey/gradKey), isti za sve jezike igrača; stari duel linkovi imaju samo kraj/grad
  K.hoodKey = (place) => K.norm(`${place.krajKey || place.kraj || ""}|${place.gradKey || place.grad || ""}`) || `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  K.cityKey = (place) => K.translit(place.gradKey || place.grad || '');
  K.seedKey = (place) => `${K.hoodKey(place)}@${place.lat.toFixed(3)},${place.lon.toFixed(3)}`; // isti za sve jezike
  K.cacheKey = (place) => `${CACHE_VER}${K.lang}:${K.seedKey(place)}`;    // tekstovi zavise od jezika
  K.cacheGet = function (place) {
    try {
      const raw = localStorage.getItem(K.cacheKey(place));
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (!v || !v.questions || v.day !== K.today()) return null; // dnevni kviz: keš važi samo danas
      return v;
    } catch (e) { return null; }
  };
  K.cacheSet = function (place, quiz) {
    try { localStorage.setItem(K.cacheKey(place), JSON.stringify(quiz)); } catch (e) { /* pun ili blokiran */ }
  };

  // ---------------- Wikipedia (sr pa en) ----------------
  async function wikiFor(lat, lon, localR, farMin, farCenters, log) {
    const local = [], far = [];
    await Promise.all(K.wikiLangs().map(async (lang) => {
      try {
        const jobs = [K.wikiGeo(lang, lat, lon, localR, 100).then((r) => local.push(...r))];
        if (farMin) jobs.push(K.wikiGeo(lang, lat, lon, 10000, 200).then((r) => far.push(...r.filter((w) => w.dist > farMin))));
        for (const c of farCenters || []) jobs.push(K.wikiGeo(lang, c[0], c[1], 10000, 60).then((r) => far.push(...r)));
        await Promise.all(jobs);
      } catch (e) { log(`Vikipedija (${lang}) nedostupna: ${e.message}`, 'warn'); }
    }));
    // jezik igrača pre susednih (kod duplikata ostaje članak na jeziku igrača)
    const order = K.wikiLangs();
    const byLangId = (a, b) => (a.lang === b.lang ? a.pageid - b.pageid : order.indexOf(a.lang) - order.indexOf(b.lang));
    local.sort(byLangId); far.sort(byLangId); // stabilan redosled (isti kviz za sve)
    // detalji za lokalne: uvod + Wikidata ID
    await Promise.all(K.wikiLangs().map(async (lang) => {
      // uvodi samo za 60 najbližih (u centru grada ih ima 100+, a više ne treba za pitanja)
      const ids = local.filter((w) => w.lang === lang).sort((a, b) => (a.dist - b.dist) || (a.pageid - b.pageid)).slice(0, 60).map((w) => w.pageid);
      if (!ids.length) return;
      try {
        const det = await K.wikiDetails(lang, ids);
        for (const w of local) if (w.lang === lang && det[w.pageid]) Object.assign(w, det[w.pageid]);
      } catch (e) { log(`Vikipedija detalji (${lang}): ${e.message}`, 'warn'); }
    }));
    for (const w of local.concat(far)) w.url = K.wikiUrl(w.lang, w.title);
    // bez višeznačnih, bez zabranjenih tema
    const ok = (w) => !w.disamb && !K.isBanned(w.title) && !K.isBanned((w.extract || '').slice(0, 200));
    // bez članaka za koje nisu učitani detalji (dalji od 60 najbližih): bez njih ne znamo šta su (npr. naselje)
    const hasDet = new Set(local.filter((w) => w.extract !== undefined).map((w) => w.lang));
    const loc = K.uniqBy(local.filter((w) => ok(w) && (w.extract !== undefined || !hasDet.has(w.lang))), (w) => w.qid || K.norm(w.title));
    const locSet = new Set(loc.map((w) => K.norm(w.title)));
    return {
      local: loc,
      far: K.uniqBy(far.filter((w) => !K.isBanned(w.title) && !locSet.has(K.norm(w.title))), (w) => K.norm(w.title))
    };
  }

  const LIST_RE = /^(lists? of|spisak|popis|liste d|lista d|anexo:|список|категория|kategorija|category:)/i;
  // „Palco, Kansas“, „Krupanj (Srbija)“, „Opština Krupanj“, „Gradska opština Palilula“ → „palco“, „krupanj“, „palilula“
  const placeCore = (s) => K.norm(String(s || '').replace(/\s*\(.*\)\s*$/, '').replace(/,.*$/, ''))
    .replace(/^(gradska opstina|opstina|opcina|grad|city of|municipality of|town of|village of|gemeinde|stadt|commune de|municipio de|gorod|selo)\s+/, '').trim();
  // naselja i opštine (selo, varoš, grad, opština…): članak o celom naselju nije „objekat u kraju“
  const SETTLEMENT_Q = new Set(['Q486972', 'Q532', 'Q3957', 'Q515', 'Q1549591', 'Q5119', 'Q15284', 'Q2039348', 'Q1637706', 'Q747074', 'Q2074737', 'Q3184121', 'Q15127012', 'Q1115575', 'Q56061']);
  const ENERGY_Q = new Set(['Q159719', 'Q15911738', 'Q134447', 'Q194356', 'Q2519363']);

  async function buildStage(stage, shared, log) {
    const { lat, lon } = stage;
    const empty = () => ({ items: [], routes: [] });

    log(`OpenStreetMap: ulice, škole, vrtići, parkovi, spomenici, stajališta i radnje ${stage.label}…`);
    log(`Overture: zanatlije i radnje ${stage.label}…`);
    log('Vikipedija (sr, pa en): članci u blizini…');
    log('GBIF: najčešće zabeležene ptice (samo CC0 i CC BY)…');
    log('Transitous: linije gradskog prevoza na stanicama u kraju…');
    const [osm, ov, wiki, birdData, transit, plantData] = await Promise.all([
      K.osmFromTiles(lat, lon, stage.loadR, stage.inside, stage.farOk)
        .then((r) => { log(`OpenStreetMap: ${r.local.items.length} objekata i ${r.services.filter((s) => s.inside).length} radnji ${stage.label}.`, 'ok'); return r; })
        .catch((e) => { log(`OpenStreetMap pločice: ${e.message}`, 'warn'); return { local: empty(), far: empty(), services: [] }; }),
      K.overturePlaces(lat, lon, stage.ovR)
        .then((r) => { log(`Overture: ${r.length} mesta u okolini.`, 'ok'); return r; })
        .catch((e) => { log(`Overture: ${e.message}`, 'warn'); return []; }),
      wikiFor(lat, lon, stage.wikiR, stage.wikiFar, stage.wikiCenters, log)
        .then((r) => { log(`Vikipedija: ${r.local.length} članaka u kraju.`, 'ok'); return r; }),
      K.birds(lat, lon, stage.gbifR)
        .then((b) => { log(`GBIF: ${b.total} nalaza ptica.`, "ok"); return b; })
        .catch((e) => { log(`GBIF: ${e.message}`, "warn"); return null; }),
      K.transitData(lat, lon, stage.inside, Math.min(stage.radius, 3000))
        .then((r) => { log(`Transitous: ${r.local.length} stanica u kraju sa voznim redom.`, 'ok'); return r; })
        .catch((e) => { log(`Transitous: ${e.message}`, 'warn'); return null; }),
      K.birds(lat, lon, stage.gbifR, { kingdomKey: '6' }) // biljke
        .catch(() => null)
    ]);

    K.birdPrefetch(birdData); K.birdPrefetch(plantData); // imena vrsta paralelno sa Wikidata
    // Wikidata: detalji članaka + „nazvano po“
    if (shared.namedP) await shared.namedP;
    const wdNamed = (shared.wdNamed || []).filter((w) => w.dist <= Math.max(3000, stage.wikiR));
    if (shared.oldestP) await shared.oldestP;
    if (shared.peopleP) await shared.peopleP;
    const ids = wiki.local.map((w) => w.qid).concat((shared.oldest || []).slice(0, 25).map((o) => o.qid))
      .concat((shared.people || []).filter((o) => o.dist <= stage.radius).slice(0, 30).flatMap((o) => [o.qid, o.person])).concat(wdNamed.flatMap((w) => [w.qid, w.named])).filter(Boolean);
    let ents = {};
    if (ids.length) {
      try {
        ents = await K.wikidata([...new Set(ids)].slice(0, 160));
        const more = [];
        for (const w of wiki.local) more.push(...K.wd.items(ents[w.qid], 'P138'));
        const missing = more.filter((q) => !ents[q]);
        if (missing.length) Object.assign(ents, await K.wikidata(missing.slice(0, 50)));
        log('Wikidata: podaci o objektima i imenima.', 'ok');
      } catch (e) { log(`Wikidata: ${e.message}`, 'warn'); }
    }
    // Vikipedija za pitanja: bez energetike, bez spiskova („List of…“), bez članaka o samom naselju/opštini
    // (ime kraja i grada piše iznad kviza, pa bi odgovor bio očigledan) i bez naselja uopšte (imaju stanovništvo)
    const names = [...new Set([...(shared.placeNames || []), stage.areaName].filter(Boolean).map(placeCore))].filter(Boolean);
    // isto ime ili jedno sadrži drugo kao celu reč („Sebeš“ ↔ „Sebeš Ovčanski“)
    const isPlaceName = (c) => !!c && names.some((n) => n === c || n.startsWith(c + ' ') || c.startsWith(n + ' ') || n.endsWith(' ' + c));
    wiki.local = wiki.local.filter((w) => !K.wd.items(ents[w.qid], 'P31').some((q) => ENERGY_Q.has(q)) &&
      !LIST_RE.test(w.title) && !isPlaceName(placeCore(w.title)) && !K.wd.claims(ents[w.qid], 'P1082').length &&
      !K.wd.items(ents[w.qid], 'P31').some((q) => SETTLEMENT_Q.has(q)));

    // pitanja (i slučajnost) tek kad su svi podaci stigli, uvek istim redom
    const birdQs = birdData ? await K.birdQuestions(birdData, stage.gbifLabel).catch(() => []) : [];
    const plantQs = plantData ? await K.birdQuestions(plantData, stage.gbifLabel, 'plants').catch(() => []) : [];
    const services = K.mergeServices(osm.services, ov, stage.inside, lat, lon);
    return [
      ...K.osmQuestions(stage, osm.local, osm.far),
      ...K.serviceQuestions(stage, services),
      ...K.transitQuestions(stage, transit),
      ...K.mapQuestions(stage, osm.local, services),
      ...K.dirQuestions(stage, osm.local),
      ...K.overtureQuestions(stage, ov),
      ...K.oldestQuestions(stage, shared.oldest, ents),
      ...K.streetPeopleQuestions(stage, shared.people, ents),
      ...plantQs,
      ...K.etymQuestions(stage, osm.local, osm.far, wiki.local, ents, wdNamed),
      ...K.wikiQuestions(stage, wiki.local, wiki.far, ents),
      ...birdQs,
      ...shared.questions
    ];
  }

  const fmtR = (r) => (r >= 1000 ? K.unitKm(r / 1000) : K.unitM(r));

  // Krug od r metara
  function circleStage(lat, lon, r, opts) {
    const gap = r + Math.max(700, r * 0.8);
    return {
      key: "r" + r, lat, lon, radius: r, label: K.t('scope.r', { r: fmtR(r) }), title: K.t('scope.title', { r: fmtR(r) }),
      inside: (a, b) => K.dist(lat, lon, a, b) <= r,
      farOk: (a, b, d) => (d != null ? d : K.dist(lat, lon, a, b)) > gap,
      loadR: Math.min(12000, Math.max(3000, r * 2.5)), ovR: Math.min(6000, Math.max(1800, r * 2.2)), far: gap,
      complete: true, ...opts
    };
  }

  // Opština / grad: poligon iz Nominatim-a
  function areaStage(lat, lon, area, key, maxLoad) {
    const [s, n, w, e] = area.bbox;
    const reach = Math.max(...[[s, w], [s, e], [n, w], [n, e]].map(([a, b]) => K.dist(lat, lon, a, b)));
    const loadR = Math.min(maxLoad, reach + 2500);
    const radius = Math.min(reach, maxLoad);
    return {
      key, lat, lon, radius, label: K.t('scope.area', { name: area.name }), title: area.name, areaName: area.name,
      inside: (a, b) => K.inGeo(area.geo, a, b),
      farOk: (a, b) => !K.inGeo(area.geo, a, b),
      loadR, ovR: Math.min(6000, loadR), far: radius + 700,
      wikiR: Math.min(10000, Math.max(1500, radius)), wikiFar: Math.min(10000, radius + 3000),
      gbifR: Math.min(5000, Math.max(1500, radius)), gbifLabel: K.t('scope.area', { name: area.name }),
      // brojanje radnji ima smisla samo ako je ceo poligon učitan iz oba izvora
      complete: reach + 300 < Math.min(6000, loadR)
    };
  }

  // ---------------- Glavna funkcija ----------------
  // place.lat/lon = tačka koju je igrač izabrao. Seed = kraj + tačka (~100 m) + datum.
  K.buildQuiz = async function (place, log = () => {}) {
    const { lat, lon } = place;
    const day = place.day || K.today();
    K.setSeed(`${K.seedKey(place)}|${day}`);

    // Zajedničko za sve krugove: nadmorska visina kraja, „nazvano po“
    const shared = { questions: [], wdNamed: [], placeNames: [place.kraj, place.grad, place.krajKey, place.gradKey] };
    log('Open-Meteo: nadmorska visina tačke…');
    const elevP = K.elevation(lat, lon).then((h) => { shared.elev = h; log(`Open-Meteo: ${Math.round(h)} m nadmorske visine.`, 'ok'); })
      .catch((e) => log(`Open-Meteo: ${e.message}`, 'warn'));
    log('Wikidata: šta je po kome nazvano u kraju…');
    const namedP = K.wdNamedAfter(lat, lon, 3).then((r) => { shared.wdNamed = r; })
      .catch((e) => log(`Wikidata (nazvano po): ${e.message}`, 'warn'));
    shared.namedP = namedP;
    // najstariji objekti u blizini (Wikidata, brzo); ako ne uspe, pitanje se preskače
    shared.oldestP = K.wdOldest(lat, lon, 1).then((r) => { shared.oldest = r; }).catch(() => { shared.oldest = []; });
    // ulice nazvane po ljudima sa godinom rođenja (Wikidata; ima ih uglavnom u većim gradovima Zapadne Evrope)
    shared.peopleP = K.wdStreetPeople(lat, lon, 1).then((r) => { shared.people = r; }).catch(() => { shared.people = []; });
    await elevP;
    if (shared.elev != null) shared.questions.push(...K.elevationQuestions(shared.elev, place.kraj));

    // Kraj = 1 km oko tačke. Ako tu nema 10 dobrih pitanja, kviz se DOPUNJUJE (ne zamenjuje) iz šireg područja,
    // stepenasto i tek kad zatreba: krug 2 km → naselje/grad → opština/okrug → krug 5 km.
    // Pitanja iz užeg kraja uvek ostaju; isti podaci + isti seed po nivou = isti kviz za istu tačku i dan.
    let adminP = null;
    const admin = () => (adminP = adminP || K.adminPolygons(lat, lon).catch(() => []));
    const pickArea = async (kinds) => (await admin()).find((a) => kinds.includes(a.kind));
    const makers = [
      async () => circleStage(lat, lon, 1000, { wikiR: 1000, wikiFar: 3000, gbifR: 1000, gbifLabel: K.t('scope.gbif') }),
      async () => circleStage(lat, lon, 2000, { wikiR: 2000, wikiFar: 5000, gbifR: 2000, gbifLabel: K.t('scope.r', { r: fmtR(2000) }) }),
      async () => { const a = await pickArea(['city']); return a && areaStage(lat, lon, a, 'city', 8000); },
      async () => { const a = await pickArea(['mun']); return a && areaStage(lat, lon, a, 'mun', 10000); },
      async () => circleStage(lat, lon, 5000, { wikiR: 5000, wikiFar: 7000, gbifR: 5000, gbifLabel: K.t('scope.r', { r: fmtR(5000) }) }),
      // poslednja rezerva za mala sela (Palco, Dana…): 10 km, pločice najviše 12 km
      async () => circleStage(lat, lon, 10000, { wikiR: 10000, wikiFar: 0, gbifR: 10000, gbifLabel: K.t('scope.r', { r: fmtR(10000) }) })
    ];

    const notes = [];
    const picked = [];
    const wider = [];
    let first = null;
    const doneKeys = new Set();
    for (let i = 0; i < makers.length && picked.length < TARGET; i++) {
      const st = await makers[i]();
      if (!st || doneKeys.has(st.key)) continue;
      doneKeys.add(st.key);
      if (i > 0) log(`Nedovoljno pitanja (${picked.length}), dopunjujem sa šireg područja: ${st.title}…`, 'warn');
      K.setSeed(`${K.seedKey(place)}|${day}|${st.key}`);
      const cands = await buildStage(st, shared, log);
      K.setSeed(`${K.seedKey(place)}|${day}|izbor|${st.key}`);
      const take = K.selectQuiz(cands, TARGET - picked.length, picked);
      log(`${st.title}: ${cands.length} kandidata, uzeto ${take.length}.`, take.length ? 'ok' : 'warn');
      for (const q of take) q.level = st.key;
      picked.push(...take);
      if (!first) first = st;
      if (i > 0 && take.length) wider.push(st.areaName || st.title);
    }
    if (wider.length) notes.push(K.t('note.expanded', { area: wider.join(', ') }));
    K.setSeed(`${K.seedKey(place)}|${day}|izbor`);
    const questions = K.shuffle(picked);
    if (questions.length < TARGET) notes.push(K.t(questions.length === 1 ? 'note.few1' : 'note.few', { n: questions.length }));
    K.rand = Math.random;

    return {
      created: Date.now(), day,
      place: { via: place.via || 'other', kraj: place.kraj, grad: place.grad, krajKey: place.krajKey || '', gradKey: place.gradKey || '', country: place.country || '', lat, lon },
      scope: first ? first.title : '', scopeKey: first ? first.key : '',
      notes, questions
    };
  };
})(globalThis.Kviz = globalThis.Kviz || {});
