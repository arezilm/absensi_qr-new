const Storage = (() => {
  const API_URL   = 'api.php';
  const MAX_RIWAYAT = 100;

  // ------------------------------------------------------------
  // CACHE IN-MEMORY
  // ------------------------------------------------------------
  let karyawan         = [];
  let riwayat          = [];
  let jenisKartu       = [];
  let reservasi        = [];
  let reservasiManual  = [];
  let reservasiArchive = [];
  let overtime         = [];
  let presensi         = [];

  // ------------------------------------------------------------
  // STATE SINKRONISASI
  // ------------------------------------------------------------
  let initialized   = false;
  let initPromise   = null;
  let syncing       = false;
  let pendingSync   = false;
  let lastSynced    = {};

  // ------------------------------------------------------------
  // INIT - fetch data awal dari MySQL (retry-able)
  // ------------------------------------------------------------
  function init() {
    if (initialized) return Promise.resolve();
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        const res = await fetch(API_URL + '?action=bootstrap', { cache: 'no-store' });
        if (!res.ok) throw new Error('Bootstrap HTTP ' + res.status);
        const data = await res.json();
        if (!data || !data.ok) {
          throw new Error(data && data.error ? data.error : 'Bootstrap gagal');
        }

        karyawan         = Array.isArray(data.karyawan)         ? data.karyawan         : [];
        riwayat          = Array.isArray(data.riwayat)          ? data.riwayat          : [];
        jenisKartu       = Array.isArray(data.jenisKartu)       ? data.jenisKartu       : [];
        reservasiManual  = Array.isArray(data.reservasiManual)  ? data.reservasiManual  : [];
        reservasiArchive = Array.isArray(data.reservasiArchive) ? data.reservasiArchive : [];
        overtime         = Array.isArray(data.overtime)         ? data.overtime         : [];
        presensi         = Array.isArray(data.presensi)         ? data.presensi         : [];

        lastSynced  = snapshot();
        initialized = true;
      } finally {
        // Selalu bersihkan initPromise agar percobaan berikutnya
        // (setelah jaringan pulih) bisa benar-benar fetch ulang.
        initPromise = null;
      }
    })();

    return initPromise;
  }

  // ------------------------------------------------------------
  // INVALIDATE - reset cache tanpa sync (dipakai saat logout)
  // ------------------------------------------------------------
  function invalidate() {
    initialized   = false;
    initPromise   = null;
    syncing       = false;
    pendingSync   = false;
    karyawan         = [];
    riwayat          = [];
    jenisKartu       = [];
    reservasi        = [];
    reservasiManual  = [];
    reservasiArchive = [];
    overtime         = [];
    presensi         = [];
    lastSynced = {};
  }

  // ------------------------------------------------------------
  // SNAPSHOT DAN DELTA
  // ------------------------------------------------------------
  function snapshot() {
    return {
      karyawan:         JSON.stringify(karyawan),
      riwayat:          JSON.stringify(riwayat),
      jenisKartu:       JSON.stringify(jenisKartu),
      reservasiManual:  JSON.stringify(reservasiManual),
      reservasiArchive: JSON.stringify(reservasiArchive),
      overtime:         JSON.stringify(overtime),
      presensi:         JSON.stringify(presensi),
    };
  }

  function buildDelta() {
    const cur = snapshot();
    const delta = {};
    for (const key of Object.keys(cur)) {
      if (cur[key] !== lastSynced[key]) {
        delta[key] = JSON.parse(cur[key]);
      }
    }
    return delta;
  }

  // ------------------------------------------------------------
  // SAVE - kirim delta ke server
  // ------------------------------------------------------------
  function save() {
    if (!initialized) {
      console.warn('Storage.save() dipanggil sebelum init - diabaikan.');
      return;
    }
    queueSync();
  }

  async function queueSync() {
    if (syncing) { pendingSync = true; return; }

    const delta = buildDelta();
    if (Object.keys(delta).length === 0) return;

    const sentKeys = Object.keys(delta);

    syncing = true;
    try {
      const res = await fetch(API_URL + '?action=sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(delta),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data && data.error ? data.error : 'HTTP ' + res.status);
      }

      for (const key of sentKeys) {
        lastSynced[key] = JSON.stringify(delta[key]);
      }
    } catch (err) {
      console.error('Storage: sync gagal', err);
      alert('Gagal menyimpan data ke server.\n\nPastikan XAMPP (Apache + MySQL) berjalan dan database sudah dibuat.');
    } finally {
      syncing = false;
      if (pendingSync) { pendingSync = false; queueSync(); }
    }
  }

  // ------------------------------------------------------------
  // KARYAWAN
  // ------------------------------------------------------------
  function getKaryawan()         { return karyawan; }
  function setKaryawan(data)     { karyawan = Array.isArray(data) ? data : []; }

  // ------------------------------------------------------------
  // RIWAYAT
  // ------------------------------------------------------------
  function getRiwayat() { return riwayat; }
  function addRiwayat(nama, jenis) {
    riwayat.unshift({
      waktu: new Date().toLocaleString('id-ID'),
      nama: nama,
      jenis: jenis,
    });
    if (riwayat.length > MAX_RIWAYAT) riwayat.length = MAX_RIWAYAT;
  }

  // ------------------------------------------------------------
  // JENIS KARTU
  // ------------------------------------------------------------
  function getJenisKartu()     { return jenisKartu; }
  function setJenisKartu(data) { jenisKartu = Array.isArray(data) ? data : []; }

  // ------------------------------------------------------------
  // RESERVASI
  // ------------------------------------------------------------
  function getReservasi()        { return reservasi; }
  function setReservasi(data)    { reservasi = Array.isArray(data) ? data : []; }

  function getReservasiManual()     { return reservasiManual; }
  function setReservasiManual(data) { reservasiManual = Array.isArray(data) ? data : []; }

  function getReservasiArchive()     { return reservasiArchive; }
  function setReservasiArchive(data) { reservasiArchive = Array.isArray(data) ? data : []; }

  // ------------------------------------------------------------
  // OVERTIME
  // ------------------------------------------------------------
  function getOvertime()     { return overtime; }
  function setOvertime(data) { overtime = Array.isArray(data) ? data : []; }

  // ------------------------------------------------------------
  // PRESENSI - riwayat absensi masuk/pulang per karyawan per hari
  // ------------------------------------------------------------
  function getPresensi()     { return presensi; }
  function setPresensi(data) { presensi = Array.isArray(data) ? data : []; }

  function presensiId(karyawanId, tanggal) {
    return 'PR-' + String(tanggal).replace(/-/g, '') + '-' + karyawanId;
  }

  function buatPresensi(k, masukIso) {
    const tanggal = Utils.toLocalISODate(masukIso);
    const id = presensiId(k.id, tanggal);
    let p = presensi.find((x) => x.id === id);
    if (p) return { p, baru: false };
    p = {
      id,
      karyawanId: k.id,
      nama: k.nama,
      bagian: k.bagian || '',
      tanggal,
      masukAt: masukIso,
      keluarAt: null,
      lembur: false,
    };
    presensi.unshift(p);
    return { p, baru: true };
  }

  // Dipanggil saat scan absensi masuk
  function catatPresensiMasuk(k, iso) {
    return buatPresensi(k, iso).baru;
  }

  // Dipanggil saat scan absensi pulang
  function catatPresensiPulang(k, iso, lembur) {
    const masukIso = Utils.isToday(k.absenAt) ? k.absenAt : iso;
    const { p } = buatPresensi(k, masukIso);
    p.keluarAt = iso;
    p.lembur = !!lembur || !!p.lembur;
  }

  // Isi presensi hari ini dari data karyawan yang sudah absen
  // sebelum fitur presensi ada. Return true jika ada perubahan.
  function backfillPresensiHariIni() {
    let changed = false;
    karyawan.forEach((k) => {
      if (!Utils.isToday(k.absenAt)) return;
      const { p, baru } = buatPresensi(k, k.absenAt);
      if (baru) changed = true;
      if (Utils.isToday(k.pulangAt) && !p.keluarAt) {
        p.keluarAt = k.pulangAt;
        changed = true;
      }
    });
    return changed;
  }

  // ------------------------------------------------------------
  // SIKLUS HARIAN - arsip makan kemarin
  // ------------------------------------------------------------
  function isToday(value) {
    return Utils.isToday(value);
  }

  function archiveStaleMeal(k) {
    if (!k || !k.makan || !k.makanAt) return false;
    if (Utils.isToday(k.makanAt)) return false;

    // Kupon tambahan (sesudah reset lembur di hari yang sama) tetap berstatus lembur
    const hariMakan = Utils.toLocalISODate(k.makanAt);
    const kuponTambahan = reservasiArchive.some(
      (a) =>
        a.karyawanId === k.id &&
        String(a.keterangan || '').toLowerCase().includes('lembur') &&
        Utils.toLocalISODate(a.archivedAt) === hariMakan
    );

    reservasiArchive.push({
      id: 'RV-ARCH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      kode: k.kuponKode || '',
      karyawanId: k.id,
      nama: k.nama,
      bagian: k.bagian || '',
      tanggal: k.makanAt,
      lembur: kuponTambahan ? 'Ya' : 'Tidak',
      tindakan: 'Ambil',
      keterangan: 'Siklus harian',
      released: k.kuponReleased !== false,
      releasedAt: k.kuponReleasedAt || k.makanAt,
      archivedAt: new Date().toISOString(),
    });

    k.makan = false;
    delete k.makanAt;
    delete k.kuponKode;
    delete k.kuponReleased;
    delete k.kuponReleasedAt;
    return true;
  }

  function cleanupStaleMeals() {
    let changed = false;
    karyawan.forEach((k) => { if (archiveStaleMeal(k)) changed = true; });
    if (changed) save();
    return changed;
  }

  function cleanupStaleReservasiManual() {
    const today = todayLocalISO();
    let changed = false;
    const keep = [];

    reservasiManual.forEach((r) => {
      const tgl = Utils.toLocalISODate(r.tanggal || r.createdAt);

      // Belum lewat → simpan
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl) || tgl >= today) {
        keep.push(r);
        return;
      }

      // Sudah lewat → cek duplikat di arsip
      const exists = reservasiArchive.some(
        (a) =>
          r.kode && a.kode
            ? a.kode === r.kode
            : a.karyawanId === r.karyawanId &&
              Utils.toLocalISODate(a.tanggal) === tgl
      );

      if (!exists) {
        const k = karyawan.find((x) => x.id === r.karyawanId);
        reservasiArchive.push({
          id: 'RV-ARCH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
          kode: r.kode || '',
          karyawanId: r.karyawanId,
          nama: r.nama,
          bagian: (k && k.bagian) || '',
          tanggal: r.tanggal,
          lembur: r.lembur || 'Tidak',
          tindakan: r.tindakan || 'Ambil',
          keterangan: r.keterangan || 'Siklus harian',
          released: !!r.released,
          releasedAt: r.releasedAt || null,
          archivedAt: new Date().toISOString(),
        });
      }

      changed = true;
    });

    if (changed) {
      reservasiManual = keep;
      save();
    }
    return changed;
  }

  // ------------------------------------------------------------
  // SIKLUS OVERTIME - auto-release
  // ------------------------------------------------------------
  function todayLocalISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function autoReleaseStaleOvertime() {
    const today = todayLocalISO();
    let changed = false;

    overtime.forEach((r) => {
      if (!r || r.status !== 'aktif') return;
      const tgl = String(r.tanggal || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return;
      if (tgl < today) {
        r.status = 'release';
        r.releasedAt = r.releasedAt || new Date().toISOString();
        r.autoReleased = true;
        changed = true;
      }
    });

    if (changed) save();
    return changed;
  }

  // ------------------------------------------------------------
  // LEMBUR OTOMATIS - dipanggil saat absen pulang >= jam lembur
  //   - arsipkan kupon makan hari ini (scan / manual) sebagai lembur
  //   - buat catatan overtime (aktif) hari ini
  //   - hanya 1x per karyawan per hari
  // Return true jika reset dilakukan.
  // ------------------------------------------------------------
  function autoResetLembur(k) {
    if (!k) return false;
    const today = todayLocalISO();

    const sudahOvertime = overtime.some(
      (r) => r.karyawanId === k.id && String(r.tanggal || '').slice(0, 10) === today
    );
    const sudahReset = reservasiArchive.some(
      (r) =>
        r.karyawanId === k.id &&
        String(r.keterangan || '').toLowerCase().includes('lembur') &&
        Utils.toLocalISODate(r.archivedAt) === today
    );
    if (sudahOvertime || sudahReset) return false;

    // Kupon basi (kemarin) diarsipkan sebagai siklus harian biasa
    archiveStaleMeal(k);

    const nowIso = new Date().toISOString();
    const newId = () =>
      'RV-ARCH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    // Kupon dari scan hari ini
    if (k.makan && Utils.isToday(k.makanAt)) {
      reservasiArchive.push({
        id: newId(),
        kode: k.kuponKode || '',
        karyawanId: k.id,
        nama: k.nama,
        bagian: k.bagian || '',
        tanggal: k.makanAt,
        lembur: 'Tidak', // kupon pertama = kupon normal
        tindakan: 'Ambil',
        keterangan: 'Reset otomatis lembur (presensi pulang)',
        released: k.kuponReleased !== false,
        releasedAt: k.kuponReleasedAt || k.makanAt,
        archivedAt: nowIso,
      });
      k.makan = false;
      delete k.makanAt;
      delete k.kuponKode;
      delete k.kuponReleased;
      delete k.kuponReleasedAt;
    }

    // Kupon dari reservasi manual hari ini
    const manualHariIni = reservasiManual.filter(
      (r) =>
        r.karyawanId === k.id &&
        Utils.toLocalISODate(r.tanggal || r.createdAt) === today
    );
    manualHariIni.forEach((r) => {
      reservasiArchive.push({
        id: newId(),
        kode: r.kode || '',
        karyawanId: k.id,
        nama: k.nama,
        bagian: k.bagian || '',
        tanggal: r.tanggal || nowIso,
        lembur: 'Tidak', // kupon pertama = kupon normal
        tindakan: r.tindakan || 'Ambil',
        keterangan: 'Reset otomatis lembur (presensi pulang)',
        released: !!r.released,
        releasedAt: r.releasedAt || null,
        archivedAt: nowIso,
      });
    });
    if (manualHariIni.length > 0) {
      reservasiManual = reservasiManual.filter((r) => !manualHariIni.includes(r));
    }

    overtime.unshift({
      id: Utils.nextKodeOvertime(),
      karyawanId: k.id,
      nama: k.nama,
      tanggal: today,
      status: 'aktif',
      createdAt: nowIso,
      releasedAt: null,
      autoReleased: false,
    });

    return true;
  }

  // ------------------------------------------------------------
  // RESET
  // ------------------------------------------------------------
  function reset() {
    karyawan = [];
    riwayat = [];
    reservasi = [];
    reservasiManual = [];
    reservasiArchive = [];
    overtime = [];
    presensi = [];
    save();
  }

  // ------------------------------------------------------------
  // EXPORT API
  // ------------------------------------------------------------
  return {
    init: init,
    invalidate: invalidate,
    getKaryawan: getKaryawan, setKaryawan: setKaryawan,
    getRiwayat: getRiwayat, addRiwayat: addRiwayat,
    getJenisKartu: getJenisKartu, setJenisKartu: setJenisKartu,
    getReservasi: getReservasi, setReservasi: setReservasi,
    getReservasiManual: getReservasiManual, setReservasiManual: setReservasiManual,
    getReservasiArchive: getReservasiArchive, setReservasiArchive: setReservasiArchive,
    getOvertime: getOvertime, setOvertime: setOvertime,
    getPresensi: getPresensi, setPresensi: setPresensi,
    catatPresensiMasuk: catatPresensiMasuk,
    catatPresensiPulang: catatPresensiPulang,
    backfillPresensiHariIni: backfillPresensiHariIni,
    save: save,
    reset: reset,
    isToday: isToday,
    archiveStaleMeal: archiveStaleMeal,
    cleanupStaleMeals: cleanupStaleMeals,
    cleanupStaleReservasiManual: cleanupStaleReservasiManual,
    todayLocalISO: todayLocalISO,
    autoReleaseStaleOvertime: autoReleaseStaleOvertime,
    autoResetLembur: autoResetLembur
  };
})();