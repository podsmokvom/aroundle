<?php
// POST: upis rezultata (jedan po kraju dnevno po IP adresi). Vraća mesto u svakoj rang-listi.
require __DIR__ . '/db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST'], 405);
$in = json_decode(file_get_contents('php://input'), true) ?: [];

$day = date('Y-m-d');
$hood = clean($in['hood'] ?? '', 120);
$name = clean($in['name'] ?? '', 24) ?: 'Komšija';
$points = (int)($in['points'] ?? -1);
$correct = (int)($in['correct'] ?? -1);
$total = (int)($in['total'] ?? 0);
$secs = (int)($in['secs'] ?? 0);
$lat = round((float)($in['lat'] ?? 999), 3);   // već pomerena tačka; čuva se samo na ~100 m
$lon = round((float)($in['lon'] ?? 999), 3);
// osnovna provera da rezultat ima smisla (10 pitanja × najviše 1000 poena, ne brže od 2 s po pitanju)
if ($hood === '' || $total < 1 || $total > 12 || $correct < 0 || $correct > $total
    || $points < 0 || $points > $total * 1000 || $secs < $total * 2 || $secs > 3600
    || abs($lat) > 90 || abs($lon) > 180) out(['error' => 'neispravan rezultat'], 400);

$city = clean($in['city'] ?? '', 80);
$country = strtolower(substr(preg_replace('/[^a-z]/i', '', $in['country'] ?? ''), 0, 2));
$continent = strtoupper(substr(preg_replace('/[^a-z]/i', '', $in['continent'] ?? ''), 0, 2));
try {
  $st = db()->prepare('INSERT IGNORE INTO aroundle_scores (day,hood,hood_name,lat,lon,city,country,continent,name,points,correct,total,secs,iphash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  $st->execute([$day, $hood, clean($in['hood_name'] ?? '', 80), $lat, $lon, $city, $country, $continent,
    $name, $points, $correct, $total, $secs, hash('sha256', SALT . ($_SERVER['REMOTE_ADDR'] ?? '') . $day)]);
  if ($st->rowCount() === 0) out(['ok' => false, 'error' => 'Za ovaj kraj danas već postoji rezultat sa ove mreže.'], 409);

  // mesto u svakoj rang-listi (danas)
  $rank = [];
  foreach (SCOPES as $scope => $col) {
    $args = [$day, $points];
    $sql = 'SELECT COUNT(*)+1 AS r FROM aroundle_scores WHERE day=? AND points>?';
    if ($scope === 'near') $sql .= ' AND ' . nearSql($lat, $lon, $args);
    elseif ($col) { $sql .= " AND $col=?"; $args[] = ['city' => $city, 'country' => $country, 'continent' => $continent][$col]; }
    $q = db()->prepare($sql); $q->execute($args);
    $rank[$scope] = (int)$q->fetch()['r'];
  }
  out(['ok' => true, 'rank' => $rank]);
} catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
