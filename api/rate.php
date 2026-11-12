<?php
// Ocena kraja 1–10 posle kviza (anonimno). POST { hood, hood_name, city, country, lang, rating, mine }
// mine = 1 kad je igrano na „Mojoj lokaciji“ (igrač je tu), 0 = drugi kraj. (Klijent ga šalje — za odbranu se na njega ne oslanjamo.)
// Beleži se: kraj, ime kraja za prikaz, grad, zemlja, jezik, ocena, mine, datum. Bez koordinata, imena i sirovog IP-a.
//
// Zaštita od lažnih desetki (pravila Duce, 2026-11-12) — sve konstante ovde:
//  1) JEDNA OCENA PO IGRAČU PO KRAJU (ne po danu): heš IP-a sa SALT-om, pamti se RATE_VOTER_DAYS dana. Ponovna ocena istog
//     kraja sa iste mreže ZAMENJUJE staru (promena mišljenja je u redu), ne dodaje novi red.
//  2) NALETI: više desetki za isti kraj sa iste mreže (/24 za IPv4, /48 za IPv6; samo heš) u RATE_BURST_MIN minuta → računa se
//     samo prva, ostale se preskaču.
// Tabele se prave same (korisnik baze sme CREATE, ne i ALTER): aroundle_ratings (postojeća), aroundle_ratings_voter, aroundle_ratings_net.
require __DIR__ . '/db.php';
const RATE_VOTER_DAYS = 90;   // koliko dugo važi „jedan igrač = jedna ocena po kraju“
const RATE_BURST_MIN = 30;    // prozor za nalete desetki sa iste mreže

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST'], 405);
$in = json_decode(file_get_contents('php://input', false, null, 0, 4001), true);
if (!is_array($in)) out(['error' => 'neispravno'], 400);
$hood = clean($in['hood'] ?? '', 120);
$rating = (int)($in['rating'] ?? 0);
if ($hood === '' || $rating < 1 || $rating > 10) out(['error' => 'neispravno'], 400);
$day = date('Y-m-d');
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
// mreža: IPv4 prva tri bajta (/24), IPv6 prve tri grupe (/48) — čuva se samo heš
$net = strpos($ip, ':') !== false ? implode(':', array_slice(explode(':', $ip), 0, 3)) : implode('.', array_slice(explode('.', $ip), 0, 3));
$voter = hash('sha256', SALT . 'rate-voter|' . $ip);
$nethash = hash('sha256', SALT . 'rate-net|' . $net);

try {
  db()->exec("CREATE TABLE IF NOT EXISTS aroundle_ratings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, day DATE NOT NULL,
    hood VARCHAR(120) NOT NULL, hood_name VARCHAR(80) NOT NULL DEFAULT '', city VARCHAR(80) NOT NULL DEFAULT '',
    country CHAR(2) NOT NULL DEFAULT '', lang CHAR(2) NOT NULL DEFAULT '',
    rating TINYINT UNSIGNED NOT NULL, mine TINYINT UNSIGNED NOT NULL DEFAULT 0,
    KEY k_hood (hood, mine), KEY k_day (day), KEY k_country (country, day)
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  // ko je već ocenio koji kraj (heš, ne IP) → id reda sa ocenom, da se ocena može zameniti
  db()->exec("CREATE TABLE IF NOT EXISTS aroundle_ratings_voter (
    hood VARCHAR(120) NOT NULL, voter CHAR(64) NOT NULL, rating_id INT UNSIGNED NOT NULL,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (hood, voter), KEY k_created (created)
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  // nedavne ocene po mreži (heš /24 ili /48), samo za otkrivanje naleta; briše se posle jednog dana
  db()->exec("CREATE TABLE IF NOT EXISTS aroundle_ratings_net (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, hood VARCHAR(120) NOT NULL, nethash CHAR(64) NOT NULL, rating TINYINT UNSIGNED NOT NULL,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY k_hn (hood, nethash, created)
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  if (random_int(1, 50) === 1) {
    db()->exec('DELETE FROM aroundle_ratings_voter WHERE created < NOW() - INTERVAL ' . RATE_VOTER_DAYS . ' DAY');
    db()->exec('DELETE FROM aroundle_ratings_net WHERE created < NOW() - INTERVAL 1 DAY');
  }

  // 2) nalet desetki sa iste mreže za isti kraj → samo prva se računa
  if ($rating === 10) {
    $q = db()->prepare('SELECT COUNT(*) FROM aroundle_ratings_net WHERE hood=? AND nethash=? AND rating=10 AND created > NOW() - INTERVAL ' . RATE_BURST_MIN . ' MINUTE');
    $q->execute([$hood, $nethash]);
    if ((int)$q->fetchColumn() > 0) out(['ok' => true, 'skipped' => 'burst']);
  }

  $country = strtolower(substr(preg_replace('/[^a-z]/i', '', $in['country'] ?? ''), 0, 2));
  $lang = strtolower(substr(preg_replace('/[^a-z]/i', '', $in['lang'] ?? ''), 0, 2));
  $mine = !empty($in['mine']) ? 1 : 0;

  // 1) jedan igrač = jedna ocena po kraju: postoji → zameni staru ocenu
  $q = db()->prepare('SELECT rating_id FROM aroundle_ratings_voter WHERE hood=? AND voter=?');
  $q->execute([$hood, $voter]);
  $old = $q->fetchColumn();
  if ($old) {
    db()->prepare('UPDATE aroundle_ratings SET rating=?, mine=?, lang=? WHERE id=?')->execute([$rating, $mine, $lang, (int)$old]);
    db()->prepare('UPDATE aroundle_ratings_voter SET created=CURRENT_TIMESTAMP WHERE hood=? AND voter=?')->execute([$hood, $voter]);
    $res = ['ok' => true, 'replaced' => true];
  } else {
    db()->prepare('INSERT INTO aroundle_ratings (day, hood, hood_name, city, country, lang, rating, mine) VALUES (?,?,?,?,?,?,?,?)')
      ->execute([$day, $hood, clean($in['hood_name'] ?? '', 80), clean($in['city'] ?? '', 80), $country, $lang, $rating, $mine]);
    $id = (int)db()->lastInsertId();
    db()->prepare('INSERT IGNORE INTO aroundle_ratings_voter (hood, voter, rating_id) VALUES (?,?,?)')->execute([$hood, $voter, $id]);
    $res = ['ok' => true];
  }
  db()->prepare('INSERT INTO aroundle_ratings_net (hood, nethash, rating) VALUES (?,?,?)')->execute([$hood, $nethash, $rating]);
  out($res);
} catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
