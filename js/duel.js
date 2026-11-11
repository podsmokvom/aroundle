/* Kviz — duel sa komšijom: ceo kviz (ista pitanja i redosled) + rezultat izazivača ide u link (#duel=…).
   Bez servera: podaci su sažeti (deflate) i kodirani base64url u delu linka posle #, koji ne ide ni na jedan server. */
(function (K) {
  'use strict';

  const b64u = {
    enc(bytes) {
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec(str) {
      const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
      const b = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
      return b;
    }
  };
  async function pipe(bytes, stream) {
    const s = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  // kratki linkovi izvora (GBIF linkovi imaju dug upit)
  const shortUrl = (u) => { try { const x = new URL(u); return x.search.length > 80 ? x.origin + x.pathname : u; } catch (e) { return ''; } };

  // tačka igrača zaokružena na 3 decimale (~100 m), ne tačna adresa
  K.duelPayload = function (quiz, name, res) {
    return {
      v: 2, d: quiz.day,
      p: { k: quiz.place.kraj, g: quiz.place.grad, kk: quiz.place.krajKey || undefined, gk: quiz.place.gradKey || undefined, c: quiz.place.country, la: +quiz.place.lat.toFixed(3), lo: +quiz.place.lon.toFixed(3) }, // ~100 m, ne tačna adresa
      s: quiz.scope, n: (name || "").slice(0, 24), r: res.score, pt: res.points, t: res.time, ok: res.oks.map((x) => (x ? 1 : 0)),
      q: quiz.questions.map((q) => ({
        c: q.cat, t: q.text, o: q.options, a: q.answer, e: q.explain, x: q.outsider ? 1 : 0,
        sn: q.source && q.source.name, su: q.source && shortUrl(q.source.url),
        tg: q.target ? [+q.target.lat.toFixed(6), +q.target.lon.toFixed(6), q.target.tol] : undefined
      }))
    };
  };
  // stari (dugi) link: ceo kviz sažet u #duel=… — rezerva kad server za kratke linkove ne odgovori
  K.duelEncode = async function (payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    return b64u.enc(await pipe(bytes, new CompressionStream('deflate-raw')));
  };
  K.duelDecode = async function (str) {
    const json = new TextDecoder().decode(await pipe(b64u.dec(str), new DecompressionStream('deflate-raw')));
    return K.duelFromPayload(JSON.parse(json));
  };

  // kratki link #d=<id>: kviz se čuva na serveru (api/duel.php)
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  K.duelSave = async function (payload) {
    const r = await withTimeout(fetch(`${K.API}duel.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), 6000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok || !/^[0-9A-Za-z]{8}$/.test(j.id || '')) throw new Error(j.error || `HTTP ${r.status}`);
    return j.id;
  };
  K.duelLoad = async function (id) {
    const r = await withTimeout(fetch(`${K.API}duel.php?id=${encodeURIComponent(id)}`), 10000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return K.duelFromPayload(j.payload);
  };
  // ?d=<id> (ne #d=): Facebook i ugrađeni pregledači (Viber, Instagram) ponekad odseku deo posle #
  K.duelShortLink = (id) => `${location.origin}${location.pathname}?d=${id}`;

  K.duelFromPayload = function (d) {
    if (![1, 2].includes(d.v) || !Array.isArray(d.q)) throw new Error("neispravan izazov");
    return {
      quiz: {
        created: Date.now(), duel: true, day: d.d || K.today(),
        place: { kraj: d.p.k, grad: d.p.g, krajKey: d.p.kk || '', gradKey: d.p.gk || '', country: d.p.c || "", lat: d.p.la, lon: d.p.lo },
        scope: d.s, notes: [],
        questions: d.q.map((q) => ({
          cat: q.c, text: q.t, options: q.o || [], answer: q.a, explain: q.e || '', outsider: !!q.x,
          source: { name: q.sn || '', url: q.su || '' },
          ...(q.tg ? { type: 'map', target: { lat: q.tg[0], lon: q.tg[1], tol: q.tg[2] } } : {})
        }))
      },
      from: { name: d.n || "Komšija", score: d.r, points: d.pt || 0, time: d.t || null, oks: d.ok || [] }
    };
  };

  K.duelLink = (code) => `${location.origin}${location.pathname}#duel=${code}`;
})(globalThis.Kviz = globalThis.Kviz || {});
