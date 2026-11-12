<?php
// Anonimno beleženje odgovora za analitiku poznavanja krajeva (korak 1; pregled dolazi kasnije).
// POST na kraju kviza: { quiz, hood, city, country, lang, lat, lon, duel, answers: [ {cat, kind, theme, theme2, kd, skills, level, ok, secs, dist} ] }
// Beleži se SAMO sadržaj: tema/KD/vrsta znanja pitanja, tačno/netačno, vreme, kraj, ćelija ~1 km (0,01°), zemlja, jezik igre.
// NE beleži se: ime, IP, uređaj, tačna tačka. Jedan upis po kraju, danu i mreži (dnevni heš IP-a sa solju, posebna tabela,
// ne može se povezati sa odgovorima ni preko dana). Tabele se prave same.
require __DIR__ . '/db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST'], 405);
$raw = file_get_contents('php://input', false, null, 0, 20001);
if ($raw === false || strlen($raw) > 20000) out(['error' => 'prevelik zahtev'], 413);
$in = json_decode($raw, true);
if (!is_array($in) || !isset($in['answers']) || !is_array($in['answers'])) out(['error' => 'neispravno'], 400);
$ans = array_slice($in['answers'], 0, 12);
if (count($ans) < 1) out(['error' => 'prazno'], 400);

$word = function ($s, $max) { return substr(preg_replace('/[^a-z0-9_.]/i', '', (string)$s), 0, $max); };
$quiz = $word($in['quiz'] ?? '', 16);
$hood = clean($in['hood'] ?? '', 120);
if ($hood === '' || strlen($quiz) < 8) out(['error' => 'neispravno'], 400);
$city = clean($in['city'] ?? '', 80);
$country = strtolower(substr(preg_replace('/[^a-z]/i', '', $in['country'] ?? ''), 0, 2));
$lang = strtolower(substr(preg_replace('/[^a-z]/i', '', $in['lang'] ?? ''), 0, 2));
$lat = (float)($in['lat'] ?? 999); $lon = (float)($in['lon'] ?? 999);
if (abs($lat) > 90 || abs($lon) > 180) out(['error' => 'tačka'], 400);
$clat = round($lat, 2); $clon = round($lon, 2); // ćelija ~1 km, ne tačka igrača
$duel = !empty($in['duel']) ? 1 : 0;
$day = date('Y-m-d');

try {
  db()->exec("CREATE TABLE IF NOT EXISTS aroundle_answers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    day DATE NOT NULL, quiz CHAR(16) NOT NULL, qn TINYINT UNSIGNED NOT NULL,
    hood VARCHAR(120) NOT NULL, city VARCHAR(80) NOT NULL DEFAULT '', country CHAR(2) NOT NULL DEFAULT '', lang CHAR(2) NOT NULL DEFAULT '',
    cell_lat DECIMAL(5,2) NOT NULL, cell_lon DECIMAL(6,2) NOT NULL, duel TINYINT UNSIGNED NOT NULL DEFAULT 0,
    level VARCHAR(8) NOT NULL DEFAULT '', cat VARCHAR(16) NOT NULL, kind VARCHAR(24) NOT NULL DEFAULT '',
    theme VARCHAR(24) NOT NULL, theme2 VARCHAR(24) NOT NULL DEFAULT '', kd VARCHAR(8) NOT NULL DEFAULT '', skills VARCHAR(80) NOT NULL DEFAULT '',
    ok TINYINT UNSIGNED NOT NULL, secs SMALLINT UNSIGNED NOT NULL DEFAULT 0, dist INT UNSIGNED NULL,
    KEY k_day (day), KEY k_cell (cell_lat, cell_lon), KEY k_theme (theme, day), KEY k_kd (kd), KEY k_hood (hood, day), KEY k_country (country, day)
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  db()->exec("CREATE TABLE IF NOT EXISTS aroundle_answers_seen (
    day DATE NOT NULL, hood VARCHAR(120) NOT NULL, iphash CHAR(64) NOT NULL, PRIMARY KEY (day, hood, iphash)
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  // jedan kviz po kraju, danu i mreži (kao i sama igra); stari zapisi o „viđenom“ se brišu posle 2 dana
  $seen = db()->prepare('INSERT IGNORE INTO aroundle_answers_seen (day, hood, iphash) VALUES (?,?,?)');
  $seen->execute([$day, $hood, hash('sha256', SALT . 'ans' . ($_SERVER['REMOTE_ADDR'] ?? '') . $day)]);
  if ($seen->rowCount() === 0) out(['ok' => true, 'skipped' => true]);
  if (random_int(1, 50) === 1) db()->exec("DELETE FROM aroundle_answers_seen WHERE day < CURDATE() - INTERVAL 2 DAY");

  $THEMES = ['ulice_toponimija', 'kultura_nasledje', 'javne_ustanove', 'komercijala_zanatstvo', 'saobracaj', 'priroda_teren', 'prostorna_orijentacija'];
  $st = db()->prepare('INSERT INTO aroundle_answers (day, quiz, qn, hood, city, country, lang, cell_lat, cell_lon, duel, level, cat, kind, theme, theme2, kd, skills, ok, secs, dist)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  $n = 0;
  foreach ($ans as $i => $a) {
    if (!is_array($a)) continue;
    $theme = in_array($a['theme'] ?? '', $THEMES, true) ? $a['theme'] : '';
    $cat = $word($a['cat'] ?? '', 16);
    if ($theme === '' || $cat === '') continue;
    $theme2 = in_array($a['theme2'] ?? '', $THEMES, true) ? $a['theme2'] : '';
    $kd = preg_match('/^[A-U](\d{2}(\.\d{1,2})?)?$/', (string)($a['kd'] ?? '')) ? $a['kd'] : '';
    $skills = implode(',', array_slice(array_filter(array_map(function ($s) use ($word) { return $word($s, 24); }, (array)($a['skills'] ?? []))), 0, 4));
    $dist = isset($a['dist']) && is_numeric($a['dist']) ? max(0, min(100000, (int)round($a['dist']))) : null;
    $st->execute([$day, $quiz, $i + 1, $hood, $city, $country, $lang, $clat, $clon, $duel, $word($a['level'] ?? '', 8), $cat,
      $word($a['kind'] ?? '', 24), $theme, $theme2, $kd, substr($skills, 0, 80), !empty($a['ok']) ? 1 : 0,
      max(0, min(3600, (int)round((float)($a['secs'] ?? 0)))), $dist]);
    $n++;
  }
  out(['ok' => true, 'saved' => $n]);
} catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
