/* Kviz — Overture Maps Places (CDLA Permissive 2.0) iz PMTiles arhive, direktno iz pregledača.
   Mnogo više radnji i zanatlija nego OSM (izvori: Meta, Microsoft, Foursquare…). */
(function (K) {
  'use strict';
  K.OVERTURE_RELEASE = '2026-10-21.0';
  const url = () => `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${K.OVERTURE_RELEASE}/places.pmtiles`;

  async function range(off, len) {
    const r = await fetch(url(), { headers: { Range: `bytes=${off}-${off + len - 1}` } });
    if (r.status !== 206 && r.status !== 200) throw new Error(`Overture HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  async function decompress(buf, kind) {
    if (kind === 1 || kind === 0) return buf;
    if (kind !== 2) throw new Error('Overture: nepodržana kompresija ' + kind);
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  const u64 = (dv, o) => dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 4294967296;

  function readVarint(b, p) {
    let r = 0, s = 0, x;
    do { x = b[p.i++]; r += (x & 0x7f) * Math.pow(2, s); s += 7; } while (x & 0x80);
    return r;
  }
  function parseDir(b) {
    const p = { i: 0 };
    const n = readVarint(b, p);
    const e = Array.from({ length: n }, () => ({}));
    let last = 0;
    for (const x of e) { last += readVarint(b, p); x.id = last; }
    for (const x of e) x.run = readVarint(b, p);
    for (const x of e) x.len = readVarint(b, p);
    for (let k = 0; k < n; k++) {
      const v = readVarint(b, p);
      e[k].off = (v === 0 && k > 0) ? e[k - 1].off + e[k - 1].len : v - 1;
    }
    return e;
  }
  function findEntry(dir, id) {
    let lo = 0, hi = dir.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (dir[m].id < id) lo = m + 1; else if (dir[m].id > id) hi = m - 1; else return dir[m];
    }
    if (hi >= 0) {
      const e = dir[hi];
      if (e.run === 0) return e;               // pokazivač na pod-direktorijum
      if (id - e.id < e.run) return e;
    }
    return null;
  }
  function tileId(z, x, y) {
    let acc = 0;
    for (let a = 0; a < z; a++) acc += Math.pow(4, a);
    const n = Math.pow(2, z);
    let d = 0, tx = x, ty = y;
    for (let s = n / 2; s >= 1; s /= 2) {
      const rx = (tx & s) > 0 ? 1 : 0, ry = (ty & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) {
        if (rx === 1) { tx = s - 1 - tx; ty = s - 1 - ty; }
        const t = tx; tx = ty; ty = t;
      }
    }
    return acc + d;
  }

  let hdrP = null;
  function header() {
    if (!hdrP) {
      hdrP = (async () => {
        const b = await range(0, 16384);
        const dv = new DataView(b.buffer);
        if (String.fromCharCode(...b.slice(0, 7)) !== 'PMTiles') throw new Error('Overture: nije PMTiles');
        const h = {
          rootOff: u64(dv, 8), rootLen: u64(dv, 16), leafOff: u64(dv, 40), dataOff: u64(dv, 56),
          ic: b[97], tc: b[98], minZ: b[100], maxZ: b[101]
        };
        const rootBuf = h.rootOff + h.rootLen <= b.length ? b.slice(h.rootOff, h.rootOff + h.rootLen) : await range(h.rootOff, h.rootLen);
        h.root = parseDir(await decompress(rootBuf, h.ic));
        return h;
      })();
      hdrP.catch(() => { hdrP = null; });
    }
    return hdrP;
  }
  const leafCache = new Map();
  async function getTileBytes(z, x, y) {
    const h = await header();
    const id = tileId(z, x, y);
    let dir = h.root;
    for (let depth = 0; depth < 4; depth++) {
      const e = findEntry(dir, id);
      if (!e) return null;
      if (e.run > 0) return decompress(await range(h.dataOff + e.off, e.len), h.tc);
      const key = e.off;
      if (!leafCache.has(key)) leafCache.set(key, range(h.leafOff + e.off, e.len).then((b) => decompress(b, h.ic)).then(parseDir));
      dir = await leafCache.get(key);
    }
    return null;
  }

  // Overture kategorija (taxonomy.primary) -> naša vrsta (ključ u K.SERVICES)
  K.OVERTURE_MAP = {
    shoe_repair: 'shoemaker', sewing_and_alterations: 'tailor', plumbing: 'plumber', electrician: 'electrician',
    tire_dealer_and_repair: 'tyres', key_and_locksmith: 'locksmith', hvac_service: 'hvac', carpenter: 'carpenter',
    appliance_repair_service: 'appliance', glass_and_mirror_sales_service: 'glazier', automotive_repair: 'car_repair',
    hair_salon: 'hairdresser', barber: 'hairdresser', dry_cleaning: 'dry_cleaning', laundromat: 'laundry',
    florist: 'florist', bakery: 'bakery', butcher_shop: 'butcher', pharmacy: 'pharmacy', optician: 'optician',
    watch_repair_service: 'watches', beauty_salon: 'beauty', nail_salon: 'beauty', veterinarian: 'vet', dentist: 'dentist',
    jewelry_store: 'jewelry', hardware_store: 'hardware',
    health_food_store: 'health_food', organic_grocery_store: 'health_food', cafe: 'cafe', coffee_shop: 'cafe',
    indoor_playground: 'kids_play', kids_recreation_and_party: 'kids_play', playground: 'playground', ice_cream_shop: 'ice_cream'
  };
  const primaryOf = (p) => {
    const t = p.taxonomy;
    if (t) { try { const j = typeof t === 'string' ? JSON.parse(t) : t; if (j.primary) return j.primary; } catch (e) { /* */ } }
    return p.basic_category || '';
  };

  // Sva mesta (places) u krugu radiusM: [{name, cat, kind, lat, lon, conf}]
  K.overturePlaces = async function (lat, lon, radiusM, z = 14) {
    const h = await header();
    z = Math.min(z, h.maxZ);
    const n = Math.pow(2, z);
    const xy = (la, lo) => {
      const r = la * Math.PI / 180;
      return [Math.floor((lo + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)];
    };
    const dLat = radiusM / 111320, dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    const [x0, y0] = xy(lat + dLat, lon - dLon), [x1, y1] = xy(lat - dLat, lon + dLon);
    const jobs = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push([x, y]);
    if (jobs.length > 64) throw new Error('Overture: prevelika oblast');
    const out = [];
    await Promise.all(jobs.map(async ([x, y]) => {
      const b = await getTileBytes(z, x, y).catch(() => null);
      if (!b) return;
      const t = K.decodeTile(b, x, y, null, z);
      for (const L in t) for (const f of t[L]) {
        const p = f.props;
        const cat = primaryOf(p);
        if (p.operating_status && p.operating_status !== "open") continue;
        if (p.confidence != null && +p.confidence < 0.4) continue;
        out.push({
          id: p.id || f.id, name: K.toLatin(p['@name'] || p.name || p['names.primary'] || ''), cat: String(cat),
          conf: p.confidence != null ? +p.confidence : null, kind: K.OVERTURE_MAP[cat] || null, lat: f.lat, lon: f.lon
        });
      }
    }));
    out.sort((a, b) => String(a.id).localeCompare(String(b.id))); // stabilan redosled
    return K.uniqBy(out, (o) => String(o.id) + '|' + o.lat.toFixed(5));
  };
})(globalThis.Kviz = globalThis.Kviz || {});
