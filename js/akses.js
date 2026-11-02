/* ============================================================
   AKSES — penerapan hak akses per menu & per aksi
   ------------------------------------------------------------
   Data izin berasal dari Kelola User (user.permissions):
     { karyawan: { lihat: true, edit: true }, presensi: { lihat: true }, ... }
   - Admin  : otomatis semua akses.
   - User   : hanya yang dicentang. Aksi apa pun (edit/hapus/cetak/
              pakai) otomatis mengizinkan "lihat" menu tersebut.
   ============================================================ */
const Akses = (() => {

  /* ------------------------------------------------------------
     [1] PETA TAB → MENU IZIN
     ------------------------------------------------------------ */
  const TAB_MENU = {
    dashboard:            'dashboard',
    karyawan:             'karyawan',
    foto:                 'foto',
    kartu:                'kartu',
    'jenis-kartu':        'jenisKartu',
    reservasi:            'reservasi',
    'reservasi-overtime': 'overtime',
    'release-reservasi':  'release',
    presensi:             'presensi',
  };

  // Urutan prioritas tab saat mencari halaman pertama yang boleh dibuka
  const TAB_ORDER = [
    'dashboard', 'karyawan', 'foto', 'kartu', 'jenis-kartu',
    'reservasi', 'reservasi-overtime', 'release-reservasi', 'presensi',
  ];

  /* ------------------------------------------------------------
     [2] ATURAN AKSI
         selectors : tombol/elemen yang disembunyikan & diblokir klik
         forms     : id form yang diblokir submit-nya
         changes   : id input yang diblokir event change-nya
         closest   : [selector, ancestor] → sembunyikan ancestor
     ------------------------------------------------------------ */
  const RULES = [
    {
      menu: 'karyawan', action: 'edit', label: 'mengubah data karyawan',
      selectors: ['#btnTambahKaryawan', 'button[data-edit]', '#btnHapusKaryawan'],
      forms: ['formKaryawan', 'formEditKaryawan'],
    },
    {
      menu: 'foto', action: 'edit', label: 'mengubah foto karyawan',
      selectors: ['button[data-foto-edit]', '#btnHapusFotoModal', 'label[for="fotoModalInput"]'],
      changes: ['fotoModalInput'],
    },
    {
      menu: 'kartu', action: 'cetak', label: 'mencetak kartu',
      selectors: ['#btnCetakKartu', '#btnPrint'],
    },
    {
      menu: 'jenisKartu', action: 'edit', label: 'mengubah jenis kartu',
      selectors: ['#btnTambahJenisKartu', 'button[data-jk-edit]', '#btnHapusJenisKartu'],
      forms: ['formJenisKartu', 'formEditJenisKartu'],
    },
    {
      menu: 'reservasi', action: 'edit', label: 'mengubah reservasi',
      selectors: ['#btnTambahReservasi', 'button[data-rv-release]'],
      forms: ['formTambahReservasi'],
    },
    {
      menu: 'overtime', action: 'edit', label: 'mengubah overtime',
      selectors: ['button[data-ot-edit]', '#btnHapusOvertime'],
      forms: ['formOvertime', 'formEditOvertime'],
      closest: [['#formOvertime', '.form-card']],
    },
    {
      menu: 'release', action: 'edit', label: 'mengubah release reservasi',
      selectors: ['button[data-edit-release]'],
      forms: ['formEditReleaseReservasi'],
    },
    {
      menu: 'presensi', action: 'hapus', label: 'menghapus presensi',
      selectors: ['button[data-presensi-hapus]'],
    },
    {
      menu: 'scanner', action: 'pakai', label: 'memakai scanner QR',
      selectors: ['[data-scan-start]', '[data-scan-stop]'],
      closest: [['#reader', '.mb-16']],
    },
  ];

  /* ------------------------------------------------------------
     [3] CEK IZIN
     ------------------------------------------------------------ */
  function perms() {
    const p = Auth.getUser()?.permissions;
    return p && typeof p === 'object' ? p : {};
  }

  function isAdmin() {
    return Auth.getUser()?.role === 'admin';
  }

  function can(menu, action) {
    if (isAdmin()) return true;
    const m = perms()[menu];
    if (!m || typeof m !== 'object') return false;
    if (action === 'lihat') {
      // aksi apa pun mengimplikasikan boleh melihat
      return Object.values(m).some((v) => v === true);
    }
    return m[action] === true;
  }

  function canOpenTab(tab) {
    if (tab === 'kelola-user') return isAdmin();
    if (!TAB_MENU[tab]) return false;
    if (tab === 'dashboard') {
      // Dashboard juga terbuka bagi yang hanya boleh memakai scanner
      return can('dashboard', 'lihat') || can('scanner', 'pakai');
    }
    return can(TAB_MENU[tab], 'lihat');
  }

  function firstAllowedTab() {
    return TAB_ORDER.find(canOpenTab) || (isAdmin() ? 'kelola-user' : null);
  }

  /* ------------------------------------------------------------
     [4] TERAPKAN KE TAMPILAN (sidebar, tombol, kartu)
     ------------------------------------------------------------ */
  function setDisplay(el, hidden) {
    if (el) el.style.display = hidden ? 'none' : '';
  }

  function apply() {
    // --- Sidebar: tombol dashboard & sub menu ---
    const navDash = document.querySelector('.nav-item[data-tab="dashboard"]');
    setDisplay(navDash, !canOpenTab('dashboard'));

    document.querySelectorAll('.nav-subitem[data-tab]').forEach((btn) => {
      const tab = btn.dataset.tab;
      if (tab === 'kelola-user') return; // diatur main.js berdasarkan role
      setDisplay(btn, !canOpenTab(tab));
    });

    // Sembunyikan grup menu jika semua sub menunya tersembunyi
    document.querySelectorAll('.nav-group').forEach((group) => {
      if (group.id === 'navPengaturanGroup') return;
      const subs = group.querySelectorAll('.nav-subitem');
      if (subs.length === 0) return;
      const adaTampil = Array.from(subs).some((s) => s.style.display !== 'none');
      setDisplay(group, !adaTampil);
    });

    // --- Dashboard: statistik hanya untuk yang boleh melihat ---
    const dashGrid = document.querySelector('#panel-dashboard .dash-grid');
    setDisplay(dashGrid, !can('dashboard', 'lihat'));

    // --- Aksi: sembunyikan tombol lewat CSS (juga untuk baris dinamis) ---
    let css = '';
    RULES.forEach((rule) => {
      const boleh = can(rule.menu, rule.action);

      (rule.closest || []).forEach(([sel, anc]) => {
        const el = document.querySelector(sel);
        setDisplay(el ? el.closest(anc) : null, !boleh);
      });

      if (!boleh) {
        css += `${rule.selectors.join(',')}{display:none !important;}\n`;
      }
    });

    let style = document.getElementById('aksesStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'aksesStyle';
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  /* ------------------------------------------------------------
     [5] GUARD — blokir aksi walau tombol terpicu lewat cara lain
     ------------------------------------------------------------ */
  function tolak(rule) {
    alert(`Anda tidak memiliki hak akses untuk ${rule.label}.`);
  }

  function findRuleBySelector(target) {
    for (const rule of RULES) {
      if (can(rule.menu, rule.action)) continue;
      if (rule.selectors.some((sel) => target.closest(sel))) return rule;
    }
    return null;
  }

  function findRuleByForm(id, key) {
    return RULES.find(
      (r) => !can(r.menu, r.action) && (r[key] || []).includes(id)
    );
  }

  document.addEventListener(
    'click',
    (e) => {
      if (!(e.target instanceof Element)) return;
      const rule = findRuleBySelector(e.target);
      if (!rule) return;
      e.preventDefault();
      e.stopPropagation();
      tolak(rule);
    },
    true
  );

  document.addEventListener(
    'submit',
    (e) => {
      const id = e.target && e.target.id;
      const rule = id && findRuleByForm(id, 'forms');
      if (!rule) return;
      e.preventDefault();
      e.stopPropagation();
      tolak(rule);
    },
    true
  );

  document.addEventListener(
    'change',
    (e) => {
      const id = e.target && e.target.id;
      const rule = id && findRuleByForm(id, 'changes');
      if (!rule) return;
      e.stopPropagation();
      if (e.target.value !== undefined) e.target.value = '';
      tolak(rule);
    },
    true
  );

  return { can, canOpenTab, firstAllowedTab, apply, isAdmin };
})();