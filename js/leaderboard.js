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

  K.lbKeys = (place) => ({
    hood: K.hoodKey(place), city: place.grad || '', country: (place.country || '').toLowerCase(),
    continent: K.continentOf(place.country), world: '*'
  });

  K.lbSubmit = async function (place, name, res) {
    const r = await fetch(K.API + 'score.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hood: K.hoodKey(place), hood_name: place.kraj || '', city: place.grad || '', country: place.country || '',
        continent: K.continentOf(place.country), name, points: res.points, correct: res.score, total: res.n, secs: res.time
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };

  K.lbTop = async function (scope, key, period = 'day') {
    const qs = new URLSearchParams({ scope, key: key || '', period });
    const r = await fetch(`${K.API}top.php?${qs}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j.rows;
  };
})(globalThis.Kviz = globalThis.Kviz || {});
