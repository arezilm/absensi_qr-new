USE if0_43308636_absensi_qr;

-- ---------- users (auth) ----------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  permissions TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- jenis kartu ----------
CREATE TABLE IF NOT EXISTS jenis_kartu (
  id VARCHAR(50) PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  keterangan VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- karyawan ----------
CREATE TABLE IF NOT EXISTS karyawan (
  id VARCHAR(50) PRIMARY KEY,
  nama VARCHAR(150) NOT NULL,
  kategori VARCHAR(50) NULL,
  posisi VARCHAR(100) NULL,
  bagian VARCHAR(100) NULL,
  status VARCHAR(30) NULL,
  foto LONGTEXT NULL,
  absen TINYINT(1) NOT NULL DEFAULT 0,
  absen_at VARCHAR(30) NULL,
  pulang_at VARCHAR(30) NULL,
  makan TINYINT(1) NOT NULL DEFAULT 0,
  makan_at VARCHAR(30) NULL,
  kupon_kode VARCHAR(50) NULL,
  kupon_released TINYINT(1) NULL,
  kupon_released_at VARCHAR(30) NULL,
  kartu_cetak TINYINT(1) NOT NULL DEFAULT 0,
  kartu_cetak_at VARCHAR(30) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- riwayat scan ----------
CREATE TABLE IF NOT EXISTS riwayat (
  id INT AUTO_INCREMENT PRIMARY KEY,
  waktu VARCHAR(50) NOT NULL,
  nama VARCHAR(150) NULL,
  jenis VARCHAR(50) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- reservasi manual ----------
CREATE TABLE IF NOT EXISTS reservasi_manual (
  id VARCHAR(80) PRIMARY KEY,
  kode VARCHAR(50) NULL,
  karyawan_id VARCHAR(50) NULL,
  nama VARCHAR(150) NULL,
  tanggal VARCHAR(20) NULL,
  lembur VARCHAR(10) NULL,
  tindakan VARCHAR(20) NULL,
  keterangan VARCHAR(255) NULL,
  released TINYINT(1) NOT NULL DEFAULT 0,
  released_at VARCHAR(30) NULL,
  created_at VARCHAR(30) NULL,
  INDEX idx_rm_karyawan (karyawan_id),
  INDEX idx_rm_tanggal (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- arsip reservasi ----------
CREATE TABLE IF NOT EXISTS reservasi_archive (
  id VARCHAR(80) PRIMARY KEY,
  kode VARCHAR(50) NULL,
  karyawan_id VARCHAR(50) NULL,
  nama VARCHAR(150) NULL,
  bagian VARCHAR(100) NULL,
  tanggal VARCHAR(30) NULL,
  lembur VARCHAR(10) NULL,
  tindakan VARCHAR(20) NULL,
  keterangan VARCHAR(255) NULL,
  released TINYINT(1) NOT NULL DEFAULT 0,
  released_at VARCHAR(30) NULL,
  archived_at VARCHAR(30) NULL,
  INDEX idx_ra_karyawan (karyawan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- overtime ----------
CREATE TABLE IF NOT EXISTS overtime (
  id VARCHAR(80) PRIMARY KEY,
  karyawan_id VARCHAR(50) NULL,
  nama VARCHAR(150) NULL,
  tanggal VARCHAR(20) NULL,
  status VARCHAR(20) NULL,
  created_at VARCHAR(30) NULL,
  released_at VARCHAR(30) NULL,
  auto_released TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_ot_karyawan (karyawan_id),
  INDEX idx_ot_tanggal (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- presensi (riwayat absensi masuk/pulang) ----------
CREATE TABLE IF NOT EXISTS presensi (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SEED DATA DEFAULT
-- ============================================================

-- ---------- seed jenis kartu default ----------
INSERT INTO jenis_kartu (id, nama, keterangan) VALUES
  ('JK-01', 'Kartu Karyawan', 'Kartu untuk karyawan'),
  ('JK-02', 'Kartu Tamu',     'Kartu untuk tamu')
ON DUPLICATE KEY UPDATE nama = VALUES(nama), keterangan = VALUES(keterangan);

-- ---------- seed user admin default ----------
-- Password asli: admin123
INSERT INTO users (username, password_hash, name, role) VALUES
  ('admin', '$2a$12$vGCufyJHtxxVYhiiOqWssOXVUoJ6MuGrDEAVhbakXDhFVKTJ2Oa2a', 'Admin', 'admin')
ON DUPLICATE KEY UPDATE username = VALUES(username);