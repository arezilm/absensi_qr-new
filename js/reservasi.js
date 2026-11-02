const TransaksiHelper = (() => {
  const { escapeHtml } = Utils;

  function fillPemesan(selectEl) {
    if (!selectEl) return false;
    const list = Storage.getKaryawan();
    const prev = selectEl.value;
    if (list.length === 0) {
      selectEl.innerHTML = '<option value="">-- Belum ada karyawan --</option>';
      return false;
    }
    selectEl.innerHTML =
      '<option value="">-- Pilih Karyawan --</option>' +
      list
        .map(
          (k) =>
            `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)} (${escapeHtml(
              k.id
            )})</option>`
        )
        .join('');
    if (prev) selectEl.value = prev;
    return true;
  }

  function statusBadge(status) {
    return status === 'release'
      ? '<span class="badge badge-muted">Released</span>'
      : '<span class="badge badge-ok">Aktif</span>';
  }

  function formatTanggal(tanggal) {
    if (!tanggal) return '-';
    const s = String(tanggal);
    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      d = new Date(`${s}T00:00:00`);
    } else {
      d = new Date(s);
    }
    return Number.isNaN(d.getTime())
      ? escapeHtml(tanggal)
      : escapeHtml(
          d.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        );
  }

  function formatJam(mulai, selesai) {
    return `${escapeHtml(mulai || '-')} - ${escapeHtml(selesai || '-')}`;
  }

  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString().slice(-6)}`;
  }

  return {
    fillPemesan,
    statusBadge,
    formatTanggal,
    formatJam,
    todayISO,
    makeId,
  };
})();

/* ============================================================
   [2] Reservasi — daftar live/manual/archive + tambah + view
   ============================================================ */
const Reservasi = (() => {
  const { escapeHtml } = Utils;
  let bound = false;

  /* ---------- [2.1] Kode transaksi otomatis ---------- */
  function kodeTransaksiAuto(k) {
    if (k.kuponKode) return k.kuponKode;
    const t = k.makanAt ? new Date(k.makanAt).getTime() : 0;
    return t ? `TR-${String(t).slice(-8)}` : `TR-${String(k.id || '-')}`;
  }

  /* ---------- [2.2] Format tanggal lokal ---------- */
  function formatTanggal(val) {
    if (!val) return '-';

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(val))) {
      const d = new Date(`${val}T00:00:00`);
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }

    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /* ---------- [2.3] Ambil list terpadu (manual + auto + archive) ---------- */
  function getList() {
    if (typeof Storage.cleanupStaleMeals === 'function') {
      Storage.cleanupStaleMeals();
    }
    if (typeof Storage.autoReleaseStaleOvertime === 'function') {
      Storage.autoReleaseStaleOvertime();
    }

    const items = [];

    // Sumber 1: Reservasi manual
    Storage.getReservasiManual().forEach((r) => {
      const karyawan = Karyawan.cari(r.karyawanId);
      const released = r.released !== undefined ? !!r.released : !!r.kode;
      items.push({
        source: 'manual',
        ref: `manual:${r.id}`,
        karyawanId: r.karyawanId,
        nama: r.nama,
        kode: r.kode || '',
        tanggal: r.tanggal || r.createdAt,
        bagian: (karyawan && karyawan.bagian) || '-',
        released,
        recordId: r.id,
      });
    });

    // Sumber 2: Auto (scan kupon hari ini)
    Storage.getKaryawan()
      .filter((k) => k.makan && k.makanAt && Utils.isToday(k.makanAt))
      .forEach((k) => {
        items.push({
          source: 'auto',
          ref: `auto:${k.id}`,
          karyawanId: k.id,
          nama: k.nama,
          kode: kodeTransaksiAuto(k),
          tanggal: k.makanAt,
          bagian: k.bagian || '-',
          released: k.kuponReleased !== false,
          recordId: k.id,
        });
      });

    // Sumber 3: Archive
    Storage.getReservasiArchive().forEach((r) => {
      const released = r.released !== undefined ? !!r.released : !!r.kode;
      items.push({
        source: 'archive',
        ref: `archive:${r.id}`,
        karyawanId: r.karyawanId,
        nama: r.nama,
        kode: r.kode || '',
        tanggal: r.tanggal || r.archivedAt,
        bagian: r.bagian || '-',
        released,
        recordId: r.id,
      });
    });

    items.sort((a, b) => {
      const ta = a.tanggal ? new Date(a.tanggal).getTime() : 0;
      const tb = b.tanggal ? new Date(b.tanggal).getTime() : 0;
      return tb - ta;
    });

    return items;
  }

  /* ---------- [2.4] Status lembur auto — hanya untuk HARI INI ---------- */
  function getStatusLemburAuto(karyawanId) {
    if (!karyawanId) return false;
    const today = Storage.todayLocalISO
      ? Storage.todayLocalISO()
      : TransaksiHelper.todayISO();
    // "Ada Lembur" hanya untuk kupon TAMBAHAN: yaitu jika kupon pertama
    // hari ini sudah diarsipkan oleh reset lembur (manual / otomatis).
    return Storage.getReservasiArchive().some(
      (r) =>
        r.karyawanId === karyawanId &&
        String(r.keterangan || '').toLowerCase().includes('lembur') &&
        Utils.toLocalISODate(r.archivedAt) === today
    );
  }

  /* ---------- [2.5] MODAL TAMBAH MANUAL ---------- */
  function openTambah() {
    const modal = document.getElementById('modalTambahReservasi');
    if (!modal) return;

    const karyawanList = Storage.getKaryawan();
    if (karyawanList.length === 0) {
      alert('Belum ada karyawan. Tambahkan dulu di menu Master Data → Karyawan.');
      return;
    }

    const idEl = document.getElementById('trId');
    const namaEl = document.getElementById('trNama');
    const tanggalEl = document.getElementById('trTanggal');
    const lemburEl = document.getElementById('trLembur');
    const tindakanEl = document.getElementById('trTindakan');
    const ketEl = document.getElementById('trKeterangan');

    if (idEl) { idEl.value = ''; idEl.classList.remove('input-error'); }
    if (namaEl) namaEl.value = '';
    if (tanggalEl) tanggalEl.value = TransaksiHelper.todayISO();
    if (lemburEl) lemburEl.value = 'Tidak';
    if (tindakanEl) tindakanEl.value = 'Ambil';
    if (ketEl) ketEl.value = '';

    const datalist = document.getElementById('trIdDatalist');
    if (datalist) {
      datalist.innerHTML = karyawanList
        .map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`)
        .join('');
    }

    modal.hidden = false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => idEl?.focus());
  }

  function closeTambah() {
    const modal = document.getElementById('modalTambahReservasi');
    if (modal) modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function onIdInput() {
    const idEl = document.getElementById('trId');
    const namaEl = document.getElementById('trNama');
    if (!idEl || !namaEl) return;

    const id = idEl.value.trim();
    if (!id) {
      namaEl.value = '';
      idEl.classList.remove('input-error');
      return;
    }

    const karyawan = Karyawan.cari(id);
    if (karyawan) {
      namaEl.value = karyawan.nama;
      idEl.classList.remove('input-error');
    } else {
      namaEl.value = '';
      idEl.classList.add('input-error');
    }
  }

  function tambah() {
    const idEl = document.getElementById('trId');
    const tanggalEl = document.getElementById('trTanggal');
    const lemburEl = document.getElementById('trLembur');
    const tindakanEl = document.getElementById('trTindakan');
    const ketEl = document.getElementById('trKeterangan');

    const id = (idEl.value || '').trim();
    const tanggal = (tanggalEl.value || '').trim();
    const lembur = lemburEl.value || 'Tidak';
    const tindakan = tindakanEl.value || 'Ambil';
    const keterangan = (ketEl.value || '').trim();

    /* --- Validasi dasar --- */
    if (!id) { alert('ID Karyawan wajib diisi!'); idEl.focus(); return; }
    if (!tanggal) { alert('Tanggal Reservasi wajib diisi!'); tanggalEl.focus(); return; }

    const karyawan = Karyawan.cari(id);
    if (!karyawan) {
      alert(`Karyawan dengan ID "${id}" tidak ditemukan!`);
      idEl.focus();
      return;
    }

    if (Utils.isKaryawanNonAktif(karyawan)) {
      alert(
        `Karyawan ${karyawan.nama} (${karyawan.id}) berstatus Non-Aktif.\n\n` +
        'Tidak dapat menambahkan reservasi / kupon makan untuk karyawan non-aktif.'
      );
      idEl.focus();
      return;
    }

    /* --- Validasi 1: 1 reservasi manual per karyawan + tanggal --- */
    const duplicateManual = Storage.getReservasiManual().find(
      (r) => r.karyawanId === karyawan.id && String(r.tanggal) === tanggal
    );
    if (duplicateManual) {
      const statusInfo = duplicateManual.released
        ? `sudah di-release (kode: ${duplicateManual.kode || '-'})`
        : 'belum di-release';
      alert(
        `Reservasi untuk ${karyawan.nama} (${karyawan.id}) pada tanggal ${tanggal} sudah ada (${statusInfo}).\n\n` +
        'Satu karyawan hanya dapat memiliki 1 reservasi manual per tanggal.\n\n' +
        'Jika masih butuh kupon makan tambahan untuk lembur, gunakan menu Transaksi → Reservasi Overtime.'
      );
      idEl.focus();
      return;
    }

    /* --- Validasi 2: kupon makan hari ini sudah diambil via scan --- */
    if (
      tanggal === TransaksiHelper.todayISO() &&
      Utils.isToday(karyawan.makanAt)
    ) {
      alert(
        `${karyawan.nama} (${karyawan.id}) sudah memiliki reservasi hari ini via scan kupon.\n\n` +
        'Satu karyawan hanya dapat memiliki 1 kupon makan aktif per hari.\n\n' +
        'Jika ingin menambah jatah makan karena lembur, reset dulu lewat menu Transaksi → Reservasi Overtime.'
      );
      idEl.focus();
      return;
    }

    /* --- Validasi 3: arsip di tanggal yang sama ---
       Skip arsip yang berasal dari Reset Overtime (lembur = 'Ya' atau
       keterangan memuat 'lembur') agar tidak memblokir kupon lembur. */
    const duplicateArchive = Storage.getReservasiArchive().find((r) => {
      if (r.karyawanId !== karyawan.id) return false;
      if (r.lembur === 'Ya') return false;
      if (String(r.keterangan || '').toLowerCase().includes('lembur')) return false;
      const archTanggal = Utils.toLocalISODate(r.tanggal || r.archivedAt);
      return archTanggal === tanggal;
    });
    if (duplicateArchive) {
      alert(
        `Karyawan ${karyawan.nama} (${karyawan.id}) sudah memiliki arsip reservasi pada tanggal ${tanggal}.\n\n` +
        'Tidak dapat menambahkan reservasi ganda untuk tanggal yang sama.'
      );
      idEl.focus();
      return;
    }

    /* --- Lolos semua validasi → simpan --- */
    Storage.getReservasiManual().unshift({
      id: 'RV-' + Date.now(),
      kode: '',
      karyawanId: karyawan.id,
      nama: karyawan.nama,
      tanggal,
      lembur,
      tindakan,
      keterangan,
      released: false,
      releasedAt: null,
      createdAt: new Date().toISOString(),
    });
    Storage.save();

    closeTambah();
    render();
    refreshReleaseIfActive();
  }

  /* ---------- [2.6] RELEASE MANUAL (quick action) ---------- */
  function releaseManual(ref) {
    if (!ref) return;
    const sep = ref.indexOf(':');
    if (sep < 0) return;
    const kind = ref.slice(0, sep);
    const id = ref.slice(sep + 1);
    if (kind !== 'manual') return;

    if (
      !confirm(
        'Release reservasi manual ini?\n\n' +
          'Kode transaksi akan dibuat dan reservasi ini masuk ke urutan transaksi.'
      )
    ) {
      return;
    }

    const list = Storage.getReservasiManual();
    const r = list.find((x) => x.id === id);
    if (!r) { alert('Reservasi tidak ditemukan.'); return; }
    if (r.released) { render(); return; }

    if (!r.kode) r.kode = Utils.nextKodeTransaksi();
    r.released = true;
    r.releasedAt = new Date().toISOString();

    Storage.save();
    render();
    refreshReleaseIfActive();
  }

  /* ---------- [2.7] MODAL: VIEW DETAIL ---------- */
  function openView(ref) {
    const sep = ref.indexOf(':');
    const source = sep >= 0 ? ref.slice(0, sep) : 'auto';
    const id = sep >= 0 ? ref.slice(sep + 1) : ref;

    let record = null;
    if (source === 'manual') {
      record = Storage.getReservasiManual().find((r) => r.id === id) || null;
    } else if (source === 'archive') {
      record = Storage.getReservasiArchive().find((r) => r.id === id) || null;
    } else {
      const k = Karyawan.cari(id);
      if (k && k.makan) record = k;
    }

    if (!record) {
      alert('Data reservasi tidak ditemukan.');
      return;
    }

    let karyawanId, nama, hasLembur, tanggalReservasi, tindakanLabel, keterangan;

    if (source === 'manual') {
      karyawanId = record.karyawanId;
      nama = record.nama;
      hasLembur = record.lembur === 'Ya';
      tanggalReservasi = formatTanggal(record.tanggal || record.createdAt);
      tindakanLabel = record.tindakan || '-';
      keterangan = record.keterangan || '';
    } else if (source === 'archive') {
      karyawanId = record.karyawanId;
      nama = record.nama;
      hasLembur = record.lembur === 'Ya';
      tanggalReservasi = formatTanggal(record.tanggal || record.archivedAt);
      tindakanLabel = record.tindakan || 'Ambil';
      keterangan = record.keterangan || '';
    } else {
      karyawanId = record.id;
      nama = record.nama;
      hasLembur = getStatusLemburAuto(record.id);
      tanggalReservasi = formatTanggal(record.makanAt);
      tindakanLabel = 'Ambil';
      keterangan = '';
    }

    let tindakanBadge = 'badge-muted';
    if (tindakanLabel === 'Ambil') tindakanBadge = 'badge-ok';
    else if (tindakanLabel === 'Antar') tindakanBadge = 'badge-info';

    const tbody = document.querySelector('#tabelReservasiDetail tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td>${escapeHtml(karyawanId)}</td>
          <td>${escapeHtml(nama)}</td>
          <td>${escapeHtml(tanggalReservasi)}</td>
          <td>
            <span class="badge ${hasLembur ? 'badge-warn' : 'badge-muted'}">
              ${hasLembur ? 'Ada Lembur' : 'Tidak Ada Lembur'}
            </span>
          </td>
          <td>
            <span class="badge ${tindakanBadge}">
              ${escapeHtml(tindakanLabel)}
            </span>
          </td>
        </tr>`;
    }

    const ketEl = document.getElementById('reservasiDetailKeterangan');
    if (ketEl) {
      if (keterangan) {
        ketEl.hidden = false;
        ketEl.innerHTML = `<strong>Keterangan:</strong> ${escapeHtml(keterangan)}`;
      } else {
        ketEl.hidden = true;
        ketEl.textContent = '';
      }
    }

    const titleEl = document.getElementById('modalReservasiDetailTitle');
    if (titleEl) titleEl.textContent = `Detail Reservasi — ${nama}`;

    const modal = document.getElementById('modalReservasiDetail');
    if (modal) {
      modal.hidden = false;
      document.body.classList.add('modal-open');
    }
  }

  function closeView() {
    const modal = document.getElementById('modalReservasiDetail');
    if (modal) modal.hidden = true;
    document.body.classList.remove('modal-open');

    const tbody = document.querySelector('#tabelReservasiDetail tbody');
    if (tbody) tbody.innerHTML = '';

    const ketEl = document.getElementById('reservasiDetailKeterangan');
    if (ketEl) { ketEl.hidden = true; ketEl.textContent = ''; }
  }

  /* ---------- [2.8] RENDER TABEL ---------- */
  function render() {
    const tbody = document.querySelector('#tabelReservasi tbody');
    if (!tbody) return;

    bindEvents(tbody);

    const keyword = (document.getElementById('searchReservasi')?.value || '').trim().toLowerCase();
    const tglFilter = document.getElementById('filterReservasiTanggal')?.value || '';

    const list = getList().filter((item) => {
      if (tglFilter && Utils.toLocalISODate(item.tanggal) !== tglFilter) return false;
      if (!keyword) return true;
      const kode = String(item.kode || '').toLowerCase();
      const bagian = String(item.bagian || '').toLowerCase();
      const nama = String(item.nama || '').toLowerCase();
      return kode.includes(keyword) || bagian.includes(keyword) || nama.includes(keyword);
    });

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-row">${
        keyword || tglFilter
          ? 'Reservasi tidak ditemukan.'
          : 'Belum ada reservasi. Klik "Tambah Reservasi" untuk menambahkan manual, atau scan kupon agar otomatis tercatat.'
      }</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((item, i) => {
        const kodeCell = item.kode
          ? escapeHtml(item.kode)
          : '<span class="badge badge-warn">Belum Release</span>';

        const isManualUnreleased = item.source === 'manual' && !item.released;
        const aksiRelease = isManualUnreleased
          ? `<button type="button" class="btn btn-success btn-sm"
               data-rv-release="${escapeHtml(item.ref)}">Release</button>`
          : '';

        return `
          <tr>
            <td class="cell-no">${i + 1}</td>
            <td>${kodeCell}</td>
            <td>${escapeHtml(formatTanggal(item.tanggal))}</td>
            <td>${escapeHtml(item.bagian || '-')}</td>
            <td class="cell-aksi">
              <button type="button" class="btn btn-primary btn-sm"
                data-rv-view="${escapeHtml(item.ref)}">View</button>
              ${aksiRelease}
            </td>
          </tr>`;
      })
      .join('');
  }

  /* ---------- [2.9] EVENT BINDING ---------- */
  function bindEvents(tbody) {
    if (bound) return;
    tbody.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('button[data-rv-view]');
      if (viewBtn) {
        openView(viewBtn.dataset.rvView);
        return;
      }
      const relBtn = e.target.closest('button[data-rv-release]');
      if (relBtn) {
        releaseManual(relBtn.dataset.rvRelease);
      }
    });
    bound = true;
  }

  /* ---------- [2.10] Refresh panel Release jika aktif ---------- */
  function refreshReleaseIfActive() {
    if (
      typeof ReleaseReservasi !== 'undefined' &&
      document.getElementById('panel-release-reservasi')?.classList.contains('active')
    ) {
      ReleaseReservasi.render();
    }
  }

  /* ---------- [2.11] EXPORT API ---------- */
  return {
    render,
    openView,
    closeView,
    openTambah,
    closeTambah,
    tambah,
    onIdInput,
    releaseManual,
    getList,
  };
})();

/* ============================================================
   [3] ReservasiOvertime — reset reservasi + daftar overtime
   ============================================================ */
const ReservasiOvertime = (() => {
  const { escapeHtml } = Utils;
  const H = TransaksiHelper;

  let bound = false;
  let editingId = null;

  /* ---------- [3.1] Form: input ID → auto-isi nama ---------- */
  function onIdInput() {
    const idEl = document.getElementById('otId');
    const namaEl = document.getElementById('otNama');
    if (!idEl || !namaEl) return;

    const id = idEl.value.trim();
    if (!id) {
      namaEl.value = '';
      idEl.classList.remove('input-error');
      return;
    }

    const karyawan = Karyawan.cari(id);
    if (karyawan) {
      namaEl.value = karyawan.nama;
      idEl.classList.remove('input-error');
    } else {
      namaEl.value = '';
      idEl.classList.add('input-error');
    }
  }

  /* ---------- [3.2] Reset reservasi (form utama) ---------- */
  function resetReservasi() {
    if (typeof Storage.autoReleaseStaleOvertime === 'function') {
      Storage.autoReleaseStaleOvertime();
    }

    const idEl = document.getElementById('otId');
    const tanggalEl = document.getElementById('otTanggal');

    const id = (idEl.value || '').trim();
    const tanggal = (tanggalEl.value || '').trim();

    if (!id) { alert('ID Karyawan wajib diisi!'); idEl.focus(); return; }
    if (!tanggal) { alert('Tanggal wajib diisi!'); tanggalEl.focus(); return; }

    const karyawan = Karyawan.cari(id);
    if (!karyawan) {
      alert(`Karyawan dengan ID "${id}" tidak ditemukan!`);
      idEl.focus();
      return;
    }

    if (Utils.isKaryawanNonAktif(karyawan)) {
      alert(
        `Karyawan ${karyawan.nama} (${karyawan.id}) berstatus Non-Aktif.\n\n` +
        'Tidak dapat melakukan reset reservasi / menandai lembur untuk karyawan non-aktif.'
      );
      idEl.focus();
      return;
    }

    /* --- Reset hanya 1× per karyawan per tanggal (status apa pun) --- */
    const duplicateOvertime = Storage.getOvertime().find(
      (r) =>
        r.karyawanId === karyawan.id &&
        String(r.tanggal || '').slice(0, 10) === tanggal
    );
    if (duplicateOvertime) {
      alert(
        `Reset/overtime untuk ${karyawan.nama} (${karyawan.id}) pada tanggal ${tanggal} sudah pernah dilakukan ` +
        `(kode: ${duplicateOvertime.id}).\n\n` +
        'Reset hanya berlaku 1× per karyawan per tanggal dan tidak dapat diulang.'
      );
      idEl.focus();
      return;
    }

    const today = H.todayISO();
    const isHariIni = tanggal === today;

    /* --- Cegah reset ulang hari ini (mis. overtime sempat dihapus) --- */
    if (isHariIni) {
      const sudahReset = Storage.getReservasiArchive().some(
        (r) =>
          r.karyawanId === karyawan.id &&
          String(r.keterangan || '').toLowerCase().includes('lembur') &&
          Utils.toLocalISODate(r.archivedAt) === today
      );
      if (sudahReset) {
        alert(
          `${karyawan.nama} (${karyawan.id}) sudah pernah direset hari ini.\n\n` +
          'Reset hanya berlaku untuk 1× pengambilan makan tambahan.'
        );
        idEl.focus();
        return;
      }
    }

    // Kupon basi (kemarin) diarsipkan sebagai siklus harian, bukan lembur
    Storage.archiveStaleMeal(karyawan);

    // Kupon aktif HARI INI: via scan, atau via reservasi manual
    const makanScan = isHariIni && !!karyawan.makan && Utils.isToday(karyawan.makanAt);
    const manualHariIni = isHariIni
      ? Storage.getReservasiManual().filter(
          (r) =>
            r.karyawanId === karyawan.id &&
            Utils.toLocalISODate(r.tanggal || r.createdAt) === today
        )
      : [];
    const adaKupon = makanScan || manualHariIni.length > 0;

    let msg = `Reset reservasi untuk ${karyawan.nama} (${karyawan.id})?\n\n`;
    if (adaKupon) {
      msg +=
        'Reservasi hari ini akan DIARSIPKAN (tetap tersimpan di daftar Reservasi) ' +
        'dan karyawan dapat mengambil kupon makan tambahan HANYA 1× lewat scan ATAU Tambah Reservasi manual.\n\n';
    } else {
      msg +=
        'Karyawan belum memiliki reservasi aktif hari ini. Hanya ditandai sebagai lembur.\n\n';
    }
    msg += 'Lanjutkan?';

    if (!confirm(msg)) return;

    let archived = false;
    const nowIso = new Date().toISOString();
    const newArchId = () =>
      'RV-ARCH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    if (makanScan) {
      Storage.getReservasiArchive().push({
        id: newArchId(),
        kode: karyawan.kuponKode || '',
        karyawanId: karyawan.id,
        nama: karyawan.nama,
        bagian: karyawan.bagian || '',
        tanggal: karyawan.makanAt || nowIso,
        lembur: 'Tidak', // kupon pertama = kupon normal
        tindakan: 'Ambil',
        keterangan: 'Diarsipkan untuk lembur',
        released: karyawan.kuponReleased !== false,
        releasedAt: karyawan.kuponReleasedAt || karyawan.makanAt || nowIso,
        archivedAt: nowIso,
      });
      archived = true;

      karyawan.makan = false;
      delete karyawan.makanAt;
      delete karyawan.kuponKode;
      delete karyawan.kuponReleased;
      delete karyawan.kuponReleasedAt;
    }

    if (manualHariIni.length > 0) {
      manualHariIni.forEach((r) => {
        Storage.getReservasiArchive().push({
          id: newArchId(),
          kode: r.kode || '',
          karyawanId: karyawan.id,
          nama: karyawan.nama,
          bagian: karyawan.bagian || '',
          tanggal: r.tanggal || nowIso,
          lembur: 'Tidak', // kupon pertama = kupon normal
          tindakan: r.tindakan || 'Ambil',
          keterangan: 'Diarsipkan untuk lembur',
          released: !!r.released,
          releasedAt: r.releasedAt || null,
          archivedAt: nowIso,
        });
      });
      Storage.setReservasiManual(
        Storage.getReservasiManual().filter((r) => !manualHariIni.includes(r))
      );
      archived = true;
    }

    Storage.getOvertime().unshift({
      id: Utils.nextKodeOvertime(),
      karyawanId: karyawan.id,
      nama: karyawan.nama,
      tanggal,
      status: 'aktif',
      createdAt: new Date().toISOString(),
      releasedAt: null,
    });

    Storage.save();

    idEl.value = '';
    idEl.classList.remove('input-error');
    const namaEl = document.getElementById('otNama');
    if (namaEl) namaEl.value = '';

    render();
    refreshLain();

    if (archived) {
      alert(
        `Reservasi ${karyawan.nama} berhasil direset.\n\n` +
        'Karyawan dapat mengambil kupon makan tambahan (hanya 1×) melalui:\n' +
        '  • Scan QR di Dashboard, atau\n' +
        '  • Tambah Reservasi Manual di menu Reservasi.\n\n' +
        'Keduanya tidak dapat dilakukan bersamaan untuk tanggal yang sama.\n\n' +
        'Overtime akan otomatis Released pada hari berikutnya.'
      );
    } else {
      alert(
        `Overtime untuk ${karyawan.nama} berhasil ditandai.\n` +
        'Karyawan belum memiliki reservasi aktif; silakan scan kupon makan atau tambah reservasi manual (hanya 1×).\n\n' +
        'Overtime akan otomatis Released pada hari berikutnya.'
      );
    }
  }

  /* ---------- [3.3] MODAL EDIT OVERTIME ---------- */
  function cari(id) {
    if (id === undefined || id === null) return null;
    const key = String(id).trim();
    if (!key) return null;
    return Storage.getOvertime().find((r) => r.id === key) || null;
  }

  function openEdit(id) {
    if (typeof Storage.autoReleaseStaleOvertime === 'function') {
      Storage.autoReleaseStaleOvertime();
    }

    const r = cari(id);
    if (!r) { alert('Data overtime tidak ditemukan.'); return; }
    editingId = r.id;

    const setVal = (elId, val) => {
      const el = document.getElementById(elId);
      if (el) el.value = val;
    };

    setVal('editOtId', r.id || '');
    setVal('editOtNama', r.nama || '');
    setVal('editOtTanggal', (r.tanggal || '').slice(0, 10));
    setVal('editOtStatus', r.status || 'aktif');

    const modal = document.getElementById('modalEditOvertime');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => document.getElementById('editOtTanggal')?.focus());
  }

  function closeEdit() {
    const modal = document.getElementById('modalEditOvertime');
    if (modal) modal.hidden = true;
    document.body.classList.remove('modal-open');
    editingId = null;
  }

  function simpanEdit() {
    if (!editingId) return;

    const list = Storage.getOvertime();
    const r = list.find((x) => x.id === editingId);
    if (!r) { alert('Data overtime tidak ditemukan!'); closeEdit(); return; }

    const tanggalEl = document.getElementById('editOtTanggal');
    const tanggal = (tanggalEl.value || '').trim();
    if (!tanggal) { alert('Tanggal wajib diisi!'); tanggalEl.focus(); return; }

    r.tanggal = tanggal;
    r.status = document.getElementById('editOtStatus').value || 'aktif';

    Storage.save();

    if (typeof Storage.autoReleaseStaleOvertime === 'function') {
      Storage.autoReleaseStaleOvertime();
    }

    closeEdit();
    render();
    refreshLain();
  }

  function hapus(id) {
    const targetId = id || editingId;
    if (!targetId) return;
    if (!confirm('Hapus data overtime ini? Tindakan tidak dapat dibatalkan.')) return;

    Storage.setOvertime(Storage.getOvertime().filter((r) => r.id !== targetId));
    Storage.save();

    if (editingId === targetId) closeEdit();
    render();
    refreshLain();
  }

  /* ---------- [3.4] RENDER TABEL OVERTIME ---------- */
  function render() {
    const tbody = document.querySelector('#tabelOvertime tbody');
    if (!tbody) return;

    if (typeof Storage.autoReleaseStaleOvertime === 'function') {
      Storage.autoReleaseStaleOvertime();
    }

    bindEvents(tbody);

    const datalist = document.getElementById('otIdDatalist');
    if (datalist) {
      datalist.innerHTML = Storage.getKaryawan()
        .map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`)
        .join('');
    }

    const tanggalEl = document.getElementById('otTanggal');
    if (tanggalEl && !tanggalEl.value) tanggalEl.value = H.todayISO();

    const keyword = (document.getElementById('searchOvertime')?.value || '').trim().toLowerCase();

    const tglFilter = document.getElementById('filterOvertimeTanggal')?.value || '';

    const list = Storage.getOvertime().filter((r) => {
      if (tglFilter && Utils.toLocalISODate(r.tanggal) !== tglFilter) return false;
      if (!keyword) return true;
      const nama = String(r.nama || '').toLowerCase();
      const id = String(r.id || '').toLowerCase();
      const karyawanId = String(r.karyawanId || '').toLowerCase();
      return nama.includes(keyword) || id.includes(keyword) || karyawanId.includes(keyword);
    });

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-row">${
        keyword || tglFilter ? 'Data overtime tidak ditemukan.' : 'Belum ada data overtime.'
      }</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.id)}</td>
          <td>${escapeHtml(r.nama)}</td>
          <td>${escapeHtml(H.formatTanggal(r.tanggal))}</td>
          <td>${H.statusBadge(r.status)}</td>
          <td>
            <button type="button" class="btn btn-primary btn-sm" data-ot-edit="${escapeHtml(
              r.id
            )}">Edit</button>
          </td>
        </tr>`
      )
      .join('');
  }

  /* ---------- [3.5] EVENT BINDING ---------- */
  function bindEvents(tbody) {
    if (bound) return;
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-ot-edit]');
      if (!btn) return;
      openEdit(btn.dataset.otEdit);
    });
    bound = true;
  }

  /* ---------- [3.6] Refresh panel lain ---------- */
  function refreshLain() {
    if (typeof Dashboard !== 'undefined') Dashboard.render();
    if (
      typeof Reservasi !== 'undefined' &&
      document.getElementById('panel-reservasi')?.classList.contains('active')
    ) {
      Reservasi.render();
    }
    if (
      typeof ReleaseReservasi !== 'undefined' &&
      document.getElementById('panel-release-reservasi')?.classList.contains('active')
    ) {
      ReleaseReservasi.render();
    }
  }

  /* ---------- [3.7] EXPORT API ---------- */
  return { render, reset: resetReservasi, onIdInput, openEdit, closeEdit, simpanEdit, hapus };
})();

/* ============================================================
   [4] ReleaseReservasi — kelola status release
   ============================================================ */
const ReleaseReservasi = (() => {
  const { escapeHtml } = Utils;
  const H = TransaksiHelper;

  let boundRelease = false;
  let editingRef = null;

  /* ---------- [4.1] Helper format tanggal ---------- */
  function formatTanggalPlain(val) {
    if (!val) return '-';
    const s = String(val);
    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      d = new Date(`${s}T00:00:00`);
    } else {
      d = new Date(s);
    }
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  /* ---------- [4.2] Ambil list terpadu dari Reservasi ---------- */
  function getUnifiedList() {
    if (typeof Reservasi !== 'undefined' && typeof Reservasi.getList === 'function') {
      return Reservasi.getList();
    }
    return [];
  }

  /* ---------- [4.3] MODAL EDIT STATUS ---------- */
  function openEdit(ref) {
    const list = getUnifiedList();
    const item = list.find((x) => x.ref === ref);
    if (!item) { alert('Data reservasi tidak ditemukan.'); return; }

    editingRef = ref;

    const kodeEl = document.getElementById('editRelKode');
    const tanggalEl = document.getElementById('editRelTanggal');
    const namaEl = document.getElementById('editRelNama');
    const bagianEl = document.getElementById('editRelBagian');
    const statusEl = document.getElementById('editRelStatus');

    if (kodeEl) kodeEl.value = item.kode || '(Belum Release)';
    if (tanggalEl) tanggalEl.value = formatTanggalPlain(item.tanggal);
    if (namaEl) namaEl.value = item.nama || '-';
    if (bagianEl) bagianEl.value = item.bagian || '-';
    if (statusEl) statusEl.value = item.released ? 'released' : 'pending';

    const modal = document.getElementById('modalEditReleaseReservasi');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeEdit() {
    const modal = document.getElementById('modalEditReleaseReservasi');
    if (modal) modal.hidden = true;
    document.body.classList.remove('modal-open');
    editingRef = null;
  }

  function simpanEdit() {
    if (!editingRef) return;

    const statusEl = document.getElementById('editRelStatus');
    const shouldRelease = statusEl && statusEl.value === 'released';

    const sep = editingRef.indexOf(':');
    if (sep < 0) { closeEdit(); return; }

    const kind = editingRef.slice(0, sep);
    const id = editingRef.slice(sep + 1);

    const now = new Date().toISOString();

    if (kind === 'manual') {
      const r = Storage.getReservasiManual().find((x) => x.id === id);
      if (!r) { closeEdit(); return; }

      if (shouldRelease) {
        if (!r.kode) r.kode = Utils.nextKodeTransaksi();
        r.released = true;
        r.releasedAt = now;
      } else {
        r.released = false;
        r.releasedAt = null;
        r.kode = '';
      }
    } else if (kind === 'auto') {
      const k = Karyawan.cari(id);
      if (!k) { closeEdit(); return; }

      if (shouldRelease) {
        k.kuponReleased = true;
        k.kuponReleasedAt = now;
      } else {
        k.kuponReleased = false;
        k.kuponReleasedAt = null;
      }
    } else if (kind === 'archive') {
      const r = Storage.getReservasiArchive().find((x) => x.id === id);
      if (!r) { closeEdit(); return; }

      if (shouldRelease) {
        if (!r.kode) r.kode = Utils.nextKodeTransaksi();
        r.released = true;
        r.releasedAt = now;
      } else {
        r.released = false;
        r.releasedAt = null;
        r.kode = '';
      }
    } else {
      closeEdit();
      return;
    }

    Storage.save();
    closeEdit();
    render();
    refreshOtherPanels();
  }

  /* ---------- [4.4] Refresh panel terkait ---------- */
  function refreshOtherPanels() {
    if (
      typeof Reservasi !== 'undefined' &&
      document.getElementById('panel-reservasi')?.classList.contains('active')
    ) {
      Reservasi.render();
    }
    if (typeof Dashboard !== 'undefined') Dashboard.render();
  }

  /* ---------- [4.5] RENDER TABEL RELEASE ---------- */
  function renderRelease() {
    const tbody = document.querySelector('#tabelReleaseReservasi tbody');
    if (!tbody) return;

    bindReleaseEvents(tbody);

    const tglFilter = document.getElementById('filterReleaseTanggal')?.value || '';
    const list = getUnifiedList().filter(
      (item) => !tglFilter || Utils.toLocalISODate(item.tanggal) === tglFilter
    );

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row">${
        tglFilter ? 'Reservasi tidak ditemukan.' : 'Belum ada reservasi.'
      }</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((item, i) => {
        const statusBadge = item.released
          ? '<span class="badge badge-ok">Sudah Release</span>'
          : '<span class="badge badge-warn">Belum Release</span>';

        const kodeCell = item.kode
          ? escapeHtml(item.kode)
          : '<span class="badge badge-warn">Belum Release</span>';

        const aksi = `<button type="button" class="btn btn-primary btn-sm"
             data-edit-release="${escapeHtml(item.ref)}">Edit</button>`;

        return `
          <tr>
            <td class="cell-no">${i + 1}</td>
            <td>${kodeCell}</td>
            <td>${escapeHtml(H.formatTanggal(item.tanggal))}</td>
            <td>${statusBadge}</td>
            <td>${escapeHtml(item.bagian || '-')}</td>
            <td>${aksi}</td>
          </tr>`;
      })
      .join('');
  }

  /* ---------- [4.6] EVENT BINDING ---------- */
  function bindReleaseEvents(tbody) {
    if (boundRelease) return;
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-edit-release]');
      if (!btn) return;
      openEdit(btn.dataset.editRelease);
    });
    boundRelease = true;
  }

  /* ---------- [4.7] ENTRY POINT ---------- */
  function render() {
    renderRelease();
  }

  /* ---------- [4.8] EXPORT API ---------- */
  return { render, openEdit, closeEdit, simpanEdit };
})();