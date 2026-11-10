/* Kviz — OSM podaci iz OpenFreeMap vektorskih pločica (OpenMapTiles šema), bez biblioteka.
   Brzo (CDN), bez ključa; isti OSM podaci (ODbL). */
(function (K) {
  'use strict';
  const Z = 14;

  // ---------- Minimalni protobuf / MVT dekoder ----------
  function Reader(buf) { this.b = buf; this.p = 0; }
  Reader.prototype.varint = function () {
    let r = 0, s = 0, b;
    do { b = this.b[this.p++]; r += (b & 0x7f) * Math.pow(2, s); s += 7; } while (b & 0x80);
    return r;
  };
  Reader.prototype.skip = function (wt) {
    if (wt === 0) this.varint();
    else if (wt === 1) this.p += 8;
    else if (wt === 2) { const l = this.varint(); this.p += l; }
    else if (wt === 5) this.p += 4;
  };
  Reader.prototype.bytes = function () { const l = this.varint(); const s = this.b.subarray(this.p, this.p + l); this.p += l; return s; };
  const td = new TextDecoder();
  const zz = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);

  function packed(r) { const end = r.varint() + r.p; const out = []; while (r.p < end) out.push(r.varint()); return out; }

  function readValue(buf) {
    const r = new Reader(buf); let v = null;
    while (r.p < buf.length) {
      const tag = r.varint(), f = tag >> 3, wt = tag & 7;
      if (f === 1) v = td.decode(r.bytes());
      else if (f === 2) { v = new DataView(buf.buffer, buf.byteOffset + r.p, 4).getFloat32(0, true); r.p += 4; }
      else if (f === 3) { v = new DataView(buf.buffer, buf.byteOffset + r.p, 8).getFloat64(0, true); r.p += 8; }
      else if (f === 4 || f === 5) v = r.varint();
      else if (f === 6) v = zz(r.varint());
      else if (f === 7) v = !!r.varint();
      else r.skip(wt);
    }
    return v;
  }

  function readLayer(buf) {
    const r = new Reader(buf);
    const L = { name: '', keys: [], values: [], feats: [], extent: 4096 };
    while (r.p < buf.length) {
      const tag = r.varint(), f = tag >> 3, wt = tag & 7;
      if (f === 1) L.name = td.decode(r.bytes());
      else if (f === 2) L.feats.push(r.bytes());
      else if (f === 3) L.keys.push(td.decode(r.bytes()));
      else if (f === 4) L.values.push(readValue(r.bytes()));
      else if (f === 5) L.extent = r.varint();
      else r.skip(wt);
    }
    return L;
  }

  function readFeature(buf, L) {
    const r = new Reader(buf);
    const ft = { id: 0, type: 0, props: {}, geom: [] };
    while (r.p < buf.length) {
      const tag = r.varint(), f = tag >> 3, wt = tag & 7;
      if (f === 1) ft.id = r.varint();
      else if (f === 2) { const t = packed(r); for (let i = 0; i + 1 < t.length; i += 2) ft.props[L.keys[t[i]]] = L.values[t[i + 1]]; }
      else if (f === 3) ft.type = r.varint();
      else if (f === 4) ft.geom = packed(r);
      else r.skip(wt);
    }
    return ft;
  }

  // Prva tačka i "srednja" tačka geometrije (dovoljno za položaj objekta)
  function points(geom) {
    const pts = []; let x = 0, y = 0;
    for (let i = 0; i < geom.length;) {
      const c = geom[i++], cmd = c & 7, n = c >> 3;
      if (cmd === 1 || cmd === 2) for (let k = 0; k < n; k++) { x += zz(geom[i++]); y += zz(geom[i++]); pts.push([x, y]); }
    }
    return pts;
  }

  function toLonLat(tx, ty, px, py, extent, z = Z) {
    const n = Math.pow(2, z);
    const lon = (tx + px / extent) / n * 360 - 180;
    const yy = Math.PI * (1 - 2 * (ty + py / extent) / n);
    const lat = Math.atan(Math.sinh(yy)) * 180 / Math.PI;
    return [lat, lon];
  }

  K.decodeTile = function (buf, tx, ty, wanted, z = Z) {
    const r = new Reader(buf);
    const out = {};
    while (r.p < buf.length) {
      const tag = r.varint(), f = tag >> 3, wt = tag & 7;
      if (f !== 3) { r.skip(wt); continue; }
      const L = readLayer(r.bytes());
      if (wanted && !wanted.includes(L.name)) continue;
      out[L.name] = L.feats.map((fb) => {
        const ft = readFeature(fb, L);
        const pts = points(ft.geom);
        const mid = pts[Math.floor(pts.length / 2)] || [0, 0];
        const [lat, lon] = toLonLat(tx, ty, mid[0], mid[1], L.extent, z);
        const o = { id: ft.id, type: ft.type, props: ft.props, lat, lon };
        // za linije (ulice) čuvamo i ostale tačke, da bi se znalo da li ulica prolazi kroz krug
        if (ft.type === 2 && L.name === 'transportation_name') {
          const step = Math.max(1, Math.floor(pts.length / 12));
          o.line = pts.filter((_, i) => i % step === 0).map((p) => toLonLat(tx, ty, p[0], p[1], L.extent, z));
        }
        return o;
      });
    }
    return out;
  };

  // ---------- Preuzimanje pločica ----------
  let tmpl = null;
  async function template() {
    if (tmpl) return tmpl;
    const j = await K.fetchJSON('https://tiles.openfreemap.org/planet', {}, 15000);
    tmpl = j.tiles[0];
    return tmpl;
  }
  const tileXY = (lat, lon) => {
    const n = Math.pow(2, Z);
    const x = Math.floor((lon + 180) / 360 * n);
    const r = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    return [x, y];
  };
  const cache = new Map();
  async function getTile(x, y, wanted) {
    const key = `${x}/${y}/${wanted ? wanted.join(",") : "*"}`;
    if (!cache.has(key)) {
      cache.set(key, (async () => {
        const t = await template();
        const url = t.replace('{z}', Z).replace('{x}', x).replace('{y}', y);
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
        try {
          const res = await fetch(url, { signal: ctl.signal });
          if (res.status === 204 || res.status === 404) return {};
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return K.decodeTile(new Uint8Array(await res.arrayBuffer()), x, y, wanted);
        } finally { clearTimeout(to); }
      })());
    }
    return cache.get(key);
  }

  // Sve pločice u krugu radiusM oko tačke (z14 pločica ≈ 1,7 km na ekvatoru, ~1,7*cos(lat))
  K.tilesAround = async function (lat, lon, radiusM, wanted = ['poi', 'transportation_name', 'park']) {
    const dLat = radiusM / 111320, dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    const [x0, y0] = tileXY(lat + dLat, lon - dLon);
    const [x1, y1] = tileXY(lat - dLat, lon + dLon);
    const xy = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) xy.push([x, y]);
    if (xy.length > 240) throw new Error('prevelika oblast za pločice');
    // najviše 8 istovremenih preuzimanja
    const tiles = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(8, xy.length) }, async () => {
      while (next < xy.length) {
        const [x, y] = xy[next++];
        tiles.push(await getTile(x, y, wanted).catch(() => ({})));
      }
    }));
    const merged = {};
    for (const t of tiles) for (const k in t) (merged[k] = merged[k] || []).push(...t[k]);
    return merged;
  };

  // ---------- Pretvaranje u objekte za kviz ----------
  const STREET_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'pedestrian']);

  // Zanati, usluge i radnje (OpenMapTiles poi subclass -> naziv)
  K.SERVICES = {
    tailor: { one: 'krojač (šnajder)', many: 'krojačkih radnji' },
    locksmith: { one: 'bravar / ključar', many: 'bravara i ključara' },
    watches: { one: 'časovničar', many: 'časovničarskih radnji' },
    dry_cleaning: { one: 'hemijsko čišćenje', many: 'hemijskih čistionica' },
    laundry: { one: 'perionica veša', many: 'perionica veša' },
    florist: { one: 'cvećara', many: 'cvećara' },
    optician: { one: 'optičar', many: 'optičarskih radnji' },
    car_repair: { one: 'auto-mehaničar (servis)', many: 'auto-servisa' },
    car_parts: { one: 'auto-delovi', many: 'prodavnica auto-delova' },
    hairdresser: { one: 'frizer', many: 'frizerskih salona' },
    beauty: { one: 'kozmetički salon', many: 'kozmetičkih salona' },
    bakery: { one: 'pekara', many: 'pekara' },
    butcher: { one: 'mesara', many: 'mesara' },
    pharmacy: { one: 'apoteka', many: 'apoteka' },
    jewelry: { one: 'zlatara', many: 'zlatara' },
    photo: { one: 'foto radnja', many: 'foto radnji' },
    hardware: { one: 'gvožđara', many: 'gvožđara' },
    paint: { one: 'farbara', many: 'farbara' },
    kiosk: { one: 'trafika (kiosk)', many: 'trafika' },
    greengrocer: { one: 'piljarnica', many: 'piljarnica' },
    marketplace: { one: 'pijaca', many: 'pijaca' },
    post_office: { one: 'pošta', many: 'pošta' },
    library: { one: 'biblioteka', many: 'biblioteka' },
    // ove vrste uglavnom dolaze iz Overture Places (OSM pločice ih nemaju)
    shoemaker: { one: 'obućar', many: 'obućara' },
    plumber: { one: 'vodoinstalater', many: 'vodoinstalatera' },
    electrician: { one: 'električar', many: 'električara' },
    tyres: { one: 'vulkanizer', many: 'vulkanizera' },
    hvac: { one: 'serviser grejanja i klima', many: 'servisera grejanja i klima' },
    carpenter: { one: 'stolar', many: 'stolara' },
    appliance: { one: 'serviser kućnih aparata', many: 'servisera kućnih aparata' },
    glazier: { one: 'staklorezac', many: 'staklorezaca' },
    vet: { one: 'veterinar', many: 'veterinarskih ambulanti' },
    dentist: { one: 'zubar', many: 'zubarskih ordinacija' }
  };

  // OSM + Overture zajedno: ista vrsta na <60 m sa sličnim (ili bez) imenom = ista radnja
  K.mergeServices = function (osmSvc, overture, inside, lat, lon) {
    const out = osmSvc.map((s) => ({ ...s, src: 'OSM' }));
    for (const p of overture) {
      if (!p.kind || !K.SERVICES[p.kind]) continue;
      const dup = out.find((s) => s.kind === p.kind && K.dist(s.lat, s.lon, p.lat, p.lon) < 60 &&
        (!s.name || !p.name || K.norm(s.name) === K.norm(p.name) || K.tooClose(s.name, p.name)));
      if (dup) { dup.src = 'OSM + Overture'; continue; }
      out.push({ kind: p.kind, name: p.name, lat: p.lat, lon: p.lon, d: K.dist(lat, lon, p.lat, p.lon), inside: inside(p.lat, p.lon), id: 'ov' + p.id, src: 'Overture' });
    }
    return out;
  };

  function catOfPoi(p) {
    if (p.subclass === 'school' && p.class === 'school') return 'school';
    if (p.subclass === 'kindergarten') return 'kindergarten';
    if (p.class === 'park' && p.subclass === 'park') return 'park';
    if (p.class === 'monument' || p.subclass === 'memorial' || (p.subclass === 'artwork' && p.name)) return 'monument';
    if (p.subclass === 'bus_stop' || p.subclass === 'tram_stop') return 'stop';
    return null;
  }

  // inside(lat, lon): da li je tačka "u kraju" (krug ili poligon opštine/grada)
  K.osmFromTiles = async function (lat, lon, loadR, inside, farOk) {
    const m = await K.tilesAround(lat, lon, loadR);
    const local = { items: [], routes: [] }, far = { items: [], routes: [] };
    const services = [];
    const seen = new Set();
    const add = (bucket, it) => { const k = bucket === local ? 'L' + it.key : 'F' + it.key; if (!seen.has(k)) { seen.add(k); bucket.items.push(it); } };

    // ulice: ulica je u kraju ako bilo koja njena tačka upada u kraj
    const streets = new Map();
    for (const f of m.transportation_name || []) {
      const p = f.props;
      if (!p.name || !STREET_CLASSES.has(p.class)) continue;
      const name = K.toLatin(p['name:sr-Latn'] || p.name).trim();
      if (!name || K.isBanned(name) || /^[A-Z]?\d/.test(name)) continue;
      const key = 'street/' + K.norm(name);
      const s = streets.get(key) || { key, cat: 'street', name, lat: f.lat, lon: f.lon, inside: false, minD: Infinity };
      for (const [a, b] of f.line || [[f.lat, f.lon]]) {
        if (inside(a, b)) s.inside = true;
        const d = K.dist(lat, lon, a, b);
        if (d < s.minD) { s.minD = d; s.lat = a; s.lon = b; }
      }
      streets.set(key, s);
    }
    for (const s of streets.values()) {
      if (s.inside) add(local, s);
      else if (farOk(s.lat, s.lon, s.minD)) add(far, s);
    }

    // parkovi iz sloja "park" + objekti iz sloja "poi"
    const feats = (m.park || []).filter((f) => f.props.name).map((f) => ({ ...f, props: { ...f.props, class: 'park', subclass: 'park' } }))
      .concat(m.poi || []);
    for (const f of feats) {
      const p = f.props;
      const isIn = inside(f.lat, f.lon);
      const d = K.dist(lat, lon, f.lat, f.lon);
      if (K.SERVICES[p.subclass]) {
        services.push({ kind: p.subclass, name: p.name ? K.toLatin(p['name:sr-Latn'] || p.name) : '', lat: f.lat, lon: f.lon, d, inside: isIn, id: f.id });
      }
      const cat = catOfPoi(p);
      if (!cat || !p.name) continue;
      const name = K.toLatin(p['name:sr-Latn'] || p.name).trim();
      if (!name || K.isBanned(name)) continue;
      const it = { key: `${cat}/${f.id || K.norm(name)}`, cat, name, lat: f.lat, lon: f.lon };
      if (isIn) add(local, it);
      else if (farOk(f.lat, f.lon, d)) add(far, it);
    }
    // ista radnja može biti u dve susedne pločice
    const svc = K.uniqBy(services, (s) => `${s.kind}|${s.id || ''}|${s.lat.toFixed(4)}|${s.lon.toFixed(4)}`);
    return { local, far, services: svc };
  };

  // Tačka u poligonu (GeoJSON Polygon / MultiPolygon)
  K.inGeo = function (geo, lat, lon) {
    const ring = (r) => {
      let c = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const poly = (p) => ring(p[0]) && !p.slice(1).some(ring);
    if (!geo) return false;
    if (geo.type === 'Polygon') return poly(geo.coordinates);
    if (geo.type === 'MultiPolygon') return geo.coordinates.some(poly);
    return false;
  };
})(globalThis.Kviz = globalThis.Kviz || {});

/* Ime kraja: najbliži "place" (kvart, naselje, selo) iz OSM pločica */
(function (K) {
  'use strict';
  const RANK = { neighbourhood: 0, quarter: 0, suburb: 1, hamlet: 1, village: 1, isolated_dwelling: 2, town: 2, city: 3 };
  K.nearestPlace = async function (lat, lon) {
    const m = await K.tilesAround(lat, lon, 1500, ['place']);
    let best = null;
    for (const f of m.place || []) {
      const p = f.props;
      if (!p.name || RANK[p.class] === undefined) continue;
      const d = K.dist(lat, lon, f.lat, f.lon);
      const lim = p.class === 'town' || p.class === 'city' ? 4000 : 1500;
      if (d > lim) continue;
      const score = d + RANK[p.class] * 600; // kvart ispred grada, ako su slično blizu
      if (!best || score < best.score) best = { name: K.toLatin(p['name:sr-Latn'] || p.name), cls: p.class, d, score };
    }
    return best;
  };
})(globalThis.Kviz = globalThis.Kviz || {});
