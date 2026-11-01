<?php

define('DB_HOST', 'sql213.infinityfree.com');
define('DB_PORT', 3306);
define('DB_USER', 'if0_43308636');
define('DB_PASS', 'rezakurnia07');
define('DB_NAME', 'if0_43308636_absensi_qr');

function getPDO(): PDO {
  static $pdo = null;
  if ($pdo === null) {
    $dsn = sprintf(
      'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
      DB_HOST, DB_PORT, DB_NAME
    );
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
      PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
  }
  return $pdo;
}