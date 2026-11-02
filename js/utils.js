const Utils = (() => {

  /* ------------------------------------------------------------
     [1] HTML ESCAPING — wajib untuk semua render dinamis
     ------------------------------------------------------------ */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------
     [2] FORMAT WAKTU
     ------------------------------------------------------------ */
  function formatWaktu(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID');
  }

  /* ------------------------------------------------------------
     [3] CEK TANGGAL — apakah value jatuh di HARI INI
     ------------------------------------------------------------ */
  function isToday(value) {
    if (!value) return false;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  /* ------------------------------------------------------------
     [3.b] NORMALISASI TANGGAL → 'YYYY-MM-DD' pada zona waktu LOKAL
     ------------------------------------------------------------ */
  function toLocalISODate(value) {
    if (!value) return '';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = value instanceof Date ? value : new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /* ------------------------------------------------------------
     [3.c] JAM KERJA — ubah angka di sini bila aturan berubah
     Atur jam disini untuk otomatis kupon makan lembur
     ------------------------------------------------------------ */
  const WORK = {
    MASUK: '21:38',              // jam masuk
    PULANG: '21:38',             // jam pulang
    LEMBUR_SETELAH_MENIT: 120,   // lembur jika pulang >= PULANG
  };

  // 'HH:MM' / 'HH:MM:SS' → detik sejak 00:00
  function jamKeDetik(str) {
    const [h = 0, m = 0, s = 0] = String(str).split(':').map(Number);
    return h * 3600 + m * 60 + s;
  }

  function detikHariIni(d) {
    const t = d instanceof Date ? d : new Date();
    return t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds();
  }

  function isSudahJamPulang(d) {
    return detikHariIni(d) >= jamKeDetik(WORK.PULANG);
  }

  function isLembur(d) {
    const batas = jamKeDetik(WORK.PULANG) + WORK.LEMBUR_SETELAH_MENIT * 60;
    return detikHariIni(d) >= batas;
  }

  function formatJamPulang() {
    return String(WORK.PULANG).slice(0, 8);
  }

  /* ------------------------------------------------------------
     [3.d] SORTING TABEL — klik header kolom (ID / Nama)
     ------------------------------------------------------------ */
  function sortBy(list, field, direction) {
    const angka = (v) => {
      const d = String(v || '').replace(/[^0-9]/g, '');
      return d === '' ? NaN : parseInt(d, 10);
    };
    const sorted = [...list].sort((a, b) => {
      if (field === 'id') {
        const na = angka(a.id);
        const nb = angka(b.id);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return String(a.id || '').localeCompare(String(b.id || ''), 'id', {
          sensitivity: 'base',
          numeric: true,
        });
      }
      const va = String(a[field] || '').toLowerCase().trim();
      const vb = String(b[field] || '').toLowerCase().trim();
      return va.localeCompare(vb, 'id', { sensitivity: 'base', numeric: true });
    });
    return direction === 'asc' ? sorted : sorted.reverse();
  }

  function updateSortIndicator(tableSel, cfg) {
    document.querySelectorAll(`${tableSel} th[data-sort]`).forEach((th) => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (cfg.field === th.dataset.sort) {
        th.classList.add(cfg.direction === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });
  }

  function bindSortHeader(tableSel, cfg, onChange) {
    const thead = document.querySelector(`${tableSel} thead`);
    if (!thead) return;
    thead.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      const field = th.dataset.sort;
      if (cfg.field === field) {
        cfg.direction = cfg.direction === 'asc' ? 'desc' : 'asc';
      } else {
        cfg.field = field;
        cfg.direction = 'asc';
      }
      onChange();
    });
  }

  /* ------------------------------------------------------------
     [4] CEK STATUS KARYAWAN — non-aktif = tolak operasi
     ------------------------------------------------------------ */
  function isKaryawanNonAktif(karyawan) {
    if (!karyawan) return false;
    const s = String(karyawan.status || '').toLowerCase().trim();
    return s === 'non-aktif' || s === 'nonaktif';
  }

  /* ------------------------------------------------------------
     [5] GENERATE KODE TRANSAKSI — TR-YYMM-XXX (auto-increment)
     ------------------------------------------------------------ */
  function nextKodeTransaksi() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `TR-${yy}${mm}-`;

    let maxSeq = 0;

    if (typeof Storage !== 'undefined' && Storage) {
      try {
        Storage.getReservasiManual().forEach((r) => {
          const kode = String(r.kode || '');
          if (!kode.startsWith(prefix)) return;
          const seq = parseInt(kode.slice(prefix.length), 10);
          if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
        });
      } catch (err) {
        console.warn('Utils: gagal membaca reservasi manual', err);
      }

      try {
        Storage.getKaryawan().forEach((k) => {
          const kode = String(k.kuponKode || '');
          if (!kode.startsWith(prefix)) return;
          const seq = parseInt(kode.slice(prefix.length), 10);
          if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
        });
      } catch (err) {
        console.warn('Utils: gagal membaca kuponKode karyawan', err);
      }

      try {
        if (typeof Storage.getReservasiArchive === 'function') {
          Storage.getReservasiArchive().forEach((r) => {
            const kode = String(r.kode || '');
            if (!kode.startsWith(prefix)) return;
            const seq = parseInt(kode.slice(prefix.length), 10);
            if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
          });
        }
      } catch (err) {
        console.warn('Utils: gagal membaca arsip reservasi', err);
      }
    }

    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }

  /* ------------------------------------------------------------
     [5.b] GENERATE KODE OVERTIME — OT-YYMM-XXX (auto-increment)
     ------------------------------------------------------------ */
  function nextKodeOvertime() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `OT-${yy}${mm}-`;

    let maxSeq = 0;

    if (typeof Storage !== 'undefined' && Storage) {
      try {
        Storage.getOvertime().forEach((r) => {
          const kode = String(r.id || '');
          if (!kode.startsWith(prefix)) return;
          const suffix = kode.slice(prefix.length);
          
          if (!/^\d{3,}$/.test(suffix)) return;
          const seq = parseInt(suffix, 10);
          if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
        });
      } catch (err) {
        console.warn('Utils: gagal membaca data overtime', err);
      }
    }

    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }

  /* ------------------------------------------------------------
     [6] EXPORT — API publik
     ------------------------------------------------------------ */
  return {
    escapeHtml,
    formatWaktu,
    isToday,
    toLocalISODate,
    sortBy,
    updateSortIndicator,
    bindSortHeader,
    WORK,
    isSudahJamPulang,
    isLembur,
    formatJamPulang,
    isKaryawanNonAktif,
    nextKodeTransaksi,
    nextKodeOvertime,
  };
})();
