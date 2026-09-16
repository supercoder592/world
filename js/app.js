/* 🔍 太平洋浮標「柯南」 — 主程式 */
(function () {
  const cfg = CONAN.config;

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
  CONAN.tdx.initForm();
  CONAN.aircraft.init(map);
  CONAN.ships.init(map);
  CONAN.cameras.init(map);
  CONAN.buoys.init(map);

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
