const Karyawan = (() => {
  const { escapeHtml } = Utils;

  /* ------------------------------------------------------------
     [1] STATE MODUL
     ------------------------------------------------------------ */
  let bound = false;
  let editingId = null;

  // State khusus modal Edit — untuk auto-update ID saat kategori berubah
  let originalId = null;
  let originalKategori = null;
  let userManuallyEditedId = false;
  let editListenersBound = false;

  const sortConfig = { field: 'nama', direction: 'asc' };

  /* ------------------------------------------------------------
     [2] DROPDOWN KATEGORI — sinkron dengan master Jenis Kartu
     ------------------------------------------------------------ */
  function fillKategoriOptions(selectEl, currentValue) {
    if (!selectEl) return;

    const jenisKartu = Storage.getJenisKartu();
    const prev =
      currentValue !== undefined && currentValue !== null
        ? String(currentValue)
        : String(selectEl.value || '');

    let html = '';

    if (jenisKartu.length === 0) {
      html =
        '<option value="Karyawan">Karyawan</option>' +
        '<option value="Tamu">Tamu</option>';
    } else {
      html = jenisKartu
        .map(
          (j) =>
            `<option value="${escapeHtml(j.nama)}">${escapeHtml(j.nama)}</option>`
        )
        .join('');
    }

    selectEl.innerHTML = html;

    let validPrev = jenisKartu.some((j) => j.nama === prev);
    if (jenisKartu.length === 0) {
      validPrev = prev === 'Karyawan' || prev === 'Tamu';
    }

    if (prev && validPrev) {
      selectEl.value = prev;
    } else if (prev && !validPrev) {
      console.warn(
        `Karyawan: kategori "${prev}" tidak ada di master Jenis Kartu. ` +
          `Dropdown akan fallback ke opsi valid.`
      );
    }
    if (selectEl.selectedIndex === -1 && selectEl.options.length > 0) {
      selectEl.selectedIndex = 0;
    }
  }

  /* ------------------------------------------------------------
     [3] SORTING — klik header kolom ID/Nama
     ------------------------------------------------------------ */
  function setSort(field) {
    if (sortConfig.field === field) {
      sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
      sortConfig.field = field;
      sortConfig.direction = 'asc';
    }
    render();
  }

  function toNumber(val) {
    const digits = String(val || '').replace(/[^0-9]/g, '');
    return digits === '' ? NaN : parseInt(digits, 10);
  }

  function sortList(list) {
    const { field, direction } = sortConfig;

    const sorted = [...list].sort((a, b) => {
      if (field === 'id') {
        const na = toNumber(a.id);
        const nb = toNumber(b.id);
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

  function updateSortIndicator() {
    document.querySelectorAll('#tabelKaryawan th[data-sort]').forEach((th) => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (sortConfig.field === th.dataset.sort) {
        th.classList.add(
          sortConfig.direction === 'asc' ? 'sort-asc' : 'sort-desc'
        );
      }
    });
  }

  /* ------------------------------------------------------------
     [4] MODAL TAMBAH — buka/tutup/reset
     ------------------------------------------------------------ */
  function openForm() {
    const modal = document.getElementById('modalKaryawan');
    if (!modal) return;

    resetForm();
    fillKategoriOptions(document.getElementById('kategori'), '');

    modal.hidden = false;
    document.body.classList.add('modal-open');

    requestAnimationFrame(() => {
      document.getElementById('nama')?.focus();
    });
  }

  function closeForm() {
    const modal = document.getElementById('modalKaryawan');
    if (!modal) return;

    modal.hidden = true;
    document.body.classList.remove('modal-open');

    resetForm();
  }

  function toggleForm() {
    const modal = document.getElementById('modalKaryawan');
    if (!modal) return;
    modal.hidden ? openForm() : closeForm();
  }

  function resetForm() {
    ['nama', 'idKaryawan', 'posisi', 'bagian'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const kategoriEl = document.getElementById('kategori');
    if (kategoriEl) kategoriEl.selectedIndex = 0;

    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.selectedIndex = 0;
  }

  /* ------------------------------------------------------------
     [5] MODAL EDIT — buka/tutup/simpan (ID & kategori bisa diubah)
     ------------------------------------------------------------ */
  function openEdit(id) {
    const k = cari(id);
    if (!k) {
      alert('Data karyawan tidak ditemukan.');
      return;
    }

    editingId = k.id;
    originalId = k.id;
    originalKategori = k.kategori || 'Karyawan';
    userManuallyEditedId = false;

    const setVal = (elId, val) => {
      const el = document.getElementById(elId);
      if (el) el.value = val;
    };

    setVal('editIdKaryawan', k.id || '');
    setVal('editNama', k.nama || '');
    setVal('editPosisi', k.posisi || '');
    setVal('editBagian', k.bagian || '');

    fillKategoriOptions(
      document.getElementById('editKategori'),
      k.kategori || 'Karyawan'
    );

    const statusEl = document.getElementById('editStatus');
    if (statusEl) statusEl.value = k.status || 'Aktif';

    // Pasang listener khusus modal Edit (sekali saja)
    bindEditListeners();

    const modal = document.getElementById('modalEditKaryawan');
    if (!modal) return;

    modal.hidden = false;
    document.body.classList.add('modal-open');

    requestAnimationFrame(() => {
      document.getElementById('editNama')?.focus();
    });
  }

  function closeEdit() {
    const modal = document.getElementById('modalEditKaryawan');
    if (modal) modal.hidden = true;

    document.body.classList.remove('modal-open');

    editingId = null;
    originalId = null;
    originalKategori = null;
    userManuallyEditedId = false;
  }

  function bindEditListeners() {
    if (editListenersBound) return;

    const idEl = document.getElementById('editIdKaryawan');
    if (idEl) {
      idEl.addEventListener('input', () => {
        // Tandai user sudah mengetik ID secara manual
        userManuallyEditedId = true;
      });
    }

    const katEl = document.getElementById('editKategori');
    if (katEl) {
      katEl.addEventListener('change', onEditKategoriChange);
    }

    editListenersBound = true;
  }

  /* ------------------------------------------------------------
     [5.b] LISTENER — saat kategori diubah di modal Edit
     Auto-regenerate ID ke prefix kategori baru, hanya jika
     user belum mengetik ID secara manual.
     ------------------------------------------------------------ */
  function onEditKategoriChange() {
    if (originalId === null || originalKategori === null) return;
    if (userManuallyEditedId) return;

    const katEl = document.getElementById('editKategori');
    const idEl = document.getElementById('editIdKaryawan');
    if (!katEl || !idEl) return;

    const newKategori = katEl.value;

    if (newKategori === originalKategori) {
      // Kembali ke kategori semula → kembalikan ID semula
      idEl.value = originalId;
    } else {
      // Kategori berubah → hitung ID baru dengan prefix kategori baru
      idEl.value = nextDefaultIdExcluding(newKategori, originalId);
    }

    // Nilai baru di-set secara programatik, jadi bukan "user edit"
    userManuallyEditedId = false;
  }

  function simpanEdit() {
    if (!editingId) return;

    const list = Storage.getKaryawan();
    const k = list.find((x) => x.id === editingId);

    if (!k) {
      alert('Karyawan tidak ditemukan!');
      closeEdit();
      return;
    }

    const oldId = k.id;

    /* --- Validasi ID baru --- */
    const idEl = document.getElementById('editIdKaryawan');
    const newId = (idEl?.value || '').trim();

    if (!newId) {
      alert('ID Karyawan wajib diisi!');
      idEl?.focus();
      return;
    }

    if (newId !== oldId) {
      const duplicate = list.some(
        (x) => x.id !== oldId && x.id.toLowerCase() === newId.toLowerCase()
      );
      if (duplicate) {
        alert('ID sudah digunakan oleh karyawan lain!');
        idEl.focus();
        return;
      }
    }

    /* --- Validasi Nama --- */
    const namaEl = document.getElementById('editNama');
    const nama = (namaEl.value || '').trim();

    if (!nama) {
      alert('Nama wajib diisi!');
      namaEl.focus();
      return;
    }

    /* --- Terapkan perubahan ID + sinkron referensi --- */
    if (newId !== oldId) {
      k.id = newId;
      reassignReferences(oldId, newId);
    }

    k.nama = nama;
    k.kategori = document.getElementById('editKategori').value || 'Karyawan';
    k.posisi = (document.getElementById('editPosisi').value || '').trim();
    k.bagian = (document.getElementById('editBagian').value || '').trim();
    k.status = document.getElementById('editStatus').value || 'Aktif';

    Storage.save();

    closeEdit();
    render();
    refreshLain();
  }

  /* ------------------------------------------------------------
     [6] CRUD UTAMA — tambah / hapus / cari
     ------------------------------------------------------------ */
  function tambah() {
    const namaEl = document.getElementById('nama');
    const idEl = document.getElementById('idKaryawan');
    const kategoriEl = document.getElementById('kategori');
    const posisiEl = document.getElementById('posisi');
    const bagianEl = document.getElementById('bagian');
    const statusEl = document.getElementById('status');

    const nama = namaEl.value.trim();
    let id = idEl.value.trim();
    const kategori = kategoriEl.value || 'Karyawan';
    const posisi = (posisiEl.value || '').trim();
    const bagian = (bagianEl.value || '').trim();
    const status = statusEl.value || 'Aktif';

    if (!nama) {
      alert('Nama wajib diisi!');
      namaEl.focus();
      return;
    }

    // ID default mengikuti kategori (K/T/... dari nama jenis kartu)
    if (!id) id = nextDefaultId(kategori);

    const list = Storage.getKaryawan();
    if (list.some((k) => k.id === id)) {
      alert('ID sudah digunakan!');
      idEl.focus();
      return;
    }

    list.push({
      id,
      nama,
      kategori,
      posisi,
      bagian,
      status,
      absen: false,
      makan: false,
    });
    Storage.save();

    closeForm();

    render();
    refreshLain();
  }

  function hapus(id) {
    const targetId = id || editingId;
    if (!targetId) return;

    if (!confirm('Hapus karyawan ini? Tindakan tidak dapat dibatalkan.')) return;

    Storage.setKaryawan(Storage.getKaryawan().filter((k) => k.id !== targetId));
    Storage.save();

    if (editingId === targetId) closeEdit();

    render();
    refreshLain();
  }

  function cari(id) {
    if (id === undefined || id === null) return null;
    const key = String(id).trim();
    if (!key) return null;
    return Storage.getKaryawan().find((k) => k.id === key) || null;
  }

  /* ------------------------------------------------------------
     [7] HELPER — badge status
     ------------------------------------------------------------ */
  function statusBadgeClass(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'aktif') return 'badge-ok';
    if (s === 'non-aktif' || s === 'nonaktif') return 'badge-danger';
    return 'badge-muted';
  }

  /* ------------------------------------------------------------
     [7.b] HELPER — prefix ID berdasarkan nama kategori
       "Kartu Karyawan"   → K
       "Kartu Tamu"       → T
       "Kartu Supervisor" → S
       "Karyawan"         → K
       "Tamu"             → T
     ------------------------------------------------------------ */
  function idPrefixFromKategori(kategori) {
    const s = String(kategori || '').trim();
    if (!s) return 'K';

    const upper = s.toUpperCase();
    if (upper.includes('TAMU')) return 'T';
    if (upper.includes('KARYAWAN')) return 'K';

    const words = s.split(/\s+/).filter((w) => w.toLowerCase() !== 'kartu');
    const source = words.length > 0 ? words[words.length - 1] : s;
    const letter = source.charAt(0).toUpperCase();

    return /[A-Z]/.test(letter) ? letter : 'K';
  }

  /* ------------------------------------------------------------
     [7.c] HELPER — generate ID default untuk TAMBAH
     Slot kosong diisi lebih dulu (gap-filling).
     ------------------------------------------------------------ */
  function nextDefaultId(kategori) {
    const prefix = idPrefixFromKategori(kategori);

    const existing = new Set(
      Storage.getKaryawan().map((k) => String(k.id || '').toUpperCase())
    );

    let n = 1;
    while (existing.has(prefix + String(n).padStart(4, '0'))) {
      n += 1;
    }
    return prefix + String(n).padStart(4, '0');
  }

  /* ------------------------------------------------------------
     [7.d] HELPER — generate ID default untuk EDIT
     Sama seperti nextDefaultId, tapi mengecualikan record yang
     sedang diedit agar ID lama bisa dipakai ulang saat kategori
     dikembalikan ke semula.
     ------------------------------------------------------------ */
  function nextDefaultIdExcluding(kategori, excludeId) {
    const prefix = idPrefixFromKategori(kategori);
    const exclude = String(excludeId || '').toUpperCase();

    const existing = new Set(
      Storage.getKaryawan()
        .map((k) => String(k.id || '').toUpperCase())
        .filter((id) => id !== exclude)
    );

    let n = 1;
    while (existing.has(prefix + String(n).padStart(4, '0'))) {
      n += 1;
    }
    return prefix + String(n).padStart(4, '0');
  }

  /* ------------------------------------------------------------
     [7.e] HELPER — sinkronisasi referensi ID karyawan
     Dipakai saat ID karyawan diubah lewat modal Edit.
     ------------------------------------------------------------ */
  function reassignReferences(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return false;

    let changed = false;

    const fixArray = (arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((r) => {
        if (r && r.karyawanId === oldId) {
          r.karyawanId = newId;
          changed = true;
        }
      });
    };

    try {
      if (typeof Storage.getReservasi === 'function') {
        fixArray(Storage.getReservasi());
      }
      if (typeof Storage.getReservasiManual === 'function') {
        fixArray(Storage.getReservasiManual());
      }
      if (typeof Storage.getReservasiArchive === 'function') {
        fixArray(Storage.getReservasiArchive());
      }
      if (typeof Storage.getOvertime === 'function') {
        fixArray(Storage.getOvertime());
      }
    } catch (err) {
      console.warn('Karyawan: gagal menyinkronkan referensi ID', err);
    }

    return changed;
  }

  /* ------------------------------------------------------------
     [8] RENDER TABEL
     ------------------------------------------------------------ */
  function render() {
    const tbody = document.querySelector('#tabelKaryawan tbody');
    if (!tbody) return;

    bindEvents(tbody);
    updateSortIndicator();

    const keyword = (document.getElementById('searchKaryawan')?.value || '')
      .trim()
      .toLowerCase();

    let list = Storage.getKaryawan().filter((k) => {
      if (!keyword) return true;
      const nama = String(k.nama || '').toLowerCase();
      const id = String(k.id || '').toLowerCase();
      return nama.includes(keyword) || id.includes(keyword);
    });

    list = sortList(list);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-row">${
        keyword ? 'Karyawan tidak ditemukan.' : 'Belum ada karyawan.'
      }</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map(
        (k, i) => `
        <tr>
          <td class="cell-no">${i + 1}</td>
          <td>${escapeHtml(k.id)}</td>
          <td>${escapeHtml(k.nama)}</td>
          <td>${escapeHtml(k.posisi || '-')}</td>
          <td>${escapeHtml(k.bagian || '-')}</td>
          <td>${escapeHtml(k.kategori)}</td>
          <td><span class="badge ${statusBadgeClass(k.status)}">${escapeHtml(
            k.status || '-'
          )}</span></td>
          <td>
            <button type="button" class="btn btn-primary btn-sm" data-edit="${escapeHtml(
              k.id
            )}">Edit</button>
          </td>
        </tr>`
      )
      .join('');
  }

  /* ------------------------------------------------------------
     [9] EVENT BINDING
     ------------------------------------------------------------ */
  function bindEvents(tbody) {
    if (bound) return;

    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-edit]');
      if (!btn) return;
      openEdit(btn.dataset.edit);
    });

    const thead = document.querySelector('#tabelKaryawan thead');
    if (thead) {
      thead.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;
        setSort(th.dataset.sort);
      });
    }

    bound = true;
  }

  /* ------------------------------------------------------------
     [10] REFRESH PANEL LAIN — sinkronisasi UI
     ------------------------------------------------------------ */
  function refreshLain() {
    if (typeof Dashboard !== 'undefined') Dashboard.render();

    const isActive = (id) =>
      document.getElementById(id)?.classList.contains('active');

    if (typeof QRCodeCard !== 'undefined' && isActive('panel-kartu')) {
      QRCodeCard.render();
    }
    if (typeof Foto !== 'undefined' && isActive('panel-foto')) {
      Foto.render();
    }
    if (typeof Reservasi !== 'undefined' && isActive('panel-reservasi')) {
      Reservasi.render();
    }
    if (
      typeof ReservasiOvertime !== 'undefined' &&
      isActive('panel-reservasi-overtime')
    ) {
      ReservasiOvertime.render();
    }
    if (
      typeof ReleaseReservasi !== 'undefined' &&
      isActive('panel-release-reservasi')
    ) {
      ReleaseReservasi.render();
    }
  }

  /* ------------------------------------------------------------
     [11] EXPORT API
     ------------------------------------------------------------ */
  return {
    tambah,
    hapus,
    cari,
    render,
    openForm,
    closeForm,
    toggleForm,
    openEdit,
    closeEdit,
    simpanEdit,
    setSort,
    fillKategoriOptions,
    // Helper di-expose agar bisa dipakai modul lain jika perlu
    idPrefixFromKategori,
    nextDefaultId,
  };
})();