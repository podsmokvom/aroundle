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

  K.duelEncode = async function (quiz, name, score, oks) {
    const payload = {
      v: 1,
      p: { k: quiz.place.kraj, g: quiz.place.grad, la: +quiz.place.lat.toFixed(5), lo: +quiz.place.lon.toFixed(5) },
      s: quiz.scope, n: (name || '').slice(0, 24), r: score, ok: oks.map((x) => (x ? 1 : 0)),
      q: quiz.questions.map((q) => ({
        c: q.cat, t: q.text, o: q.options, a: q.answer, e: q.explain, x: q.outsider ? 1 : 0,
        sn: q.source && q.source.name, su: q.source && shortUrl(q.source.url),
        tg: q.target ? [+q.target.lat.toFixed(6), +q.target.lon.toFixed(6), q.target.tol] : undefined
      }))
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    return b64u.enc(await pipe(bytes, new CompressionStream('deflate-raw')));
  };

  K.duelDecode = async function (str) {
    const json = new TextDecoder().decode(await pipe(b64u.dec(str), new DecompressionStream('deflate-raw')));
    const d = JSON.parse(json);
    if (d.v !== 1 || !Array.isArray(d.q)) throw new Error('neispravan izazov');
    return {
      quiz: {
        created: Date.now(), duel: true,
        place: { kraj: d.p.k, grad: d.p.g, lat: d.p.la, lon: d.p.lo },
        scope: d.s, notes: [],
        questions: d.q.map((q) => ({
          cat: q.c, text: q.t, options: q.o || [], answer: q.a, explain: q.e || '', outsider: !!q.x,
          source: { name: q.sn || '', url: q.su || '' },
          ...(q.tg ? { type: 'map', target: { lat: q.tg[0], lon: q.tg[1], tol: q.tg[2] } } : {})
        }))
      },
      from: { name: d.n || 'Komšija', score: d.r, oks: d.ok || [] }
    };
  };

  K.duelLink = (code) => `${location.origin}${location.pathname}#duel=${code}`;
})(globalThis.Kviz = globalThis.Kviz || {});
