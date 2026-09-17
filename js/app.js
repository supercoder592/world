/* 🔍 太平洋浮標「柯南」 — 主程式（MapLibre GL・球體地球） */
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

  /* ---------- 開場載入頁：追蹤各圖層第一次資料載入的真實進度 ---------- */
  const splashEl = document.getElementById('splash');
  const splashBar = document.getElementById('splash-bar');
  const splashPct = document.getElementById('splash-pct');
  const splashStatus = document.getElementById('splash-status');
  const SPLASH_STEPS = ['map', 'aircraft', 'ships', 'cameras', 'camerasIntl', 'buoys', 'quakes', 'sats'];
  const SPLASH_LABELS = {
    map: '地球模型', aircraft: '飛機航班', ships: '船舶動態', cameras: '台灣監視器',
    camerasIntl: '國際監視器', buoys: '海象浮標', quakes: '地震目錄', sats: '衛星軌道',
  };
  const splashDone = new Set();
  let splashHidden = false;

  function hideSplash() {
    if (splashHidden || !splashEl) return;
    splashHidden = true;
    splashEl.classList.add('splash-out');
    setTimeout(() => splashEl.remove(), 700);
  }
  /** 各模組第一次資料載入（不論成功或失敗）都呼叫一次，回報真實進度 */
  function markLoaded(step) {
    if (splashDone.has(step)) return;
    splashDone.add(step);
    const pct = Math.round((splashDone.size / SPLASH_STEPS.length) * 100);
    if (splashBar) splashBar.style.width = `${pct}%`;
    if (splashPct) splashPct.textContent = `${pct}%`;
    if (splashStatus) splashStatus.textContent = `${SPLASH_LABELS[step] || step}　已連線`;
    if (splashDone.size >= SPLASH_STEPS.length) {
      if (splashStatus) splashStatus.textContent = '完成！';
      setTimeout(hideSplash, 300);
    }
  }
  // 保險：某個來源真的卡住也不讓開場畫面永遠蓋著網站，最多等 9 秒
  setTimeout(hideSplash, 9000);

  // 地圖套件沒載進來（CDN 被擋）時，給出明確訊息而不是整頁空白
  if (typeof maplibregl === 'undefined') {
    if (splashStatus) splashStatus.textContent = '地圖套件載入失敗';
    hideSplash();
    showDiag('地圖套件（MapLibre CDN）載入失敗，請檢查網路或換個網路環境再試');
    return;
  }

  /* ---------- UI 輔助 ---------- */
  CONAN.ui = {
    markLoaded,
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
    /** 站內預覽視窗：在同一頁面用 iframe 開啟外部連結，不用跳新分頁離開地圖 */
    openLightbox(url, title) {
      document.getElementById('lightbox-title').textContent = title || url;
      document.getElementById('lightbox-newtab').href = url;
      document.getElementById('lightbox-frame').src = url;
      document.getElementById('lightbox').hidden = false;
    },
    closeLightbox() {
      document.getElementById('lightbox').hidden = true;
      document.getElementById('lightbox-frame').src = 'about:blank';
    },
  };
  document.getElementById('lightbox-close').addEventListener('click', CONAN.ui.closeLightbox);
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') CONAN.ui.closeLightbox();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('lightbox').hidden) CONAN.ui.closeLightbox();
  });

  /* ---------- 地圖：球體地球（globe 投影），縮小是地球、放大是街道圖 ---------- */
  const style = {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'base-dark': {
        type: 'raster',
        tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`),
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
      },
      'base-light': {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#05070c' } },
      { id: 'base-dark', type: 'raster', source: 'base-dark' },
      { id: 'base-light', type: 'raster', source: 'base-light', layout: { visibility: 'none' } },
    ],
  };

  const map = new maplibregl.Map({
    container: 'map',
    style,
    center: [cfg.center[1], cfg.center[0]], // MapLibre 是 [lon, lat]
    zoom: 6,
    minZoom: 1,
    attributionControl: { compact: true },
  });
  map.on('style.load', () => {
    map.setProjection({ type: 'globe' });
    // 大氣層/太空背景：預設的霧化偏淡，球體邊緣看起來像半透明。改成暗色大氣
    // ＋星空，縮小成地球時才有實體感，符合夜間偵探風的主題色調。
    map.setFog({
      range: [0.5, 10],
      color: 'rgba(10, 16, 26, 0.9)',
      'high-color': 'rgba(20, 30, 55, 1)',
      'space-color': 'rgba(3, 5, 10, 1)',
      'horizon-blend': 0.1,
      'star-intensity': 0.35,
    });
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  map.on('load', () => {
    // 台灣監視器涵蓋範圍框（飛機／船舶／地震／衛星已是全球，這裡只標示 CCTV 資料範圍）
    const b = cfg.taiwan.bounds;
    map.addSource('obs-box', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south],
          ],
        },
      },
    });
    map.addLayer({
      id: 'obs-box',
      type: 'line',
      source: 'obs-box',
      paint: { 'line-color': '#4ea1ff', 'line-width': 1, 'line-opacity': 0.5, 'line-dasharray': [3, 3] },
    });

    markLoaded('map');

    /* ---------- 模組啟動（個別失敗只影響自己的圖層） ---------- */
    for (const [name, step, fn] of [
      ['TDX', null, () => CONAN.tdx.initForm()],
      ['飛機', 'aircraft', () => CONAN.aircraft.init(map)],
      ['船舶', 'ships', () => CONAN.ships.init(map)],
      ['監視器', 'cameras', () => CONAN.cameras.init(map)],
      ['國際監視器', 'camerasIntl', () => CONAN.camerasIntl.init()],
      ['浮標', 'buoys', () => CONAN.buoys.init(map)],
      ['地震', 'quakes', () => CONAN.quakes.init(map)],
      ['衛星', 'sats', () => CONAN.sats.init(map)],
    ]) {
      try { fn(); } catch (e) {
        console.error(`[${name}]`, e);
        showDiag(`${name}圖層初始化失敗：${e.message}`);
        if (step) markLoaded(step); // 初始化就掛了也算「跑過一輪」，開場畫面不要卡住
      }
    }
  });

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
    const dark = e.target.checked;
    map.setLayoutProperty('base-dark', 'visibility', dark ? 'visible' : 'none');
    map.setLayoutProperty('base-light', 'visibility', dark ? 'none' : 'visible');
  });

  /* ---------- 側欄開關 ---------- */
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('hidden');
    setTimeout(() => map.resize(), 60);
  });
  document.getElementById('home-taiwan').addEventListener('click', () => {
    const t = cfg.taiwan;
    map.flyTo({ center: [t.center[1], t.center[0]], zoom: t.zoom, essential: true });
  });

  /* ---------- 時鐘 ---------- */
  const clockEl = document.getElementById('clock');
  setInterval(() => {
    clockEl.textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false }) + ' TST';
  }, 1000);
})();
