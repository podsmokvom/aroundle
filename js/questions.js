/* Kviz — šabloni pitanja (bez AI). Svako pitanje nastaje samo iz podatka koji je stvarno nađen u izvoru. */
(function (K) {
  'use strict';

  const SRC = {
    osm: { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/' },
    meteo: { name: 'Open-Meteo (ERA5, 1991–2020)', url: 'https://open-meteo.com/' },
    gbif: { name: 'GBIF (CC0 / CC BY)', url: 'https://www.gbif.org/' },
    wd: { name: 'Wikidata', url: 'https://www.wikidata.org/' }
  };

  // Najviše pitanja po vrsti
  K.CAPS = {
    street: 2, school: 2, kindergarten: 1, park: 2, monument: 2, stop: 1, line: 1,
    etym: 2, wikiNear: 2, wikiText: 2, wikiYear: 2, birds: 1, climate: 4, city: 3,
    svcCount: 2, svcMost: 1, svcNear: 1, svcDist: 1, svcHave: 1, svcName: 1, transit: 2, mapPin: 2, elev: 1
  };

  // Napravi pitanje sa 4 ponuđena odgovora; vrati null ako nema 3 različita netačna
  function makeQ(o) {
    const seen = new Set([K.norm(o.correct)]);
    const wrongs = [];
    for (const w of o.wrongs) {
      const n = K.norm(w);
      if (!n || seen.has(n)) continue;
      if (o.names && K.tooClose(w, o.correct)) continue;
      seen.add(n); wrongs.push(w);
      if (wrongs.length === 3) break;
    }
    if (wrongs.length < 3 || !o.correct) return null;
    const options = K.shuffle([o.correct, ...wrongs]);
    return {
      cat: o.cat, text: o.text, options, answer: options.indexOf(o.correct),
      explain: o.explain || '', source: o.source, outsider: !!o.outsider, fact: o.fact || ''
    };
  }

  // Da li su dva naziva verovatno isto mesto pod drugim imenom
  // („Park prijateljstva Srbije i Grčke“ / „Park srpsko-grčkog prijateljstva“)
  const GENERIC = new Set(['park', 'parka', 'ulica', 'ulice', 'bulevar', 'skola', 'osnovna', 'srednja', 'vrtic', 'bista',
    'spomenik', 'spomen', 'obelezje', 'crkva', 'stajaliste', 'beograd', 'beogradu', 'grad', 'gradski', 'novi', 'nova',
    'street', 'school', 'church', 'belgrade', 'kindergarten']);
  const stems = (s) => [...new Set(K.norm(s).split(' ').filter((w) => w.length >= 4 && !GENERIC.has(w)).map((w) => w.slice(0, 4)))];
  K.tooClose = function (a, b) {
    const A = stems(a), B = stems(b);
    if (!A.length || !B.length) return false;
    const shared = A.filter((x) => B.includes(x)).length;
    return shared >= Math.min(2, A.length, B.length);
  };

  // Netačni odgovori koji liče na tačan (ista prva reč, slična dužina), uz malo slučajnosti
  function similar(correct, pool, n = 12) {
    const first = K.norm(correct).split(' ')[0];
    const len = correct.length;
    return K.shuffle(pool)
      .map((p) => ({ p, s: (K.norm(p).split(' ')[0] === first ? 2 : 0) - Math.abs(p.length - len) / 15 + K.rand() }))
      .sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.p);
  }

  // Brojčani odgovori: tačna vrednost + 3 pomerene za korak (tačan nije uvek u sredini)
  function numeric(value, step, fmt, min = -Infinity) {
    // samo obrasci kod kojih nijedna ponuđena vrednost ne pada ispod min (npr. visina ispod 0 m)
    const patterns = [[-3, -2, -1], [-2, -1, 1], [-1, 1, 2], [1, 2, 3]].filter((p) => value + p[0] * step >= min);
    const p = K.pick(patterns);
    return { correct: fmt(value), wrongs: p.map((k) => fmt(value + k * step)) };
  }

  const osmLink = (it) => ({ name: 'OpenStreetMap', url: `https://www.openstreetmap.org/${it.key}` });

  // ---------------- OSM: šta se nalazi u kraju ----------------
  const OSM_T = {
    street: 'Koja od ovih ulica se nalazi {scope}?',
    school: 'Koja od ovih škola se nalazi {scope}?',
    kindergarten: 'Koji od ovih vrtića se nalazi {scope}?',
    park: 'Koji od ovih parkova se nalazi {scope}?',
    monument: 'Koji od ovih spomenika ili spomen-obeležja se nalazi {scope}?',
    stop: 'Koje od ovih stajališta javnog prevoza se nalazi {scope}?'
  };

  function osmQuestions(stage, local, far) {
    const qs = [];
    const localNames = {};
    for (const it of local.items) (localNames[it.cat] = localNames[it.cat] || new Set()).add(K.norm(it.name));
    const localKeys = new Set(local.items.map((i) => i.key));

    for (const cat of Object.keys(OSM_T)) {
      const names = localNames[cat] || new Set();
      const mine = K.shuffle(K.uniqBy(local.items.filter((i) => i.cat === cat), (i) => K.norm(i.name)));
      const mineNames = mine.map((i) => i.name);
      // netačni: isti tip, NIJE u kraju (ni po imenu, ni po sličnom imenu), i dovoljno daleko
      const pool = K.uniqBy(far.items.filter((i) => i.cat === cat && !localKeys.has(i.key) &&
        !names.has(K.norm(i.name)) &&
        i.lat != null && stage.farOk(i.lat, i.lon, K.dist(stage.lat, stage.lon, i.lat, i.lon))
      ), (i) => K.norm(i.name)).map((i) => i.name)
        .filter((n) => !mineNames.some((m) => K.tooClose(n, m)));
      let made = 0;
      for (const it of mine) {
        if (made >= K.CAPS[cat]) break;
        const q = makeQ({
          cat, names: true, text: OSM_T[cat].replace('{scope}', stage.label),
          correct: it.name, wrongs: similar(it.name, pool),
          explain: `„${it.name}“ je u OpenStreetMap-u ${stage.label}. Ostali odgovori su iz drugih delova grada i okoline.`,
          source: osmLink(it)
        });
        if (q) { qs.push(q); made++; }
      }
    }

    // Linije javnog prevoza
    const TYPE = { bus: 'autobus', tram: 'tramvaj', trolleybus: 'trolejbus' };
    const lineLabel = (r) => `${TYPE[r.kind] || r.kind} ${r.ref}`;
    const myLines = K.uniqBy(local.routes, lineLabel);
    const myLineSet = new Set(myLines.map(lineLabel));
    const linePool = K.uniqBy(far.routes.filter((r) => !myLineSet.has(lineLabel(r))), lineLabel);
    for (const r of K.shuffle(myLines).slice(0, 3)) {
      if (qs.filter((q) => q.cat === 'line').length >= K.CAPS.line) break;
      const same = linePool.filter((x) => x.kind === r.kind).map(lineLabel);
      const q = makeQ({
        cat: 'line', text: `Koja linija javnog prevoza staje ${stage.label}?`,
        correct: lineLabel(r), wrongs: K.shuffle(same).concat(K.shuffle(linePool.map(lineLabel))),
        explain: `Prema OpenStreetMap-u, linija ${lineLabel(r)}${r.name ? ` („${r.name}“)` : ''} ima stajalište ${stage.label}.`,
        source: { name: 'OpenStreetMap', url: `https://www.openstreetmap.org/relation/${r.id}` }
      });
      if (q) qs.push(q);
    }
    return qs;
  }

  // ---------------- Wikidata: po kome je ulica nazvana ----------------
  function etymQuestions(stage, local, far, wikiLocal, ents, wdNamed = []) {
    const qs = [];
    const isHuman = (qid) => K.wd.items(ents[qid], 'P31').includes('Q5');
    const allEtym = K.uniqBy(local.items.concat(far.items).filter((i) => i.etym && ents[i.etym]), (i) => i.etym)
      .map((i) => i.etym).concat(wdNamed.filter((w) => ents[w.named]).map((w) => w.named));
    const subjects = [];
    // Wikidata: objekti u kraju koji imaju „nazvano po“ (ulice, škole, parkovi…)
    const STREETS = new Set(['Q79007', 'Q54114', 'Q174782', 'Q207934', 'Q1251403', 'Q3240715']); // ulica, bulevar, trg…
    for (const w of K.uniqBy(wdNamed.filter((x) => x.dist <= stage.wikiR && ents[x.qid] && ents[x.named]), (x) => x.qid)) {
      const label = K.wd.label(ents[w.qid]);
      if (!label || K.isBanned(label)) continue;
      const street = K.wd.items(ents[w.qid], 'P31').some((q) => STREETS.has(q));
      subjects.push({ street, what: street ? `ulica „${label}“` : `„${label}“`, qid: w.named, source: { name: 'Wikidata', url: `https://www.wikidata.org/wiki/${w.qid}` } });
    }
    for (const st of K.uniqBy(local.items.filter((i) => i.cat === 'street' && i.etym && ents[i.etym]), (i) => K.norm(i.name))) {
      subjects.push({ street: true, what: `ulica „${st.name}“`, qid: st.etym, source: osmLink(st) });
    }
    for (const w of wikiLocal) {
      for (const q of K.wd.items(ents[w.qid], 'P138')) {
        if (ents[q]) subjects.push({ what: `„${w.title}“`, qid: q, source: { name: 'Wikipedia / Wikidata', url: w.url } });
      }
    }
    const pool = [...new Set(allEtym.concat(subjects.map((s) => s.qid)))];
    const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    const descLang = (e) => { const d = (e && e.descriptions) || {}; return d['sr-el'] || d.sr ? 'sr' : d.en ? 'en' : ''; };
    // Da li naziv već odaje ime (npr. „Ulica Vuka Karadžića“ -> Vuk Karadžić)
    const givesAway = (what, label) => K.norm(label).split(' ').some((w) => w.length >= 4 &&
      K.norm(what).includes(w.slice(0, Math.max(4, w.length - 2))));
    for (const s of K.shuffle(subjects)) {
      if (qs.length >= K.CAPS.etym) break;
      const label = K.wd.label(ents[s.qid]);
      if (!label) continue;
      const desc = K.wd.desc(ents[s.qid]);
      const human = isHuman(s.qid);
      const others = pool.filter((q) => q !== s.qid && isHuman(q) === human);
      let q = null;
      if (givesAway(s.what, label)) {
        // Ime je u nazivu, pa pitamo ko je to bio (opis sa Vikidate)
        if (!desc) continue;
        // opisi moraju biti na istom jeziku kao tačan, inače jezik odaje odgovor
        const lang = descLang(ents[s.qid]);
        q = makeQ({
          cat: 'etym', text: `${cap(s.what)} nosi ime po: ${label}. Ko je ${human ? 'bila ta osoba' : 'to'}?`,
          correct: cap(desc), wrongs: K.shuffle(others.filter((o) => descLang(ents[o]) === lang).map((o) => cap(K.wd.desc(ents[o]))).filter(Boolean)),
          explain: `${label} — ${desc} (Wikidata ${s.qid}).`, source: s.source,
          fact: `${cap(s.what)} nosi ime po: ${label} (${desc}).`
        });
      } else {
        q = makeQ({
          cat: 'etym', text: `Po kome ili čemu je nazvan${s.street ? "a" : "(a)"} ${s.what}?`,
          correct: label, wrongs: K.shuffle(others.map((o) => K.wd.label(ents[o])).filter((l) => l && !givesAway(s.what, l))),
          explain: `${label}${desc ? ' — ' + desc : ''} (Wikidata ${s.qid}).`, source: s.source
        });
      }
      if (q) qs.push(q);
    }
    return qs;
  }

  // ---------------- Wikipedia ----------------
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function wikiQuestions(stage, wikiLocal, wikiFar, ents) {
    const qs = [];
    const localTitles = wikiLocal.map((w) => w.title);
    const localSet = new Set(localTitles.map(K.norm));
    const farAll = K.uniqBy(wikiFar.filter((w) => !localSet.has(K.norm(w.title)) && !localTitles.some((t) => K.tooClose(t, w.title))), (w) => K.norm(w.title));
    // netačni naslovi na istom jeziku kao tačan, kad ih ima dovoljno
    const farTitlesFor = (lang) => { const s = farAll.filter((w) => w.lang === lang); return (s.length >= 3 ? s : farAll).map((w) => w.title); };

    // 1) Šta je u blizini
    for (const w of K.shuffle(wikiLocal)) {
      if (qs.filter((q) => q.cat === 'wikiNear').length >= K.CAPS.wikiNear) break;
      const q = makeQ({
        cat: 'wikiNear', text: `Koji od ovih pojmova sa Vikipedije se nalazi ${stage.label}?`,
        correct: w.title, names: true, wrongs: similar(w.title, farTitlesFor(w.lang)),
        explain: `Članak „${w.title}“ ima koordinate ${stage.label}${w.extract ? ': ' + w.extract.slice(0, 160) + (w.extract.length > 160 ? '…' : '') : '.'}`,
        source: { name: `Wikipedia (${w.lang})`, url: w.url }
      });
      if (q) qs.push(q);
    }

    // 2) Prepoznaj po opisu (ime je sakriveno)
    for (const w of K.shuffle(wikiLocal)) {
      if (qs.filter((q) => q.cat === 'wikiText').length >= K.CAPS.wikiText) break;
      if (!w.extract || w.extract.length < 60) continue;
      const core = w.title.replace(/\s*\(.*\)\s*$/, '').trim();
      if (core.length < 3 || !new RegExp(escRe(core), 'i').test(w.extract)) continue;
      let txt = w.extract.replace(new RegExp(escRe(core), 'gi'), '_____');
      for (const word of core.split(/\s+/)) {
        if (word.length >= 5) txt = txt.replace(new RegExp('(^|[^\\p{L}])' + escRe(word.slice(0, -2)) + '\\p{L}*', 'giu'), '$1_____');
      }
      if (txt.replace(/_+/g, '').trim().length < 50) continue;
      if (txt.length > 260) txt = txt.slice(0, 260).replace(/\s+\S*$/, '') + '…';
      const others = wikiLocal.filter((x) => x !== w && x.lang === w.lang).map((x) => x.title).concat(similar(w.title, farTitlesFor(w.lang)));
      const q = makeQ({
        cat: 'wikiText', text: `Na koji pojam iz okoline se odnosi ovaj opis sa Vikipedije?\n„${txt}“`,
        correct: w.title, wrongs: others,
        explain: `Opis je početak članka „${w.title}“.`,
        source: { name: `Wikipedia (${w.lang})`, url: w.url }
      });
      if (q) qs.push(q);
    }

    // 3) Godina nastanka (Wikidata P571 / P1619)
    const now = new Date().getFullYear();
    for (const w of K.shuffle(wikiLocal)) {
      if (qs.filter((q) => q.cat === 'wikiYear').length >= K.CAPS.wikiYear) break;
      const e = ents[w.qid];
      const y = K.wd.year(e, 'P571') || K.wd.year(e, 'P1619');
      if (!y || y > now) continue;
      const step = Math.max(6, Math.round(Math.abs(now - y) * 0.12));
      const n = numeric(y, step, (v) => K.fmtYear(Math.round(v)));
      n.wrongs = n.wrongs.filter((s) => parseInt(s, 10) <= now || s.includes('p. n. e.'));
      if (n.wrongs.length < 3) n.wrongs.push(K.fmtYear(y - 4 * step));
      const q = makeQ({
        cat: 'wikiYear', text: `Koje godine je, prema Vikidati, nastao ili osnovan „${w.title}“?`,
        correct: n.correct, wrongs: n.wrongs,
        explain: `Wikidata (${w.qid}) navodi ${n.correct} godinu kao početak (osnivanje/izgradnju).`,
        source: { name: 'Wikidata', url: `https://www.wikidata.org/wiki/${w.qid}` }
      });
      if (q) qs.push(q);
    }
    return qs;
  }

  // ---------------- Klima (pogodivo i za ne-meštane) ----------------
  K.climateQuestions = function (cl, place) {
    if (!cl) return [];
    const qs = [];
    const where = place || 'ovom mestu';
    const t = (v) => `${K.fmtNum(v, 1)} °C`;
    const src = SRC.meteo;
    if (cl.jan && cl.jan.t != null) {
      const n = numeric(cl.jan.t, 3, t);
      qs.push(makeQ({ cat: 'climate', outsider: true, text: `Kolika je prosečna temperatura u januaru (${where}, 1991–2020)?`, ...n, explain: `Prosek dnevnih srednjih temperatura za sve januare 1991–2020: ${n.correct}.`, source: src }));
    }
    if (cl.jul && cl.jul.t != null) {
      const n = numeric(cl.jul.t, 3, t);
      qs.push(makeQ({ cat: 'climate', outsider: true, text: `Kolika je prosečna temperatura u julu (${where}, 1991–2020)?`, ...n, explain: `Prosek dnevnih srednjih temperatura za sve jule 1991–2020: ${n.correct}.`, source: src }));
    }
    if (cl.jan && cl.jul && cl.jan.t != null && cl.jul.t != null) {
      const diff = cl.jul.t - cl.jan.t;
      const n = numeric(diff, 4, (v) => `${K.fmtNum(Math.abs(v), 1)} °C`);
      qs.push(makeQ({ cat: 'climate', outsider: true, text: `Za koliko je jul u proseku topliji od januara (${where}, 1991–2020)?`, ...n, explain: `Jul ${t(cl.jul.t)}, januar ${t(cl.jan.t)}: razlika ${n.correct}.`, source: src }));
    }
    if (cl.jul && cl.jul.p != null) {
      const step = Math.max(12, Math.round(cl.jul.p * 0.35));
      const n = numeric(Math.round(cl.jul.p), step, (v) => `${K.fmtNum(Math.round(v), 0)} mm`, 3);
      qs.push(makeQ({ cat: 'climate', outsider: true, text: `Koliko padavina u proseku padne u julu (${where}, 1991–2020)?`, ...n, explain: `Prosečan zbir padavina za jul 1991–2020: ${n.correct}.`, source: src }));
    }
    return qs.filter(Boolean);
  };

  // ---------------- Grad: poznate činjenice (Wikidata) ----------------
  K.cityQuestions = function (cityEnt, cityName, qid) {
    if (!cityEnt) return [];
    const qs = [];
    const name = cityName || K.wd.label(cityEnt);
    const src = { name: 'Wikidata', url: `https://www.wikidata.org/wiki/${qid}` };
    const now = new Date().getFullYear();

    const y = K.wd.year(cityEnt, 'P571');
    if (y && y <= now) {
      const step = Math.max(10, Math.round(Math.abs(now - y) * 0.15 / 10) * 10);
      const n = numeric(y, step, (v) => K.fmtYear(Math.round(v)));
      n.wrongs = n.wrongs.map((s, i) => (parseInt(s, 10) > now && !s.includes('p. n. e.')) ? K.fmtYear(y - (i + 4) * step) : s);
      qs.push(makeQ({ cat: 'city', outsider: true, text: `Koju godinu Vikidata navodi kao nastanak (osnivanje ili prvi pomen) mesta ${name}?`, ...n, explain: `Wikidata ${qid}, svojstvo „početak“ (P571): ${n.correct}`, source: src }));
    }

    const pop = K.wd.latestQty(cityEnt, 'P1082');
    if (pop && pop.amount >= 200) {
      const round2 = (v) => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1)); return Math.round(v / p) * p; };
      const c = round2(pop.amount);
      const pats = [[0.25, 0.5, 2], [0.5, 2, 4], [0.2, 0.4, 2.5], [0.4, 2, 5]];
      const wr = K.pick(pats).map((m) => `oko ${K.fmtNum(round2(c * m), 0)}`);
      qs.push(makeQ({ cat: 'city', outsider: true, text: `Koliko otprilike stanovnika ima ${name}${pop.year ? ` (podatak iz ${pop.year}.)` : ''}?`, correct: `oko ${K.fmtNum(c, 0)}`, wrongs: wr, explain: `Wikidata navodi ${K.fmtNum(pop.amount, 0)} stanovnika${pop.year ? ` (${pop.year}.)` : ''}.`, source: src }));
    }

    const elev = K.wd.latestQty(cityEnt, 'P2044');
    if (elev && elev.amount > 0) {
      const v = Math.round(elev.amount);
      const step = Math.max(40, Math.round(v * 0.4 / 10) * 10);
      const n = numeric(v, step, (x) => `${K.fmtNum(Math.round(x), 0)} m`, 5);
      qs.push(makeQ({ cat: 'city', outsider: true, text: `Na kojoj nadmorskoj visini je ${name}?`, ...n, explain: `Wikidata navodi ${v} m nadmorske visine.`, source: src }));
    }
    return qs.filter(Boolean);
  };

  // ---------------- GBIF: ptice ----------------
  K.birdQuestions = async function (birds, label) {
    if (!birds || birds.species.length < 6 || birds.species[0].count < 20) return [];
    const top = birds.species[0];
    // netačni: vrste koje su ovde ređe zabeležene (6.–25. mesto), sa jasno manjim brojem nalaza
    const lower = birds.species.slice(5).filter((s) => s.count < top.count * 0.8);
    if (lower.length < 3) return [];
    const picks = lower.slice().sort((a, b) => String(a.key).localeCompare(String(b.key))).slice(0, 5); // stabilno (bez slučajnosti u paralelnom delu)
    const names = await Promise.all([top, ...picks].map((s) => K.speciesName(s.key).catch(() => null)));
    if (!names[0]) return [];
    const q = makeQ({
      cat: 'birds',
      text: `Koja vrsta ptice ima najviše zabeleženih nalaza ${label} prema GBIF-u (samo CC0 i CC BY podaci)?`,
      correct: names[0].label, wrongs: names.slice(1).filter(Boolean).map((n) => n.label),
      explain: `${names[0].label}: ${K.fmtNum(top.count, 0)} nalaza od ukupno ${K.fmtNum(birds.total, 0)} za ptice u ovoj oblasti.`,
      source: { name: 'GBIF', url: birds.url }
    });
    return q ? [q] : [];
  };

  // ---------------- Zanatlije, usluge i radnje (OSM pločice) ----------------
  // Izvori (OSM + Overture) nisu potpuni, zato pitanja kažu „prema otvorenim mapama“ i nude link za dopunu OSM-a.
  K.serviceQuestions = function (stage, services) {
    const S = K.SERVICES;
    const qs = [];
    const mapUrl = `https://www.openstreetmap.org/#map=17/${stage.lat.toFixed(5)}/${stage.lon.toFixed(5)}`;
    const src = { name: 'OpenStreetMap + Overture Maps (znaš još neku? dopuni OSM mapu)', url: mapUrl };
    const local = services.filter((s) => s.inside);
    const count = {};
    for (const s of local) count[s.kind] = (count[s.kind] || 0) + 1;
    const nearest = {};
    for (const s of services) if (!nearest[s.kind] || s.d < nearest[s.kind].d) nearest[s.kind] = s;
    const kinds = Object.keys(S);
    const m = (d) => `${K.fmtNum(Math.round(d / 10) * 10, 0)} m`;

    // 1) Koliko ih ima
    // prednost zanatlijama i majstorima, pa tek onda ostalim radnjama
    const TRADES = new Set(['shoemaker', 'tailor', 'plumber', 'electrician', 'tyres', 'locksmith', 'hvac', 'carpenter',
      'watches', 'glazier', 'appliance', 'car_repair', 'florist', 'hairdresser', 'dry_cleaning',
      'health_food', 'cafe', 'kids_play', 'playground', 'ice_cream']);
    const countable = K.shuffle(kinds.filter((k) => (count[k] || 0) >= (TRADES.has(k) ? 1 : 2)))
      .sort((a, b) => (TRADES.has(b) ? 1 : 0) - (TRADES.has(a) ? 1 : 0));
    const full = stage.complete !== false; // cela oblast učitana -> brojanje ima smisla
    for (const k of (full ? countable : []).slice(0, 2)) {
      const c = count[k];
      const step = Math.max(1, Math.round(c * 0.35));
      const pats = [[-3, -2, -1], [-2, -1, 1], [-1, 1, 2], [1, 2, 3]].filter((p) => c + p[0] * step >= 0);
      const p = K.pick(pats);
      const q = makeQ({
        cat: 'svcCount', text: `Koliko ${S[k].many} ima ${stage.label}, prema otvorenim mapama?`,
        correct: String(c), wrongs: p.map((x) => String(c + x * step)),
        explain: `Na otvorenim mapama (OSM + Overture) ${stage.label} ima ${c} (${S[k].one}). Stvarnih može biti i više.`, source: src,
        fact: `U mom kraju ima ${c} ${S[k].many}, bar onih upisanih na mapu.`
      });
      if (q) qs.push(q);
    }

    // 2) Čega ima najviše
    const ranked = kinds.filter((k) => count[k]).sort((a, b) => count[b] - count[a]);
    if (full && ranked.length >= 4 && count[ranked[0]] - count[ranked[1]] >= 2) {
      const opts = [ranked[0], ...K.shuffle(ranked.slice(1)).slice(0, 3)];
      const q = makeQ({
        cat: 'svcMost', text: `Čega ima najviše ${stage.label}, prema otvorenim mapama?`,
        correct: S[opts[0]].one, wrongs: opts.slice(1).map((k) => S[k].one),
        explain: opts.map((k) => `${S[k].one}: ${count[k]}`).join(', ') + '.', source: src
      });
      if (q) qs.push(q);
    }

    // 3) Šta je najbliže
    const near = kinds.filter((k) => nearest[k] && nearest[k].d < 1500).sort((a, b) => nearest[a].d - nearest[b].d);
    if (near.length >= 4 && nearest[near[1]].d - nearest[near[0]].d >= 80) {
      const opts = [near[0], ...K.shuffle(near.slice(1, 8)).slice(0, 3)];
      const q = makeQ({
        cat: 'svcNear', text: 'Šta je najbliže centru kraja, prema otvorenim mapama?',
        correct: S[opts[0]].one, wrongs: opts.slice(1).map((k) => S[k].one),
        explain: opts.map((k) => `${S[k].one}: ${m(nearest[k].d)}`).join(', ') + ' (vazdušnom linijom).', source: src
      });
      if (q) qs.push(q);
    }

    // 4) Koliko je daleko najbliži/a …
    const BINS = [[0, 150, 'do 150 m'], [150, 400, '150–400 m'], [400, 800, '400–800 m'], [800, 1e9, 'više od 800 m']];
    for (const k of K.shuffle(kinds.filter((k) => nearest[k] && nearest[k].d < 2000))) {
      const d = nearest[k].d;
      const bin = BINS.find((b) => d >= b[0] && d < b[1]);
      if (BINS.some((b) => Math.abs(d - b[0]) < 30 && b[0] > 0)) continue; // preblizu granice
      const q = makeQ({
        cat: 'svcDist', text: `Koliko vazdušnom linijom ima od centra kraja do najbližeg mesta: ${S[k].one}?`,
        correct: bin[2], wrongs: BINS.filter((b) => b !== bin).map((b) => b[2]),
        explain: `Najbliže mesto (${S[k].one})${nearest[k].name ? ` („${nearest[k].name}“)` : ''} je na oko ${m(d)} vazdušnom linijom.`, source: src
      });
      if (q) { q.options = BINS.map((b) => b[2]); q.answer = q.options.indexOf(bin[2]); qs.push(q); }
      break;
    }

    // 5) Koju radnju imaš u kraju (ostale nisu na mapi ni u široj okolini kraja)
    const have = kinds.filter((k) => count[k]);
    const lack = kinds.filter((k) => !count[k] && nearest[k] && nearest[k].d > (stage.radius || 800) * 1.8);
    if (full && have.length && lack.length >= 3) {
      const k = K.pick(have);
      const q = makeQ({
        cat: 'svcHave', text: `Koju od ovih radnji, prema otvorenim mapama, imaš ${stage.label}?`,
        correct: S[k].one, wrongs: K.shuffle(lack).map((x) => S[x].one),
        explain: `Na mapama ${stage.label} postoji: ${S[k].one}. Ostale vrste nisu upisane ni u krugu dvostruko većem.`, source: src
      });
      if (q) qs.push(q);
    }

    // 6) Koja (imenovana) radnja je u kraju — bez lanaca (ime koje postoji i u kraju i van njega)
    const farNames = new Set(services.filter((s) => !s.inside && s.name).map((s) => K.norm(s.name)));
    const localNames = new Set(local.filter((s) => s.name).map((s) => K.norm(s.name)));
    for (const s of K.shuffle(local.filter((x) => x.name && !farNames.has(K.norm(x.name))))) {
      if (qs.filter((q) => q.cat === 'svcName').length >= 1) break;
      const pool = K.uniqBy(services.filter((x) => !x.inside && x.kind === s.kind && x.name && !localNames.has(K.norm(x.name)) &&
        x.d > (stage.far || 1500)), (x) => K.norm(x.name)).map((x) => x.name);
      const q = makeQ({
        cat: 'svcName', names: true, text: `Koja od ovih radnji (${S[s.kind].one}) se nalazi ${stage.label}?`,
        correct: s.name, wrongs: similar(s.name, pool),
        explain: `„${s.name}“ je na mapi (${s.src}) ${stage.label}, na oko ${m(s.d)} od centra kraja.`,
        source: { name: 'OpenStreetMap', url: `https://www.openstreetmap.org/#map=19/${s.lat.toFixed(5)}/${s.lon.toFixed(5)}` }
      });
      if (q) qs.push(q);
    }
    return qs;
  };

  // ---------------- Gradski prevoz (Transitous / GTFS) ----------------
  K.transitQuestions = function (stage, tr) {
    const qs = [];
    if (!tr || !tr.local.length) return qs;
    const src = { name: 'Transitous (vozni redovi prevoznika)', url: 'https://transitous.org/sources/' };
    const localLabels = new Set(tr.local.flatMap((s) => s.lines.map((l) => l.label)));
    const farLines = K.uniqBy(tr.far.flatMap((s) => s.lines).filter((l) => !localLabels.has(l.label)), (l) => l.label);

    // 1) Koja linija staje na stanici X
    for (const s of K.shuffle(tr.local)) {
      if (qs.length >= 1) break;
      const l = K.pick(s.lines);
      const same = farLines.filter((x) => x.mode === l.mode).map((x) => x.label);
      const q = makeQ({
        cat: 'transit', text: `Koja linija staje na stanici „${s.name}“ u tvom kraju?`,
        correct: l.label, wrongs: K.shuffle(same).concat(K.shuffle(farLines.map((x) => x.label))),
        explain: `Na stanici „${s.name}“ staju: ${s.lines.map((x) => x.label).slice(0, 8).join(', ')}${l.agency ? ` (${l.agency})` : ''}.`,
        fact: `Na stanici „${s.name}“ u mom kraju staju: ${s.lines.map((x) => x.label).slice(0, 5).join(', ')}.`,
        source: src
      });
      if (q) qs.push(q);
    }

    // 2) Kuda vozi linija N sa stanice X (krajnja stanica)
    const allHeads = [...new Set(tr.local.concat(tr.far).flatMap((s) => s.lines.flatMap((l) => [...l.heads])))];
    for (const s of K.shuffle(tr.local)) {
      if (qs.length >= 2) break;
      const l = K.shuffle(s.lines).find((x) => x.heads.size);
      if (!l) continue;
      const head = K.pick([...l.heads]);
      // netačni: krajnje stanice drugih linija (nijedan smer ove linije)
      const lineHeads = new Set(s.lines.filter((x) => x.label === l.label).flatMap((x) => [...x.heads]).map(K.norm));
      const wrongs = K.shuffle(allHeads.filter((h) => !lineHeads.has(K.norm(h))));
      const q = makeQ({
        cat: 'transit', names: true, text: `Kuda vozi ${l.label} sa stanice „${s.name}“?`,
        correct: head, wrongs,
        explain: `${l.label[0].toUpperCase() + l.label.slice(1)} sa stanice „${s.name}“ vozi prema: ${[...l.heads].join(' / ')}.`,
        source: src
      });
      if (q) qs.push(q);
    }
    return qs;
  };

  // ---------------- Pokaži na mapi ----------------
  // Igrač klikne gde misli da je objekat; tačno ako je unutar praga (park je veći, pa je i prag veći)
  K.mapQuestions = function (stage, local, services) {
    const qs = [];
    const WHAT = { school: 'škola', kindergarten: 'vrtić', park: 'park', monument: 'spomenik' };
    const cands = K.shuffle(local.items.filter((i) => WHAT[i.cat] && i.lat != null && stage.inside(i.lat, i.lon)))
      .map((i) => ({ name: i.name, what: WHAT[i.cat], lat: i.lat, lon: i.lon, tol: i.cat === 'park' ? 220 : 150, url: `https://www.openstreetmap.org/#map=18/${i.lat.toFixed(5)}/${i.lon.toFixed(5)}` }))
      .concat(K.shuffle((services || []).filter((s) => s.inside && s.name && ['bakery', 'pharmacy', 'florist', 'shoemaker', 'tailor', 'tyres', 'locksmith'].includes(s.kind)))
        .map((s) => ({ name: s.name, what: K.SERVICES[s.kind].one, lat: s.lat, lon: s.lon, tol: 150, url: `https://www.openstreetmap.org/#map=19/${s.lat.toFixed(5)}/${s.lon.toFixed(5)}` })));
    for (const c of K.uniqBy(cands, (c) => K.norm(c.name)).slice(0, 1)) { // jedno pitanje sa mapom po kvizu
      qs.push({
        cat: 'mapPin', type: 'map', text: `Pokaži na mapi: gde je ${c.what} „${c.name}“?`,
        options: [], answer: -1, target: { lat: c.lat, lon: c.lon, tol: c.tol },
        explain: `${c.what[0].toUpperCase() + c.what.slice(1)} „${c.name}“. Tačno je ako je klik bliže od ${c.tol} m.`,
        source: { name: 'OpenStreetMap / Overture', url: c.url }, outsider: false
      });
    }
    return qs;
  };

  // ---------------- Nadmorska visina centra kraja ----------------
  K.elevationQuestions = function (h, kraj) {
    const v = Math.round(h);
    const step = v < 60 ? 15 : v < 300 ? 30 : 60;
    const n = numeric(v, step, (x) => `${K.fmtNum(Math.round(x), 0)} m`, v > 5 ? 2 : -Infinity);
    const q = makeQ({
      cat: 'elev', text: `Na kojoj nadmorskoj visini je centar kraja${kraj ? ` ${kraj}` : ''}?`, ...n,
      explain: `Centar kraja je na oko ${n.correct} nadmorske visine (digitalni model terena, Copernicus DEM 90 m).`,
      fact: `Moj kraj je na ${n.correct} nadmorske visine.`,
      source: { name: 'Open-Meteo Elevation API', url: 'https://open-meteo.com/en/docs/elevation-api' }
    });
    return q ? [q] : [];
  };

  K.osmQuestions = osmQuestions;
  K.etymQuestions = etymQuestions;
  K.wikiQuestions = wikiQuestions;

  // ---------------- Izbor 10 pitanja ----------------
  K.selectQuiz = function (cands, n = 10) {
    const out = [];
    // najmanje 3 pogodiva i za nekog ko ne živi tu, iz različitih tema kad može
    const outs = K.shuffle(cands.filter((q) => q.outsider));
    const city = outs.filter((q) => q.cat === 'city'), clim = outs.filter((q) => q.cat === 'climate');
    const firstOuts = [];
    while (firstOuts.length < 3 && (city.length || clim.length)) {
      const from = (firstOuts.length % 2 === 0 ? clim : city).length ? (firstOuts.length % 2 === 0 ? clim : city) : (clim.length ? clim : city);
      firstOuts.push(from.shift());
    }
    out.push(...firstOuts);
    // bar 2 pitanja o zanatlijama i radnjama (prvo „koliko ih ima“), iz različitih šablona
    const svc = K.shuffle(cands.filter((q) => /^svc/.test(q.cat))).sort((a, b) => (b.cat === 'svcCount') - (a.cat === 'svcCount'));
    const svcCats = new Set();
    for (const q of svc) { if (svcCats.size >= 2) break; if (!svcCats.has(q.cat)) { svcCats.add(q.cat); out.push(q); } }
    // po jedno „pokaži na mapi“ i pitanje o gradskom prevozu, kad postoje
    for (const cat of ['mapPin', 'transit']) {
      const q = K.shuffle(cands.filter((x) => x.cat === cat))[0];
      if (q) out.push(q);
    }
    // ostalo: kružno po vrstama, prednost lokalnim pitanjima
    const rest = cands.filter((q) => !out.includes(q));
    const groups = {};
    for (const q of K.shuffle(rest.filter((q) => !q.outsider))) (groups[q.cat] = groups[q.cat] || []).push(q);
    const order = K.shuffle(Object.keys(groups));
    let added = true;
    while (out.length < n && added) {
      added = false;
      for (const c of order) {
        if (out.length >= n) break;
        if (groups[c].length) { out.push(groups[c].shift()); added = true; }
      }
    }
    for (const q of K.shuffle(rest.filter((q) => q.outsider))) { if (out.length >= n) break; out.push(q); }
    return K.shuffle(out);
  };
})(globalThis.Kviz = globalThis.Kviz || {});
