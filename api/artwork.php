<?php
// Vrsta umetničkih dela iz OSM-a (grafit ili spomenik/skulptura) — pločice nemaju artwork_type.
// POST { refs: ["node/13930957533", "way/123", ...] } (najviše 200) → { ok, types: { "node/1393…": "graffiti" | "monument" } }
// Svaki objekat se pita OSM API-ju samo JEDNOM i pamti u bazi (aroundle_artwork), pa OSM dobija vrlo malo upita
// (pravila korišćenja OSM API-ja: samo manje čitanje, sa jasnim User-Agent-om). Tabela se pravi sama.
require __DIR__ . '/db.php';
const ART_MAX = 200;
const ART_UA = 'Aroundle/1.0 (+https://aroundle.com; daily neighbourhood quiz)';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST'], 405);
$in = json_decode(file_get_contents('php://input', false, null, 0, 20001), true);
$refs = array_values(array_unique(array_filter(array_slice((array)($in['refs'] ?? []), 0, ART_MAX), function ($r) {
  return is_string($r) && preg_match('/^(node|way|relation)\/\d{1,15}$/', $r);
})));
if (!$refs) out(['ok' => true, 'types' => new stdClass()]);

function art_kind($tags) {
  $t = strtolower((string)($tags['artwork_type'] ?? ''));
  if (preg_match('/^(graffiti|graffito|street_art|streetart|mural|urban_art)$/', $t) || ($tags['graffiti'] ?? '') === 'yes') return 'graffiti';
  return 'monument';
}
function osm_get($url) {
  $ctx = stream_context_create(['http' => ['timeout' => 4, 'header' => "User-Agent: " . ART_UA . "\r\nAccept: application/json\r\n", 'ignore_errors' => true]]);
  $s = @file_get_contents($url, false, $ctx);
  return $s ? json_decode($s, true) : null;
}

try {
  db()->exec("CREATE TABLE IF NOT EXISTS aroundle_artwork (
    ref VARCHAR(32) NOT NULL PRIMARY KEY, kind VARCHAR(12) NOT NULL, fetched TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) DEFAULT CHARSET=ascii");
  $types = [];
  $q = db()->prepare('SELECT ref, kind FROM aroundle_artwork WHERE ref IN (' . implode(',', array_fill(0, count($refs), '?')) . ')');
  $q->execute($refs);
  foreach ($q->fetchAll() as $row) $types[$row['ref']] = $row['kind'];
  $missing = array_values(array_filter($refs, function ($r) use ($types) { return !isset($types[$r]); }));
  if ($missing) {
    $by = ['node' => [], 'way' => [], 'relation' => []];
    foreach ($missing as $r) { [$t, $id] = explode('/', $r); $by[$t][] = $id; }
    $ins = db()->prepare('INSERT IGNORE INTO aroundle_artwork (ref, kind) VALUES (?, ?)');
    foreach ($by as $t => $ids) {
      foreach (array_chunk($ids, 100) as $chunk) {
        $j = osm_get("https://api.openstreetmap.org/api/0.6/{$t}s.json?{$t}s=" . implode(',', $chunk));
        if (!$j || !isset($j['elements'])) continue;          // OSM ne odgovara: ne pamtimo, klijent izostavlja ta dela
        foreach ($j['elements'] as $e) {
          $ref = $e['type'] . '/' . $e['id'];
          $kind = art_kind($e['tags'] ?? []);
          $types[$ref] = $kind;
          $ins->execute([$ref, $kind]);
        }
      }
    }
  }
  out(['ok' => true, 'types' => (object)$types]);
} catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
