<?php

require_once __DIR__ . '/config.php';

// Sesi login (dipakai untuk membatasi endpoint khusus Admin)
ini_set('session.gc_maxlifetime', '43200');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

$action = $_GET['action'] ?? '';

try {
  $pdo = getPDO();
  switch ($action) {
    case 'bootstrap': handleBootstrap($pdo); break;
    case 'sync':      handleSync($pdo);      break;
    case 'login':     handleLogin($pdo);     break;
    case 'logout':    handleLogout();        break;
    case 'get_users':    handleGetUsers($pdo);    break;
    case 'save_user':    handleSaveUser($pdo);    break;
    case 'delete_user':  handleDeleteUser($pdo);  break;
    default:          jsonErr(404, "Action tidak dikenal: $action");
  }
} catch (Throwable $e) {
  $msg = $e->getMessage();

  if (stripos($msg, 'Unknown database') !== false) {
    $msg = 'Database "absensi_qr" tidak ditemukan. Import database.sql via phpMyAdmin.';
  } elseif (stripos($msg, "doesn't exist") !== false) {
    $msg = 'Tabel database belum lengkap. Import database.sql via phpMyAdmin.';
  } elseif (stripos($msg, 'Connection refused') !== false
         || stripos($msg, 'No such file or directory') !== false) {
    $msg = 'Tidak dapat terhubung ke MySQL. Pastikan MySQL XAMPP sudah Start.';
  }

  jsonErr(500, $msg);
}

/* ============================================================
   HELPERS
   ============================================================ */
function jsonErr(int $code, string $msg): void {
  http_response_code($code);
  echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
  exit;
}
function jsonOk(array $data = []): void {
  echo json_encode(array_merge(['ok' => true], $data), JSON_UNESCAPED_UNICODE);
  exit;
}
function readBody(): array {
  $raw  = file_get_contents('php://input');
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}
function snakeToCamel(string $s): string {
  return lcfirst(str_replace('_', '', ucwords($s, '_')));
}
function boolColumns(): array {
  return [
    'karyawan'           => ['absen', 'makan', 'kupon_released', 'kartu_cetak'],
    'reservasi_manual'   => ['released'],
    'reservasi_archive'  => ['released'],
    'overtime'           => ['auto_released'],
    'presensi'           => ['lembur'],
  ];
}
function rowsToCamel(array $rows, string $table): array {
  $bool = boolColumns()[$table] ?? [];
  return array_map(function ($row) use ($bool) {
    $out = [];
    foreach ($row as $k => $v) {
      $camel = snakeToCamel($k);
      if (in_array($k, $bool, true) && $v !== null) {
        $v = (bool)$v;
      }
      $out[$camel] = $v;
    }
    return $out;
  }, $rows);
}
function b($v): int { return $v ? 1 : 0; }
function n($v)     { return ($v === null || $v === '') ? null : $v; }

function requireAdmin(): void {
  if (($_SESSION['role'] ?? '') !== 'admin') {
    jsonErr(403, 'Akses ditolak. Hanya Admin yang dapat mengelola user. Jika Anda Admin, silakan logout lalu login ulang.');
  }
}

function handleLogout(): void {
  $_SESSION = [];
  if (session_status() === PHP_SESSION_ACTIVE) session_destroy();
  jsonOk();
}

function reqId(array $r): string {
  return trim((string)($r['id'] ?? ''));
}

/* ============================================================
   ACTION: bootstrap
   ============================================================ */
function ensureSchema(PDO $pdo): void {
  // Auto-migrasi: kolom presensi pulang (aman dijalankan berulang)
  $c = $pdo->query("SHOW COLUMNS FROM karyawan LIKE 'pulang_at'")->fetch();
  if (!$c) {
    $pdo->exec("ALTER TABLE karyawan ADD COLUMN pulang_at VARCHAR(30) NULL AFTER absen_at");
  }
  // Tabel presensi (riwayat absensi masuk/pulang)
  $pdo->exec("CREATE TABLE IF NOT EXISTS presensi (
    id VARCHAR(80) PRIMARY KEY,
    karyawan_id VARCHAR(50) NULL,
    nama VARCHAR(150) NULL,
    bagian VARCHAR(100) NULL,
    tanggal VARCHAR(20) NULL,
    masuk_at VARCHAR(30) NULL,
    keluar_at VARCHAR(30) NULL,
    lembur TINYINT(1) NOT NULL DEFAULT 0,
    INDEX idx_pr_karyawan (karyawan_id),
    INDEX idx_pr_tanggal (tanggal)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function handleBootstrap(PDO $pdo): void {
  ensureSchema($pdo);
  $karyawan         = $pdo->query('SELECT * FROM karyawan ORDER BY id ASC')->fetchAll();
  $riwayat          = $pdo->query('SELECT waktu, nama, jenis FROM riwayat ORDER BY id ASC LIMIT 100')->fetchAll();
  $jenisKartu       = $pdo->query('SELECT * FROM jenis_kartu ORDER BY id ASC')->fetchAll();
  $reservasiManual  = $pdo->query('SELECT * FROM reservasi_manual ORDER BY created_at DESC')->fetchAll();
  $reservasiArchive = $pdo->query('SELECT * FROM reservasi_archive ORDER BY archived_at DESC')->fetchAll();
  $overtime         = $pdo->query('SELECT * FROM overtime ORDER BY created_at DESC')->fetchAll();
  $presensi         = $pdo->query('SELECT * FROM presensi ORDER BY tanggal DESC, masuk_at DESC')->fetchAll();

  echo json_encode([
    'ok'                => true,
    'karyawan'          => rowsToCamel($karyawan, 'karyawan'),
    'riwayat'           => rowsToCamel($riwayat, 'riwayat'),
    'jenisKartu'        => rowsToCamel($jenisKartu, 'jenis_kartu'),
    'reservasiManual'   => rowsToCamel($reservasiManual, 'reservasi_manual'),
    'reservasiArchive'  => rowsToCamel($reservasiArchive, 'reservasi_archive'),
    'overtime'          => rowsToCamel($overtime, 'overtime'),
    'presensi'          => rowsToCamel($presensi, 'presensi'),
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

/* ============================================================
   ACTION: sync
   ============================================================ */
function handleSync(PDO $pdo): void {
  $data = readBody();

  $pdo->beginTransaction();
  try {
    if (isset($data['karyawan']))         syncKaryawan($pdo, $data['karyawan']);
    if (isset($data['riwayat']))          syncRiwayat($pdo, $data['riwayat']);
    if (isset($data['jenisKartu']))       syncJenisKartu($pdo, $data['jenisKartu']);
    if (isset($data['reservasiManual']))  syncReservasiManual($pdo, $data['reservasiManual']);
    if (isset($data['reservasiArchive'])) syncReservasiArchive($pdo, $data['reservasiArchive']);
    if (isset($data['overtime']))         syncOvertime($pdo, $data['overtime']);
    if (isset($data['presensi']))         syncPresensi($pdo, $data['presensi']);
    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }
  jsonOk();
}

function syncKaryawan(PDO $pdo, array $rows): void {
  $pdo->exec('DELETE FROM karyawan');
  $sql = 'INSERT INTO karyawan
    (id, nama, kategori, posisi, bagian, status, foto,
     absen, absen_at, pulang_at, makan, makan_at,
     kupon_kode, kupon_released, kupon_released_at,
     kartu_cetak, kartu_cetak_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
  $stmt = $pdo->prepare($sql);
  foreach ($rows as $r) {
    if (!is_array($r)) continue;
    $id = reqId($r);
    if ($id === '') continue;

    $stmt->execute([
      $id,
      $r['nama']     ?? '',
      n($r['kategori'] ?? null),
      n($r['posisi']   ?? null),
      n($r['bagian']   ?? null),
      n($r['status']   ?? null),
      n($r['foto']     ?? null),
      b($r['absen'] ?? false),
      n($r['absenAt'] ?? null),
      n($r['pulangAt'] ?? null),
      b($r['makan'] ?? false),
      n($r['makanAt'] ?? null),
      n($r['kuponKode'] ?? null),
      isset($r['kuponReleased']) ? b($r['kuponReleased']) : null,
      n($r['kuponReleasedAt'] ?? null),
      b($r['kartuCetak'] ?? false),
      n($r['kartuCetakAt'] ?? null),
    ]);
  }
}

function syncRiwayat(PDO $pdo, array $rows): void {
  $pdo->exec('DELETE FROM riwayat');
  $ordered = array_reverse($rows);
  $stmt = $pdo->prepare('INSERT INTO riwayat (waktu, nama, jenis) VALUES (?,?,?)');
  foreach ($ordered as $r) {
    if (!is_array($r)) continue;
    $stmt->execute([
      $r['waktu'] ?? '',
      $r['nama']  ?? '',
      $r['jenis'] ?? '',
    ]);
  }
}

function syncJenisKartu(PDO $pdo, array $rows): void {
  $pdo->exec('DELETE FROM jenis_kartu');
  $stmt = $pdo->prepare('INSERT INTO jenis_kartu (id, nama, keterangan) VALUES (?,?,?)');
  foreach ($rows as $r) {
    if (!is_array($r)) continue;
    $id = reqId($r);
    if ($id === '') continue;
    $stmt->execute([
      $id,
      $r['nama'] ?? '',
      n($r['keterangan'] ?? null),
    ]);
  }
}

function syncReservasiManual(PDO $pdo, array $rows): void {
  $pdo->exec('DELETE FROM reservasi_manual');
  $stmt = $pdo->prepare('INSERT INTO reservasi_manual
    (id, kode, karyawan_id, nama, tanggal, lembur, tindakan,
     keterangan, released, released_at, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  foreach ($rows as $r) {
    if (!is_array($r)) continue;
    $id = reqId($r);
    if ($id === '') continue;
    $stmt->execute([
      $id,
      n($r['kode']     ?? null),
      $r['karyawanId'] ?? null,
      $r['nama']       ?? null,
      n($r['tanggal']  ?? null),
      n($r['lembur']   ?? null),
      n($r['tindakan'] ?? null),
      n($r['keterangan'] ?? null),
      b($r['released'] ?? false),
      n($r['releasedAt'] ?? null),
      n($r['createdAt']  ?? null),
    ]);
  }
}

function syncReservasiArchive(PDO $pdo, array $rows): void {
  $pdo->exec('DELETE FROM reservasi_archive');
  $stmt = $pdo->prepare('INSERT INTO reservasi_archive
    (id, kode, karyawan_id, nama, bagian, tanggal, lembur,
     tindakan, keterangan, released, released_at, archived_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  foreach ($rows as $r) {
    if (!is_array($r)) continue;
    $id = reqId($r);
    if ($id === '') continue;
    $stmt->execute([
      $id,
      n($r['kode']     ?? null),
      $r['karyawanId'] ?? null,
      $r['nama']       ?? null,
      n($r['bagian']   ?? null),
      n($r['tanggal']  ?? null),
      n($r['lembur']   ?? null),
      n($r['tindakan'] ?? null),
      n($r['keterangan'] ?? null),
      b($r['released'] ?? false),
      n($r['releasedAt'] ?? null),
      n($r['archivedAt'] ?? null),
    ]);
  }
}

function syncOvertime(PDO $pdo, array $rows): void {
  $pdo->exec('DELETE FROM overtime');
  $stmt = $pdo->prepare('INSERT INTO overtime
    (id, karyawan_id, nama, tanggal, status,
     created_at, released_at, auto_released)
    VALUES (?,?,?,?,?,?,?,?)');
  foreach ($rows as $r) {
    if (!is_array($r)) continue;
    $id = reqId($r);
    if ($id === '') continue;
    $stmt->execute([
      $id,
      $r['karyawanId'] ?? null,
      $r['nama']       ?? null,
      n($r['tanggal']  ?? null),
      n($r['status']   ?? null),
      n($r['createdAt']    ?? null),
      n($r['releasedAt']   ?? null),
      b($r['autoReleased'] ?? false),
    ]);
  }
}

function syncPresensi(PDO $pdo, array $rows): void {
  $pdo->exec('DELETE FROM presensi');
  $stmt = $pdo->prepare('INSERT INTO presensi
    (id, karyawan_id, nama, bagian, tanggal, masuk_at, keluar_at, lembur)
    VALUES (?,?,?,?,?,?,?,?)');
  foreach ($rows as $r) {
    if (!is_array($r)) continue;
    $id = reqId($r);
    if ($id === '') continue;
    $stmt->execute([
      $id,
      $r['karyawanId'] ?? null,
      $r['nama']       ?? null,
      n($r['bagian']   ?? null),
      n($r['tanggal']  ?? null),
      n($r['masukAt']  ?? null),
      n($r['keluarAt'] ?? null),
      b($r['lembur']   ?? false),
    ]);
  }
}

/* ============================================================
   ACTION: login
   ============================================================ */
function handleLogin(PDO $pdo): void {
  $data     = readBody();
  $username = trim((string)($data['username'] ?? ''));
  $password = (string)($data['password'] ?? '');

  if ($username === '' || $password === '') {
    jsonErr(400, 'Username dan password wajib diisi.');
  }

  $totalUsers = 0;
  try {
    $totalUsers = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
  } catch (Throwable $e) {
    jsonErr(500, 'Tabel "users" belum ada. Import database.sql via phpMyAdmin.');
  }

  if ($totalUsers === 0) {
    jsonErr(503, 'Database belum memiliki user. Silakan jalankan query INSERT user pada database Anda.');
  }

  // Ambil data user beserta role dan permissions
  $stmt = $pdo->prepare('SELECT id, username, name, password_hash, role, is_active, permissions FROM users WHERE username = ? LIMIT 1');
  $stmt->execute([$username]);
  $u = $stmt->fetch();

  if (!$u || !password_verify($password, $u['password_hash'])) {
    jsonErr(401, 'Username atau password salah.');
  }

  if ((int)$u['is_active'] === 0) {
    jsonErr(403, 'Akun Anda dinonaktifkan. Hubungi Admin.');
  }

  session_regenerate_id(true);
  $_SESSION['uid']  = (int)$u['id'];
  $_SESSION['role'] = $u['role'] ?? 'user';

  jsonOk([
    'user' => [
      'id'          => $u['id'],
      'username'    => $u['username'],
      'name'        => $u['name'],
      'role'        => $u['role'] ?? 'user',
      'permissions' => $u['permissions'] ? json_decode($u['permissions'], true) : (object)[]
    ]
  ]);
}

/* ============================================================
   ACTION: get_users (Hanya untuk Admin)
   ============================================================ */
function handleGetUsers(PDO $pdo): void {
  requireAdmin();
  // Catatan: Di produksi, pastikan ada validasi token/session admin di sini.
  $stmt = $pdo->query('SELECT id, username, name, role, is_active, permissions FROM users ORDER BY id ASC');
  $users = $stmt->fetchAll();
  
  // Parse permissions JSON string ke array/object
  foreach ($users as &$u) {
    $u['permissions'] = $u['permissions'] ? json_decode($u['permissions'], true) : (object)[];
  }

  jsonOk(['users' => $users]);
}

/* ============================================================
   ACTION: save_user (Tambah/Edit)
   ============================================================ */
function handleSaveUser(PDO $pdo): void {
  requireAdmin();
  $data = readBody();
  $id = isset($data['id']) ? (int)$data['id'] : 0;
  $username = trim($data['username'] ?? '');
  $name = trim($data['name'] ?? '');
  $password = $data['password'] ?? '';
  $role = $data['role'] ?? 'user';
  $isActive = isset($data['isActive']) ? (int)$data['isActive'] : 1;
  $permissions = isset($data['permissions']) ? json_encode($data['permissions']) : '[]';

  if (!$username || !$name) {
    jsonErr(400, 'Username dan Nama wajib diisi.');
  }

  if ($id > 0) {
    // Mode Edit
    if ($password !== '') {
      $hash = password_hash($password, PASSWORD_DEFAULT);
      $stmt = $pdo->prepare('UPDATE users SET username=?, name=?, password_hash=?, role=?, is_active=?, permissions=? WHERE id=?');
      $stmt->execute([$username, $name, $hash, $role, $isActive, $permissions, $id]);
    } else {
      $stmt = $pdo->prepare('UPDATE users SET username=?, name=?, role=?, is_active=?, permissions=? WHERE id=?');
      $stmt->execute([$username, $name, $role, $isActive, $permissions, $id]);
    }
  } else {
    // Mode Tambah
    if ($password === '') jsonErr(400, 'Password wajib diisi untuk user baru.');
    $hash = password_hash($password, PASSWORD_DEFAULT);
    try {
      $stmt = $pdo->prepare('INSERT INTO users (username, name, password_hash, role, is_active, permissions) VALUES (?,?,?,?,?,?)');
      $stmt->execute([$username, $name, $hash, $role, $isActive, $permissions]);
    } catch (Exception $e) {
      jsonErr(400, 'Username sudah digunakan atau terjadi kesalahan.');
    }
  }
  jsonOk();
}

/* ============================================================
   ACTION: delete_user
   ============================================================ */
function handleDeleteUser(PDO $pdo): void {
  requireAdmin();
  $data = readBody();
  $id = isset($data['id']) ? (int)$data['id'] : 0;
  if ($id <= 0) jsonErr(400, 'ID tidak valid.');
  if ($id === (int)($_SESSION['uid'] ?? 0)) jsonErr(400, 'Tidak dapat menghapus akun yang sedang digunakan.');
  
  $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
  jsonOk();
}