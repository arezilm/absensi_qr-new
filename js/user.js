const User = (() => {
  const { escapeHtml } = Utils;

  let bound = false;
  let editingId = null;
  let cachedUsers = [];

  async function render() {
    const tbody = document.querySelector('#tabelUser tbody');
    if (!tbody) return;

    bindEvents(tbody);

    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Memuat data...</td></tr>`;

    try {
      const res = await fetch('api.php?action=get_users');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Gagal memuat data');

      cachedUsers = data.users;

      const keyword = (document.getElementById('searchUser')?.value || '').toLowerCase().trim();
      const users = cachedUsers.filter(u => {
        if (!keyword) return true;
        return u.username.toLowerCase().includes(keyword) || u.name.toLowerCase().includes(keyword);
      });

      if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Tidak ada user.</td></tr>`;
        return;
      }

      tbody.innerHTML = users.map((u, i) => {
        const status = u.is_active == 1 
          ? '<span class="badge badge-ok">Aktif</span>' 
          : '<span class="badge badge-danger">Non-Aktif</span>';
        const role = u.role === 'admin' 
          ? '<span class="badge badge-info" style="background:#e0e7ff;color:#3730a3;">admin</span>' 
          : '<span class="badge badge-muted">user</span>';

        return `
          <tr>
            <td class="cell-no">${i + 1}</td>
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(u.name)}</td>
            <td>${role}</td>
            <td>${status}</td>
            <td>
              <button type="button" class="btn btn-primary btn-sm" data-user-edit="${u.id}">Edit</button>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row text-red">Gagal memuat data.</td></tr>`;
    }
  }

  function bindEvents(tbody) {
    if (bound) return;
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-user-edit]');
      if (!btn) return;
      
      const id = btn.dataset.userEdit;
      const user = cachedUsers.find(u => u.id == id);
      if (user) openForm(user);
    });
    bound = true;
  }

  function openForm(user = null) {
    const modal = document.getElementById('modalUser');
    if (!modal) return;

    const titleEl = document.getElementById('modalUserTitle');
    const idEl = document.getElementById('userId');
    const unEl = document.getElementById('userUsername');
    const nmEl = document.getElementById('userFullName'); // FIX: Menggunakan ID yang benar
    const pwEl = document.getElementById('userPassword');
    const roleEl = document.getElementById('userRole');
    const actEl = document.getElementById('userActive');
    const btnHapus = document.getElementById('btnHapusUser');
    const reqPass = document.getElementById('reqPass');

    document.querySelectorAll('.permission-row input[type="checkbox"]').forEach(cb => cb.checked = false);

    if (user) {
      editingId = user.id;
      titleEl.textContent = 'Edit User';
      idEl.value = user.id;
      unEl.value = user.username;
      nmEl.value = user.name; // FIX
      pwEl.value = ''; 
      pwEl.required = false;
      reqPass.style.display = 'none';
      roleEl.value = user.role;
      actEl.checked = user.is_active == 1;
      btnHapus.style.display = 'inline-block';

      if (user.permissions) {
        const perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
        document.querySelectorAll('.permission-row input[type="checkbox"]').forEach(cb => {
          const menu = cb.dataset.menu;
          const action = cb.dataset.action;
          if (perms[menu] && perms[menu][action]) {
            cb.checked = true;
          }
        });
      }
    } else {
      editingId = null;
      titleEl.textContent = 'Tambah User';
      idEl.value = '';
      unEl.value = '';
      nmEl.value = ''; // FIX
      pwEl.value = '';
      pwEl.required = true;
      reqPass.style.display = 'inline';
      roleEl.value = 'user';
      actEl.checked = true;
      btnHapus.style.display = 'none';
    }

    modal.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeForm() {
    const modal = document.getElementById('modalUser');
    if (modal) modal.hidden = true;
    document.body.classList.remove('modal-open');
    editingId = null;
  }

  async function save(e) {
    e.preventDefault();

    const id = document.getElementById('userId').value;
    const username = document.getElementById('userUsername').value.trim();
    const name = document.getElementById('userFullName').value.trim(); // FIX: Mengambil nilai dengan benar
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;
    const isActive = document.getElementById('userActive').checked ? 1 : 0;

    const permissions = {};
    document.querySelectorAll('.permission-row input[type="checkbox"]').forEach(cb => {
      if (!cb.checked) return;
      const menu = cb.dataset.menu;
      const action = cb.dataset.action;
      if (!permissions[menu]) permissions[menu] = {};
      permissions[menu][action] = true;
    });

    const payload = { id, username, name, password, role, isActive, permissions };

    try {
      const res = await fetch('api.php?action=save_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Gagal menyimpan');
      
      closeForm();
      render();
    } catch (err) {
      alert(err.message);
    }
  }

  async function hapus() {
    if (!editingId) return;
    if (!confirm('Hapus user ini secara permanen?')) return;

    try {
      const res = await fetch('api.php?action=delete_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      
      closeForm();
      render();
    } catch (err) {
      alert(err.message);
    }
  }

  return { render, openForm, closeForm, save, hapus };
})();