/* Aroundle — šabloni pitanja (bez AI). Svako pitanje nastaje samo iz podatka koji je stvarno nađen u izvoru.
   Tekstovi dolaze iz rečnika (K.t), na jeziku igrača. */
(function (K) {
  'use strict';

  // Najviše pitanja po vrsti
  K.CAPS = {
    street: 2, school: 2, kindergarten: 1, park: 2, monument: 2, stop: 1,
    etym: 2, wikiNear: 2, wikiText: 2, wikiYear: 2, birds: 1,
    svcCount: 2, svcMost: 1, svcNear: 1, svcDist: 1, svcHave: 1, svcName: 1, transit: 2, mapPin: 1, elev: 1,
    dir: 1, chain: 1, cuisine: 1, oldest: 1
  };

  // naziv radnje na jeziku igrača: „jedna|množina“
  K.svcOne = (k) => K.t('svc.' + k).split('|')[0];
  K.svcMany = (k) => { const p = K.t('svc.' + k).split('|'); return p[1] || p[0]; };
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const meters = (d) => `${K.fmtNum(Math.round(d / 10) * 10, 0)} m`;

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
  const GENERIC = new Set(['park', 'parka', 'ulica', 'ulice', 'bulevar', 'skola', 'osnovna', 'srednja', 'vrtic', 'bista',
    'spomenik', 'spomen', 'obelezje', 'crkva', 'stajaliste', 'beograd', 'beogradu', 'grad', 'gradski', 'novi', 'nova',
    'street', 'school', 'church', 'belgrade', 'kindergarten', 'strasse', 'platz', 'schule', 'kirche', 'rue', 'ecole', 'eglise',
    'calle', 'escuela', 'iglesia', 'plaza', 'ulitsa', 'shkola']);
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
    const patterns = [[-3, -2, -1], [-2, -1, 1], [-1, 1, 2], [1, 2, 3]].filter((p) => value + p[0] * step >= min);
    const p = K.pick(patterns);
    return { correct: fmt(value), wrongs: p.map((k) => fmt(value + k * step)) };
  }

  const osmLink = (it) => ({ name: 'OpenStreetMap', url: `https://www.openstreetmap.org/${it.key}` });

  // ---------------- OSM: šta se nalazi u kraju ----------------
  const OSM_CATS = ['street', 'school', 'kindergarten', 'park', 'monument', 'stop'];

  function osmQuestions(stage, local, far) {
    const qs = [];
    const localNames = {};
    for (const it of local.items) (localNames[it.cat] = localNames[it.cat] || new Set()).add(K.norm(it.name));
    const localKeys = new Set(local.items.map((i) => i.key));
    for (const cat of OSM_CATS) {
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
          cat, names: true, text: K.t('q.' + cat, { scope: stage.label }),
          correct: it.name, wrongs: similar(it.name, pool),
          explain: K.t('q.osm.explain', { name: it.name, scope: stage.label }),
          source: osmLink(it)
        });
        if (q) { qs.push(q); made++; }
      }
    }
    return qs;
  }

  // ---------------- Wikidata: po kome je nešto nazvano ----------------
  function etymQuestions(stage, local, far, wikiLocal, ents, wdNamed = []) {
    const qs = [];
    const isHuman = (qid) => K.wd.items(ents[qid], 'P31').includes('Q5');
    const allEtym = K.uniqBy(local.items.concat(far.items).filter((i) => i.etym && ents[i.etym]), (i) => i.etym)
      .map((i) => i.etym).concat(wdNamed.filter((w) => ents[w.named]).map((w) => w.named));
    const subjects = [];
    for (const w of K.uniqBy(wdNamed.filter((x) => x.dist <= stage.wikiR && ents[x.qid] && ents[x.named]), (x) => x.qid)) {
      const label = K.wd.label(ents[w.qid]);
      if (!label || K.isBanned(label)) continue;
      subjects.push({ what: label, qid: w.named, source: { name: 'Wikidata', url: `https://www.wikidata.org/wiki/${w.qid}` } });
    }
    for (const st of K.uniqBy(local.items.filter((i) => i.cat === 'street' && i.etym && ents[i.etym]), (i) => K.norm(i.name))) {
      subjects.push({ what: st.name, qid: st.etym, source: osmLink(st) });
    }
    for (const w of wikiLocal) {
      for (const q of K.wd.items(ents[w.qid], 'P138')) {
        if (ents[q]) subjects.push({ what: w.title, qid: q, source: { name: 'Wikipedia / Wikidata', url: w.url } });
      }
    }
    const pool = [...new Set(allEtym.concat(subjects.map((s) => s.qid)))];
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
        // Ime je u nazivu, pa pitamo ko je to bio (opis sa Vikidate, na istom jeziku kao tačan)
        if (!desc) continue;
        const lang = K.wd.descLang(ents[s.qid]);
        q = makeQ({
          cat: 'etym', text: K.t('q.etym.who', { what: s.what, label }),
          correct: cap(desc), wrongs: K.shuffle(others.filter((o) => K.wd.descLang(ents[o]) === lang).map((o) => cap(K.wd.desc(ents[o]))).filter(Boolean)),
          explain: `${label} — ${desc} (Wikidata ${s.qid}).`, source: s.source,
          fact: K.t('q.etym.fact', { what: s.what, label, desc })
        });
      } else {
        q = makeQ({
          cat: 'etym', text: K.t('q.etym.after', { what: s.what }),
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
        cat: 'wikiNear', text: K.t('q.wikiNear', { scope: stage.label }),
        correct: w.title, names: true, wrongs: similar(w.title, farTitlesFor(w.lang)),
        explain: K.t('q.wikiNear.explain', { title: w.title, scope: stage.label }) +
          (w.extract ? ' ' + w.extract.slice(0, 160) + (w.extract.length > 160 ? '…' : '') : ''),
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
        cat: 'wikiText', text: K.t('q.wikiText', { txt }),
        correct: w.title, wrongs: others,
        explain: K.t('q.wikiText.explain', { title: w.title }),
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
      const years = numeric(y, step, (v) => Math.round(v));
      const ok = years.wrongs.filter((v) => v <= now);
      while (ok.length < 3) ok.push(y - (ok.length + 4) * step);
      const q = makeQ({
        cat: 'wikiYear', text: K.t('q.wikiYear', { title: w.title }),
        correct: K.fmtYear(y), wrongs: ok.map(K.fmtYear),
        explain: K.t('q.wikiYear.explain', { qid: w.qid, year: K.fmtYear(y) }),
        source: { name: 'Wikidata', url: `https://www.wikidata.org/wiki/${w.qid}` }
      });
      if (q) qs.push(q);
    }
    return qs;
  }

  // ---------------- GBIF: ptice ----------------
  K.birdQuestions = async function (birds, label) {
    if (!birds || birds.species.length < 6 || birds.species[0].count < 20) return [];
    const top = birds.species[0];
    // netačni: vrste koje su ovde ređe zabeležene (6.–25. mesto), sa jasno manjim brojem nalaza
    const lower = birds.species.slice(5).filter((s) => s.count < top.count * 0.8);
    if (lower.length < 3) return [];
    const picks = lower.slice().sort((a, b) => String(a.key).localeCompare(String(b.key))).slice(0, 5); // stabilno
    const names = await Promise.all([top, ...picks].map((s) => K.speciesName(s.key).catch(() => null)));
    if (!names[0]) return [];
    const q = makeQ({
      cat: 'birds', text: K.t('q.birds', { scope: label }),
      correct: names[0].label, wrongs: names.slice(1).filter(Boolean).map((n) => n.label),
      explain: K.t('q.birds.explain', { name: names[0].label, n: K.fmtNum(top.count, 0), total: K.fmtNum(birds.total, 0) }),
      source: { name: 'GBIF', url: birds.url }
    });
    return q ? [q] : [];
  };

  // ---------------- Zanatlije, usluge i radnje (OSM + Overture) ----------------
  // Izvori nisu potpuni, zato pitanja kažu „prema otvorenim mapama“ i nude link za dopunu OSM-a.
  K.serviceQuestions = function (stage, services) {
    const qs = [];
    const mapUrl = `https://www.openstreetmap.org/#map=17/${stage.lat.toFixed(5)}/${stage.lon.toFixed(5)}`;
    const src = { name: K.t('src.svc'), url: mapUrl };
    const local = services.filter((s) => s.inside);
    const count = {};
    for (const s of local) count[s.kind] = (count[s.kind] || 0) + 1;
    const nearest = {};
    for (const s of services) if (!nearest[s.kind] || s.d < nearest[s.kind].d) nearest[s.kind] = s;
    const kinds = Object.keys(K.SERVICES);
    const one = K.svcOne, many = K.svcMany;
    const scope = stage.label;

    // 1) Koliko ih ima (prednost zanatlijama i majstorima)
    const TRADES = new Set(['shoemaker', 'tailor', 'plumber', 'electrician', 'tyres', 'locksmith', 'hvac', 'carpenter',
      'watches', 'glazier', 'appliance', 'car_repair', 'florist', 'hairdresser', 'dry_cleaning',
      'health_food', 'cafe', 'kids_play', 'playground', 'ice_cream']);
    const countable = K.shuffle(kinds.filter((k) => (count[k] || 0) >= (TRADES.has(k) ? 1 : 2)))
      .sort((a, b) => (TRADES.has(b) ? 1 : 0) - (TRADES.has(a) ? 1 : 0));
    const full = stage.complete !== false;
    for (const k of (full ? countable : []).slice(0, 2)) {
      const c = count[k];
      const step = Math.max(1, Math.round(c * 0.35));
      const pats = [[-3, -2, -1], [-2, -1, 1], [-1, 1, 2], [1, 2, 3]].filter((p) => c + p[0] * step >= 0);
      const p = K.pick(pats);
      const q = makeQ({
        cat: 'svcCount', text: K.t('q.svcCount', { many: many(k), one: one(k), scope }),
        correct: String(c), wrongs: p.map((x) => String(c + x * step)),
        explain: K.t('q.svcCount.explain', { n: c, one: one(k), scope }), source: src,
        fact: K.t('q.svcCount.fact', { n: c, many: many(k), one: one(k) })
      });
      if (q) qs.push(q);
    }

    // 2) Čega ima najviše
    const ranked = kinds.filter((k) => count[k]).sort((a, b) => count[b] - count[a]);
    if (full && ranked.length >= 4 && count[ranked[0]] - count[ranked[1]] >= 2) {
      const opts = [ranked[0], ...K.shuffle(ranked.slice(1)).slice(0, 3)];
      const q = makeQ({
        cat: 'svcMost', text: K.t('q.svcMost', { scope }),
        correct: cap(one(opts[0])), wrongs: opts.slice(1).map((k) => cap(one(k))),
        explain: opts.map((k) => `${one(k)}: ${count[k]}`).join(', ') + '.', source: src
      });
      if (q) qs.push(q);
    }

    // 3) Šta je najbliže
    const near = kinds.filter((k) => nearest[k] && nearest[k].d < 1500).sort((a, b) => nearest[a].d - nearest[b].d);
    if (near.length >= 4 && nearest[near[1]].d - nearest[near[0]].d >= 120) { // oba mesta mogu biti „pomerena“ do 50 m
      const opts = [near[0], ...K.shuffle(near.slice(1, 8)).slice(0, 3)];
      const q = makeQ({
        cat: 'svcNear', text: K.t('q.svcNear'),
        correct: cap(one(opts[0])), wrongs: opts.slice(1).map((k) => cap(one(k))),
        explain: K.t('q.svcNear.explain', { list: opts.map((k) => `${one(k)}: ${meters(nearest[k].d)}`).join(', ') }), source: src
      });
      if (q) qs.push(q);
    }

    // 4) Koliko je daleko najbliže mesto neke vrste
    const BINS = [[0, 150, 'q.bin1'], [150, 400, 'q.bin2'], [400, 800, 'q.bin3'], [800, 1e9, 'q.bin4']];
    for (const k of K.shuffle(kinds.filter((k) => nearest[k] && nearest[k].d < 2000))) {
      const d = nearest[k].d;
      const bin = BINS.find((b) => d >= b[0] && d < b[1]);
      if (BINS.some((b) => Math.abs(d - b[0]) < 60 && b[0] > 0)) continue; // preblizu granice (tačka je pomerena do 50 m)
      const labels = BINS.map((b) => K.t(b[2]));
      const q = makeQ({
        cat: 'svcDist', text: K.t('q.svcDist', { one: one(k) }),
        correct: K.t(bin[2]), wrongs: labels.filter((l) => l !== K.t(bin[2])),
        explain: K.t('q.svcDist.explain', { one: one(k), name: nearest[k].name ? ` („${nearest[k].name}“)` : '', d: meters(d) }), source: src
      });
      if (q) { q.options = labels; q.answer = labels.indexOf(K.t(bin[2])); qs.push(q); }
      break;
    }

    // 5) Koju radnju imaš u kraju (ostale nisu na mapi ni u dvostruko većem krugu)
    const have = kinds.filter((k) => count[k]);
    const lack = kinds.filter((k) => !count[k] && nearest[k] && nearest[k].d > (stage.radius || 800) * 1.8);
    if (full && have.length && lack.length >= 3) {
      const k = K.pick(have);
      const q = makeQ({
        cat: 'svcHave', text: K.t('q.svcHave', { scope }),
        correct: cap(one(k)), wrongs: K.shuffle(lack).map((x) => cap(one(x))),
        explain: K.t('q.svcHave.explain', { scope, one: one(k) }), source: src
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
        cat: 'svcName', names: true, text: K.t('q.svcName', { one: one(s.kind), scope }),
        correct: s.name, wrongs: similar(s.name, pool),
        explain: K.t('q.svcName.explain', { name: s.name, src: s.src, scope, d: meters(s.d) }),
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
    const src = { name: K.t('src.transit'), url: 'https://transitous.org/sources/' };
    const localLabels = new Set(tr.local.flatMap((s) => s.lines.map((l) => l.label)));
    const farLines = K.uniqBy(tr.far.flatMap((s) => s.lines).filter((l) => !localLabels.has(l.label)), (l) => l.label);

    // 1) Koja linija staje na stanici X
    for (const s of K.shuffle(tr.local)) {
      if (qs.length >= 1) break;
      const l = K.pick(s.lines);
      const same = farLines.filter((x) => x.mode === l.mode).map((x) => x.label);
      const lines = s.lines.map((x) => x.label);
      const q = makeQ({
        cat: 'transit', text: K.t('q.transit', { stop: s.name }),
        correct: l.label, wrongs: K.shuffle(same).concat(K.shuffle(farLines.map((x) => x.label))),
        explain: K.t('q.transit.explain', { stop: s.name, lines: lines.slice(0, 8).join(', '), agency: l.agency ? ` (${l.agency})` : '' }),
        fact: K.t('q.transit.fact', { stop: s.name, lines: lines.slice(0, 5).join(', ') }),
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
      const lineHeads = new Set(s.lines.filter((x) => x.label === l.label).flatMap((x) => [...x.heads]).map(K.norm));
      const q = makeQ({
        cat: 'transit', names: true, text: K.t('q.transitHead', { line: l.label, stop: s.name }),
        correct: head, wrongs: K.shuffle(allHeads.filter((h) => !lineHeads.has(K.norm(h)))),
        explain: K.t('q.transitHead.explain', { line: cap(l.label), stop: s.name, heads: [...l.heads].join(' / ') }),
        source: src
      });
      if (q) qs.push(q);
    }
    return qs;
  };

  // ---------------- Pokaži na mapi ----------------
  // Igrač klikne gde misli da je objekat; poeni po udaljenosti, „tačno“ ako je unutar praga
  K.mapQuestions = function (stage, local, services) {
    const qs = [];
    const WHAT = { school: 1, kindergarten: 1, park: 1, monument: 1 };
    const cands = K.shuffle(local.items.filter((i) => WHAT[i.cat] && i.lat != null && stage.inside(i.lat, i.lon)))
      .map((i) => ({ name: i.name, what: K.t('what.' + i.cat), lat: i.lat, lon: i.lon, tol: i.cat === 'park' ? 220 : 150, url: `https://www.openstreetmap.org/#map=18/${i.lat.toFixed(5)}/${i.lon.toFixed(5)}` }))
      .concat(K.shuffle((services || []).filter((s) => s.inside && s.name && ['bakery', 'pharmacy', 'florist', 'shoemaker', 'tailor', 'tyres', 'locksmith'].includes(s.kind)))
        .map((s) => ({ name: s.name, what: K.svcOne(s.kind), lat: s.lat, lon: s.lon, tol: 150, url: `https://www.openstreetmap.org/#map=19/${s.lat.toFixed(5)}/${s.lon.toFixed(5)}` })));
    for (const c of K.uniqBy(cands, (c) => K.norm(c.name)).slice(0, 1)) { // jedno pitanje sa mapom po kvizu
      qs.push({
        cat: 'mapPin', type: 'map', text: K.t('q.map', { what: c.what, name: c.name }),
        options: [], answer: -1, target: { lat: c.lat, lon: c.lon, tol: c.tol },
        explain: K.t('q.map.explain', { what: cap(c.what), name: c.name, tol: c.tol }),
        source: { name: 'OpenStreetMap / Overture', url: c.url }, outsider: false
      });
    }
    return qs;
  };

  // ---------------- Nadmorska visina tačke igrača ----------------
  K.elevationQuestions = function (h, kraj) {
    const v = Math.round(h);
    const step = v < 60 ? 15 : v < 300 ? 30 : 60;
    const n = numeric(v, step, (x) => `${K.fmtNum(Math.round(x), 0)} m`, v > 5 ? 2 : -Infinity);
    const q = makeQ({
      cat: 'elev', text: K.t('q.elev', { kraj: kraj || '—' }), ...n,
      explain: K.t('q.elev.explain', { h: n.correct }),
      fact: K.t('q.elev.fact', { h: n.correct }),
      source: { name: 'Open-Meteo Elevation API', url: 'https://open-meteo.com/en/docs/elevation-api' }
    });
    return q ? [q] : [];
  };

  // ---------------- Strana sveta: u kom pravcu od tvoje tačke je neki objekat ----------------
  K.dirQuestions = function (stage, local) {
    const qs = [];
    const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const bearing = (la1, lo1, la2, lo2) => {
      const r = Math.PI / 180, y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r);
      const x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
      return (Math.atan2(y, x) / r + 360) % 360;
    };
    for (const it of K.shuffle(local.items.filter((i) => i.cat !== 'street' && i.lat != null && stage.inside(i.lat, i.lon)))) {
      const d = K.dist(stage.lat, stage.lon, it.lat, it.lon);
      if (d < 350) continue; // dovoljno daleko da pomak tačke od 50 m menja ugao najviše ~8°
      const b = bearing(stage.lat, stage.lon, it.lat, it.lon);
      const off = (b + 22.5) % 45;
      if (off < 10 || off > 35) continue; // bar 10° od granice dva pravca
      const i = Math.floor(((b + 22.5) % 360) / 45);
      // netačni: suprotan i dva bočna pravca (nikad susedni, da odgovor ne bude sporan)
      const opts = [i, (i + 4) % 8, (i + 2) % 8, (i + 6) % 8].map((k) => K.t('dir.' + DIRS[k]));
      const q = makeQ({
        cat: 'dir', text: K.t('q.dir', { name: it.name }),
        correct: opts[0], wrongs: opts.slice(1),
        explain: K.t('q.dir.explain', { name: it.name, dir: opts[0], d: meters(d) }),
        source: { name: 'OpenStreetMap', url: `https://www.openstreetmap.org/#map=18/${it.lat.toFixed(5)}/${it.lon.toFixed(5)}` }
      });
      if (q) { qs.push(q); break; }
    }
    return qs;
  };

  // ---------------- Lanac i kuhinja (Overture Places) ----------------
  // lanci: samo prodavnice, ugostiteljstvo, apoteke, banke i pumpe (ne paketomati, punjači i sl.)
  const RETAIL = /store|shop|market|grocery|pharmacy|drugstore|bakery|restaurant|cafe|coffee|bar$|fast_food|fuel|gas_station|bank|optician|hotel/;
  const NOT_CHAIN = /locker|charg|ubitricity|box ?now|paket|parcel|automat|atm\b|bäder|dom zdravlja/i;
  // kuhinje koje imaju prevod (Overture kategorija bez nastavka _restaurant)
  K.CUISINES = ['pizza', 'italian', 'burger', 'chinese', 'doner_kebab', 'sushi', 'japanese', 'greek', 'mexican', 'indian', 'thai',
    'turkish', 'french', 'german', 'vietnamese', 'barbecue', 'seafood', 'asian', 'american', 'spanish', 'korean', 'middle_eastern',
    'mediterranean', 'vegan', 'vegetarian', 'eastern_european', 'balkan', 'steakhouse', 'chicken'];

  K.overtureQuestions = function (stage, places) {
    const qs = [];
    const inside = (places || []).filter((p) => stage.inside(p.lat, p.lon));
    const src = { name: 'Overture Maps', url: `https://www.openstreetmap.org/#map=16/${stage.lat.toFixed(5)}/${stage.lon.toFixed(5)}` };
    // 1) najzastupljeniji lanac
    const brands = {};
    for (const p of inside) if (p.brand && RETAIL.test(p.cat) && !NOT_CHAIN.test(p.brand)) brands[p.brand] = (brands[p.brand] || 0) + 1;
    const bl = Object.entries(brands).sort((a, b) => b[1] - a[1]);
    if (bl.length >= 4 && bl[0][1] >= 2 && bl[0][1] > bl[1][1]) {
      const q = makeQ({
        cat: 'chain', names: true, text: K.t('q.chain', { scope: stage.label }),
        correct: bl[0][0], wrongs: K.shuffle(bl.slice(1, 12).map((b) => b[0])),
        explain: K.t('q.chain.explain', { list: bl.slice(0, 4).map((b) => `${b[0]}: ${b[1]}`).join(', ') }), source: src,
        fact: K.t('q.chain.explain', { list: bl.slice(0, 3).map((b) => `${b[0]}: ${b[1]}`).join(', ') })
      });
      if (q) qs.push(q);
    }
    // 2) najčešća kuhinja u restoranima
    const cz = {};
    for (const p of inside) {
      if (!/_restaurant$/.test(p.cat)) continue;
      const k = p.cat.replace(/_restaurant$/, '');
      if (K.CUISINES.includes(k)) cz[k] = (cz[k] || 0) + 1;
    }
    const cl = Object.entries(cz).sort((a, b) => b[1] - a[1]);
    if (cl.length >= 2 && cl[0][1] >= 2 && cl[0][1] > cl[1][1]) {
      const others = cl.slice(1).map((c) => c[0]).concat(K.shuffle(K.CUISINES.filter((c) => !cz[c])));
      const q = makeQ({
        cat: 'cuisine', text: K.t('q.cuisine', { scope: stage.label }),
        correct: cap(K.t('cuisine.' + cl[0][0])), wrongs: others.map((c) => cap(K.t('cuisine.' + c))),
        explain: K.t('q.cuisine.explain', { list: cl.slice(0, 4).map(([k, n]) => `${K.t('cuisine.' + k)}: ${n}`).join(', ') }), source: src
      });
      if (q) qs.push(q);
    }
    return qs;
  };

  // ---------------- Najstariji objekat u blizini (Wikidata P571) ----------------
  const NOT_OBJECT = new Set(['Q56061', 'Q1620908', 'Q3024240', 'Q6256', 'Q515', 'Q486972', 'Q123705', 'Q82794', 'Q2983893', 'Q1549591', 'Q5119']);
  K.oldestQuestions = function (stage, oldest, ents) {
    const now = new Date().getFullYear();
    const items = K.uniqBy((oldest || []).filter((o) => o.dist <= (stage.radius || 1000) && o.year <= now && ents[o.qid] &&
      !K.wd.items(ents[o.qid], 'P31').some((c) => NOT_OBJECT.has(c)) &&
      // teritorije (imaju stanovništvo ili površinu) nisu „objekti u kraju“
      !K.wd.claims(ents[o.qid], 'P1082').length && !K.wd.claims(ents[o.qid], 'P2046').length)
      .map((o) => ({ ...o, label: K.wd.label(ents[o.qid]) })).filter((o) => o.label && !K.isBanned(o.label)), (o) => K.norm(o.label))
      .sort((a, b) => a.year - b.year);
    if (items.length < 4) return [];
    const first = items[0];
    const later = items.filter((o) => o.year >= first.year + 5);
    if (later.length < 3) return [];
    const opts = [first, ...K.shuffle(later).slice(0, 3)];
    const q = makeQ({
      cat: 'oldest', names: true, text: K.t('q.oldest'),
      correct: first.label, wrongs: opts.slice(1).map((o) => o.label),
      explain: K.t('q.oldest.explain', { list: opts.slice().sort((a, b) => a.year - b.year).map((o) => `${o.label} (${K.fmtYear(o.year)})`).join(', ') }),
      source: { name: 'Wikidata', url: `https://www.wikidata.org/wiki/${first.qid}` },
      fact: K.t('q.oldest.fact', { name: first.label, year: K.fmtYear(first.year) })
    });
    return q ? [q] : [];
  };

  K.osmQuestions = osmQuestions;
  K.etymQuestions = etymQuestions;
  K.wikiQuestions = wikiQuestions;

  // ---------------- Izbor 10 pitanja ----------------
  K.selectQuiz = function (cands, n = 10) {
    const out = [];
    // bar 2 pitanja o zanatlijama i radnjama (prvo „koliko ih ima“), iz različitih šablona
    const svc = K.shuffle(cands.filter((q) => /^svc/.test(q.cat))).sort((a, b) => (b.cat === 'svcCount') - (a.cat === 'svcCount'));
    const svcCats = new Set();
    for (const q of svc) { if (svcCats.size >= 2) break; if (!svcCats.has(q.cat)) { svcCats.add(q.cat); out.push(q); } }
    // po jedno „pokaži na mapi“ i pitanje o gradskom prevozu, kad postoje
    for (const cat of ['mapPin', 'transit']) {
      const q = K.shuffle(cands.filter((x) => x.cat === cat))[0];
      if (q) out.push(q);
    }
    // ostalo: kružno po vrstama
    const rest = cands.filter((q) => !out.includes(q));
    const groups = {};
    for (const q of K.shuffle(rest)) (groups[q.cat] = groups[q.cat] || []).push(q);
    const order = K.shuffle(Object.keys(groups));
    let added = true;
    while (out.length < n && added) {
      added = false;
      for (const c of order) {
        if (out.length >= n) break;
        if (groups[c].length) { out.push(groups[c].shift()); added = true; }
      }
    }
    return K.shuffle(out);
  };
})(globalThis.Kviz = globalThis.Kviz || {});
