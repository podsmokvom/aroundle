/* Kviz — interfejs */
(function (K) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const show = (el, on = true) => { el.hidden = !on; };

  let place = null;      // {lat, lon, kraj, grad}
  let quiz = null;       // gotov kviz
  let idx = 0, score = 0, answers = [];

  // ---------------- Mapa ----------------
  const map = L.map('map').setView([44.8125, 20.4612], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  let marker = null, circle = null;
  map.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng));

  async function setPoint(lat, lon, knownAddr) {
    if (marker) { marker.setLatLng([lat, lon]); circle.setLatLng([lat, lon]); }
    else {
      marker = L.marker([lat, lon]).addTo(map);
      circle = L.circle([lat, lon], { radius: 800, color: '#1f6f5c', weight: 2, fillOpacity: 0.08 }).addTo(map);
    }
    map.setView([lat, lon], Math.max(map.getZoom(), 14));
    show($('picked'));
    $('pickedName').textContent = 'tražim naziv kraja…';
    $('build').disabled = true;
    let addr = knownAddr;
    if (!addr) {
      try { addr = (await K.reverse(lat, lon)).address; } catch (e) { addr = null; }
    }
    place = K.placeFromAddress(addr, lat, lon);
    // ime kraja iz OSM pločica (npr. „Karaburma“) je bolje od mesne zajednice iz adrese
    try {
      const np = await K.nearestPlace(lat, lon);
      if (np && np.cls !== 'city' && np.cls !== 'town') place.kraj = np.name;
      else if (np && !place.kraj) place.kraj = np.name;
    } catch (e) { /* ostaje ime iz adrese */ }
    $('pickedName').textContent = [place.kraj, place.grad].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    $('build').disabled = false;
    const cached = K.cacheGet(place);
    show($('rebuild'), !!cached);
    show($('cacheInfo'), !!cached);
    $('build').textContent = cached ? 'Igraj sačuvani kviz' : 'Napravi kviz';
    if (cached) $('cacheInfo').textContent = `Za ovaj kraj postoji sačuvan kviz od ${new Date(cached.created).toLocaleDateString('sr-Latn')} (${cached.scope}).`;
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
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
  function alertBox(msg) {
    const ul = $('results');
    ul.innerHTML = `<li class="muted">${K.esc(msg)}</li>`;
    show(ul);
  }

  // ---------------- Pravljenje ----------------
  $('build').addEventListener('click', () => start(false));
  $('rebuild').addEventListener('click', () => start(true));

  async function start(fresh) {
    if (!place) return;
    const cached = !fresh && K.cacheGet(place);
    if (cached) { play(cached); return; }
    $('build').disabled = $('rebuild').disabled = true;
    show($('result'), false); show($('quiz'), false);
    show($('progress'));
    const log = $('log');
    log.innerHTML = '';
    $('status').textContent = 'Traka radi: ubacujem mape, ulice, spomenike, ptice i klimu…';
    const addLog = (msg, cls) => {
      const li = document.createElement('li');
      if (cls) li.className = cls;
      li.textContent = msg;
      log.appendChild(li);
      // kratko stanje ispod trake: samo izvor koji se trenutno obrađuje
      const src = /^(OpenStreetMap|Overture|Vikipedija|Wikidata|Open-Meteo|GBIF|Transitous)/.exec(msg);
      if (src && cls !== 'ok') $('status').textContent = `Na traci: ${src[1]}…`;
    };
    try {
      const q = await K.buildQuiz(place, addLog);
      if (!q.questions.length) {
        addLog('Za ovo mesto izvori nisu dali nijedno proverljivo pitanje. Probaj drugu tačku.', 'warn');
        return;
      }
      K.cacheSet(place, q);
      show($('progress'), false);
      play(q);
    } catch (err) {
      addLog(`Greška: ${err.message}`, 'warn');
    } finally {
      $('build').disabled = $('rebuild').disabled = false;
    }
  }

  // ---------------- Igra ----------------
  let duelFrom = null;   // {name, score, oks} kad se igra tuđi izazov
  let qmap = null;       // Leaflet mapa za „pokaži na mapi“
  let pin = null;

  function play(q, from) {
    quiz = q; idx = 0; score = 0; answers = []; duelFrom = from || null;
    show($('pick'), false); show($('progress'), false); show($('result'), false);
    const notes = $('notes');
    const parts = (q.notes || []).map((n) => `<p>${K.esc(n)}</p>`);
    notes.className = 'notes';
    notes.innerHTML = parts.join('');
    if (duelFrom) {
      notes.className = 'intro-duel';
      notes.innerHTML = `<p><strong>${K.esc(duelFrom.name)}</strong> te izaziva: ima <strong>${duelFrom.score} / ${q.questions.length}</strong> za kraj ${K.esc(q.place.kraj || q.place.grad || '')}. Možeš li bolje?</p>` + parts.join('');
    }
    show(notes, notes.innerHTML !== '');
    show($('quiz'));
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // podloga bez naziva ulica i objekata, da mapa ne oda odgovor
  function nolabelTiles() {
    return L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
    });
  }

  function render() {
    const q = quiz.questions[idx];
    $('qnum').textContent = `Pitanje ${idx + 1} / ${quiz.questions.length}`;
    $('score').textContent = `${score} tačno`;
    $('qtext').textContent = q.text;
    const opts = $('opts');
    opts.innerHTML = '';
    show($('feedback'), false);
    show($('next'), false);
    const isMap = q.type === 'map';
    show($('qmap'), isMap); show($('pinBar'), isMap); show(opts, !isMap);
    if (qmap) { qmap.remove(); qmap = null; pin = null; }
    if (isMap) {
      $('pinOk').disabled = true;
      $('pinOk').hidden = false;
      $('pinHint').textContent = 'Klikni na mapu gde misliš da je.';
      qmap = L.map('qmap').setView([quiz.place.lat, quiz.place.lon], 15);
      nolabelTiles().addTo(qmap);
      L.circleMarker([quiz.place.lat, quiz.place.lon], { radius: 5, color: '#1f6f5c', fillOpacity: 1 }).addTo(qmap).bindTooltip('izabrana tačka');
      qmap.on('click', (e) => {
        if ($('pinOk').hidden) return;
        if (pin) pin.setLatLng(e.latlng); else pin = L.marker(e.latlng).addTo(qmap);
        $('pinOk').disabled = false;
        $('pinHint').textContent = 'Možeš da pomeriš klik, pa potvrdi.';
      });
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

  function feedback(ok, q, extra) {
    const fb = $('feedback');
    fb.innerHTML = `<strong class="${ok ? 'ok' : 'bad'}">${ok ? 'Tačno!' : 'Netačno.'}</strong> ` + extra +
      `${K.esc(q.explain)}` +
      (q.source && q.source.url ? `<span class="src">Izvor: <a href="${K.esc(q.source.url)}" target="_blank" rel="noopener">${K.esc(q.source.name)}</a></span>` : '');
    show(fb);
    $('score').textContent = `${score} tačno`;
    $('next').textContent = idx + 1 < quiz.questions.length ? 'Dalje' : 'Rezultat';
    show($('next'));
    $('next').focus();
  }

  function answer(i) {
    const q = quiz.questions[idx];
    const ok = i === q.answer;
    if (ok) score++;
    answers.push({ q, chosen: i, ok });
    [...$('opts').children].forEach((b, j) => {
      b.disabled = true;
      if (j === q.answer) b.classList.add('right');
      else if (j === i) b.classList.add('wrong');
    });
    feedback(ok, q, ok ? '' : `Tačan odgovor: <strong>${K.esc(q.options[q.answer])}</strong>. `);
  }

  $('pinOk').addEventListener('click', () => {
    const q = quiz.questions[idx];
    if (!pin || !q.target) return;
    const p = pin.getLatLng();
    const d = K.dist(p.lat, p.lng, q.target.lat, q.target.lon);
    const ok = d <= q.target.tol;
    if (ok) score++;
    answers.push({ q, ok, dist: d });
    $('pinOk').hidden = true;
    const t = [q.target.lat, q.target.lon];
    L.circle(t, { radius: q.target.tol, color: '#2e7d32', weight: 1, fillOpacity: 0.12 }).addTo(qmap);
    L.circleMarker(t, { radius: 8, color: '#2e7d32', fillColor: '#2e7d32', fillOpacity: 0.9 }).addTo(qmap).bindTooltip('ovde je', { permanent: true });
    L.polyline([[p.lat, p.lng], t], { color: ok ? '#2e7d32' : '#b3261e', dashArray: '6 6' }).addTo(qmap);
    qmap.fitBounds(L.latLngBounds([[p.lat, p.lng], t]).pad(0.4), { maxZoom: 17 });
    $('pinHint').textContent = '';
    feedback(ok, q, `Promašaj: <strong>${K.fmtNum(Math.round(d), 0)} m</strong>. `);
  });

  $('next').addEventListener('click', () => {
    idx++;
    if (idx < quiz.questions.length) render();
    else finish();
  });

  const answerText = (a) => (a.q.type === 'map' ? `${K.fmtNum(Math.round(a.dist), 0)} m od cilja` : a.q.options[a.q.answer]);

  function finish() {
    if (qmap) { qmap.remove(); qmap = null; }
    show($('quiz'), false);
    const n = quiz.questions.length;
    const pct = score / n;
    $('resTitle').textContent = `${score} / ${n}`;
    const name = quiz.place.kraj || quiz.place.grad || 'ovaj kraj';
    $('resText').textContent = pct >= 0.8 ? `Odlično poznaješ kraj ${name}!` :
      pct >= 0.5 ? `Solidno! Kraj ${name} ti nije stran.` : `Vreme je za šetnju po kraju ${name}.`;
    // duel: poređenje sa izazivačem, pitanje po pitanje
    const dr = $('duelResult');
    if (duelFrom) {
      const who = K.esc(duelFrom.name);
      const verdict = score > duelFrom.score ? 'Pobeda! 🎉' : score === duelFrom.score ? 'Nerešeno!' : `${who} ipak bolje zna kraj.`;
      dr.innerHTML = `<strong>Ti ${score} : ${duelFrom.score} ${who}</strong><br>${verdict} Pošalji svoj rezultat nazad kao novi izazov.`;
      show(dr);
    } else show(dr, false);
    $('review').innerHTML = answers.map((a, i) => {
      const his = duelFrom && duelFrom.oks[i] != null ? ` <span class="muted small">(${K.esc(duelFrom.name)}: ${duelFrom.oks[i] ? '✓' : '✗'})</span>` : '';
      return `<li><span class="${a.ok ? 'r' : 'w'}">${a.ok ? '✓' : '✗'}</span> ${K.esc(a.q.text.split('\n')[0])} — <strong>${K.esc(answerText(a))}</strong>${his}</li>`;
    }).join('');
    show($('shareBox'), false);
    try { $('myName').value = localStorage.getItem('kviz:name') || ''; } catch (e) { /* bez memorije */ }
    show($('result'));
  }

  // ---------------- Izazov: link + društvene mreže ----------------
  $('makeDuel').addEventListener('click', async () => {
    const me = $('myName').value.trim();
    try { localStorage.setItem('kviz:name', me); } catch (e) { /* bez memorije */ }
    $('makeDuel').disabled = true;
    try {
      const code = await K.duelEncode(quiz, me || 'Komšija', score, answers.map((a) => a.ok));
      const url = K.duelLink(code);
      const kraj = quiz.place.kraj || quiz.place.grad || 'naš kraj';
      const text = `${me ? me + ' zna' : 'Znam'} kraj ${kraj} ${score}/${quiz.questions.length}. Možeš li bolje? 🏘️`;
      const enc = encodeURIComponent;
      $('shareWa').href = `https://wa.me/?text=${enc(text + ' ' + url)}`;
      $('shareViber').href = `viber://forward?text=${enc(text + ' ' + url)}`;
      $('shareTg').href = `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`;
      $('shareFb').href = `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
      $('shareX').href = `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`;
      $('shareCopy').dataset.url = url;
      $('shareCopy').dataset.text = text;
      show($('shareNative'), !!navigator.share);
      $('shareMsg').textContent = `Link (${url.length} znakova) sadrži sva pitanja, pa radi bez servera.`;
      show($('shareBox'));
    } catch (e) {
      $('shareMsg').textContent = `Izazov nije napravljen: ${e.message}`;
      show($('shareBox'));
    } finally { $('makeDuel').disabled = false; }
  });
  $('shareNative').addEventListener('click', () => {
    navigator.share({ title: 'Kviz — izazov', text: $('shareCopy').dataset.text, url: $('shareCopy').dataset.url }).catch(() => {});
  });
  $('shareCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`${$('shareCopy').dataset.text} ${$('shareCopy').dataset.url}`);
      $('shareMsg').textContent = 'Link je kopiran. Nalepi ga u bilo koju poruku.';
    } catch (e) { $('shareMsg').textContent = 'Kopiranje nije dozvoljeno; označi link ručno.'; }
  });

  // Otvoren link izazova (#duel=…)
  async function openDuelFromHash() {
    const m = /#duel=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return;
    try {
      const d = await K.duelDecode(m[1]);
      history.replaceState(null, '', location.pathname);
      play(d.quiz, d.from);
    } catch (e) {
      alertBox(`Link izazova nije ispravan (${e.message}).`);
    }
  }
  openDuelFromHash();
  window.addEventListener('hashchange', openDuelFromHash);

  $('again').addEventListener('click', () => {
    quiz.questions.forEach((q) => {
      if (q.type === 'map') return;
      const correct = q.options[q.answer];
      q.options = K.shuffle(q.options);
      q.answer = q.options.indexOf(correct);
    });
    quiz.questions = K.shuffle(quiz.questions);
    play(quiz);
  });
  $('newPlace').addEventListener('click', () => {
    show($('result'), false);
    show($('pick'));
    setTimeout(() => map.invalidateSize(), 50);
  });
})(globalThis.Kviz);
