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
const SCOPES = ['hood' => 'hood', 'city' => 'city', 'country' => 'country', 'continent' => 'continent', 'world' => null];
