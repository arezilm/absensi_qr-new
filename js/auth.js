const Auth = (() => {

  const SESSION_KEY = 'auth_session';
  const API_URL = 'api.php';

  let currentUser = null;

  function isLoggedIn() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.username) return false;
      currentUser = data;
      return true;
    } catch {
      return false;
    }
  }

  async function login(username, password) {
    const u = String(username || '').trim();
    const p = String(password || '');

    if (!u || !p) {
      return { ok: false, error: 'Username dan password wajib diisi.' };
    }

    let res;
    try {
      res = await fetch(`${API_URL}?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });
    } catch (err) {
      console.error('Auth: network error', err);
      return {
        ok: false,
        error: 'Tidak dapat menghubungi server. Pastikan Apache + MySQL XAMPP berjalan.',
      };
    }

    let data = {};
    try {
      data = await res.json();
    } catch { /* ignore */ }

    if (!res.ok || !data.ok || !data.user) {
      const msg = (data && data.error) || `Login gagal (HTTP ${res.status}).`;
      return { ok: false, error: msg };
    }

    // Simpan info role & permissions
    currentUser = { 
      id: data.user.id,
      username: data.user.username, 
      name: data.user.name,
      role: data.user.role || 'user',
      permissions: data.user.permissions || {}
    };
    
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    } catch (err) {
      console.warn('Auth: gagal menyimpan sesi', err);
    }
    return { ok: true, user: currentUser };
  }

  function logout() {
    // Akhiri sesi PHP (abaikan jika gagal)
    try { fetch(`${API_URL}?action=logout`, { method: 'POST' }).catch(() => {}); } catch { /* ignore */ }
    currentUser = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }

  function getUser() {
    return currentUser;
  }

  return { isLoggedIn, login, logout, getUser };
})();