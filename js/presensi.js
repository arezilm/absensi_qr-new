const Presensi = (() => {
  const { escapeHtml } = Utils;

  let bound = false;

  /* ------------------------------------------------------------
     [1] HELPER FORMAT
     ------------------------------------------------------------ */
  function formatTanggal(iso) {
    const t = Utils.toLocalISODate(iso);
    if (!t) return '-';
    const [y, m, d] = t.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatJam(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /* ------------------------------------------------------------
     [2] STATUS LEMBUR
         Lembur jika absen pulang tercatat lembur, ATAU karyawan
         punya catatan overtime pada tanggal tersebut (reset
         otomatis dari presensi pulang maupun reset manual).
     ------------------------------------------------------------ */
  function isLembur(p) {
    if (p.lembur) return true;
    return Storage.getOvertime().some(
      (o) =>
        o.karyawanId === p.karyawanId &&
        Utils.toLocalISODate(o.tanggal) === p.tanggal
    );
  }

  /* ------------------------------------------------------------
     [3] RENDER TABEL
     ------------------------------------------------------------ */
  function render() {
    const tbody = document.querySelector('#tabelPresensi tbody');
    if (!tbody) return;

    bindEvents(tbody);

    const keyword = (document.getElementById('searchPresensi')?.value || '')
      .trim()
      .toLowerCase();
    const tglFilter = document.getElementById('filterPresensiTanggal')?.value || '';

    const list = Storage.getPresensi()
      .filter((p) => {
        if (tglFilter && p.tanggal !== tglFilter) return false;
        if (!keyword) return true;
        return (
          String(p.nama || '').toLowerCase().includes(keyword) ||
          String(p.bagian || '').toLowerCase().includes(keyword) ||
          String(p.karyawanId || '').toLowerCase().includes(keyword)
        );
      })
      .slice()
      .sort((a, b) => {
        if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
        return String(b.masukAt || '').localeCompare(String(a.masukAt || ''));
      });

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-row">${
        keyword || tglFilter ? 'Data tidak ditemukan.' : 'Belum ada data presensi.'
      }</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((p, i) => {
        const lembur = isLembur(p);
        return `
        <tr>
          <td class="cell-no">${i + 1}</td>
          <td>${escapeHtml(p.karyawanId || '-')}</td>
          <td>${escapeHtml(p.nama)}</td>
          <td>${escapeHtml(p.bagian || '-')}</td>
          <td>${escapeHtml(formatTanggal(p.tanggal))}</td>
          <td>${escapeHtml(formatJam(p.masukAt))}</td>
          <td>${escapeHtml(formatJam(p.keluarAt))}</td>
          <td>
            <span class="badge ${lembur ? 'badge-warn' : 'badge-muted'}">
              ${lembur ? 'Lembur' : 'Tidak Ada Lembur'}
            </span>
          </td>
          <td>
            <button type="button" class="btn btn-danger btn-sm"
              data-presensi-hapus="${escapeHtml(p.id)}">Hapus</button>
          </td>
        </tr>`;
      })
      .join('');
  }

  /* ------------------------------------------------------------
     [4] HAPUS
     ------------------------------------------------------------ */
  function hapus(id) {
    const p = Storage.getPresensi().find((x) => x.id === id);
    if (!p) return;
    if (!confirm(`Hapus presensi ${p.nama} tanggal ${formatTanggal(p.tanggal)}?`)) return;

    Storage.setPresensi(Storage.getPresensi().filter((x) => x.id !== id));
    Storage.save();
    render();
  }

  /* ------------------------------------------------------------
     [5] EVENT BINDING
     ------------------------------------------------------------ */
  function bindEvents(tbody) {
    if (bound) return;
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-presensi-hapus]');
      if (!btn) return;
      hapus(btn.dataset.presensiHapus);
    });
    bound = true;
  }

  return { render, hapus };
})();