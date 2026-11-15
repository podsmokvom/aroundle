/* Aroundle — rang-liste (kraj, grad, država, kontinent, svet) preko api/ (PHP + MySQL na Loopiji) */
(function (K) {
  'use strict';
  K.API = 'api/';

  // država (ISO 3166-1 alpha-2) -> kontinent
  const C = {
    EU: 'rs hr ba me mk si al bg ro gr hu at de ch it fr es pt nl be lu dk se no fi is ie gb uk pl cz sk ua by md lt lv ee ru tr cy mt li mc sm va ad xk',
    AS: 'cn jp kr kp in pk bd lk np id my sg th vn ph kh la mm ir iq sy jo lb il ps sa ae qa kw bh om ye af kz uz tm kg tj mn ge am az tw hk mo bt mv bn tl',
    AF: 'eg ly tn dz ma sd ss et er dj so ke ug tz rw bi cd cg ga cm ng gh ci sn ml ne td bf gn sl lr tg bj mr gm gw cv ao zm zw mw mz na bw za ls sz mg mu sc km cf gq st',
    NA: 'us ca mx gt bz hn sv ni cr pa cu jm ht do bs bb tt gd lc vc ag dm kn pr',
    SA: 'br ar cl uy py bo pe ec co ve gy sr',
    OC: 'au nz pg fj sb vu ws to ki fm mh pw nr tv'
  };
  const MAP = {};
  for (const k in C) for (const c of C[k].split(' ')) MAP[c] = k;
  K.continentOf = (cc) => MAP[(cc || '').toLowerCase()] || '';
  K.CONTINENT_SR = { EU: 'Evropa', AS: 'Azija', AF: 'Afrika', NA: 'Severna Amerika', SA: 'Južna Amerika', OC: 'Okeanija' };

  // „near“ = svi igrači današnjeg dana na najviše 1,5 km (tačke su već nasumično pomerene 50 m)
  K.lbKeys = (place) => ({
    near: { lat: +place.lat.toFixed(3), lon: +place.lon.toFixed(3) }, city: K.cityKey(place), country: (place.country || '').toLowerCase(),
    continent: K.continentOf(place.country), world: '*'
  });

  K.lbSubmit = async function (place, name, res) {
    const r = await fetch(K.API + 'score.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hood: K.hoodKey(place), hood_name: place.kraj || "", lat: +place.lat.toFixed(3), lon: +place.lon.toFixed(3), city: K.cityKey(place), country: place.country || '',
        continent: K.continentOf(place.country), name, points: res.points, correct: res.score, total: res.n, secs: res.time
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };

  K.lbTop = async function (scope, key, period = "day") {
    const qs = new URLSearchParams(scope === "near" ? { scope, lat: key.lat, lon: key.lon, period } : { scope, key: key || "", period });
    const r = await fetch(`${K.API}top.php?${qs}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j.rows;
  };
  // Anonimna analitika (api/answers.php): po pitanju samo tema / KD / vrsta znanja, tačno-netačno, vreme;
  // uz to kraj, ćelija ~1 km, zemlja i jezik igre. Bez imena i tačne lokacije. Ne blokira igru ako ne uspe.
  K.answersSend = function (quiz, answers, isDuel) {
    try {
      const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      const body = JSON.stringify({
        quiz: id, hood: K.hoodKey(quiz.place), city: K.cityKey(quiz.place), country: quiz.place.country || '', lang: K.lang,
        lat: +(+quiz.place.lat).toFixed(2), lon: +(+quiz.place.lon).toFixed(2), duel: !!isDuel,
        answers: answers.map((a) => {
          const c = K.classify(a.q);
          return { cat: a.q.cat, kind: a.q.kind || '', theme: c.theme, theme2: c.theme2 || '', kd: c.kd || '', skills: c.skills,
            level: a.q.level || '', ok: !!a.ok, secs: Math.round(a.t || 0), dist: a.dist != null ? Math.round(a.dist) : null };
        })
      });
      fetch(`${K.API}answers.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch (e) { /* analitika nikad ne sme da pokvari igru */ }
  };

  // ocena kraja 1–10 (api/rate.php): kraj, grad, zemlja, jezik, „moja lokacija“ da/ne — bez koordinata i imena
  K.rateSend = function (quiz, rating, mine) {
    try {
      fetch(`${K.API}rate.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ hood: K.hoodKey(quiz.place), hood_name: quiz.place.kraj || '', city: K.cityKey(quiz.place),
          country: quiz.place.country || '', lang: K.lang, rating, mine: !!mine })
      }).catch(() => {});
    } catch (e) { /* ocena nikad ne sme da pokvari igru */ }
  };

  // ---- Praćenje promocije (anonimno, Duca 15.11.): odakle je igrač došao i da li je već bio ovde ----
  // Izvor: utm_source/utm_medium/utm_campaign iz adrese (prvi u ovoj poseti), inače sajt sa kog je došao (referrer),
  // inače izazov (?d= / #d=) ili „direct“. Povratnik: ovaj pregledač je bio ovde nekog ranijeg dana (samo datum u
  // localStorage, ništa drugo). Na server ide samo +1 u zbirni red (api/track.php): bez IP-a, imena i lokacije.
  K.trackSource = (function () {
    const get = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
    const set = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* bez skladišta */ } };
    const saved = get('aroundle.src');
    if (saved) { try { return JSON.parse(saved); } catch (e) { /* ponovo */ } }
    const p = new URLSearchParams(location.search);
    let src = { src: p.get('utm_source') || '', med: p.get('utm_medium') || '', camp: p.get('utm_campaign') || '' };
    if (!src.src) {
      let ref = '';
      try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) { ref = ''; }
      if (ref && ref !== location.hostname.replace(/^www\./, '')) src = { src: ref, med: 'referral', camp: '' };
      else if (p.get('d') || /[#&]d(uel)?=/.test(location.hash)) src = { src: 'challenge', med: 'share', camp: '' };
      else src = { src: 'direct', med: '', camp: '' };
    }
    set('aroundle.src', JSON.stringify(src));
    return src;
  })();
  K.trackReturning = (function () {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const first = localStorage.getItem('aroundle.firstDay');
      if (!first) { localStorage.setItem('aroundle.firstDay', today); return false; }
      return first !== today;
    } catch (e) { return false; }
  })();
  K.track = function (ev) {
    try {
      const body = JSON.stringify({ ev, lang: K.lang, ...K.trackSource, ret: K.trackReturning ? 1 : 0 });
      fetch(`${K.API}track.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch (e) { /* praćenje nikad ne sme da pokvari igru */ }
  };

  // brojač odigranih kvizova (GET ukupno, POST +1 kad se kviz završi)
  K.countGet = async function () {
    const r = await fetch(`${K.API}count.php`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j.total;
  };
  K.countAdd = async function (place) {
    const r = await fetch(`${K.API}count.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hood: K.hoodKey(place) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j.total;
  };

  // krajevi koje ljudi najbolje poznaju (prosek tačnih odgovora, samo krajevi sa dovoljno igrača)
  // najbolje ocenjeni krajevi (prosek ocena lokacije 1–10); key = {lat, lon} za „near“
  K.lbRated = async function (period = 'day', scope = 'near', key = '') {
    const p = { period, scope };
    if (scope === 'near') { p.lat = key.lat; p.lon = key.lon; } else if (scope !== 'world') p.key = key || '';
    const r = await fetch(`${K.API}rated.php?${new URLSearchParams(p)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };
  K.lbHoods = async function (period = 'all', scope = 'world', key = '') {
    const qs = new URLSearchParams(scope === 'world' ? { period } : { period, scope, key });
    const r = await fetch(`${K.API}hoods.php?${qs}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };
})(globalThis.Kviz = globalThis.Kviz || {});
