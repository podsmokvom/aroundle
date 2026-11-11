<?php
// Brojač odigranih kvizova. GET: ukupno. POST {hood}: +1 kad igrač završi kviz
// (najviše jednom po kraju, danu i mreži — kao i kviz; IP se ne čuva, samo heš sa solju).
require __DIR__ . '/db.php';
function plays_table() {
  db()->exec("CREATE TABLE IF NOT EXISTS aroundle_plays (
    day DATE NOT NULL, hood VARCHAR(120) NOT NULL, iphash CHAR(64) NOT NULL,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (day, hood, iphash)
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}
try {
  if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $hood = clean($in['hood'] ?? '', 120);
    if ($hood === '') out(['error' => 'kraj'], 400);
    plays_table();
    $day = date('Y-m-d');
    db()->prepare('INSERT IGNORE INTO aroundle_plays (day, hood, iphash) VALUES (?,?,?)')
      ->execute([$day, $hood, hash('sha256', SALT . ($_SERVER['REMOTE_ADDR'] ?? '') . $day)]);
  }
  try { $n = (int)db()->query('SELECT COUNT(*) FROM aroundle_plays')->fetchColumn(); }
  catch (Throwable $e) { $n = 0; } // tabela još ne postoji (niko nije završio kviz)
  header('Cache-Control: public, max-age=60');
  out(['ok' => true, 'total' => $n]);
} catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
