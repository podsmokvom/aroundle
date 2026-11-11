<?php
// Kratki linkovi za izazov (#d=<id>): umesto celog kviza u linku, kviz se čuva ovde pod nasumičnim id-om.
// POST (JSON kao K.duelPayload) -> {ok, id}; GET ?id=xxxxxxxx -> payload ili 404.
// Tabela aroundle_duels se pravi sama (vidi i schema.sql). IP se ne čuva, samo heš sa solju (za ograničenje broja upisa).
require __DIR__ . '/db.php';
const DUEL_MAX_BYTES = 30000;   // ~30 KB; običan kviz od 10 pitanja je 3–8 KB
const DUEL_PER_HOUR = 30;       // najviše upisa po mreži na sat

// tabela se pravi sama pri prvom izazovu (isto kao u schema.sql), da ne treba ručno pokretati SQL
function duel_table() {
  db()->exec("CREATE TABLE IF NOT EXISTS aroundle_duels (
    id CHAR(8) NOT NULL PRIMARY KEY, payload MEDIUMTEXT NOT NULL, iphash CHAR(64) NOT NULL,
    created DATETIME NOT NULL, KEY k_ip (iphash, created)
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function duel_id() {
  $abc = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  $s = '';
  for ($i = 0; $i < 8; $i++) $s .= $abc[random_int(0, 61)];
  return $s;
}

try {
  if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input', false, null, 0, DUEL_MAX_BYTES + 1);
    if ($raw === false || strlen($raw) > DUEL_MAX_BYTES) out(['error' => 'prevelik izazov'], 413);
    $d = json_decode($raw, true);
    if (!is_array($d) || !in_array($d['v'] ?? 0, [1, 2], true) || !isset($d['q']) || !is_array($d['q'])
        || count($d['q']) < 1 || count($d['q']) > 12 || !isset($d['p']) || !is_array($d['p'])) out(['error' => 'neispravan izazov'], 400);
    duel_table();
    $ip = hash('sha256', SALT . 'duel' . ($_SERVER['REMOTE_ADDR'] ?? ''));
    $q = db()->prepare('SELECT COUNT(*) FROM aroundle_duels WHERE iphash=? AND created > NOW() - INTERVAL 1 HOUR');
    $q->execute([$ip]);
    if ((int)$q->fetchColumn() >= DUEL_PER_HOUR) out(['error' => 'previše izazova, probaj kasnije'], 429);
    $json = json_encode($d, JSON_UNESCAPED_UNICODE);
    $st = db()->prepare('INSERT IGNORE INTO aroundle_duels (id, payload, iphash, created) VALUES (?,?,?,NOW())');
    for ($try = 0; $try < 5; $try++) {          // sudar id-a je praktično nemoguć, ali za svaki slučaj
      $id = duel_id();
      $st->execute([$id, $json, $ip]);
      if ($st->rowCount() === 1) out(['ok' => true, 'id' => $id]);
    }
    out(['error' => 'pokušaj ponovo'], 500);
  }
  $id = (string)($_GET['id'] ?? '');
  if (!preg_match('/^[0-9A-Za-z]{8}$/', $id)) out(['error' => 'id'], 400);
  $q = db()->prepare('SELECT payload FROM aroundle_duels WHERE id=?');
  $q->execute([$id]);
  $p = $q->fetchColumn();
  if ($p === false) out(['error' => 'izazov ne postoji'], 404);
  header('Cache-Control: public, max-age=86400'); // izazov se ne menja
  echo '{"ok":true,"payload":' . $p . '}';
} catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
