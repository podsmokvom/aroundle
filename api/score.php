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
// osnovna provera da rezultat ima smisla (10 pitanja × najviše 1000 poena, ne brže od 2 s po pitanju)
if ($hood === '' || $total < 1 || $total > 12 || $correct < 0 || $correct > $total
    || $points < 0 || $points > $total * 1000 || $secs < $total * 2 || $secs > 3600) out(['error' => 'neispravan rezultat'], 400);

$row = [
  $day, $hood, clean($in['hood_name'] ?? '', 80), clean($in['city'] ?? '', 80),
  strtolower(substr(preg_replace('/[^a-z]/i', '', $in['country'] ?? ''), 0, 2)),
  strtoupper(substr(preg_replace('/[^a-z]/i', '', $in['continent'] ?? ''), 0, 2)),
  $name, $points, $correct, $total, $secs,
  hash('sha256', SALT . ($_SERVER['REMOTE_ADDR'] ?? '') . $day)
];
try {
  $st = db()->prepare('INSERT IGNORE INTO kmh_scores (day,hood,hood_name,city,country,continent,name,points,correct,total,secs,iphash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  $st->execute($row);
  if ($st->rowCount() === 0) out(['ok' => false, 'error' => 'Za ovaj kraj danas već postoji rezultat sa ove mreže.'], 409);
  // mesto u svakoj rang-listi (danas)
  $rank = [];
  foreach (SCOPES as $scope => $col) {
    $sql = 'SELECT COUNT(*)+1 AS r FROM kmh_scores WHERE day=? AND points>?';
    $args = [$day, $points];
    if ($col) { $sql .= " AND $col=?"; $args[] = $col === 'hood' ? $row[1] : ($col === 'city' ? $row[3] : ($col === 'country' ? $row[4] : $row[5])); }
    $q = db()->prepare($sql); $q->execute($args);
    $rank[$scope] = (int)$q->fetch()['r'];
  }
  out(['ok' => true, 'rank' => $rank]);
} catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
