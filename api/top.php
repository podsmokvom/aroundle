<?php
// GET: top 10 za opseg near (1,5 km oko lat/lon) | city | country | continent | world,
// za danas (period=day), poslednja 24 sata (period=24h) ili ukupno (period=all)
require __DIR__ . '/db.php';
$scope = $_GET['scope'] ?? 'near';
if (!array_key_exists($scope, SCOPES)) out(['error' => 'opseg'], 400);
$col = SCOPES[$scope];
$key = clean($_GET['key'] ?? '', 120);
$period = $_GET['period'] ?? 'day';
$all = $period === 'all';
$where = []; $args = [];
if ($period === '24h') $where[] = 'created >= NOW() - INTERVAL 24 HOUR'; // ne prazni se u ponoć
elseif (!$all) { $where[] = 'day=?'; $args[] = date('Y-m-d'); }
if ($scope === 'near') {
  $lat = (float)($_GET['lat'] ?? 999); $lon = (float)($_GET['lon'] ?? 999);
  if (abs($lat) > 90 || abs($lon) > 180) out(['error' => 'tačka'], 400);
  $where[] = nearSql(round($lat, 3), round($lon, 3), $args);
} elseif ($col) {
  if ($key === '') out(['error' => 'ključ'], 400);
  $where[] = "$col=?";
  $args[] = $col === 'country' ? strtolower($key) : ($col === 'continent' ? strtoupper($key) : $key);
}
$sql = 'SELECT name, hood_name, city, country, points, correct, total, secs, day FROM aroundle_scores'
     . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY points DESC, secs ASC LIMIT 10';
try { $q = db()->prepare($sql); $q->execute($args); out(['ok' => true, 'rows' => $q->fetchAll()]); }
catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
