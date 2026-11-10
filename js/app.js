/* Kviz — interfejs: izbor kraja, dnevni kviz, poeni i vreme, duel, deljenje i kartice */
(function (K) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const show = (el, on = true) => { el.hidden = !on; };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bez memorije */ } }
  };
  const playedKey = (place, day) => `kviz:played:${K.hoodKey(place)}:${day || K.today()}`;

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

  async function setPoint(lat, lon) {
    show($('picked'));
    $('pickedName').textContent = 'tražim kraj…';
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
      marker = L.marker([place.lat, place.lon]).addTo(map).bindTooltip('tvoja tačka');
      circle = L.circle([place.lat, place.lon], { radius: 1000, color: '#1f6f5c', weight: 2, fillOpacity: 0.08 }).addTo(map);
    }
    map.setView([place.lat, place.lon], 14);
    $('pickedName').textContent = [place.kraj, place.grad].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') || 'nepoznat kraj';
    const done = store.get(playedKey(place));
    $('build').disabled = !!done;
    show($('cacheInfo'), !!done);
    if (done) $('cacheInfo').textContent = done.state === 'done'
      ? `Danas si već igrao ovaj kraj: ${done.score}/${done.n} · ${K.fmtNum(done.points, 0)} poena. Novi kviz za ovaj kraj stiže sutra.`
      : 'Danas si već započeo kviz za ovaj kraj. Novi kviz stiže sutra.';
  }

  // ---------------- Pretraga ----------------
  $('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('q').value.trim();
    if (!q) return;
    const ul = $('results');
    ul.innerHTML = '<li class="muted">Tražim…</li>';
    show(ul);
    try {
      const res = await K.geocode(q);
      if (!res.length) { ul.innerHTML = '<li class="muted">Ništa nije nađeno.</li>'; return; }
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
      ul.innerHTML = `<li class="muted">Pretraga nije uspela (${K.esc(err.message)}).</li>`;
    }
  });
  $('locate').addEventListener('click', () => {
    if (!navigator.geolocation) return alertBox('Pregledač ne podržava lokaciju.');
    $('locate').disabled = true;
    navigator.geolocation.getCurrentPosition(
      (p) => { $('locate').disabled = false; setPoint(p.coords.latitude, p.coords.longitude); },
      () => { $('locate').disabled = false; alertBox('Lokacija nije dozvoljena ili nije dostupna.'); },
      { enableHighAccuracy: false, timeout: 15000 }
    );
  });
  function alertBox(msg) {
    const ul = $('results');
    ul.innerHTML = `<li class="muted">${K.esc(msg)}</li>`;
    show(ul);
  }

  // ---------------- Pravljenje (traka) ----------------
  const FRIENDLY = {
    OpenStreetMap: 'ulice, škole, parkovi i stajališta', Overture: 'majstori, kafići i radnje',
    Vikipedija: 'istorija i poznata mesta', Wikidata: 'po kome su nazvane ulice i škole',
    GBIF: 'ptice iz kraja', Transitous: 'linije gradskog prevoza', 'Open-Meteo': 'nadmorska visina'
  };
  $('build').addEventListener('click', start);

  async function start() {
    if (!place || store.get(playedKey(place))) return;
    $('build').disabled = true;
    show($('result'), false); show($('quiz'), false);
    show($('progress'));
    const log = $('log');
    log.innerHTML = '';
    const kraj = place.kraj || 'tvoj kraj';
    // Zabavne poruke dok se kviz pravi: ne otkrivaju odakle su podaci ni o čemu će biti pitanja
    const FUN = ['Oh, interesantno…', 'Opa, lep kraj!', 'Hmm, da vidimo…', 'Pitam komšije…', 'Gledam gde se pije kafa ☕',
      'Tražim najbolju pekaru 🥐', 'Šetam po kraju 🚶', 'Zavirujem iza ćoška 👀', 'Brojim klupe… šalim se 😄', 'Još malo…'];
    const said = [];
    const say = (m) => { $('status').textContent = m; };
    say(`Upoznajem kraj ${kraj}…`);
    let funI = Math.floor(Math.random() * FUN.length);
    const funTimer = setInterval(() => { say(said.length ? said.shift() : FUN[funI++ % FUN.length]); }, 1700);
    const react = (msg) => {
      let m;
      if ((m = /: (\d+) objekata i (\d+) radnji/.exec(msg))) said.push(+m[1] > 70 ? 'Koliko ulicaaaa! 🛣️' : 'Mirno i lepo ovde 🌿', +m[2] > 60 ? 'Opa, koliko radnji! 🛍️' : 'Sve je nadohvat ruke 👌');
      else if ((m = /: (\d+) stanica u kraju/.exec(msg)) && +m[1] > 2) said.push('Ovde se lako stiže gradskim prevozom 🚌');
      else if ((m = /: (\d+) nalaza ptica/.exec(msg))) said.push(+m[1] > 1000 ? 'Ptičice pevaju 🐦' : 'Čuje se i poneka ptica 🐦');
      else if ((m = /: (\d+) članaka u kraju/.exec(msg)) && +m[1] > 3) said.push('Ovaj kraj ima istoriju! 📜');
      else if ((m = /: (\d+) m nadmorske visine/.exec(msg))) said.push(+m[1] > 250 ? 'Visoko si! ⛰️' : 'Lepo, ravno i prijatno 🙂');
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
        if (!q.questions.length) { stopFun(); say('Hmm, ovde nema dovoljno toga za kviz. Probaj tačku malo dalje.'); $('build').disabled = false; return; }
        K.cacheSet(place, q);
      }
      stopFun();
      show($('progress'), false);
      play(q);
    } catch (err) {
      stopFun(); say(`Ups, nešto je zapelo (${err.message}). Probaj ponovo.`);
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
      notes.innerHTML = `<p><strong>${K.esc(duelFrom.name)}</strong> te pita: „Koliko poznaješ MOJ kraj?“ (${K.esc(q.place.kraj || '')}) · ${duelFrom.score}/${q.questions.length} · ${K.fmtNum(duelFrom.points || 0, 0)} p · ${duelFrom.time || '?'} s</p>` + parts.join('');
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
    $('qnum').textContent = `Pitanje ${idx + 1} / ${quiz.questions.length}`;
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
      $('pinHint').textContent = 'Dodirni mapu gde misliš da je (mapu možeš da uvećaš prstima).';
      const myIdx = idx;
      nolabelStyle().then((style) => {
        if (idx !== myIdx || !quiz) return;
        qmap = new maplibregl.Map({ container: 'qmap', style, center: [quiz.place.lon, quiz.place.lat], zoom: 15.3, attributionControl: { compact: true } });
        qmap.addControl(new maplibregl.NavigationControl({ showCompass: false }));
        qmap.touchZoomRotate.disableRotation();
        const dot = document.createElement('div');
        dot.className = 'me-dot';
        dot.title = 'tvoja tačka';
        new maplibregl.Marker({ element: dot }).setLngLat([quiz.place.lon, quiz.place.lat]).addTo(qmap);
        qmap.on('click', (e) => {
          if ($('pinOk').hidden) return;
          if (pin) pin.setLngLat(e.lngLat); else pin = new maplibregl.Marker({ color: '#b3261e' }).setLngLat(e.lngLat).addTo(qmap);
          $('pinOk').disabled = false;
          $('pinHint').textContent = 'Možeš da pomeriš, pa potvrdi.';
        });
      }).catch((e) => { $('pinHint').textContent = `Mapa nije učitana (${e.message}).`; });
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
    fb.innerHTML = `<strong class="${ok ? 'ok' : 'bad'}">${ok ? 'Tačno!' : 'Netačno.'}</strong> <span class="pts">+${K.fmtNum(got, 0)} p</span> ` + extra +
      `${K.esc(q.explain)}` +
      (q.source && q.source.url ? `<span class="src">Izvor: <a href="${K.esc(q.source.url)}" target="_blank" rel="noopener">${K.esc(q.source.name)}</a></span>` : '');
    show(fb);
    badge();
    $('next').textContent = idx + 1 < quiz.questions.length ? 'Dalje' : 'Rezultat';
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
    feedback(ok, q, ok ? '' : `Tačan odgovor: <strong>${K.esc(q.options[q.answer])}</strong>. `, got);
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
    feedback(ok, q, `Promašaj: <strong>${K.fmtNum(Math.round(d), 0)} m</strong>. `, got);
  });

  $('next').addEventListener('click', () => {
    idx++;
    if (idx < quiz.questions.length) render();
    else finish();
  });

  const answerText = (a) => (a.q.type === 'map' ? `${K.fmtNum(Math.round(a.dist), 0)} m od cilja` : a.q.options[a.q.answer]);
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
    const name = quiz.place.kraj || 'ovaj kraj';
    $('resTitle').textContent = `${score} / ${n}`;
    $('resPoints').textContent = `${K.fmtNum(points, 0)} poena · ${time} s`;
    $('resText').textContent = score / n >= 0.8 ? `Odlično poznaješ kraj ${name}!` :
      score / n >= 0.5 ? `Solidno! Kraj ${name} ti nije stran.` : `Vreme je za šetnju po kraju ${name}.`;
    if (duelFrom) {
      $('cmpLine').textContent = `Ti ${score}/${n} · ${time}s — ${duelFrom.name} ${duelFrom.score}/${n} · ${duelFrom.time || '?'}s`;
      const mine = points, his = duelFrom.points || 0;
      $('cmpVerdict').textContent = mine > his ? `Pobeda! ${K.fmtNum(mine, 0)} : ${K.fmtNum(his, 0)} poena 🎉` :
        mine === his ? 'Nerešeno!' : `${duelFrom.name} vodi ${K.fmtNum(his, 0)} : ${K.fmtNum(mine, 0)} poena. Vrati mu!`;
      show($('duelResult'));
    } else show($('duelResult'), false);
    $('review').innerHTML = answers.map((a, i) => {
      const his = duelFrom && duelFrom.oks[i] != null ? ` <span class="muted small">(${K.esc(duelFrom.name)}: ${duelFrom.oks[i] ? '✓' : '✗'})</span>` : '';
      return `<li><span class="${a.ok ? 'r' : 'w'}">${a.ok ? '✓' : '✗'}</span> ${K.esc(a.q.text.split('\n')[0])} — <strong>${K.esc(answerText(a))}</strong> <span class="muted small">+${a.got} p</span>${his}</li>`;
    }).join('');
    show($('shareBox'), false);
    $('myName').value = store.get('kviz:name') || '';
    $('lbName').value = store.get('kviz:name') || '';
    lbMine = null; lbScope = 'hood'; lbPeriod = 'day';
    show($('lbForm')); $('lbSubmit').disabled = false;
    lbShow();
    show($('result'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------- Rang-lista ----------------
  let lbScope = 'hood', lbPeriod = 'day', lbMine = null;
  const SCOPE_SR = { hood: 'kraj', city: 'grad', country: 'država', continent: 'kontinent', world: 'svet' };
  async function lbShow() {
    if (!quiz) return;
    const keys = K.lbKeys(quiz.place);
    document.querySelectorAll('.tabs [data-scope]').forEach((b) => b.classList.toggle('on', b.dataset.scope === lbScope));
    document.querySelector('.tabs [data-period]').classList.toggle('on', lbPeriod === 'all');
    $('lbList').innerHTML = '<li class="muted">učitavam…</li>';
    try {
      const rows = await K.lbTop(lbScope, keys[lbScope], lbPeriod);
      $('lbList').innerHTML = rows.length ? rows.map((r) =>
        `<li class="${lbMine && r.name === lbMine.name && r.points === lbMine.points ? 'me' : ''}">${K.esc(r.name)} · <strong>${K.fmtNum(r.points, 0)}</strong> p · ${r.correct}/${r.total} · ${r.secs}s${lbScope !== 'hood' ? ` <span class="muted small">(${K.esc(r.hood_name)})</span>` : ''}</li>`
      ).join('') : '<li class="muted">Još niko. Budi prvi!</li>';
      const label = lbScope === 'continent' ? (K.CONTINENT_SR[keys.continent] || 'kontinent') : lbScope === 'hood' ? quiz.place.kraj : lbScope === 'city' ? quiz.place.grad : lbScope === 'country' ? (quiz.place.country || '').toUpperCase() : 'ceo svet';
      $('lbMsg').textContent = `${lbPeriod === 'all' ? 'Najbolji ikad' : 'Danas'}: ${label || SCOPE_SR[lbScope]}.` + (lbMine && lbMine.rank ? ` Tvoje mesto danas: ${lbMine.rank[lbScope]}.` : '');
    } catch (e) {
      $('lbList').innerHTML = '';
      $('lbMsg').textContent = location.hostname === 'localhost' ? 'Rang-liste rade kad je sajt na Loopiji (lokalno nema PHP-a).' : `Rang-lista trenutno nije dostupna (${e.message}).`;
    }
  }
  document.querySelectorAll('.tabs [data-scope]').forEach((b) => b.addEventListener('click', () => { lbScope = b.dataset.scope; lbShow(); }));
  document.querySelector('.tabs [data-period]').addEventListener('click', () => { lbPeriod = lbPeriod === 'all' ? 'day' : 'all'; lbShow(); });
  $('lbSubmit').addEventListener('click', async () => {
    const name = $('lbName').value.trim() || 'Komšija';
    store.set('kviz:name', name);
    $('lbSubmit').disabled = true;
    try {
      const r = await K.lbSubmit(quiz.place, name, result);
      lbMine = { name, points: result.points, rank: r.rank };
      show($('lbForm'), false);
    } catch (e) {
      $('lbMsg').textContent = `Upis nije uspeo: ${e.message}`;
      $('lbSubmit').disabled = false;
      return;
    }
    lbShow();
  });

  $('returnBtn').addEventListener('click', () => {
    show($('result'), false);
    show($('pick'));
    alertBox(`Izaberi SVOJ kraj, odigraj kviz i pošalji izazov nazad: ${duelFrom ? duelFrom.name : 'komšiji'}.`);
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
      const code = await K.duelEncode(quiz, me || 'Komšija', result);
      const url = K.duelLink(code);
      const kraj = quiz.place.kraj || 'moj kraj';
      const text = `Znaš li svoj kraj? · ${kraj} 🏙️\n${grid(result.oks)} ${result.score}/${result.n} · ${result.time}s\nMožeš li bolje?`;
      share = { text, url };
      $('shareText').textContent = `${text} ${url.slice(0, 48)}…`;
      const enc = encodeURIComponent;
      $('shareWa').href = `https://wa.me/?text=${enc(text + ' ' + url)}`;
      $('shareViber').href = `viber://forward?text=${enc(text + ' ' + url)}`;
      $('shareTg').href = `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`;
      $('shareFb').href = `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
      $('shareX').href = `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`;
      $('shareMsg').textContent = 'U linku su pitanja i tvoja tačka zaokružena na ~100 m, bez adrese.';
      show($('cardPreview'), false);
      show($('shareBox'));
    } catch (e) {
      $('shareMsg').textContent = `Izazov nije napravljen: ${e.message}`;
      show($('shareBox'));
    } finally { $('makeDuel').disabled = false; }
  });
  $('shareNative').addEventListener('click', async () => {
    if (navigator.share) { navigator.share({ title: 'Koliko poznaješ moj kraj?', text: share.text, url: share.url }).catch(() => {}); return; }
    copyText();
  });
  async function copyText() {
    try {
      await navigator.clipboard.writeText(`${share.text} ${share.url}`);
      $('shareMsg').textContent = 'Tekst je kopiran. Nalepi ga u Viber ili WhatsApp.';
    } catch (e) { $('shareMsg').textContent = 'Kopiranje nije dozvoljeno u ovom pregledaču.'; }
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
  function drawCard(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1f6f5c'); g.addColorStop(1, '#0d3029');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const pad = w * 0.08, F = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    let y = h * (h > w ? 0.24 : 0.12); // story: sadržaj bliže sredini
    x.fillStyle = '#f7d77c'; x.font = `700 ${w * 0.045}px ${F}`;
    x.fillText('Znaš li svoj kraj?', pad, y);
    y += w * 0.11;
    x.fillStyle = '#fff'; x.font = `800 ${w * 0.085}px ${F}`;
    for (const l of wrap(x, quiz.place.kraj || 'Moj kraj', w - 2 * pad).slice(0, 2)) { x.fillText(l, pad, y); y += w * 0.095; }
    y += w * 0.03;
    // 10 kvadrata
    const n = result.oks.length, gap = w * 0.012, sz = Math.min(w * 0.07, (w - 2 * pad - gap * (n - 1)) / n);
    result.oks.forEach((o, i) => {
      x.fillStyle = o ? '#4caf50' : '#e5534b';
      x.beginPath();
      if (x.roundRect) x.roundRect(pad + i * (sz + gap), y, sz, sz, sz * 0.18); else x.rect(pad + i * (sz + gap), y, sz, sz);
      x.fill();
    });
    y += sz + w * 0.16; // dovoljno mesta da se veliki rezultat ne preklopi sa kvadratima
    x.fillStyle = '#fff'; x.font = `800 ${w * 0.11}px ${F}`;
    x.fillText(`${result.score}/${result.n}`, pad, y);
    x.font = `600 ${w * 0.04}px ${F}`; x.fillStyle = '#cfe9e0';
    x.fillText(`${K.fmtNum(result.points, 0)} poena · ${result.time} s`, pad, y + w * 0.06);
    y += w * (h > w ? 0.2 : 0.13);
    const fact = funFact();
    if (fact) {
      x.font = `500 ${w * 0.038}px ${F}`;
      const lines = wrap(x, fact, w - 2 * pad - w * 0.06).slice(0, h > w ? 6 : 3);
      const boxH = lines.length * w * 0.05 + w * 0.09;
      x.fillStyle = 'rgba(255,255,255,0.1)';
      x.beginPath();
      if (x.roundRect) x.roundRect(pad, y, w - 2 * pad, boxH, w * 0.03); else x.rect(pad, y, w - 2 * pad, boxH);
      x.fill();
      x.fillStyle = '#f7d77c'; x.font = `700 ${w * 0.03}px ${F}`;
      x.fillText('ZNAŠ LI?', pad + w * 0.03, y + w * 0.05);
      x.fillStyle = '#fff'; x.font = `500 ${w * 0.038}px ${F}`;
      lines.forEach((l, i) => x.fillText(l, pad + w * 0.03, y + w * 0.1 + i * w * 0.05));
    }
    x.fillStyle = '#cfe9e0'; x.font = `600 ${w * 0.035}px ${F}`;
    x.fillText('Koliko poznaješ SVOJ kraj?', pad, h - pad - w * 0.05);
    x.fillStyle = '#9fd3c3'; x.font = `500 ${w * 0.03}px ${F}`;
    x.fillText(location.host || 'kviz', pad, h - pad);
    return c;
  }
  async function shareCard(w, h, name) {
    const c = drawCard(w, h);
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
      $('shareMsg').textContent = 'Slika je sačuvana. Okači je u story, a link nalepi kao tekst.';
    }
  }
  $('cardStory').addEventListener('click', () => shareCard(1080, 1920, 'kviz-kraj-story.png'));
  // Instagram nema link za deljenje sa weba: na telefonu ide slika preko sistemskog „Podeli“ (izabereš Instagram),
  // a link se kopira da ga zalepiš kao „Link“ nalepnicu u story-ju
  $('shareIg').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(share.url); } catch (e) { /* bez kopiranja */ }
    await shareCard(1080, 1920, 'kviz-kraj-story.png');
    $('shareMsg').textContent = 'Slika za story je spremna, a link je kopiran: u Instagram story-ju dodaj nalepnicu „Link“ i zalepi ga.';
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
      if (prev) { alertBox(`Ovaj kviz (${d.quiz.place.kraj}, ${d.quiz.day}) si već igrao: ${prev.score != null ? prev.score + '/' + prev.n : 'započet'}.`); return; }
      play(d.quiz, d.from);
    } catch (e) {
      alertBox(`Link izazova nije ispravan (${e.message}).`);
    }
  }
  openDuelFromHash();
  window.addEventListener('hashchange', openDuelFromHash);
})(globalThis.Kviz);
