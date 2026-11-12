#!/bin/sh
# Pravi jezičke stranice /en/, /sr/, /hr/, /bs/, /de/, /fr/, /es/, /ru/ (index.html u svakom folderu) iz glavnog index.html.
# Svaka ima naslov, opis, og-oznake i <html lang> na svom jeziku, plus canonical i og:url na sebe; hreflang je zajednički.
# Telo stranice je isto (statički tekst na engleskom), a JavaScript ga prevodi po jeziku iz adrese.
# Pokrenuti posle SVAKE izmene index.html (i posle tools/bump-version.sh):   sh tools/make-lang-pages.sh
cd "$(dirname "$0")/.." || exit 1

page() { # lang  html-lang  og-locale  title  description
  L=$1; mkdir -p "$L"
  sed -e "s|<html lang=\"en\">|<html lang=\"$2\">|" \
      -e "s|<title>[^<]*</title>|<title>$4</title>|" \
      -e "s|<meta name=\"description\" content=\"[^\"]*\">|<meta name=\"description\" content=\"$5\">|" \
      -e "s|<meta property=\"og:title\" content=\"[^\"]*\">|<meta property=\"og:title\" content=\"$4\">|" \
      -e "s|<meta property=\"og:description\" content=\"[^\"]*\">|<meta property=\"og:description\" content=\"$5\">|" \
      -e "s|<meta property=\"og:locale\" content=\"[^\"]*\">|<meta property=\"og:locale\" content=\"$3\">|" \
      -e "s|<!--LANG-PAGE-->|<link rel=\"canonical\" href=\"https://aroundle.com/$L/\">\n  <meta property=\"og:url\" content=\"https://aroundle.com/$L/\">|" \
      index.html > "$L/index.html"
  echo "$L/index.html"
}

page en en en_US "Aroundle — How well do you know your neighbourhood? Daily local quiz" \
  "A free daily quiz about any neighbourhood: 10 questions from open data about the streets, shops, schools, transit, history and nature around you. Dare your neighbour!"
page sr sr-Latn sr_RS "Aroundle — Koliko poznaješ svoj kraj? Dnevni kviz o kraju" \
  "Besplatan dnevni kviz o bilo kom kraju: 10 pitanja iz otvorenih podataka o ulicama, radnjama, školama, prevozu, istoriji i prirodi oko tebe. Izazovi komšiju!"
page hr hr hr_HR "Aroundle — Koliko poznaješ svoj kvart? Dnevni kviz o kvartu" \
  "Besplatan dnevni kviz o bilo kojem kvartu: 10 pitanja iz otvorenih podataka o ulicama, trgovinama, školama, prijevozu, povijesti i prirodi oko tebe. Izazovi susjeda!"
page bs bs bs_BA "Aroundle — Koliko poznaješ svoje naselje? Dnevni kviz o naselju" \
  "Besplatan dnevni kviz o bilo kojem naselju: 10 pitanja iz otvorenih podataka o ulicama, radnjama, školama, prevozu, historiji i prirodi oko tebe. Izazovi komšiju!"
page de de de_DE "Aroundle — Wie gut kennst du deinen Kiez? Tägliches Viertel-Quiz" \
  "Kostenloses tägliches Quiz zu jedem Viertel: 10 Fragen aus offenen Daten zu Straßen, Geschäften, Schulen, Nahverkehr, Geschichte und Natur um dich herum. Fordere deine Nachbarn heraus!"
page fr fr fr_FR "Aroundle — Connais-tu bien ton quartier ? Le quiz quotidien du quartier" \
  "Un quiz quotidien gratuit sur n’importe quel quartier : 10 questions issues de données ouvertes sur les rues, commerces, écoles, transports, l’histoire et la nature autour de toi. Défie tes voisins !"
page es es es_ES "Aroundle — ¿Cuánto conoces tu barrio? Quiz diario de barrio" \
  "Un quiz diario gratuito sobre cualquier barrio: 10 preguntas con datos abiertos sobre calles, tiendas, escuelas, transporte, historia y naturaleza a tu alrededor. ¡Reta a tus vecinos!"
page ru ru ru_RU "Aroundle — Насколько хорошо ты знаешь свой район? Ежедневный квиз" \
  "Бесплатный ежедневный квиз о любом районе: 10 вопросов из открытых данных об улицах, магазинах, школах, транспорте, истории и природе вокруг тебя. Брось вызов соседям!"
