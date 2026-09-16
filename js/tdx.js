/* 🔑 交通部 TDX 存取輔助 — 有金鑰走 OAuth2，無金鑰以匿名模式呼叫（每日次數有限） */
(function () {
  const cfg = () => CONAN.config.tdx;
  let token = null;      // { value, expiresAt }

  function loadCreds() {
    try { return JSON.parse(localStorage.getItem(CONAN.config.storageKeys.tdxCreds)) || null; } catch { return null; }
  }

  function saveCreds(id, secret) {
    if (id && secret) {
      localStorage.setItem(CONAN.config.storageKeys.tdxCreds, JSON.stringify({ id, secret }));
    } else {
      localStorage.removeItem(CONAN.config.storageKeys.tdxCreds);
    }
    token = null; // 金鑰換了，作廢舊 token
  }

  async function getToken(creds) {
    if (token && Date.now() < token.expiresAt - 60000) return token.value;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.id,
      client_secret: creds.secret,
    });
    const res = await fetch(cfg().tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`TDX 金鑰驗證失敗（HTTP ${res.status}）`);
    const data = await res.json();
    token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 1800) * 1000 };
    return token.value;
  }

  /** 取得 TDX JSON。有存金鑰就帶 token，否則匿名（額度用盡回 429）。 */
  async function fetchJson(url) {
    const creds = loadCreds();
    const headers = {};
    if (creds) {
      try {
        headers.Authorization = `Bearer ${await getToken(creds)}`;
      } catch (e) {
        // token 拿不到就退回匿名試試，錯誤訊息保留給呼叫端
        console.warn('[TDX]', e.message);
      }
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (res.status === 429) throw new Error('匿名額度已用盡，請填入 TDX 金鑰');
    if (res.status === 401) throw new Error('TDX 金鑰無效或未授權');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function initForm() {
    const idEl = document.getElementById('tdx-id');
    const secretEl = document.getElementById('tdx-secret');
    const creds = loadCreds();
    if (creds) { idEl.value = creds.id; secretEl.value = creds.secret; }
    document.getElementById('tdx-save').addEventListener('click', () => {
      saveCreds(idEl.value.trim(), secretEl.value.trim());
      alert(loadCreds() ? 'TDX 金鑰已儲存（僅存於此瀏覽器）。' : '已清除金鑰，之後以匿名模式呼叫。');
    });
  }

  CONAN.tdx = { fetchJson, hasCreds: () => !!loadCreds(), initForm };
})();
