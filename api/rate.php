<?php
// Ocena kraja 1–10 posle kviza (anonimno). POST { hood, hood_name, city, country, lang, rating, mine }
// mine = 1 kad je igrano na „Mojoj lokaciji“ (igrač je tu: živi ili prolazi), 0 = drugi kraj (pretraga, mapa, izazov).
// Beleži se: kraj, ime kraja za prikaz, grad, zemlja, jezik, ocena, mine, datum. Bez koordinata, imena i IP-a.
// Jedna ocena po kraju, danu i mreži (dnevni heš IP-a sa solju u odvojenoj tabeli, briše se posle 2 dana). Tabele se prave same.
require __DIR__ . '/db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST'], 405);
$in = json_decode(file_get_contents('php://input', false, null, 0, 4001), true);
if (!is_array($in)) out(['error' => 'neispravno'], 400);
$hood = clean($in['hood'] ?? '', 120);
$rating = (int)($in['rating'] ?? 0);
if ($hood === '' || $rating < 1 || $rating > 10) out(['error' => 'neispravno'], 400);
$day = date('Y-m-d');
try {
  db()->exec("CREATE TABLE IF NOT EXISTS aroundle_ratings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, day DATE NOT NULL,
    hood VARCHAR(120) NOT NULL, hood_name VARCHAR(80) NOT NULL DEFAULT '', city VARCHAR(80) NOT NULL DEFAULT '',
    country CHAR(2) NOT NULL DEFAULT '', lang CHAR(2) NOT NULL DEFAULT '',
    rating TINYINT UNSIGNED NOT NULL, mine TINYINT UNSIGNED NOT NULL DEFAULT 0,
    KEY k_hood (hood, mine), KEY k_day (day), KEY k_country (country, day)
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  db()->exec("CREATE TABLE IF NOT EXISTS aroundle_ratings_seen (
    day DATE NOT NULL, hood VARCHAR(120) NOT NULL, iphash CHAR(64) NOT NULL, PRIMARY KEY (day, hood, iphash)
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  $seen = db()->prepare('INSERT IGNORE INTO aroundle_ratings_seen (day, hood, iphash) VALUES (?,?,?)');
  $seen->execute([$day, $hood, hash('sha256', SALT . 'rate' . ($_SERVER['REMOTE_ADDR'] ?? '') . $day)]);
  if ($seen->rowCount() === 0) out(['ok' => true, 'skipped' => true]);
  if (random_int(1, 50) === 1) db()->exec("DELETE FROM aroundle_ratings_seen WHERE day < CURDATE() - INTERVAL 2 DAY");
  db()->prepare('INSERT INTO aroundle_ratings (day, hood, hood_name, city, country, lang, rating, mine) VALUES (?,?,?,?,?,?,?,?)')
    ->execute([$day, $hood, clean($in['hood_name'] ?? '', 80), clean($in['city'] ?? '', 80),
      strtolower(substr(preg_replace('/[^a-z]/i', '', $in['country'] ?? ''), 0, 2)),
      strtolower(substr(preg_replace('/[^a-z]/i', '', $in['lang'] ?? ''), 0, 2)), $rating, !empty($in['mine']) ? 1 : 0]);
  out(['ok' => true]);
} catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
