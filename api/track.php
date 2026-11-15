<?php
// Anonymous counters for the promotion (Duca, 15.11.): quizzes started and finished per day, language and source
// (utm_source / utm_medium / utm_campaign, or the referring site), and whether the player was here on an earlier day.
// Nothing about the player is stored: no IP, no hash, no place, no name; only "+1" on a row of totals.
// POST {ev: "start"|"finish", lang, src, med, camp, ret: 0|1}
require __DIR__ . '/db.php';
function track_table() {
  db()->exec("CREATE TABLE IF NOT EXISTS aroundle_track (
    day DATE NOT NULL, ev VARCHAR(8) NOT NULL, lang VARCHAR(5) NOT NULL, src VARCHAR(40) NOT NULL,
    med VARCHAR(40) NOT NULL, camp VARCHAR(60) NOT NULL, ret TINYINT NOT NULL, n INT NOT NULL DEFAULT 0,
    PRIMARY KEY (day, ev, lang, src, med, camp, ret)
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}
// a label: lowercase letters, digits, dot, dash and underscore only (no free text reaches the table)
function label($s, $max) {
  $s = strtolower(clean($s, $max));
  $s = preg_replace('/[^a-z0-9._-]+/', '-', $s);
  return trim($s, '-') ?: '';
}
try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST'], 405);
  $in = json_decode(file_get_contents('php://input', false, null, 0, 2000), true) ?: [];
  $ev = in_array($in['ev'] ?? '', ['start', 'finish'], true) ? $in['ev'] : null;
  if (!$ev) out(['error' => 'ev'], 400);
  $lang = in_array($in['lang'] ?? '', ['sr', 'hr', 'bs', 'en', 'de', 'fr', 'es', 'ru'], true) ? $in['lang'] : 'other';
  $src = label($in['src'] ?? '', 40) ?: 'direct';
  $med = label($in['med'] ?? '', 40) ?: '-';
  $camp = label($in['camp'] ?? '', 60) ?: '-';
  $ret = !empty($in['ret']) ? 1 : 0;
  track_table();
  db()->prepare('INSERT INTO aroundle_track (day, ev, lang, src, med, camp, ret, n) VALUES (?,?,?,?,?,?,?,1)
    ON DUPLICATE KEY UPDATE n = n + 1')->execute([date('Y-m-d'), $ev, $lang, $src, $med, $camp, $ret]);
  out(['ok' => true]);
} catch (Throwable $e) { out(['error' => 'baza nije dostupna'], 500); }
