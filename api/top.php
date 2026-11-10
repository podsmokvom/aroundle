<?php
// GET: top 10 za opseg (hood|city|country|continent|world), za danas ili ukupno (period=all: najbolji rezultat svakog igrača)
require __DIR__ . '/db.php';
$scope = $_GET['scope'] ?? 'hood';
if (!array_key_exists($scope, SCOPES)) out(['error' => 'opseg'], 400);
$col = SCOPES[$scope];
$key = clean($_GET['key'] ?? '', 120);
$all = ($_GET['period'] ?? 'day') === 'all';
$where = []; $args = [];
if (!$all) { $where[] = 'day=?'; $args[] = date('Y-m-d'); }
if ($col) { if ($key === '') out(['error' => 'ključ'], 400); $where[] = "$col=?"; $args[] = $col === 'country' ? strtolower($key) : ($col === 'continent' ? strtoupper($key) : $key); }
$sql = 'SELECT name, hood_name, city, country, points, correct, total, secs, day FROM aroundle_scores'
     . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY points DESC, secs ASC LIMIT 10';
try { $q = db()->prepare($sql); $q->execute($args); out(['ok' => true, 'rows' => $q->fetchAll()]); }
catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
