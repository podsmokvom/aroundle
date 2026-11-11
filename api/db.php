<?php
// Zajedničko: konekcija, JSON odgovor, CORS (sajt i lokalni razvoj)
require __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function db() {
  static $pdo = null;
  if (!$pdo) {
    $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
  }
  return $pdo;
}
function clean($s, $max) { return mb_substr(trim(preg_replace('/[\x00-\x1F<>]/u', '', (string)$s)), 0, $max); }
const SCOPES = ['near' => null, 'city' => 'city', 'country' => 'country', 'continent' => 'continent', 'world' => null];
const NEAR_M = 1500; // „kraj“ na rang-listi = sve tačke do 1,5 km (tačke su nasumično pomerene 50 m)
// SQL uslov: rastojanje (haversine) od tačke ?,? do kolona lat/lon najviše NEAR_M, uz brzi okvir (bbox) za indeks
function nearSql($lat, $lon, &$args) {
  $dLat = NEAR_M / 111320; $dLon = NEAR_M / (111320 * max(0.01, cos(deg2rad($lat))));
  array_push($args, $lat - $dLat, $lat + $dLat, $lon - $dLon, $lon + $dLon, $lat, $lat, $lon);
  return 'lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND 12742000*ASIN(SQRT(POW(SIN(RADIANS(lat-?)/2),2)+COS(RADIANS(?))*COS(RADIANS(lat))*POW(SIN(RADIANS(lon-?)/2),2))) <= ' . NEAR_M;
}
