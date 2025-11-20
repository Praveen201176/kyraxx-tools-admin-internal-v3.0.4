const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  token: localStorage.getItem('kyraxx_token') || null,
  timer: null,
};

function setToken(tok) {
  state.token = tok;
  if (tok) localStorage.setItem('kyraxx_token', tok);
  else localStorage.removeItem('kyraxx_token');
}

async function apiGet(path) {
  const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
  const res = await fetch(path, { headers });
  if (res.status === 401) throw new Error('unauthorized');
  return res.json();
}
async function apiPost(path, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  if (res.status === 401) throw new Error('unauthorized');
  return res.json();
}

function renderClients(list) {
  const tbody = $('#clientsTbody');
  tbody.innerHTML = '';
  for (const c of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${c.client_id}</code></td>
      <td>${c.status || ''}</td>
      <td class="muted">${new Date(c.last_seen).toLocaleString()}</td>
      <td>${c.active ? '<span class="pill green">Active</span>' : '<span class="pill red">Idle</span>'}</td>
      <td>
        <button class="danger" data-kill="${c.client_id}">Kill</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
  // wire per-client kill buttons
  $$('button[data-kill]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-kill');
      const message = prompt(`Reason for killing ${id}? (optional)`) || '';
      try {
        await apiPost('/api/kill', { kill_clients: [id], message });
        await refreshKill();
      } catch (e) {
        alert('Action failed. Please login again.');
        showLogin();
      }
    });
  });
}

async function refreshClients() {
  try {
    const data = await apiGet('/api/clients');
    $('#serverTime').textContent = new Date(data.server_time).toLocaleString();
    renderClients(data.clients || []);
  } catch (e) {
    // likely unauthorized
    renderClients([]);
  }
}

async function refreshKill() {
  try {
    const data = await apiGet('/api/kill');
    $('#killDirective').textContent = JSON.stringify(data);
  } catch {
    // ignore
  }
}

function startAutoRefresh() {
  clearInterval(state.timer);
  state.timer = setInterval(async () => {
    await refreshKill();
    await refreshClients();
  }, 5000);
}

async function loadConfigEditor() {
  const editor = $('#configEditor');
  if (!editor) return;
  try {
    const data = await apiGet('/api/config');
    editor.value = JSON.stringify(data, null, 2);
  } catch (e) {
    alert('Failed to load config. Make sure you are logged in.');
  }
}

async function saveConfigEditor() {
  const editor = $('#configEditor');
  if (!editor) return;
  if (!state.token) return showLogin();
  try {
    const parsed = JSON.parse(editor.value || '{}');
    await apiPost('/api/config', parsed);
    alert('Config saved. New clients will pick it up automatically.');
  } catch (e) {
    alert('Failed to save config. Check JSON is valid and you are logged in.');
  }
}

function showLogin() {
  if ($('#loginOverlay')) return;
  const div = document.createElement('div');
  div.id = 'loginOverlay';
  div.innerHTML = `
    <div style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.4); z-index:9999;">
      <div class="card" style="width:360px;">
        <h3 style="margin:0 0 12px 0;">Admin Login</h3>
        <div class="row" style="flex-direction:column; gap:8px;">
          <input id="u" type="text" placeholder="Username" style="padding:10px; border-radius:8px; background:#0f172a; color:#e5e7eb; border:1px solid #1f2937;" />
          <input id="p" type="password" placeholder="Password" style="padding:10px; border-radius:8px; background:#0f172a; color:#e5e7eb; border:1px solid #1f2937;" />
          <button id="loginBtn">Login</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(div);
  $('#loginBtn').addEventListener('click', async () => {
    const username = $('#u').value.trim();
    const password = $('#p').value.trim();
    try {
      const res = await apiPost('/api/login', { username, password }, false);
      setToken(res.token);
      document.body.removeChild(div);
      await refreshKill();
      await refreshClients();
      startAutoRefresh();
    } catch (e) {
      alert('Invalid credentials');
    }
  });
}

function wireHeader() {
  $('#refreshBtn').addEventListener('click', async () => {
    if (!state.token) return showLogin();
    await refreshKill();
    await refreshClients();
  });
  $('#killAllBtn').addEventListener('click', async () => {
    if (!state.token) return showLogin();
    const message = prompt('Reason for killing all? (optional)') || '';
    try {
      await apiPost('/api/kill', { kill_all: true, message });
      await refreshKill();
    } catch {
      showLogin();
    }
  });
  $('#clearKillBtn').addEventListener('click', async () => {
    if (!state.token) return showLogin();
    try {
      await apiPost('/api/kill/clear', {});
      await refreshKill();
    } catch {
      showLogin();
    }
  });
}

function wireConfigEditor() {
  const loadBtn = $('#loadConfigBtn');
  const saveBtn = $('#saveConfigBtn');
  if (loadBtn) {
    loadBtn.addEventListener('click', async () => {
      if (!state.token) return showLogin();
      await loadConfigEditor();
    });
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      await saveConfigEditor();
    });
  }
}

(async function init() {
  wireHeader();
  wireConfigEditor();
  await refreshKill();
  if (state.token) {
    try {
      await refreshClients();
      startAutoRefresh();
    } catch {
      showLogin();
    }
  } else {
    showLogin();
  }
})();
