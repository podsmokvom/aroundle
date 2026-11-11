/* Aroundle — slika rezultata za deljenje (story 1080×1920 i post 1080×1350, 4:5).
   Izgled: Grok (odobreno 2026-11-11). Logo gore, kraj, datum, rezultat, vreme m:ss, kvadratići, „Izazivam te!“.
   Na story-ju su gornjih i donjih ~250 px prazni (Instagram trake). Nikad adresa ni koordinate.
   K.shareImage({ width, height, hood, date, score, n, timeSec, oks }) → Promise<canvas> */
(function (K) {
  'use strict';
  const RED = '#D7262E', CREAM = '#F5E9D0', CARD = '#FFFAF0', BLUE = '#1F3A93', INK = '#1a1a1a', OK = '#2e9e4f', MUTED = '#5e584c';
  const DOT = 'rgba(31, 58, 147, 0.22)';
  const BANGERS = 'Bangers, Impact, "Arial Black", sans-serif';
  const SANS = 'Inter, Roboto, "Segoe UI", "Noto Sans", system-ui, sans-serif';

  const mmss = (sec) => { const s = Math.max(0, Math.round(Number(sec) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  // datum na jeziku igrača (npr. „sreda, 11. novembar 2026.“ / „Wednesday, November 11, 2026“)
  const fmtDate = (d) => { try { return new Intl.DateTimeFormat(K.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d); } catch (e) { return d.toDateString(); } };

  function rrect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rr); else ctx.rect(x, y, w, h);
  }
  function dots(ctx, w, h) {
    ctx.fillStyle = CREAM; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = DOT;
    const step = 18;
    for (let yy = 8; yy < h; yy += step) {
      const ox = (Math.floor(yy / step) % 2) ? step / 2 : 0;
      for (let xx = 8 + ox; xx < w; xx += step) { ctx.beginPath(); ctx.arc(xx, yy, 2.15, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  function comicText(ctx, text, x, y, size) {
    ctx.font = `${size}px ${BANGERS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = Math.max(3, size * 0.10);
    ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
    ctx.fillStyle = RED; ctx.fillText(text, x, y);
  }
  function fitComic(ctx, text, maxW, maxSize, minSize) {
    let size = maxSize;
    ctx.font = `${size}px ${BANGERS}`;
    while (size > minSize && ctx.measureText(text).width > maxW) { size -= 2; ctx.font = `${size}px ${BANGERS}`; }
    return size;
  }
  const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  // logo sa sloganom na jeziku igrača (1024 px); ako ga nema, zajednički (engleski)
  const logoP = {};
  const logo = () => { const src = K.logoFor ? K.logoFor(1024) : 'assets/brand/aroundle-logo-1024.png'; return (logoP[src] = logoP[src] || loadImg(src).catch(() => loadImg('assets/brand/aroundle-logo-1024.png')).catch(() => { delete logoP[src]; return null; })); };

  K.shareImage = async function (opt) {
    const w = opt.width || 1080, h = opt.height || 1920;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    try { await document.fonts.load('80px Bangers'); } catch (e) { /* rezervni font */ }
    const img = await logo();
    const { score, n, timeSec } = opt;
    const oks = opt.oks || [];
    let hood = String(opt.hood || '').trim();
    if (hood.length > 28) hood = hood.slice(0, 27) + '…';

    const isStory = h / w > 1.4, isSquare = h / w < 1.1; // 1:1: manji logo i zbijeniji panel da sve stane
    const safeTop = isStory ? 250 : isSquare ? 28 : 40, safeBot = isStory ? h - 250 : isSquare ? h - 30 : h - 48;
    dots(ctx, w, h);
    const logoSize = isStory ? 560 : isSquare ? 250 : 480;
    const logoY = safeTop + (isStory ? 8 : 6);
    if (img) {
      ctx.save(); ctx.shadowColor = 'rgba(26, 26, 26, 0.28)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
      ctx.drawImage(img, Math.round((w - logoSize) / 2), logoY, logoSize, logoSize); ctx.restore();
    }

    const panelX = 70, panelW = w - 140, pad = 42, innerW = panelW - 2 * pad;
    const hoodSize = fitComic(ctx, hood, innerW, isStory ? 92 : isSquare ? 72 : 86, 48);
    const scoreSize = isStory ? 156 : isSquare ? 112 : 144;
    const nSq = Math.max(1, oks.length), sqGap = nSq > 8 ? 12 : 14;
    const sq = Math.min(78, Math.floor((innerW - sqGap * (nSq - 1)) / nSq));
    const scoreH = Math.round(scoreSize * 0.82), dateH = 34, timeH = 46, ctaH = 92 + 44;
    const panelH = pad + hoodSize + 14 + dateH + 20 + scoreH + 16 + timeH + 26 + sq + 34 + ctaH + pad;
    const minTop = logoY + logoSize + (isStory ? 52 : isSquare ? 18 : 28);
    let top = safeBot - 14 - panelH;
    if (top < minTop) top = minTop;

    rrect(ctx, panelX + 8, top + 8, panelW, panelH, 32); ctx.fillStyle = INK; ctx.fill();
    rrect(ctx, panelX, top, panelW, panelH, 32); ctx.fillStyle = CARD; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();

    let y = top + pad;
    comicText(ctx, hood, w / 2, y + hoodSize * 0.82, hoodSize);
    y += hoodSize + 14;
    ctx.font = `600 30px ${SANS}`; ctx.fillStyle = MUTED; ctx.textAlign = 'center';
    ctx.fillText(fmtDate(opt.date || new Date()), w / 2, y + dateH * 0.85);
    y += dateH + 20;
    ctx.font = `${scoreSize}px ${BANGERS}`; ctx.fillStyle = INK;
    ctx.fillText(`${score}/${n}`, w / 2, y + scoreH);
    y += scoreH + 16;
    ctx.font = `700 42px ${SANS}`; ctx.fillStyle = BLUE;
    ctx.fillText(`⏱  ${mmss(timeSec)}`, w / 2, y + timeH * 0.8);
    y += timeH + 26;

    const gx = panelX + pad + (innerW - (nSq * sq + (nSq - 1) * sqGap)) / 2;
    oks.forEach((ok, i) => {
      rrect(ctx, gx + i * (sq + sqGap), y, sq, sq, 12);
      ctx.fillStyle = ok ? OK : RED; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    });
    y += sq + 34;

    // dugme „Izazivam te!“ + aroundle.com
    const label = K.t('card.cta').toUpperCase();
    ctx.font = `54px ${BANGERS}`;
    const bw = Math.min(innerW, Math.max(520, ctx.measureText(label).width + 80)), bh = 92, bx = w / 2 - bw / 2;
    rrect(ctx, bx + 6, y + 6, bw, bh, 20); ctx.fillStyle = INK; ctx.fill();
    rrect(ctx, bx, y, bw, bh, 20); ctx.fillStyle = RED; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, y + bh / 2 + 2);
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 30px ${SANS}`; ctx.fillStyle = BLUE;
    ctx.fillText('aroundle.com', w / 2, y + bh + 44);
    ctx.textAlign = 'left';
    return c;
  };
})(globalThis.Kviz = globalThis.Kviz || {});
