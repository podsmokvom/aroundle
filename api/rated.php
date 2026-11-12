<?php
// GET: najbolje ocenjeni krajevi — prosek ocena lokacije (1–10) iz aroundle_ratings.
// scope=near (krajevi do 1,5 km od lat/lon) | city | country | continent | world (+ key), period=day | 24h | all.
// Prag: kraj ulazi na listu tek sa dovoljno ocena (day/24h: 3, all: 5), da jedna desetka ne bude „najbolji kraj“.
// Ocene nemaju koordinate; za „near“ položaj kraja je prosek ćelija ~1 km iz anonimne analitike (aroundle_answers).
require __DIR__ . '/db.php';
$period = $_GET['period'] ?? 'day';
$MIN = ['day' => 3, '24h' => 3, 'all' => 5];
if (!isset($MIN[$period])) out(['error' => 'period'], 400);
$scope = $_GET['scope'] ?? 'world';
$where = []; $args = [];
if ($period === 'day') { $where[] = 'r.day=?'; $args[] = date('Y-m-d'); }
if ($period === '24h') $where[] = 'r.created >= NOW() - INTERVAL 24 HOUR';

$CONT = [
  'EU' => 'rs hr ba me mk si al bg ro gr hu at de ch it fr es pt nl be lu dk se no fi is ie gb uk pl cz sk ua by md lt lv ee ru tr cy mt li mc sm va ad xk',
  'AS' => 'cn jp kr kp in pk bd lk np id my sg th vn ph kh la mm ir iq sy jo lb il ps sa ae qa kw bh om ye af kz uz tm kg tj mn ge am az tw hk mo bt mv bn tl',
  'AF' => 'eg ly tn dz ma sd ss et er dj so ke ug tz rw bi cd cg ga cm ng gh ci sn ml ne td bf gn sl lr tg bj mr gm gw cv ao zm zw mw mz na bw za ls sz mg mu sc km cf gq st',
  'NA' => 'us ca mx gt bz hn sv ni cr pa cu jm ht do bs bb tt gd lc vc ag dm kn pr',
  'SA' => 'br ar cl uy py bo pe ec co ve gy sr',
  'OC' => 'au nz pg fj sb vu ws to ki fm mh pw nr tv'
];
if ($scope === 'near') {
  $lat = (float)($_GET['lat'] ?? 999); $lon = (float)($_GET['lon'] ?? 999);
  if (abs($lat) > 90 || abs($lon) > 180) out(['error' => 'tačka'], 400);
  $where[] = 'r.hood IN (SELECT hood FROM (SELECT hood, AVG(cell_lat) la, AVG(cell_lon) lo FROM aroundle_answers GROUP BY hood) h
    WHERE 12742000*ASIN(SQRT(POW(SIN(RADIANS(h.la-?)/2),2)+COS(RADIANS(?))*COS(RADIANS(h.la))*POW(SIN(RADIANS(h.lo-?)/2),2))) <= ' . NEAR_M . ')';
  array_push($args, $lat, $lat, $lon);
} elseif ($scope === 'city') {
  $key = clean($_GET['key'] ?? '', 80);
  if ($key === '') out(['error' => 'ključ'], 400);
  $where[] = 'r.city=?'; $args[] = $key;
} elseif ($scope === 'country') {
  $key = strtolower(preg_replace('/[^a-z]/i', '', $_GET['key'] ?? ''));
  if (strlen($key) !== 2) out(['error' => 'ključ'], 400);
  $where[] = 'r.country=?'; $args[] = $key;
} elseif ($scope === 'continent') {
  $key = strtoupper(preg_replace('/[^a-z]/i', '', $_GET['key'] ?? ''));
  if (!isset($CONT[$key])) out(['error' => 'ključ'], 400);
  $cc = explode(' ', $CONT[$key]);
  $where[] = 'r.country IN (' . implode(',', array_fill(0, count($cc), '?')) . ')';
  array_push($args, ...$cc);
} elseif ($scope !== 'world') out(['error' => 'opseg'], 400);

$sql = 'SELECT r.hood, MIN(r.hood_name) AS hood_name, MIN(r.city) AS city, MIN(r.country) AS country, COUNT(*) AS n,
    ROUND(AVG(r.rating), 1) AS avg, SUM(r.mine) AS mine_n, ROUND(AVG(CASE WHEN r.mine = 1 THEN r.rating END), 1) AS avg_mine
  FROM aroundle_ratings r' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . '
  GROUP BY r.hood HAVING n >= ' . (int)$MIN[$period] . '
  ORDER BY AVG(r.rating) DESC, n DESC LIMIT 10';
try { $q = db()->prepare($sql); $q->execute($args); out(['ok' => true, 'min' => $MIN[$period], 'rows' => $q->fetchAll()]); }
catch (Throwable $e) { out(['ok' => true, 'min' => $MIN[$period], 'rows' => []]); } // tabela još ne postoji: prazna lista
