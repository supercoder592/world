/* 🔍 太平洋浮標「柯南」 — 主程式 */
(function () {
  const cfg = CONAN.config;

  /* ---------- 錯誤診斷條：任何未預期錯誤都顯示在畫面上，方便回報 ---------- */
  function showDiag(msg) {
    let el = document.getElementById('diag');
    if (!el) {
      el = document.createElement('div');
      el.id = 'diag';
      document.body.appendChild(el);
    }
    el.textContent = `⚠️ ${msg}（點一下關閉）`;
    el.style.display = 'block';
    el.onclick = () => { el.style.display = 'none'; };
  }
  window.addEventListener('error', (e) => {
    showDiag(e.message || '未知錯誤');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    showDiag((r && (r.message || String(r))) || '未處理的錯誤');
  });

  // 地圖套件沒載進來（CDN 被擋）時，給出明確訊息而不是整頁空白
  if (typeof L === 'undefined') {
    showDiag('地圖套件（Leaflet CDN）載入失敗，請檢查網路或換個網路環境再試');
    return;
  }

  /* ---------- UI 輔助 ---------- */
  CONAN.ui = {
    setStatus(kind, cls, count) {
      const chip = document.getElementById(`status-${kind}`);
      chip.classList.remove('ok', 'warn', 'err');
      chip.classList.add(cls);
      if (count != null) {
        document.getElementById(`count-${kind}`).textContent = count.toLocaleString();
      }
    },
    /** 需要金鑰的圖層：沒設金鑰就把狀態燈與圖層開關整個藏起來，不干擾畫面 */
    setSourceVisible(kind, on) {
      const chip = document.getElementById(`status-${kind}`);
      if (chip) chip.style.display = on ? '' : 'none';
      const toggle = document.getElementById(`toggle-${kind}`);
      if (toggle) toggle.style.display = on ? '' : 'none';
    },
  };

  /* ---------- 地圖 ---------- */
  const map = L.map('map', {
    center: cfg.center,
    zoom: cfg.zoom,
    zoomControl: true,
    worldCopyJump: true,
  });

  const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  });
  const lightTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者',
    maxZoom: 19,
  });
  darkTiles.addTo(map);

  // 觀測範圍框（柯南的搜查範圍）
  const b = cfg.bounds;
  L.rectangle([[b.south, b.west], [b.north, b.east]], {
    color: '#4ea1ff', weight: 1, dashArray: '6 6', fill: false, opacity: 0.5,
    interactive: false,
  }).addTo(map);

  L.control.scale({ metric: true, imperial: false }).addTo(map);

  /* ---------- 模組啟動 ---------- */
  // 個別模組初始化失敗時只影響自己的圖層，不拖垮整個頁面
  for (const [name, fn] of [
    ['TDX', () => CONAN.tdx.initForm()],
    ['飛機', () => CONAN.aircraft.init(map)],
    ['船舶', () => CONAN.ships.init(map)],
    ['監視器', () => CONAN.cameras.init(map)],
    ['浮標', () => CONAN.buoys.init(map)],
    ['地震', () => CONAN.quakes.init(map)],
    ['衛星', () => CONAN.sats.init(map)],
  ]) {
    try { fn(); } catch (e) {
      console.error(`[${name}]`, e);
      showDiag(`${name}圖層初始化失敗：${e.message}`);
    }
  }

  /* ---------- 圖層開關 ---------- */
  document.getElementById('layer-aircraft').addEventListener('change', (e) => {
    CONAN.aircraft.setVisible(e.target.checked, map);
  });
  document.getElementById('layer-ships').addEventListener('change', (e) => {
    CONAN.ships.setVisible(e.target.checked, map);
  });
  document.getElementById('layer-cameras').addEventListener('change', (e) => {
    CONAN.cameras.setVisible(e.target.checked, map);
  });
  document.getElementById('layer-buoys').addEventListener('change', (e) => {
    CONAN.buoys.setVisible(e.target.checked, map);
  });
  document.getElementById('layer-quakes').addEventListener('change', (e) => {
    CONAN.quakes.setVisible(e.target.checked, map);
  });
  document.getElementById('layer-sats').addEventListener('change', (e) => {
    CONAN.sats.setVisible(e.target.checked, map);
  });
  document.getElementById('opt-trails').addEventListener('change', (e) => {
    CONAN.aircraft.setTrails(e.target.checked, map);
  });
  document.getElementById('opt-dark').addEventListener('change', (e) => {
    if (e.target.checked) { map.removeLayer(lightTiles); darkTiles.addTo(map); }
    else { map.removeLayer(darkTiles); lightTiles.addTo(map); }
  });

  /* ---------- 側欄開關 ---------- */
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('hidden');
    setTimeout(() => map.invalidateSize(), 60);
  });

  /* ---------- 時鐘 ---------- */
  const clockEl = document.getElementById('clock');
  setInterval(() => {
    clockEl.textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false }) + ' TST';
  }, 1000);
})();
