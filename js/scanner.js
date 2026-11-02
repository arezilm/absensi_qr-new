const Scanner = (() => {
  const { escapeHtml } = Utils;

  /* ------------------------------------------------------------
     [1] KONSTANTA & STATE
     ------------------------------------------------------------ */
  const COOLDOWN_MS = 2000;
  const RESULT_TIMEOUT_MS = 3500;

  const TARGET_ID = 'reader';
  const RESULT_ID = 'resultScan';

  let html5QrCode = null;
  let isScanning = false;
  let lastScan = { text: null, time: 0 };
  let resultTimer = null;

  /* ------------------------------------------------------------
     [2] LIFECYCLE — start / stop kamera
     ------------------------------------------------------------ */
  async function start() {
    if (isScanning) {
      await stop();
      await delay(300);
    }

    if (typeof Html5Qrcode === 'undefined') {
      showSimple('Library scanner belum dimuat. Cek koneksi internet.', 'err');
      return;
    }

    if (!document.getElementById(TARGET_ID)) return;

    html5QrCode = new Html5Qrcode(TARGET_ID);
    lastScan = { text: null, time: 0 };

    try {
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => handleScan(decodedText),
        () => {}
      );
      isScanning = true;
    } catch (err) {
      console.error('Scanner: gagal start', err);
      showSimple('Gagal mengakses kamera. Pastikan izin kamera aktif.', 'err');
      html5QrCode = null;
      isScanning = false;
    }
  }

  async function stop() {
    if (!html5QrCode) {
      isScanning = false;
      return;
    }
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch {
      /* ignore */
    } finally {
      html5QrCode = null;
      isScanning = false;
    }
  }

  /* ------------------------------------------------------------
     [3] HELPER — deteksi tanggal lokal (YYYY-MM-DD, tanpa UTC)
     ------------------------------------------------------------ */
  function todayLocalISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function hasManualToday(karyawanId) {
    if (!karyawanId) return false;
    const today = todayLocalISO();
    return Storage.getReservasiManual().some((r) => {
      if (r.karyawanId !== karyawanId) return false;
      return Utils.toLocalISODate(r.tanggal || r.createdAt) === today;
    });
  }

  /* ------------------------------------------------------------
     [4] HANDLE SCAN — inti logika absensi & kupon
     ------------------------------------------------------------ */
  function handleScan(text) {
    if (!isScanning) return;

    // Anti-duplikat: cooldown per teks QR
    const now = Date.now();
    if (lastScan.text === text && now - lastScan.time < COOLDOWN_MS) return;
    lastScan = { text, time: now };

    const karyawan = Karyawan.cari(text);
    if (!karyawan) {
      showSimple(`QR tidak dikenali: ${text}`, 'err');
      return;
    }

    // Karyawan non-aktif ditolak
    if (Utils.isKaryawanNonAktif(karyawan)) {
      showEmployee(
        karyawan,
        'err',
        'Karyawan Non-Aktif — absensi & kupon ditolak'
      );
      return;
    }

    // Bersihkan makan kemarin
    const archived = Storage.archiveStaleMeal(karyawan);
    if (archived) Storage.save();

    const nowIso = new Date().toISOString();
    const absenToday = Utils.isToday(karyawan.absenAt);
    const makanToday = Utils.isToday(karyawan.makanAt);
    const pulangToday = Utils.isToday(karyawan.pulangAt);
    const manualToday = hasManualToday(karyawan.id);
    const kuponToday = makanToday || manualToday;

    // --- STATE 1: belum absen hari ini → catat ABSENSI MASUK ---
    if (!absenToday) {
      karyawan.absen = true;
      karyawan.absenAt = nowIso;
      delete karyawan.pulangAt;
      Storage.addRiwayat(karyawan.nama, 'Absensi');
      Storage.catatPresensiMasuk(karyawan, nowIso);
      Storage.save();
      showEmployee(karyawan, 'ok', 'Absensi masuk berhasil dicatat');
    }
    // --- STATE 2: belum punya kupon hari ini → beri KUPON MAKAN ---
    else if (!kuponToday) {
      karyawan.makan = true;
      karyawan.makanAt = nowIso;
      karyawan.kuponKode = Utils.nextKodeTransaksi();
      karyawan.kuponReleased = true;
      karyawan.kuponReleasedAt = nowIso;
      Storage.addRiwayat(karyawan.nama, 'Kupon Makan');
      Storage.save();
      showEmployee(
        karyawan,
        'ok',
        pulangToday
          ? 'Kupon Makan lembur (tambahan) berhasil diambil'
          : 'Kupon Makan berhasil diambil'
      );
    }
    // --- STATE 3: sudah absen & punya kupon, belum pulang ---
    else if (!pulangToday) {
      if (!Utils.isSudahJamPulang()) {
        showEmployee(
          karyawan,
          'warn',
          makanToday
            ? `Sudah absen & sudah ambil kupon makan. Absen pulang mulai ${Utils.formatJamPulang()}`
            : 'Kupon makan hari ini sudah tercatat via reservasi manual'
        );
        return;
      }

      // Catat ABSENSI PULANG
      karyawan.pulangAt = nowIso;
      Storage.addRiwayat(karyawan.nama, 'Absensi Pulang');

      let msg = 'Absensi pulang berhasil dicatat';
      if (Utils.isLembur()) {
        const direset = Storage.autoResetLembur(karyawan);
        if (direset) {
          Storage.addRiwayat(karyawan.nama, 'Lembur - Kupon Direset');
          msg = 'Absensi pulang dicatat — LEMBUR: kupon makan direset, 1× kupon tambahan tersedia';
        } else {
          msg = 'Absensi pulang dicatat (lembur hari ini sudah pernah direset)';
        }
      }
      Storage.catatPresensiPulang(karyawan, nowIso, Utils.isLembur());
      Storage.save();
      showEmployee(karyawan, 'ok', msg);
    }
    // --- STATE 4: sudah absen pulang ---
    else {
      showEmployee(karyawan, 'warn', 'Sudah absen pulang & kupon makan hari ini sudah diambil');
    }

    Karyawan.render();
    if (typeof Dashboard !== 'undefined') Dashboard.render();

    if (
      typeof Reservasi !== 'undefined' &&
      document.getElementById('panel-reservasi')?.classList.contains('active')
    ) {
      Reservasi.render();
    }
    if (
      typeof ReservasiOvertime !== 'undefined' &&
      document.getElementById('panel-reservasi-overtime')?.classList.contains('active')
    ) {
      ReservasiOvertime.render();
    }
    if (
      typeof ReleaseReservasi !== 'undefined' &&
      document.getElementById('panel-release-reservasi')?.classList.contains('active')
    ) {
      ReleaseReservasi.render();
    }
  }

  /* ------------------------------------------------------------
     [5] TAMPILAN HASIL — simple message & kartu karyawan
     ------------------------------------------------------------ */
  function showSimple(msg, type) {
    const el = document.getElementById(RESULT_ID);
    if (!el) return;
    if (resultTimer) clearTimeout(resultTimer);

    el.innerHTML = `<div class="scan-msg scan-msg-${type}">${escapeHtml(msg)}</div>`;
    el.className = 'result show';

    resultTimer = setTimeout(clearResult, RESULT_TIMEOUT_MS);
  }

  function showEmployee(k, type, message) {
    const el = document.getElementById(RESULT_ID);
    if (!el) return;
    if (resultTimer) clearTimeout(resultTimer);

    const photoHtml = k.foto
      ? `<img src="${escapeHtml(k.foto)}" alt="${escapeHtml(k.nama)}">`
      : `<span class="scan-photo-initial">${escapeHtml(
          (k.nama || '?').charAt(0).toUpperCase()
        )}</span>`;

    const icon = type === 'ok' ? '✓' : type === 'warn' ? '!' : '✕';

    el.innerHTML = `
      <div class="scan-result scan-result-${type}">
        <div class="scan-photo">${photoHtml}</div>
        <div class="scan-info">
          <div class="scan-status">
            <span class="scan-status-icon">${icon}</span>
            ${escapeHtml(message)}
          </div>
          <div class="scan-name">${escapeHtml(k.nama)}</div>
          <div class="scan-meta">
            <span>${escapeHtml(k.id)}</span>
            <span class="scan-meta-dot">•</span>
            <span>${escapeHtml(k.kategori || '-')}</span>
          </div>
          <div class="scan-time">${new Date().toLocaleTimeString('id-ID')}</div>
        </div>
      </div>`;
    el.className = 'result show';

    resultTimer = setTimeout(clearResult, RESULT_TIMEOUT_MS);
  }

  function clearResult() {
    const el = document.getElementById(RESULT_ID);
    if (!el) return;
    el.className = 'result';
    el.innerHTML = '';
    resultTimer = null;
  }

  /* ------------------------------------------------------------
     [6] HELPER
     ------------------------------------------------------------ */
  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ------------------------------------------------------------
     [7] EXPORT API
     ------------------------------------------------------------ */
  return { start, stop, isActive: () => isScanning };
})();
