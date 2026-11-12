#!/bin/sh
# Nova oznaka verzije za JS/CSS u index.html (?v=…), da pregledači posle uploada učitaju nove fajlove.
# Pokrenuti pre svakog uploada koji menja js/ ili css/:   sh tools/bump-version.sh
cd "$(dirname "$0")/.." || exit 1
V=$(date +%Y%m%d%H%M)
sed -i -E "s#(<script src=\"js/[^\"?]+\.js)(\?v=[^\"]*)?\"#\1?v=$V\"#g; s#(<link rel=\"stylesheet\" href=\"css/style\.css)(\?v=[^\"]*)?\"#\1?v=$V\"#" index.html
echo "verzija: $V"
