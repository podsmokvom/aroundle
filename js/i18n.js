/* Aroundle — prevodi: jezik igrača (po pregledaču, uz ručni izbor). Rečnici su u js/lang/<jezik>.js */
(function (K) {
  'use strict';
  K.I18N = K.I18N || {};
  K.LANGS = { sr: 'Srpski', hr: 'Hrvatski', bs: 'Bosanski', en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', ru: 'Русский' };

  K.langManual = false; // true kad je igrač sam izabrao jezik (to se pamti i uvek ima prednost)
  // jezik iz adrese (/de/, /sr/…) ima prednost: tako se dolazi sa pretraživača i iz podeljenih linkova
  K.PATH_LANG = (location.pathname.match(/^\/(en|sr|hr|bs|de|fr|es|ru)(\/|$)/) || [])[1] || '';
  function detect() {
    if (K.PATH_LANG) { K.langManual = true; return K.PATH_LANG; }
    try { const s = localStorage.getItem('kviz:lang'); if (s && K.LANGS[s]) { K.langManual = true; return s; } } catch (e) { /* bez memorije */ }
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
    const codes = list.map((l) => {
      const c = String(l).toLowerCase();
      if (/^(sr|sh|cnr|me)\b/.test(c)) return 'sr';
      const base = c.split('-')[0];
      return K.LANGS[base] ? base : '';
    }).filter(Boolean);
    // Pregledač na engleskom (čest slučaj i kod nas): ako je u listi jezika pregledača i neki drugi naš jezik
    // (npr. en-US, en, sr), to je verovatno jezik mesta gde igrač živi. Inače jezik po vremenskoj zoni uređaja.
    // Ništa se ne šalje i ne traži dozvola; ručni izbor jezika uvek ima prednost.
    if (!codes.length || codes[0] === 'en') return codes.find((c) => c !== 'en') || byTimeZone() || 'en';
    return codes[0];
  }
  function byTimeZone() {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
    const city = tz.split('/').pop();
    const TZ = {
      sr: 'Belgrade Podgorica', hr: 'Zagreb', bs: 'Sarajevo',
      de: 'Berlin Busingen Vienna Zurich Vaduz', fr: 'Paris Monaco',
      es: 'Madrid Canary Ceuta Mexico_City Monterrey Merida Cancun Tijuana Chihuahua Bogota Lima Santiago Caracas Buenos_Aires Cordoba Mendoza Montevideo Asuncion La_Paz Guayaquil Quito Guatemala El_Salvador Tegucigalpa Managua Costa_Rica Panama Havana Santo_Domingo',
      ru: 'Moscow Kaliningrad Volgograd Samara Saratov Ulyanovsk Astrakhan Kirov Yekaterinburg Omsk Novosibirsk Barnaul Tomsk Novokuznetsk Krasnoyarsk Irkutsk Chita Yakutsk Vladivostok Magadan Sakhalin Kamchatka Anadyr Minsk'
    };
    for (const l in TZ) if (TZ[l].split(' ').includes(city)) return l;
    return '';
  }
  K.lang = detect();

  // Prevod ključa; {ime} se menja vrednošću iz vars. Ako fali u jeziku: engleski, pa srpski, pa sam ključ.
  K.t = function (key, vars) {
    const d = K.I18N[K.lang] || {};
    let s = d[key];
    if (s == null && (K.lang === 'hr' || K.lang === 'bs')) s = (K.I18N.sr || {})[key];
    if (s == null) s = (K.I18N.en || {})[key];
    if (s == null) s = (K.I18N.sr || {})[key];
    if (s == null) return key;
    return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
  };
  // Nasumična stavka iz liste (ključ sa nizom u rečniku)
  K.tList = function (key) {
    const d = K.I18N[K.lang] || {};
    return d[key] || (K.I18N.en || {})[key] || (K.I18N.sr || {})[key] || [];
  };

  // Jezici za izvore podataka
  // Vikipedija samo na jeziku igrača (ranije i engleska kao dopuna: engleski naslovi u ruskom/španskom kvizu);
  // za sr/hr/bs i susedni jezici, jer su razumljivi
  K.wikiLangs = () => ({ sr: ['sr', 'hr', 'bs'], hr: ['hr', 'sr', 'bs'], bs: ['bs', 'hr', 'sr'] }[K.lang] || [K.lang]);
  K.wdLangs = () => ({ sr: ['sr-el', 'sr'], hr: ['hr', 'sh'], bs: ['bs', 'sh'] }[K.lang] || [K.lang]).concat(K.lang === 'en' ? [] : ['en']);
  K.acceptLang = () => ({ sr: 'sr-Latn,sr,en', hr: 'hr,sr-Latn,en', bs: 'bs,hr,sr-Latn,en' }[K.lang] || `${K.lang},en`);
  K.gbifLang = () => ({ sr: 'srp', hr: 'hrv', bs: 'bos', en: 'eng', de: 'deu', fr: 'fra', es: 'spa', ru: 'rus' }[K.lang] || 'eng');
  K.locale = () => ({ sr: 'sr-Latn-RS', hr: 'hr-HR', bs: 'bs-Latn-BA', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', ru: 'ru-RU' }[K.lang] || 'en');

  // Statični tekstovi u HTML-u: data-i18n (tekst), data-i18n-html, data-i18n-ph (placeholder), data-i18n-title, data-i18n-aria
  K.LOGO_LANGS = ['en', 'sr', 'hr', 'bs', 'de', 'fr', 'es', 'ru'];
  K.logoFor = (size) => `assets/brand/i18n/aroundle-logo-${K.LOGO_LANGS.includes(K.lang) ? K.lang : 'en'}-${size}.png`;
  K.applyI18n = function (root = document) {
    document.documentElement.lang = K.lang === 'sr' ? 'sr-Latn' : K.lang;
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = K.t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = K.t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = K.t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = K.t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', K.t(el.dataset.i18nAria)); });
    document.title = K.t('page.title');
    // adresa prati jezik: /sr/, /de/… (upit ?d= i #… ostaju), pa i podeljeni linkovi nose jezik; logo vodi na početnu tog jezika
    if (root === document) {
      const p = '/' + K.lang + '/';
      try { if (location.pathname !== p && history.replaceState) history.replaceState(history.state, '', p + location.search + location.hash); } catch (e) { /* npr. file:// */ }
      document.querySelectorAll('a.home').forEach((a) => a.setAttribute('href', p));
    }
    // logo sa sloganom na jeziku igrača (assets/brand/i18n, odobrio korisnik 2026-11-11); favicon i ikonice ostaju iste
    root.querySelectorAll('img[data-i18n-logo]').forEach((el) => {
      const L = K.LOGO_LANGS.includes(K.lang) ? K.lang : 'en';
      el.src = `assets/brand/i18n/aroundle-logo-${L}-192.png`;
      el.srcset = `assets/brand/i18n/aroundle-logo-${L}-192.png 1x, assets/brand/i18n/aroundle-logo-${L}-512.png 2x`;
    });
  };

  K.setLang = function (code) {
    if (!K.LANGS[code]) return;
    K.lang = code;
    K.langManual = true;
    try { localStorage.setItem('kviz:lang', code); } catch (e) { /* bez memorije */ }
    K.applyI18n();
  };

  // Jezik države (ISO 3166-1 alpha-2) za „Moja lokacija“: ako tu državu nemamo prevedenu, engleski
  const BY_COUNTRY = {
    sr: 'rs me', hr: 'hr', bs: 'ba', de: 'de at li', fr: 'fr mc',
    es: 'es mx gt hn sv ni cr pa cu do co ve ec pe bo cl ar uy py',
    ru: 'ru by'
  };
  K.langForCountry = function (cc) {
    cc = String(cc || '').toLowerCase();
    for (const l in BY_COUNTRY) if (BY_COUNTRY[l].split(' ').includes(cc)) return l;
    return 'en';
  };
  // promena jezika bez pamćenja (automatski izbor, ne ručni)
  K.useLang = function (code) {
    if (!K.LANGS[code] || code === K.lang) return false;
    K.lang = code;
    K.applyI18n();
    return true;
  };
})(globalThis.Kviz = globalThis.Kviz || {});
