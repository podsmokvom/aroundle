/* Aroundle — prevodi za pitanje „strana sveta“ (pravac od tvoje tačke) */
(function (K) {
  'use strict';
  const C = (sr, hr, bs, en, de, fr, es, ru) => ({ sr, hr, bs, en, de, fr, es, ru });
  const T = {
    'q.dir': C('U kom pravcu od tvoje tačke je „{name}“?', 'U kojem je smjeru od tvoje točke „{name}“?', 'U kojem je pravcu od tvoje tačke „{name}“?',
      'In which direction from your spot is “{name}”?', 'In welcher Richtung von deinem Punkt liegt „{name}“?', 'Dans quelle direction se trouve « {name} » par rapport à ton point ?',
      '¿En qué dirección está «{name}» desde tu punto?', 'В какой стороне от твоей точки находится «{name}»?'),
    'q.dir.explain': C('„{name}“: pravac {dir}, oko {d} vazdušnom linijom od tvoje tačke.', '„{name}“: smjer {dir}, oko {d} zračnom linijom od tvoje točke.', '„{name}“: pravac {dir}, oko {d} zračnom linijom od tvoje tačke.',
      '“{name}”: direction {dir}, about {d} from your spot as the crow flies.', '„{name}“: Richtung {dir}, etwa {d} Luftlinie von deinem Punkt.', '« {name} » : direction {dir}, à environ {d} de ton point à vol d’oiseau.',
      '«{name}»: dirección {dir}, a unos {d} de tu punto en línea recta.', '«{name}»: направление — {dir}, примерно {d} по прямой от твоей точки.'),
    'dir.N': C('sever', 'sjever', 'sjever', 'north', 'Norden', 'nord', 'norte', 'север'),
    'dir.NE': C('severoistok', 'sjeveroistok', 'sjeveroistok', 'northeast', 'Nordosten', 'nord-est', 'noreste', 'северо-восток'),
    'dir.E': C('istok', 'istok', 'istok', 'east', 'Osten', 'est', 'este', 'восток'),
    'dir.SE': C('jugoistok', 'jugoistok', 'jugoistok', 'southeast', 'Südosten', 'sud-est', 'sureste', 'юго-восток'),
    'dir.S': C('jug', 'jug', 'jug', 'south', 'Süden', 'sud', 'sur', 'юг'),
    'dir.SW': C('jugozapad', 'jugozapad', 'jugozapad', 'southwest', 'Südwesten', 'sud-ouest', 'suroeste', 'юго-запад'),
    'dir.W': C('zapad', 'zapad', 'zapad', 'west', 'Westen', 'ouest', 'oeste', 'запад'),
    'dir.NW': C('severozapad', 'sjeverozapad', 'sjeverozapad', 'northwest', 'Nordwesten', 'nord-ouest', 'noroeste', 'северо-запад'),

  };
  for (const key in T) for (const lang in T[key]) {
    K.I18N[lang] = K.I18N[lang] || {};
    K.I18N[lang][key] = T[key][lang];
  }
})(globalThis.Kviz = globalThis.Kviz || {});
