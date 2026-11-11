-- Aroundle rang-liste (MySQL / MariaDB na Loopiji)
CREATE TABLE IF NOT EXISTS aroundle_scores (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  day       DATE         NOT NULL,
  hood      VARCHAR(120) NOT NULL,          -- normalizovan „kraj|grad“
  hood_name VARCHAR(80)  NOT NULL,          -- za prikaz
  lat       DECIMAL(7,3) NOT NULL,          -- tačka već pomerena 50 m i zaokružena na ~100 m (nikad prava)
  lon       DECIMAL(8,3) NOT NULL,
  city      VARCHAR(80)  NOT NULL DEFAULT '',
  country   CHAR(2)      NOT NULL DEFAULT '',
  continent CHAR(2)      NOT NULL DEFAULT '',
  name      VARCHAR(24)  NOT NULL,
  points    INT UNSIGNED NOT NULL,
  correct   TINYINT UNSIGNED NOT NULL,
  total     TINYINT UNSIGNED NOT NULL,
  secs      SMALLINT UNSIGNED NOT NULL,
  iphash    CHAR(64)     NOT NULL,          -- heš IP adrese + so (sama IP se ne čuva)
  created   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY one_per_day (day, hood, iphash),
  KEY k_near (day, lat, lon),
  KEY k_city (day, city, points),
  KEY k_country (day, country, points),
  KEY k_cont (day, continent, points),
  KEY k_world (day, points),
  KEY k_hood (hood, day)                  -- za „najbolje poznate krajeve“ (api/hoods.php)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kratki linkovi za izazov (api/duel.php): kviz + rezultat izazivača pod nasumičnim id-om (#d=<id>)
CREATE TABLE IF NOT EXISTS aroundle_duels (
  id      CHAR(8)     NOT NULL PRIMARY KEY,    -- nasumičan base62
  payload MEDIUMTEXT  NOT NULL,                -- JSON kao K.duelPayload (najviše ~30 KB)
  iphash  CHAR(64)    NOT NULL,                -- heš IP adrese + so (samo za ograničenje upisa)
  created DATETIME    NOT NULL,
  KEY k_ip (iphash, created)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
