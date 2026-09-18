/* 🔍 搜尋 — 地點（Nominatim/OpenStreetMap 免金鑰地理編碼）＋ 已載入的監視器名稱 */
(function () {
  let map = null;
  let debounceTimer = null;
  let reqSeq = 0; // 只顯示最後一次查詢的結果，避免慢回應蓋掉新輸入的結果

  const overlay = () => document.getElementById('search-overlay');
  const input = () => document.getElementById('search-input');
  const resultsEl = () => document.getElementById('search-results');

  function open() {
    overlay().hidden = false;
    const el = input();
    el.value = '';
    resultsEl().innerHTML = '';
    setTimeout(() => el.focus(), 50);
  }

  function close() {
    overlay().hidden = true;
    clearTimeout(debounceTimer);
  }

  function flyTo(lat, lon, zoom) {
    map.flyTo({ center: [lon, lat], zoom, essential: true });
    close();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderResults(places, cams) {
    const el = resultsEl();
    if (!places.length && !cams.length) {
      el.innerHTML = '<p class="hint search-empty">找不到符合的地點或監視器。</p>';
      return;
    }
    let html = '';
    if (cams.length) {
      html += '<div class="search-group">📷 監視器</div>';
      html += cams.map((c) => `
        <button class="search-item" data-lat="${c.lat}" data-lon="${c.lon}" data-zoom="15">
          <span class="search-item-name">${esc(c.name)}</span>
          ${c.desc ? `<span class="search-item-desc">${esc(c.desc)}</span>` : ''}
        </button>`).join('');
    }
    if (places.length) {
      html += '<div class="search-group">📍 地點</div>';
      html += places.map((p) => `
        <button class="search-item" data-lat="${p.lat}" data-lon="${p.lon}" data-zoom="${p.zoom}">
          <span class="search-item-name">${esc(p.name)}</span>
        </button>`).join('');
    }
    el.innerHTML = html;
    el.querySelectorAll('.search-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        flyTo(parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lon), parseFloat(btn.dataset.zoom));
      });
    });
  }

  /** 依 OSM 地點類型抓一個看起來合理的縮放層級（國家縮小看、路口放大看） */
  function zoomForPlace(p) {
    const cls = `${p.class || ''} ${p.type || ''}`;
    if (/country/.test(cls)) return 4;
    if (/state|region/.test(cls)) return 6;
    if (/city|town|administrative/.test(cls)) return 10;
    if (/village|suburb/.test(cls)) return 12;
    return 14;
  }

  async function searchPlaces(q) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=zh-TW&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: CONAN.timeoutSignal(6000) });
      if (!res.ok) return [];
      const data = await res.json();
      return (Array.isArray(data) ? data : []).map((p) => ({
        name: p.display_name,
        lat: parseFloat(p.lat),
        lon: parseFloat(p.lon),
        zoom: zoomForPlace(p),
      })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    } catch {
      return []; // 地點查詢失敗就靜默跳過，不影響監視器那半邊的結果
    }
  }

  async function runSearch(q) {
    const seq = ++reqSeq;
    resultsEl().innerHTML = '<p class="hint search-empty">搜尋中…</p>';
    const cams = CONAN.cameras ? CONAN.cameras.search(q) : [];
    const places = await searchPlaces(q);
    if (seq !== reqSeq) return; // 這段時間使用者又輸入了新關鍵字，這批結果就丟掉
    renderResults(places, cams);
  }

  function onInput() {
    const q = input().value.trim();
    clearTimeout(debounceTimer);
    if (!q) {
      resultsEl().innerHTML = '';
      return;
    }
    // Nominatim 使用規範要求輕量查詢（大約每秒 1 次），用 debounce 節流
    debounceTimer = setTimeout(() => runSearch(q), 400);
  }

  CONAN.search = {
    init(m) {
      map = m;
      document.getElementById('search-open').addEventListener('click', open);
      document.getElementById('search-close').addEventListener('click', close);
      overlay().addEventListener('click', (e) => { if (e.target === overlay()) close(); });
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay().hidden) close();
      });
      input().addEventListener('input', onInput);
      input().addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { clearTimeout(debounceTimer); runSearch(input().value.trim()); }
      });
    },
  };
})();
