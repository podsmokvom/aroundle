/* Kviz — izvori podataka: Nominatim, Wikipedia/Wikidata, Open-Meteo, GBIF (OSM objekti dolaze iz pločica, js/tiles.js) */
(function (K) {
  'use strict';

  // ================= Nominatim (traženje mesta) =================
  // Pravilo korišćenja: najviše 1 zahtev u sekundi.
  let lastNom = 0;
  async function nominatim(path, params) {
    const wait = lastNom + 1100 - Date.now();
    if (wait > 0) await K.sleep(wait);
    lastNom = Date.now();
    const qs = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'sr-Latn,sr,en', ...params });
    return K.fetchJSON(`https://nominatim.openstreetmap.org/${path}?${qs}`, {}, 20000);
  }
  K.geocode = (q) => nominatim('search', { q, limit: 6, addressdetails: 1 });
  K.reverse = (lat, lon) => nominatim('reverse', { lat, lon, zoom: 16, addressdetails: 1 });

  K.placeFromAddress = function (addr, lat, lon) {
    addr = addr || {};
    // preskoči mesne zajednice („MZ …“) i nazive tipa „Beograd (Palilula)“
    const good = (s) => s && !/^MZ\s|^МЗ\s|\(/.test(s);
    const kraj = [addr.quarter, addr.neighbourhood, addr.suburb, addr.city_district, addr.village, addr.hamlet, addr.town, addr.city, addr.municipality]
      .find(good) || '';
    // „Grad Beograd“ je u polju county; inače city/town
    const county = /^(grad|град)\s/i.test(addr.county || '') ? addr.county : '';
    const grad = county || addr.town || addr.city || addr.village || addr.municipality || '';
    const strip = (s) => K.toLatin(s).replace(/^(grad|gradska opština|opština|city of|municipality of)\s+/i, '');
    return {
      lat, lon,
      kraj: strip(kraj), grad: strip(grad),
      country: addr.country_code || ''
    };
  };

  // ================= Granice opštine i grada (Nominatim poligoni, bez Overpass-a) =================
  // zoom 10 = opština (u Srbiji: gradska opština, opština ili grad-opština), zoom 8 = grad samo ako je „Grad …“ (ne okrug)
  K.adminPolygons = async function (lat, lon) {
    const out = [];
    for (const [zoom, kind] of [[10, 'mun'], [8, 'city']]) {
      try {
        const r = await nominatim('reverse', { lat, lon, zoom, polygon_geojson: 1, polygon_threshold: 0.0005, extratags: 1, addressdetails: 0 });
        const g = r && r.geojson;
        if (!g || !/Polygon/.test(g.type)) continue;
        const name = K.toLatin(r.name || '').trim();
        if (!name || out.some((a) => a.osmId === r.osm_id)) continue;
        if (kind === 'city' && !(r.addresstype === 'city' || /^grad\s/i.test(name))) continue; // okrug nije grad
        out.push({ kind, osmId: r.osm_id, name, geo: g, wikidata: (r.extratags && r.extratags.wikidata) || null, bbox: r.boundingbox.map(Number) });
      } catch (e) { /* bez granice za ovaj nivo */ }
    }
    return out;
  };

  // ================= Wikidata SPARQL: objekti sa „nazvano po“ (P138) u okolini =================
  K.wdNamedAfter = async function (lat, lon, radiusKm) {
    const q = `SELECT ?item ?named ?dist WHERE {
      SERVICE wikibase:around { ?item wdt:P625 ?c . bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${radiusKm}" . bd:serviceParam wikibase:distance ?dist . }
      ?item wdt:P138 ?named .
    } LIMIT 250`;
    const j = await K.fetchJSON('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json' } }, 10000);
    const id = (u) => u.split('/').pop();
    return j.results.bindings.map((b) => ({ qid: id(b.item.value), named: id(b.named.value), dist: parseFloat(b.dist.value) * 1000 }));
  };

  // ================= Wikipedia / Wikidata =================
  K.wikiGeo = async function (lang, lat, lon, radius, limit = 100) {
    const qs = new URLSearchParams({
      action: 'query', list: 'geosearch', gscoord: `${lat}|${lon}`,
      gsradius: String(Math.max(10, Math.min(10000, Math.round(radius)))),
      gslimit: String(limit), format: 'json', origin: '*'
    });
    const j = await K.fetchJSON(`https://${lang}.wikipedia.org/w/api.php?${qs}`);
    return ((j.query && j.query.geosearch) || []).map((g) => ({
      lang, pageid: g.pageid, title: K.toLatin(g.title), lat: g.lat, lon: g.lon,
      cLat: lat, cLon: lon, dist: g.dist
    }));
  };

  K.wikiDetails = async function (lang, pageids) {
    const out = {};
    for (const part of K.chunk(pageids, 20)) {
      const p = {
        action: 'query', prop: 'extracts|pageprops', exintro: '1', explaintext: '1', exsentences: '2',
        exlimit: '20', ppprop: 'wikibase_item|disambiguation', pageids: part.join('|'),
        format: 'json', origin: '*'
      };
      if (lang === 'sr') p.variant = 'sr-el';
      const j = await K.fetchJSON(`https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams(p)}`);
      const pages = (j.query && j.query.pages) || {};
      for (const id in pages) {
        const pg = pages[id];
        const pp = pg.pageprops || {};
        out[id] = {
          extract: K.toLatin(pg.extract || ''),
          qid: pp.wikibase_item || null,
          disamb: pp.disambiguation !== undefined
        };
      }
    }
    return out;
  };

  K.wikiUrl = (lang, title) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;

  K.wikidata = async function (ids) {
    const out = {};
    ids = [...new Set(ids.filter((x) => /^Q\d+$/.test(x || '')))];
    // delovi po 50 idu paralelno (ranije jedan za drugim, ~7 s)
    await Promise.all(K.chunk(ids, 50).map(async (part) => {
      const qs = new URLSearchParams({
        action: 'wbgetentities', ids: part.join('|'), props: 'labels|descriptions|claims',
        languages: 'sr-el|sr|en', format: 'json', origin: '*'
      });
      const j = await K.fetchJSON(`https://www.wikidata.org/w/api.php?${qs}`, {}, 40000);
      Object.assign(out, j.entities || {});
    }));
    return out;
  };

  K.wd = {
    label(e) {
      if (!e || !e.labels) return '';
      const l = e.labels;
      return (l['sr-el'] && l['sr-el'].value) || (l.sr && K.toLatin(l.sr.value)) || (l.en && l.en.value) || '';
    },
    desc(e) {
      if (!e || !e.descriptions) return '';
      const d = e.descriptions;
      return (d['sr-el'] && d['sr-el'].value) || (d.sr && K.toLatin(d.sr.value)) || (d.en && d.en.value) || '';
    },
    claims(e, p) {
      const cs = (e && e.claims && e.claims[p]) || [];
      const pref = cs.filter((c) => c.rank === 'preferred');
      return (pref.length ? pref : cs.filter((c) => c.rank !== 'deprecated'));
    },
    items(e, p) {
      return K.wd.claims(e, p).map((c) => c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id).filter(Boolean);
    },
    year(e, p) {
      for (const c of K.wd.claims(e, p)) {
        const v = c.mainsnak.datavalue && c.mainsnak.datavalue.value;
        if (!v || !v.time || v.precision < 9) continue;
        const m = /^([+-])0*(\d+)-/.exec(v.time);
        if (!m) continue;
        const y = parseInt(m[2], 10) * (m[1] === '-' ? -1 : 1);
        if (y !== 0) return y;
      }
      return null;
    },
    // količina, najnovija po kvalifikatoru P585 (datum)
    latestQty(e, p) {
      let best = null;
      for (const c of K.wd.claims(e, p)) {
        const v = c.mainsnak.datavalue && c.mainsnak.datavalue.value;
        if (!v || v.amount == null) continue;
        let y = 0;
        const q = c.qualifiers && c.qualifiers.P585 && c.qualifiers.P585[0].datavalue;
        if (q) { const m = /^\+?(\d+)/.exec(q.value.time); if (m) y = +m[1]; }
        const amt = parseFloat(v.amount);
        if (!best || c.rank === 'preferred' || y > best.year) best = { amount: amt, year: y };
      }
      return best;
    }
  };

  // ================= Open-Meteo (klima 1991–2020) =================
  K.climate = async function (lat, lon) {
    const qs = new URLSearchParams({
      latitude: lat.toFixed(3), longitude: lon.toFixed(3),
      start_date: '1991-01-01', end_date: '2020-12-31',
      daily: 'temperature_2m_mean,precipitation_sum', timezone: 'GMT'
    });
    const j = await K.fetchJSON(`https://archive-api.open-meteo.com/v1/archive?${qs}`, {}, 90000);
    const d = j.daily || {};
    const res = {};
    for (const [mm, key] of [['01', 'jan'], ['07', 'jul']]) {
      let ts = 0, tn = 0;
      const precipByYear = {};
      (d.time || []).forEach((day, i) => {
        if (day.slice(5, 7) !== mm) return;
        const t = d.temperature_2m_mean[i], p = d.precipitation_sum[i];
        if (t != null) { ts += t; tn++; }
        if (p != null) { const y = day.slice(0, 4); precipByYear[y] = (precipByYear[y] || 0) + p; }
      });
      const ys = Object.values(precipByYear);
      res[key] = {
        t: tn > 300 ? ts / tn : null,
        p: ys.length >= 25 ? ys.reduce((a, b) => a + b, 0) / ys.length : null
      };
    }
    return res;
  };

  // ================= GBIF (ptice, samo CC0 i CC BY) =================
  K.birds = async function (lat, lon, radiusM) {
    const dLat = radiusM / 111320;
    const dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    const qs = new URLSearchParams({
      decimalLatitude: `${(lat - dLat).toFixed(4)},${(lat + dLat).toFixed(4)}`,
      decimalLongitude: `${(lon - dLon).toFixed(4)},${(lon + dLon).toFixed(4)}`,
      classKey: '212', occurrenceStatus: 'PRESENT', hasGeospatialIssue: 'false',
      facet: 'speciesKey', facetLimit: '25', limit: '0'
    });
    qs.append('license', 'CC0_1_0');
    qs.append('license', 'CC_BY_4_0');
    const url = `https://api.gbif.org/v1/occurrence/search?${qs}`;
    const j = await K.fetchJSON(url, {}, 40000);
    const counts = (j.facets && j.facets[0] && j.facets[0].counts) || [];
    return {
      total: j.count || 0,
      url: `https://www.gbif.org/occurrence/search?${qs}`,
      species: counts.map((c) => ({ key: c.name, count: c.count }))
    };
  };

  K.speciesName = async function (key) {
    const s = await K.fetchJSON(`https://api.gbif.org/v1/species/${key}`);
    let sr = '', en = '';
    try {
      const v = await K.fetchJSON(`https://api.gbif.org/v1/species/${key}/vernacularNames?limit=300`);
      for (const r of v.results || []) {
        const lang = (r.language || '').toLowerCase();
        if (!sr && (lang === 'srp' || lang === 'sr')) sr = K.toLatin(r.vernacularName);
        if (!en && (lang === 'eng' || lang === 'en')) en = r.vernacularName;
      }
    } catch (e) { /* bez narodnog imena */ }
    if (!en && s.vernacularName) en = s.vernacularName;
    const sci = s.canonicalName || s.scientificName || '';
    const common = sr ? sr.charAt(0).toUpperCase() + sr.slice(1) : en;
    return { key, sci, common, label: common ? `${common} (${sci})` : sci };
  };
})(globalThis.Kviz = globalThis.Kviz || {});

/* ================= Transitous (GTFS vozni redovi, MOTIS API) =================
   Pravila: nekomercijalno, otvoren kod, vidljiv link ka https://transitous.org/sources/ */
(function (K) {
  'use strict';
  const API = 'https://api.transitous.org/api/v1';
  K.MODE_SR = {
    BUS: 'autobus', TRAM: 'tramvaj', SUBWAY: 'metro', METRO: 'gradska železnica', FERRY: 'brod',
    RAIL: 'voz', REGIONAL_RAIL: 'voz', REGIONAL_FAST_RAIL: 'voz', SUBURBAN: 'gradska železnica',
    COACH: 'međugradski autobus', CABLE_CAR: 'žičara', FUNICULAR: 'uspinjača', AREAL_LIFT: 'žičara', OTHER: 'linija'
  };
  K.transitStops = async function (lat, lon, radiusM) {
    const dLat = radiusM / 111320, dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    const url = `${API}/map/stops?min=${(lat - dLat).toFixed(5)},${(lon - dLon).toFixed(5)}&max=${(lat + dLat).toFixed(5)},${(lon + dLon).toFixed(5)}`;
    const j = await K.fetchJSON(url, {}, 15000);
    return (Array.isArray(j) ? j : j.stops || []).map((s) => ({
      id: s.stopId, name: K.toLatin(s.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim(), lat: s.lat, lon: s.lon,
      d: K.dist(lat, lon, s.lat, s.lon)
    })).filter((s) => s.name);
  };
  // Polasci u radni dan ujutru (da ne zavisi od toga kad se igra)
  function morning() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(6, 30, 0, 0);
    return d.toISOString();
  }
  K.transitLines = async function (stop) {
    const url = `${API}/stoptimes?stopId=${encodeURIComponent(stop.id)}&n=60&time=${encodeURIComponent(morning())}`;
    const j = await K.fetchJSON(url, {}, 15000);
    const lines = new Map();
    for (const st of j.stopTimes || []) {
      const ref = String(st.routeShortName || st.displayName || '').trim();
      if (!ref || st.cancelled) continue;
      const key = `${st.mode}|${ref}`;
      const l = lines.get(key) || { ref, mode: st.mode, label: `${K.MODE_SR[st.mode] || 'linija'} ${ref}`, heads: new Set(), agency: st.agencyName || '' };
      if (st.headsign) l.heads.add(K.toLatin(st.headsign).trim());
      lines.set(key, l);
    }
    return [...lines.values()];
  };
  // Lokalne stanice (u kraju) i udaljene (za netačne odgovore), svaka sa linijama
  K.transitData = async function (lat, lon, inside, radius) {
    const near = await K.transitStops(lat, lon, Math.max(900, radius));
    const local = K.uniqBy(near.filter((s) => inside(s.lat, s.lon)).sort((a, b) => a.d - b.d), (s) => K.norm(s.name)).slice(0, 4);
    if (!local.length) return { local: [], far: [] };
    const big = await K.transitStops(lat, lon, Math.max(4500, radius * 3));
    const far = K.uniqBy(big.filter((s) => !inside(s.lat, s.lon) && s.d > Math.max(1800, radius * 1.6)), (s) => K.norm(s.name)).sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(0, 5);
    const withLines = async (s) => ({ ...s, lines: await K.transitLines(s).catch(() => []) });
    const [L, F] = await Promise.all([Promise.all(local.map(withLines)), Promise.all(far.map(withLines))]);
    return { local: L.filter((s) => s.lines.length), far: F.filter((s) => s.lines.length) };
  };
})(globalThis.Kviz = globalThis.Kviz || {});

/* ================= Open-Meteo Elevation (nadmorska visina tačke, DEM 90 m) ================= */
(function (K) {
  'use strict';
  K.elevation = async function (lat, lon) {
    const j = await K.fetchJSON(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`, {}, 10000);
    const h = j.elevation && j.elevation[0];
    if (h == null || isNaN(h)) throw new Error('nema podatka o visini');
    return h;
  };
})(globalThis.Kviz = globalThis.Kviz || {});
