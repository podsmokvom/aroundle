<?php
// GET: krajevi koje ljudi najbolje poznaju — prosek tačnih odgovora po kraju (kraj|grad),
// samo krajevi sa dovoljno igrača, da jedan srećan igrač ne bi bio „najbolji kraj na svetu“.
// period=day (danas, bar 3 igrača) | week (7 dana, bar 5) | all (bar 10); opciono scope=city|country|continent + key
require __DIR__ . '/db.php';
$period = $_GET['period'] ?? 'all';
$MIN = ['day' => 3, 'week' => 5, 'all' => 10];
if (!isset($MIN[$period])) out(['error' => 'period'], 400);
$where = []; $args = [];
if ($period === 'day') { $where[] = 'day=?'; $args[] = date('Y-m-d'); }
if ($period === 'week') { $where[] = 'day>=?'; $args[] = date('Y-m-d', strtotime('-6 days')); }
$scope = $_GET['scope'] ?? 'world';
if ($scope === 'city') {
  $key = clean($_GET['key'] ?? '', 80);
  if ($key === '') out(['error' => 'ključ'], 400);
  $where[] = 'city=?'; $args[] = $key;
} elseif ($scope === 'country' || $scope === 'continent') {
  $key = preg_replace('/[^a-z]/i', '', $_GET['key'] ?? '');
  if (strlen($key) !== 2) out(['error' => 'ključ'], 400);
  $where[] = "$scope=?"; $args[] = $scope === 'country' ? strtolower($key) : strtoupper($key);
}
$sql = 'SELECT hood, MIN(hood_name) AS hood_name, MIN(city) AS city, MIN(country) AS country, COUNT(*) AS players,'
     . ' ROUND(100*SUM(correct)/SUM(total)) AS pct, ROUND(AVG(points)) AS avg_points'
     . ' FROM aroundle_scores' . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
     . ' GROUP BY hood HAVING players >= ' . (int)$MIN[$period]
     . ' ORDER BY SUM(correct)/SUM(total) DESC, avg_points DESC, players DESC LIMIT 10';
try { $q = db()->prepare($sql); $q->execute($args); out(['ok' => true, 'min' => $MIN[$period], 'rows' => $q->fetchAll()]); }
catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
