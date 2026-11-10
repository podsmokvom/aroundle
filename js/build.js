/* Kviz — pravljenje kviza za lokaciju: krug 800 m -> opština -> grad, keš po kraju.
   Izvori: OSM pločice (OpenFreeMap), Overture Places, Vikipedija/Wikidata, Open-Meteo, GBIF. Bez Overpass-a. */
(function (K) {
  'use strict';
  const TARGET = 10;
  const CACHE_VER = 'kviz:v4:';
  const CACHE_DAYS = 30;

  // ---------------- Keš (localStorage) ----------------
  // kraj (za „jedan pokušaj dnevno“ i rang-liste) i tačka igrača zaokružena na ~100 m (za keš i seed)
  K.hoodKey = (place) => K.norm(`${place.kraj || ""}|${place.grad || ""}`) || `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  K.cacheKey = (place) => `${CACHE_VER}${K.hoodKey(place)}@${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
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
    await Promise.all(['sr', 'en'].map(async (lang) => {
      try {
        const jobs = [K.wikiGeo(lang, lat, lon, localR, 100).then((r) => local.push(...r))];
        if (farMin) jobs.push(K.wikiGeo(lang, lat, lon, 10000, 200).then((r) => far.push(...r.filter((w) => w.dist > farMin))));
        for (const c of farCenters || []) jobs.push(K.wikiGeo(lang, c[0], c[1], 10000, 60).then((r) => far.push(...r)));
        await Promise.all(jobs);
      } catch (e) { log(`Vikipedija (${lang}) nedostupna: ${e.message}`, 'warn'); }
    }));
    // sr pre en (kod duplikata ostaje srpski članak)
    const byLangId = (a, b) => (a.lang === b.lang ? a.pageid - b.pageid : a.lang === 'sr' ? -1 : 1);
    local.sort(byLangId); far.sort(byLangId); // stabilan redosled (isti kviz za sve)
    // detalji za lokalne: uvod + Wikidata ID
    await Promise.all(['sr', 'en'].map(async (lang) => {
      const ids = local.filter((w) => w.lang === lang).map((w) => w.pageid);
      if (!ids.length) return;
      try {
        const det = await K.wikiDetails(lang, ids);
        for (const w of local) if (w.lang === lang && det[w.pageid]) Object.assign(w, det[w.pageid]);
      } catch (e) { log(`Vikipedija detalji (${lang}): ${e.message}`, 'warn'); }
    }));
    for (const w of local.concat(far)) w.url = K.wikiUrl(w.lang, w.title);
    // bez višeznačnih, bez zabranjenih tema
    const ok = (w) => !w.disamb && !K.isBanned(w.title) && !K.isBanned((w.extract || '').slice(0, 200));
    const loc = K.uniqBy(local.filter(ok), (w) => w.qid || K.norm(w.title));
    const locSet = new Set(loc.map((w) => K.norm(w.title)));
    return {
      local: loc,
      far: K.uniqBy(far.filter((w) => !K.isBanned(w.title) && !locSet.has(K.norm(w.title))), (w) => K.norm(w.title))
    };
  }

  const ENERGY_Q = new Set(['Q159719', 'Q15911738', 'Q134447', 'Q194356', 'Q2519363']);

  async function buildStage(stage, shared, log) {
    const { lat, lon } = stage;
    const empty = () => ({ items: [], routes: [] });

    log(`OpenStreetMap: ulice, škole, vrtići, parkovi, spomenici, stajališta i radnje ${stage.label}…`);
    log(`Overture: zanatlije i radnje ${stage.label}…`);
    log('Vikipedija (sr, pa en): članci u blizini…');
    log('GBIF: najčešće zabeležene ptice (samo CC0 i CC BY)…');
    log('Transitous: linije gradskog prevoza na stanicama u kraju…');
    const [osm, ov, wiki, birdData, transit] = await Promise.all([
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
        .catch((e) => { log(`Transitous: ${e.message}`, 'warn'); return null; })
    ]);

    // Wikidata: detalji članaka + „nazvano po“
    if (shared.namedP) await shared.namedP;
    const wdNamed = (shared.wdNamed || []).filter((w) => w.dist <= Math.max(3000, stage.wikiR));
    const ids = wiki.local.map((w) => w.qid).concat(wdNamed.flatMap((w) => [w.qid, w.named])).filter(Boolean);
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
    wiki.local = wiki.local.filter((w) => !K.wd.items(ents[w.qid], 'P31').some((q) => ENERGY_Q.has(q)));

    // pitanja (i slučajnost) tek kad su svi podaci stigli, uvek istim redom
    const birdQs = birdData ? await K.birdQuestions(birdData, stage.gbifLabel).catch(() => []) : [];
    const services = K.mergeServices(osm.services, ov, stage.inside, lat, lon);
    return [
      ...K.osmQuestions(stage, osm.local, osm.far),
      ...K.serviceQuestions(stage, services),
      ...K.transitQuestions(stage, transit),
      ...K.mapQuestions(stage, osm.local, services),
      ...K.etymQuestions(stage, osm.local, osm.far, wiki.local, ents, wdNamed),
      ...K.wikiQuestions(stage, wiki.local, wiki.far, ents),
      ...birdQs,
      ...shared.questions
    ];
  }

  const fmtR = (r) => (r >= 1000 ? K.fmtNum(r / 1000, 0) + ' km' : r + ' m');

  // Krug od r metara
  function circleStage(lat, lon, r, opts) {
    const gap = r + Math.max(700, r * 0.8);
    return {
      key: "r" + r, lat, lon, radius: r, label: `u kraju (${fmtR(r)} oko tebe)`, title: `krug od ${fmtR(r)}`,
      inside: (a, b) => K.dist(lat, lon, a, b) <= r,
      farOk: (a, b, d) => (d != null ? d : K.dist(lat, lon, a, b)) > gap,
      loadR: Math.max(3000, r * 2.5), ovR: Math.min(6000, Math.max(1800, r * 2.2)), far: gap,
      complete: true, ...opts
    };
  }

  // Opština / grad: poligon iz Nominatim-a
  function areaStage(lat, lon, area, key, maxLoad) {
    const [s, n, w, e] = area.bbox;
    const reach = Math.max(...[[s, w], [s, e], [n, w], [n, e]].map(([a, b]) => K.dist(lat, lon, a, b)));
    const loadR = Math.min(maxLoad, reach + 2500);
    return {
      key, lat, lon, radius: Math.min(reach, maxLoad), label: `na području: ${area.name}`, title: area.name,
      inside: (a, b) => K.inGeo(area.geo, a, b),
      farOk: (a, b) => !K.inGeo(area.geo, a, b),
      loadR, ovR: Math.min(6000, loadR),
      // brojanje radnji ima smisla samo ako je ceo poligon učitan iz oba izvora
      complete: reach + 300 < Math.min(6000, loadR)
    };
  }

  // ---------------- Glavna funkcija ----------------
  // place.lat/lon = tačka koju je igrač izabrao. Seed = kraj + tačka (~100 m) + datum.
  K.buildQuiz = async function (place, log = () => {}) {
    const { lat, lon } = place;
    const day = place.day || K.today();
    K.setSeed(`${K.cacheKey(place)}|${day}`);

    // Zajedničko za sve krugove: nadmorska visina kraja, „nazvano po“
    const shared = { questions: [], wdNamed: [] };
    log('Open-Meteo: nadmorska visina tačke…');
    const elevP = K.elevation(lat, lon).then((h) => { shared.elev = h; log(`Open-Meteo: ${Math.round(h)} m nadmorske visine.`, 'ok'); })
      .catch((e) => log(`Open-Meteo: ${e.message}`, 'warn'));
    log('Wikidata: šta je po kome nazvano u kraju…');
    const namedP = K.wdNamedAfter(lat, lon, 3).then((r) => { shared.wdNamed = r; })
      .catch((e) => log(`Wikidata (nazvano po): ${e.message}`, 'warn'));
    shared.namedP = namedP;
    await elevP;
    if (shared.elev != null) shared.questions.push(...K.elevationQuestions(shared.elev, place.kraj));

    // kraj = najviše 1 km oko centra
    const stages = [
      circleStage(lat, lon, 800, { wikiR: 800, wikiFar: 2500, gbifR: 1000, gbifLabel: 'u kraju (do 1 km od tvoje tačke)' }),
      circleStage(lat, lon, 1000, { wikiR: 1000, wikiFar: 3000, gbifR: 1000, gbifLabel: 'u kraju (do 1 km od tvoje tačke)' })
    ];

    const notes = [];
    let used = null;
    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      K.setSeed(`${K.cacheKey(place)}|${day}|${st.key}`);
      const cands = await buildStage(st, shared, log);
      log(`${st.title}: ${cands.length} dobrih pitanja.`, cands.length >= TARGET ? 'ok' : 'warn');
      if (!used || cands.length > used.cands.length) used = { stage: st, cands, i };
      if (cands.length >= TARGET) { used = { stage: st, cands, i }; break; }
      if (i < stages.length - 1) log(`Nedovoljno pitanja, širim na: ${stages[i + 1].title}…`, 'warn');
    }
    if (used.i > 0) notes.push(`U krugu od 800 m nije bilo 10 proverenih pitanja, pa kviz pokriva ceo kraj, 1 km oko centra.`);
    K.setSeed(`${K.cacheKey(place)}|${day}|izbor`);
    const questions = K.selectQuiz(used.cands, TARGET);
    if (questions.length < TARGET) notes.push(`Izvori za ovaj kraj imaju samo ${questions.length} proverenih pitanja.`);
    K.rand = Math.random;

    return {
      created: Date.now(), day,
      place: { kraj: place.kraj, grad: place.grad, country: place.country || '', lat, lon },
      scope: used.stage.title, scopeKey: used.stage.key,
      notes, questions
    };
  };
})(globalThis.Kviz = globalThis.Kviz || {});
