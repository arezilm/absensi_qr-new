const QRCodeCard = (() => {
  const { escapeHtml } = Utils;

  /* ------------------------------------------------------------
     [1] KONSTANTA & STATE
     ------------------------------------------------------------ */
  const QR_RENDER_SIZE = 220;

  let bound = false;
  let searchBound = false;
  let viewingId = null;
  const sortConfig = { field: 'nama', direction: 'asc' };

  /* ------------------------------------------------------------
     [2] HELPER — badge status (konsisten dengan Karyawan)
     ------------------------------------------------------------ */
  function statusBadgeClass(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'aktif') return 'badge-ok';
    if (s === 'non-aktif' || s === 'nonaktif') return 'badge-danger';
    return 'badge-muted';
  }

  /* ------------------------------------------------------------
     [3] RENDER TABEL
     ------------------------------------------------------------ */
  function render() {
    const tbody = document.querySelector('#tabelKartu tbody');
    if (!tbody) return;

    bindEvents(tbody);
    bindSearch();
    Utils.updateSortIndicator('#tabelKartu', sortConfig);

    const keyword = (document.getElementById('searchKartu')?.value || '')
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
      .map((k, i) => {
        const sudahCetak = !!k.kartuCetak;
        const statusText = k.status || '-';

        return `
        <tr>
          <td class="cell-no">${i + 1}</td>
          <td>${escapeHtml(k.id)}</td>
          <td>${escapeHtml(k.nama)}</td>
          <td>
            <span class="badge ${statusBadgeClass(statusText)}">
              ${escapeHtml(statusText)}
            </span>
          </td>
          <td>
            <span class="badge ${sudahCetak ? 'badge-ok' : 'badge-muted'}">
              ${sudahCetak ? 'Sudah Cetak' : 'Belum Cetak'}
            </span>
          </td>
          <td>
            <button type="button" class="btn btn-primary btn-sm"
              data-kartu-view="${escapeHtml(k.id)}">View</button>
          </td>
        </tr>`;
      })
      .join('');
  }

  /* ------------------------------------------------------------
     [4] EVENT BINDING
     ------------------------------------------------------------ */
  function bindEvents(tbody) {
    if (bound) return;
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-kartu-view]');
      if (!btn) return;
      openView(btn.dataset.kartuView);
    });
    Utils.bindSortHeader('#tabelKartu', sortConfig, render);
    bound = true;
  }

  function bindSearch() {
    if (searchBound) return;
    const input = document.getElementById('searchKartu');
    if (!input) return;
    input.addEventListener('input', render);
    searchBound = true;
  }

  /* ------------------------------------------------------------
     [5] MODAL VIEW — tampilkan kartu + generate QR
     ------------------------------------------------------------ */
  function openView(id) {
    const k = Karyawan.cari(id);
    if (!k) {
      alert('Data karyawan tidak ditemukan.');
      return;
    }

    viewingId = k.id;

    const titleEl = document.getElementById('modalKartuViewTitle');
    if (titleEl) titleEl.textContent = `ID Card — ${k.nama}`;

    const container = document.getElementById('kartuViewContainer');
    if (container) {
      container.innerHTML = '';
      container.appendChild(buildCard(k));
    }

    const modal = document.getElementById('modalKartuView');
    if (modal) {
      modal.hidden = false;
      document.body.classList.add('modal-open');
    }

    requestAnimationFrame(() => {
      if (viewingId !== k.id) return;
      const qrDiv = container?.querySelector('.id-card-qr');
      if (qrDiv) generateQR(qrDiv, k.id);
    });
  }

  function closeView() {
    const modal = document.getElementById('modalKartuView');
    if (modal) modal.hidden = true;

    document.body.classList.remove('modal-open');
    viewingId = null;

    const container = document.getElementById('kartuViewContainer');
    if (container) container.innerHTML = '';
  }

  /* ------------------------------------------------------------
     [6] PRINT — single & all
     ------------------------------------------------------------ */
  function printSingle() {
    if (!viewingId) return;
    const k = Karyawan.cari(viewingId);
    if (!k) return;

    printCards([k], () => {
      const list = Storage.getKaryawan();
      const target = list.find((x) => x.id === k.id);
      if (target) {
        target.kartuCetak = true;
        target.kartuCetakAt = new Date().toISOString();
        Storage.save();
      }
      render();
    });
  }

  function printAll() {
    const list = Storage.getKaryawan();
    if (list.length === 0) {
      alert('Belum ada karyawan untuk dicetak.');
      return;
    }

    printCards(list, () => {
      const now = new Date().toISOString();
      Storage.getKaryawan().forEach((k) => {
        k.kartuCetak = true;
        k.kartuCetakAt = now;
      });
      Storage.save();
      render();
    });
  }

  function printCards(list, onDone) {
    const area = document.getElementById('printArea');
    if (!area) return;

    if (typeof QRCode === 'undefined') {
      alert('Library QRCode belum dimuat. Periksa koneksi internet.');
      return;
    }

    if (list.length === 1) area.classList.add('print-single');
    else area.classList.remove('print-single');

    area.innerHTML = '';
    const fragment = document.createDocumentFragment();
    list.forEach((k) => fragment.appendChild(buildCard(k)));
    area.appendChild(fragment);

    area.querySelectorAll('.id-card').forEach((card, i) => {
      const qrDiv = card.querySelector('.id-card-qr');
      const item = list[i];
      if (qrDiv && item) generateQR(qrDiv, item.id);
    });

    setTimeout(() => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('afterprint', finish);
        area.classList.remove('print-single');
        area.innerHTML = '';
        if (onDone) onDone();
      };

      window.addEventListener('afterprint', finish, { once: true });
      window.print();
      setTimeout(finish, 5000);
    }, 300);
  }

  /* ------------------------------------------------------------
     [7] HELPER — generate QR
     ------------------------------------------------------------ */
  function generateQR(container, text) {
    try {
      new QRCode(container, {
        text,
        width: QR_RENDER_SIZE,
        height: QR_RENDER_SIZE,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H,
      });
    } catch (err) {
      console.warn('QRCodeCard: gagal membuat QR', err);
    }
  }

  /* ------------------------------------------------------------
     [8] BUILD SATU KARTU — dipakai view & print
     ------------------------------------------------------------ */
  function buildCard(k) {
    const card = document.createElement('div');
    card.className = 'id-card';
    card.dataset.kategori = k.kategori || 'Karyawan';

    /* Section: foto + nama + role */
    const top = document.createElement('div');
    top.className = 'id-card-top';

    const photoWrap = document.createElement('div');
    photoWrap.className = 'id-card-photo-wrap';
    if (k.foto) {
      const img = document.createElement('img');
      img.src = k.foto;
      img.alt = k.nama;
      photoWrap.appendChild(img);
    } else {
      const initial = document.createElement('span');
      initial.className = 'id-card-initial';
      initial.textContent = (k.nama || '?').trim().charAt(0).toUpperCase();
      photoWrap.appendChild(initial);
    }

    const name = document.createElement('h3');
    name.className = 'id-card-name';
    name.textContent = k.nama || '-';

    const role = document.createElement('p');
    role.className = 'id-card-role';
    role.textContent = k.posisi || k.kategori || 'Karyawan';

    top.append(photoWrap, name, role);

    /* Section: detail + QR + footer */
    const bottom = document.createElement('div');
    bottom.className = 'id-card-bottom';

    const details = document.createElement('div');
    details.className = 'id-card-details';

    const addDetailRow = (label, value) => {
      if (!value) return;
      const row = document.createElement('div');
      row.className = 'id-card-detail-row';

      const l = document.createElement('span');
      l.className = 'id-card-detail-label';
      l.textContent = label;

      const s = document.createElement('span');
      s.className = 'id-card-detail-sep';
      s.textContent = ':';

      const v = document.createElement('span');
      v.className = 'id-card-detail-value';
      v.textContent = value;

      row.append(l, s, v);
      details.appendChild(row);
    };

    addDetailRow('ID No', k.id);
    addDetailRow('Bagian', k.bagian || '-');
    addDetailRow('Kategori', k.kategori || '-');

    const qrWrap = document.createElement('div');
    qrWrap.className = 'id-card-qr';

    const footer = document.createElement('div');
    footer.className = 'id-card-footer';
    footer.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="id-card-footer-icon">
        <rect x="3" y="4" width="18" height="16" rx="2"/>
        <path d="M7 8h10M7 12h10M7 16h6"/>
      </svg>
      <span class="id-card-footer-text">PT. LEUWITEX</span>
    `;

    bottom.append(details, qrWrap, footer);
    card.append(top, bottom);
    return card;
  }

  /* ------------------------------------------------------------
     [9] EXPORT API
     ------------------------------------------------------------ */
  return { render, openView, closeView, printSingle, printAll };
})();