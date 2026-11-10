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
  K.toLatin = function (s) {
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
    return K.toLatin(s || '').toLowerCase()
      .replace(/đ/g, 'dj')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  };

  // Teme koje ne smeju u kviz (energetski objekti, parking, drveće, stanovi)
  K.BANNED = /parking|garaž|garaz|elektran|toplan|trafo|transformator|power ?(station|plant)|substation|heating plant|solarn|vetropark|wind ?farm|dalekovod|energet|drveć|drvec|stabla|stanova|apartman/i;
  K.isBanned = (s) => K.BANNED.test(K.toLatin(s || ''));

  // ---------- Geo ----------
  K.dist = function (lat1, lon1, lat2, lon2) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  // ---------- Nizovi ----------
  K.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  K.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
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
  K.fmtNum = function (n, dec) {
    const s = Math.abs(n).toFixed(dec).replace('.', ',');
    const parts = s.split(',');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 && Number(Math.abs(n).toFixed(dec)) !== 0 ? '−' : '') + parts.join(',');
  };
  K.fmtYear = (y) => (y < 0 ? `${-y}. p. n. e.` : `${y}.`);
  K.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Mreža ----------
  K.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  K.extraHeaders = {};
  K.fetchJSON = async function (url, opts = {}, timeout = 30000) {
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
