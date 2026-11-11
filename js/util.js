/* Kviz — pomoćne funkcije (bez zavisnosti) */
(function (K) {
  'use strict';

  // ---------- Ćirilica -> latinica ----------
  const MAP = {
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Ђ': 'Đ', 'Е': 'E', 'Ж': 'Ž', 'З': 'Z', 'И': 'I',
    'Ј': 'J', 'К': 'K', 'Л': 'L', 'Љ': 'Lj', 'М': 'M', 'Н': 'N', 'Њ': 'Nj', 'О': 'O', 'П': 'P', 'Р': 'R',
    'С': 'S', 'Т': 'T', 'Ћ': 'Ć', 'У': 'U', 'Ф': 'F', 'Х': 'H', 'Ц': 'C', 'Ч': 'Č', 'Џ': 'Dž', 'Ш': 'Š',
    'Ѓ': 'Ǵ', 'Ќ': 'Ḱ', 'Ѕ': 'Dz', 'Й': 'J', 'Ё': 'Jo', 'Ю': 'Ju', 'Я': 'Ja', 'Щ': 'Šč', 'Ы': 'Y',
    'Э': 'E', 'Ъ': '', 'Ь': '', 'Є': 'Je', 'І': 'I', 'Ї': 'Ji', 'Ґ': 'G'
  };
  K.translit = function (s) {
    if (!s) return '';
    s = String(s);
    if (!/[Ѐ-ӿ]/.test(s)) return s;
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const up = ch.toUpperCase();
      const m = MAP[up];
      if (m === undefined) { out += ch; continue; }
      if (ch !== up) out += m.toLowerCase();
      else if (m.length > 1) {
        const nx = s[i + 1];
        out += (nx && nx !== nx.toLowerCase()) ? m.toUpperCase() : m;
      } else out += m;
    }
    return out;
  };

  K.nameOf = function (tags) {
    if (!tags) return '';
    return (tags['name:sr-Latn'] || tags['name:sr_Latn'] || K.toLatin(tags.name || '')).trim();
  };

  K.norm = function (s) {
    return K.translit(s || '').toLowerCase()
      .replace(/đ/g, 'dj')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  };

  // Teme koje ne smeju u kviz (energetski objekti, parking, drveće, stanovi)
  K.BANNED = /parking|garaž|garaz|elektran|toplan|trafo|transformator|power ?(station|plant)|substation|heating plant|solarn|vetropark|wind ?farm|dalekovod|energet|drveć|drvec|stabla|stanova|apartman|kraftwerk|umspannwerk|centrale (electrique|thermique)|central (electrica|termica)|elektrostantsi|podstantsi/i;
  K.isBanned = (s) => K.BANNED.test(K.translit(s || ''));

  // ---------- Geo ----------
  K.dist = function (lat1, lon1, lat2, lon2) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  // ---------- Slučajnost sa seed-om (isti kraj + isti dan = ista pitanja) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  K.rand = Math.random;
  K.setSeed = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    K.rand = mulberry32(h >>> 0);
  };
  K.today = () => new Date().toISOString().slice(0, 10);

  // ---------- Nizovi ----------
  K.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(K.rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  K.pick = (arr) => arr[Math.floor(K.rand() * arr.length)];
  K.uniqBy = function (arr, fn) {
    const seen = new Set(), out = [];
    for (const x of arr) { const k = fn(x); if (!k || seen.has(k)) continue; seen.add(k); out.push(x); }
    return out;
  };
  K.chunk = function (arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  // ---------- Formatiranje ----------
  // brojevi po jeziku igrača (1.234,5 · 1,234.5 · 1 234,5)
  K.fmtNum = function (n, dec) {
    try {
      return new Intl.NumberFormat(K.locale ? K.locale() : 'sr-Latn-RS', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
    } catch (e) { return Number(n).toFixed(dec); }
  };
  K.fmtYear = (y) => (K.t ? (y < 0 ? K.t('fmt.yearBC', { y: -y }) : K.t('fmt.year', { y })) : String(y));
  // ćirilica -> latinica samo za igrače na latiničnim jezicima (ruski igrač vidi originalna imena)
  K.toLatin = (s) => (K.lang === 'ru' ? String(s || '') : K.translit(s));
  // jedinice kroz prevod (ruski: км, м, оч.)
  K.unitM = (n) => `${K.fmtNum(n, 0)} ${K.t('u.m')}`;
  K.unitKm = (n) => `${K.fmtNum(n, 0)} ${K.t('u.km')}`;
  K.unitP = (n) => `${K.fmtNum(n, 0)} ${K.t('u.p')}`;
  // vreme svuda kao m:ss (102 → „1:42“)
  K.mmss = (sec) => { if (sec == null || !isFinite(sec)) return '?'; const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // Ime objekta iz OSM pločica na jeziku igrača: name:<jezik> → name:en → lokalno ime ako je čitljivo
  // → name:latin (transliteracija za sva pisma). Srpski: name:sr-Latn, pa ćirilica preslovljena.
  const READ_LAT = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\p{Zs}]*$/u;
  const READ_CYR = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{N}\p{P}\p{S}\p{Zs}]*$/u;
  const SR_CYR = /^[\sА-Шабв-шЂЈЉЊЋЏђјљњћџ\p{N}\p{P}\p{S}]*$/u; // srpska ćirilica se tačno preslovljava
  K.nameOf = function (p) {
    if (!p || !p.name) return '';
    const L = K.lang;
    const pick = (...ks) => { for (const k of ks) if (p[k]) return String(p[k]); return ''; };
    let s = L === 'sr' ? pick('name:sr-Latn') || K.translit(pick('name:sr'))
      : L === 'hr' || L === 'bs' ? pick('name:' + L, 'name:sr-Latn')
      : L === 'ru' ? pick('name:ru')
      : pick('name:' + L, 'name:en', 'name_en');
    if (!s) {
      const n = String(p.name);
      const ok = L === 'ru' ? READ_CYR.test(n) : READ_LAT.test(n) || ((L === 'sr' || L === 'hr' || L === 'bs') && SR_CYR.test(n));
      s = ok ? n : pick('name:latin', 'name_int') || n;
    }
    s = K.toLatin(s).trim();
    // sirova/tehnička OSM imena („Al Hamra turn off_1“, „xyz_2“) nisu za kviz
    if (/_\d+$/.test(s) || /\bturn ?off\b/i.test(s)) return '';
    return s;
  };
  // Link ka objektu na openstreetmap.org. ID iz OpenMapTiles pločica = OSM ID × 10 + tip (1 node, 2 way, 3 relation).
  // Bez ID-a (ulice su spojene linije, Overture mesta): mapa sa markerom na tom mestu.
  K.osmUrl = function (id, lat, lon) {
    const n = typeof id === 'number' ? id : /^\d+$/.test(String(id || '')) ? Number(id) : NaN;
    const t = { 1: 'node', 2: 'way', 3: 'relation' }[n % 10];
    if (Number.isFinite(n) && n > 10 && t) return `https://www.openstreetmap.org/${t}/${Math.floor(n / 10)}`;
    const a = (+lat).toFixed(5), b = (+lon).toFixed(5);
    return `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=18/${a}/${b}`;
  };
  // da li igrač može da pročita tekst (latinica; za ruski i ćirilica) — japanski, arapski… se ne prikazuju
  K.readable = (s) => (K.lang === 'ru' ? READ_CYR : READ_LAT).test(K.toLatin(String(s || '')).replace(/\s+/g, ' '));
  // zagrade sa tuđim pismom iz Vikipedije („Kremlj (Russian: Арсенал…)“, „(三条京阪駅)“) se izbacuju iz teksta
  K.stripForeign = (s) => String(s || '').replace(/\s*[(（][^)）]*[)）]/g, (m) => (K.readable(m) ? m : ''));
  // Lokalno ime (isto za sve jezike igrača) — za ključ kraja i rang-liste
  K.localName = function (p) {
    if (!p || !p.name) return '';
    const n = K.translit(String(p.name));
    return (READ_LAT.test(n) ? n : String(p['name:latin'] || p.name_int || n)).trim();
  };
  K.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Mreža ----------
  K.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  K.extraHeaders = {};
  // HTTP 429 (previše zahteva, npr. GBIF): jednom ponovi posle kratke pauze
  K.fetchJSON = async function (url, opts = {}, timeout = 30000) {
    try { return await fetchOnce(url, opts, timeout); }
    catch (e) {
      if (!/HTTP 429/.test(e.message)) throw e;
      await K.sleep(1200 + Math.random() * 800);
      return fetchOnce(url, opts, timeout);
    }
  };
  async function fetchOnce(url, opts, timeout) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { ...(opts.headers || {}), ...K.extraHeaders },
        signal: ctl.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('isteklo vreme');
      throw e;
    } finally {
      clearTimeout(t);
    }
  };
})(globalThis.Kviz = globalThis.Kviz || {});

/* Klađenje je namerno izuzeto iz celog kviza („kladionice su zlo“): kladionice, kazina, automat-klubovi, lutrija,
   i mesta poznatih kladioničarskih brendova (npr. „Caffe Mozzart“), bez obzira na to kako ih izvor svrstava
   (Overture npr. vodi „Soccerbet“ kao igraonicu za decu). Bolje izbaciti koje mesto viška nego ubaciti kladionicu. */
(function (K) {
  'use strict';
  const BET_NAME = /(kladionic|kladion|mozzart|meridian|maxbet|max bet|soccerbet|soccer bet|admiral|balkan ?bet|merkur ?x ?tip|merkurxtip|oktagon|volcano ?bet|bet ?shop|\bbet\b|\bbets\b|betting|wettb[uü]ro|spielhalle|spielothek|tipico|bwin|ladbrokes|paddy power|william hill|sportingbet|betfair|casino|kazino|kasino|lutrij|lottery|lotto|automat ?klub|automat club|slot)/i;
  const BET_CAT = /(betting|bookmak|casino|gambl|lottery|lotto|slot)/i;
  K.isBetting = (name, cat) => BET_NAME.test(K.translit(name || '')) || BET_CAT.test(cat || '');
})(globalThis.Kviz = globalThis.Kviz || {});
