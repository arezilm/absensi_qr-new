(function () {

  const MASTER_TABS    = ['karyawan', 'foto', 'kartu', 'jenis-kartu'];
  const TRANSAKSI_TABS = ['reservasi', 'reservasi-overtime', 'release-reservasi'];
  const PRESENSI_TABS  = ['presensi'];
  const PENGATURAN_TABS = ['kelola-user'];

  const SUBMENUS = [
    { toggle: 'navMasterToggle',    submenu: 'navMasterSubmenu' },
    { toggle: 'navTransaksiToggle', submenu: 'navTransaksiSubmenu' },
    { toggle: 'navPresensiToggle',  submenu: 'navPresensiSubmenu' },
    { toggle: 'navPengaturanToggle', submenu: 'navPengaturanSubmenu' },
  ];

  const TAB_RENDER = {
    dashboard:            () => Dashboard.render(),
    karyawan:             () => Karyawan.render(),
    foto:                 () => Foto.render(),
    kartu:                () => QRCodeCard.render(),
    'jenis-kartu':        () => JenisKartu.render(),
    reservasi:            () => Reservasi.render(),
    'reservasi-overtime': () => ReservasiOvertime.render(),
    'release-reservasi':  () => ReleaseReservasi.render(),
    presensi:             () => Presensi.render(),
    'kelola-user':        () => User.render(),
  };

  const TAB_TITLES = {
    dashboard:            'Dashboard',
    karyawan:             'Data Karyawan',
    foto:                 'Foto Karyawan',
    kartu:                'ID Card Karyawan',
    'jenis-kartu':        'Jenis Kartu',
    reservasi:            'Reservasi',
    'reservasi-overtime': 'Edit Reservasi',
    'release-reservasi':  'Release Reservasi',
    presensi:             'Presensi',
    'kelola-user':        'Kelola User',
  };

  let appInitialized = false;

  const TAB_STORAGE_KEY = 'active_tab';

  function saveActiveTab(tab) {
    try { sessionStorage.setItem(TAB_STORAGE_KEY, tab); } catch { /* ignore */ }
  }
  function getSavedTab() {
    try { return sessionStorage.getItem(TAB_STORAGE_KEY) || 'dashboard'; }
    catch { return 'dashboard'; }
  }
  function clearSavedTab() {
    try { sessionStorage.removeItem(TAB_STORAGE_KEY); } catch { /* ignore */ }
  }

  function setSubmenuOpen(toggleId, submenuId, open) {
    const submenu = document.getElementById(submenuId);
    const toggle  = document.getElementById(toggleId);
    if (!submenu || !toggle) return;
    submenu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }
  function closeAllSubmenus() {
    SUBMENUS.forEach(({ toggle, submenu }) => setSubmenuOpen(toggle, submenu, false));
  }

  function updateTopbarTitle(tab) {
    const titleEl = document.getElementById('topbarTitle');
    if (!titleEl) return;
    const text = TAB_TITLES[tab] || 'Dashboard';
    titleEl.textContent = text;
    document.title = `${text} — Absensi & Kupon Makan QR`;
  }

  function activateTab(tab) {
    const user = Auth.getUser();
    // Guard: Jika bukan admin, jangan izinkan akses tab pengaturan
    if (PENGATURAN_TABS.includes(tab) && user?.role !== 'admin') {
      return activateTab(Akses.firstAllowedTab() || 'dashboard');
    }

    // Guard hak akses: tab tanpa izin "lihat" dialihkan ke tab pertama yang boleh
    if (!Akses.canOpenTab(tab)) {
      const fallback = Akses.firstAllowedTab();
      if (fallback && fallback !== tab) return activateTab(fallback);
      if (!fallback) {
        document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
        const titleEl = document.getElementById('topbarTitle');
        if (titleEl) titleEl.textContent = 'Tidak ada hak akses';
        Scanner.stop();
        alert('Akun Anda belum memiliki hak akses ke menu mana pun. Hubungi Admin.');
        return;
      }
    }

    document.querySelectorAll('.nav-item[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.nav-subitem').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `panel-${tab}`);
    });

    const isMaster    = MASTER_TABS.includes(tab);
    const isTransaksi = TRANSAKSI_TABS.includes(tab);
    const isPresensi  = PRESENSI_TABS.includes(tab);
    const isPengaturan = PENGATURAN_TABS.includes(tab);

    document.getElementById('navMasterToggle')?.classList.toggle('active', isMaster);
    document.getElementById('navTransaksiToggle')?.classList.toggle('active', isTransaksi);
    document.getElementById('navPresensiToggle')?.classList.toggle('active', isPresensi);
    document.getElementById('navPengaturanToggle')?.classList.toggle('active', isPengaturan);

    closeAllSubmenus();
    if (isMaster)    setSubmenuOpen('navMasterToggle', 'navMasterSubmenu', true);
    if (isTransaksi) setSubmenuOpen('navTransaksiToggle', 'navTransaksiSubmenu', true);
    if (isPresensi)  setSubmenuOpen('navPresensiToggle', 'navPresensiSubmenu', true);
    if (isPengaturan) setSubmenuOpen('navPengaturanToggle', 'navPengaturanSubmenu', true);

    updateTopbarTitle(tab);

    if (TAB_RENDER[tab]) TAB_RENDER[tab]();

    if (tab !== 'dashboard') Scanner.stop();

    saveActiveTab(tab);
  }

  function initTabs() {
    document.querySelectorAll('.nav-item[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
    document.querySelectorAll('.nav-subitem').forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });

    SUBMENUS.forEach(({ toggle, submenu }) => {
      const btn  = document.getElementById(toggle);
      const menu = document.getElementById(submenu);
      if (!btn || !menu) return;
      btn.addEventListener('click', () => {
        const willOpen = !menu.classList.contains('open');
        closeAllSubmenus();
        setSubmenuOpen(toggle, submenu, willOpen);
      });
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('.nav-group')) return;
      closeAllSubmenus();
    });
  }

  function initSidebarToggle() {
    const btnOpen  = document.getElementById('btnSidebarToggle');
    const btnClose = document.getElementById('btnSidebarClose');
    const backdrop = document.getElementById('sidebarBackdrop');
    const sidebar  = document.getElementById('sidebar');
    const app = document.querySelector('.app');
    if (!app) return;

    const STORAGE_KEY = 'sidebar_collapsed';

    // Mobile = sidebar menjadi drawer (slide dari kiri) yang default-nya tertutup
    const mq = window.matchMedia('(max-width: 768px)');
    const isMobile = () => mq.matches;

    const readStored = () => {
      try { return localStorage.getItem(STORAGE_KEY) === '1'; }
      catch { return false; }
    };

    const setCollapsed = (collapsed, persist) => {
      app.classList.toggle('sidebar-collapsed', collapsed);
      document.body.classList.toggle('sidebar-open-mobile', isMobile() && !collapsed);
      const expanded = String(!collapsed);
      btnOpen?.setAttribute('aria-expanded', expanded);
      btnClose?.setAttribute('aria-expanded', expanded);
      // Preferensi hanya disimpan untuk desktop, supaya state desktop
      // tidak membuat sidebar mobile "terkunci"/tidak bisa dibuka.
      if (persist && !isMobile()) {
        try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
      }
    };

    const applyForViewport = () => setCollapsed(isMobile() ? true : readStored(), false);
    applyForViewport();

    const toggle = () => setCollapsed(!app.classList.contains('sidebar-collapsed'), true);

    btnOpen?.addEventListener('click', toggle);
    btnClose?.addEventListener('click', toggle);
    backdrop?.addEventListener('click', () => setCollapsed(true, false));

    // Mobile: tutup drawer setelah memilih menu
    sidebar?.addEventListener('click', (e) => {
      if (!isMobile()) return;
      if (e.target.closest('.nav-item[data-tab], .nav-subitem')) setCollapsed(true, false);
    });

    // Mobile: tombol Esc menutup drawer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isMobile() && !app.classList.contains('sidebar-collapsed')) {
        setCollapsed(true, false);
      }
    });

    // Ganti ukuran layar / rotasi / simulator mobile → sesuaikan state
    if (mq.addEventListener) mq.addEventListener('change', applyForViewport);
    else if (mq.addListener) mq.addListener(applyForViewport);
  }

  function initModals() {
    const modalMap = {
      modalKaryawan:              () => Karyawan.closeForm(),
      modalEditKaryawan:          () => Karyawan.closeEdit(),
      modalEditFoto:              () => Foto.closeEdit(),
      modalKartuView:             () => QRCodeCard.closeView(),
      modalJenisKartu:            () => JenisKartu.closeForm(),
      modalEditJenisKartu:        () => JenisKartu.closeEdit(),
      modalReservasiDetail:       () => Reservasi.closeView(),
      modalTambahReservasi:       () => Reservasi.closeTambah(),
      modalEditOvertime:          () => ReservasiOvertime.closeEdit(),
      modalEditReleaseReservasi:  () => ReleaseReservasi.closeEdit(),
      modalUser:                  () => User.closeForm(),
    };

    Object.keys(modalMap).forEach((id) => {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target !== modal) return;
        modalMap[id]();
      });
    });

    document.getElementById('btnCloseModalKaryawan')?.addEventListener('click', () => Karyawan.closeForm());
    document.getElementById('btnCloseModalEditKaryawan')?.addEventListener('click', () => Karyawan.closeEdit());
    document.getElementById('btnCloseModalEditFoto')?.addEventListener('click', () => Foto.closeEdit());
    document.getElementById('btnCloseModalKartuView')?.addEventListener('click', () => QRCodeCard.closeView());
    document.getElementById('btnCloseModalJenisKartu')?.addEventListener('click', () => JenisKartu.closeForm());
    document.getElementById('btnCloseModalEditJenisKartu')?.addEventListener('click', () => JenisKartu.closeEdit());
    document.getElementById('btnCloseModalReservasiDetail')?.addEventListener('click', () => Reservasi.closeView());
    document.getElementById('btnCloseModalTambahReservasi')?.addEventListener('click', () => Reservasi.closeTambah());
    document.getElementById('btnCloseModalEditOvertime')?.addEventListener('click', () => ReservasiOvertime.closeEdit());
    document.getElementById('btnCloseModalEditReleaseReservasi')?.addEventListener('click', () => ReleaseReservasi.closeEdit());
    document.getElementById('btnCloseModalUser')?.addEventListener('click', () => User.closeForm());

    document.getElementById('btnBatalReservasiDetail')?.addEventListener('click', () => Reservasi.closeView());
    document.getElementById('btnBatalTambahReservasi')?.addEventListener('click', () => Reservasi.closeTambah());
    document.getElementById('btnBatalEditReleaseReservasi')?.addEventListener('click', () => ReleaseReservasi.closeEdit());
    document.getElementById('btnBatalUser')?.addEventListener('click', () => User.closeForm());

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const checks = [
        ['modalKaryawan',             () => Karyawan.closeForm()],
        ['modalEditKaryawan',         () => Karyawan.closeEdit()],
        ['modalEditFoto',             () => Foto.closeEdit()],
        ['modalKartuView',            () => QRCodeCard.closeView()],
        ['modalJenisKartu',           () => JenisKartu.closeForm()],
        ['modalEditJenisKartu',       () => JenisKartu.closeEdit()],
        ['modalReservasiDetail',      () => Reservasi.closeView()],
        ['modalTambahReservasi',      () => Reservasi.closeTambah()],
        ['modalEditOvertime',         () => ReservasiOvertime.closeEdit()],
        ['modalEditReleaseReservasi', () => ReleaseReservasi.closeEdit()],
        ['modalUser',                 () => User.closeForm()],
      ];
      for (const [id, closeFn] of checks) {
        const m = document.getElementById(id);
        if (m && !m.hidden) { closeFn(); return; }
      }
    });
  }

  function initButtons() {
    document.getElementById('btnHome')?.addEventListener('click', () => {
      activateTab(Akses.canOpenTab('dashboard') ? 'dashboard' : (Akses.firstAllowedTab() || 'dashboard'));
      closeAllSubmenus();
      const app = document.querySelector('.app');
      if (app && !app.classList.contains('sidebar-collapsed')) {
        document.getElementById('btnSidebarClose')?.click();
      }
    });

    // Karyawan
    document.getElementById('formKaryawan')?.addEventListener('submit', (e) => { e.preventDefault(); Karyawan.tambah(); });
    document.getElementById('formEditKaryawan')?.addEventListener('submit', (e) => { e.preventDefault(); Karyawan.simpanEdit(); });
    document.getElementById('searchKaryawan')?.addEventListener('input', () => Karyawan.render());
    document.getElementById('btnTambahKaryawan')?.addEventListener('click', () => Karyawan.openForm());
    document.getElementById('btnBatalKaryawan')?.addEventListener('click', () => Karyawan.closeForm());
    document.getElementById('btnBatalEditKaryawan')?.addEventListener('click', () => Karyawan.closeEdit());
    document.getElementById('btnHapusKaryawan')?.addEventListener('click', () => Karyawan.hapus());

    // Foto
    document.getElementById('searchFoto')?.addEventListener('input', () => Foto.render());
    document.getElementById('btnBatalEditFoto')?.addEventListener('click', () => Foto.closeEdit());
    document.getElementById('btnHapusFotoModal')?.addEventListener('click', () => Foto.hapusFoto());
    document.getElementById('fotoModalInput')?.addEventListener('change', (e) => {
      const input = e.target;
      const file  = input.files && input.files[0];
      if (!file) { input.value = ''; return; }
      try { Foto.uploadDariModal(file); }
      catch (err) {
        console.error('Foto: error saat upload', err);
        alert('Terjadi kesalahan saat memproses foto. Silakan coba lagi.');
      } finally { input.value = ''; }
    });

    // Kartu
    document.getElementById('searchKartu')?.addEventListener('input', () => QRCodeCard.render());
    document.getElementById('btnBatalKartuView')?.addEventListener('click', () => QRCodeCard.closeView());
    document.getElementById('btnCetakKartu')?.addEventListener('click', () => QRCodeCard.printSingle());
    document.getElementById('btnPrint')?.addEventListener('click', () => QRCodeCard.printAll());

    // Jenis Kartu
    document.getElementById('btnTambahJenisKartu')?.addEventListener('click', () => JenisKartu.openForm());
    document.getElementById('formJenisKartu')?.addEventListener('submit', (e) => { e.preventDefault(); JenisKartu.tambah(); });
    document.getElementById('btnBatalJenisKartu')?.addEventListener('click', () => JenisKartu.closeForm());
    document.getElementById('formEditJenisKartu')?.addEventListener('submit', (e) => { e.preventDefault(); JenisKartu.simpanEdit(); });
    document.getElementById('btnBatalEditJenisKartu')?.addEventListener('click', () => JenisKartu.closeEdit());
    document.getElementById('btnHapusJenisKartu')?.addEventListener('click', () => JenisKartu.hapus());

    // Reservasi
    document.getElementById('searchReservasi')?.addEventListener('input', () => Reservasi.render());
    document.getElementById('filterReservasiTanggal')?.addEventListener('input', () => Reservasi.render());
    document.getElementById('btnTambahReservasi')?.addEventListener('click', () => Reservasi.openTambah());
    document.getElementById('formTambahReservasi')?.addEventListener('submit', (e) => { e.preventDefault(); Reservasi.tambah(); });
    document.getElementById('trId')?.addEventListener('input', () => Reservasi.onIdInput());

    // Overtime
    document.getElementById('formOvertime')?.addEventListener('submit', (e) => { e.preventDefault(); ReservasiOvertime.reset(); });
    document.getElementById('otId')?.addEventListener('input', () => ReservasiOvertime.onIdInput());
    document.getElementById('searchOvertime')?.addEventListener('input', () => ReservasiOvertime.render());
    document.getElementById('filterOvertimeTanggal')?.addEventListener('input', () => ReservasiOvertime.render());
    document.getElementById('formEditOvertime')?.addEventListener('submit', (e) => { e.preventDefault(); ReservasiOvertime.simpanEdit(); });
    document.getElementById('btnBatalEditOvertime')?.addEventListener('click', () => ReservasiOvertime.closeEdit());
    document.getElementById('btnHapusOvertime')?.addEventListener('click', () => ReservasiOvertime.hapus());

    // Release Reservasi
    document.getElementById('filterReleaseTanggal')?.addEventListener('input', () => ReleaseReservasi.render());
    document.getElementById('formEditReleaseReservasi')?.addEventListener('submit', (e) => { e.preventDefault(); ReleaseReservasi.simpanEdit(); });

    // Presensi
    document.getElementById('searchPresensi')?.addEventListener('input', () => Presensi.render());
    document.getElementById('filterPresensiTanggal')?.addEventListener('input', () => Presensi.render());

    // Kelola User
    document.getElementById('searchUser')?.addEventListener('input', () => User.render());
    document.getElementById('btnTambahUser')?.addEventListener('click', () => User.openForm());
    document.getElementById('formUser')?.addEventListener('submit', (e) => User.save(e));
    document.getElementById('btnHapusUser')?.addEventListener('click', () => User.hapus());

    // Scanner
    document.querySelectorAll('[data-scan-start]').forEach((btn) => btn.addEventListener('click', () => Scanner.start()));
    document.querySelectorAll('[data-scan-stop]').forEach((btn) => btn.addEventListener('click', () => Scanner.stop()));

    // Logout
    document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
  }

  async function handleLogin(event) {
    event.preventDefault();

    const userEl = document.getElementById('loginUser');
    const passEl = document.getElementById('loginPass');
    const errEl  = document.getElementById('loginError');
    const submitBtn = event.target.querySelector('button[type="submit"]');

    if (errEl) { errEl.textContent = ''; errEl.classList.remove('show'); }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Memuat...'; }

    try {
      const result = await Auth.login(userEl.value, passEl.value);

      if (!result.ok) {
        if (errEl) {
          errEl.textContent = result.error || 'Login gagal.';
          errEl.classList.add('show');
        }
        passEl.value = '';
        passEl.focus();
        return;
      }

      userEl.value = '';
      passEl.value = '';

      try {
        await Storage.init();
      } catch (err) {
        console.error('Storage.init gagal', err);
        Auth.logout();
        Storage.invalidate();
        if (errEl) {
          errEl.textContent =
            'Gagal memuat data dari server. Pastikan MySQL XAMPP berjalan ' +
            'dan database "absensi_qr" sudah di-import.\n\nDetail: ' +
            (err && err.message ? err.message : err);
          errEl.classList.add('show');
        }
        return;
      }

      showApp({ restoreTab: false });
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Masuk'; }
    }
  }

  function handleLogout() {
    if (!confirm('Yakin ingin keluar dari aplikasi?')) return;
    Auth.logout();
    Scanner.stop();
    clearSavedTab();
    Storage.invalidate();
    showLogin();
  }

  function bindLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    form.addEventListener('submit', handleLogin);
    document.getElementById('loginUser')?.focus();
  }

  function showLogin() {
    const loginScreen = document.getElementById('loginScreen');
    const app         = document.querySelector('.app');
    if (loginScreen) loginScreen.classList.add('active');
    if (app) app.classList.remove('visible');
    document.getElementById('loginUser')?.focus();
  }

  function showApp(options = {}) {
    const restoreTab = options.restoreTab !== false;

    const loginScreen = document.getElementById('loginScreen');
    const app         = document.querySelector('.app');
    if (loginScreen) loginScreen.classList.remove('active');
    if (app) app.classList.add('visible');

    const user = Auth.getUser();
    if (user) {
      const nameEl   = document.getElementById('userName');
      const avatarEl = document.getElementById('userAvatar');
      if (nameEl)   nameEl.textContent   = user.name;
      if (avatarEl) avatarEl.textContent = (user.name || 'A').charAt(0).toUpperCase();

      // Tampilkan / sembunyikan menu pengaturan berdasarkan role
      const navPengaturan = document.getElementById('navPengaturanGroup');
      if (navPengaturan) {
        if (user.role === 'admin') {
          navPengaturan.style.display = 'flex';
        } else {
          navPengaturan.style.display = 'none';
        }
      }
    }

    // Terapkan hak akses (sidebar & tombol aksi) sesuai user yang login
    Akses.apply();

    if (!appInitialized) {
      appInitialized = true;
      initTabs();
      initModals();
      initButtons();
      Karyawan.render();
      Dashboard.render();
    }

    if (restoreTab) {
      const savedTab = getSavedTab();
      const validTabs = Object.keys(TAB_TITLES);
      activateTab(validTabs.includes(savedTab) ? savedTab : 'dashboard');
    } else {
      activateTab(Akses.firstAllowedTab() || 'dashboard');
    }
  }

  async function init() {
    bindLoginForm();
    initSidebarToggle();

    if (Auth.isLoggedIn()) {
      try {
        await Storage.init();
      } catch (err) {
        console.error('Storage.init gagal', err);
        alert(
          'Gagal memuat data dari server.\n\n' +
          'Pastikan XAMPP (Apache + MySQL) berjalan dan database "absensi_qr" sudah dibuat.\n\n' +
          'Detail: ' + (err && err.message ? err.message : err)
        );
        Auth.logout();
        Storage.invalidate();
        showLogin();
        return;
      }
      showApp();
    } else {
      showLogin();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('beforeunload', () => Scanner.stop());
})();