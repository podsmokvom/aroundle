/* Aroundle — test pravljenja kviza na listi lokacija (pokreće se u konzoli pregledača na lokalnom sajtu):
   await KvizTest([[lat, lon, 'ime'], ...], 'sr')
   Za svaku lokaciju: broj pitanja, sa kog nivoa (r1000 = 1 km, r2000, city, mun, r5000), vreme i napomene. */
globalThis.KvizTest = async function (list, lang = 'sr') {
  const K = globalThis.Kviz;
  K.lang = lang;
  const out = [];
  for (const [lat, lon, label] of list) {
    const t0 = performance.now();
    let addr = null;
    try { addr = (await K.reverseNative(lat, lon)).address; } catch (e) { /* bez adrese */ }
    const p = K.placeFromAddress(addr, lat, lon);
    p.gradKey = p.grad; p.krajKey = p.kraj;
    try { const np = await K.nearestPlace(lat, lon); if (np) { p.kraj = np.name; p.krajKey = np.local; } } catch (e) { /* */ }
    const place = { ...p, lat: +lat.toFixed(5), lon: +lon.toFixed(5) };
    const log = [];
    const q = await K.buildQuiz(place, (m, c) => log.push(`${((performance.now() - t0) / 1000).toFixed(1)}s ${c ? c + ': ' : ''}${m}`));
    const levels = {};
    for (const x of q.questions) levels[x.level] = (levels[x.level] || 0) + 1;
    out.push({
      label, kraj: place.kraj, grad: place.grad, n: q.questions.length, levels,
      secs: +((performance.now() - t0) / 1000).toFixed(1), notes: q.notes,
      answers: q.questions.map((x) => `${x.cat}: ${x.type === 'map' ? '(mapa)' : x.options[x.answer]}`),
      log: log.filter((l) => /kandidata|dopunjujem/.test(l)),
      timing: log.filter((l) => / ok: | warn: /.test(l)).map((l) => l.slice(0, 70))
    });
  }
  return out;
};
