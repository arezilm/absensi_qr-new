const JenisKartu = (() => {
  const { escapeHtml } = Utils;

  /* ------------------------------------------------------------
     [1] STATE
     ------------------------------------------------------------ */
  let bound = false;
  let searchBound = false;
  let editingId = null;
  const sortConfig = { field: 'id', direction: 'asc' };

  /* ------------------------------------------------------------
     [2] HELPER — generate ID default berurutan JK-01, JK-02
     ------------------------------------------------------------ */
  function nextDefaultId() {
    const existing = new Set(
      Storage.getJenisKartu().map((j) => String(j.id || '').toUpperCase())
    );

    let n = 1;
    while (existing.has('JK-' + String(n).padStart(2, '0'))) {
      n += 1;
    }
    return 'JK-' + String(n).padStart(2, '0');
  }

  /* ------------------------------------------------------------
     [3] MODAL TAMBAH — buka/tutup/reset/tambah
     ------------------------------------------------------------ */
  function openForm() {
    const modal = document.getElementById('modalJenisKartu');
    if (!modal) return;

    resetForm();

    modal.hidden = false;
    document.body.classList.add('modal-open');

    requestAnimationFrame(() => {
      document.getElementById('jkNama')?.focus();
    });
  }

  function closeForm() {
    const modal = document.getElementById('modalJenisKartu');
    if (!modal) return;

    modal.hidden = true;
    document.body.classList.remove('modal-open');
    resetForm();
  }

  function resetForm() {
    const idEl = document.getElementById('jkId');
    const namaEl = document.getElementById('jkNama');
    const ketEl = document.getElementById('jkKeterangan');

    if (idEl) idEl.value = '';
    if (namaEl) namaEl.value = '';
    if (ketEl) ketEl.value = '';
  }

  function tambah() {
    const idEl = document.getElementById('jkId');
    const namaEl = document.getElementById('jkNama');
    const ketEl = document.getElementById('jkKeterangan');

    let id = (idEl.value || '').trim();
    const nama = (namaEl.value || '').trim();
    const keterangan = (ketEl.value || '').trim();

    /* --- Validasi Nama --- */
    if (!nama) {
      alert('Nama jenis kartu wajib diisi!');
      namaEl.focus();
      return;
    }

    const list = Storage.getJenisKartu();

    /* --- Auto-ID jika kosong --- */
    if (!id) id = nextDefaultId();

    /* --- Validasi duplikat ID (case-insensitive) --- */
    if (list.some((j) => String(j.id).toLowerCase() === id.toLowerCase())) {
      alert(`ID "${id}" sudah digunakan oleh jenis kartu lain!`);
      idEl.focus();
      return;
    }

    /* --- Validasi duplikat Nama (case-insensitive) --- */
    if (list.some((j) => String(j.nama).toLowerCase() === nama.toLowerCase())) {
      alert(`Nama jenis kartu "${nama}" sudah ada!`);
      namaEl.focus();
      return;
    }

    // Record baru — tanpa field `warna`
    list.push({ id, nama, keterangan });
    Storage.save();

    closeForm();
    render();
  }

  /* ------------------------------------------------------------
     [4] MODAL EDIT — buka/tutup/simpan
     ------------------------------------------------------------ */
  function openEdit(id) {
    const j = cari(id);
    if (!j) {
      alert('Data jenis kartu tidak ditemukan.');
      return;
    }

    editingId = j.id;

    const setVal = (elId, val) => {
      const el = document.getElementById(elId);
      if (el) el.value = val;
    };

    setVal('editJkId', j.id || '');
    setVal('editJkNama', j.nama || '');
    setVal('editJkKeterangan', j.keterangan || '');

    const modal = document.getElementById('modalEditJenisKartu');
    if (!modal) return;

    modal.hidden = false;
    document.body.classList.add('modal-open');

    requestAnimationFrame(() => {
      document.getElementById('editJkNama')?.focus();
    });
  }

  function closeEdit() {
    const modal = document.getElementById('modalEditJenisKartu');
    if (modal) modal.hidden = true;

    document.body.classList.remove('modal-open');
    editingId = null;
  }

  function simpanEdit() {
    if (!editingId) return;

    const list = Storage.getJenisKartu();
    const j = list.find((x) => x.id === editingId);
    if (!j) {
      alert('Jenis kartu tidak ditemukan!');
      closeEdit();
      return;
    }

    const idEl = document.getElementById('editJkId');
    const newId = (idEl.value || '').trim();

    /* --- Validasi ID wajib isi --- */
    if (!newId) {
      alert('ID wajib diisi!');
      idEl.focus();
      return;
    }

    /* --- Validasi duplikat ID (case-insensitive) --- */
    const duplicateId = list.some(
      (x) => x.id !== j.id && String(x.id).toLowerCase() === newId.toLowerCase()
    );
    if (duplicateId) {
      alert(`ID "${newId}" sudah digunakan oleh jenis kartu lain!`);
      idEl.focus();
      return;
    }

    const namaEl = document.getElementById('editJkNama');
    const nama = (namaEl.value || '').trim();

    /* --- Validasi Nama wajib isi --- */
    if (!nama) {
      alert('Nama wajib diisi!');
      namaEl.focus();
      return;
    }

    /* --- Validasi duplikat Nama (case-insensitive) --- */
    const duplicateNama = list.some(
      (x) => x.id !== j.id && String(x.nama).toLowerCase() === nama.toLowerCase()
    );
    if (duplicateNama) {
      alert(`Nama jenis kartu "${nama}" sudah ada!`);
      namaEl.focus();
      return;
    }

    const oldNama = j.nama;

    j.id = newId;
    j.nama = nama;
    j.keterangan = (document.getElementById('editJkKeterangan').value || '').trim();

    if (oldNama !== nama) {
      Storage.getKaryawan().forEach((k) => {
        if (String(k.kategori || '').toLowerCase() === oldNama.toLowerCase()) {
          k.kategori = nama;
        }
      });
    }

    Storage.save();

    closeEdit();
    render();

    if (
      typeof Karyawan !== 'undefined' &&
      document.getElementById('panel-karyawan')?.classList.contains('active')
    ) {
      Karyawan.render();
    }
  }

  /* ------------------------------------------------------------
     [5] HAPUS — dengan reassign kategori karyawan terdampak
     ------------------------------------------------------------ */
  function hapus(id) {
    const targetId = id || editingId;
    if (!targetId) return;

    const j = cari(targetId);
    if (!j) return;

    const karyawanPakai = Storage.getKaryawan().filter(
      (k) => String(k.kategori || '').toLowerCase() === j.nama.toLowerCase()
    );

    const remaining = Storage.getJenisKartu().filter((jk) => jk.id !== targetId);
    const fallback = remaining.length > 0 ? remaining[0].nama : 'Karyawan';

    let msg = `Hapus jenis kartu "${j.nama}"? Tindakan tidak dapat dibatalkan.`;
    if (karyawanPakai.length > 0) {
      msg =
        `Jenis kartu "${j.nama}" sedang digunakan oleh ${karyawanPakai.length} karyawan.\n\n` +
        `Jika dihapus, kategori karyawan tersebut akan diubah otomatis ` +
        `menjadi "${fallback}".\n\n` +
        `Lanjutkan?`;
    }

    if (!confirm(msg)) return;

    Storage.setJenisKartu(remaining);

    if (karyawanPakai.length > 0) {
      Storage.getKaryawan().forEach((k) => {
        if (String(k.kategori || '').toLowerCase() === j.nama.toLowerCase()) {
          k.kategori = fallback;
        }
      });
    }

    Storage.save();

    if (editingId === targetId) closeEdit();
    render();

    if (typeof Karyawan !== 'undefined') {
      Karyawan.render();
    }
  }

  /* ------------------------------------------------------------
     [6] HELPER — cari by id
     ------------------------------------------------------------ */
  function cari(id) {
    if (id === undefined || id === null) return null;
    const key = String(id).trim();
    if (!key) return null;
    return Storage.getJenisKartu().find((j) => j.id === key) || null;
  }

  /* ------------------------------------------------------------
     [7] RENDER TABEL
     ------------------------------------------------------------ */
  function render() {
    const tbody = document.querySelector('#tabelJenisKartu tbody');
    if (!tbody) return;

    bindEvents(tbody);
    bindSearch();
    Utils.updateSortIndicator('#tabelJenisKartu', sortConfig);

    const keyword = (document.getElementById('searchJenisKartu')?.value || '')
      .trim()
      .toLowerCase();

    let list = Storage.getJenisKartu().filter((j) => {
      if (!keyword) return true;
      const nama = String(j.nama || '').toLowerCase();
      const id = String(j.id || '').toLowerCase();
      const ket = String(j.keterangan || '').toLowerCase();
      return (
        nama.includes(keyword) || id.includes(keyword) || ket.includes(keyword)
      );
    });

    list = Utils.sortBy(list, sortConfig.field, sortConfig.direction);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-row">${
        keyword ? 'Jenis kartu tidak ditemukan.' : 'Belum ada jenis kartu.'
      }</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map(
        (j, i) => `
        <tr>
          <td class="cell-no">${i + 1}</td>
          <td>${escapeHtml(j.id)}</td>
          <td>${escapeHtml(j.nama)}</td>
          <td>${escapeHtml(j.keterangan || '-')}</td>
          <td>
            <button type="button" class="btn btn-primary btn-sm" data-jk-edit="${escapeHtml(
              j.id
            )}">Edit</button>
          </td>
        </tr>`
      )
      .join('');
  }

  /* ------------------------------------------------------------
     [8] EVENT BINDING
     ------------------------------------------------------------ */
  function bindEvents(tbody) {
    if (bound) return;
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-jk-edit]');
      if (!btn) return;
      openEdit(btn.dataset.jkEdit);
    });
    Utils.bindSortHeader('#tabelJenisKartu', sortConfig, render);
    bound = true;
  }

  function bindSearch() {
    if (searchBound) return;
    const input = document.getElementById('searchJenisKartu');
    if (!input) return;
    input.addEventListener('input', render);
    searchBound = true;
  }

  /* ------------------------------------------------------------
     [9] EXPORT API
     ------------------------------------------------------------ */
  return {
    tambah,
    hapus,
    render,
    openForm,
    closeForm,
    openEdit,
    closeEdit,
    simpanEdit,
  };
})();
