/* Aroundle — interfejs: izbor kraja, dnevni kviz, poeni i vreme, duel, deljenje i kartice */
(function (K) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const show = (el, on = true) => { el.hidden = !on; };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bez memorije */ } }
  };
  const playedKey = (place, day) => `kviz:played:${K.hoodKey(place)}:${day || K.today()}`;

  // ---------------- Jezik ----------------
  K.applyI18n();
  const sel = $('langSel');
  for (const [code, label] of Object.entries(K.LANGS)) {
    const o = document.createElement('option');
    o.value = code; o.textContent = label;
    sel.appendChild(o);
  }
  sel.value = K.lang;
  // promena jezika: statični tekstovi odmah; pitanja već započetog kviza ostaju na jeziku na kom su napravljena
  sel.addEventListener('change', () => {
    K.setLang(sel.value);
    if (place && !$('picked').hidden) setPoint(place.lat, place.lon, true);
  });

  let place = null;      // {lat, lon (tačka igrača), kraj, grad, country}
  let quiz = null;
  let idx = 0, score = 0, points = 0, answers = [];
  let duelFrom = null;   // {name, score, points, time, oks}
  let qStart = 0, quizStart = 0, tick = null;

  // ---------------- Mapa za izbor kraja ----------------
  const map = L.map('map').setView([44.8125, 20.4612], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  let marker = null, circle = null;
  map.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng));

  const HOOD = new Set(['neighbourhood', 'quarter', 'suburb', 'village', 'hamlet', 'isolated_dwelling']);

  // Privatnost: izabrana tačka se odmah pomera za 200 m u nasumičnom pravcu, PRE bilo kakvog slanja spoljnim servisima.
  // Pravac je zaista slučajan (crypto) i nigde se ne čuva, pa se prava tačka ne može izračunati ni uz javni kod.
  const SHIFT_M = 50; // privatnost uz savet da se ne bira kućna adresa; tolerancije pitanja su podešene na ovih 50 m
  function shift(lat, lon) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const a = (r[0] / 4294967296) * 2 * Math.PI;
    return [lat + (SHIFT_M * Math.cos(a)) / 111320, lon + (SHIFT_M * Math.sin(a)) / (111320 * Math.cos(lat * Math.PI / 180))];
  }

  async function setPoint(rawLat, rawLon, noShift) {
    const [lat, lon] = noShift ? [rawLat, rawLon] : shift(rawLat, rawLon); // već pomerena tačka se ne pomera ponovo
    show($('picked'));
    $('pickedName').textContent = K.t('pick.finding');
    $('build').disabled = true;
    let addr = null;
    try { addr = (await K.reverse(lat, lon)).address; } catch (e) { /* bez adrese */ }
    const p = K.placeFromAddress(addr, lat, lon);
    // kviz polazi od tačke koju je igrač izabrao; ime kraja dolazi od najbližeg kvarta/naselja na mapi
    try {
      const np = await K.nearestPlace(lat, lon);
      if (np && HOOD.has(np.cls) && np.d <= 1500) p.kraj = np.name;
      else if (np && !p.kraj) p.kraj = np.name;
    } catch (e) { /* ostaje ime iz adrese */ }
    place = { ...p, lat: +lat.toFixed(5), lon: +lon.toFixed(5) };
    if (marker) { marker.setLatLng([place.lat, place.lon]); circle.setLatLng([place.lat, place.lon]); }
    else {
      marker = L.marker([place.lat, place.lon]).addTo(map).bindTooltip(K.t('pick.marker'));
      circle = L.circle([place.lat, place.lon], { radius: 1000, color: '#1f6f5c', weight: 2, fillOpacity: 0.08 }).addTo(map);
    }
    map.setView([place.lat, place.lon], 14);
    $('pickedName').textContent = [place.kraj, place.grad].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') || K.t('pick.unknown');
    const done = store.get(playedKey(place));
    $('build').disabled = !!done;
    show($('cacheInfo'), !!done);
    if (done) $('cacheInfo').textContent = done.state === 'done'
      ? K.t('pick.playedDone', { score: done.score, n: done.n, points: K.fmtNum(done.points, 0) })
      : K.t('pick.playedStarted');
  }

  // ---------------- Pretraga ----------------
  $('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('q').value.trim();
    if (!q) return;
    const ul = $('results');
    ul.innerHTML = `<li class="muted">${K.esc(K.t('search.loading'))}</li>`;
    show(ul);
    try {
      const res = await K.geocode(q);
      if (!res.length) { ul.innerHTML = `<li class="muted">${K.esc(K.t('search.none'))}</li>`; return; }
      ul.innerHTML = '';
      for (const r of res) {
        const li = document.createElement('li');
        li.tabIndex = 0;
        li.textContent = K.toLatin(r.display_name);
        const go = () => { show(ul, false); setPoint(+r.lat, +r.lon); };
        li.addEventListener('click', go);
        li.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); });
        ul.appendChild(li);
      }
    } catch (err) {
      ul.innerHTML = `<li class="muted">${K.esc(K.t('search.fail', { err: err.message }))}</li>`;
    }
  });
  $('locate').addEventListener('click', () => {
    if (!navigator.geolocation) return alertBox(K.t('geo.unsupported'));
    $('locate').disabled = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        $('locate').disabled = false;
        setPoint(p.coords.latitude, p.coords.longitude);
        alertBox(K.t('geo.shifted'));
      },
      () => { $('locate').disabled = false; alertBox(K.t('geo.denied')); },
      { enableHighAccuracy: false, timeout: 15000 }
    );
  });
  function alertBox(msg) {
    const ul = $('results');
    ul.innerHTML = `<li class="muted">${K.esc(msg)}</li>`;
    show(ul);
  }

  // ---------------- Pravljenje (traka) ----------------
  $('build').addEventListener('click', start);

  async function start() {
    if (!place || store.get(playedKey(place))) return;
    $('build').disabled = true;
    show($('result'), false); show($('quiz'), false);
    show($('progress'));
    const log = $('log');
    log.innerHTML = '';
    const kraj = place.kraj || K.t('share.myHood');
    // Zabavne poruke dok se kviz pravi: ne otkrivaju odakle su podaci ni o čemu će biti pitanja
    const FUN = K.tList('load.fun');
    const said = [];
    const say = (m) => { $('status').textContent = m; };
    say(K.t('load.start', { kraj }));
    let funI = Math.floor(Math.random() * FUN.length);
    const funTimer = setInterval(() => { say(said.length ? said.shift() : FUN[funI++ % FUN.length]); }, 1700);
    const react = (msg) => {
      let m;
      if ((m = /: (\d+) objekata i (\d+) radnji/.exec(msg))) said.push(K.t(+m[1] > 70 ? 'load.streets' : 'load.calm'), K.t(+m[2] > 60 ? 'load.shops' : 'load.near'));
      else if ((m = /: (\d+) stanica u kraju/.exec(msg)) && +m[1] > 2) said.push(K.t('load.transit'));
      else if ((m = /: (\d+) nalaza ptica/.exec(msg))) said.push(K.t(+m[1] > 1000 ? 'load.birdsMany' : 'load.birdsFew'));
      else if ((m = /: (\d+) članaka u kraju/.exec(msg)) && +m[1] > 3) said.push(K.t('load.history'));
      else if ((m = /: (\d+) m nadmorske visine/.exec(msg))) said.push(K.t(+m[1] > 250 ? 'load.high' : 'load.flat'));
    };
    const addLog = (msg, cls) => {
      const li = document.createElement('li');
      if (cls) li.className = cls;
      li.textContent = msg;
      log.appendChild(li);
      if (cls === 'ok') react(msg);
    };
    const stopFun = () => clearInterval(funTimer);
    try {
      let q = K.cacheGet(place);
      if (!q) {
        q = await K.buildQuiz(place, addLog);
        if (!q.questions.length) { stopFun(); say(K.t('load.empty')); $('build').disabled = false; return; }
        K.cacheSet(place, q);
      }
      stopFun();
      show($('progress'), false);
      play(q);
    } catch (err) {
      stopFun(); say(K.t('load.error', { err: err.message }));
      $('build').disabled = false;
    }
  }

  // ---------------- Igra ----------------
  let qmap = null, pin = null;

  function play(q, from) {
    quiz = q; idx = 0; score = 0; points = 0; answers = []; duelFrom = from || null;
    // jedan pokušaj dnevno po kraju: računa se čim kviz počne
    store.set(playedKey(q.place, q.day), { state: 'started', n: q.questions.length });
    show($('pick'), false); show($('progress'), false); show($('result'), false);
    const notes = $('notes');
    const parts = (q.notes || []).map((n) => `<p>${K.esc(n)}</p>`);
    notes.className = 'notes';
    notes.innerHTML = parts.join('');
    if (duelFrom) {
      notes.className = 'intro-duel';
      notes.innerHTML = `<p>${K.t('quiz.duelIntro', { name: K.esc(duelFrom.name), kraj: K.esc(q.place.kraj || ''), score: duelFrom.score, n: q.questions.length, points: K.fmtNum(duelFrom.points || 0, 0), time: duelFrom.time || '?' })}</p>` + parts.join('');
    }
    show(notes, notes.innerHTML !== '');
    show($('quiz'));
    quizStart = performance.now();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function badge() {
    const t = Math.floor((performance.now() - qStart) / 1000);
    $('score').innerHTML = `<span class="qtimer">⏱ ${t} s</span> · <span class="pts">${K.fmtNum(points, 0)} p</span>`;
  }

  // OpenFreeMap stil bez natpisa (bez slojeva tipa "symbol"), da mapa ne oda odgovor
  let styleP = null;
  function nolabelStyle() {
    if (!styleP) {
      styleP = K.fetchJSON('https://tiles.openfreemap.org/styles/liberty', {}, 15000).then((s) => {
        s.layers = s.layers.filter((l) => l.type !== 'symbol');
        return s;
      });
      styleP.catch(() => { styleP = null; });
    }
    return styleP;
  }
  const ring = (lat, lon, r) => {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * 2 * Math.PI;
      pts.push([lon + (r / (111320 * Math.cos(lat * Math.PI / 180))) * Math.cos(a), lat + (r / 111320) * Math.sin(a)]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] } };
  };

  function render() {
    const q = quiz.questions[idx];
    $('qnum').textContent = K.t('quiz.num', { i: idx + 1, n: quiz.questions.length });
    $('qtext').textContent = q.text;
    const opts = $('opts');
    opts.innerHTML = '';
    show($('feedback'), false);
    show($('next'), false);
    const isMap = q.type === 'map';
    show($('qmap'), isMap); show($('pinBar'), isMap); show(opts, !isMap);
    if (qmap) { qmap.remove(); qmap = null; pin = null; }
    qStart = performance.now();
    clearInterval(tick);
    tick = setInterval(badge, 250);
    badge();
    if (isMap) {
      $('pinOk').disabled = true;
      $('pinOk').hidden = false;
      $('pinHint').textContent = K.t('quiz.pinHint');
      const myIdx = idx;
      nolabelStyle().then((style) => {
        if (idx !== myIdx || !quiz) return;
        qmap = new maplibregl.Map({ container: 'qmap', style, center: [quiz.place.lon, quiz.place.lat], zoom: 15.3, attributionControl: { compact: true } });
        qmap.addControl(new maplibregl.NavigationControl({ showCompass: false }));
        qmap.touchZoomRotate.disableRotation();
        const dot = document.createElement('div');
        dot.className = 'me-dot';
        dot.title = K.t('quiz.myPoint');
        new maplibregl.Marker({ element: dot }).setLngLat([quiz.place.lon, quiz.place.lat]).addTo(qmap);
        qmap.on('click', (e) => {
          if ($('pinOk').hidden) return;
          if (pin) pin.setLngLat(e.lngLat); else pin = new maplibregl.Marker({ color: '#b3261e' }).setLngLat(e.lngLat).addTo(qmap);
          $('pinOk').disabled = false;
          $('pinHint').textContent = K.t('quiz.pinMove');
        });
      }).catch((e) => { $('pinHint').textContent = K.t('quiz.mapFail', { err: e.message }); });
      return;
    }
    q.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.textContent = o;
      b.addEventListener('click', () => answer(i));
      opts.appendChild(b);
    });
  }

  // Poeni: tačan odgovor 500 + do 500 za brzinu (do 3 s puno, posle 20 s ništa)
  const speedPts = (t) => Math.round(500 * Math.max(0, Math.min(1, (20 - t) / 17)));

  function feedback(ok, q, extra, got) {
    clearInterval(tick);
    const fb = $('feedback');
    fb.innerHTML = `<strong class="${ok ? 'ok' : 'bad'}">${K.t(ok ? 'quiz.right' : 'quiz.wrong')}</strong> <span class="pts">+${K.fmtNum(got, 0)} p</span> ` + extra +
      `${K.esc(q.explain)}` +
      (q.source && q.source.url ? `<span class="src">${K.t('quiz.source')} <a href="${K.esc(q.source.url)}" target="_blank" rel="noopener">${K.esc(q.source.name)}</a></span>` : '');
    show(fb);
    badge();
    $('next').textContent = K.t(idx + 1 < quiz.questions.length ? 'quiz.next' : 'quiz.result');
    show($('next'));
    $('next').focus();
  }

  function answer(i) {
    const q = quiz.questions[idx];
    const t = (performance.now() - qStart) / 1000;
    const ok = i === q.answer;
    const got = ok ? 500 + speedPts(t) : 0;
    if (ok) score++;
    points += got;
    answers.push({ q, chosen: i, ok, t, got });
    [...$('opts').children].forEach((b, j) => {
      b.disabled = true;
      if (j === q.answer) b.classList.add('right');
      else if (j === i) b.classList.add('wrong');
    });
    feedback(ok, q, ok ? '' : K.t('quiz.correctWas', { a: K.esc(q.options[q.answer]) }), got);
  }

  $('pinOk').addEventListener('click', () => {
    const q = quiz.questions[idx];
    if (!pin || !q.target || !qmap) return;
    const t = (performance.now() - qStart) / 1000;
    const p = pin.getLngLat();
    const d = K.dist(p.lat, p.lng, q.target.lat, q.target.lon);
    const ok = d <= q.target.tol;
    // mapa: poeni po udaljenosti (blizu = puno), plus manji bonus za brzinu
    const near = Math.max(0, Math.min(1, 1 - Math.max(0, d - 25) / 975)); // do 25 m pun pogodak, na 1 km nula
    const got = Math.round(near * (700 + 300 * Math.max(0, Math.min(1, (40 - t) / 30))));
    if (ok) score++;
    points += got;
    answers.push({ q, ok, dist: d, t, got });
    $('pinOk').hidden = true;
    const tg = [q.target.lon, q.target.lat];
    qmap.addSource('answer', { type: 'geojson', data: { type: 'FeatureCollection', features: [
      ring(q.target.lat, q.target.lon, q.target.tol),
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[p.lng, p.lat], tg] } }
    ] } });
    qmap.addLayer({ id: 'tol', type: 'fill', source: 'answer', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#2e7d32', 'fill-opacity': 0.15 } });
    qmap.addLayer({ id: 'miss', type: 'line', source: 'answer', filter: ['==', '$type', 'LineString'], paint: { 'line-color': ok ? '#2e7d32' : '#b3261e', 'line-width': 3, 'line-dasharray': [2, 2] } });
    new maplibregl.Marker({ color: '#2e7d32' }).setLngLat(tg).addTo(qmap);
    qmap.fitBounds([[Math.min(p.lng, tg[0]), Math.min(p.lat, tg[1])], [Math.max(p.lng, tg[0]), Math.max(p.lat, tg[1])]], { padding: 60, maxZoom: 17 });
    $('pinHint').textContent = '';
    feedback(ok, q, K.t('quiz.miss', { d: `${K.fmtNum(Math.round(d), 0)} m` }), got);
  });

  $('next').addEventListener('click', () => {
    idx++;
    if (idx < quiz.questions.length) render();
    else finish();
  });

  const answerText = (a) => (a.q.type === 'map' ? K.t('res.fromTarget', { d: `${K.fmtNum(Math.round(a.dist), 0)} m` }) : a.q.options[a.q.answer]);
  const grid = (oks) => oks.map((o) => (o ? '🟩' : '🟥')).join('');
  let result = null;   // {score, n, points, time, oks}

  function finish() {
    clearInterval(tick);
    if (qmap) { qmap.remove(); qmap = null; }
    show($('quiz'), false);
    const n = quiz.questions.length;
    const time = Math.round((performance.now() - quizStart) / 1000);
    result = { score, n, points, time, oks: answers.map((a) => a.ok) };
    store.set(playedKey(quiz.place, quiz.day), { state: 'done', ...result });
    const name = quiz.place.kraj || K.t('share.myHood');
    $('resTitle').textContent = `${score} / ${n}`;
    $('resPoints').textContent = K.t('res.points', { points: K.fmtNum(points, 0), time });
    $('resText').textContent = K.t(score / n >= 0.8 ? 'res.great' : score / n >= 0.5 ? 'res.ok' : 'res.low', { kraj: name });
    if (duelFrom) {
      $('cmpLine').textContent = K.t('res.cmp', { score, n, time, name: duelFrom.name, hisScore: duelFrom.score, hisTime: duelFrom.time || '?' });
      const mine = points, his = duelFrom.points || 0;
      $('cmpVerdict').textContent = K.t(mine > his ? 'res.win' : mine === his ? 'res.tie' : 'res.lose', { mine: K.fmtNum(mine, 0), his: K.fmtNum(his, 0), name: duelFrom.name });
      show($('duelResult'));
    } else show($('duelResult'), false);
    $('review').innerHTML = answers.map((a, i) => {
      const his = duelFrom && duelFrom.oks[i] != null ? ` <span class="muted small">(${K.esc(duelFrom.name)}: ${duelFrom.oks[i] ? '✓' : '✗'})</span>` : '';
      return `<li><span class="${a.ok ? 'r' : 'w'}">${a.ok ? '✓' : '✗'}</span> ${K.esc(a.q.text.split('\n')[0])} — <strong>${K.esc(answerText(a))}</strong> <span class="muted small">+${a.got} p</span>${his}</li>`;
    }).join('');
    show($('shareBox'), false);
    $('myName').value = store.get('kviz:name') || '';
    $('lbName').value = store.get('kviz:name') || '';
    lbMine = null; lbScope = 'near'; lbPeriod = 'day';
    show($('lbForm')); $('lbSubmit').disabled = false;
    lbShow();
    show($('result'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------- Rang-lista ----------------
  let lbScope = 'near', lbPeriod = 'day', lbMine = null;
  async function lbShow() {
    if (!quiz) return;
    const keys = K.lbKeys(quiz.place);
    document.querySelectorAll('.tabs [data-scope]').forEach((b) => b.classList.toggle('on', b.dataset.scope === lbScope));
    document.querySelector('.tabs [data-period]').classList.toggle('on', lbPeriod === 'all');
    $('lbList').innerHTML = `<li class="muted">${K.esc(K.t('lb.loading'))}</li>`;
    try {
      const rows = await K.lbTop(lbScope, keys[lbScope], lbPeriod);
      $('lbList').innerHTML = rows.length ? rows.map((r) =>
        `<li class="${lbMine && r.name === lbMine.name && r.points === lbMine.points ? 'me' : ''}">${K.esc(r.name)} · <strong>${K.fmtNum(r.points, 0)}</strong> p · ${r.correct}/${r.total} · ${r.secs}s <span class="muted small">(${K.esc(r.hood_name)})</span></li>`
      ).join('') : `<li class="muted">${K.esc(K.t('lb.empty'))}</li>`;
      const label = lbScope === 'continent' ? (keys.continent ? K.t('cont.' + keys.continent) : K.t('lb.continent')) : lbScope === 'near' ? K.t('lb.nearLabel', { kraj: quiz.place.kraj || '' }) : lbScope === 'city' ? (quiz.place.grad || K.t('lb.city')) : lbScope === 'country' ? ((quiz.place.country || '').toUpperCase() || K.t('lb.country')) : K.t('lb.worldLabel');
      $('lbMsg').textContent = `${K.t(lbPeriod === 'all' ? 'lb.ever' : 'lb.today')}: ${label}.` + (lbMine && lbMine.rank ? K.t('lb.myRank', { rank: lbMine.rank[lbScope] }) : '');
    } catch (e) {
      $('lbList').innerHTML = '';
      $('lbMsg').textContent = location.hostname === 'localhost' ? K.t('lb.local') : K.t('lb.down', { err: e.message });
    }
  }
  document.querySelectorAll('.tabs [data-scope]').forEach((b) => b.addEventListener('click', () => { lbScope = b.dataset.scope; lbShow(); }));
  document.querySelector('.tabs [data-period]').addEventListener('click', () => { lbPeriod = lbPeriod === 'all' ? 'day' : 'all'; lbShow(); });
  $('lbSubmit').addEventListener('click', async () => {
    const name = $('lbName').value.trim() || K.t('share.defaultName');
    store.set('kviz:name', name);
    $('lbSubmit').disabled = true;
    try {
      const r = await K.lbSubmit(quiz.place, name, result);
      lbMine = { name, points: result.points, rank: r.rank };
      show($('lbForm'), false);
    } catch (e) {
      $('lbMsg').textContent = K.t('lb.fail', { err: e.message });
      $('lbSubmit').disabled = false;
      return;
    }
    lbShow();
  });

  $('returnBtn').addEventListener('click', () => {
    show($('result'), false);
    show($('pick'));
    alertBox(K.t('res.returnHint', { name: duelFrom ? duelFrom.name : K.t('share.defaultName') }));
    setTimeout(() => map.invalidateSize(), 50);
  });
  $('newPlace').addEventListener('click', () => {
    show($('result'), false);
    show($('pick'));
    setTimeout(() => map.invalidateSize(), 50);
  });

  // ---------------- Izazov, tekst za Viber/WhatsApp, kartice ----------------
  let share = { text: '', url: '' };
  $('makeDuel').addEventListener('click', async () => {
    const me = $('myName').value.trim();
    store.set('kviz:name', me);
    $('makeDuel').disabled = true;
    try {
      const code = await K.duelEncode(quiz, me || K.t('share.defaultName'), result);
      const url = K.duelLink(code);
      const kraj = quiz.place.kraj || K.t('share.myHood');
      const text = K.t('share.text', { kraj, grid: grid(result.oks), score: result.score, n: result.n, time: result.time });
      share = { text, url };
      $('shareText').textContent = `${text} ${url.slice(0, 48)}…`;
      const enc = encodeURIComponent;
      $('shareWa').href = `https://wa.me/?text=${enc(text + ' ' + url)}`;
      $('shareViber').href = `viber://forward?text=${enc(text + ' ' + url)}`;
      $('shareTg').href = `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`;
      $('shareFb').href = `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
      $('shareX').href = `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`;
      $('shareMsg').textContent = K.t('share.linkInfo');
      show($('cardPreview'), false);
      show($('shareBox'));
    } catch (e) {
      $('shareMsg').textContent = K.t('share.fail', { err: e.message });
      show($('shareBox'));
    } finally { $('makeDuel').disabled = false; }
  });
  $('shareNative').addEventListener('click', async () => {
    if (navigator.share) { navigator.share({ title: 'Aroundle', text: share.text, url: share.url }).catch(() => {}); return; }
    copyText();
  });
  async function copyText() {
    try {
      await navigator.clipboard.writeText(`${share.text} ${share.url}`);
      $('shareMsg').textContent = K.t('share.copied');
    } catch (e) { $('shareMsg').textContent = K.t('share.copyDenied'); }
  }
  $('shareCopyText').addEventListener('click', copyText);

  // Zanimljiva činjenica za karticu (nikad adresa)
  function funFact() {
    const pref = ['etym', 'transit', 'svcCount', 'wikiYear', 'elev', 'birds', 'svcMost', 'wikiNear'];
    for (const c of pref) {
      const q = quiz.questions.find((x) => x.cat === c && x.explain);
      if (q) { const s = q.fact || q.explain.split(/(?<=\.)\s/)[0]; return s.length > 150 ? s.slice(0, 147) + '…' : s; }
    }
    return '';
  }
  function wrap(ctx, text, maxW) {
    const words = text.split(/\s+/), lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  // Kartica u bojama brenda: crvena #D7262E, krem #F5E9D0, plava #1F3A93, crni obrisi
  const RED = '#D7262E', CREAM = '#F5E9D0', BLUE = '#1F3A93', INK = '#1a1a1a';
  const imgCache = {};
  const loadImg = (src) => imgCache[src] || (imgCache[src] = new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }));
  function rrect(x, X, Y, W, H, R) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, W, H, R); else x.rect(X, Y, W, H); }
  function dots(x, w, h) {
    x.fillStyle = CREAM; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(31,58,147,0.35)';
    for (let yy = 10; yy < h; yy += 22) for (let xx = (yy / 22) % 2 ? 21 : 10; xx < w; xx += 22) { x.beginPath(); x.arc(xx, yy, 2.4, 0, 7); x.fill(); }
  }
  // Naslov kraja u stilu logoa: crvena slova sa crnim obrisom (font Bangers)
  function comicText(x, text, X, Y, size, align = 'left') {
    x.font = `${size}px Bangers, Impact, "Arial Black", sans-serif`;
    x.textAlign = align; x.lineJoin = 'round';
    x.lineWidth = size * 0.14; x.strokeStyle = INK; x.strokeText(text, X, Y);
    x.fillStyle = RED; x.fillText(text, X, Y);
    x.textAlign = 'left';
  }
  // Panel sa rezultatom: kvadrati, X/10, poeni, „Znaš li?“
  function resultPanel(x, X, Y, W, H, F) {
    rrect(x, X, Y, W, H, 28); x.fillStyle = '#FFFAF0'; x.fill(); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
    const pad = 36;
    const n = result.oks.length, gap = 10, sz = Math.min(64, (W - 2 * pad - gap * (n - 1)) / n);
    const gx = X + (W - (n * sz + (n - 1) * gap)) / 2;
    let y = Y + pad;
    result.oks.forEach((o, i) => { rrect(x, gx + i * (sz + gap), y, sz, sz, 10); x.fillStyle = o ? '#2e9e4f' : RED; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke(); });
    y += sz + 112; // veliki rezultat ne sme da dodiruje kvadrate
    x.fillStyle = INK; x.font = `120px Bangers, Impact, sans-serif`; x.textAlign = 'center';
    x.fillText(`${result.score}/${result.n}`, X + W / 2, y);
    x.font = `600 38px ${F}`; x.fillStyle = BLUE;
    x.fillText(K.t('card.points', { points: K.fmtNum(result.points, 0), time: result.time }), X + W / 2, y + 54);
    x.textAlign = 'left';
    y += 100;
    const fact = funFact();
    if (fact && y + 120 < Y + H) {
      x.fillStyle = RED; x.font = `34px Bangers, Impact, sans-serif`;
      x.fillText(K.t('card.fact'), X + pad, y);
      x.fillStyle = INK; x.font = `500 34px ${F}`;
      const maxLines = Math.max(1, Math.floor((Y + H - y - 30) / 44));
      wrap(x, fact, W - 2 * pad).slice(0, maxLines).forEach((l, i) => x.fillText(l, X + pad, y + 46 + i * 44));
    }
  }
  async function drawCard(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const F = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    try { await document.fonts.load('80px Bangers'); } catch (e) { /* bez fonta, rezervni */ }
    const kraj = quiz.place.kraj || K.t('share.myHood');
    if (h > w) {
      // Story: zvanična story slika (logo u sredini), ime kraja gore, rezultat dole
      try { x.drawImage(await loadImg('assets/brand/story-1080x1920.png'), 0, 0, w, h); } catch (e) { dots(x, w, h); }
      const lines = wrap(x, kraj, w - 120);
      comicText(x, kraj.length > 22 ? kraj.slice(0, 21) + '…' : kraj, w / 2, 190, kraj.length > 14 ? 96 : 130, 'center');
      resultPanel(x, 70, 1290, w - 140, 520, F);
      const foot = `${K.t('card.footer')} · ${location.host || 'aroundle'}`;
      x.font = `600 32px ${F}`;
      const fw = x.measureText(foot).width + 48;
      rrect(x, (w - fw) / 2, h - 92, fw, 64, 32); x.fillStyle = CREAM; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
      x.fillStyle = BLUE; x.textAlign = 'center';
      x.fillText(foot, w / 2, h - 49);
      x.textAlign = 'left';
      void lines;
    } else {
      // Kvadrat: tačkice, logo gore levo, ime kraja desno, rezultat ispod
      dots(x, w, h);
      try { x.drawImage(await loadImg('assets/brand/aroundle-logo-512.png'), 40, 40, 330, 330); } catch (e) { /* bez logoa */ }
      x.fillStyle = INK; x.font = `600 36px ${F}`;
      x.fillText(K.t('card.top'), 400, 120);
      const kl = (kraj.length > 18 ? kraj.slice(0, 17) + '…' : kraj);
      comicText(x, kl, 400, 240, kl.length > 11 ? 84 : 110);
      resultPanel(x, 50, 400, w - 100, 620, F);
      x.fillStyle = BLUE; x.font = `600 28px ${F}`; x.textAlign = 'center';
      x.fillText(location.host || 'aroundle', w / 2, h - 22);
      x.textAlign = 'left';
    }
    return c;
  }
  async function shareCard(w, h, name) {
    const c = await drawCard(w, h);
    const url = c.toDataURL('image/png');
    $('cardPreview').src = url;
    show($('cardPreview'));
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: `${share.text} ${share.url}` }).catch(() => {});
    } else {
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      $('shareMsg').textContent = K.t('share.saved');
    }
  }
  $('cardStory').addEventListener('click', () => shareCard(1080, 1920, 'kviz-kraj-story.png'));
  // Instagram nema link za deljenje sa weba: na telefonu ide slika preko sistemskog „Podeli“ (izabereš Instagram),
  // a link se kopira da ga zalepiš kao „Link“ nalepnicu u story-ju
  $('shareIg').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(share.url); } catch (e) { /* bez kopiranja */ }
    await shareCard(1080, 1920, 'kviz-kraj-story.png');
    $('shareMsg').textContent = K.t('share.ig');
  });
  $('cardSquare').addEventListener('click', () => shareCard(1080, 1080, 'kviz-kraj.png'));

  // ---------------- Otvoren link izazova (#duel=…) ----------------
  async function openDuelFromHash() {
    const m = /#duel=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return;
    try {
      const d = await K.duelDecode(m[1]);
      history.replaceState(null, '', location.pathname);
      const prev = store.get(playedKey(d.quiz.place, d.quiz.day));
      if (prev) { alertBox(K.t('duel.played', { kraj: d.quiz.place.kraj, day: d.quiz.day, res: prev.score != null ? prev.score + '/' + prev.n : K.t('duel.started') })); return; }
      play(d.quiz, d.from);
    } catch (e) {
      alertBox(K.t('duel.bad', { err: e.message }));
    }
  }
  openDuelFromHash();
  window.addEventListener('hashchange', openDuelFromHash);
})(globalThis.Kviz);
