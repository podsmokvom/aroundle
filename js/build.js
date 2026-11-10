/* Kviz — pravljenje kviza za lokaciju: krug 800 m -> opština -> grad, keš po kraju.
   Izvori: OSM pločice (OpenFreeMap), Overture Places, Vikipedija/Wikidata, Open-Meteo, GBIF. Bez Overpass-a. */
(function (K) {
  'use strict';
  const TARGET = 10;
  const CACHE_VER = 'kviz:v3:';
  const CACHE_DAYS = 30;

  // ---------------- Keš (localStorage) ----------------
  K.cacheKey = (place) => {
    const k = place.kraj || place.grad ? K.norm(`${place.kraj}|${place.grad}`) : `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
    return CACHE_VER + k;
  };
  K.cacheGet = function (place) {
    try {
      const raw = localStorage.getItem(K.cacheKey(place));
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (!v || !v.questions || Date.now() - v.created > CACHE_DAYS * 864e5) return null;
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
    local.sort((a, b) => (a.lang === 'sr' ? 0 : 1) - (b.lang === 'sr' ? 0 : 1));
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
    const [osm, ov, wiki, birdQs, transit] = await Promise.all([
      K.osmFromTiles(lat, lon, stage.loadR, stage.inside, stage.farOk)
        .then((r) => { log(`OpenStreetMap: ${r.local.items.length} objekata i ${r.services.filter((s) => s.inside).length} radnji ${stage.label}.`, 'ok'); return r; })
        .catch((e) => { log(`OpenStreetMap pločice: ${e.message}`, 'warn'); return { local: empty(), far: empty(), services: [] }; }),
      K.overturePlaces(lat, lon, stage.ovR)
        .then((r) => { log(`Overture: ${r.length} mesta u okolini.`, 'ok'); return r; })
        .catch((e) => { log(`Overture: ${e.message}`, 'warn'); return []; }),
      wikiFor(lat, lon, stage.wikiR, stage.wikiFar, stage.wikiCenters, log)
        .then((r) => { log(`Vikipedija: ${r.local.length} članaka u kraju.`, 'ok'); return r; }),
      K.birds(lat, lon, stage.gbifR)
        .then((b) => { log(`GBIF: ${b.total} nalaza ptica.`, 'ok'); return K.birdQuestions(b, stage.gbifLabel); })
        .catch((e) => { log(`GBIF: ${e.message}`, 'warn'); return []; }),
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
      key: 'r' + r, lat, lon, radius: r, label: `u krugu od ${fmtR(r)}`, title: `krug od ${fmtR(r)}`,
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
  K.buildQuiz = async function (place, log = () => {}) {
    const { lat, lon } = place;
    const where = place.grad || place.kraj || 'ovom mestu';

    // Zajedničko za sve krugove: klima, podaci o gradu, „nazvano po“; granice opštine/grada
    const shared = { questions: [], wdNamed: [] };
    log('Open-Meteo: prosek za januar i jul 1991–2020…');
    const climateP = K.climate(lat, lon).then((cl) => {
      shared.questions.push(...K.climateQuestions(cl, where));
      log('Open-Meteo: klima izračunata.', 'ok');
    }).catch((e) => log(`Open-Meteo: ${e.message}`, 'warn'));
    log('Wikidata: šta je po kome nazvano u okolini…');
    const namedP = K.wdNamedAfter(lat, lon, 5).then((r) => { shared.wdNamed = r; })
      .catch((e) => log(`Wikidata (nazvano po): ${e.message}`, 'warn'));
    const areasP = K.adminPolygons(lat, lon).catch(() => []);
    const cityP = areasP.then(async (areas) => {
      const cityArea = areas.find((a) => a.kind === 'city') || areas.find((a) => a.kind === 'mun');
      if (!cityArea || !cityArea.wikidata) return;
      try {
        const ce = await K.wikidata([cityArea.wikidata]);
        const name = cityArea.name.replace(/^(grad|gradska opština|opština|city of|municipality of)\s+/i, '');
        shared.questions.push(...K.cityQuestions(ce[cityArea.wikidata], name, cityArea.wikidata));
        log(`Wikidata: podaci o mestu ${name}.`, 'ok');
      } catch (e) { log(`Wikidata (grad): ${e.message}`, 'warn'); }
    });

    const stage1 = circleStage(lat, lon, 800, { wikiR: 800, wikiFar: 2500, gbifR: 2000, gbifLabel: 'u okolini, oko 2 km od tačke,' });
    shared.namedP = namedP; // prvi krug ga čeka tek kod Wikidata koraka, ne na početku
    const firstP = buildStage(stage1, shared, log);
    await Promise.all([climateP, cityP]);
    const areas = await areasP;
    const mun = areas.find((a) => a.kind === 'mun');
    const city = areas.find((a) => a.kind === 'city');

    const stages = [stage1];
    if (mun) stages.push({ ...areaStage(lat, lon, mun, 'mun', 8000), wikiR: 3000, wikiFar: 6000, gbifR: 5000, gbifLabel: 'u široj okolini, oko 5 km od tačke,' });
    if (city && (!mun || city.osmId !== mun.osmId)) stages.push({ ...areaStage(lat, lon, city, 'city', 12000), wikiR: 10000, wikiFar: null, wikiCenters: [[lat + 0.35, lon], [lat - 0.35, lon]], gbifR: 12000, gbifLabel: 'u okolini, oko 12 km od tačke,' });
    if (!mun && !city) {
      stages.push(circleStage(lat, lon, 2000, { wikiR: 2000, wikiFar: 5000, gbifR: 4000, gbifLabel: 'u okolini, oko 4 km od tačke,' }));
      stages.push(circleStage(lat, lon, 5000, { wikiR: 5000, wikiFar: null, wikiCenters: [[lat + 0.35, lon], [lat - 0.35, lon]], gbifR: 10000, gbifLabel: 'u okolini, oko 10 km od tačke,' }));
    }

    const notes = [];
    let used = null;
    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      let cands;
      if (i === 0) {
        // prvi krug je pokrenut pre nego što su klima/grad stigli: dodaj ih ako fale
        const base = await firstP;
        cands = base.concat(shared.questions.filter((q) => !base.includes(q)));
      } else cands = await buildStage(st, shared, log);
      // dovoljno = 10 pitanja, od kojih bar 6 baš o kraju (ne samo klima i grad)
      const localN = cands.filter((q) => !q.outsider).length;
      const enough = cands.length >= TARGET && localN >= TARGET - 4;
      log(`${st.title}: ${cands.length} dobrih pitanja (${localN} o samom kraju).`, enough ? "ok" : "warn");
      const score = Math.min(localN, TARGET - 3) * 100 + cands.length;
      if (!used || score > used.score) used = { stage: st, cands, i, score };
      if (enough) { used = { stage: st, cands, i, score }; break; }
      if (i < stages.length - 1) log(`Nedovoljno pitanja, širim na: ${stages[i + 1].title}…`, 'warn');
    }
    for (let i = 0; i < used.i; i++) {
      notes.push(`${stages[i].title[0].toUpperCase() + stages[i].title.slice(1)}: nije bilo 10 proverenih pitanja, pa je krug proširen na: ${stages[i + 1].title}.`);
    }
    const questions = K.selectQuiz(used.cands, TARGET);
    if (questions.length < TARGET) notes.push(`Ni za ${used.stage.title} izvori nemaju 10 proverenih pitanja, pa kviz ima ${questions.length}.`);
    if (questions.filter((q) => q.outsider).length < 3) notes.push('Klima i podaci o gradu nisu bili dostupni, pa ima manje od 3 pitanja za one koji ne žive ovde.');

    return {
      created: Date.now(),
      place: { kraj: place.kraj, grad: place.grad, lat, lon },
      scope: used.stage.title, scopeKey: used.stage.key,
      notes, questions
    };
  };
})(globalThis.Kviz = globalThis.Kviz || {});
