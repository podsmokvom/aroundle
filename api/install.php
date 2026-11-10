<?php
// Jednokratno: otvori /api/install.php u pregledaču da napravi tabelu, pa OBRIŠI ovaj fajl sa servera.
require __DIR__ . '/db.php';
try {
  db()->exec(file_get_contents(__DIR__ . '/schema.sql'));
  out(['ok' => true, 'poruka' => 'Tabela kmh_scores je spremna. Sada obriši install.php sa servera.']);
} catch (Throwable $e) { out(['ok' => false, 'greska' => $e->getMessage()], 500); }
