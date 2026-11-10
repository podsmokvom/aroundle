/* Aroundle — prevodi: jezik igrača (po pregledaču, uz ručni izbor). Rečnici su u js/lang/<jezik>.js */
(function (K) {
  'use strict';
  K.I18N = K.I18N || {};
  K.LANGS = { sr: 'Srpski', hr: 'Hrvatski', bs: 'Bosanski', en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', ru: 'Русский' };

  function detect() {
    try { const s = localStorage.getItem('kviz:lang'); if (s && K.LANGS[s]) return s; } catch (e) { /* bez memorije */ }
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
    for (const l of list) {
      const c = String(l).toLowerCase();
      if (/^(sr|sh|cnr|me)\b/.test(c)) return 'sr';
      const base = c.split('-')[0];
      if (K.LANGS[base]) return base;
    }
    return 'en';
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
  K.wikiLangs = () => (K.lang === 'en' ? ['en'] : [K.lang, 'en']);
  K.wdLangs = () => ({ sr: ['sr-el', 'sr'], hr: ['hr', 'sh'], bs: ['bs', 'sh'] }[K.lang] || [K.lang]).concat(K.lang === 'en' ? [] : ['en']);
  K.acceptLang = () => ({ sr: 'sr-Latn,sr,en', hr: 'hr,sr-Latn,en', bs: 'bs,hr,sr-Latn,en' }[K.lang] || `${K.lang},en`);
  K.gbifLang = () => ({ sr: 'srp', hr: 'hrv', bs: 'bos', en: 'eng', de: 'deu', fr: 'fra', es: 'spa', ru: 'rus' }[K.lang] || 'eng');
  K.locale = () => ({ sr: 'sr-Latn-RS', hr: 'hr-HR', bs: 'bs-Latn-BA', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', ru: 'ru-RU' }[K.lang] || 'en');

  // Statični tekstovi u HTML-u: data-i18n (tekst), data-i18n-html, data-i18n-ph (placeholder), data-i18n-title, data-i18n-aria
  K.applyI18n = function (root = document) {
    document.documentElement.lang = K.lang === 'sr' ? 'sr-Latn' : K.lang;
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = K.t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = K.t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = K.t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = K.t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', K.t(el.dataset.i18nAria)); });
    document.title = K.t('page.title');
  };

  K.setLang = function (code) {
    if (!K.LANGS[code]) return;
    K.lang = code;
    try { localStorage.setItem('kviz:lang', code); } catch (e) { /* bez memorije */ }
    K.applyI18n();
  };
})(globalThis.Kviz = globalThis.Kviz || {});
