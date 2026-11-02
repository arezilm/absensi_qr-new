const Foto = (() => {
  const { escapeHtml } = Utils;

  /* ------------------------------------------------------------
     [1] KONSTANTA — kompresi gambar
     ------------------------------------------------------------ */
  const MAX_SIZE = 320;
  const JPEG_QUALITY = 0.8;

  /* ------------------------------------------------------------
     [2] STATE MODUL
     ------------------------------------------------------------ */
  let bound = false;
  let editingId = null;
  const sortConfig = { field: 'nama', direction: 'asc' };

  /* ------------------------------------------------------------
     [3] RENDER TABEL
     ------------------------------------------------------------ */
  function render() {
    const tbody = document.querySelector('#tabelFoto tbody');
    if (!tbody) return;

    bind(tbody);
    Utils.updateSortIndicator('#tabelFoto', sortConfig);

    const keyword = (document.getElementById('searchFoto')?.value || '')
      .trim()
      .toLowerCase();

    let list = Storage.getKaryawan().filter((k) => {
      if (!keyword) return true;
      const nama = String(k.nama || '').toLowerCase();
      const id = String(k.id || '').toLowerCase();
      return nama.includes(keyword) || id.includes(keyword);
    });

    list = Utils.sortBy(list, sortConfig.field, sortConfig.direction);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row">${
        keyword
          ? 'Data tidak ditemukan.'
          : 'Belum ada karyawan. Tambahkan dulu di menu Master Data → Karyawan.'
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
          <td class="cell-foto">
            ${
              k.foto
                ? `<img src="${escapeHtml(k.foto)}" alt="Foto ${escapeHtml(
                    k.nama
                  )}" class="foto-thumb" />`
                : '<span class="foto-empty">Belum ada foto</span>'
            }
          </td>
          <td>${escapeHtml(k.bagian || '-')}</td>
          <td class="cell-aksi">
            <button type="button" class="btn btn-primary btn-sm" data-foto-edit="${escapeHtml(
              k.id
            )}">Edit</button>
          </td>
        </tr>`
      )
      .join('');
  }

  /* ------------------------------------------------------------
     [4] MODAL EDIT — buka / tutup / preview
     ------------------------------------------------------------ */
  function openEdit(id) {
    const k = cari(id);
    if (!k) {
      alert('Data karyawan tidak ditemukan.');
      return;
    }

    editingId = k.id;

    const namaEl = document.getElementById('fotoModalNama');
    const idEl = document.getElementById('fotoModalId');
    if (namaEl) namaEl.textContent = k.nama || '-';
    if (idEl) idEl.textContent = k.id || '-';

    updatePreview(k);

    const modal = document.getElementById('modalEditFoto');
    if (!modal) return;

    modal.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeEdit() {
    const modal = document.getElementById('modalEditFoto');
    if (modal) modal.hidden = true;

    document.body.classList.remove('modal-open');
    editingId = null;

    const input = document.getElementById('fotoModalInput');
    if (input) input.value = '';
  }

  function updatePreview(k) {
    const preview = document.getElementById('fotoModalPreview');
    const btnHapus = document.getElementById('btnHapusFotoModal');
    if (!preview) return;

    if (k && k.foto) {
      preview.innerHTML = `<img src="${escapeHtml(k.foto)}" alt="${escapeHtml(
        k.nama || ''
      )}" />`;
      if (btnHapus) btnHapus.disabled = false;
    } else {
      preview.innerHTML = '<span class="foto-modal-empty">Belum ada foto</span>';
      if (btnHapus) btnHapus.disabled = true;
    }
  }

  /* ------------------------------------------------------------
     [5] CRUD FOTO — upload & hapus
     ------------------------------------------------------------ */
  function uploadDariModal(file) {
    if (!editingId) {
      alert('Tidak ada karyawan yang sedang diedit.');
      return;
    }

    if (!file || !file.type.startsWith('image/')) {
      alert('File harus berupa gambar.');
      return;
    }

    const targetId = editingId;

    const preview = document.getElementById('fotoModalPreview');
    if (preview) {
      preview.innerHTML =
        '<span class="foto-modal-empty">Memproses foto...</span>';
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        compress(reader.result, (dataUrl) => {
          const k = cari(targetId);
          if (!k) return;

          k.foto = dataUrl;
          Storage.save();

          if (editingId === targetId) {
            updatePreview(k);
          }

          render();

          if (
            typeof QRCodeCard !== 'undefined' &&
            document.getElementById('panel-kartu')?.classList.contains('active')
          ) {
            QRCodeCard.render();
          }
        });
      } catch (err) {
        console.error('Foto: gagal proses gambar', err);
        alert('Gagal memproses gambar. Silakan coba lagi.');
        if (editingId === targetId) updatePreview(cari(targetId));
      }
    };

    reader.onerror = () => {
      console.error('Foto: FileReader error', reader.error);
      alert('Gagal membaca file gambar. Pastikan file tidak rusak.');
      if (editingId === targetId) updatePreview(cari(targetId));
    };

    try {
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Foto: readAsDataURL throw', err);
      alert('Gagal membaca file gambar.');
      if (editingId === targetId) updatePreview(cari(targetId));
    }
  }

  function hapusFoto() {
    if (!editingId) return;
    if (!confirm('Hapus foto karyawan ini?')) return;

    const k = cari(editingId);
    if (!k) return;

    delete k.foto;
    Storage.save();

    updatePreview(k);
    render();

    if (
      typeof QRCodeCard !== 'undefined' &&
      document.getElementById('panel-kartu')?.classList.contains('active')
    ) {
      QRCodeCard.render();
    }
  }

  /* ------------------------------------------------------------
     [6] EVENT BINDING
     ------------------------------------------------------------ */
  function bind(tbody) {
    if (bound) return;

    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-foto-edit]');
      if (!btn) return;
      openEdit(btn.dataset.fotoEdit);
    });

    Utils.bindSortHeader('#tabelFoto', sortConfig, render);

    bound = true;
  }

  /* ------------------------------------------------------------
     [7] HELPER — cari karyawan & compress gambar
     ------------------------------------------------------------ */
  function cari(id) {
    if (!id) return null;
    return Storage.getKaryawan().find((k) => k.id === id) || null;
  }

  function compress(dataUrl, callback) {
    const img = new Image();

    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_SIZE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          callback(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);

        try {
          callback(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        } catch (err) {
          console.warn('Foto: toDataURL gagal, pakai gambar asli', err);
          callback(dataUrl);
        }
      } catch (err) {
        console.error('Foto: compress error', err);
        callback(dataUrl);
      }
    };

    img.onerror = (err) => {
      console.error('Foto: image load error', err);
      callback(dataUrl);
    };

    img.src = dataUrl;
  }

  /* ------------------------------------------------------------
     [8] EXPORT API
     ------------------------------------------------------------ */
  return { render, openEdit, closeEdit, uploadDariModal, hapusFoto };
})();